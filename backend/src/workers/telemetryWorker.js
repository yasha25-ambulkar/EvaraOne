const { db } = require("../config/firebase.js");
const logger = require("../utils/logger.js"); // ✅ AUDIT FIX M10
const cacheService = require("../services/cacheService.js");
const cache = require("../config/cache.js");
const { fetchSixHourData } = require("../services/thingspeakService.js");
const deviceState = require("../services/deviceStateService.js");
const { startStatusCron } = require("./deviceStatusCron.js");

// ─── #17 FIX: MQTT Message Deduplication ──────────────────────────────────
// ORIGINAL BUG: If an MQTT message arrived twice (network retry), Firestore
// was updated twice with the same data. No cache key = no deduplication.
// Also created duplicate entries in audit logs and inflated analytics counts.
//
// FIX: Store a "seen message ID" cache with 5-minute TTL. Skip processing
// if we've already handled this message recently.
const MQTT_DEDUP_TTL = 300; // 5 minutes

// SaaS Architecture: Redis Pub/Sub Support
const pubSub = cache.getPubSub();
const pub = pubSub ? pubSub.pub : null;

// Local fallback for dev/single-instance
const EventEmitter = require('events');
const telemetryEvents = new EventEmitter();
telemetryEvents.setMaxListeners(0);

// ✅ CRITICAL FIX #4: Store Firestore listeners for cleanup on shutdown
const firestoreListeners = [];

const POLL_INTERVAL = 60 * 1000; // 1 minute
const BATCH_SIZE = 5; // How many concurrent requests to ThingSpeak to avoid ban
const STATUS_CHECK_INTERVAL = 60 * 1000; // 1 minute cron job

async function getActiveDevices() {
    try {
        // SaaS Architecture: Security & Performance
        // 1. Check Cache first (invalidated automatically on admin updates via prefix 'nodes_')
        const cachedList = await cache.get("nodes:polling:list");
        if (cachedList) return cachedList;

        logger.info("Cache miss: Loading active device list from Firestore...", { category: "telemetry" });
        
        // ✅ AUDIT FIX M2: Only poll devices that might have fresh data
        // OFFLINE_STOPPED / DECOMMISSIONED devices have no ThingSpeak data to fetch
        const snapshot = await db.collection("devices")
            .where("status", "not-in", ["OFFLINE_STOPPED", "DECOMMISSIONED"])
            .get();
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
        logger.error("Error fetching devices", err, { category: "telemetry" });
        return [];
    }
}

async function processDevice(device) {
    try {
        // ─── Deduplication: Skip if we recently processed this exact device ────
        const dedupKey = `mqtt_dedup_${device.id}`;
        const lastProcessed = await cache.get(dedupKey);
        
        const feeds = await fetchSixHourData(device.channel, device.key);
        if (!feeds.length) return;

        // Create a fingerprint of this data update to detect duplicates
        const feedFingerprint = JSON.stringify(feeds.map(f => f.created_at));
        
        // If we processed the exact same timestamp sequence recently, skip it
        if (lastProcessed === feedFingerprint) {
            logger.info(`Skipping duplicate update for ${device.id}`, { category: "telemetry", deviceId: device.id });
            return;
        }

        // CRITICAL FIX: Use centralized processing logic
        const telemetryData = await deviceState.processThingSpeakData(device, feeds);
        if (!telemetryData) return;

        // CRITICAL FIX: Update Firestore with standardized payload
        await deviceState.updateFirestoreTelemetry(device.type, device.id, telemetryData, feeds);

        // ✅ CRITICAL: Also update registry with latest last_seen so status is consistent everywhere
        const now = new Date().toISOString();
        await db.collection("devices").doc(device.id).update({
            last_seen: now,
            last_updated_at: now,
            status: telemetryData.status,
            updated_at: now
        }).catch(err => {
            if (err.code === 'not-found') {
                logger.warn(`[TelemetryWorker] Registry doc not found for ${device.id}, skipping registry update`);
            } else {
                throw err;
            }
        });

        // Record that we processed this device's data with this fingerprint
        await cache.set(dedupKey, feedFingerprint, MQTT_DEDUP_TTL);

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
        
        logger.telemetry(device.id, "updated", { percentage: telemetryData.percentage, status: telemetryData.status, tds_value: telemetryData.tds_value, temperature: telemetryData.temperature });
        const detail = telemetryData.tds_value !== undefined 
            ? `TDS: ${telemetryData.tds_value}ppm, Temp: ${telemetryData.temperature}°C`
            : `${telemetryData.percentage.toFixed(1)}%`;
            
        logger.debug(`[TelemetryWorker] Updated ${device.id}: ${detail} (${telemetryData.status})`);
    } catch (err) {
        logger.error(`Error processing device ${device.id}`, err, { category: "telemetry", deviceId: device.id });
    }
}

