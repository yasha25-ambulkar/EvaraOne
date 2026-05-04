/**
 * tdsStateService.js
 *
 * Handles TDS-specific telemetry logic:
 *   ThingSpeak fetch → field mapping → quality calculation → Firestore update → cache
 */

'use strict';

const { fetchLatestData } = require('./thingspeakService');
const { db } = require('../config/firebase');
const { resolveFieldKey } = require('../utils/fieldMappingResolver');
const { DEVICE_STATUS, STATUS_THRESHOLD_MS } = require('../utils/deviceConstants');
const logger = require('../utils/logger');

// In-memory cache { deviceId → state }
const _cache = new Map();

/**
 * Returns the latest state for a TDS device.
 * @param {object} device - Firestore device document data
 * @returns {Promise<object>}
 */
async function getTDSDeviceState(device) {
  const id = device.id;
  if (_cache.has(id)) {
    return _cache.get(id);
  }
  return await refreshTDSDeviceState(device);
}

/**
 * Fetches fresh data for a TDS device, calculates quality, updates Firestore and cache.
 * @param {object} device - Firestore device document data
 * @returns {Promise<object>}
 */
async function refreshTDSDeviceState(device) {
  const id = device.id;
  const metadata = device; // Assuming device object contains metadata/registry info

  // Resolve ThingSpeak config
  const channel = (metadata.thingspeak_channel_id || metadata.configuration?.thingspeak_channel_id)?.trim();
  const apiKey = (metadata.thingspeak_read_api_key || metadata.configuration?.thingspeak_read_api_key)?.trim();

  if (!channel || !apiKey) {
    logger.warn(`[tdsStateService] Missing ThingSpeak credentials for ${id}`);
    return buildOfflineState(id, metadata, "Credentials missing");
  }

  try {
    const latestData = await fetchLatestData(channel, apiKey);
    
    if (!latestData) {
      return buildOfflineState(id, metadata, "No data from ThingSpeak");
    }

    // Resolve field mappings
    const mapping = metadata.sensor_field_mapping || metadata.configuration?.sensor_field_mapping || {};
    const tdsField = resolveFieldKey(mapping, ["tds_value"], "field2");
    const tempField = resolveFieldKey(mapping, ["temperature"], "field3");

    const tdsValue = parseFloat(latestData[tdsField]);
    const temperature = parseFloat(latestData[tempField]);

    // Quality calculation
    let quality = "Good";
    if (!isNaN(tdsValue)) {
      if (tdsValue < 300) quality = "Good";
      else if (tdsValue < 600) quality = "Good";
      else if (tdsValue < 1000) quality = "Acceptable";
      else if (tdsValue < 1500) quality = "Acceptable";
      else quality = "Critical";
    }

    // Status calculation
    const lastUpdated = new Date(latestData.created_at || Date.now());
    const timeSinceUpdate = Date.now() - lastUpdated.getTime();
    let status = DEVICE_STATUS.ONLINE;
    if (timeSinceUpdate > STATUS_THRESHOLD_MS) status = DEVICE_STATUS.OFFLINE;
    else if (timeSinceUpdate > STATUS_THRESHOLD_MS / 2) status = DEVICE_STATUS.OFFLINE_RECENT;

    const state = {
      id,
      tdsValue: isNaN(tdsValue) ? null : tdsValue,
      temperature: isNaN(temperature) ? null : temperature,
      quality,
      waterQualityRating: quality,
      status,
      lastUpdated: lastUpdated.toISOString(),
      timestamp: latestData.created_at,
      unit: metadata.configuration?.unit || "ppm"
    };

    // Update Firestore background update
    db.collection('devices').doc(id).update({
      last_seen: new Date().toISOString(),
      last_telemetry: {
        ...state,
        updated_at: new Date().toISOString()
      }
    }).catch(err => logger.warn(`[tdsStateService] Firestore update failed for ${id}:`, err.message));

    _cache.set(id, state);
    return state;

  } catch (err) {
    logger.error(`[tdsStateService] Error refreshing ${id}:`, err.message);
    return buildOfflineState(id, metadata, err.message);
  }
}

/**
 * Builds an offline state fallback
 */
function buildOfflineState(id, metadata, error) {
  // Try to get from cache first
  if (_cache.has(id)) {
    const cached = _cache.get(id);
    return { ...cached, status: DEVICE_STATUS.OFFLINE, error };
  }

  // Fallback to registry last_telemetry if available
  const lastTele = metadata.last_telemetry;
  if (lastTele) {
    return {
      ...lastTele,
      status: DEVICE_STATUS.OFFLINE,
      error: error || "Device offline (using last known data)"
    };
  }

  return {
    id,
    tdsValue: null,
    temperature: null,
    quality: "Unknown",
    status: DEVICE_STATUS.OFFLINE,
    lastUpdated: new Date().toISOString(),
    error: error || "No data available"
  };
}

/**
 * Fetches historical data for a TDS device.
 * Falls back to last_telemetry if ThingSpeak is unreachable.
 */
async function getTDSHistory(device, limit = 60) {
  const id = device.id;
  const channel = (device.thingspeak_channel_id || device.configuration?.thingspeak_channel_id)?.trim();
  const apiKey = (device.thingspeak_read_api_key || device.configuration?.thingspeak_read_api_key)?.trim();

  if (!channel || !apiKey) {
    return device.last_telemetry ? [{
      timestamp: device.last_telemetry.timestamp || new Date().toISOString(),
      value: device.last_telemetry.tdsValue,
      temperature: device.last_telemetry.temperature,
      quality: device.last_telemetry.quality
    }] : [];
  }

  try {
    const axios = require('axios');
    const url = `https://api.thingspeak.com/channels/${channel}/feeds.json?api_key=${apiKey}&results=${limit}&timezone=UTC`;
    const response = await axios.get(url, { timeout: 8000 });

    if (!response.data || !response.data.feeds) {
      throw new Error("Invalid response from ThingSpeak");
    }

    const mapping = device.sensor_field_mapping || device.configuration?.sensor_field_mapping || {};
    // Correctly resolve field keys using the mapping from Firestore
    // Support both camelCase and snake_case internal keys
    const tdsField = resolveFieldKey(mapping, ["tdsValue", "tds_value"], "field2");
    const tempField = resolveFieldKey(mapping, ["temperature", "temp"], "field3");

    return response.data.feeds.map(feed => {
      const tdsValue = parseFloat(feed[tdsField]);
      let quality = "Good";
      if (!isNaN(tdsValue)) {
        if (tdsValue < 300) quality = "Good";
        else if (tdsValue < 600) quality = "Good";
        else if (tdsValue < 1000) quality = "Acceptable";
        else if (tdsValue < 1500) quality = "Acceptable";
        else quality = "Critical";
      }

      return {
        timestamp: feed.created_at,
        value: isNaN(tdsValue) ? null : tdsValue,
        temperature: parseFloat(feed[tempField]) || null,
        quality
      };
    });
  } catch (err) {
    logger.warn(`[tdsStateService] History fetch failed for ${id}:`, err.message);
    if (device.last_telemetry) {
      return [{
        timestamp: device.last_telemetry.timestamp || new Date().toISOString(),
        value: device.last_telemetry.tdsValue,
        temperature: device.last_telemetry.temperature,
        quality: device.last_telemetry.quality,
        isFallback: true
      }];
    }
    return [];
  }
}

module.exports = {
  getTDSDeviceState,
  refreshTDSDeviceState,
  getTDSHistory
};
