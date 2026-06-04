/**
 * TDS (Total Dissolved Solids) Controller
 * Handles TDS device telemetry, configuration, and queries
 */

const { db, admin } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const axios = require("axios");
const { fetchLatestData } = require("../services/thingspeakService.js");
const { checkOwnership } = require("../middleware/auth.middleware.js");
const {
  checkDeviceVisibilityWithAudit,
} = require("../utils/checkDeviceVisibility.js");
const logger = require("../utils/logger.js");
const {
  DEVICE_STATUS,
  STATUS_THRESHOLD_MS,
} = require("../utils/deviceConstants.js");
const { resolveFieldKey } = require("../utils/fieldMappingResolver.js");
// ✅ ISSUE #5: Centralized error handler — use AppError for all errors
const AppError = require("../utils/AppError.js");

// ✅ AUDIT FIX L2: Use shared resolveDevice utility (was duplicated in 3 controllers)
const resolveDevice = require("../utils/resolveDevice.js");
const {
  resolveDeviceMetadata,
} = require("../services/deviceMetadataResolver.js");

/**
 * Helper to resolve TDS metadata document
 * Metadata can be indexed by device DocID OR hardware device_id/node_id
 * Now includes full query fallbacks like resolveDevice
 */
async function resolveMetadata(deviceDoc) {
  if (!deviceDoc) return null;
  const id = deviceDoc.id;
  const registry = deviceDoc.data();
  const deviceType = registry.device_type || "EvaraTDS";

  logger.debug(`[resolveMetadata] Using centralized resolver for device ${id}`);

  const metadata = await resolveDeviceMetadata(id, deviceType, registry);

  if (metadata && !metadata.isPartial) {
    // Wrap in object with data() method to maintain backward compatibility with controller code
    return {
      exists: true,
      data: () => metadata,
    };
  }

  return null;
}

/**
 * Get TDS device telemetry
 * Returns latest TDS value, temperature, and quality status
 */
