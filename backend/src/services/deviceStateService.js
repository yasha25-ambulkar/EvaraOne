/**
 * deviceStateService.js
 *
 * Orchestrates the full pipeline for EvaraTank:
 *   ThingSpeak fetch → spike removal → calculations → cache → return
 *
 * Also manages:
 *   - Midnight snapshot (for daily consumption)
 *   - In-memory cache (so API calls are instant between polls)
 */

'use strict';

const { fetchCleanReadings }    = require('./thingspeakService');
const {
  computeAllMetrics,
  computeRate,
  computeWaterState,
  computeTimeToEmpty,
  computeTimeToFull,
  computeDailyConsumption,
  computeCapacity,
} = require('../utils/tankMath');

/**
 * Helper to convert range strings to day counts for ThingSpeak
 */
function resolveRangeToDays(range) {
  if (!range) return null;
  const r = range.toLowerCase();
  if (r === '1w' || r === '7d') return 7;
  if (r === '3d') return 3;
  if (r === '24h' || r === '1d') return 1;
  if (r === '30d') return 30;
  return null;
}

// ─────────────────────────────────────────────────────────────
// In-memory cache  { deviceId → state }
// ─────────────────────────────────────────────────────────────
const _cache = new Map();

// Midnight snapshots  { deviceId → { volumeLitres, date } }
const _midnightSnapshots = new Map();

// ─────────────────────────────────────────────────────────────
// Public: get current state for a device
// ─────────────────────────────────────────────────────────────

/**
 * Returns the latest computed state for a device.
 * If cache is warm, returns instantly.
 * If cache is cold (first call), fetches live from ThingSpeak.
 *
 * @param {object} device - Firestore device document
 * @returns {Promise<object>} - full tank state
 */
async function getDeviceState(device, options = { light: false }) {
  const id = device.id || device.hardware_id || device.device_id;

  // Return cached state if available AND it has enough history to cover the requested range
  if (_cache.has(id)) {
    const cached = _cache.get(id);
    const requestedDays = resolveRangeToDays(options.range);
    
    if (!requestedDays) {
        // No specific range requested, return whatever is in cache
        return cached;
    }

    // Check if cached history covers the requested range
    const history = cached.history || [];
    if (history.length > 0) {
        const oldestTs = new Date(history[0].timestamp).getTime();
        const newestTs = new Date(history[history.length - 1].timestamp).getTime();
        const rangeMs = (requestedDays * 24 * 60 * 60 * 1000);
        
        // If the gap between oldest and newest is at least 80% of requested range, use cache
        // (80% buffer to account for polling intervals and minor gaps)
        if ((newestTs - oldestTs) >= (rangeMs * 0.8)) {
            return cached;
        }
    }
  }

  // Cold start or range expansion — fetch and compute
  return await refreshDeviceState(device, options);
}

// ─────────────────────────────────────────────────────────────
// Public: force refresh (called by telemetryWorker every minute)
// ─────────────────────────────────────────────────────────────

/**
 * Fetches fresh data from ThingSpeak, computes all metrics,
 * updates cache, and returns the new state.
 *
 * @param {object} device - Firestore device document
 * @returns {Promise<object>}
 */
