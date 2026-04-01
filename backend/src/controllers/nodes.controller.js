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

                const lastSeen = meta.telemetry_snapshot?.timestamp || meta.last_updated_at || meta.last_seen || null;
                const dynamicStatus = deviceState.calculateDeviceStatus(lastSeen);

                // Strip sensitive keys
                const { thingspeak_read_api_key, ...safeMeta } = meta;

                nodes.push({
                    id,
                    ...registryDataMap[id],
                    ...safeMeta,
                    status: dynamicStatus,
                    last_seen: lastSeen,
                    last_updated_at: meta.last_updated_at || lastSeen,
                    last_value: meta.last_value ?? null,
                    last_online_at: meta.last_online_at || lastSeen,
                    zone_name: zoneMap[meta.zone_id] || null
                });
            }
        }

        // Cache the result for 30 seconds
        await cache.set(nodesCacheKey, nodes, 30);
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

            await db.collection(type).doc(deviceDoc.id).update({
                last_value: distance,
                last_updated_at: feedTimestamp,
                status: result.status,
                raw_data: lastFeed,
                last_telemetry_fetch: new Date().toISOString()
            }).catch(() => null);

            syncNodeStatus(deviceDoc.id, type, feedTimestamp).catch(() => null);

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
        if (!deviceDoc || !deviceDoc.exists) return res.status(404).json({ error: "Device not found" });

        const type = (deviceDoc.data().device_type || "").toLowerCase();
        if (!type) return res.status(400).json({ error: "Device type not specified" });

        const metaDoc = await db.collection(type).doc(deviceDoc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });

        const isOwner = await checkOwnership(req.user.customer_id || req.user.uid, deviceDoc.id, req.user.role, req.user.community_id);
        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });

        const metadata = metaDoc.data();
        const channelId = metadata.thingspeak_channel_id?.trim();
        const apiKey = metadata.thingspeak_read_api_key?.trim();
        const fieldMapping = metadata.sensor_field_mapping || {};
        const depth = metadata.configuration?.depth || metadata.configuration?.total_depth || metadata.tank_size || 1.2;
        const capacity = metadata.tank_size || 0;

        if (!channelId || !apiKey) return res.status(400).json({ error: "Telemetry configuration missing" });

        // ── CACHE LAYER ────────────────────────────────────────────────────────
        const analyticsCacheKey = `analytics_${deviceDoc.id}`;
        const cachedAnalytics = await cache.get(analyticsCacheKey);
        if (cachedAnalytics) {
            console.log(`[NodesController] Serving cached analytics for ${deviceDoc.id}`);
            return res.status(200).json(cachedAnalytics);
        }

        // Fetch enough results to cover trend analysis (150 pts is plenty for initial load)
        const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=150`;
        const response = await axios.get(url);
        const feeds = response.data.feeds || [];

        const sampleFeed = feeds[0] || {};
        const definedField = metadata.secondary_field || metadata.water_level_field || metadata.fieldKey || metadata.configuration?.water_level_field || metadata.configuration?.fieldKey;

        const fieldKey = fieldMapping.levelField || definedField ||
            Object.keys(fieldMapping).find(k => fieldMapping[k] && fieldMapping[k].includes("water_level")) ||
            (sampleFeed.field1 !== undefined ? "field1" : "field2");

        // EXPLICIT FLOW BYPASS - SMART FIELD SCAN
        if (["evaraflow", "flow", "flow_meter"].includes(type)) {
            let flowRateFieldKey = deviceDoc.data().flow_rate_field ||
                Object.keys(fieldMapping).find(k => fieldMapping[k] === "flow_rate");
            let totalReadingFieldKey = deviceDoc.data().meter_reading_field ||
                Object.keys(fieldMapping).find(k => fieldMapping[k] === "current_reading");

            // Smart-Scan: If fields are missing/zero in DB, find them in the data
            if (feeds.length > 0) {
                const latestFeed = getLatestFeed(feeds);

                if (!totalReadingFieldKey || !latestFeed[totalReadingFieldKey]) {
                    // Find largest number (likely the totalizer)
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
                    // Find first realistic non-zero flow rate (usually field 3 or 4)
                    for (const f of ["field3", "field4", "field1", "field2"]) {
                        const val = parseFloat(latestFeed[f]);
                        if (!isNaN(val) && val > 0 && val < 1000 && f !== totalReadingFieldKey) {
                            flowRateFieldKey = f;
                            break;
                        }
                    }
                }

                // Final fallbacks
                if (!flowRateFieldKey) flowRateFieldKey = "field4";
                if (!totalReadingFieldKey) totalReadingFieldKey = "field5";

                const lastUpdatedAt = latestFeed.created_at;
                const status = deviceState.calculateDeviceStatus(lastUpdatedAt);

                const flowResult = {
                    node_id: req.params.id,
                    status,
                    lastUpdatedAt,
                    // Return the mapping so frontend knows what we used
                    active_fields: {
                        flow_rate: flowRateFieldKey,
                        total_liters: totalReadingFieldKey
                    },
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

        // --- TANK & DEEP WELL ANALYTICS PIPELINE ---
        let rawHistory = feeds.map(feed => {
            const distance = parseFloat(feed[fieldKey]);
            if (isNaN(distance)) return null;

            const validDistance = Math.min(distance / 100, depth);
            const waterHeight = Math.max(0, depth - validDistance);
            const levelPercent = Math.min(100, (waterHeight / depth) * 100);
            const volume = (capacity * levelPercent) / 100;

            return {
                timestamp: normalizeThingSpeakTimestamp(feed.created_at),
                level: levelPercent,
                volume,
                raw: feed,
            };
        }).filter(Boolean);

        const history = rawHistory.map((point, index, arr) => {
            if (index === 0 || index === arr.length - 1) return point;
            const prev = arr[index - 1];
            const next = arr[index + 1];
            const smoothedLevel = (prev.level + point.level + next.level) / 3;
            const smoothedVolume = (prev.volume + point.volume + next.volume) / 3;

            let finalLevel = point.level;
            let finalVolume = point.volume;

            if (Math.abs(point.level - smoothedLevel) > 20) {
                finalLevel = smoothedLevel;
                finalVolume = smoothedVolume;
            } else {
                finalLevel = (point.level * 0.7) + (smoothedLevel * 0.3);
                finalVolume = (point.volume * 0.7) + (smoothedVolume * 0.3);
            }

            return {
                ...point,
                level: Number(finalLevel.toFixed(2)),
                volume: Number(finalVolume.toFixed(2))
            };
        });

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const startOf2DaysAgo = new Date(startOfYesterday);
        startOf2DaysAgo.setDate(startOf2DaysAgo.getDate() - 1);

        const todayReadings = history.filter(h => new Date(h.timestamp) >= startOfToday);
        const yesterdayReadings = history.filter(h => new Date(h.timestamp) >= startOfYesterday && new Date(h.timestamp) < startOfToday);
        const prevReadings = history.filter(h => new Date(h.timestamp) >= startOf2DaysAgo && new Date(h.timestamp) < startOfYesterday);

        let refillsToday = 0;
        let lastRefillTime = "--";
        let totalRefillDuration = 0;
        let refillCount = 0;
        let activeRefillStart = null;
        let refillTimeline = [];
        const REFILL_THRESHOLD = capacity * 0.02;

        for (let i = 1; i < history.length; i++) {
            const prev = history[i - 1];
            const curr = history[i];
            const volChange = curr.volume - prev.volume;
            const isToday = new Date(curr.timestamp) >= startOfToday;

            if (volChange > REFILL_THRESHOLD && !activeRefillStart) {
                activeRefillStart = new Date(curr.timestamp);
            } else if (volChange <= 0 && activeRefillStart) {
                const end = new Date(curr.timestamp);
                const duration = (end - activeRefillStart) / 60000;
                if (duration > 1) {
                    refillCount++;
                    totalRefillDuration += duration;
                    if (isToday) {
                        refillsToday++;
                        const d = activeRefillStart;
                        lastRefillTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    }
                }
                activeRefillStart = null;
            }

            if (isToday && i % 20 === 0) {
                refillTimeline.push(volChange > REFILL_THRESHOLD ? 1 : 0);
            }
        }

        const calculateConsumption = (readings) => {
            if (readings.length < 2) return 0;
            let total = 0;
            for (let i = 1; i < readings.length; i++) {
                const diff = readings[i - 1].volume - readings[i].volume;
                if (diff > 0) total += diff;
            }
            return total;
        };

        // Formula-Based Analytics Engine with Preprocessing & Smoothing
        const totalCapacity = capacity || 0;
        const tankDepth = depth || 1.2;

        // 1. Preprocessing: Filter noise and calculate raw volume
        let processedHistory = feeds.map((f) => {
            const raw = parseFloat(f[fieldKey]);
            if (isNaN(raw)) return null;

            // Outlier rejection (e.g. ignore 0 or values > 2x depth as sensor errors)
            if (raw <= 0 || (raw / 100) > (tankDepth * 2)) return null;

            const dist = Math.min(raw / 100, tankDepth);
            const height = Math.max(0, tankDepth - dist);
            const levelPct = Math.round(Math.min(100, (height / tankDepth) * 100) * 100) / 100;
            const volume = Math.round(((levelPct * totalCapacity) / 100) * 100) / 100;

            return {
                timestamp: normalizeThingSpeakTimestamp(f.created_at),
                level: levelPct,
                volume: volume
            };
        }).filter(Boolean);

        // 2. Smoothing: Moving Average Rate Calculation (10-point window)
        let fillRateLpm = 0;
        let drainRateLpm = 0;
        let events = [];

        if (processedHistory.length >= 10) {
            const windowSize = 10;
            const latestWindow = processedHistory.slice(-windowSize);
            const firstOfWindow = latestWindow[0];
            const lastOfWindow = latestWindow[latestWindow.length - 1];

            const dtMin = (new Date(lastOfWindow.timestamp) - new Date(firstOfWindow.timestamp)) / 60000;
            const dvL = lastOfWindow.volume - firstOfWindow.volume;

            if (dtMin > 2 && dtMin < 120) { // Valid window (2min - 2hrs)
                const smoothedRate = dvL / dtMin;
                // Dead-zone to avoid jitter at ±0.5 L/min
                if (smoothedRate > 0.8) fillRateLpm = Math.round(smoothedRate * 10) / 10;
                else if (smoothedRate < -0.8) drainRateLpm = Math.round(Math.abs(smoothedRate) * 10) / 10;
            }

            // 3. Timeline Generation (Using smoothed windows)
            for (let i = 15; i < processedHistory.length; i += 15) {
                const w1 = processedHistory[i - 15];
                const w2 = processedHistory[i];
                const dt = (new Date(w2.timestamp) - new Date(w1.timestamp)) / 60000;
                const dv = w2.volume - w1.volume;
                const r = dv / dt;

                if (dt > 5) {
                    if (r > 3) events.push({ time: new Date(w2.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), label: 'REFILL', color: '#34C759' });
                    else if (r < -3) events.push({ time: new Date(w2.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), label: 'PEAK USE', color: '#FF3B30' });
                }
            }
        }

        const latestPoint = processedHistory[processedHistory.length - 1] || { level: 0, volume: 0, timestamp: null };
        const status = deviceState.calculateDeviceStatus(latestPoint.timestamp);

        // 4. Steady Prediction (Only if rate is sustained)
        const remainingCap = totalCapacity - latestPoint.volume;
        const timeToFull = fillRateLpm > 1 ? Math.round(remainingCap / fillRateLpm) : null;
        const timeToEmpty = drainRateLpm > 1 ? Math.round(latestPoint.volume / drainRateLpm) : null;

        const tankResult = {
            node_id: req.params.id,
            status,
            lastUpdatedAt: latestPoint.timestamp,
            currentLevel: latestPoint.level,
            currentVolume: latestPoint.volume,
            remainingCapacity: Math.round(remainingCap),
            history: processedHistory,
            tankBehavior: {
                fillRateLpm,
                drainRateLpm,
                timeToFull,
                timeToEmpty,
                eventTimeline: events.length > 0 ? events.slice(-5) : []
            }
        };

        // Sync to Firestore
        syncNodeStatus(deviceDoc.id, type, latestPoint.timestamp, {
            percentage: latestPoint.level,
            volume: latestPoint.volume,
            status
        }).catch(err => console.error("Tank Sync Error:", err));

        await cache.set(analyticsCacheKey, tankResult, 300);
        return res.status(200).json(tankResult);
    } catch (error) {
        console.error("Tank Engine Error:", error);
        res.status(500).json({ error: "Tank analytics calculation failure" });
    }
};