exports.getTDSTelemetry = async (req, res, next) => {
  try {
    const { id: paramId } = req.params;
    logger.debug(`[TDS-getTDSTelemetry] REQUEST: paramId=${paramId}`);

    // Get device metadata - using resolveDevice for hardware ID support
    const deviceDoc = await resolveDevice(paramId);
    if (!deviceDoc) {
      logger.error(
        `[TDS-getTDSTelemetry] ❌ STEP 1 FAILED: Device not found for ID: ${paramId}`,
      );
      throw new AppError("Device not found", 404);
    }

    const id = deviceDoc.id; // Use the actual Firestore ID for subsequent lookups
    const registry = deviceDoc.data();
    logger.debug(`[TDS-getTDSTelemetry] ✅ STEP 1 SUCCESS: Device resolved`);
    logger.debug(`[TDS-getTDSTelemetry]    Document ID: ${id}`);
    logger.debug(
      `[TDS-getTDSTelemetry]    device_type: ${registry.device_type}`,
    );
    logger.debug(`[TDS-getTDSTelemetry]    device_id: ${registry.device_id}`);
    logger.debug(`[TDS-getTDSTelemetry]    node_id: ${registry.node_id}`);

    // Validate device type - accept both "evaratds" and "tds"
    const deviceType = registry.device_type?.toLowerCase() || "";
    logger.debug(
      `[TDS-getTDSTelemetry] STEP 2: Checking device type: "${deviceType}"`,
    );
    if (deviceType !== "evaratds" && deviceType !== "tds") {
      logger.error(
        `[TDS-getTDSTelemetry] ❌ STEP 2 FAILED: Invalid device type: "${deviceType}"`,
      );
      throw new AppError(
        `Device is not a TDS sensor (found: ${deviceType})`,
        400,
      );
    }
    logger.debug(`[TDS-getTDSTelemetry] ✅ STEP 2 SUCCESS: Device type valid`);

    // ✅ CRITICAL FIX: Check ownership
    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        id,
        req.user.role,
        req.user.community_id,
      );
      if (!isOwner) {
        logger.error(`[TDS-getTDSTelemetry] ❌ Ownership check failed`);
        throw new AppError("Unauthorized access", 403);
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    // Defense in depth: check visibility in application layer
    if (
      !checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)
    ) {
      logger.error(`[TDS-getTDSTelemetry] ❌ Visibility check failed`);
      throw new AppError("Device not visible to your account", 403);
    }

    // Get TDS metadata
    logger.debug(
      `[TDS-getTDSTelemetry] STEP 3: Resolving metadata for device ${id}`,
    );
    const metaDoc = await resolveMetadata(deviceDoc);
    if (!metaDoc) {
      logger.error(
        `[TDS-getTDSTelemetry] ❌ STEP 3 FAILED: Metadata not found`,
      );
      throw new AppError("TDS metadata not found", 404);
    }
    logger.debug(`[TDS-getTDSTelemetry] ✅ STEP 3 SUCCESS: Metadata resolved`);

    const metadata = metaDoc.data();
    const { getTDSDeviceState } = require("../services/tdsStateService");

    // Fetch state (from cache, live, or fallback)
    const state = await getTDSDeviceState({ id, ...registry, ...metadata });

    const config = metadata.configuration || {};

    // Format response to match frontend expectations
    const response = {
      ...state,
      deviceName: metadata.label || metadata.device_name || "TDS Device",
      type: "TDS",
      minThreshold: config.min_threshold || 0,
      maxThreshold: config.max_threshold || 2000,
      latitude: metadata.latitude,
      longitude: metadata.longitude,
      created_at: state.timestamp,
      alertsCount: 0,
      tdsHistory: [], // Fetched separately
    };

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
        limit = 60; // Enough for 3 hours at any frequency
      } else if (hoursParam <= 6) {
        limit = 120;
      } else if (hoursParam <= 12) {
        limit = 200;
      } else {
        limit = 288; // Default for 24+ hours
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
        req.user.community_id,
      );
      if (!isOwner) {
        throw new AppError("Unauthorized access", 403);
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    if (
      !checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)
    ) {
      throw new AppError("Device not visible to your account", 403);
    }

    // Get TDS metadata
    const metaDoc = await resolveMetadata(deviceDoc);
    if (!metaDoc) {
      logger.error(`[TDS-getTDSHistory] Metadata not found for device ${id}`);
      throw new AppError("TDS metadata not found", 404);
    }

    const metadata = metaDoc.data();
    const channel = metadata.thingspeak_channel_id?.trim();
    const apiKey = metadata.thingspeak_read_api_key?.trim();

    if (!channel || !apiKey) {
      throw new AppError("ThingSpeak credentials missing", 400);
    }

    // Fetch historical data using the service (handles fallback)
    const { getTDSHistory } = require("../services/tdsStateService");
    const data = await getTDSHistory({ id, ...registry, ...metadata }, limit);

    logger.debug(
      "[TDS-getTDSHistory] Returning",
      data.length,
      "history points",
    );

    res.status(200).json({
      id,
      label: metadata.label,
      history: data,
      count: data.length,
      period_hours: hoursParam,
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
        req.user.community_id,
      );
      if (!isOwner) {
        return res.status(403).json({ error: "Unauthorized access" });
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    if (
      !checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)
    ) {
      return res
        .status(403)
        .json({ error: "Device not visible to your account" });
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
    logger.error("[TDSController] Error fetching config:", error);
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
    const registry = deviceDoc.data();

    // Check ownership
    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        id,
        req.user.role,
        req.user.community_id,
      );
      if (!isOwner) {
        return res.status(403).json({ error: "Unauthorized access" });
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    if (
      !checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)
    ) {
      return res
        .status(403)
        .json({ error: "Device not visible to your account" });
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
    const customerId = registry?.customer_id || registry?.customerId;
    if (customerId && global.io) {
      global.io.to(`customer:${customerId}`).emit("device:updated", {
        deviceId: id,
        changes: updated,
        success: true,
        timestamp: new Date().toISOString(),
      });
      logger.debug(
        `[TDSController] ✅ device:updated event emitted for TDS config update: ${id}`,
      );
    }

    res.status(200).json({ success: true, message: "Configuration updated" });
  } catch (error) {
    logger.error("[TDSController] Error updating config:", error);
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
        req.user.community_id,
      );
      if (!isOwner) {
        return res.status(403).json({ error: "Unauthorized access" });
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    if (
      !checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)
    ) {
      return res
        .status(403)
        .json({ error: "Device not visible to your account" });
    }

    const metaDoc = await resolveMetadata(deviceDoc);
    if (!metaDoc) {
      logger.error(`[TDS-getTDSHistory] Metadata not found for device ${id}`);
      return res.status(404).json({ error: "TDS device not found" });
    }

    const metadata = metaDoc.data();
    const channel = metadata.thingspeak_channel_id?.trim();
    const apiKey = metadata.thingspeak_read_api_key?.trim();

    if (!channel || !apiKey) {
      return res.status(400).json({ error: "ThingSpeak credentials missing" });
    }

    // Fetch data using the service (handles fallback)
    const { getTDSHistory } = require("../services/tdsStateService");
    const history = await getTDSHistory({ id, ...registry, ...metadata }, 288);

    if (!history || history.length === 0) {
      return res.status(200).json({
        avg_tds: null,
        min_tds: null,
        max_tds: null,
        avg_temp: null,
        readings_count: 0,
      });
    }

    const tdsValues = history
      .map((h) => h.value)
      .filter((v) => v !== null && !isNaN(v));
    const tempValues = history
      .map((h) => h.temperature)
      .filter((v) => v !== null && !isNaN(v));

    const analytics = {
      avg_tds:
        tdsValues.length > 0
          ? (tdsValues.reduce((a, b) => a + b, 0) / tdsValues.length).toFixed(2)
          : null,
      min_tds: tdsValues.length > 0 ? Math.min(...tdsValues) : null,
      max_tds: tdsValues.length > 0 ? Math.max(...tdsValues) : null,
      avg_temp:
        tempValues.length > 0
          ? (tempValues.reduce((a, b) => a + b, 0) / tempValues.length).toFixed(
              2,
            )
          : null,
      readings_count: tdsValues.length,
    };

    res.status(200).json(analytics);
  } catch (error) {
    logger.error("[TDSController] Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};
