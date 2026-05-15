'use strict';

const logger = require('../utils/logger');
const { db } = require('../config/firebase');

const THINGSPEAK_BASE = 'https://api.thingspeak.com';
const DEFAULT_RESULTS = 100;
const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000;

const _cache = new Map();

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimestamp(value) {
  if (!value) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value < 10000000000 ? value * 1000 : value;
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (typeof value._seconds === 'number') return value._seconds * 1000;
    if (typeof value.seconds === 'number') return value.seconds * 1000;
  }

  const raw = String(value).trim();
  if (!raw) return NaN;

  if (/^\d+$/.test(raw)) {
    const numeric = parseInt(raw, 10);
    return numeric < 10000000000 ? numeric * 1000 : numeric;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();

  if (raw.includes(' ')) {
    const fallback = new Date(raw.replace(' ', 'T'));
    return fallback.getTime();
  }

  return NaN;
}

function safeIso(value) {
  const ms = parseTimestamp(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function resolveFlowConfig(device) {
  const cfg = device?.configuration ?? device?.customer_config ?? device ?? {};
  const fields = device?.fields ?? cfg?.fields ?? {};
  const sensorMap = device?.sensor_field_mapping ?? cfg?.sensor_field_mapping ?? {};

  const findFieldByLogicalName = (logicalName) => {
    return Object.entries(sensorMap).find(([, mapped]) => mapped === logicalName)?.[0] ?? null;
  };

  const flowRateField =
    fields.flow_rate ??
    cfg.flow_rate_field ??
    device?.flow_rate_field ??
    findFieldByLogicalName('flow_rate') ??
    'field4';

  const totalLitersField =
    fields.total_liters ??
    fields.meter_reading ??
    cfg.meter_reading_field ??
    device?.meter_reading_field ??
    findFieldByLogicalName('current_reading') ??
    'field1';

  const channelId = cfg.thingspeak_channel_id ?? device?.thingspeak_channel_id ?? null;
  const apiKey = cfg.thingspeak_read_api_key ?? device?.thingspeak_read_api_key ?? null;

  return {
    channelId: channelId ? String(channelId).trim() : null,
    apiKey: apiKey ? String(apiKey).trim() : null,
    flowRateField: String(flowRateField).trim(),
    totalLitersField: String(totalLitersField).trim(),
  };
}

async function enrichFlowDevice(device) {
  const id = device?.id || device?.hardware_id || device?.device_id;
  if (!id) return device;

  const config = resolveFlowConfig(device);
  if (config.channelId && config.apiKey && device?.fields?.flow_rate && device?.fields?.total_liters) {
    return device;
  }

  try {
    const typedDoc = await db.collection('evaraflow').doc(id).get();
    if (typedDoc.exists) {
      return { ...device, ...typedDoc.data() };
    }
  } catch (err) {
    logger.warn(`[flowStateService] Failed to self-enrich ${id}: ${err.message}`);
  }

  return device;
}

async function fetchLatestFeed(device, config = resolveFlowConfig(device)) {
  if (!config.channelId || !config.apiKey) {
    throw new Error(`[flowStateService] Missing ThingSpeak credentials for ${device?.id || 'unknown device'}`);
  }

  const url = new URL(`${THINGSPEAK_BASE}/channels/${config.channelId}/feeds/last.json`);
  url.searchParams.set('api_key', config.apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`ThingSpeak returned HTTP ${response.status}`);
  }

  const json = await response.json();
  return json && Object.keys(json).length > 0 ? json : null;
}

async function fetchFlowFeeds(device, { results = DEFAULT_RESULTS, days = null } = {}) {
  const config = resolveFlowConfig(device);

  if (!config.channelId || !config.apiKey) {
    throw new Error(`[flowStateService] Missing ThingSpeak credentials for ${device?.id || 'unknown device'}`);
  }

  const url = new URL(`${THINGSPEAK_BASE}/channels/${config.channelId}/feeds.json`);
  url.searchParams.set('api_key', config.apiKey);
  if (days) {
    url.searchParams.set('days', String(days));
  } else {
    url.searchParams.set('results', String(results));
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`ThingSpeak returned HTTP ${response.status}`);
  }

  const json = await response.json();
  return Array.isArray(json?.feeds) ? json.feeds : [];
}

