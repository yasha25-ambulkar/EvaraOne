/**
 * telemetryWorker.js
 *
 * Background polling loop — runs every 60 seconds.
 * For each registered tank device, calls refreshDeviceState()
 * which fetches from ThingSpeak and updates the in-memory cache.
 *
 * API calls then return instantly from cache.
 */

'use strict';

const { refreshDeviceState } = require('../services/deviceStateService');
const { refreshTDSDeviceState } = require('../services/tdsStateService');
const { refreshFlowDeviceState } = require('../services/flowStateService');
const { getNodeDetails } = require('../services/deviceLookupService');
const { db } = require("../config/firebase.js");
const logger = require("../utils/logger.js");

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15 * 1000; // 15 seconds (ThingSpeak minimum)
const STAGGER_DELAY_MS = 100;      // 100ms between each device fetch to prevent burst overload

// ─────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────

let _timer        = null;
let _devices      = [];   // list of Firestore device objects to poll
let _isRunning    = false;

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Loader to fetch ALL active devices from Firestore (all device types).
 * Excludes decommissioned and archived devices.
 */
async function getTankDevices() {
  try {
    const snapshot = await db.collection("devices")
      .where("status", "not-in", ["DECOMMISSIONED", "ARCHIVED"])
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('[telemetryWorker] Firestore fetch failed:', err.message);
    return [];
  }
}

/**
 * Start the polling loop.
 *
 * @param {Array<object>} devices - array of Firestore device documents
 * @param {Function}      getDevices - optional: async fn to re-fetch device
 *                                     list on each tick (handles new devices)
 */
function start(devices = [], getDevices = null) {
  if (_isRunning) {
    console.log('[telemetryWorker] Already running — ignoring duplicate start()');
    return;
  }

  _devices   = devices;
  _isRunning = true;

  // If no devices and no getter, use our default EvaraTank loader
  const effectiveGetDevices = getDevices || (devices.length === 0 ? getTankDevices : null);

  console.log(`[telemetryWorker] Started. Polling ${_devices.length} device(s) initially.`);

  // Run immediately on start
  _tick(effectiveGetDevices).then(() => {
    if (_isRunning) {
      _timer = setTimeout(() => _runLoop(effectiveGetDevices), POLL_INTERVAL_MS);
    }
  });
}

/**
 * Recursive loop wrapper to prevent overlapping ticks
 */
async function _runLoop(getDevices) {
  if (!_isRunning) return;
  await _tick(getDevices);
  if (_isRunning) {
    _timer = setTimeout(() => _runLoop(getDevices), POLL_INTERVAL_MS);
  }
}

/**
 * Stop the polling loop cleanly.
 */
function stop() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  _isRunning = false;
  _devices   = [];
  console.log('[telemetryWorker] Stopped.');
}

/**
 * Register a new device to be polled (e.g. after createNode).
 */
function addDevice(device) {
  const id = device.id || device.hardware_id;
  const exists = _devices.some(d => (d.id || d.hardware_id) === id);
  if (!exists) {
    _devices.push(device);
    console.log(`[telemetryWorker] Added device: ${id}`);
  }
}

/**
 * Remove a device from polling.
 */
function removeDevice(deviceId) {
  _devices = _devices.filter(d => (d.id || d.hardware_id) !== deviceId);
  console.log(`[telemetryWorker] Removed device: ${deviceId}`);
}

// ─────────────────────────────────────────────────────────────
// Internal: one polling tick
// ─────────────────────────────────────────────────────────────

async function _tick(getDevices) {
  // Optionally refresh device list from Firestore on each tick
  if (typeof getDevices === 'function') {
    try {
      _devices = await getDevices();
    } catch (err) {
      console.error('[telemetryWorker] Failed to refresh device list:', err.message);
    }
  }

  if (_devices.length === 0) {
    console.log('[telemetryWorker] No devices to poll.');
    return;
  }

  console.log(`[telemetryWorker] Tick — polling ${_devices.length} device(s)...`);

  // Poll devices with a small stagger to prevent API burst overload
  let ok = 0;
  let failed = 0;
  
  for (const device of _devices) {
    try {
      // Ensure we have enriched registry + typed metadata so services can
      // read ThingSpeak credentials stored in typed collections (e.g. evaraflow)
      let enriched = device;
      try {
        const details = await getNodeDetails(device.id || device.hardware_id || device.device_id);
        if (details) enriched = details;
      } catch (e) {
        // fall back to the registry-only document if metadata resolution fails
      }

      await _pollDevice(enriched);
      ok++;
    } catch (err) {
      failed++;
    }

    if (STAGGER_DELAY_MS > 0) {
      await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY_MS));
    }
  }

  console.log(`[telemetryWorker] Tick complete — ${ok} ok, ${failed} failed.`);
}

async function _pollDevice(device) {
  const id = device.id || device.hardware_id || '?';
  const type = (device.device_type || 'tank').toLowerCase();
  
  try {
    if (type === 'evaratds' || type === 'tds') {
      const state = await refreshTDSDeviceState(device);
      logger.info(`[telemetryWorker] TDS ${id} → ${state.tdsValue} ppm | ${state.temperature}°C | ${state.quality}`, {
        category: 'telemetry',
        deviceId: id,
        type: 'tds',
        ...state
      });
      
      // EMIT real-time update for Socket.io
      telemetryEvents.emit('device:update', {
        deviceId: id,
        device_id: id,
        node_id: id,
        ...state
      });
    } else if (type === 'evaraflow' || type === 'flow') {
      const state = await refreshFlowDeviceState(device, { light: true });
      logger.info(`[telemetryWorker] Flow ${id} → ${state.totalLiters}L | ${state.flowRate} L/min`, {
        category: 'telemetry',
        deviceId: id,
        type: 'flow',
        ...state
      });

      telemetryEvents.emit('device:update', {
        deviceId: id,
        device_id: id,
        node_id: id,
        ...state
      });
    } else if (type === 'evaraphase' || type === 'phase') {
      const { refreshPhaseDeviceState } = require('../services/phaseStateService');
      const state = await refreshPhaseDeviceState(device);
      logger.info(`[telemetryWorker] Phase ${id} → ${state.voltageValue}V | ${state.currentValue}A | ${state.powerValue}kW`, {
        category: 'telemetry',
        deviceId: id,
        type: 'phase',
        ...state
      });

      telemetryEvents.emit('device:update', {
        deviceId: id,
        device_id: id,
        node_id: id,
        ...state
      });
    } else {
      // Default to tank (now with light mode for 99% less overhead)
      const state = await refreshDeviceState(device, { light: true });
      logger.info(`[telemetryWorker] Tank ${id} → ${state.percentage?.toFixed(1)}% | ${state.volumeLitres}L | ${state.waterState}`, {
        category: 'telemetry',
        deviceId: id,
        type: 'tank',
        ...state
      });

      // EMIT real-time update for Socket.io
      telemetryEvents.emit('device:update', {
        deviceId: id,
        device_id: id,
        node_id: id,
        ...state
      });
    }
  } catch (err) {
    logger.error(`[telemetryWorker] ${id} (${type}) failed: ${err.message}`, err);
    // Don't rethrow, keep polling other devices
  }
}

// ─────────────────────────────────────────────────────────────
// Telemetry events emitter (satisfies server.js imports)
// ─────────────────────────────────────────────────────────────
const EventEmitter = require('events');
const telemetryEvents = new EventEmitter();

module.exports = {
  startWorker: start, // server.js calls startWorker()
  start,
  stop,
  addDevice,
  removeDevice,
  telemetryEvents,
};
