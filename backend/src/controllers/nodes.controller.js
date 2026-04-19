const { db, admin } = require("../config/firebase.js");
const { Filter } = require("firebase-admin/firestore");
const { startWorker } = require("../workers/telemetryWorker.js");
const { checkOwnership } = require("../middleware/auth.middleware.js");
const axios = require("axios");
const telemetryCache = require("../services/cacheService.js");
const cache = require("../config/cache.js");
const deviceState = require("../services/deviceStateService.js");
const {
    fetchSixHourData,
    fetchLatestData,
    applyLightSmoothing,
    calculateMetrics,
    getLatestFeed
} = require("../services/thingspeakService.js");
const {
    analyzeWaterTank,
} = require("../services/waterAnalyticsEngine.js");

const normalizeThingSpeakTimestamp = (ts) => {
    if (!ts) return null;
    if (typeof ts !== 'string') return ts;
    // ThingSpeak returns timestamps like "2026-03-18 14:50:10" (no timezone).
    // Treat those as UTC so they display correctly in the UI.
    if (ts.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(ts)) return ts;
    return `${ts}Z`;
};

/**
 * Helper to resolve device by document ID OR device_id/node_id
 */
async function resolveDevice(id) {
    if (!id) return null;

    // 1. Try direct document lookup
    const directDoc = await db.collection("devices").doc(id).get();
    if (directDoc.exists) return directDoc;

    // 2. Query by device_id field (human-readable hardware ID)
    const q1 = await db.collection("devices").where("device_id", "==", id).limit(1).get();
    if (!q1.empty) return q1.docs[0];

    // 3. Fallback to node_id
    const q2 = await db.collection("devices").where("node_id", "==", id).limit(1).get();
    if (!q2.empty) return q2.docs[0];

    return null;
}

/**
 * Persist ThingSpeak timestamp back to Firestore to keep Dashboard/Map synchronized
 */
async function syncNodeStatus(id, type, lastSeen, additionalData = {}) {
    if (!lastSeen) return;
    try {
        const typeLower = type.toLowerCase();
        const status = deviceState.calculateDeviceStatus(lastSeen);

        const updatePayload = {
            status,
            last_seen: lastSeen,
            last_updated_at: lastSeen,
            last_online_at: admin.firestore.FieldValue.serverTimestamp(),
            last_telemetry_fetch: new Date().toISOString(),
            telemetry_snapshot: {
                ...additionalData,
                timestamp: lastSeen,
                status
            }
        };

        await db.collection(typeLower).doc(id).update(updatePayload);
    } catch (err) {
        console.error(`Status sync failed for ${id}:`, err);
    }
}

/**
 * Helper: build simple event timeline from history
 */
function buildEventTimeline(history, currentState) {
  const events = [];
  const colorMap = { CONSUMPTION: '#FF3B30', REFILL: '#34C759', STABLE: '#8E8E93' };

  // Add the current state as the most recent event
  if (history.length > 0 && currentState !== 'LEARNING') {
    const last = history[history.length - 1];
    const d = new Date(last.timestamp);
    if (!isNaN(d.getTime())) {
      events.push({
        time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        label: currentState,
        color: colorMap[currentState] || '#8E8E93'
      });
    }
  }

  return events.slice(-5);
}

