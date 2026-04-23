/**
 * TDS (Total Dissolved Solids) Controller
 * Handles TDS device telemetry, configuration, and queries
 */

const { db, admin } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const axios = require("axios");
const { fetchLatestData } = require("../services/thingspeakService.js");
const { checkOwnership } = require("../middleware/auth.middleware.js");
const { checkDeviceVisibilityWithAudit } = require("../utils/checkDeviceVisibility.js");
const logger = require("../utils/logger.js");
const { DEVICE_STATUS, STATUS_THRESHOLD_MS } = require("../utils/deviceConstants.js");
const { resolveFieldKey } = require("../utils/fieldMappingResolver.js");
// ✅ ISSUE #5: Centralized error handler — use AppError for all errors
const AppError = require("../utils/AppError.js");

// ✅ AUDIT FIX L2: Use shared resolveDevice utility (was duplicated in 3 controllers)
const resolveDevice = require("../utils/resolveDevice.js");

/**
 * Helper to resolve TDS metadata document
 * Metadata can be indexed by device DocID OR hardware device_id/node_id
 * Now includes full query fallbacks like resolveDevice
 */
async function resolveMetadata(deviceDoc) {
  if (!deviceDoc) return null;
  const id = deviceDoc.id;
  const registry = deviceDoc.data();

  console.log(`[resolveMetadata] Attempting to resolve metadata for device ${id}`);
  
  // 1. Try lookup by device DocID (standard pattern - most common)
  console.log(`[resolveMetadata] Step 1: Trying direct lookup by ID: ${id}`);
  let metaDoc = await db.collection("evaratds").doc(id).get();
  if (metaDoc.exists) {
    console.log(`[resolveMetadata] ✅ Found by direct ID`);
    return metaDoc;
  }
  console.log(`[resolveMetadata] ❌ Not found by direct ID`);

  // 2. Query by hardware device_id field
  if (registry.device_id) {
    console.log(`[resolveMetadata] Step 2: Trying query by device_id: "${registry.device_id}"`);
    const q1 = await db.collection("evaratds").where("device_id", "==", registry.device_id).limit(1).get();
    if (!q1.empty) {
      console.log(`[resolveMetadata] ✅ Found by device_id`);
      return q1.docs[0];
    }
    console.log(`[resolveMetadata] ❌ Not found by device_id`);
    
    // Also try case-insensitive match
    console.log(`[resolveMetadata] Step 2b: Trying case-insensitive device_id: "${registry.device_id?.toLowerCase()}"`);
    const q1Lower = await db.collection("evaratds").where("device_id", "==", registry.device_id?.toLowerCase()).limit(1).get();
    if (!q1Lower.empty) {
      console.log(`[resolveMetadata] ✅ Found by lowercase device_id`);
      return q1Lower.docs[0];
    }
    console.log(`[resolveMetadata] ❌ Not found by lowercase device_id`);
  } else {
    console.log(`[resolveMetadata] ⚠️  No device_id in registry`);
  }

  // 3. Query by hardware node_id field
  if (registry.node_id) {
    console.log(`[resolveMetadata] Step 3: Trying query by node_id: "${registry.node_id}"`);
    const q2 = await db.collection("evaratds").where("node_id", "==", registry.node_id).limit(1).get();
    if (!q2.empty) {
      console.log(`[resolveMetadata] ✅ Found by node_id`);
      return q2.docs[0];
    }
    console.log(`[resolveMetadata] ❌ Not found by node_id`);
    
    // Also try case-insensitive match
    console.log(`[resolveMetadata] Step 3b: Trying case-insensitive node_id: "${registry.node_id?.toLowerCase()}"`);
    const q2Lower = await db.collection("evaratds").where("node_id", "==", registry.node_id?.toLowerCase()).limit(1).get();
    if (!q2Lower.empty) {
      console.log(`[resolveMetadata] ✅ Found by lowercase node_id`);
      return q2Lower.docs[0];
    }
    console.log(`[resolveMetadata] ❌ Not found by lowercase node_id`);
  } else {
    console.log(`[resolveMetadata] ⚠️  No node_id in registry`);
  }

  // 4. Try lookup by the ID parameter itself (if it was hardware ID)
  console.log(`[resolveMetadata] Step 4: Trying reverse lookup - treating ID as device_id`);
  const q3 = await db.collection("evaratds").where("device_id", "==", id).limit(1).get();
  if (!q3.empty) {
    console.log(`[resolveMetadata] ✅ Found by ID as device_id`);
    return q3.docs[0];
  }
  console.log(`[resolveMetadata] ❌ Not found by ID as device_id`);

  console.log(`[resolveMetadata] Step 5: Trying reverse lookup - treating ID as node_id`);
  const q4 = await db.collection("evaratds").where("node_id", "==", id).limit(1).get();
  if (!q4.empty) {
    console.log(`[resolveMetadata] ✅ Found by ID as node_id`);
    return q4.docs[0];
  }
  console.log(`[resolveMetadata] ❌ Not found by ID as node_id`);

  console.log(`[resolveMetadata] ❌ METADATA RESOLUTION COMPLETE: NO METADATA FOUND FOR ${id}`);
  console.log(`[resolveMetadata] Registry had: device_id=${registry.device_id}, node_id=${registry.node_id}`);
  
  return null;
}

