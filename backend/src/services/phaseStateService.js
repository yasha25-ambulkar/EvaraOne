/**
 * phaseStateService.js
 *
 * Handles EvaraPhase / EvaraMotor specific telemetry logic:
 *   ThingSpeak fetch → field mapping → Firestore update → cache
 */

'use strict';

const { fetchLatestData } = require('./thingspeakService');
const { DEVICE_STATUS } = require('../utils/deviceConstants');
const logger = require('../utils/logger');

// In-memory cache { deviceId → state }
const _cache = new Map();

/**
 * Returns the latest state for a Phase device.
 * @param {object} device - Firestore device document data
 * @returns {Promise<object>}
 */
async function getPhaseDeviceState(device, options = {}) {
  const id = device.id || device.hardware_id || device.device_id;
  if (_cache.has(id)) {
    return _cache.get(id);
  }
  return await refreshPhaseDeviceState(device, options);
}

/**
 * Fetches fresh data for a Phase device, updates Firestore and cache.
 * @param {object} device - Firestore device document data
 * @returns {Promise<object>}
 */
async function refreshPhaseDeviceState(device, options = {}) {
  const id = device.id || device.hardware_id || device.device_id;
  const metadata = device;

  // Resolve ThingSpeak config
  const channel = (metadata.thingspeak_channel_id || metadata.configuration?.thingspeak_channel_id)?.trim();
  const apiKey = (metadata.thingspeak_read_api_key || metadata.configuration?.thingspeak_read_api_key || metadata.thingspeak_read_key)?.trim();

  if (!channel || !apiKey) {
    logger.warn(`[phaseStateService] Missing ThingSpeak credentials for ${id}`);
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
          console.log(`[Phase Resolution] Found match for keywords [${keywords}] in ${key} ("${name}")`);
          return key;
        }
      }
      return fallback;
    };

    // Resolve fields by inspecting metadata names or falling back to database-configured mappings
    const dbFields = metadata.fields || {};
    let voltageField = dbFields.voltage || findFieldByKeyword(['volt', 'v-l-l', 'v_l_l'], 'field1');
    let currentField = dbFields.current || findFieldByKeyword(['curr', 'amp', 'current'], 'field2');
    let powerField = dbFields.power || findFieldByKeyword(['power', 'watt', 'kw'], 'field3');
    let frequencyField = dbFields.frequency || findFieldByKeyword(['freq', 'hz', 'frequency'], 'field4');
    let waterLevelField = dbFields.water_level || findFieldByKeyword(['level', 'water', 'depth'], '');

    const voltageValue = parseFloat(latestData[voltageField]);
    const currentValue = parseFloat(latestData[currentField]);
    const powerValue = parseFloat(latestData[powerField]);
    const frequencyValue = parseFloat(latestData[frequencyField]);

    let levelValue = null;
    if (waterLevelField) {
      levelValue = parseFloat(latestData[waterLevelField]);
    }

    console.log(`[Phase Resolution] Raw Values: Volt=${latestData[voltageField]} | Curr=${latestData[currentField]} | Power=${latestData[powerField]} | Freq=${latestData[frequencyField]}`);

    // Status calculation
    const lastUpdated = new Date(latestData.created_at || Date.now());
    const timeSinceUpdate = Date.now() - lastUpdated.getTime();
    
    const OFFLINE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
    
    let status = DEVICE_STATUS.ONLINE;
    if (timeSinceUpdate > OFFLINE_THRESHOLD) status = DEVICE_STATUS.OFFLINE;

    // Build the latest telemetry snapshot
    const telemetrySnapshot = {
      timestamp: lastUpdated.toISOString(),
      voltageValue: isNaN(voltageValue) ? 0 : voltageValue,
      currentValue: isNaN(currentValue) ? 0 : currentValue,
      powerValue: isNaN(powerValue) ? 0 : powerValue,
      frequencyValue: isNaN(frequencyValue) ? 50 : frequencyValue,
      level_percentage: isNaN(levelValue) || levelValue === null ? null : levelValue,
      flow_rate: null,
      total_liters: null
    };

    // Fetch history for charts if options specify it or to build the initial analytics state
    let history = [];
    try {
      history = await getPhaseHistory(device, 50);
    } catch (histErr) {
      logger.warn(`[phaseStateService] Failed to load history for ${id}:`, histErr.message);
    }

    const state = {
      id,
      deviceId: id,
      status,
      online: status === DEVICE_STATUS.ONLINE,
      voltageValue: isNaN(voltageValue) ? 0 : voltageValue,
      currentValue: isNaN(currentValue) ? 0 : currentValue,
      powerValue: isNaN(powerValue) ? 0 : powerValue,
      frequencyValue: isNaN(frequencyValue) ? 50 : frequencyValue,
      level_percentage: isNaN(levelValue) || levelValue === null ? null : levelValue,
      lastUpdated,
      timestamp: lastUpdated.toISOString(),
      last_seen: lastUpdated.toISOString(),
      telemetrySnapshot,
      history,
      active_fields: ['voltageValue', 'currentValue', 'powerValue', 'frequencyValue', 'level_percentage'],
      metadata: {
        voltageField,
        currentField,
        powerField,
        frequencyField,
        waterLevelField,
        channelName: channelMetadata.name
      }
    };

    _cache.set(id, state);
    return state;

  } catch (err) {
    logger.error(`[phaseStateService] Error refreshing ${id}:`, err.message);
    return buildOfflineState(id, metadata, err.message);
  }
}