async function runPoll() {
    const devices = await getActiveDevices();
    if (devices.length === 0) return;

    logger.info(`Processing ${devices.length} devices`, { category: "telemetry", count: devices.length });

    // Process in batches so we don't accidentally Ddos Thingspeak
    for (let i = 0; i < devices.length; i += BATCH_SIZE) {
        const batch = devices.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(d => processDevice(d)));
        // Tiny 50ms sleep between batches
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    logger.info("Poll complete", { category: "telemetry" });
}

// Start the worker
function startWorker() {
    logger.info(`TelemetryWorker initialized, polling every ${POLL_INTERVAL}ms`, { category: "telemetry", interval: POLL_INTERVAL });
    
    // Run immediately once with error handling
    runPoll().catch(err => {
        logger.error('[TelemetryWorker] Initial poll failed', { error: err.message, category: 'telemetry' });
    });
    
    // Then loop with error handling - wrap setInterval callback to catch promise rejections
    setInterval(() => {
        runPoll().catch(err => {
            logger.error('[TelemetryWorker] Poll cycle failed', { error: err.message, category: 'telemetry' });
        });
    }, POLL_INTERVAL);
    
    // CRITICAL FIX: Start dedicated status cron job (runs every 1 minute)
    startStatusCron();
}

// ✅ CRITICAL FIX #4: Register a Firestore listener for cleanup on shutdown
function registerFirestoreListener(unsubscribeFn) {
    if (unsubscribeFn && typeof unsubscribeFn === 'function') {
        firestoreListeners.push(unsubscribeFn);
        logger.debug('[TelemetryWorker] Firestore listener registered for cleanup', { count: firestoreListeners.length });
    }
}

// ✅ CRITICAL FIX #4: Graceful shutdown handler
// Called on SIGTERM (Railway, Heroku, or manual shutdown)
function setupGracefulShutdown() {
    const shutdownHandler = async (signal) => {
        logger.info(`[TelemetryWorker] Shutdown signal received (${signal})`, { signal });
        
        try {
            // Unsubscribe from all Firestore listeners
            let cleanedCount = 0;
            for (const unsubscribeFn of firestoreListeners) {
                try {
                    unsubscribeFn();
                    cleanedCount++;
                } catch (err) {
                    logger.error('[TelemetryWorker] Listener unsubscribe failed on shutdown', { error: err.message });
                }
            }
            
            if (cleanedCount > 0) {
                logger.debug('[TelemetryWorker] Firestore listeners cleaned up on shutdown', { count: cleanedCount });
            }
            
            firestoreListeners.length = 0; // Clear the array
        } catch (err) {
            logger.error('[TelemetryWorker] Error during graceful shutdown', { error: err.message });
        }
        
        process.exit(0);
    };
    
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
}

// Start graceful shutdown handler when worker starts
if (require.main === module) {
    setupGracefulShutdown();
}

// Standalone execution support (for Render Background Worker)
if (require.main === module) {
    startWorker();
}

module.exports = { startWorker, telemetryEvents, registerFirestoreListener };
