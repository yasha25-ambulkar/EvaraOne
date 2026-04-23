/**
 * ThingSpeak Configuration API
 * Handles fetching and managing ThingSpeak channel configuration
 */

const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase.js");
const { fetchAndSaveChannelMetadata } = require("../services/channelMetadataService.js");
const logger = require("../utils/logger.js");
const AppError = require("../utils/AppError.js");
// ✅ ISSUE #6: Add Zod validation middleware
const validate = require("../middleware/validate.js");
const { fetchThingSpeakFieldsSchema, saveThingSpeakMetadataSchema } = require("../schemas/thingspeak.schema.js");

/**
 * POST /api/v1/thingspeak/fetch-fields
 * 
 * Fetches channel metadata from ThingSpeak (PUBLIC API - no auth needed)
 * Returns available fields that the user can map to internal keys
 * 
 * Body:
 * {
 *   channelId: string,
 *   apiKey: string (optional, for private channels)
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   metadata: {
 *     channel_id: "3233465",
 *     field1: "Meter Reading_7",
 *     field2: "Flow Rate",
 *     field3: "Meter Reading_8",
 *     field4: "Flow Rate Filtered",
 *     fetched_at: "2026-04-21T10:00:00Z"
 *   }
 * }
 */
// ✅ ISSUE #6: Apply Zod validation
router.post("/fetch-fields", validate(fetchThingSpeakFieldsSchema), async (req, res, next) => {
  try {
    const { channelId, apiKey } = req.body;

    logger.info("[ThingSpeakAPI] Fetch Fields request", {
      category: "thingspeak",
      channelId
    });

    // ✅ ISSUE #6: channelId already validated by Zod middleware
    // Fetch channel metadata from ThingSpeak (no device save yet)
    const metadata = await require("../services/channelMetadataService.js")
      .fetchChannelMetadataFromThingSpeak(channelId, apiKey);
    
    if (!metadata) {
      throw new AppError("Failed to fetch channel metadata from ThingSpeak", 500);
    }

    logger.info("[ThingSpeakAPI] ✅ Fetch Fields successful", {
      category: "thingspeak",
      channelId,
      fieldsCount: Object.keys(metadata).length - 3
    });

    res.status(200).json({
      success: true,
      metadata
    });
  } catch (error) {
    // ✅ ISSUE #6: Delegate to centralized error handler
    next(error);
  }
});

/**
 * POST /api/v1/thingspeak/save-metadata
 * 
 * Saves channel metadata for a specific device
 * Called when device is created or when user updates field mapping
 * 
 * Body:
 * {
 *   deviceId: string,
 *   metadata: { field1: "...", field2: "...", ... }
 * }
 */
// ✅ ISSUE #6: Apply Zod validation
router.post("/save-metadata", validate(saveThingSpeakMetadataSchema), async (req, res, next) => {
  try {
    const { deviceId, metadata } = req.body;

    logger.info("[ThingSpeakAPI] Save Metadata request", {
      category: "thingspeak",
      deviceId
    });

    // ✅ ISSUE #6: deviceId and metadata already validated by Zod middleware
    // Verify device exists and user has access
    const deviceDoc = await db.collection("devices").doc(deviceId).get();
    if (!deviceDoc.exists) {
      throw new AppError("Device not found", 404);
    }

    // Check ownership (basic check)
    const device = deviceDoc.data();
    if (req.user && req.user.uid !== device.owner_id && req.user.role !== "superadmin") {
      throw new AppError("Access denied", 403);
    }

    // Save metadata
    const saved = await require("../services/channelMetadataService.js")
      .saveChannelMetadata(deviceId, metadata);
    
    if (!saved) {
      throw new AppError("Failed to save metadata", 500);
    }

    logger.info("[ThingSpeakAPI] ✅ Save Metadata successful", {
      category: "thingspeak",
      deviceId
    });

    res.status(200).json({
      success: true,
      message: "Metadata saved"
    });
  } catch (error) {
    // ✅ ISSUE #6: Delegate to centralized error handler
    next(error);
  }
});


/**
 * GET /api/v1/thingspeak/metadata/:deviceId
 * 
 * Get saved channel metadata for a device
 * 
 * Response:
 * {
 *   success: true,
 *   metadata: { ... }
 * }
 */
router.get("/metadata/:deviceId", async (req, res) => {
  try {
    const { deviceId } = req.params;

    logger.info("[ThingSpeakAPI] Get Metadata request", {
      category: "thingspeak",
      deviceId
    });

    // Verify device exists
    const deviceDoc = await db.collection("devices").doc(deviceId).get();
    if (!deviceDoc.exists) {
      throw new AppError("Device not found", 404);
    }

    // Check ownership (basic check)
    const device = deviceDoc.data();
    if (req.user && req.user.uid !== device.owner_id && req.user.role !== "superadmin") {
      throw new AppError("Access denied", 403);
    }

    // Get metadata from Firestore
    const metaDoc = await db
      .collection("devices")
      .doc(deviceId)
      .collection("channel_metadata")
      .doc("current")
      .get();

    if (!metaDoc.exists) {
      logger.warn("[ThingSpeakAPI] Metadata not found", {
        category: "thingspeak",
        deviceId
      });
      return res.status(404).json({
        success: false,
        message: "Channel metadata not found. Please fetch fields first."
      });
    }

    const metadata = metaDoc.data();

    logger.info("[ThingSpeakAPI] ✅ Get Metadata successful", {
      category: "thingspeak",
      deviceId,
      fieldsCount: Object.keys(metadata).length - 3
    });

    return res.status(200).json({
      success: true,
      metadata
    });
  } catch (error) {
    logger.error("[ThingSpeakAPI] Get Metadata error", {
      category: "thingspeak",
      error: error.message,
      deviceId: req.params.deviceId
    });

    if (error instanceof AppError) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    res.status(500).json({
      error: "Failed to get metadata",
      message: error.message
    });
  }
});

module.exports = router;