/**
 * Builds an offline state fallback
 */
function buildOfflineState(id, metadata, error) {
  if (_cache.has(id)) {
    const cached = _cache.get(id);
    return { ...cached, status: DEVICE_STATUS.OFFLINE, online: false, error };
  }

  const lastTele = metadata.last_telemetry || {};
  return {
    id,
    deviceId: id,
    voltageValue: lastTele.voltageValue || 0,
    currentValue: lastTele.currentValue || 0,
    powerValue: lastTele.powerValue || 0,
    frequencyValue: lastTele.frequencyValue || 50,
    level_percentage: lastTele.level_percentage || null,
    status: DEVICE_STATUS.OFFLINE,
    online: false,
    lastUpdated: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    history: [],
    active_fields: ['voltageValue', 'currentValue', 'powerValue', 'frequencyValue', 'level_percentage'],
    error: error || "No data available"
  };
}

/**
 * Fetches historical data for a Phase device.
 */
async function getPhaseHistory(device, limit = 50) {
  const id = device.id || device.hardware_id || device.device_id;
  const channel = (device.thingspeak_channel_id || device.configuration?.thingspeak_channel_id)?.trim();
  const apiKey = (device.thingspeak_read_api_key || device.configuration?.thingspeak_read_api_key || device.thingspeak_read_key)?.trim();

  if (!channel || !apiKey) {
    return [];
  }

  try {
    const axios = require('axios');
    const url = `https://api.thingspeak.com/channels/${channel}/feeds.json?api_key=${apiKey}&results=${limit}&timezone=UTC`;
    const response = await axios.get(url, { timeout: 8000 });

    if (!response.data || !response.data.feeds) {
      throw new Error("Invalid response from ThingSpeak");
    }

    const channelMetadata = response.data.channel || {};
    
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

    const dbFields = device.fields || {};
    let voltageField = dbFields.voltage || findFieldByKeyword(['volt', 'v-l-l', 'v_l_l'], 'field1');
    let currentField = dbFields.current || findFieldByKeyword(['curr', 'amp', 'current'], 'field2');
    let powerField = dbFields.power || findFieldByKeyword(['power', 'watt', 'kw'], 'field3');
    let frequencyField = dbFields.frequency || findFieldByKeyword(['freq', 'hz', 'frequency'], 'field4');
    let waterLevelField = dbFields.water_level || findFieldByKeyword(['level', 'water', 'depth'], '');

    return response.data.feeds.map(feed => {
      const volt = parseFloat(feed[voltageField]);
      const curr = parseFloat(feed[currentField]);
      const pow = parseFloat(feed[powerField]);
      const freq = parseFloat(feed[frequencyField]);
      const lvl = waterLevelField ? parseFloat(feed[waterLevelField]) : null;

      const d = new Date(feed.created_at);
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

      return {
        timestamp: feed.created_at,
        time: timeStr,
        voltage: isNaN(volt) ? null : volt,
        current: isNaN(curr) ? null : curr,
        power: isNaN(pow) ? null : pow,
        frequency: isNaN(freq) ? null : freq,
        level: isNaN(lvl) || lvl === null ? null : lvl
      };
    });
  } catch (err) {
    logger.warn(`[phaseStateService] History fetch failed for ${id}:`, err.message);
    return [];
  }
}

module.exports = {
  getPhaseDeviceState,
  refreshPhaseDeviceState,
  getPhaseHistory
};
