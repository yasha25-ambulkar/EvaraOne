const { db } = require("../config/firebase.js");
const cacheService = require("../services/cacheService.js");
const cache = require("../config/cache.js");
const { fetchSixHourData } = require("../services/thingspeakService.js");
const deviceState = require("../services/deviceStateService.js");
const { startStatusCron } = require("./deviceStatusCron.js");

// SaaS Architecture: Redis Pub/Sub Support
const pubSub = cache.getPubSub();
const pub = pubSub ? pubSub.pub : null;

// Local fallback for dev/single-instance
const EventEmitter = require('events');
const telemetryEvents = new EventEmitter();
telemetryEvents.setMaxListeners(0);

const POLL_INTERVAL = 60 * 1000; // 1 minute
const BATCH_SIZE = 5; // How many concurrent requests to ThingSpeak to avoid ban
const STATUS_CHECK_INTERVAL = 60 * 1000; // 1 minute cron job

async function getActiveDevices() {
    try {
        // SaaS Architecture: Security & Performance
        // 1. Check Cache first (invalidated automatically on admin updates via prefix 'nodes_')
        const cachedList = await cache.get("nodes:polling:list");
        if (cachedList) return cachedList;
        
        const snapshot = await db.collection("devices").get();
        const typedGroups = {};
        const registryDataMap = {};

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const type = data.device_type;
            if (!type) continue;
            
            if (!typedGroups[type]) typedGroups[type] = [];
            typedGroups[type].push(doc.id);
            registryDataMap[doc.id] = data;
        }

        const devices = [];
        const typeBatches = await Promise.all(
            Object.keys(typedGroups).map(async (type) => {
                const ids = typedGroups[type];
                const typeLower = type.toLowerCase();
                
                // Strategy 1: Try direct document lookup by Registry ID (Modern/Standard)
                const primaryRefs = ids.map(id => db.collection(typeLower).doc(id));
                const primaryMetas = await db.getAll(...primaryRefs);
                
                const results = [];
                const missingIds = [];
                
                primaryMetas.forEach((m, idx) => {
                    if (m.exists) {
                        results.push({ id: ids[idx], meta: m.data() });
                    } else {
                        missingIds.push(ids[idx]);
                    }
                });
                
                // Strategy 2: Fallback to Hardware/Node ID for legacy or manually provisioned devices
                if (missingIds.length > 0) {
                    const secondaryRefs = [];
                    const secondaryIdMap = [];
                    
                    missingIds.forEach(id => {
                        const registry = registryDataMap[id];
                        const hId = registry.hardware_id || registry.node_id || registry.device_id;
                        if (hId && hId !== id) {
                            secondaryRefs.push(db.collection(typeLower).doc(hId));
                            secondaryIdMap.push(id);
                        }
                    });
                    
                    if (secondaryRefs.length > 0) {
                        const secondaryMetas = await db.getAll(...secondaryRefs);
                        secondaryMetas.forEach((m, idx) => {
                            if (m.exists) {
                                results.push({ id: secondaryIdMap[idx], meta: m.data() });
                            }
                        });
                    }
                }
                
                return results;
            })
        );

        for (const batch of typeBatches) {
            for (const item of batch) {
                const { id, meta } = item;
                if (meta.thingspeak_channel_id && meta.thingspeak_read_api_key) {
                    devices.push({
                        ...registryDataMap[id],
                        ...meta,
                        id: id,
                        type: registryDataMap[id].device_type,
                        channel: meta.thingspeak_channel_id.trim(),
                        key: meta.thingspeak_read_api_key.trim(),
                        mapping: meta.sensor_field_mapping || {},
                        depth: meta.configuration?.depth || meta.configuration?.total_depth || meta.tank_size || 1.2,
                        capacity: meta.tank_size || 0,
                        lastUpdatedAt: meta.lastUpdatedAt || meta.last_updated_at || meta.last_seen || null,
                        status: meta.status || "OFFLINE"
                    });
                }
            }
        }
        
        // Store in cache for 1 hour (auto-busted on update via prefix 'nodes_')
        await cache.set("nodes:polling:list", devices, 3600);
        return devices;
    } catch (err) {
        console.error("[TelemetryWorker] Error fetching devices:", err.message);
        return [];
    }
}

async function processDevice(device) {
    try {
        const feeds = await fetchSixHourData(device.channel, device.key);
        if (!feeds.length) return;

        // CRITICAL FIX: Use centralized processing logic
        const telemetryData = await deviceState.processThingSpeakData(device, feeds);
        if (!telemetryData) return;

        // CRITICAL FIX: Update Firestore with standardized payload
        await deviceState.updateFirestoreTelemetry(device.type, device.id, telemetryData, feeds);

        // CRITICAL FIX: Emit real-time update via Socket.IO
        const payload = {
            deviceId: device.id,
            percentage: telemetryData.percentage,
            level_percentage: telemetryData.percentage, // Include for consistency
            volume: telemetryData.volume,
            flow_rate: telemetryData.flow_rate,
            total_reading: telemetryData.total_reading,
            tds_value: telemetryData.tds_value,
            temperature: telemetryData.temperature,
            water_quality: telemetryData.water_quality,
            lastUpdatedAt: telemetryData.lastUpdatedAt,
            timestamp: telemetryData.lastUpdatedAt,
            status: telemetryData.status,
            raw_data: telemetryData.raw_data
        };

        if (pub) {
            pub.publish(`device:update:${device.id}`, JSON.stringify(payload));
        } else {
            telemetryEvents.emit("device:update", payload);
        }
        
        const detail = telemetryData.tds_value !== undefined 
            ? `TDS: ${telemetryData.tds_value}ppm, Temp: ${telemetryData.temperature}°C`
            : `${telemetryData.percentage.toFixed(1)}%`;
            
        console.log(`[TelemetryWorker] Updated ${device.id}: ${detail} (${telemetryData.status})`);
    } catch (err) {
        console.error(`[TelemetryWorker] Error processing ${device.id}:`, err.message);
    }
}

async function runPoll() {
    const devices = await getActiveDevices();
    if (devices.length === 0) return;

    // Process in batches so we don't accidentally Ddos Thingspeak
    for (let i = 0; i < devices.length; i += BATCH_SIZE) {
        const batch = devices.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(d => processDevice(d)));
        // Tiny 50ms sleep between batches
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

// Start the worker
function startWorker() {
    // Run immediately once
    runPoll();
    
    // Then loop
    setInterval(runPoll, POLL_INTERVAL);
    
    // CRITICAL FIX: Start dedicated status cron job (runs every 1 minute)
    startStatusCron();
}

// Standalone execution support (for Render Background Worker)
if (require.main === module) {
    startWorker();
}

module.exports = { startWorker, telemetryEvents };
