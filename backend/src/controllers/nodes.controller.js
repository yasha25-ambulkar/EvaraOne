const { db } = require("../config/firebase.js");
const axios = require("axios");
const telemetryCache = require("../services/cacheService.js");
const cache = require("../config/cache.js");

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
async function syncNodeStatus(id, type, lastSeen) {
    if (!lastSeen) return;
    try {
        await db.collection(type).doc(id).update({
            last_seen: lastSeen,
            last_telemetry_fetch: new Date().toISOString()
        });
    } catch (err) {
        console.error(`Status sync failed for ${id}:`, err);
    }
}

exports.getNodes = async (req, res) => {
    try {
        // Cache the full result per user (user:{id}:devices)
        const nodesCacheKey = req.user.role === "superadmin" 
            ? "user:admin:devices" 
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

        let communityMap = await cache.get("community_map");
        if (!communityMap) {
            const communitiesSnap = await db.collection("communities").get();
            communityMap = Object.fromEntries(communitiesSnap.docs.map(doc => [doc.id, doc.data().name || doc.data().communityName]));
            await cache.set("community_map", communityMap, 900);
        }

        const snapshot = await db.collection("devices").get();
        
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
        const typeBatches = await Promise.all(
            Object.keys(typedGroups).map(async (type) => {
                const ids = typedGroups[type];
                const refs = ids.map(id => db.collection(type).doc(id));
                const metas = await db.getAll(...refs);
                return metas.map(m => m.exists ? { id: m.id, meta: m.data(), type } : null).filter(Boolean);
            })
        );

        for (const batch of typeBatches) {
            for (const item of batch) {
                const { id, meta, type } = item;
                // Filter by customer if not superadmin
                if (req.user.role !== "superadmin" && meta.customer_id !== req.user.uid) continue;
                
                let lastSeen = meta.last_seen;
                const statusCacheKey = `device:${id}:status`;
                const cachedLastSeen = telemetryCache.get(statusCacheKey);
                
                if (cachedLastSeen) {
                    lastSeen = cachedLastSeen;
                } else if (!lastSeen || (new Date() - new Date(meta.last_telemetry_fetch || 0) > 15 * 60 * 1000)) {
                    const channelId = meta.thingspeak_channel_id?.trim();
                    const apiKey = meta.thingspeak_read_api_key?.trim();
                    if (channelId && apiKey) {
                        try {
                            const tsUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1`;
                            const tsRes = await axios.get(tsUrl, { timeout: 3000 });
                            const feed = tsRes.data.feeds?.[0];
                            if (feed) {
                                lastSeen = feed.created_at;
                                telemetryCache.set(statusCacheKey, lastSeen, 300);
                                syncNodeStatus(id, type, lastSeen);
                            }
                        } catch (err) {}
                    }
                }

                // Strip sensitive keys
                const { thingspeak_read_api_key, ...safeMeta } = meta;

                nodes.push({ 
                    id, 
                    ...registryDataMap[id], 
                    ...safeMeta, 
                    last_seen: lastSeen,
                    zone_name: zoneMap[meta.zone_id] || null,
                    community_name: communityMap[meta.community_id] || null
                });
            }
        }

        // Cache the result for 3 minutes
        await cache.set(nodesCacheKey, nodes, 180);
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
        const metaDoc = await db.collection(registry.device_type).doc(doc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata missing" });
        
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
        
        const type = deviceDoc.data().device_type;
        const metaDoc = await db.collection(type).doc(deviceDoc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });
        
        const metadata = metaDoc.data();
        const channelId = metadata.thingspeak_channel_id?.trim();
        const apiKey = metadata.thingspeak_read_api_key?.trim();
        const fieldMapping = metadata.sensor_field_mapping || {};
        const depth = metadata.configuration?.depth || metadata.configuration?.total_depth || metadata.tank_size || 1.2;
        const capacity = metadata.tank_size || 0;

        if (!channelId || !apiKey) return res.status(400).json({ error: "ThingSpeak config missing" });

        const cacheKey = `device:${req.params.id}:telemetry`;
        const cachedData = telemetryCache.get(cacheKey);
        if (cachedData) return res.status(200).json(cachedData);

        const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1`;
        const response = await axios.get(url);
        const lastFeed = response.data.feeds?.[0];

        if (!lastFeed) return res.status(200).json({ distance: 0, level_percentage: 0, last_seen: new Date() });

        // Resolve field with prioritized fallback: mapping -> field1 (common for tanks) -> field2 (legacy)
        const fieldKey = Object.keys(fieldMapping).find(k => fieldMapping[k].includes("water_level")) || 
                         (lastFeed.field1 !== undefined ? "field1" : "field2");
        
        const distance = parseFloat(lastFeed[fieldKey]) || 0;
        
        const validDistance = Math.min(distance / 100, depth); 
        const waterHeight = Math.max(0, depth - validDistance); 
        const levelPercent = Math.min(100, (waterHeight / depth) * 100);
        const volume = (capacity * levelPercent) / 100;

        const result = {
            distance,
            level_percentage: levelPercent,
            volume,
            last_seen: lastFeed.created_at,
            raw_data: lastFeed
        };

        // Fire-and-forget sync to Firestore
        syncNodeStatus(deviceDoc.id, type, lastFeed.created_at);

        telemetryCache.set(cacheKey, result);
        res.status(200).json(result);
    } catch (error) {
        console.error("Telemetry error:", error);
        res.status(500).json({ error: "Telemetry fetch failure" });
    }
};

exports.getNodeAnalytics = async (req, res) => {
    try {
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) return res.status(404).json({ error: "Device not found" });
        
        const type = deviceDoc.data().device_type;
        const metaDoc = await db.collection(type).doc(deviceDoc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });
        
        const metadata = metaDoc.data();
        // Superadmin or Customer ownership check
        if (req.user.role !== "superadmin" && metadata.customer_id !== req.user.uid) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const channelId = metadata.thingspeak_channel_id?.trim();
        const apiKey = metadata.thingspeak_read_api_key?.trim();
        const fieldMapping = metadata.sensor_field_mapping || {};
        const depth = metadata.configuration?.depth || metadata.configuration?.total_depth || metadata.tank_size || 1.2;
        const capacity = metadata.tank_size || 0;
        
        const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=50`;
        const response = await axios.get(url);
        const feeds = response.data.feeds || [];

        // Prioritized fallback for field resolution
        const sampleFeed = feeds[0] || {};
        const fieldKey = Object.keys(fieldMapping).find(k => fieldMapping[k].includes("water_level")) || 
                         (sampleFeed.field1 !== undefined ? "field1" : "field2");

        const history = feeds.map(feed => {
            const distance = parseFloat(feed[fieldKey]);
            if (isNaN(distance)) return null;

            const validDistance = Math.min(distance / 100, depth);
            const waterHeight = Math.max(0, depth - validDistance);
            const levelPercent = Math.min(100, (waterHeight / depth) * 100);
            const volume = (capacity * levelPercent) / 100;

            return {
                timestamp: feed.created_at,
                level: levelPercent,
                volume
            };
        }).filter(Boolean);

        if (feeds.length > 0) {
            // Fix: Sync the LATEST feed timestamp (last item), not the first one
            const latestFeed = feeds[feeds.length - 1];
            syncNodeStatus(deviceDoc.id, type, latestFeed.created_at);
        }

        res.status(200).json({ node_id: req.params.id, history });
    } catch (error) {
        console.error("Analytics error:", error);
        res.status(500).json({ error: "Analytics fetch failure" });
    }
};