exports.getNodes = async (req, res) => {
    try {
        // Read optional customerId filter from query string (used by CustomerDetails page)
        const filterCustomerId = req.query.customerId || null;

        // Cache key must include customerId so different customer pages never share a cache entry
        const nodesCacheKey = req.user.role === "superadmin"
            ? `user:admin:devices${filterCustomerId ? `:${filterCustomerId}` : ""}`
            : `user:${req.user.uid}:devices`;

        const cachedNodes = await cache.get(nodesCacheKey);
        if (cachedNodes) {
            return res.status(200).json(cachedNodes);
        }

        // Cache zones and communities maps (15 min TTL)
        let zoneMap = await cache.get("zone_map");
        if (!zoneMap) {
            const zonesSnap = await db.collection("zones").get();
            zoneMap = Object.fromEntries(zonesSnap.docs.map(doc => [doc.id, doc.data().zoneName || doc.data().name]));
            await cache.set("zone_map", zoneMap, 900);
        }

        let query = db.collection("devices");

        if (filterCustomerId) {
            // Filter by the provided customer ID
            query = query.where("customer_id", "==", filterCustomerId);
            
            // Only apply visibility restriction if NOT a Superadmin
            if (req.user.role !== "superadmin") {
                query = query.where("isVisibleToCustomer", "!=", false);
            }
        } else if (req.user.role !== "superadmin") {
            // Customer viewing their own devices — always enforce visibility
            query = query
                .where("customer_id", "==", req.user.customer_id)
                .where("isVisibleToCustomer", "!=", false);
        }

        const snapshot = await query.get();

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

        const nodes = [];

        // db.getAll(...refs) uses the spread operator which hits Node.js / Firestore argument-count
        // limits (~500) when a customer has many devices of the same type.
        // This helper splits refs into chunks of 500 and merges results, supporting unlimited devices.
        const chunkGetAll = async (refs) => {
            const CHUNK_SIZE = 500;
            const results = [];
            for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
                const chunk = refs.slice(i, i + CHUNK_SIZE);
                const docs = await db.getAll(...chunk);
                results.push(...docs);
            }
            return results;
        };

        const typeBatches = await Promise.all(
            Object.keys(typedGroups).map(async (type) => {
                const ids = typedGroups[type];
                const refs = ids.map(id => db.collection(type.toLowerCase()).doc(id));
                const metas = await chunkGetAll(refs);
                return metas.map(m => m.exists ? { id: m.id, meta: m.data(), type } : null).filter(Boolean);
            })
        );

        for (const batch of typeBatches) {
            for (const item of batch) {
                const { id, meta, type } = item;

                // Ownership check only for non-superadmin without an explicit customerId filter
                if (req.user.role !== "superadmin" && !filterCustomerId) {
                    if (meta.customer_id !== req.user.customer_id) continue;
                }

                const lastSeen = meta.telemetry_snapshot?.timestamp || meta.last_updated_at || meta.lastUpdatedAt || meta.last_seen || meta.lastUpdated || null;
                const dynamicStatus = deviceState.calculateDeviceStatus(lastSeen);

                // Strip sensitive keys
                const { thingspeak_read_api_key, ...safeMeta } = meta;

                // Calculate level_percentage for tank devices
                let levelPercentage = null;
                const isTankType = type.toLowerCase().includes("tank") || type.toLowerCase().includes("evara");
                
                if (isTankType && meta.last_value !== undefined && meta.last_value !== null) {
                    // Get tank depth from configuration
                    const depth = meta.configuration?.depth || 
                                 meta.configuration?.total_depth || 
                                 meta.tank_depth || 
                                 meta.depth || 
                                 1.2; // Default fallback
                    
                    // last_value is raw distance in cm, convert to meters and calculate water height
                    const rawDistanceCm = parseFloat(meta.last_value);
                    if (!isNaN(rawDistanceCm) && depth > 0) {
                        const distanceM = rawDistanceCm / 100;
                        const validDistance = Math.min(distanceM, depth);
                        const waterHeightM = Math.max(0, depth - validDistance);
                        levelPercentage = Math.min(100, (waterHeightM / depth) * 100);
                    }
                }

                const nodeData = {
                    id,
                    ...registryDataMap[id],
                    ...safeMeta,
                    status: dynamicStatus,
                    last_seen: lastSeen,
                    last_updated_at: meta.last_updated_at || lastSeen,
                    last_value: meta.last_value ?? null,
                    last_online_at: meta.last_online_at || lastSeen,
                    zone_name: zoneMap[meta.zone_id] || null
                };

                // Add calculated level_percentage for tanks
                if (isTankType && levelPercentage !== null) {
                    nodeData.level_percentage = levelPercentage;
                    // Also update telemetry_snapshot to include level_percentage for frontend
                    nodeData.telemetry_snapshot = {
                        ...(nodeData.telemetry_snapshot || {}),
                        level_percentage: levelPercentage,
                        timestamp: lastSeen,
                        status: dynamicStatus
                    };
                }

                if (type === 'evaratds') {
                    nodeData.last_telemetry = {
                        tdsValue: meta.tdsValue || 0,
                        tds_value: meta.tdsValue || 0,
                        waterQualityRating: meta.waterQualityRating || 'Unknown',
                        temperature: meta.temperature || 0,
                        timestamp: meta.lastUpdated || meta.updated_at || null
                    };
                }

                nodes.push(nodeData);
            }
        }

        // Cache the result for 10 seconds (balanced for real-time updates without overload)
        await cache.set(nodesCacheKey, nodes, 10);
        res.status(200).json(nodes);
    } catch (error) {
        console.error(`[NodesController] Error in getNodes:`, error);
        res.status(500).json({ error: "Failed to fetch nodes", details: error.message });
    }
};



