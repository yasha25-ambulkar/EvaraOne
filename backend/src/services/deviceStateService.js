const { db, admin } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const { fetchChannelFeeds, getLatestFeed } = require("./thingspeakService.js");
const {
  analyzeWaterTank,
  distanceToVolume,
  distanceToPercentage,
} = require("./waterAnalyticsEngine.js");
const { DEVICE_STATUS, STATUS_THRESHOLD_MS } = require("../utils/deviceConstants.js");
const { resolveFieldByName } = require("../utils/fieldMappingResolver.js");
const { loadChannelMetadata } = require("./channelMetadataService.js");

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
 * 
 * ✅ NEW: Uses STABLE ANCHOR approach with channel metadata
 * - Loads channel metadata (fieldX → field_name mapping)
 * - Loads sensor_field_mapping (field_name → internal_key mapping)
 * - Resolves: field_index → field_name → internal_key
 */
const processThingSpeakData = async (device, feeds) => {
  if (!feeds || feeds.length === 0) return null;

  const latestFeed = getLatestFeed(feeds);
  const lastUpdatedAt = latestFeed.created_at;
  const status = calculateDeviceStatus(lastUpdatedAt);
  const typeNormalized = (device.type || device.device_type || "").toLowerCase();

  // Load channel metadata (field1 → "Meter Reading_7", etc.)
  const channelMetadata = await loadChannelMetadata(device.id);
  if (!channelMetadata) {
    console.warn(`[DeviceState] ⚠️  No channel metadata for ${device.id} - using legacy resolution`);
  }

  // ── FLOW METER path ───────────────────────────────────────────────────────
  const isFlowMeter = ["evaraflow", "flow", "flow_meter"].includes(typeNormalized);
  if (isFlowMeter) {
    let flowField = null;
    let totalField = null;

    const mapping = device.sensor_field_mapping || {};

    // ✅ NEW: Stable anchor resolution using channel metadata
    if (channelMetadata) {
      console.log(`[DeviceState] FLOW: Resolving using channel metadata + sensor_field_mapping`);
      flowField = resolveFieldByName(channelMetadata, mapping, "flow_rate");
      totalField = resolveFieldByName(channelMetadata, mapping, "total_reading");
      if (flowField && totalField) {
        console.log(`[DeviceState] ✅ Resolved FLOW using stable anchor: flow=${flowField}, total=${totalField}`);
      } else {
        console.warn(`[DeviceState] ⚠️  Could not resolve all fields using stable anchor`);
      }
    }

    // Legacy fallback (for devices without channel metadata)
    if (!flowField || !totalField) {
      console.log(`[DeviceState] FLOW: Using legacy resolution`);
      flowField = flowField || device.flow_rate_field || Object.keys(mapping).find(k => mapping[k] === "flow_rate") || "field3";
      totalField = totalField || device.meter_reading_field || Object.keys(mapping).find(k => mapping[k] === "total_reading") || "field1";
      console.log(`[DeviceState] ✓ Resolved FLOW using legacy: flow=${flowField}, total=${totalField}`);
    }

    const flow_rate = parseFloat(latestFeed[flowField] || 0) || 0;
    const total_reading = parseFloat(latestFeed[totalField] || 0) || 0;

    return {
      deviceId: device.id,
      flow_rate,
      total_reading,
      lastUpdatedAt,
      status,
      raw_data: latestFeed,
      _debugFields: { flowField, totalField }
    };
  }

  // ── TDS path ───────────────────────────────────────────────────────────────
  const isTDS = ["evaratds", "tds"].includes(typeNormalized);
  if (isTDS) {
    let fieldTDS = null;
    let fieldTemp = null;

    const mapping = device.sensor_field_mapping || {};

    // ✅ NEW: Stable anchor resolution using channel metadata
    if (channelMetadata) {
      console.log(`[DeviceState] TDS: Resolving using channel metadata + sensor_field_mapping`);
      fieldTDS = resolveFieldByName(channelMetadata, mapping, "tds_value");
      fieldTemp = resolveFieldByName(channelMetadata, mapping, "temperature");
      if (fieldTDS && fieldTemp) {
        console.log(`[DeviceState] ✅ Resolved TDS using stable anchor: tds=${fieldTDS}, temp=${fieldTemp}`);
      } else {
        console.warn(`[DeviceState] ⚠️  Could not resolve all fields using stable anchor`);
      }
    }

    // Legacy fallback (for devices without channel metadata)
    if (!fieldTDS || !fieldTemp) {
      console.log(`[DeviceState] TDS: Using legacy resolution`);
      fieldTDS = fieldTDS || device.tds_field || Object.keys(mapping).find(k => mapping[k] === "tds_value") || "field2";
      fieldTemp = fieldTemp || device.temperature_field || Object.keys(mapping).find(k => mapping[k] === "temperature") || "field3";
      console.log(`[DeviceState] ✓ Resolved TDS using legacy: tds=${fieldTDS}, temp=${fieldTemp}`);
    }

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
      _debugFields: { fieldTDS, fieldTemp }
    };
  }

  // ── TANK path — use analytics engine with stable anchor ──────────────────
  let fieldKey = null;
  const mapping = device.mapping || {};

  // ✅ NEW: Stable anchor resolution using channel metadata
  if (channelMetadata) {
    console.log(`[DeviceState] TANK: Resolving using channel metadata + sensor_field_mapping`);
    fieldKey = resolveFieldByName(channelMetadata, mapping, "water_level");
    if (fieldKey) {
      console.log(`[DeviceState] ✅ Resolved TANK using stable anchor: level=${fieldKey}`);
    } else {
      console.warn(`[DeviceState] ⚠️  Could not resolve water_level using stable anchor`);
    }
  }

  // Legacy fallback (for devices without channel metadata)
  if (!fieldKey) {
    console.log(`[DeviceState] TANK: Using legacy resolution`);
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
    // 4. Scan mapping for "water_level" semantic name
    else {
      const mappedField = Object.keys(mapping).find(k => 
        mapping[k] && (mapping[k].includes("water_level") || mapping[k].includes("level"))
      );
      if (mappedField) {
        fieldKey = mappedField;
        console.log(`[DeviceState] ✓ Found level field in mapping: ${fieldKey}`);
      }
    }
  }

  // ✅ CRITICAL: NO IMPLICIT FALLBACK TO field1/field2
  // If we still don't have a field, FAIL explicitly (don't silently use wrong data)
  if (!fieldKey) {
    console.error(`[DeviceState] ❌ NO FIELD MAPPING for device ${device.id}: no water_level field found`);
    console.error(`[DeviceState] Device mapping:`, mapping);
    console.error(`[DeviceState] Device fields:`, device.fields);
    console.error(`[DeviceState] Channel metadata:`, channelMetadata);
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
    _debugFields: { fieldKey }
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

    const now = new Date().toISOString();
    
    const updatePayload = cleanObject({
      // ✅ CRITICAL: Update last_seen when data comes in
      // This is what frontend uses to determine Online/Offline status
      last_seen: now,
      last_updated_at: telemetryData.lastUpdatedAt,
      lastUpdatedAt: telemetryData.lastUpdatedAt,
      status: telemetryData.status,
      lastTelemetryFetch: now,
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
    const registryUpdateObj = cleanObject({
        last_seen: now,
        last_updated_at: telemetryData.lastUpdatedAt,
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
            
            timestamp: now
        })
    });

    const updateRegistry = db.collection("devices").doc(deviceId).update(registryUpdateObj);

    await Promise.all([updateMetadata, updateRegistry]);
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
