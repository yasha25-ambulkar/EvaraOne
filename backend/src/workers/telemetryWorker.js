/**
 * telemetryWorker.js
 *
 * Background polling loop for device telemetry.
 * Polls the active fleet on a bounded interval, refreshes in-memory state,
 * and emits device-specific realtime updates for Socket.io subscribers.
 */

"use strict";

const EventEmitter = require("events");
const { refreshDeviceState } = require("../services/deviceStateService");
const { refreshTDSDeviceState } = require("../services/tdsStateService");
const { refreshFlowDeviceState } = require("../services/flowStateService");
const { getNodeDetails } = require("../services/deviceLookupService");
const { db } = require("../config/firebase.js");
const logger = require("../utils/logger.js");

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = Number(
  process.env.TELEMETRY_POLL_INTERVAL_MS || 15 * 1000,
);
const MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env.TELEMETRY_WORKER_CONCURRENCY || 6),
);
const STAGGER_DELAY_MS = Math.max(
  0,
  Number(process.env.TELEMETRY_WORKER_BATCH_DELAY_MS || 100),
);
const DEVICE_LIST_REFRESH_MS = Math.max(
  POLL_INTERVAL_MS,
  Number(process.env.TELEMETRY_DEVICE_REFRESH_MS || 60 * 1000),
);
const DETAIL_CACHE_TTL_MS = Math.max(
  POLL_INTERVAL_MS,
  Number(process.env.TELEMETRY_DEVICE_DETAIL_CACHE_MS || 5 * 60 * 1000),
);

// ─────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────

let _timer = null;
let _devices = [];
let _isRunning = false;
let _lastDeviceRefreshAt = 0;
const _deviceDetailCache = new Map();

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveDeviceId(device) {
  return device?.id || device?.hardware_id || device?.device_id || null;
}

function buildDetailSignature(device) {
  return JSON.stringify({
    device_type: device?.device_type || device?.deviceType || null,
    thingspeak_channel_id:
      device?.thingspeak_channel_id ||
      device?.configuration?.thingspeak_channel_id ||
      null,
    thingspeak_read_api_key:
      device?.thingspeak_read_api_key ||
      device?.configuration?.thingspeak_read_api_key ||
      null,
    config_version:
      device?.configuration?.updated_at ||
      device?.updated_at ||
      device?.updatedAt ||
      device?.statusLastChecked ||
      null,
  });
}

function pruneDetailCache(activeIds) {
  for (const cachedId of _deviceDetailCache.keys()) {
    if (!activeIds.has(cachedId)) {
      _deviceDetailCache.delete(cachedId);
    }
  }
}

function deviceHasPollingConfig(device) {
  const config = device?.configuration ?? device?.customer_config ?? {};
  return Boolean(
    device?.thingspeak_channel_id ||
    config?.thingspeak_channel_id ||
    device?.thingspeak_read_api_key ||
    config?.thingspeak_read_api_key,
  );
}

async function getTankDevices() {
  try {
    const snapshot = await db
      .collection("devices")
      .where("status", "not-in", ["DECOMMISSIONED", "ARCHIVED"])
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    logger.error(
      `[telemetryWorker] Firestore fetch failed: ${err.message}`,
      err,
    );
    return [];
  }
}

async function refreshDeviceListIfNeeded(getDevices, { force = false } = {}) {
  if (typeof getDevices !== "function") return;

  const now = Date.now();
  const shouldRefresh =
    force ||
    _devices.length === 0 ||
    _lastDeviceRefreshAt === 0 ||
    now - _lastDeviceRefreshAt >= DEVICE_LIST_REFRESH_MS;

  if (!shouldRefresh) return;

  try {
    const freshDevices = await getDevices();
    if (Array.isArray(freshDevices)) {
      _devices = freshDevices;
      _lastDeviceRefreshAt = now;
      pruneDetailCache(
        new Set(freshDevices.map(resolveDeviceId).filter(Boolean)),
      );
    }
  } catch (err) {
    logger.error(
      `[telemetryWorker] Failed to refresh device list: ${err.message}`,
      err,
    );
  }
}

async function getEnrichedDeviceForPolling(device) {
  const id = resolveDeviceId(device);
  if (!id) return device;

  // If the registry document already contains the polling config we need,
  // skip the extra metadata lookup entirely.
  if (deviceHasPollingConfig(device)) {
    return device;
  }

  const signature = buildDetailSignature(device);
  const cached = _deviceDetailCache.get(id);
  if (
    cached &&
    cached.signature === signature &&
    cached.expiresAt > Date.now()
  ) {
    return cached.device;
  }

  try {
    const details = await getNodeDetails(id);
    const enriched = details || device;
    _deviceDetailCache.set(id, {
      signature,
      device: enriched,
      expiresAt: Date.now() + DETAIL_CACHE_TTL_MS,
    });
    return enriched;
  } catch (err) {
    logger.warn(`[telemetryWorker] Failed to enrich ${id}: ${err.message}`);
    return device;
  }
}

