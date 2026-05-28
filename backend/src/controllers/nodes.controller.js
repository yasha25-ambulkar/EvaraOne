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
const { db } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const logger = require("../utils/logger.js");

// ─────────────────────────────────────────────────────────────
// Helper: load device + get state
// ─────────────────────────────────────────────────────────────

async function loadState(hardwareId, options = {}) {
  const device = await getNodeDetails(hardwareId);
  if (!device) throw new Error(`Device not found: ${hardwareId}`);
  
  const type = (device.device_type || '').toLowerCase();
  
  // Use specialized state services based on device type
  if (type === 'evaratds' || type === 'tds') {
    const { getTDSDeviceState } = require('../services/tdsStateService');
    return { device, state: await getTDSDeviceState(device) };
  }

  if (type === 'evaraflow' || type === 'flow') {
    const { getFlowDeviceState } = require('../services/flowStateService');
    return { device, state: await getFlowDeviceState(device, options) };
  }

  if (type === 'evaraphase' || type === 'phase') {
    const { getPhaseDeviceState } = require('../services/phaseStateService');
    return { device, state: await getPhaseDeviceState(device, options) };
  }
  
  // Default to Tank state service
  return { device, state: await getDeviceState(device, options) };
}


// ── GET / ────────────────────────────────────────────────────────────────
exports.getNodes = async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === "superadmin";
        const customerId = req.query.customer_id || req.user.customer_id || req.user.uid;
        
        const nodesCacheKey = isSuperAdmin && !req.query.customer_id
            ? "nodes:all"
            : `nodes:user:${customerId}`;

        const cachedNodes = await cache.get(nodesCacheKey);
        if (cachedNodes && req.query.nocache !== 'true') return res.status(200).json(cachedNodes);


        let query = db.collection("devices");

        if (!isSuperAdmin) {
            // Regular users only see their own visible devices
            query = query
                .where("customer_id", "==", customerId)
                .where("isVisibleToCustomer", "==", true);
        } else if (req.query.customer_id) {
            // Superadmin filtering by customer
            query = query.where("customer_id", "==", req.query.customer_id);
        }

        const snapshot = await query.limit(200).get();
        
        // Batched Metadata Fetching
        const typedGroups = {};
        const registryDataMap = {};

        for (const doc of snapshot.docs) {
            const registry = doc.data();
            const type = registry.device_type;
            if (!type) continue;

            if (!typedGroups[type]) typedGroups[type] = [];
            typedGroups[type].push(doc.id);
            registryDataMap[doc.id] = registry;
        }

        const typeBatches = await Promise.all(
            Object.keys(typedGroups).map(async (type) => {
                const ids = typedGroups[type];
                const refs = ids.map(id => db.collection(type.toLowerCase()).doc(id));
                const metas = await db.getAll(...refs);
                // Don't filter out devices missing metadata — return registry info at minimum
                return metas.map(m => ({ 
                    id: m.id, 
                    meta: m.exists ? m.data() : {}, 
                    type 
                }));
            })
        );

        const devices = await Promise.all(typeBatches.flat().map(async (item) => {
            const { id, meta, type } = item;
            const registryData = registryDataMap[id];

            // Auto-inject analytics_template if missing
            let analyticsTemplate = registryData.analytics_template || meta.analytics_template;
            if (!analyticsTemplate) {
                const typeLower = type.toLowerCase();
                if (typeLower === "evaratank") analyticsTemplate = "EvaraTank";
                else if (typeLower === "evaradeep") analyticsTemplate = "EvaraDeep";
                else if (typeLower === "evaraflow") analyticsTemplate = "EvaraFlow";
                else if (typeLower === "evaratds") analyticsTemplate = "EvaraTDS";
                else if (typeLower === "evaraphase" || typeLower === "evaraops") analyticsTemplate = "EvaraPhase";
                else analyticsTemplate = "EvaraTank"; // Default
            }

            const deviceBase = {
                id,
                ...registryData,
                ...meta,
                analytics_template: analyticsTemplate
            };

            try {
                let state;
                const typeLower = type.toLowerCase();

                if (typeLower === "evaratds" || typeLower === "tds") {
                    const { getTDSDeviceState } = require('../services/tdsStateService');
                    state = await getTDSDeviceState(deviceBase);
                    
                    // Standardize TDS response for the dashboard loop
                    return {
                        ...deviceBase,
                        online_status: state.status === "Online",
                        lastUpdated: state.lastUpdated,
                        last_telemetry: state
                    };
                } else {
                    // Default Tank/Flow/Deep logic
                    state = await getDeviceState(deviceBase, { light: true });
                    
                    const safeUpdatedAt = deviceBase.updated_at?.toDate ? deviceBase.updated_at.toDate().toISOString() : deviceBase.updated_at;
                    const safeLastUpdated = deviceBase.lastUpdated?.toDate ? deviceBase.lastUpdated.toDate().toISOString() : deviceBase.lastUpdated;

                    return {
                        ...deviceBase,
                        updated_at: safeUpdatedAt,
                        lastUpdated: safeLastUpdated,
                        last_telemetry: state.telemetrySnapshot,
                        online_status: state.online
                    };
                }
            } catch (err) {
                logger.warn(`[NodesController] Failed to get state for ${id}:`, err.message);
                return deviceBase;
            }
        }));

        await cache.set(nodesCacheKey, devices, 5); // Increased to 5s to reduce burst load

        res.status(200).json(devices);
    } catch (error) {
        logger.error("[NodesController] getNodes error:", error.message);
        res.status(500).json({ error: "Failed to fetch nodes" });
    }
};