function parseFeed(feed, config) {
  const timestampMs = parseTimestamp(feed?.created_at);
  const totalLiters = toNumber(feed?.[config.totalLitersField]);
  const flowRate = toNumber(feed?.[config.flowRateField]);

  return {
    timestampMs,
    timestamp: Number.isNaN(timestampMs) ? null : new Date(timestampMs).toISOString(),
    totalLiters,
    flowRate,
    raw: feed,
  };
}

function buildHistory(feeds, config) {
  const parsed = feeds
    .map(feed => parseFeed(feed, config))
    .filter(point => !Number.isNaN(point.timestampMs));

  return parsed.map((point, index) => {
    let flowRate = point.flowRate;

    if (flowRate === null && index > 0) {
      const previous = parsed[index - 1];
      if (previous && previous.totalLiters !== null && point.totalLiters !== null) {
        const deltaMinutes = (point.timestampMs - previous.timestampMs) / 60000;
        if (deltaMinutes > 0) {
          flowRate = Math.max(0, (point.totalLiters - previous.totalLiters) / deltaMinutes);
        }
      }
    }

    return {
      timestamp: point.timestamp,
      total_liters: point.totalLiters,
      volume: point.totalLiters,
      flow_rate: flowRate ?? 0,
      raw: point.raw,
      created_at: point.timestamp,
    };
  });
}

function buildOfflineState(deviceId, reason = 'No live flow data available') {
  const cached = _cache.get(deviceId);
  if (cached) {
    return {
      ...cached,
      online: false,
      reason,
    };
  }

  return {
    deviceId,
    online: false,
    lastUpdated: new Date().toISOString(),
    totalLiters: 0,
    flowRate: 0,
    history: [],
    telemetrySnapshot: {
      timestamp: new Date().toISOString(),
      total_liters: 0,
      flow_rate: 0,
      raw_data: null,
    },
    active_fields: ['total_liters', 'flow_rate'],
    reason,
  };
}

async function persistFlowState(device, state, latestFeed, config) {
  try {
    const registryRef = db.collection('devices').doc(device.id);
    const typedRef = db.collection('evaraflow').doc(device.id);
    const lastSeen = state.lastUpdated || new Date().toISOString();
    const onlineStatus = state.online ? 'ONLINE' : 'OFFLINE';
    const nowIso = new Date().toISOString();

    const updateObj = {
      last_seen: lastSeen,
      last_updated_at: lastSeen,
      last_online_at: state.online ? lastSeen : null,
      status: onlineStatus,
      online: state.online,
      online_status: state.online,
      total_liters: state.totalLiters,
      flow_rate: state.flowRate,
      fields: {
        total_liters: config.totalLitersField,
        flow_rate: config.flowRateField,
      },
      sensor_field_mapping: {
        [config.totalLitersField]: 'current_reading',
        [config.flowRateField]: 'flow_rate',
      },
      telemetry_snapshot: {
        timestamp: state.telemetrySnapshot.timestamp,
        total_liters: state.totalLiters,
        flow_rate: state.flowRate,
        raw_data: latestFeed ?? null,
      },
      telemetrySnapshot: {
        timestamp: state.telemetrySnapshot.timestamp,
        total_liters: state.totalLiters,
        flow_rate: state.flowRate,
        status: onlineStatus,
      },
      raw_data: latestFeed ?? null,
      lastTelemetryFetch: nowIso,
      last_telemetry_fetch: nowIso,
      updated_at: nowIso,
    };

    await Promise.all([
      registryRef.set(updateObj, { merge: true }),
      typedRef.set(updateObj, { merge: true }),
    ]);
  } catch (err) {
    logger.warn(`[flowStateService] Failed to persist flow state for ${device.id}: ${err.message}`);
  }
}