/**
 * Get TDS device telemetry
 * Returns latest TDS value, temperature, and quality status
 */
exports.getTDSTelemetry = async (req, res, next) => {
  try {
    const { id: paramId } = req.params;
    console.log(`[TDS-getTDSTelemetry] REQUEST: paramId=${paramId}`);
    
    // Get device metadata - using resolveDevice for hardware ID support
    const deviceDoc = await resolveDevice(paramId);
    if (!deviceDoc) {
      console.error(`[TDS-getTDSTelemetry] ❌ STEP 1 FAILED: Device not found for ID: ${paramId}`);
      throw new AppError("Device not found", 404);
    }

    const id = deviceDoc.id; // Use the actual Firestore ID for subsequent lookups
    const registry = deviceDoc.data();
    console.log(`[TDS-getTDSTelemetry] ✅ STEP 1 SUCCESS: Device resolved`);
    console.log(`[TDS-getTDSTelemetry]    Document ID: ${id}`);
    console.log(`[TDS-getTDSTelemetry]    device_type: ${registry.device_type}`);
    console.log(`[TDS-getTDSTelemetry]    device_id: ${registry.device_id}`);
    console.log(`[TDS-getTDSTelemetry]    node_id: ${registry.node_id}`);
    
    // Validate device type - accept both "evaratds" and "tds"
    const deviceType = registry.device_type?.toLowerCase() || "";
    console.log(`[TDS-getTDSTelemetry] STEP 2: Checking device type: "${deviceType}"`);
    if (deviceType !== "evaratds" && deviceType !== "tds") {
      console.error(`[TDS-getTDSTelemetry] ❌ STEP 2 FAILED: Invalid device type: "${deviceType}"`);
      throw new AppError(`Device is not a TDS sensor (found: ${deviceType})`, 400);
    }
    console.log(`[TDS-getTDSTelemetry] ✅ STEP 2 SUCCESS: Device type valid`);
    
    // ✅ CRITICAL FIX: Check ownership
    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        id,
        req.user.role,
        req.user.community_id
      );
      if (!isOwner) {
        console.error(`[TDS-getTDSTelemetry] ❌ Ownership check failed`);
        throw new AppError("Unauthorized access", 403);
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    // Defense in depth: check visibility in application layer
    if (!checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)) {
      console.error(`[TDS-getTDSTelemetry] ❌ Visibility check failed`);
      throw new AppError("Device not visible to your account", 403);
    }

    // Get TDS metadata
    console.log(`[TDS-getTDSTelemetry] STEP 3: Resolving metadata for device ${id}`);
    const metaDoc = await resolveMetadata(deviceDoc);
    if (!metaDoc) {
      console.error(`[TDS-getTDSTelemetry] ❌ STEP 3 FAILED: Metadata not found`);
      throw new AppError("TDS metadata not found", 404);
    }
    console.log(`[TDS-getTDSTelemetry] ✅ STEP 3 SUCCESS: Metadata resolved`);
    console.log(`[TDS-getTDSTelemetry]    Metadata ID: ${metaDoc.id}`);

    const metadata = metaDoc.data();
    const channel = metadata.thingspeak_channel_id?.trim();
    const apiKey = metadata.thingspeak_read_api_key?.trim();

    if (!channel || !apiKey) {
      console.warn(`[TDS-getTDSTelemetry] ⚠️  ThingSpeak credentials missing, returning empty telemetry`);
      // Return partial response instead of erroring - device exists but no data
      const response = {
        id,
        deviceName: metadata.label || metadata.device_name || "TDS Device",
        type: "TDS",
        tdsValue: null,
        temperature: null,
        quality: "Unknown",
        waterQualityRating: "Unknown",
        status: DEVICE_STATUS.OFFLINE,
        unit: "ppm",
        minThreshold: 0,
        maxThreshold: 2000,
        latitude: metadata.latitude,
        longitude: metadata.longitude,
        lastUpdated: new Date().toISOString(),
        timestamp: null,
        alertsCount: 0,
        tdsHistory: [],
        error: "ThingSpeak credentials not configured"
      };
      return res.status(200).json(response);
    }

    // Fetch latest data from ThingSpeak
    const latestData = await fetchLatestData(channel, apiKey);
    if (!latestData) {
      console.warn(`[TDS-getTDSTelemetry] ⚠️  Failed to fetch ThingSpeak data, returning empty telemetry`);
      // Return partial response instead of erroring
      const response = {
        id,
        deviceName: metadata.label || metadata.device_name || "TDS Device",
        type: "TDS",
        tdsValue: null,
        temperature: null,
        quality: "Unknown",
        waterQualityRating: "Unknown",
        status: DEVICE_STATUS.OFFLINE,
        unit: "ppm",
        minThreshold: 0,
        maxThreshold: 2000,
        latitude: metadata.latitude,
        longitude: metadata.longitude,
        lastUpdated: new Date().toISOString(),
        timestamp: null,
        alertsCount: 0,
        tdsHistory: [],
        error: "Failed to fetch ThingSpeak data"
      };
      return res.status(200).json(response);
    }

    // sensor_field_mapping format: { "field1": "voltage", "field2": "tds_value", "field3": "temperature" }
    // Keys = ThingSpeak field names, Values = what they represent
    // Find which ThingSpeak field holds each sensor value
    const mapping = metadata.sensor_field_mapping || {};
    
    console.log("[TDS-getTDSTelemetry] Sensor field mapping:", mapping);
    
    const tdsField = resolveFieldKey(mapping, ["tds_value"], "field2");
    const tempField = resolveFieldKey(mapping, ["temperature"], "field3");
    
    console.log("[TDS-getTDSTelemetry] Resolved TDS field:", tdsField, "Value:", latestData[tdsField]);
    console.log("[TDS-getTDSTelemetry] Resolved Temp field:", tempField, "Value:", latestData[tempField]);

    const tdsValue = parseFloat(latestData[tdsField]) || null;
    const temperature = parseFloat(latestData[tempField]) || null;

    console.log("[TDS-getTDSTelemetry] Final TDS Value:", tdsValue, "Temp:", temperature);

    const config = metadata.configuration || {};

    // Determine water quality based on TDS - map to frontend expected values
    let quality = "Good";
    if (tdsValue !== null) {
      if (tdsValue < 300) quality = "Good";           // EXCELLENT
      else if (tdsValue < 600) quality = "Good";      // GOOD
      else if (tdsValue < 1000) quality = "Acceptable"; // FAIR
      else if (tdsValue < 1500) quality = "Acceptable"; // POOR
      else quality = "Critical";                       // VERY_POOR
    }

    // Determine status based on last update - using centralized threshold
    const lastUpdated = new Date(latestData.created_at || Date.now());
    const now = new Date();
    const timeSinceUpdate = now - lastUpdated;
    let status = DEVICE_STATUS.ONLINE;
    if (timeSinceUpdate > STATUS_THRESHOLD_MS) status = DEVICE_STATUS.OFFLINE;
    else if (timeSinceUpdate > STATUS_THRESHOLD_MS / 2) status = DEVICE_STATUS.OFFLINE_RECENT;

    // Format response with camelCase to match frontend expectations
    const response = {
      id,
      deviceName: metadata.label || metadata.device_name || "TDS Device",
      type: "TDS",
      tdsValue: tdsValue,
      temperature,
      quality,
      waterQualityRating: quality,  // Alias for frontend compatibility
      status,
      unit: "ppm",
      minThreshold: config.min_threshold || 0,
      maxThreshold: config.max_threshold || 2000,
      latitude: metadata.latitude,
      longitude: metadata.longitude,
      lastUpdated: lastUpdated.toISOString(),
      timestamp: latestData.created_at,
      created_at: latestData.created_at,  // Add created_at for frontend consistency
      alertsCount: 0,  // Placeholder - can be enhanced later
      tdsHistory: [],  // Placeholder - will be fetched separately via /history endpoint
    };

    // ✅ UPDATE device registry with latest telemetry and status
    // This ensures AllNodes dashboard shows fresh data and correct status
    await db.collection('devices').doc(id).update({
      last_seen: new Date().toISOString(),
      last_online_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_telemetry: {
        tdsValue: tdsValue,
        temperature: temperature,
        waterQualityRating: quality,
        timestamp: latestData.created_at,
        created_at: latestData.created_at,
        status: status
      }
    }).catch(err => {
      console.warn("[TDS] Warning: Could not update device record:", err.message);
      // Non-critical, don't fail the request
    });

    // Cache for 1 minute
    await cache.set(`tds:telemetry:${id}`, response, 60);

    res.status(200).json(response);
  } catch (error) {
    // ✅ ISSUE #5: Delegate to centralized error handler
    next(error);
  }
};

