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
    const response = await fetchLatestData(channel, apiKey);
    const latestData = response.feeds ? response.feeds[0] : response;
    
    if (!latestData) {
      return buildOfflineState(id, metadata, "No data from ThingSpeak");
    }

    const channelMetadata = response.channel || {};
    
    // FUNCTION: Find field key by matching keywords in metadata names
    const findFieldByKeyword = (keywords, fallback) => {
      for (const [key, name] of Object.entries(channelMetadata)) {
        if (!key.startsWith('field')) continue;
        const lowerName = String(name).toLowerCase();
        if (keywords.some(kw => lowerName.includes(kw.toLowerCase()))) {
          return key;
        }
      }
      return fallback;
    };

    // Resolve fields by inspecting metadata names (Highest Priority)
    const tdsField = findFieldByKeyword(['tds', 'ppm'], 'field2');
    const tempField = findFieldByKeyword(['temp', 'celsius'], 'field3');
    const voltageField = findFieldByKeyword(['volt', 'battery'], 'field1');

    const tdsValue = parseFloat(latestData[tdsField]);
    const temperature = parseFloat(latestData[tempField]);
    const voltage = parseFloat(latestData[voltageField]);

    // Quality calculation
    let quality = "Good";
    if (!isNaN(tdsValue)) {
      if (tdsValue < 300) quality = "Good";
      else if (tdsValue < 600) quality = "Good";
      else if (tdsValue < 1000) quality = "Acceptable";
      else if (tdsValue < 1500) quality = "Acceptable";
      else quality = "Critical";
    }

    // Status calculation - more lenient thresholds for TDS devices
    const lastUpdated = new Date(latestData.created_at || Date.now());
    const timeSinceUpdate = Date.now() - lastUpdated.getTime();
    
    // Use slightly larger thresholds for TDS (40 mins offline, 20 mins recent)
    const TDS_OFFLINE_THRESHOLD = 40 * 60 * 1000; 
    
    let status = DEVICE_STATUS.ONLINE;
    if (timeSinceUpdate > TDS_OFFLINE_THRESHOLD) status = DEVICE_STATUS.OFFLINE;
    else if (timeSinceUpdate > TDS_OFFLINE_THRESHOLD / 2) status = DEVICE_STATUS.OFFLINE_RECENT;

    const state = {
      id,
      status,
      tdsValue: isNaN(tdsValue) ? 0 : tdsValue,
      temperature: isNaN(temperature) ? 0 : temperature,
      voltage: isNaN(voltage) ? 0 : voltage,
      quality,
      waterQualityRating: quality,
      lastUpdated,
      timestamp: lastUpdated.toISOString(),
      last_seen: lastUpdated.toISOString(),
      metadata: {
        tdsField,
        tempField,
        voltageField,
        channelName: channelMetadata.name
      }
    };

    // Update Firestore background update
    db.collection('devices').doc(id).update({
      last_seen: lastUpdated.toISOString(), // Use DATA timestamp, not current time
      online_status: status === DEVICE_STATUS.ONLINE,
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
async function getTDSHistory(device, limit = 1000) {
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

    const channelMetadata = response.data.channel || {};
    
    // FUNCTION: Find field key by matching keywords in metadata names
    const findFieldByKeyword = (keywords, fallback) => {
      for (const [key, name] of Object.entries(channelMetadata)) {
        if (!key.startsWith('field')) continue;
        const lowerName = String(name).toLowerCase();
        if (keywords.some(kw => lowerName.includes(kw.toLowerCase()))) {
          return key;
        }
      }
      return fallback;
    };

    // Resolve fields by inspecting metadata names
    const tdsField = findFieldByKeyword(['tds', 'ppm'], 'field2');
    const tempField = findFieldByKeyword(['temp', 'celsius'], 'field3');
    const voltageField = findFieldByKeyword(['volt', 'battery'], 'field1');

    return response.data.feeds.map(feed => {
      const tdsValue = parseFloat(feed[tdsField]);
      const tempValue = parseFloat(feed[tempField]);
      const voltageValue = parseFloat(feed[voltageField]);
      
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
        temperature: isNaN(tempValue) ? null : tempValue,
        voltage: isNaN(voltageValue) ? null : voltageValue,
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
