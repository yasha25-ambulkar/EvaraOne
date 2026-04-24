/**
 * ThingSpeak Configuration API
 * Handles fetching and managing ThingSpeak channel configuration
 */

const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase.js");
const logger = require("../utils/logger.js");
const AppError = require("../utils/AppError.js");
const validate = require("../middleware/validate.js");
const {
  fetchThingSpeakFieldsSchema,
  saveThingSpeakMetadataSchema,
} = require("../schemas/thingspeak.schema.js");

/**
 * POST /api/v1/thingspeak/fetch-fields
 *
 * Fetches channel metadata from ThingSpeak (PUBLIC API - no auth needed)
 * Returns available fields that the user can map to internal keys
 *
 * Body: { channelId: string, apiKey: string (optional) }
 */
router.post("/fetch-fields", validate(fetchThingSpeakFieldsSchema), async (req, res, next) => {
  const { channelId, apiKey } = req.body;
  try {
    logger.info("[ThingSpeakAPI] Fetch Fields request", {
      category: "thingspeak",
      channelId,
      hasApiKey: !!apiKey
    });

    if (!channelId || String(channelId).trim() === '') {
      throw new AppError("Channel ID is required and cannot be empty", 400);
    }
    
    const { fetchChannelMetadataFromThingSpeak } = require("../services/channelMetadataService.js");
    const metadata = await fetchChannelMetadataFromThingSpeak(
      String(channelId).trim(), 
      apiKey ? String(apiKey).trim() : null
    );
    
    logger.info("[ThingSpeakAPI] ✅ Fetch Fields successful", {
      category: "thingspeak",
      channelId,
      fieldCount: Object.keys(metadata).filter(k => k.startsWith('field')).length
    });

    res.status(200).json({
      success: true,
      metadata
    });
  } catch (error) {
    logger.error("[ThingSpeakAPI] Fetch Fields error", {
      category: "thingspeak",
      errorMessage: error.message,
      statusCode: error.statusCode,
      channelId
    });
    next(error);
  }
});

/**
 * POST /api/v1/thingspeak/save-metadata
 *
 * Saves channel metadata for a specific device
 * Body: { deviceId: string, metadata: { field1: "...", ... } }
 */
router.post(
  "/save-metadata",
  validate(saveThingSpeakMetadataSchema),
  async (req, res, next) => {
    try {
      const { deviceId, metadata } = req.body;

      logger.info("[ThingSpeakAPI] Save Metadata request", {
        category: "thingspeak",
        deviceId,
      });

      const deviceDoc = await db.collection("devices").doc(deviceId).get();
      if (!deviceDoc.exists) {
        throw new AppError("Device not found", 404);
      }

      const device = deviceDoc.data();
      if (
        req.user &&
        req.user.uid !== device.owner_id &&
        req.user.role !== "superadmin"
      ) {
        throw new AppError("Access denied", 403);
      }

      const { saveChannelMetadata } = require("../services/channelMetadataService.js");
      const saved = await saveChannelMetadata(deviceId, metadata);

      if (!saved) {
        throw new AppError("Failed to save metadata", 500);
      }

      logger.info("[ThingSpeakAPI] ✅ Save Metadata successful", {
        category: "thingspeak",
        deviceId,
      });

      return res.status(200).json({ success: true, message: "Metadata saved" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/thingspeak/metadata/:deviceId
 *
 * Get saved channel metadata for a device
 */
router.get("/metadata/:deviceId", async (req, res, next) => {
  try {
    const { deviceId } = req.params;

    logger.info("[ThingSpeakAPI] Get Metadata request", {
      category: "thingspeak",
      deviceId,
    });

    const deviceDoc = await db.collection("devices").doc(deviceId).get();
    if (!deviceDoc.exists) {
      throw new AppError("Device not found", 404);
    }

    const device = deviceDoc.data();
    if (
      req.user &&
      req.user.uid !== device.owner_id &&
      req.user.role !== "superadmin"
    ) {
      throw new AppError("Access denied", 403);
    }

    const metaDoc = await db
      .collection("devices")
      .doc(deviceId)
      .collection("channel_metadata")
      .doc("current")
      .get();

    if (!metaDoc.exists) {
      logger.warn("[ThingSpeakAPI] Metadata not found", {
        category: "thingspeak",
        deviceId,
      });
      return res.status(404).json({
        success: false,
        message: "Channel metadata not found. Please fetch fields first.",
      });
    }

    const metadata = metaDoc.data();

    logger.info("[ThingSpeakAPI] ✅ Get Metadata successful", {
      category: "thingspeak",
      deviceId,
    });

    return res.status(200).json({ success: true, metadata });
  } catch (error) {
    // ✅ Unified error handling - no more duplicated logic
    next(error);
  }
});

module.exports = router;