exports.getNodeById = async (req, res) => {
    try {
        const doc = await resolveDevice(req.params.id);
        if (!doc || !doc.exists) return res.status(404).json({ error: "Node not found" });

        const registry = doc.data();
        const metaDoc = await db.collection(registry.device_type.toLowerCase()).doc(doc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata missing" });

        if (req.user.role !== "superadmin") {
            const isOwner = await checkOwnership(req.user.customer_id || req.user.uid, doc.id, req.user.role, req.user.community_id);
            if (!isOwner) return res.status(403).json({ error: "Unauthorized access" });
        }

        const { thingspeak_read_api_key, ...safeMeta } = metaDoc.data();
        const result = { id: doc.id, ...registry, ...safeMeta };
        await cache.set(`device:${doc.id}:metadata`, result, 3600);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch node" });
    }
};

exports.getNodeTelemetry = async (req, res) => {
    try {
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) return res.status(404).json({ error: "Device not found" });

        const type = (deviceDoc.data().device_type || "").toLowerCase();
        if (!type) return res.status(400).json({ error: "Device type not specified" });

        const metaDoc = await db.collection(type).doc(deviceDoc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });

        if (req.user.role !== "superadmin") {
            const isOwner = await checkOwnership(req.user.customer_id || req.user.uid, deviceDoc.id, req.user.role, req.user.community_id);
            if (!isOwner) return res.status(403).json({ error: "Unauthorized access" });
        }

        const metadata = metaDoc.data();
        const channelId = metadata.thingspeak_channel_id?.trim();
        const apiKey = metadata.thingspeak_read_api_key?.trim();
        const fieldMapping = metadata.sensor_field_mapping || {};

        // Define cacheKey before use
        const cacheKey = `telemetry_${deviceDoc.id}`;

        const depth = metadata.configuration?.depth || metadata.configuration?.total_depth || metadata.tank_size || 1.2;
        const capacity = metadata.tank_size || 0;

        const storedLastSeen = metadata.last_updated_at || metadata.last_seen || null;
        const storedLastValue = metadata.last_value ?? null;
        const storedStatus = metadata.status || "OFFLINE";

        // ── FLOW DEVICE PATH ───────────────────────────────────────────────────
        if (["evaraflow", "flow", "flow_meter"].includes(type)) {
            const flowKeys = ['flowField', 'flow_rate', 'flow_rate_field'];
            const totalKeys = ['volumeField', 'current_reading', 'total_reading', 'meter_reading_field'];

            const flowRateFieldKey =
                flowKeys.reduce((acc, k) => acc || fieldMapping[k] || metadata[k], null) ||
                Object.keys(fieldMapping).find(k => flowKeys.includes(fieldMapping[k])) ||
                "field4";

            const totalReadingFieldKey =
                totalKeys.reduce((acc, k) => acc || fieldMapping[k] || metadata[k], null) ||
                Object.keys(fieldMapping).find(k => totalKeys.includes(fieldMapping[k])) ||
                "field5";

            if (!channelId || !apiKey) {
                return res.status(200).json({
                    deviceId: deviceDoc.id,
                    status: storedStatus,
                    timestamp: storedLastSeen,
                    flow_rate: null,
                    total_usage: null,
                    field_mapping: { flow_rate_field: flowRateFieldKey, total_field: totalReadingFieldKey }
                });
            }

            const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1`;
            console.log(`[ThingSpeak] Fetching: ${url}`);

            try {
                const response = await axios.get(url, { timeout: 8000 });
                const feeds = response.data?.feeds || [];
                console.log(`[ThingSpeak] Response status 200, feeds: ${feeds.length}`);

                if (!feeds || feeds.length === 0) {
                    return res.status(200).json({
                        deviceId: deviceDoc.id,
                        status: "NO_DATA",
                        timestamp: storedLastSeen,
                        flow_rate: null,
                        total_usage: null,
                        field_mapping: { flow_rate_field: flowRateFieldKey, total_field: totalReadingFieldKey }
                    });
                }

                const latestFeed = feeds[feeds.length - 1];
                const rawFlowRate = parseFloat(latestFeed[flowRateFieldKey]);
                const rawTotal = parseFloat(latestFeed[totalReadingFieldKey]);
                const flowRate = isNaN(rawFlowRate) ? null : rawFlowRate;
                const totalUsage = isNaN(rawTotal) ? null : rawTotal;

                console.log(`[ThingSpeak] totalUsage=${totalUsage} flowRate=${flowRate} (fields: total=${totalReadingFieldKey}, flow=${flowRateFieldKey})`);

                const feedTimestamp = latestFeed.created_at;
                const status = deviceState.calculateDeviceStatus(feedTimestamp);

                // Persist to DB async (non-blocking)
                db.collection(type).doc(deviceDoc.id).update({
                    last_updated_at: feedTimestamp,
                    status,
                    last_telemetry_fetch: new Date().toISOString()
                }).catch(() => null);

                return res.status(200).json({
                    deviceId: deviceDoc.id,
                    status,
                    timestamp: normalizeThingSpeakTimestamp(feedTimestamp),
                    last_updated_at: normalizeThingSpeakTimestamp(feedTimestamp),
                    flow_rate: flowRate,
                    total_usage: totalUsage,
                    field_mapping: { flow_rate_field: flowRateFieldKey, total_field: totalReadingFieldKey },
                    raw_data: latestFeed
                });
            } catch (err) {
                console.error(`[ThingSpeak] Fetch error for device ${deviceDoc.id}:`, err.message);
                return res.status(200).json({
                    deviceId: deviceDoc.id,
                    status: "ERROR",
                    timestamp: storedLastSeen,
                    flow_rate: null,
                    total_usage: null,
                    error: "ThingSpeak fetch failed"
                });
            }
        }

        // ── TDS DEVICE PATH ───────────────────────────────────────────────────
        if (["evaratds", "tds"].includes(type)) {
            const tdsKeys = ['tdsField', 'tds_value', 'tdsValue'];
            const tempKeys = ['tempField', 'temperature', 'temperature_field'];
            
            const tdsFieldKey = 
                tdsKeys.reduce((acc, k) => acc || fieldMapping[k] || metadata[k], null) ||
                Object.keys(fieldMapping).find(k => tdsKeys.includes(fieldMapping[k])) ||
                "field1";
            
            const tempFieldKey = 
                tempKeys.reduce((acc, k) => acc || fieldMapping[k] || metadata[k], null) || 
                Object.keys(fieldMapping).find(k => tempKeys.includes(fieldMapping[k])) || 
                "field2";

            if (!channelId || !apiKey) {
                return res.status(200).json({
                    deviceId: deviceDoc.id,
                    status: storedStatus,
                    timestamp: storedLastSeen,
                    tds_value: metadata.tdsValue ?? null,
                    temperature: metadata.temperature ?? null,
                    water_quality: metadata.waterQualityRating ?? "Good"
                });
            }

            const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1`;
            try {
                const response = await axios.get(url, { timeout: 8000 });
                const feeds = response.data?.feeds || [];
                
                if (!feeds || feeds.length === 0) {
                    return res.status(200).json({
                        deviceId: deviceDoc.id,
                        status: "NO_DATA",
                        timestamp: storedLastSeen,
                        tds_value: metadata.tdsValue ?? null,
                        temperature: metadata.temperature ?? null,
                        water_quality: metadata.waterQualityRating ?? "Good"
                    });
                }

                const latestFeed = feeds[feeds.length - 1];
                const tdsValue = parseFloat(latestFeed[tdsFieldKey]) || 0;
                const temperature = parseFloat(latestFeed[tempFieldKey]) || 0;
                const feedTimestamp = latestFeed.created_at;
                const status = deviceState.calculateDeviceStatus(feedTimestamp);

                // Water quality calculation (simple logic for now)
                let quality = "Good";
                if (tdsValue > 1000) quality = "Critical";
                else if (tdsValue > 500) quality = "Acceptable";

                // Persist async
                db.collection(type).doc(deviceDoc.id).update({
                    tdsValue,
                    temperature,
                    waterQualityRating: quality,
                    last_updated_at: feedTimestamp,
                    status,
                    last_telemetry_fetch: new Date().toISOString()
                }).catch(() => null);

                return res.status(200).json({
                    deviceId: deviceDoc.id,
                    status,
                    timestamp: normalizeThingSpeakTimestamp(feedTimestamp),
                    tds_value: tdsValue,
                    temperature: temperature,
                    water_quality: quality,
                    raw_data: latestFeed
                });
            } catch (err) {
                return res.status(200).json({
                    deviceId: deviceDoc.id,
                    status: "ERROR",
                    timestamp: storedLastSeen,
                    tds_value: metadata.tdsValue ?? null,
                    temperature: metadata.temperature ?? null,
                    water_quality: metadata.waterQualityRating ?? "Good"
                });
            }
        }

        // ── TANK / DEEP WELL DEVICE PATH ───────────────────────────────────────
        const computeTelemetry = (distance, seenAt, status) => {
            const validDistance = Math.min(distance / 100, depth);
            const waterHeight = Math.max(0, depth - validDistance);
            const levelPercent = Math.min(100, (waterHeight / depth) * 100);
            const volume = (capacity * levelPercent) / 100;
            const normalizedSeen = normalizeThingSpeakTimestamp(seenAt);

            return {
                deviceId: deviceDoc.id,
                distance,
                level_percentage: levelPercent,
                volume,
                last_seen: normalizedSeen,
                last_updated_at: normalizedSeen,
                last_value: distance,
                status: status || "OFFLINE",
                raw_data: null
            };
        };

        const baseTelemetry = computeTelemetry(storedLastValue ?? 0, storedLastSeen, storedStatus);
        if (storedLastValue !== null) {
            baseTelemetry.raw_data = metadata.raw_data || null;
        }

        if (!channelId || !apiKey) {
            return res.status(200).json(baseTelemetry);
        }

        const freshnessMs = storedLastSeen ? (Date.now() - new Date(storedLastSeen).getTime()) : Infinity;
        const shouldFetch = freshnessMs > 30 * 1000;

        if (!shouldFetch) {
            return res.status(200).json(baseTelemetry);
        }

        try {
            // Resolve the field key from sensor_field_mapping for tank/deep
            const sensorFieldKey = fieldMapping.levelField ||
                Object.keys(fieldMapping).find(k =>
                    fieldMapping[k] === "water_level_raw_sensor_reading" ||
                    fieldMapping[k] === "water_level_in_cm"
                ) || metadata.water_level_field || metadata.fieldKey || "field1";

            const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1`;
            console.log(`[ThingSpeak] Fetching: ${url}`);
            const response = await axios.get(url, { timeout: 5000 });
            const feeds = response.data?.feeds || [];
            console.log(`[ThingSpeak] Response status 200, feeds: ${feeds.length}`);

            if (!feeds || feeds.length === 0) {
                return res.status(200).json(baseTelemetry);
            }

            const lastFeed = feeds[0];
            const distance = parseFloat(lastFeed[sensorFieldKey]) || 0;
            const feedTimestamp = lastFeed.created_at;
            console.log(`[ThingSpeak] distance=${distance} (field=${sensorFieldKey})`);

            const lastStoredTimestamp = metadata.last_updated_at || metadata.last_seen || null;
            if (lastStoredTimestamp && feedTimestamp <= lastStoredTimestamp) {
                return res.status(200).json(baseTelemetry);
            }

            const status = deviceState.calculateDeviceStatus(feedTimestamp);
            const result = computeTelemetry(distance, feedTimestamp, status);
            result.raw_data = lastFeed;

            // Calculate and include level_percentage for consistency
            const updatePayload = {
                last_value: distance,
                last_updated_at: feedTimestamp,
                status: result.status,
                raw_data: lastFeed,
                last_telemetry_fetch: new Date().toISOString(),
                level_percentage: result.level_percentage // Include calculated percentage
            };

            await db.collection(type).doc(deviceDoc.id).update(updatePayload).catch(() => null);

            // Sync status with level_percentage in telemetry_snapshot
            syncNodeStatus(deviceDoc.id, type, feedTimestamp, {
                level_percentage: result.level_percentage,
                distance: distance
            }).catch(err => console.error("Sync error:", err));

            telemetryCache.set(cacheKey, result);
            return res.status(200).json(result);
        } catch (err) {
            return res.status(200).json(baseTelemetry);
        }
    } catch (error) {
        console.error("Telemetry error:", error);
        res.status(500).json({ error: "Telemetry fetch failure" });
    }
};


exports.getNodeGraphData = async (req, res) => {
    try {
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) return res.status(404).json({ error: "Device not found" });

        const type = (deviceDoc.data().device_type || "").toLowerCase();
        if (!type) return res.status(400).json({ error: "Device type not specified" });

        const metaDoc = await db.collection(type).doc(deviceDoc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });

        if (req.user.role !== "superadmin") {
            const isOwner = await checkOwnership(req.user.customer_id || req.user.uid, deviceDoc.id, req.user.role, req.user.community_id);
            if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
        }

        const metadata = metaDoc.data();
        const channelId = metadata.thingspeak_channel_id?.trim();
        const apiKey = metadata.thingspeak_read_api_key?.trim();
        const { incremental = false, lastTimestamp } = req.query;

        if (!channelId || !apiKey) {
            return res.status(200).json({
                data: [],
                metrics: {
                    currentLevel: null,
                    volume: null,
                    fillRate: null,
                    consumption: null,
                    status: 'OFFLINE'
                }
            });
        }

        try {
            if (incremental === 'true' && lastTimestamp) {
                const latestPoint = await fetchLatestData(channelId, apiKey, lastTimestamp);

                if (!latestPoint) {
                    return res.status(200).json({
                        data: [],
                        lastTimestamp: lastTimestamp,
                        hasNewData: false,
                        metrics: null
                    });
                }

                return res.status(200).json({
                    data: [latestPoint],
                    lastTimestamp: latestPoint.timestamp,
                    hasNewData: true,
                    metrics: null
                });
            } else {
                const fullData = await fetchSixHourData(channelId, apiKey);

                if (!fullData || fullData.length === 0) {
                    return res.status(200).json({
                        data: [],
                        lastTimestamp: null,
                        hasNewData: false,
                        metrics: {
                            currentLevel: null,
                            volume: null,
                            fillRate: null,
                            consumption: null,
                            status: 'OFFLINE'
                        }
                    });
                }

                const smoothedData = applyLightSmoothing(fullData);
                const metrics = calculateMetrics(smoothedData);

                return res.status(200).json({
                    data: smoothedData,
                    lastTimestamp: smoothedData.length > 0 ? smoothedData[smoothedData.length - 1].timestamp : null,
                    hasNewData: smoothedData.length > 0,
                    metrics: metrics
                });
            }
        } catch (err) {
            return res.status(200).json({
                data: [],
                lastTimestamp: lastTimestamp || null,
                hasNewData: false,
                metrics: {
                    currentLevel: null,
                    volume: null,
                    fillRate: null,
                    consumption: null,
                    status: 'OFFLINE'
                }
            });
        }
    } catch (error) {
        console.error("Graph data error:", error);
        res.status(500).json({ error: "Graph data fetch failure" });
    }
};

exports.getNodeAnalytics = async (req, res) => {
  try {
    const deviceDoc = await resolveDevice(req.params.id);
    if (!deviceDoc || !deviceDoc.exists)
      return res.status(404).json({ error: "Device not found" });

    const type = (deviceDoc.data().device_type || "").toLowerCase();
    if (!type) return res.status(400).json({ error: "Device type not specified" });

    const metaDoc = await db.collection(type).doc(deviceDoc.id).get();
    if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });

    const isOwner = await checkOwnership(
      req.user.customer_id || req.user.uid,
      deviceDoc.id,
      req.user.role,
      req.user.community_id
    );
    if (!isOwner) return res.status(403).json({ error: "Unauthorized" });

    const metadata = metaDoc.data();
    const channelId = metadata.thingspeak_channel_id?.trim();
    const apiKey = metadata.thingspeak_read_api_key?.trim();
    const fieldMapping = metadata.sensor_field_mapping || {};
    const depth = metadata.configuration?.depth || metadata.configuration?.total_depth || metadata.tank_size || 1.2;
    const capacity = metadata.tank_size || 1000;

    const { range, startDate, endDate } = req.query;

    if (!channelId || !apiKey)
      return res.status(400).json({ error: "Telemetry configuration missing" });

    // ── Cache ──────────────────────────────────────────────────────────────
    const analyticsCacheKey = `analytics_${deviceDoc.id}_${range || '24H'}_${startDate || ''}_${endDate || ''}`;
    const cachedAnalytics = await cache.get(analyticsCacheKey);
    if (cachedAnalytics) {
      console.log(`[NodesController] Serving cached analytics for ${deviceDoc.id}`);
      return res.status(200).json(cachedAnalytics);
    }

    // ── Build Dynamic ThingSpeak URL ──────────────────────────────────────
    let thingspeakUrl;
    if (range === '1W') {
      thingspeakUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&days=7&results=8000`;
    } else if (range === '1M') {
      thingspeakUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&days=31&results=8000`;
    } else if (startDate && endDate) {
      thingspeakUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&start=${startDate}&end=${endDate}&results=8000`;
    } else {
      // default 24H - fetching 480 points to cover the last 8 hours (at 1-min intervals)
      thingspeakUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=480`;
    }

    const response = await axios.get(thingspeakUrl);
    const feeds = response.data.feeds || [];

    if (feeds.length === 0) {
      return res.status(200).json({
        node_id: req.params.id,
        status: "NO_DATA",
        history: [],
        tankBehavior: null,
      });
    }

    // ── Resolve field key ──────────────────────────────────────────────────
    const sampleFeed = feeds[0] || {};
    const definedField =
      metadata.secondary_field || metadata.water_level_field ||
      metadata.fieldKey || metadata.configuration?.water_level_field ||
      metadata.configuration?.fieldKey;
    const fieldKey =
      fieldMapping.levelField || definedField ||
      Object.keys(fieldMapping).find(k => fieldMapping[k] && fieldMapping[k].includes("water_level")) ||
      (sampleFeed.field1 !== undefined ? "field1" : "field2");

    // ── FLOW METER path (unchanged) ────────────────────────────────────────
    if (["evaraflow", "flow", "flow_meter"].includes(type)) {
      const flowKeys = ['flowField', 'flow_rate', 'flow_rate_field'];
      const totalKeys = ['volumeField', 'current_reading', 'total_reading', 'meter_reading_field'];

      let flowRateFieldKey =
        deviceDoc.data().flow_rate_field ||
        Object.keys(fieldMapping).find(k => flowKeys.includes(fieldMapping[k])) ||
        "field4";

      let totalReadingFieldKey =
        deviceDoc.data().meter_reading_field ||
        Object.keys(fieldMapping).find(k => totalKeys.includes(fieldMapping[k])) ||
        "field5";

      if (feeds.length > 0) {
        const latestFeed = getLatestFeed(feeds);
        if (!totalReadingFieldKey || !latestFeed[totalReadingFieldKey]) {
          let maxVal = -1;
          for (let i = 1; i <= 8; i++) {
            const val = parseFloat(latestFeed[`field${i}`]);
            if (!isNaN(val) && val > maxVal) {
              maxVal = val;
              totalReadingFieldKey = `field${i}`;
            }
          }
        }
        if (!flowRateFieldKey || !latestFeed[flowRateFieldKey]) {
          for (const f of ["field3", "field4", "field1", "field2"]) {
            const val = parseFloat(latestFeed[f]);
            if (!isNaN(val) && val > 0 && val < 1000 && f !== totalReadingFieldKey) {
              flowRateFieldKey = f;
              break;
            }
          }
        }
        if (!flowRateFieldKey) flowRateFieldKey = "field4";
        if (!totalReadingFieldKey) totalReadingFieldKey = "field5";

        const lastUpdatedAt = latestFeed.created_at;
        const status = deviceState.calculateDeviceStatus(lastUpdatedAt);

        const flowResult = {
          node_id: req.params.id,
          status,
          lastUpdatedAt,
          active_fields: { flow_rate: flowRateFieldKey, total_liters: totalReadingFieldKey },
          flow_rate: parseFloat(latestFeed[flowRateFieldKey]) || 0,
          total_liters: parseFloat(latestFeed[totalReadingFieldKey]) || 0,
          history: feeds.map(f => ({
            timestamp: normalizeThingSpeakTimestamp(f.created_at),
            flow_rate: parseFloat(f[flowRateFieldKey]) || 0,
            total_liters: parseFloat(f[totalReadingFieldKey]) || 0
          }))
        };

        syncNodeStatus(deviceDoc.id, type, lastUpdatedAt, {
          flow_rate: flowResult.flow_rate,
          total_liters: flowResult.total_liters,
          status
        }).catch(err => console.error("Sync error:", err));

        await cache.set(analyticsCacheKey, flowResult, 300);
        return res.status(200).json(flowResult);
      }
      return res.status(200).json({ node_id: req.params.id, status: "Offline", history: [] });
    }

    // ── TDS path ──────────────────────────────────────────────────────────
    if (["evaratds", "tds"].includes(type)) {
      const tdsField = metadata.tds_field || fieldMapping.tdsField || "field2";
      const tempField = metadata.temperature_field || fieldMapping.tempField || "field3";

      if (feeds.length > 0) {
        const latestFeed = getLatestFeed(feeds);
        const lastUpdatedAt = latestFeed.created_at;
        const status = deviceState.calculateDeviceStatus(lastUpdatedAt);

        const tdsValue = parseFloat(latestFeed[tdsField]) || 0;
        const temperature = parseFloat(latestFeed[tempField]) || 0;

        let quality = "Good";
        if (tdsValue > 1000) quality = "Critical";
        else if (tdsValue > 500) quality = "Acceptable";

        const tdsResult = {
          id: deviceDoc.id,
          name: deviceDoc.data().name || deviceDoc.data().deviceName || "TDS Meter",
          node_id: req.params.id,
          status,
          lastUpdatedAt: normalizeThingSpeakTimestamp(lastUpdatedAt),
          tdsValue,
          temperature,
          waterQualityRating: quality,
          tdsHistory: feeds.map(f => ({
            value: parseFloat(f[tdsField]) || 0,
            timestamp: normalizeThingSpeakTimestamp(f.created_at)
          })).reverse(),
          tempHistory: feeds.map(f => ({
            value: parseFloat(f[tempField]) || 0,
            timestamp: normalizeThingSpeakTimestamp(f.created_at)
          })).reverse()
        };

        // Sync status back to device doc (metadata collection)
        await db.collection(type).doc(deviceDoc.id).update({
          tdsValue,
          temperature,
          waterQualityRating: quality,
          lastUpdatedAt: normalizeThingSpeakTimestamp(lastUpdatedAt),
          status
        }).catch(err => console.error("Metadata sync error:", err));

        // Sync back to registry (devices collection)
        await db.collection("devices").doc(deviceDoc.id).update({
          status,
          lastUpdatedAt: normalizeThingSpeakTimestamp(lastUpdatedAt),
          last_telemetry: {
            tdsValue,
            temperature,
            waterQualityRating: quality,
            timestamp: normalizeThingSpeakTimestamp(lastUpdatedAt)
          }
        }).catch(err => console.error("Registry sync error:", err));

        await cache.set(analyticsCacheKey, tdsResult, 300);
        return res.status(200).json(tdsResult);
      }
      return res.status(200).json({ node_id: req.params.id, status: "Offline", history: [], tdsHistory: [], tempHistory: [] });
    }

    // ── TANK path — NEW: use analytics engine ──────────────────────────────

    // Build readings array for engine (clean format)
    const readings = feeds
      .map(f => {
        const distCm = parseFloat(f[fieldKey]);
        const tsMs = new Date(f.created_at).getTime();
        if (isNaN(distCm) || isNaN(tsMs)) return null;
        return { distanceCm: distCm, timestampMs: tsMs };
      })
      .filter(Boolean)
      .sort((a, b) => a.timestampMs - b.timestampMs);

    // Load saved thresholds (null on first run)
    const savedThresholds = await deviceState.loadSavedThresholds(deviceDoc.id);

    // Run the analytics engine — THIS is the 200-reading window classification
    const analytics = analyzeWaterTank(
      readings,
      { depthM: depth, capacityLitres: capacity },
      savedThresholds
    );

    // Save thresholds if engine requests it
    if (analytics.shouldSaveThresholds && analytics.thresholds.learned) {
      await deviceState.saveThresholds(deviceDoc.id, analytics.thresholds);
    }

    // Build history for frontend chart
    const processedHistory = feeds.map(f => {
      const raw = parseFloat(f[fieldKey]);
      if (isNaN(raw)) return null;

      const dist = Math.min(raw / 100, depth);
      const height = Math.max(0, depth - dist);
      const level = Math.min(100, (height / depth) * 100);
      const volume = (capacity * level) / 100;

      return {
        level_percentage: level,
        level,
        volume,
        timestamp: normalizeThingSpeakTimestamp(f.created_at)
      };
    }).filter(Boolean);

    const latestPoint = processedHistory[processedHistory.length - 1] || { level: 0, volume: 0, timestamp: null };
    const status = deviceState.calculateDeviceStatus(latestPoint.timestamp);

    // Build tankBehavior using engine output
    const tankBehavior = {
      waterState: analytics.state,
      deltaCm: analytics.deltaCm,
      fillRateLpm:  analytics.state === 'REFILL'      ? analytics.rateLitresPerMin : 0,
      drainRateLpm: analytics.state === 'CONSUMPTION' ? analytics.rateLitresPerMin : 0,
      timeToFull:  analytics.estMinutesToFull,
      timeToEmpty: analytics.estMinutesToEmpty,
      consumedTodayLitres: analytics.consumedTodayLitres,
      refilledTodayLitres: analytics.refilledTodayLitres,
      thresholdsLearned: analytics.thresholds.learned,
      thresholdLower: analytics.thresholds.lower,
      thresholdUpper: analytics.thresholds.upper,
      eventTimeline: buildEventTimeline(processedHistory, analytics.state),
    };

    const tankResult = {
      node_id: req.params.id,
      status,
      lastUpdatedAt: latestPoint.timestamp,
      currentLevel: latestPoint.level,
      currentVolume: latestPoint.volume,
      level_percentage: latestPoint.level,
      remainingCapacity: Math.round(capacity - latestPoint.volume),
      history: processedHistory,
      tankBehavior,
    };

    // Update Firebase
    await db.collection(type).doc(deviceDoc.id).update({
      level_percentage: latestPoint.level,
      currentVolume: latestPoint.volume,
      waterState: analytics.state,
    }).catch(err => console.error("Metadata update error:", err));

    await cache.set(analyticsCacheKey, tankResult, 300);
    return res.status(200).json(tankResult);

  } catch (error) {
    console.error("Tank Engine Error:", error);
    res.status(500).json({ error: "Tank analytics calculation failure" });
  }
};
