const { db, admin } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const { fetchChannelFeeds, getLatestFeed } = require("./thingspeakService.js");
const {
  analyzeWaterTank,
  distanceToVolume,
  distanceToPercentage,
} = require("./waterAnalyticsEngine.js");
const { DEVICE_STATUS, STATUS_THRESHOLD_MS } = require("../utils/deviceConstants.js");

const OFFLINE_THRESHOLD_MS = STATUS_THRESHOLD_MS; // Use centralized threshold

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
  if (!lastUpdatedAt) return DEVICE_STATUS.OFFLINE;
  
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
        return DEVICE_STATUS.ONLINE;
      } else {
        return DEVICE_STATUS.OFFLINE_RECENT;
      }
    } else {
      return DEVICE_STATUS.OFFLINE;
    }
  } catch (err) {
    console.error("[DeviceStatus] Status calculation error:", err.message);
    return DEVICE_STATUS.OFFLINE;
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
    console.log(`[DeviceState] Saved thresholds for ${deviceId}: lower=${thresholds.lower}, upper=${thresholds.upper}`);
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

  // ── FLOW METER path ───────────────────────────────────────
  // ✅ FIX #9: USE DEVICE-SPECIFIC FIELD MAPPING (NOT HARDCODED field3/field1 fallbacks)
  const typeNormalized = (device.type || device.device_type || "").toLowerCase();
  const isFlowMeter = ["evaraflow", "flow", "flow_meter"].includes(typeNormalized);
  if (isFlowMeter) {
    let flowField = null;
    let totalField = null;

    // Priority 1: New schema device.fields
    if (device.fields?.flow_rate && device.fields?.total_liters) {
      flowField = device.fields.flow_rate;
      totalField = device.fields.total_liters;
      console.log(`[DeviceState] Using device.fields for flow: flow=${flowField}, total=${totalField}`);
    }
    // Priority 2: Sensor field mapping
    else if (device.sensor_field_mapping) {
      flowField = Object.keys(device.sensor_field_mapping).find(k => 
        device.sensor_field_mapping[k] === "flow_rate"
      );
      totalField = Object.keys(device.sensor_field_mapping).find(k => 
        device.sensor_field_mapping[k] === "current_reading"
      );
      if (flowField && totalField) {
        console.log(`[DeviceState] Using sensor_field_mapping for flow: flow=${flowField}, total=${totalField}`);
      }
    }
    // Priority 3: Fallback to device properties
    if (!flowField || !totalField) {
      flowField = flowField || device.flow_rate_field || "field3";
      totalField = totalField || device.meter_reading_field || "field1";
      console.log(`[DeviceState] Using fallback for flow: flow=${flowField}, total=${totalField}`);
    }

    const flow_rate = parseFloat(latestFeed[flowField] || 0) || 0;
    const total_liters = parseFloat(latestFeed[totalField] || 0) || 0;

    return {
      deviceId: device.id,
      flow_rate,
      total_liters,
      lastUpdatedAt,
      status,
      raw_data: latestFeed,
    };
  }

  // ──TANK path — NEW: use analytics engine ──────────────────────────────
  const mapping = device.mapping || {};
  
  // ✅ FIX #9: USE DEVICE-SPECIFIC FIELD MAPPING (NOT HARDCODED field1/field2)
  // BEFORE: Falls back to field1/field2 if no mapping (wrong data)
  // AFTER: Uses device.fields.water_level OR device.configuration settings
  let fieldKey = null;
  
  // Try mapping paths in priority order:
  // 1. New schema: device.fields.water_level (recommended)
  if (device.fields && device.fields.water_level) {
    fieldKey = device.fields.water_level;
    console.log(`[DeviceState] ✓ Using device.fields.water_level: ${fieldKey}`);
  }
  // 2. Old schema: mapping object
  else if (mapping.levelField) {
    fieldKey = mapping.levelField;
    console.log(`[DeviceState] ✓ Using mapping.levelField: ${fieldKey}`);
  }
  // 3. Configuration stored field
  else if (device.configuration?.fieldKey && latestFeed[device.configuration.fieldKey] !== undefined) {
    fieldKey = device.configuration.fieldKey;
    console.log(`[DeviceState] ✓ Using configuration.fieldKey: ${fieldKey}`);
  }
  // 4. LAST RESORT: Scan mapping for "water_level" semantic name
  else {
    const mappedField = Object.keys(mapping).find(k => 
      mapping[k] && (mapping[k].includes("water_level") || mapping[k].includes("level"))
    );
    if (mappedField) {
      fieldKey = mappedField;
      console.log(`[DeviceState] ✓ Found level field in mapping: ${fieldKey}`);
    }
  }
  
  // ✅ CRITICAL: NO IMPLICIT FALLBACK TO field1/field2
  // If we still don't have a field, FAIL explicitly (don't silently use wrong data)
  if (!fieldKey) {
    console.error(`[DeviceState] ❌ NO FIELD MAPPING for device ${device.id}: no water_level field found`);
    console.error(`[DeviceState] Device mapping:`, mapping);
    console.error(`[DeviceState] Device fields:`, device.fields);
    console.error(`[DeviceState] Available data keys:`, Object.keys(latestFeed));
    return null;  // Return null = no data instead of using wrong field
  }

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
    const now = new Date().toISOString();
    
    const updatePayload = {
      // ✅ CRITICAL: Update last_seen when data comes in
      // This is what frontend uses to determine Online/Offline status
      last_seen: now,
      last_updated_at: telemetryData.lastUpdatedAt,
      lastUpdatedAt: telemetryData.lastUpdatedAt,
      status: telemetryData.status,
      lastTelemetryFetch: now,
      raw_data: telemetryData.raw_data,
    };

    if (telemetryData.rawDistance !== undefined) updatePayload.lastValue = telemetryData.rawDistance;
    if (telemetryData.processedLevel !== undefined) updatePayload.processedLevel = telemetryData.processedLevel;
    if (telemetryData.percentage !== undefined) {
      updatePayload.percentage = telemetryData.percentage;
      updatePayload.level_percentage = telemetryData.percentage;
    }
    if (telemetryData.flow_rate !== undefined) updatePayload.flow_rate = telemetryData.flow_rate;
    if (telemetryData.total_liters !== undefined) updatePayload.total_liters = telemetryData.total_liters;

    // NEW: store analytics state in telemetry_snapshot
    updatePayload.telemetry_snapshot = {
      flow_rate: telemetryData.flow_rate || 0,
      total_liters: telemetryData.total_liters || 0,
      percentage: telemetryData.percentage || 0,
      level_percentage: telemetryData.percentage || 0,
      timestamp: now,  // Use current time when data arrives
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
    }

    await db.collection(deviceType.toLowerCase()).doc(deviceId).update(updatePayload);
    console.log(`[DeviceState] ✅ Updated telemetry for ${deviceId}: status=${telemetryData.status}, last_seen=${now}`);
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
      console.log(`[DeviceState] Status recalculation complete: ${updates.length} updates`);
    } else {
      console.log('[DeviceState] Status recalculation complete: No changes needed');
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