/**
 * Get TDS device historical data (last N readings)
 */
exports.getTDSHistory = async (req, res, next) => {
  try {
    const { id: paramId } = req.params;
    const hoursParam = parseInt(req.query.hours) || 24;
    const limitParam = parseInt(req.query.limit) || undefined;

    // Calculate optimal limit based on hours requested
    // For 3 hours: ~60 results, for 24 hours: 288 results
    let limit = limitParam;
    if (!limitParam) {
      if (hoursParam <= 3) {
        limit = 60;  // Enough for 3 hours at any frequency
      } else if (hoursParam <= 6) {
        limit = 120;
      } else if (hoursParam <= 12) {
        limit = 200;
      } else {
        limit = 288;  // Default for 24+ hours
      }
    }

    // Get device metadata - using resolveDevice for hardware ID support
    const deviceDoc = await resolveDevice(paramId);
    if (!deviceDoc) {
      throw new AppError("Device not found", 404);
    }

    const id = deviceDoc.id; // Use the actual Firestore ID for subsequent lookups
    const registry = deviceDoc.data();
    
    // Validate device type - accept both "evaratds" and "tds"
    const deviceTypeHist = registry.device_type?.toLowerCase() || "";
    if (deviceTypeHist !== "evaratds" && deviceTypeHist !== "tds") {
      throw new AppError("Device is not a TDS sensor", 400);
    }

    // Check ownership
    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        id,
        req.user.role,
        req.user.community_id
      );
      if (!isOwner) {
        throw new AppError("Unauthorized access", 403);
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    if (!checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)) {
      throw new AppError("Device not visible to your account", 403);
    }

    // Get TDS metadata
    const metaDoc = await resolveMetadata(deviceDoc);
    if (!metaDoc) {
      console.error(`[TDS-getTDSHistory] Metadata not found for device ${id}`);
      throw new AppError("TDS metadata not found", 404);
    }

    const metadata = metaDoc.data();
    const channel = metadata.thingspeak_channel_id?.trim();
    const apiKey = metadata.thingspeak_read_api_key?.trim();

    if (!channel || !apiKey) {
      throw new AppError("ThingSpeak credentials missing", 400);
    }

    // Fetch historical data from ThingSpeak
    const url = `https://api.thingspeak.com/channels/${channel}/feeds.json?api_key=${apiKey}&results=${Math.min(limit, 288)}&timezone=UTC`;
    const response = await axios.get(url, { timeout: 10000 });

    if (!response.data.feeds) {
      return res.status(200).json({ data: [], count: 0 });
    }

    // sensor_field_mapping: { "field1": "tds_value", "field2": "temperature" }
    const mapping = metadata.sensor_field_mapping || {};
    
    // Use same field resolution logic as telemetry endpoint for consistency
    const tdsField = resolveFieldKey(mapping, ["tds_value"], "field2");
    const tempField = resolveFieldKey(mapping, ["temperature"], "field3");

    console.log("[TDS-getTDSHistory] Field mapping:", mapping);
    console.log("[TDS-getTDSHistory] Resolved TDS field:", tdsField);
    console.log("[TDS-getTDSHistory] Resolved Temp field:", tempField);

    const data = response.data.feeds.map((feed) => {
      const tdsValue = parseFloat(feed[tdsField]) || null;
      const temperature = parseFloat(feed[tempField]) || null;

      // Map to frontend expected quality values
      let quality = "Good";
      if (tdsValue !== null) {
        if (tdsValue < 300) quality = "Good";           // EXCELLENT
        else if (tdsValue < 600) quality = "Good";      // GOOD
        else if (tdsValue < 1000) quality = "Acceptable"; // FAIR
        else if (tdsValue < 1500) quality = "Acceptable"; // POOR
        else quality = "Critical";                       // VERY_POOR
      }

      return {
        timestamp: feed.created_at,
        value: tdsValue,
        temperature,
        quality,
      };
    });

    console.log("[TDS-getTDSHistory] Returning", data.length, 'history points');
    
    res.status(200).json({
      id,
      label: metadata.label,
      history: data,
      count: data.length,
      period_hours: parseInt(hoursParam),
    });
  } catch (error) {
    // ✅ ISSUE #5: Delegate to centralized error handler
    next(error);
  }
};