async function runWithConcurrency(items, worker, limit) {
  const concurrency = Math.max(1, Math.min(limit, items.length || 1));
  let nextIndex = 0;

  const runners = Array.from({ length: concurrency }, async () => {
    while (_isRunning) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      if (currentIndex >= concurrency && STAGGER_DELAY_MS > 0) {
        await sleep(STAGGER_DELAY_MS);
      }

      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

function start(devices = [], getDevices = null) {
  if (_isRunning) {
    logger.warn(
      "[telemetryWorker] Already running — ignoring duplicate start()",
    );
    return;
  }

  _devices = Array.isArray(devices) ? [...devices] : [];
  _isRunning = true;
  _lastDeviceRefreshAt = 0;

  const effectiveGetDevices =
    getDevices || (_devices.length === 0 ? getTankDevices : null);

  logger.info(
    `[telemetryWorker] Started. Polling ${_devices.length} device(s) initially with concurrency ${MAX_CONCURRENCY}.`,
  );

  _tick(effectiveGetDevices, { forceRefresh: true }).then(() => {
    if (_isRunning) {
      _timer = setTimeout(
        () => _runLoop(effectiveGetDevices),
        POLL_INTERVAL_MS,
      );
    }
  });
}

async function _runLoop(getDevices) {
  if (!_isRunning) return;
  await _tick(getDevices);
  if (_isRunning) {
    _timer = setTimeout(() => _runLoop(getDevices), POLL_INTERVAL_MS);
  }
}

function stop() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }

  _isRunning = false;
  _devices = [];
  _lastDeviceRefreshAt = 0;
  _deviceDetailCache.clear();
  logger.info("[telemetryWorker] Stopped.");
}

function addDevice(device) {
  const id = resolveDeviceId(device);
  if (!id) return;

  const exists = _devices.some((d) => resolveDeviceId(d) === id);
  if (!exists) {
    _devices.push(device);
    _deviceDetailCache.delete(id);
    logger.info(`[telemetryWorker] Added device: ${id}`);
  }
}

function removeDevice(deviceId) {
  _devices = _devices.filter((d) => resolveDeviceId(d) !== deviceId);
  _deviceDetailCache.delete(deviceId);
  logger.info(`[telemetryWorker] Removed device: ${deviceId}`);
}

// ─────────────────────────────────────────────────────────────
// Internal: one polling tick
// ─────────────────────────────────────────────────────────────

async function _tick(getDevices, { forceRefresh = false } = {}) {
  await refreshDeviceListIfNeeded(getDevices, { force: forceRefresh });

  if (_devices.length === 0) {
    logger.info("[telemetryWorker] No devices to poll.");
    return;
  }

  const startedAt = Date.now();
  let ok = 0;
  let failed = 0;

  logger.info(
    `[telemetryWorker] Tick — polling ${_devices.length} device(s) with concurrency ${Math.min(MAX_CONCURRENCY, _devices.length)}...`,
  );

  await runWithConcurrency(
    _devices,
    async (device) => {
      try {
        const enrichedDevice = await getEnrichedDeviceForPolling(device);
        const success = await _pollDevice(enrichedDevice);
        if (success) {
          ok += 1;
        } else {
          failed += 1;
        }
      } catch (err) {
        failed += 1;
        logger.error(
          `[telemetryWorker] Unexpected polling failure for ${resolveDeviceId(device) || "?"}: ${err.message}`,
          err,
        );
      }
    },
    MAX_CONCURRENCY,
  );

  logger.info(
    `[telemetryWorker] Tick complete — ${ok} ok, ${failed} failed in ${Date.now() - startedAt}ms.`,
  );
}

async function _pollDevice(device) {
  const id = resolveDeviceId(device) || "?";
  const type = (device.device_type || "tank").toLowerCase();

  try {
    if (type === "evaratds" || type === "tds") {
      const state = await refreshTDSDeviceState(device);
      logger.info(
        `[telemetryWorker] TDS ${id} → ${state.tdsValue} ppm | ${state.temperature}°C | ${state.quality}`,
        {
          category: "telemetry",
          deviceId: id,
          type: "tds",
          ...state,
        },
      );

      telemetryEvents.emit("device:update", {
        deviceId: id,
        device_id: id,
        node_id: id,
        ...state,
      });
      return true;
    }

    if (type === "evaraflow" || type === "flow") {
      const state = await refreshFlowDeviceState(device, { light: true });
      logger.info(
        `[telemetryWorker] Flow ${id} → ${state.totalLiters}L | ${state.flowRate} L/min`,
        {
          category: "telemetry",
          deviceId: id,
          type: "flow",
          ...state,
        },
      );

      telemetryEvents.emit("device:update", {
        deviceId: id,
        device_id: id,
        node_id: id,
        ...state,
      });
      return true;
    }

    if (type === "evaraphase" || type === "phase") {
      const {
        refreshPhaseDeviceState,
      } = require("../services/phaseStateService");
      const state = await refreshPhaseDeviceState(device);
      logger.info(
        `[telemetryWorker] Phase ${id} → ${state.voltageValue}V | ${state.currentValue}A | ${state.powerValue}kW`,
        {
          category: "telemetry",
          deviceId: id,
          type: "phase",
          ...state,
        },
      );

      telemetryEvents.emit("device:update", {
        deviceId: id,
        device_id: id,
        node_id: id,
        ...state,
      });
      return true;
    }

    const state = await refreshDeviceState(device, { light: true });
    logger.info(
      `[telemetryWorker] Tank ${id} → ${state.percentage?.toFixed(1)}% | ${state.volumeLitres}L | ${state.waterState}`,
      {
        category: "telemetry",
        deviceId: id,
        type: "tank",
        ...state,
      },
    );

    telemetryEvents.emit("device:update", {
      deviceId: id,
      device_id: id,
      node_id: id,
      ...state,
    });
    return true;
  } catch (err) {
    logger.error(
      `[telemetryWorker] ${id} (${type}) failed: ${err.message}`,
      err,
    );
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Telemetry events emitter (satisfies server.js imports)
// ─────────────────────────────────────────────────────────────

const telemetryEvents = new EventEmitter();

module.exports = {
  startWorker: start,
  start,
  stop,
  addDevice,
  removeDevice,
  telemetryEvents,
};