async function refreshFlowDeviceState(device, options = { light: false }) {
  const enrichedDevice = await enrichFlowDevice(device);
  const id = enrichedDevice?.id || enrichedDevice?.hardware_id || enrichedDevice?.device_id;
  if (!id) throw new Error('Flow device id missing');

  const config = resolveFlowConfig(enrichedDevice);

  if (!config.channelId || !config.apiKey) {
    return buildOfflineState(id, 'Missing ThingSpeak credentials');
  }

  try {
    let feeds = [];
    let latestFeed = null;

    if (options.light) {
      latestFeed = await fetchLatestFeed(enrichedDevice, config);
      if (latestFeed) feeds = [latestFeed];
    } else {
      feeds = await fetchFlowFeeds(enrichedDevice, { days: options.days, results: options.results || DEFAULT_RESULTS });
      latestFeed = feeds.length > 0 ? feeds[feeds.length - 1] : null;
    }

    if (!latestFeed) {
      return buildOfflineState(id, 'ThingSpeak returned no flow feeds');
    }

    const parsedLatest = parseFeed(latestFeed, config);
    const cached = _cache.get(id);
    let history = options.light && cached?.history ? [...cached.history] : buildHistory(feeds.length > 0 ? feeds : [latestFeed], config);

    if (options.light && cached?.history && history.length > 0) {
      const alreadyPresent = history.some(item => item.timestamp === parsedLatest.timestamp);
      if (!alreadyPresent) {
        const latestPoint = buildHistory([latestFeed], config)[0];
        history.push(latestPoint);
        if (history.length > 5000) history.shift();
      }
    }

    const latestMs = parseTimestamp(latestFeed.created_at);
    const isOnline = !Number.isNaN(latestMs) && (Date.now() - latestMs) <= OFFLINE_THRESHOLD_MS;
    const lastUpdated = Number.isNaN(latestMs) ? new Date().toISOString() : new Date(latestMs).toISOString();
    const lastPoint = history.length > 0 ? history[history.length - 1] : buildHistory([latestFeed], config)[0];

    const state = {
      deviceId: id,
      online: isOnline,
      lastUpdated,
      totalLiters: lastPoint?.total_liters ?? 0,
      flowRate: lastPoint?.flow_rate ?? 0,
      history,
      telemetrySnapshot: {
        timestamp: lastUpdated,
        total_liters: lastPoint?.total_liters ?? 0,
        flow_rate: lastPoint?.flow_rate ?? 0,
        raw_data: latestFeed,
        is_corrected: false,
        status: isOnline ? 'ONLINE' : 'OFFLINE',
      },
      tankBehavior: {
        waterState: 'STABLE',
        fillRateLpm: 0,
        drainRateLpm: 0,
        timeToEmpty: null,
        timeToFull: null,
        consumedTodayLitres: 0,
        thresholdsLearned: false,
        thresholdLower: null,
        thresholdUpper: null,
      },
      active_fields: ['total_liters', 'flow_rate'],
      fields: {
        total_liters: config.totalLitersField,
        flow_rate: config.flowRateField,
      },
      raw_data: latestFeed,
    };

    _cache.set(id, state);
    await persistFlowState(enrichedDevice, state, latestFeed, config);
    return state;
  } catch (err) {
    logger.error(`[flowStateService] Refresh failed for ${id}: ${err.message}`);
    return buildOfflineState(id, err.message);
  }
}

async function getFlowDeviceState(device, options = { light: false }) {
  const id = device?.id || device?.hardware_id || device?.device_id;
  if (!id) throw new Error('Flow device id missing');

  if (_cache.has(id) && options.light) {
    return _cache.get(id);
  }

  return refreshFlowDeviceState(device, options);
}

module.exports = {
  getFlowDeviceState,
  refreshFlowDeviceState,
  resolveFlowConfig,
  fetchLatestFeed,
  fetchFlowFeeds,
};