/**
 * Get TDS device configuration
 */
exports.getTDSConfig = async (req, res) => {
  try {
    const { id: paramId } = req.params;

    const deviceDoc = await resolveDevice(paramId);
    if (!deviceDoc) {
      return res.status(404).json({ error: "TDS configuration not found" });
    }

    const id = deviceDoc.id;
    const registry = deviceDoc.data();

    // ✅ CRITICAL FIX: Check ownership
    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        id,
        req.user.role,
        req.user.community_id
      );
      if (!isOwner) {
        return res.status(403).json({ error: "Unauthorized access" });
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    if (!checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)) {
      return res.status(403).json({ error: "Device not visible to your account" });
    }

    const metaDoc = await resolveMetadata(deviceDoc);
    if (!metaDoc) {
      return res.status(404).json({ error: "TDS configuration not found" });
    }

    const metadata = metaDoc.data();
    const config = metadata.configuration || {};

    res.status(200).json({
      id,
      label: metadata.label,
      type: "TDS",
      configuration: {
        unit: config.unit || "ppm",
        min_threshold: config.min_threshold || 0,
        max_threshold: config.max_threshold || 2000,
        latitude: metadata.latitude,
        longitude: metadata.longitude,
      },
      sensor_field_mapping: metadata.sensor_field_mapping || {},
    });
  } catch (error) {
    console.error("[TDSController] Error fetching config:", error);
    res.status(500).json({ error: "Failed to fetch configuration" });
  }
};

