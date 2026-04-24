/**
 * Channel Metadata Service
 * Fetches and caches ThingSpeak channel metadata (field names)
 */

const axios = require("axios");
const cache = require("../config/cache.js");
const { db } = require("../config/firebase.js");
const logger = require("../utils/logger.js");

/**
 * Fetch channel metadata from ThingSpeak API
 * Returns mapping of fieldX → field_name
 *
 * @param {string} channelId - ThingSpeak channel ID
 * @param {string} apiKey - ThingSpeak read API key (optional, for private channels)
 * @returns {Promise<Object>} { field1: "Meter Reading_7", field2: "Flow Rate", ... }
 */
async function fetchChannelMetadataFromThingSpeak(channelId, apiKey = null) {
  const AppError = require("../utils/AppError.js");

  try {
    // ✅ FIX: Use the feeds endpoint with results=0 — this works for BOTH
    // public channels AND private channels using a Read API Key.
    // The /channels/{id}.json endpoint requires a USER API key, not a Read API key,
    // which is why it returned 400.
    const params = new URLSearchParams({ results: "0" });
    if (apiKey) params.append("api_key", apiKey);

    const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?${params.toString()}`;

    logger.info(`[ChannelMetadata] Fetching from ThingSpeak: ${channelId}`, {
      category: "thingspeak",
      url,
    });

    const res = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "application/json",
      },
    });

    // ThingSpeak returns -1 (number or string) when credentials are bad
    if (res.data === -1 || res.data === "-1") {
      throw new AppError(
        "Invalid Channel ID or API Key. Please verify your ThingSpeak credentials.",
        400
      );
    }

    const channel = res.data?.channel;

    if (!channel) {
      throw new AppError(
        "Channel not found. Please verify your Channel ID.",
        404
      );
    }

    // Build metadata from channel object
    const metadata = {
      channel_id: String(channelId),
      fetched_at: new Date().toISOString(),
      channel_name: channel.name || "",
      channel_description: channel.description || "",
    };

    // Extract field names (field1 … field8)
    for (let i = 1; i <= 8; i++) {
      const fieldName = channel[`field${i}`];
      if (fieldName && typeof fieldName === "string" && fieldName.trim()) {
        metadata[`field${i}`] = fieldName.trim();
      }
    }

    const fieldCount = Object.keys(metadata).filter((k) => k.startsWith("field")).length;

    logger.info(`[ChannelMetadata] ✅ Fetched ${fieldCount} fields from ThingSpeak`, {
      category: "thingspeak",
      channelId,
      fields: Object.keys(metadata).filter((k) => k.startsWith("field")),
    });

    return metadata;
  } catch (error) {
    // Re-throw AppErrors as-is (already formatted)
    if (error instanceof AppError) throw error;

    logger.error(`[ChannelMetadata] Failed to fetch from ThingSpeak: ${error.message}`, {
      category: "thingspeak",
      channelId,
      status: error.response?.status,
      responseData: error.response?.data,
    });

    if (error.response) {
      const status = error.response.status;
      const responseData = error.response.data;

      // ThingSpeak 400 — bad channel ID or wrong API key type
      if (status === 400) {
        const isUnauthorized =
          responseData === -1 ||
          responseData === "-1" ||
          responseData?.status === "-1";

        throw new AppError(
          isUnauthorized
            ? "Unauthorized. The Read API Key is incorrect or the channel is private."
            : "Invalid Channel ID or API Key. Please verify your ThingSpeak credentials.",
          400
        );
      }

      if (status === 401) throw new AppError("Unauthorized. Check your API key permissions.", 401);
      if (status === 404) throw new AppError("Channel not found. Please verify your Channel ID.", 404);

      throw new AppError(`Failed to fetch channel metadata from ThingSpeak (HTTP ${status})`, status);
    }

    // Network / timeout errors
    if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
      throw new AppError("Unable to connect to ThingSpeak. Please check your internet connection.", 503);
    }

    throw new AppError("Network error while trying to reach ThingSpeak", 500);
  }
}

/**
 * Save channel metadata to Firestore
 */
async function saveChannelMetadata(deviceId, metadata) {
  try {
    if (!metadata || !deviceId) {
      logger.warn(
        `[ChannelMetadata] Missing required params: deviceId=${deviceId}`,
        { category: "thingspeak" }
      );
      return false;
    }

    logger.info(
      `[ChannelMetadata] Saving to Firestore for device ${deviceId}`,
      { category: "thingspeak" }
    );

    await db
      .collection("devices")
      .doc(deviceId)
      .collection("channel_metadata")
      .doc("current")
      .set(metadata, { merge: true });

    await cache.set(`channel_metadata:${deviceId}`, metadata, 86400); // 24h

    logger.info(
      `[ChannelMetadata] ✅ Saved successfully for device ${deviceId}`,
      { category: "thingspeak" }
    );

    return true;
  } catch (error) {
    logger.error(`[ChannelMetadata] Failed to save: ${error.message}`, {
      category: "thingspeak",
      deviceId,
    });
    return false;
  }
}

/**
 * Load channel metadata from cache or Firestore
 */
async function loadChannelMetadata(deviceId) {
  try {
    const cached = await cache.get(`channel_metadata:${deviceId}`);
    if (cached) {
      logger.info(`[ChannelMetadata] Cache hit for device ${deviceId}`, {
        category: "thingspeak",
      });
      return cached;
    }

    const doc = await db
      .collection("devices")
      .doc(deviceId)
      .collection("channel_metadata")
      .doc("current")
      .get();

    if (!doc.exists) {
      logger.warn(
        `[ChannelMetadata] Not found in Firestore for device ${deviceId}`,
        { category: "thingspeak" }
      );
      return null;
    }

    const metadata = doc.data();
    await cache.set(`channel_metadata:${deviceId}`, metadata, 86400);

    logger.info(
      `[ChannelMetadata] ✅ Loaded from Firestore for device ${deviceId}`,
      { category: "thingspeak" }
    );

    return metadata;
  } catch (error) {
    logger.error(`[ChannelMetadata] Failed to load: ${error.message}`, {
      category: "thingspeak",
      deviceId,
    });
    return null;
  }
}

/**
 * Fetch and save channel metadata in one operation
 */
async function fetchAndSaveChannelMetadata(deviceId, channelId, apiKey) {
  try {
    logger.info(
      `[ChannelMetadata] Starting fetch and save for device ${deviceId}`,
      { category: "thingspeak", channelId }
    );

    const metadata = await fetchChannelMetadataFromThingSpeak(
      channelId,
      apiKey
    );
    if (!metadata) return null;

    const saved = await saveChannelMetadata(deviceId, metadata);
    if (!saved) return null;

    logger.info(
      `[ChannelMetadata] ✅ Fetch and save complete for device ${deviceId}`,
      { category: "thingspeak" }
    );

    return metadata;
  } catch (error) {
    logger.error(
      `[ChannelMetadata] Fetch and save failed: ${error.message}`,
      { category: "thingspeak", deviceId }
    );
    return null;
  }
}

/**
 * Clear channel metadata from cache
 */
async function clearChannelMetadataCache(deviceId) {
  try {
    await cache.del(`channel_metadata:${deviceId}`);
    logger.info(`[ChannelMetadata] Cache cleared for device ${deviceId}`, {
      category: "thingspeak",
    });
  } catch (error) {
    logger.warn(`[ChannelMetadata] Failed to clear cache: ${error.message}`, {
      category: "thingspeak",
      deviceId,
    });
  }
}

module.exports = {
  fetchChannelMetadataFromThingSpeak,
  saveChannelMetadata,
  loadChannelMetadata,
  fetchAndSaveChannelMetadata,
  clearChannelMetadataCache,
};