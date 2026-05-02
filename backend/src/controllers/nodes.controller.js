/**
 * nodes.controller.js
 *
 * API endpoints for EvaraTank dashboard.
 * Reads device config from Firestore, calls deviceStateService,
 * and returns the exact data shape the frontend expects.
 *
 * Endpoints:
 *   GET /api/v1/nodes/:id/telemetry
 *   GET /api/v1/nodes/:id/analytics
 *   GET /api/v1/nodes/:id/graph
 *   GET /api/v1/nodes/:id/graph-hybrid
 */

'use strict';

const { getDeviceState }  = require('../services/deviceStateService');
const { getNodeDetails }  = require('../services/deviceLookupService'); 

// ─────────────────────────────────────────────────────────────
// Helper: load device + get state
// ─────────────────────────────────────────────────────────────

async function loadState(hardwareId) {
  const device = await getNodeDetails(hardwareId);
  if (!device) throw new Error(`Device not found: ${hardwareId}`);
  return { device, state: await getDeviceState(device) };
}

// ── GET / ────────────────────────────────────────────────────────────────
exports.getNodes = async (req, res) => {
  return res.status(200).json([]);
};

// ── GET /:id ─────────────────────────────────────────────────────────────
exports.getNodeById = async (req, res) => {
  return res.status(200).json({ id: req.params.id, name: 'Tank', asset_type: 'EvaraTank' });
};

// ── GET /:id/telemetry ────────────────────────────────────────────────────
exports.getNodeTelemetry = async (req, res) => {
  try {
    const { state } = await loadState(req.params.id);
    const snap = state.telemetrySnapshot;

    return res.status(200).json({
      success:          true,
      deviceId:         state.deviceId,
      online:           state.online,
      lastUpdated:      state.lastUpdated,

      // Fields read by useDeviceAnalytics fallback chain:
      level_percentage: snap.level_percentage,
      total_liters:     snap.total_liters,
      flow_rate:        snap.flow_rate,
      timestamp:        snap.timestamp,

      // Metadata
      is_corrected:     snap.is_corrected,
      confidence:       snap.confidence,
      pattern:          snap.pattern,
    });
  } catch (err) {
    console.error('[getNodeTelemetry]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET /:id/analytics ────────────────────────────────────────────────────
exports.getNodeAnalytics = async (req, res) => {
  try {
    const { state } = await loadState(req.params.id);

    return res.status(200).json({
      success:       true,
      deviceId:      state.deviceId,
      online:        state.online,
      lastUpdated:   state.lastUpdated,

      // ── What useDeviceAnalytics reads ──────────────────────
      history:       state.history,          // [{timestamp, level, volume, flow_rate, distance}]
      tankBehavior:  state.tankBehavior,     // useWaterAnalytics reads this directly
      predictive:    null,                   // not implemented
      active_fields: state.active_fields,

      // ── Convenience top-level fields ───────────────────────
      percentage:           state.percentage,
      volume:               state.volumeLitres,
      waterLevelCm:         state.waterLevelCm,
      totalCapacityLitres:  state.totalCapacityLitres,
      waterState:           state.waterState,
      rateLpm:              state.rateLpm,
    });
  } catch (err) {
    console.error('[getNodeAnalytics]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET /:id/graph ────────────────────────────────────────────────────────
exports.getNodeGraphData = async (req, res) => {
  try {
    const { state } = await loadState(req.params.id);
    return res.status(200).json({
      success:     true,
      deviceId:    state.deviceId,
      online:      state.online,
      feeds:       state.history,
    });
  } catch (err) {
    console.error('[getNodeGraphData]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET /:id/graph-hybrid ─────────────────────────────────────────────────
exports.getNodeGraphDataHybrid = async (req, res) => {
  try {
    const { state } = await loadState(req.params.id);

    const range = req.query.range ?? '24h';
    let dataPoints = state.history;

    if (range === '1h') {
      const cutoff = Date.now() - (60 * 60 * 1000);
      dataPoints = state.history.filter(p => new Date(p.timestamp).getTime() >= cutoff);
    } else if (range === '6h') {
      const cutoff = Date.now() - (6 * 60 * 60 * 1000);
      dataPoints = state.history.filter(p => new Date(p.timestamp).getTime() >= cutoff);
    } else if (range === '24h') {
      const cutoff = Date.now() - (24 * 60 * 60 * 1000);
      dataPoints = state.history.filter(p => new Date(p.timestamp).getTime() >= cutoff);
    }

    return res.status(200).json({
      success:     true,
      deviceId:    state.deviceId,
      online:      state.online,
      range,
      dataPoints,
    });
  } catch (err) {
    console.error('[getNodeGraphDataHybrid]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};