/**
 * Update TDS device configuration
 */
exports.updateTDSConfig = async (req, res) => {
  try {
    const { id: paramId } = req.params;
    const { minThreshold, maxThreshold, latitude, longitude } = req.body;

    // Get device metadata - using resolveDevice for hardware ID support
    const deviceDoc = await resolveDevice(paramId);
    if (!deviceDoc) {
      return res.status(404).json({ error: "TDS configuration not found" });
    }

    const id = deviceDoc.id;

    // Check ownership
    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        id,
        req.user.role,
        req.user.community_id
      );
      if (!isOwner) {
        return res.status(403).json({ error: "Unauthorized access" });
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    if (!checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)) {
      return res.status(403).json({ error: "Device not visible to your account" });
    }

    const metaDoc = await resolveMetadata(deviceDoc);
    if (!metaDoc) {
      return res.status(404).json({ error: "TDS configuration not found" });
    }

    const metadata = metaDoc.data();
    const updated = {
      ...metadata,
      configuration: {
        ...metadata.configuration,
        ...(minThreshold !== undefined && { min_threshold: minThreshold }),
        ...(maxThreshold !== undefined && { max_threshold: maxThreshold }),
      },
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      updated_at: new Date(),
    };

    await db.collection("evaratds").doc(id).update(updated);

    // Invalidate cache
    await cache.del(`tds:telemetry:${id}`);
    await cache.flushPrefix("nodes_");

    // ✅ FIX #16: EMIT SOCKET EVENT FOR TDS CONFIG UPDATE
    const registryData = registry?.data?.();
    const customerId = registryData?.customer_id || registryData?.customerId;
    if (customerId && global.io) {
      global.io.to(`customer:${customerId}`).emit("device:updated", {
        deviceId: id,
        changes: updated,
        success: true,
        timestamp: new Date().toISOString()
      });
      console.log(`[TDSController] ✅ device:updated event emitted for TDS config update: ${id}`);
    }

    res.status(200).json({ success: true, message: "Configuration updated" });
  } catch (error) {
    console.error("[TDSController] Error updating config:", error);
    res.status(500).json({ error: "Failed to update configuration" });
  }
};

