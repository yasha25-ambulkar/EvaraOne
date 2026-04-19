const { db, admin } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const { fetchChannelFeeds, getLatestFeed } = require("./thingspeakService.js");
const {
  analyzeWaterTank,
  distanceToVolume,
  distanceToPercentage,
} = require("./waterAnalyticsEngine.js");

const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Calculate device status based on STRICT date + time validation
 * This is the SINGLE SOURCE OF TRUTH for status calculation
 * 
 * CRITICAL LOGIC:
 * - Device is ONLINE ONLY if: same day AND within 20 minutes
 * - Device is OFFLINE if: different day OR > 20 minutes OR no data
 */
/**
 * Calculate device status based on STRICT date + time validation
 * 3-Tier Logic:
 * - ONLINE: same day && diff <= 20 mins
 * - OFFLINE_RECENT: same day && diff > 20 mins
 * - OFFLINE_STOPPED: different day (last data not from today)
 */
const calculateDeviceStatus = (lastUpdatedAt) => {
  if (!lastUpdatedAt) return "OFFLINE_STOPPED";
  
  try {
    const now = new Date();
    const lastUpdate = new Date(lastUpdatedAt);
    
    // Convert to local timezone (IST for India)
    const tzOffset = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
    const nowIST = new Date(now.getTime() + tzOffset);
    const lastUpdateIST = new Date(lastUpdate.getTime() + tzOffset);
    
    // Extract date components (YYYY-MM-DD)
    const currentDate = nowIST.toISOString().split('T')[0];
    const lastDataDate = lastUpdateIST.toISOString().split('T')[0];
    
    // Calculate difference in minutes
    const timeDiffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
    
    // 1. Check if same day
    const isSameDay = lastDataDate === currentDate;
    
    if (isSameDay) {
      if (timeDiffMinutes <= 20) {
        return "ONLINE";
      } else {
        return "OFFLINE_RECENT";
      }
    } else {
      return "OFFLINE_STOPPED";
    }
  } catch (err) {
    console.error("[DeviceStatus] Status calculation error:", err.message);
    return "OFFLINE_STOPPED";
  }
};

/**
 * Load saved thresholds for a tank from Firestore cache
 * Returns { lower, upper } or null
 */