// ── GET /:id ─────────────────────────────────────────────────────────────
exports.getNodeById = async (req, res) => {
    try {
        const { device, state } = await loadState(req.params.id);
        if (!device) return res.status(404).json({ success: false, error: "Device not found" });
        
        const safeLastSeen = device.last_seen?.toDate ? device.last_seen.toDate().toISOString() : device.last_seen;

        return res.status(200).json({ 
          ...device, 
          id: device.id,
          last_seen: safeLastSeen,
          online_status: state.online 
        });
    } catch (err) {
        console.error('[getNodeById]', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /:id/telemetry ────────────────────────────────────────────────────
exports.getNodeTelemetry = async (req, res) => {
  try {
    const { device, state } = await loadState(req.params.id);
    const type = (device.device_type || '').toLowerCase();

    if (type === 'evaratds' || type === 'tds') {
      return res.status(200).json({
        success: true,
        deviceId: state.id,
        online: state.status === 'Online',
        status: state.status,
        lastUpdated: state.lastUpdated,
        tdsValue: state.tdsValue,
        temperature: state.temperature,
        quality: state.quality,
        waterQualityRating: state.waterQualityRating,
        timestamp: state.timestamp
      });
    }

    if (type === 'evaraphase' || type === 'phase') {
      return res.status(200).json({
        success: true,
        deviceId: state.id,
        online: state.status === 'Online' || state.online === true,
        status: state.status,
        lastUpdated: state.lastUpdated,
        voltageValue: state.voltageValue,
        currentValue: state.currentValue,
        powerValue: state.powerValue,
        frequencyValue: state.frequencyValue,
        powerFactor: state.powerFactor || 1.0,
        timestamp: state.timestamp,
        level_percentage: state.level_percentage,
        telemetrySnapshot: state.telemetrySnapshot
      });
    }

    const snap = state.telemetrySnapshot || {};
    return res.status(200).json({
      success:          true,
      deviceId:         state.deviceId,
      online:           state.online,
      online_status:    state.online,
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
    const range = req.query.range || '24h';
    const { device, state } = await loadState(req.params.id, { range });
    const type = (device.device_type || '').toLowerCase();

    if (type === 'evaratds' || type === 'tds') {
      const { getTDSHistory } = require('../services/tdsStateService');
      const history = await getTDSHistory({ id: state.id, ...device }, 1000);

      return res.status(200).json({
        success: true,
        deviceId: state.id,
        deviceName: device.label || device.device_name,
        online: state.status === 'Online',
        status: state.status,
        lastUpdated: state.lastUpdated,
        tdsValue: state.tdsValue,
        temperature: state.temperature,
        quality: state.quality,
        waterQualityRating: state.waterQualityRating,
        tdsHistory: history,
        alertsCount: 0
      });
    }

    if (type === 'evaraphase' || type === 'phase') {
      const { getPhaseHistory } = require('../services/phaseStateService');
      const history = await getPhaseHistory({ id: state.id, ...device }, 1000);

      return res.status(200).json({
        success: true,
        deviceId: state.id,
        deviceName: device.label || device.device_name,
        online: state.status === 'Online' || state.online === true,
        status: state.status,
        lastUpdated: state.lastUpdated,
        voltageValue: state.voltageValue,
        currentValue: state.currentValue,
        powerValue: state.powerValue,
        frequencyValue: state.frequencyValue,
        powerFactor: state.powerFactor || 1.0,
        history: history,
        active_fields: state.active_fields,
        alertsCount: 0
      });
    }

    return res.status(200).json({
      success:       true,
      deviceId:      state.deviceId,
      online:        state.online,
      online_status: state.online,
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
    const range = req.query.range ?? '24h';
    const { state } = await loadState(req.params.id, { range });
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
