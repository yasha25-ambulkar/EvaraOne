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
async function getDeviceState(device) {
  const id = device.id || device.hardware_id || device.device_id;

  // Return cached state if available
  if (_cache.has(id)) {
    return _cache.get(id);
  }

  // Cold start — fetch and compute
  return await refreshDeviceState(device);
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
async function refreshDeviceState(device) {
  const id   = device.id || device.hardware_id || device.device_id;
  const dims = resolveDimensions(device);

  let readings;
  try {
    readings = await fetchCleanReadings(device);
  } catch (err) {
    console.error(`[deviceStateService] fetchCleanReadings failed for ${id}:`, err.message);
    // Return offline state, keep old cache if it exists
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
  // Map all clean readings to chart points
  const history = readings.map(r => {
    const m = computeAllMetrics(r.distanceCm, dims);
    return {
      timestamp:      new Date(r.timestampMs).toISOString(),
      level:          m.percentage,           // frontend maps h.level → level_percentage
      volume:         m.volumeLitres,         // frontend maps h.volume → total_liters
      flow_rate:      null,                   // not calculated per-point (only latest pair)
      distance:       Math.round(r.distanceCm * 100) / 100,
    };
  });

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
  const state = {
    deviceId:             id,
    online:               true,
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

  return { heightCm, lengthCm, breadthCm };
}

/**
 * Manages the midnight snapshot for daily consumption tracking.
 * On a new day, resets the snapshot to the current volume.
 */
function updateMidnightSnapshot(deviceId, currentVolume) {
  const today = new Date().toDateString();
  const snap  = _midnightSnapshots.get(deviceId);

  if (!snap || snap.date !== today) {
    // New day — set midnight baseline
    _midnightSnapshots.set(deviceId, { volumeLitres: currentVolume, date: today });
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

module.exports = {
  getDeviceState,
  refreshDeviceState,
  clearCache,
};
