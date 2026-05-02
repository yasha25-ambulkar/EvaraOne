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
        const devices = [];

        for (const doc of snapshot.docs) {
            const data = doc.data();
            
            // Only poll devices that have ThingSpeak credentials configured
            if (data.thingspeak_channel_id && data.thingspeak_read_api_key) {
                devices.push({
                    ...data,
                    id: doc.id,
                    type: data.device_type || 'Generic',
                    channel: String(data.thingspeak_channel_id).trim(),
                    key: String(data.thingspeak_read_api_key).trim(),
                    mapping: data.sensor_field_mapping || {},
                    depth: data.configuration?.depth || data.configuration?.total_depth || data.tank_size || 1.2,
                    capacity: data.tank_size || 0,
                    lastUpdatedAt: data.lastUpdatedAt || data.last_updated_at || data.last_seen || null,
                    status: data.status || "OFFLINE"
                });
            }
        }
        
        console.log(`[WORKER DEBUG] Active devices to poll: ${devices.map(d => d.id).join(", ")}`);
        
        // Store in cache for 2 minutes (frequent refresh to pick up latest lastUpdatedAt)
        await cache.set("nodes:polling:list", devices, 120);
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

        // Extract the absolute latest data point timestamp
        const latestFeed = feeds[feeds.length - 1];
        const feedFingerprint = latestFeed ? latestFeed.created_at : null;
        
        // ─── ROBUST DEDUPLICATION ───
        // 1. Check local cache (high performance, short term)
        if (lastProcessed === feedFingerprint) {
            logger.debug(`[TelemetryWorker] Local skip for ${device.id} (Same as last cycle)`, { category: "telemetry", deviceId: device.id });
            return;
        }

        // 2. Check against Firestore lastUpdatedAt (source of truth, persistent)
        let lastSeenTime = 0;
        if (device.lastUpdatedAt) {
            // Handle Firestore Timestamp object if present
            if (typeof device.lastUpdatedAt.toMillis === 'function') {
                lastSeenTime = device.lastUpdatedAt.toMillis();
            } else if (device.lastUpdatedAt._seconds) {
                lastSeenTime = device.lastUpdatedAt._seconds * 1000;
            } else {
                lastSeenTime = new Date(device.lastUpdatedAt).getTime();
            }
        }
        
        const feedTime = new Date(feedFingerprint).getTime();
        
        // Skip if ThingSpeak data is NOT newer than our last recorded update
        // This solves the "stale polling" issue permanently.
        if (feedTime <= lastSeenTime) {
            logger.debug(`[TelemetryWorker] Skipping stale data for ${device.id}. Feed: ${feedFingerprint}, Registry: ${device.lastUpdatedAt}`, { category: "telemetry" });
            // Sync cache to avoid re-checking Firestore until it actually changes
            await cache.set(dedupKey, feedFingerprint, MQTT_DEDUP_TTL); 
            return;
        }

        // CRITICAL FIX: Use centralized processing logic
        const telemetryData = await deviceState.processThingSpeakData(device, feeds);
        if (!telemetryData) return;

        // CRITICAL FIX: Update Firestore with standardized payload
        await deviceState.updateFirestoreTelemetry(device.type, device.id, telemetryData, feeds);

        // ✅ CRITICAL: Also update registry with latest last_seen so status is consistent everywhere
        const now = new Date().toISOString();
        const { admin } = require("../config/firebase.js");
        await db.collection("devices").doc(device.id).update({
            last_seen: telemetryData.lastUpdatedAt,
            last_updated_at: telemetryData.lastUpdatedAt,
            isOnline: telemetryData.status === 'Online',
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
            device_id: device.id, // For frontend AllNodes matcher
            node_id: device.id,   // For frontend Analytics matcher
            percentage: telemetryData.percentage,
            level_percentage: telemetryData.percentage, // Include for consistency
            volume: telemetryData.volume,
            flow_rate: telemetryData.flow_rate,
            total_reading: telemetryData.total_reading,
            tds_value: telemetryData.tds_value,
            tdsValue: telemetryData.tds_value, // For frontend backward compatibility
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
    setInterval(async () => {
        try {
            await runPoll();
        } catch (err) {
            logger.error('[TelemetryWorker] Poll cycle failed', { error: err.message, category: 'telemetry' });
        }
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