const loadSavedThresholds = async (deviceId) => {
  try {
    const cacheKey = `thresholds:${deviceId}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    // Try Firestore
    const doc = await db.collection("tank_thresholds").doc(deviceId).get();
    if (doc.exists) {
      const data = doc.data();
      const result = { lower: data.lower, upper: data.upper };
      await cache.set(cacheKey, result, 86400); // 24h cache
      return result;
    }
    return null;
  } catch (err) {
    console.error(`[DeviceState] loadSavedThresholds failed for ${deviceId}:`, err.message);
    return null;
  }
};


/**
 * Save learned thresholds to Firestore for a tank
 */
const saveThresholds = async (deviceId, thresholds) => {
  try {
    await db.collection("tank_thresholds").doc(deviceId).set({
      lower: thresholds.lower,
      upper: thresholds.upper,
      learnedAt: new Date().toISOString(),
      readingCount: thresholds.readingCount,
    });
    // Bust the cache
    await cache.del(`thresholds:${deviceId}`);
  } catch (err) {
    console.error(`[DeviceState] saveThresholds failed for ${deviceId}:`, err.message);
  }
};


/**
 * Process ThingSpeak data and transform to standardized format
 */
const processThingSpeakData = async (device, feeds) => {
  if (!feeds || feeds.length === 0) return null;

  const latestFeed = getLatestFeed(feeds);
  const lastUpdatedAt = latestFeed.created_at;
  const status = calculateDeviceStatus(lastUpdatedAt);

  // ── FLOW METER path (unchanged) ──────────────────────────────────────
  const typeNormalized = (device.type || device.device_type || "").toLowerCase();
  const isFlowMeter = ["evaraflow", "flow", "flow_meter"].includes(typeNormalized);
  if (isFlowMeter) {
    const mapping = device.mapping || {};
    const flowKeys = ['flowField', 'flow_rate', 'flow_rate_field'];
    const totalKeys = ['volumeField', 'current_reading', 'total_reading', 'meter_reading_field'];

    const fieldFlow =
      device.flow_rate_field || device.flowField ||
      mapping.flowField || mapping.flow_rate_field ||
      Object.keys(mapping).find(k => flowKeys.includes(mapping[k])) ||
      (latestFeed.field4 !== undefined ? "field4" : "field3");

    const fieldTotal =
      device.meter_reading_field || device.volumeField ||
      mapping.volumeField || mapping.meter_reading_field ||
      Object.keys(mapping).find(k => totalKeys.includes(mapping[k])) ||
      (latestFeed.field5 !== undefined ? "field5" : "field1");

    const flow_rate = parseFloat(latestFeed[fieldFlow]) || 0;
    const total_liters = parseFloat(latestFeed[fieldTotal]) || 0;

    return {
      deviceId: device.id,
      flow_rate,
      total_liters,
      lastUpdatedAt,
      status,
      raw_data: latestFeed,
    };
  }

  // ── TDS path ──────────────────────────────────────────────────────────
  const isTDS = ["evaratds", "tds"].includes(typeNormalized);
  if (isTDS) {
    const mapping = device.mapping || {};
    const tdsKeys = ['tdsField', 'tds_value', 'tdsValue'];
    const tempKeys = ['tempField', 'temperature', 'temperature_field'];

    const fieldTDS =
      device.tds_field ||
      Object.keys(mapping).find(k => mapping[k] === "tdsValue") ||
      "field2";
    const fieldTemp =
      device.temperature_field ||
      Object.keys(mapping).find(k => mapping[k] === "temperature") ||
      "field3";

    const tdsValue = parseFloat(latestFeed[fieldTDS]) || 0;
    const temperature = parseFloat(latestFeed[fieldTemp]) || 0;

    let quality = "Good";
    if (tdsValue > 1000) quality = "Critical";
    else if (tdsValue > 500) quality = "Acceptable";

    return {
      deviceId: device.id,
      tds_value: tdsValue,
      temperature,
      water_quality: quality,
      lastUpdatedAt,
      status,
      raw_data: latestFeed,
      fieldTDS,
      fieldTemp,
    };
  }

  // ── TANK path — NEW: use analytics engine ──────────────────────────────
  const mapping = device.mapping || {};
  const definedField =
    device.secondary_field || device.water_level_field ||
    device.fieldKey || device.configuration?.water_level_field ||
    device.configuration?.fieldKey;
  const fieldKey =
    mapping.levelField || definedField ||
    Object.keys(mapping).find(k => mapping[k] && mapping[k].includes("water_level")) ||
    (latestFeed.field1 !== undefined ? "field1" : "field2");

  // Build readings array for engine
  const readings = feeds
    .map(f => {
      const distCm = parseFloat(f[fieldKey]);
      const tsMs = new Date(f.created_at).getTime();
      if (isNaN(distCm) || isNaN(tsMs)) return null;
      return { distanceCm: distCm, timestampMs: tsMs };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  if (readings.length === 0) return null;

  const tankConfig = {
    depthM: device.depth || device.configuration?.depth || device.configuration?.total_depth || 1.2,
    capacityLitres: device.capacity || device.tank_size || 1000,
  };

  // Load saved thresholds (null = first run, will learn from data)
  const savedThresholds = await loadSavedThresholds(device.id);

  // Run engine
  const analytics = analyzeWaterTank(readings, tankConfig, savedThresholds);

  // Save thresholds if engine says we should re-learn
  if (analytics.shouldSaveThresholds && analytics.thresholds.learned) {
    await saveThresholds(device.id, analytics.thresholds);
  }

  return {
    deviceId: device.id,
    rawDistance: analytics.currentDistanceCm,
    processedLevel: analytics.currentDistanceCm,
    percentage: analytics.currentPercentage,
    volume: analytics.currentVolumeLitres,
    lastUpdatedAt,
    status,
    raw_data: latestFeed,

    // NEW fields from analytics engine
    waterState: analytics.state,                          // 'CONSUMPTION' | 'REFILL' | 'STABLE' | 'LEARNING'
    rateLitresPerMin: analytics.rateLitresPerMin,         // L/min
    consumedTodayLitres: analytics.consumedTodayLitres,   // L consumed today
    refilledTodayLitres: analytics.refilledTodayLitres,   // L refilled today
    estMinutesToEmpty: analytics.estMinutesToEmpty,       // minutes or null
    estMinutesToFull: analytics.estMinutesToFull,         // minutes or null
    thresholds: analytics.thresholds,                     // { lower, upper, learned }
    deltaCm: analytics.deltaCm,                           // for debug
  };
};

/**
 * Update Firestore with processed telemetry data
 */
const updateFirestoreTelemetry = async (deviceType, deviceId, telemetryData, feeds) => {
  try {
    const cleanObject = (obj) => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(cleanObject).filter(v => v !== undefined);
        const result = {};
        Object.keys(obj).forEach(key => {
            const val = cleanObject(obj[key]);
            if (val !== undefined) result[key] = val;
        });
        return result;
    };

    const updatePayload = cleanObject({
      lastUpdatedAt: telemetryData.lastUpdatedAt,
      status: telemetryData.status,
      lastTelemetryFetch: new Date().toISOString(),
      raw_data: telemetryData.raw_data,
    });
    if (telemetryData.flow_rate !== undefined) updatePayload.flow_rate = telemetryData.flow_rate;
    if (telemetryData.total_liters !== undefined) updatePayload.total_liters = telemetryData.total_liters;
    if (telemetryData.tds_value !== undefined) updatePayload.tdsValue = telemetryData.tds_value;
    if (telemetryData.temperature !== undefined) updatePayload.temperature = telemetryData.temperature;
    if (telemetryData.water_quality !== undefined) updatePayload.waterQualityRating = telemetryData.water_quality;

    // NEW: store analytics state in telemetry_snapshot
    updatePayload.telemetry_snapshot = {
      flow_rate: telemetryData.flow_rate || 0,
      total_liters: telemetryData.total_liters || 0,
      percentage: telemetryData.percentage || 0,
      level_percentage: telemetryData.percentage || 0,
      tds_value: telemetryData.tds_value || 0,
      temperature: telemetryData.temperature || 0,
      water_quality: telemetryData.water_quality || "Good",
      timestamp: telemetryData.lastUpdatedAt,
      status: telemetryData.status,
      waterState: telemetryData.waterState || 'STABLE',
      rateLitresPerMin: telemetryData.rateLitresPerMin || 0,
      consumedTodayLitres: telemetryData.consumedTodayLitres || 0,
      refilledTodayLitres: telemetryData.refilledTodayLitres || 0,
      estMinutesToEmpty: telemetryData.estMinutesToEmpty || null,
      estMinutesToFull: telemetryData.estMinutesToFull || null,
    };

    if (feeds && feeds.length > 0) {
      updatePayload.telemetryHistory = feeds.map((f) => ({
        created_at: f.created_at,
        raw: f
      }));

      // If it's a TDS device, also populate tdsHistory and tempHistory for the analytics page
      if (deviceType.toLowerCase() === 'evaratds') {
        const fieldTDS = telemetryData.fieldTDS || 'field2';
        const fieldTemp = telemetryData.fieldTemp || 'field3';

        updatePayload.tdsHistory = feeds.map(f => ({
          value: parseFloat(f[fieldTDS]) || 0,
          timestamp: f.created_at
        })).reverse();
        
        updatePayload.tempHistory = feeds.map(f => ({
          value: parseFloat(f[fieldTemp]) || 0,
          timestamp: f.created_at
        })).reverse();
      }
    }

    // Final metadata update
    const updateMetadata = db.collection(deviceType.toLowerCase()).doc(deviceId).update(cleanObject(updatePayload));
    
    // Standardized registry update
    const registryUpdate = cleanObject({
        lastUpdatedAt: telemetryData.lastUpdatedAt,
        status: telemetryData.status,
        last_telemetry: cleanObject({
            // Tank/Deep fields
            percentage: telemetryData.percentage,
            level_percentage: telemetryData.percentage,
            volume: telemetryData.volume,
            
            // Flow fields
            flow_rate: telemetryData.flow_rate,
            total_liters: telemetryData.total_liters,

            // TDS fields
            tdsValue: telemetryData.tds_value,
            temperature: telemetryData.temperature,
            waterQualityRating: telemetryData.water_quality,
            tds_history: (updatePayload.tdsHistory || []).slice(0, 10), // Sync last 10 points for sparklines
            
            timestamp: telemetryData.lastUpdatedAt
        })
    });

    const updateRegistry = db.collection("devices").doc(deviceId).update(registryUpdate);

    await Promise.all([updateMetadata, updateRegistry]);
  } catch (err) {
    console.error(`[DeviceState] Firestore update failed for ${deviceId}:`, err.message);
    throw err;
  }
};

/**
 * Recalculate status for ALL devices (Cron job logic)
 * This ensures status is always accurate even without new data
 */
const recalculateAllDevicesStatus = async () => {
  try {
    const devicesSnapshot = await db.collection("devices").get();
    const now = new Date();
    const updates = [];
    
    for (const doc of devicesSnapshot.docs) {
      const device = doc.data();
      const lastUpdatedAt = device.lastUpdatedAt || device.last_updated_at || device.last_seen;
      
      if (!lastUpdatedAt) {
        // No timestamp - mark as OFFLINE
        if (device.status !== 'OFFLINE') {
          updates.push(
            db.collection(device.device_type.toLowerCase()).doc(doc.id).update({
              status: 'OFFLINE'
            })
          );
        }
        continue;
      }
      
      const desiredStatus = calculateDeviceStatus(lastUpdatedAt);
      const currentStatus = device.status;
      
      // Only update if status changed
      if (currentStatus !== desiredStatus) {
        updates.push(
          db.collection(device.device_type.toLowerCase()).doc(doc.id).update({
            status: desiredStatus,
            statusLastChecked: now.toISOString()
          })
        );
      }
    }
    
    if (updates.length > 0) {
      await Promise.all(updates);
    } else {
    }
  } catch (err) {
    console.error("[DeviceState] Status recalculation failed:", err.message);
  }
};

module.exports = {
  calculateDeviceStatus,
  processThingSpeakData,
  updateFirestoreTelemetry,
  recalculateAllDevicesStatus,
  loadSavedThresholds,
  saveThresholds,
  OFFLINE_THRESHOLD_MS,
};