/**
 * Get TDS analytics summary
 */
exports.getTDSAnalytics = async (req, res) => {
  try {
    const { id: paramId } = req.params;
    const { hours = 24 } = req.query;

    const deviceDoc = await resolveDevice(paramId);
    if (!deviceDoc) {
      return res.status(404).json({ error: "TDS device not found" });
    }

    const id = deviceDoc.id;
    const registry = deviceDoc.data();

    // ✅ CRITICAL FIX: Check ownership
    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        id,
        req.user.role,
        req.user.community_id
      );
      if (!isOwner) {
        return res.status(403).json({ error: "Unauthorized access" });
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    if (!checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)) {
      return res.status(403).json({ error: "Device not visible to your account" });
    }

    const metaDoc = await resolveMetadata(deviceDoc);
    if (!metaDoc) {      console.error(`[TDS-getTDSHistory] Metadata not found for device ${id}`);      return res.status(404).json({ error: "TDS device not found" });
    }

    const metadata = metaDoc.data();
    const channel = metadata.thingspeak_channel_id?.trim();
    const apiKey = metadata.thingspeak_read_api_key?.trim();

    if (!channel || !apiKey) {
      return res.status(400).json({ error: "ThingSpeak credentials missing" });
    }

    // Fetch data from ThingSpeak
    const url = `https://api.thingspeak.com/channels/${channel}/feeds.json?api_key=${apiKey}&results=288&timezone=UTC`;
    const response = await axios.get(url, { timeout: 10000 });

    if (!response.data.feeds) {
      return res.status(200).json({
        avg_tds: null,
        min_tds: null,
        max_tds: null,
        avg_temp: null,
        readings_count: 0,
      });
    }

    // sensor_field_mapping: { "field1": "tds_value", "field2": "temperature" }
    const mapping = metadata.sensor_field_mapping || {};
    const tdsField = Object.keys(mapping).find(k => mapping[k] === "tds_value") || "field1";
    const tempField = Object.keys(mapping).find(k => mapping[k] === "temperature") || "field2";


    const tdsValues = response.data.feeds
      .map((feed) => parseFloat(feed[tdsField]))
      .filter((v) => !isNaN(v));
    const tempValues = response.data.feeds
      .map((feed) => parseFloat(feed[tempField]))
      .filter((v) => !isNaN(v));

    const analytics = {
      avg_tds:
        tdsValues.length > 0
          ? (tdsValues.reduce((a, b) => a + b, 0) / tdsValues.length).toFixed(2)
          : null,
      min_tds: tdsValues.length > 0 ? Math.min(...tdsValues) : null,
      max_tds: tdsValues.length > 0 ? Math.max(...tdsValues) : null,
      avg_temp:
        tempValues.length > 0
          ? (tempValues.reduce((a, b) => a + b, 0) / tempValues.length).toFixed(2)
          : null,
      readings_count: tdsValues.length,
    };

    res.status(200).json(analytics);
  } catch (error) {
    console.error("[TDSController] Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};
