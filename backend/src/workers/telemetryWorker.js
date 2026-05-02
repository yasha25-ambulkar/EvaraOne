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
const { db } = require("../config/firebase.js");

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds

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
 * Default getter to load all EvaraTank devices from Firestore.
 */
async function getTankDevices() {
  try {
    const snapshot = await db.collection("devices")
      .where("asset_type", "==", "EvaraTank")
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

  // Run immediately on start, then every interval
  _tick(effectiveGetDevices);
  _timer = setInterval(() => _tick(effectiveGetDevices), POLL_INTERVAL_MS);
}

/**
 * Stop the polling loop cleanly.
 */
function stop() {
  if (_timer) {
    clearInterval(_timer);
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

  // Poll all devices in parallel
  const results = await Promise.allSettled(
    _devices.map(device => _pollDevice(device))
  );

  // Log summary
  const ok      = results.filter(r => r.status === 'fulfilled').length;
  const failed  = results.filter(r => r.status === 'rejected').length;
  console.log(`[telemetryWorker] Tick complete — ${ok} ok, ${failed} failed.`);
}

async function _pollDevice(device) {
  const id = device.id || device.hardware_id || '?';
  try {
    const state = await refreshDeviceState(device);
    console.log(
      `[telemetryWorker] ${id} → ` +
      `${state.percentage?.toFixed(1)}% | ` +
      `${state.volumeLitres}L | ` +
      `${state.waterState}`
    );
  } catch (err) {
    console.error(`[telemetryWorker] ${id} failed:`, err.message);
    throw err;
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
