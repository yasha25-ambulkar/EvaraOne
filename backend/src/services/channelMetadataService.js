/**
 * Channel Metadata Service
 * Fetches and caches ThingSpeak channel metadata (field names)
 * 
 * This is the foundation of the stable anchor architecture:
 * - Stores which field (field1, field2, etc.) contains which semantic name
 * - Acts as the bridge between generic fieldX positions and semantic names
 * - Used by fieldMappingResolver to map data correctly even if positions change
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
  try {
    let url = `https://api.thingspeak.com/channels/${channelId}.json`;
    if (apiKey) url += `?api_key=${apiKey}`;
    
    logger.info(`[ChannelMetadata] Fetching from ThingSpeak: ${channelId}`, { category: "thingspeak" });
    
    const res = await axios.get(url, { timeout: 10000 });
    const channel = res.data;
    
    if (!channel) {
      logger.error(`[ChannelMetadata] Channel not found: ${channelId}`, { category: "thingspeak" });
      return null;
    }
    
    // Extract field names (field1, field2, field3, field4, field5, field6, field7, field8)
    const metadata = {
      channel_id: String(channelId),
      fetched_at: new Date().toISOString(),
      channel_name: channel.name || "",
      channel_description: channel.description || ""
    };
    
    // Extract field names from the channel object
    for (let i = 1; i <= 8; i++) {
      const fieldName = channel[`field${i}`];
      if (fieldName && fieldName.trim()) {
        metadata[`field${i}`] = fieldName.trim();
      }
    }
    
    logger.info(`[ChannelMetadata] ✅ Fetched ${Object.keys(metadata).length - 3} fields from ThingSpeak`, { 
      category: "thingspeak",
      channelId,
      metadata 
    });
    
    return metadata;
  } catch (error) {
    logger.error(`[ChannelMetadata] Failed to fetch from ThingSpeak: ${error.message}`, {
      category: "thingspeak",
      channelId,
      error: error.message
    });
    return null;
  }
}

/**
 * Save channel metadata to Firestore
 * Stored in: devices/{deviceId}/channel_metadata
 * 
 * @param {string} deviceId - Device document ID
 * @param {Object} metadata - Metadata object from fetchChannelMetadataFromThingSpeak
 */
async function saveChannelMetadata(deviceId, metadata) {
  try {
    if (!metadata || !deviceId) {
      logger.warn(`[ChannelMetadata] Missing required params for save: deviceId=${deviceId}`, {
        category: "thingspeak"
      });
      return false;
    }
    
    logger.info(`[ChannelMetadata] Saving to Firestore for device ${deviceId}`, {
      category: "thingspeak",
      metadata
    });
    
    await db
      .collection("devices")
      .doc(deviceId)
      .collection("channel_metadata")
      .doc("current")
      .set(metadata, { merge: true });
    
    // Also cache for quick lookup
    await cache.set(`channel_metadata:${deviceId}`, metadata, 86400); // 24h
    
    logger.info(`[ChannelMetadata] ✅ Saved successfully for device ${deviceId}`, {
      category: "thingspeak"
    });
    
    return true;
  } catch (error) {
    logger.error(`[ChannelMetadata] Failed to save: ${error.message}`, {
      category: "thingspeak",
      deviceId,
      error: error.message
    });
    return false;
  }
}

/**
 * Load channel metadata from cache or Firestore
 * 
 * @param {string} deviceId - Device document ID
 * @returns {Promise<Object|null>} Metadata object or null
 */
async function loadChannelMetadata(deviceId) {
  try {
    // 1. Try cache first
    const cached = await cache.get(`channel_metadata:${deviceId}`);
    if (cached) {
      logger.info(`[ChannelMetadata] Cache hit for device ${deviceId}`, {
        category: "thingspeak"
      });
      return cached;
    }
    
    // 2. Try Firestore
    logger.info(`[ChannelMetadata] Loading from Firestore for device ${deviceId}`, {
      category: "thingspeak"
    });
    
    const doc = await db
      .collection("devices")
      .doc(deviceId)
      .collection("channel_metadata")
      .doc("current")
      .get();
    
    if (!doc.exists) {
      logger.warn(`[ChannelMetadata] Not found in Firestore for device ${deviceId}`, {
        category: "thingspeak"
      });
      return null;
    }
    
    const metadata = doc.data();
    
    // Cache it
    await cache.set(`channel_metadata:${deviceId}`, metadata, 86400);
    
    logger.info(`[ChannelMetadata] ✅ Loaded from Firestore for device ${deviceId}`, {
      category: "thingspeak",
      metadata
    });
    
    return metadata;
  } catch (error) {
    logger.error(`[ChannelMetadata] Failed to load: ${error.message}`, {
      category: "thingspeak",
      deviceId,
      error: error.message
    });
    return null;
  }
}

/**
 * Fetch and save channel metadata in one operation
 * Called when user clicks "Fetch Fields" button
 * 
 * @param {string} deviceId - Device document ID
 * @param {string} channelId - ThingSpeak channel ID
 * @param {string} apiKey - ThingSpeak read API key
 * @returns {Promise<Object|null>} Saved metadata or null
 */
async function fetchAndSaveChannelMetadata(deviceId, channelId, apiKey) {
  try {
    logger.info(`[ChannelMetadata] Starting fetch and save for device ${deviceId}`, {
      category: "thingspeak",
      channelId
    });
    
    const metadata = await fetchChannelMetadataFromThingSpeak(channelId, apiKey);
    if (!metadata) {
      logger.error(`[ChannelMetadata] Failed to fetch metadata`, {
        category: "thingspeak",
        channelId
      });
      return null;
    }
    
    const saved = await saveChannelMetadata(deviceId, metadata);
    if (!saved) {
      logger.error(`[ChannelMetadata] Failed to save metadata`, {
        category: "thingspeak",
        deviceId
      });
      return null;
    }
    
    logger.info(`[ChannelMetadata] ✅ Fetch and save complete for device ${deviceId}`, {
      category: "thingspeak",
      metadata
    });
    
    return metadata;
  } catch (error) {
    logger.error(`[ChannelMetadata] Fetch and save failed: ${error.message}`, {
      category: "thingspeak",
      deviceId,
      error: error.message
    });
    return null;
  }
}

/**
 * Clear channel metadata from cache
 * 
 * @param {string} deviceId - Device document ID
 */
async function clearChannelMetadataCache(deviceId) {
  try {
    await cache.del(`channel_metadata:${deviceId}`);
    logger.info(`[ChannelMetadata] Cache cleared for device ${deviceId}`, {
      category: "thingspeak"
    });
  } catch (error) {
    logger.warn(`[ChannelMetadata] Failed to clear cache: ${error.message}`, {
      category: "thingspeak",
      deviceId
    });
  }
}

module.exports = {
  fetchChannelMetadataFromThingSpeak,
  saveChannelMetadata,
  loadChannelMetadata,
  fetchAndSaveChannelMetadata,
  clearChannelMetadataCache
};