async function refreshDeviceState(device, options = { light: false }) {
  const id   = device.id || device.hardware_id || device.device_id;
  const dims = resolveDimensions(device);
  const isLight = options.light || false;

  let readings;
  try {
    if (isLight) {
      // Light update: only fetch the single latest point
      const { fetchLatestReading } = require('./thingspeakService');
      const latestReading = await fetchLatestReading(device);
      
      if (!latestReading) {
        return _cache.get(id) ?? buildOfflineState(id);
      }
      
      // If we have a cached history, append the new reading
      const cached = _cache.get(id);
      if (cached && cached.history && cached.history.length > 0) {
        // Simple logic: we just need the latest and previous for rate
        const prevPoint = {
          distanceCm: cached.distanceCm,
          timestampMs: new Date(cached.lastUpdated).getTime()
        };
        readings = [prevPoint, latestReading];
      } else {
        readings = [latestReading];
      }
    } else {
      // Full update: fetch results based on range
      const days = resolveRangeToDays(options.range);
      readings = await fetchCleanReadings(device, { days: days || null });
    }
  } catch (err) {
    console.error(`[deviceStateService] fetch failed for ${id}:`, err.message);
    return _cache.get(id) ?? buildOfflineState(id);
  }

  if (!readings || readings.length === 0) {
    return _cache.get(id) ?? buildOfflineState(id);
  }

  // ── Latest reading ─────────────────────────────────────────
  const latest   = readings[readings.length - 1];
  const previous = readings.length > 1 ? readings[readings.length - 2] : null;

  // ── Core metrics ───────────────────────────────────────────
  const metrics = computeAllMetrics(latest.distanceCm, dims);

  // ── Rate ───────────────────────────────────────────────────
  let rateLpm = 0;
  if (previous) {
    const prevMetrics   = computeAllMetrics(previous.distanceCm, dims);
    const deltaMinutes  = (latest.timestampMs - previous.timestampMs) / 60000;
    rateLpm             = computeRate(prevMetrics.volumeLitres, metrics.volumeLitres, deltaMinutes);
  }

  // ── Water state ────────────────────────────────────────────
  const waterState  = computeWaterState(rateLpm);
  const drainRateLpm = rateLpm > 0 ? rateLpm  : 0;
  const fillRateLpm  = rateLpm < 0 ? -rateLpm : 0;

  // ── Time estimates ─────────────────────────────────────────
  const timeToEmpty = computeTimeToEmpty(metrics.volumeLitres, drainRateLpm);
  const timeToFull  = computeTimeToFull(
    metrics.volumeLitres,
    metrics.totalCapacityLitres,
    fillRateLpm
  );

  // ── Daily consumption ──────────────────────────────────────
  updateMidnightSnapshot(id, metrics.volumeLitres);
  const snap = _midnightSnapshots.get(id);
  const consumedTodayLitres = computeDailyConsumption(
    snap?.volumeLitres ?? metrics.volumeLitres,
    metrics.volumeLitres
  );

  // ── Build history for chart ────────────────────────────────
  // Only update history if we did a full fetch or if we have a cache to append to
  let history = [];
  if (!isLight) {
    history = readings.map((r, i) => {
      const m = computeAllMetrics(r.distanceCm, dims);
      
      // Calculate flow rate for this point relative to the previous one
      let flow_rate = 0;
      if (i > 0) {
        const prev = readings[i - 1];
        const prevMetrics = computeAllMetrics(prev.distanceCm, dims);
        const deltaMinutes = (r.timestampMs - prev.timestampMs) / 60000;
        flow_rate = computeRate(prevMetrics.volumeLitres, m.volumeLitres, deltaMinutes);
      }

      return {
        timestamp:      new Date(r.timestampMs).toISOString(),
        level:          m.percentage,
        volume:         m.volumeLitres,
        flow_rate:      flow_rate,
        distance:       Math.round(r.distanceCm * 100) / 100,
      };
    });
  } else {
    // For light updates, preserve existing history from cache if available
    const cached = _cache.get(id);
    if (cached && cached.history) {
      history = [...cached.history];
      // Append latest if it's new
      const latestTs = new Date(latest.timestampMs).toISOString();
      if (history.length === 0 || history[history.length - 1].timestamp !== latestTs) {
        const m = computeAllMetrics(latest.distanceCm, dims);
        history.push({
          timestamp:      latestTs,
          level:          m.percentage,
          volume:         m.volumeLitres,
          flow_rate:      rateLpm,
          distance:       Math.round(latest.distanceCm * 100) / 100,
        });
        // Keep a larger buffer for analytics (e.g. last 5000 points)
        if (history.length > 5000) history.shift();
      }
    }
  }

  // ── tankBehavior — exactly what useWaterAnalytics reads ───
  const tankBehavior = {
    waterState,                               // 'CONSUMPTION' | 'REFILL' | 'STABLE'
    fillRateLpm,                              // L/min (0 if not refilling)
    drainRateLpm,                             // L/min (0 if not consuming)
    timeToEmpty,                              // minutes or null
    timeToFull,                               // minutes or null
    consumedTodayLitres,                      // litres since midnight
    thresholdsLearned: true,                  // no threshold learning — always true
    thresholdLower:    null,
    thresholdUpper:    null,
  };

  // ── Telemetry snapshot — what useDeviceAnalytics.latest reads
  const telemetrySnapshot = {
    timestamp:        new Date(latest.timestampMs).toISOString(),
    level_percentage: metrics.percentage,
    total_liters:     metrics.volumeLitres,
    flow_rate:        rateLpm,
    is_corrected:     false,
    confidence:       null,
    pattern:          null,
  };

  // ── Full state ─────────────────────────────────────────────
  const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
  const timeSinceUpdate = Date.now() - latest.timestampMs;
  const isOnline = timeSinceUpdate <= OFFLINE_THRESHOLD_MS;

  const state = {
    deviceId:             id,
    online:               isOnline,
    lastUpdated:          new Date(latest.timestampMs).toISOString(),

    // Core metrics
    waterLevelCm:         metrics.waterLevelCm,
    percentage:           metrics.percentage,
    volumeLitres:         metrics.volumeLitres,
    totalCapacityLitres:  metrics.totalCapacityLitres,
    distanceCm:           Math.round(latest.distanceCm * 100) / 100,

    // Behavior
    waterState,
    rateLpm,
    drainRateLpm,
    fillRateLpm,
    timeToEmpty,
    timeToFull,
    consumedTodayLitres,

    // For API response
    tankBehavior,
    telemetrySnapshot,
    history,
    active_fields: ['level', 'volume', 'flow_rate'],
  };

  // Update cache
  _cache.set(id, state);

  return state;
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

/**
 * Resolves tank dimensions from Firestore device document.
 * Tries multiple field name patterns for backward compatibility.
 */
function resolveDimensions(device) {
  const cfg = device.configuration ?? device.customer_config ?? {};

  const heightCm =
    cfg.height_cm                                       ??
    device.height_cm                                    ??
    (cfg.height_m  ? cfg.height_m  * 100 : null)       ??
    (device.height_m ? device.height_m * 100 : null)   ??
    (cfg.depth     ? cfg.depth     * 100 : null)       ??
    (device.depth  ? device.depth  * 100 : null)       ??
    210.82; // OBH Tank default

  const lengthCm =
    cfg.length_cm                                         ??
    device.length_cm                                      ??
    (cfg.tank_length  ? cfg.tank_length  * 100 : null)   ??
    (device.tank_length ? device.tank_length * 100 : null) ??
    381; // OBH Tank default

  const breadthCm =
    cfg.breadth_cm                                          ??
    device.breadth_cm                                       ??
    (cfg.tank_breadth  ? cfg.tank_breadth  * 100 : null)   ??
    (device.tank_breadth ? device.tank_breadth * 100 : null) ??
    381; // OBH Tank default

  console.log(`[deviceStateService] Resolved dims for ${device.id || device.device_id}: H=${heightCm}cm, L=${lengthCm}cm, B=${breadthCm}cm`);

  return { heightCm, lengthCm, breadthCm };
}

/**
 * Manages the midnight snapshot for daily consumption tracking.
 * On a new day, resets the snapshot to the current volume.
 * Persists to Redis (primary) and Firestore (fallback).
 */
async function updateMidnightSnapshot(deviceId, currentVolume) {
  const today = new Date().toDateString();
  const snap  = _midnightSnapshots.get(deviceId);

  if (!snap || snap.date !== today) {
    // New day — set midnight baseline
    const snapshot = { volumeLitres: currentVolume, date: today };
    _midnightSnapshots.set(deviceId, snapshot);

    // Persist to Redis (primary)
    await saveMidnightSnapshotToRedis(deviceId, snapshot);
  }
}

/**
 * Save midnight snapshot to Redis
 */
async function saveMidnightSnapshotToRedis(deviceId, snapshot) {
  try {
    const redis = require('./redisClient');
    const key = `midnight_snapshot:${deviceId}`;
    const ttl = 24 * 60 * 60; // 24 hours

    await redis.setEx(
      key,
      ttl,
      JSON.stringify(snapshot)
    );
  } catch (err) {
    console.error(`[deviceStateService] Failed to save snapshot to Redis for ${deviceId}:`, err.message);
    // Fallback to Firestore
    await saveMidnightSnapshotToFirestore(deviceId, snapshot);
  }
}

/**
 * Save midnight snapshot to Firestore (fallback)
 */
async function saveMidnightSnapshotToFirestore(deviceId, snapshot) {
  try {
    const { db } = require('../config/firebase');
    await db
      .collection('device_snapshots')
      .doc(`${deviceId}_${snapshot.date}`)
      .set(snapshot, { merge: true });
  } catch (err) {
    console.error(`[deviceStateService] Failed to save snapshot to Firestore for ${deviceId}:`, err.message);
  }
}

/**
 * Load midnight snapshot from Redis or Firestore
 */
async function loadMidnightSnapshot(deviceId) {
  // Try Redis first
  try {
    const redis = require('./redisClient');
    const key = `midnight_snapshot:${deviceId}`;
    const data = await redis.get(key);

    if (data) {
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn(`[deviceStateService] Redis snapshot load failed for ${deviceId}:`, err.message);
  }

  // Fallback to Firestore
  try {
    const { db } = require('../config/firebase');
    const today = new Date().toDateString();
    const doc = await db
      .collection('device_snapshots')
      .doc(`${deviceId}_${today}`)
      .get();

    if (doc.exists) {
      return doc.data();
    }
  } catch (err) {
    console.warn(`[deviceStateService] Firestore snapshot load failed for ${deviceId}:`, err.message);
  }

  return null;
}

/**
 * Initialize snapshots on service startup
 * Loads persisted snapshots from Redis/Firestore
 */
async function initializeSnapshots() {
  try {
    const { db } = require('../config/firebase');
    const today = new Date().toDateString();

    // Get all devices
    const devicesSnap = await db.collection('devices').get();
    let loaded = 0;

    for (const deviceDoc of devicesSnap.docs) {
      try {
        const deviceId = deviceDoc.id;
        const snapshot = await loadMidnightSnapshot(deviceId);

        // Only load if it's from today
        if (snapshot && snapshot.date === today) {
          _midnightSnapshots.set(deviceId, snapshot);
          loaded++;
        }
      } catch (err) {
        console.warn(`[deviceStateService] Failed to load snapshot for device:`, err.message);
      }
    }

    console.info(`[deviceStateService] Initialized ${loaded} snapshots from persistence layer`);
  } catch (err) {
    console.error(`[deviceStateService] Snapshot initialization failed:`, err.message);
  }
}

/**
 * Archive old snapshots to Firestore (cleanup task)
 * Run this daily at midnight
 */
async function archiveOldSnapshots() {
  try {
    const { db } = require('../config/firebase');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
    let archived = 0;

    for (const [deviceId, snapshot] of _midnightSnapshots.entries()) {
      if (snapshot.date < yesterday) {
        // Archive to history collection
        await db
          .collection('device_consumption_history')
          .doc(`${deviceId}_${snapshot.date}`)
          .set(snapshot, { merge: true });

        _midnightSnapshots.delete(deviceId);
        archived++;
      }
    }

    if (archived > 0) {
      console.info(`[deviceStateService] Archived ${archived} old snapshots`);
    }
  } catch (err) {
    console.error(`[deviceStateService] Snapshot archival failed:`, err.message);
  }
}

/**
 * Safe offline state when ThingSpeak is unreachable.
 */
function buildOfflineState(deviceId) {
  return {
    deviceId,
    online:               false,
    lastUpdated:          null,
    waterLevelCm:         0,
    percentage:           0,
    volumeLitres:         0,
    totalCapacityLitres:  0,
    distanceCm:           null,
    waterState:           'STABLE',
    rateLpm:              0,
    drainRateLpm:         0,
    fillRateLpm:          0,
    timeToEmpty:          null,
    timeToFull:           null,
    consumedTodayLitres:  0,
    tankBehavior: {
      waterState:          'STABLE',
      fillRateLpm:         0,
      drainRateLpm:        0,
      timeToEmpty:         null,
      timeToFull:          null,
      consumedTodayLitres: 0,
      thresholdsLearned:   false,
      thresholdLower:      null,
      thresholdUpper:      null,
    },
    telemetrySnapshot: {
      timestamp:        null,
      level_percentage: 0,
      total_liters:     0,
      flow_rate:        0,
      is_corrected:     false,
      confidence:       null,
      pattern:          null,
    },
    history:       [],
    active_fields: ['level', 'volume', 'flow_rate'],
  };
}

/**
 * Clear cache for a device (useful after config changes).
 */
function clearCache(deviceId) {
  _cache.delete(deviceId);
}

/**
 * Calculate device status based on last update timestamp.
 * Used by deviceStatusCron to determine if device is ONLINE or OFFLINE.
 *
 * Status determination:
 * - ONLINE: Data received within last 20 minutes
 * - OFFLINE: No data or data older than 20 minutes
 * - UNKNOWN: Cannot determine status (null/invalid timestamp)
 *
 * @param {string|number|Date} lastUpdatedAt - ISO string, timestamp, or Date of last data update
 * @returns {string} - "ONLINE" | "OFFLINE" | "UNKNOWN"
 */
function calculateDeviceStatus(lastUpdatedAt) {
  const OFFLINE_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes

  // Handle missing or invalid timestamps
  if (!lastUpdatedAt) {
    return 'UNKNOWN';
  }

  try {
    const now = Date.now();
    let lastUpdate;

    // Handle numeric strings by converting to number first
    if (typeof lastUpdatedAt === 'string' && /^\d+$/.test(lastUpdatedAt)) {
      lastUpdate = parseInt(lastUpdatedAt, 10);
    } else {
      lastUpdate = new Date(lastUpdatedAt).getTime();
    }

    // Invalid date check
    if (isNaN(lastUpdate)) {
      return 'UNKNOWN';
    }

    // Calculate inactivity duration
    const inactivityMs = now - lastUpdate;

    // Sanity check: if timestamp is in the future, mark as unknown
    if (inactivityMs < 0) {
      return 'UNKNOWN';
    }

    // Device is ONLINE if updated within threshold
    if (inactivityMs <= OFFLINE_THRESHOLD_MS) {
      return 'ONLINE';
    }

    // Device is OFFLINE if exceeded threshold
    return 'OFFLINE';
  } catch (err) {
    console.error('[deviceStateService] calculateDeviceStatus error:', err.message);
    return 'UNKNOWN';
  }
}

module.exports = {
  getDeviceState,
  refreshDeviceState,
  clearCache,
  calculateDeviceStatus,
  initializeSnapshots,
  archiveOldSnapshots,
};
