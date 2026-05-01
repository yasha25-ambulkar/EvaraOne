const { db, admin } = require("../config/firebase.js");
const { Filter } = require("firebase-admin/firestore");
const { startWorker } = require("../workers/telemetryWorker.js");
const { checkOwnership } = require("../middleware/auth.middleware.js");
const { checkDeviceVisibilityWithAudit } = require("../utils/checkDeviceVisibility.js");
const logger = require("../utils/logger.js");
const axios = require("axios");
const telemetryCache = require("../services/cacheService.js");
const cache = require("../config/cache.js");
const deviceState = require("../services/deviceStateService.js");
const { DEVICE_STATUS } = require("../utils/deviceConstants.js");
const { resolveFieldKey, resolveMultipleFields } = require("../utils/fieldMappingResolver.js");
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
// ✅ HYBRID CACHING IMPORTS
const HybridDataResolver = require("../utils/hybridDataResolver.js");
const TelemetryArchiveService = require("../services/telemetryArchiveService.js");

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
// ✅ AUDIT FIX L2: Use shared resolveDevice utility (was duplicated in 3 controllers)
const { computeTankMetrics } = require("../utils/tankMath.js");
const resolveDevice = require("../utils/resolveDevice.js");

/**
 * Persist ThingSpeak timestamp back to Firestore to keep Dashboard/Map synchronized
 */
async function syncNodeStatus(id, type, lastSeen, additionalData = {}) {
    if (!lastSeen) return;
    try {
        const status = deviceState.calculateDeviceStatus(lastSeen);

        const updatePayload = {
            status,
            isOnline: status === 'Online',
            last_seen: admin.firestore.FieldValue.serverTimestamp(),
            last_updated_at: admin.firestore.FieldValue.serverTimestamp(),
            last_online_at: admin.firestore.FieldValue.serverTimestamp(),
            last_telemetry_fetch: new Date().toISOString(),
            telemetry_snapshot: {
                ...additionalData,
                timestamp: lastSeen,
                status
            }
        };

        // ✅ SINGLE COLLECTION: All device metadata lives in 'devices'
        await db.collection("devices").doc(id).update(updatePayload);
    } catch (err) {
        logger.error(`Status sync failed for ${id}:`, err);
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

        // ✅ CRITICAL FIX: Don't cache customer-specific queries - always get fresh data
        // This ensures consistent results when devices are added/removed
        const filterCustomerId = req.query.customerId || req.query.customer_id || null;

        logger.debug(`[NodesController] getNodes:`, {
            userId: req.user.uid,
            userRole: req.user.role,
            filterCustomerId,
            userCustomerId: req.user.customer_id
        });

        // For customer-specific queries, SKIP CACHE to ensure we always get real DB data
        let shouldUseCache = !filterCustomerId;

        const nodesCacheKey = req.user.role === "superadmin"
            ? `user:admin:devices${filterCustomerId ? `:${filterCustomerId}` : ""}`
            : `user:${req.user.uid}:devices`;

        // ✅ FIX #18: SKIP DEVICE LIST CACHE FOR CONSISTENT STATUS
        // CRITICAL: Status accuracy is more important than small performance gain
        // Device status must ALWAYS reflect current state from DB, not cached state
        // Cache can hide stale status values (device marked ONLINE but truly offline in DB)
        // This is why dashboard showed ONLINE while analytics showed OFFLINE
        //
        // The ~500ms DB call is worth the accuracy of real-time status
        // We'll implement targeted field-level caching later instead
        const shouldSkipCache = true;  // Always get fresh status data
        
        if (!shouldSkipCache && shouldUseCache) {
            const cachedNodes = await cache.get(nodesCacheKey);
            if (cachedNodes) {
                logger.debug(`[NodesController] ✅ Cache HIT for key: ${nodesCacheKey}, returned ${cachedNodes.length} devices`);
                return res.status(200).json(cachedNodes);
            }
        }

        logger.debug(`[NodesController] Cache SKIPPED for consistent status (always fresh from DB) for key: ${nodesCacheKey}`);

        let query = db.collection("devices");

        if (filterCustomerId) {
            // Filter by the provided customer ID
            logger.debug(`[NodesController] Filtering by customerID: ${filterCustomerId}`);
            query = query.where("customer_id", "==", filterCustomerId);
            logger.debug(`[NodesController] ✅ NOT applying Firestore where-clause for isVisibleToCustomer (would filter out old devices)`);
        } else if (req.user.role !== "superadmin") {
            // Customer viewing their own devices
            logger.debug(`[NodesController] Filtering by customer's own ID`);
            query = query.where("customer_id", "==", req.user.customer_id);
            logger.debug(`[NodesController] ✅ NOT applying Firestore where-clause for isVisibleToCustomer (would filter out old devices)`);
        } else {
            logger.debug(`[NodesController] Superadmin viewing all devices (no customer_id filter)`);
        }

        const snapshot = await query.get();
        logger.debug(`[NodesController] Query returned ${snapshot.size} device registry entries from DB`);
        logger.debug(`[NodesController] Device types found:`, snapshot.docs.map(d => ({ id: d.id, device_type: d.data().device_type })));

        // ✅ CRITICAL N+1 FIX: Collect device IDs and batch-fetch metadata
        // This reduces 400 queries (100 devices × 4 queries each) to ~4 queries
        const typedGroups = {};
        const registryDataMap = {};
        const uniqueZoneIds = new Set();

        // Step 1: Collect all device IDs by type and identify unique zones & customers
        const uniqueCustomerIds = new Set();
        for (const doc of snapshot.docs) {
            const registry = doc.data();
            
            // ✅ FIX: Support both device_type and asset_type/assetType fields
            let rawType = registry.device_type || registry.asset_type || registry.assetType || "";
            let type = rawType.toLowerCase();
            
            // Map to correct collection names
            const typeMap = {
              "evaratank": "evaratank", "tank": "evaratank",
              "evaradeep": "evaradeep", "deep": "evaradeep",
              "evaraflow": "evaraflow", "flow": "evaraflow",
              "evaratds": "evaratds", "tds": "evaratds"
            };
            const collectionName = typeMap[type] || type;
            if (!collectionName) continue;

            if (!typedGroups[collectionName]) typedGroups[collectionName] = [];
            typedGroups[collectionName].push(doc.id);
            registryDataMap[doc.id] = registry;
            
            // Collect unique zone IDs (DO NOT query zones in loop)
            if (registry.zone_id) uniqueZoneIds.add(registry.zone_id);
            
            // Collect unique customer IDs for batch lookup
            if (registry.customer_id) uniqueCustomerIds.add(registry.customer_id);
        }

        // Step 2: Pre-fetch unique zones and customers ONCE (not per device)
        let zoneMap = {};
        let customerMap = {};
        
        if (uniqueZoneIds.size > 0) {
            logger.debug(`[NodesController] Pre-fetching ${uniqueZoneIds.size} unique zones (batch query)`);
            const zoneRefs = Array.from(uniqueZoneIds).map(id => db.collection("zones").doc(id));
            
            // Split into chunks of 500 to respect Firestore limits
            const CHUNK_SIZE = 500;
            for (let i = 0; i < zoneRefs.length; i += CHUNK_SIZE) {
                const chunk = zoneRefs.slice(i, i + CHUNK_SIZE);
                const zoneDocs = await db.getAll(...chunk);
                zoneDocs.forEach(doc => {
                    if (doc.exists) {
                        zoneMap[doc.id] = doc.data().zoneName || doc.data().name || doc.id;
                    }
                });
            }
        }
        logger.debug(`[NodesController] Loaded zone map with ${Object.keys(zoneMap).length} entries`);
        
        if (uniqueCustomerIds.size > 0) {
            logger.debug(`[NodesController] Pre-fetching ${uniqueCustomerIds.size} unique customers (batch query)`);
            const customerRefs = Array.from(uniqueCustomerIds).map(id => db.collection("customers").doc(id));
            
            // Split into chunks of 500 to respect Firestore limits
            const CHUNK_SIZE = 500;
            for (let i = 0; i < customerRefs.length; i += CHUNK_SIZE) {
                const chunk = customerRefs.slice(i, i + CHUNK_SIZE);
                const customerDocs = await db.getAll(...chunk);
                customerDocs.forEach(doc => {
                    if (doc.exists) {
                        // Try multiple possible field names for customer name
                        const customerData = doc.data();
                        const name = customerData.display_name || customerData.displayName || customerData.name || customerData.customerName || doc.id;
                        customerMap[doc.id] = name;
                    }
                });
            }
        }
        logger.debug(`[NodesController] Loaded customer map with ${Object.keys(customerMap).length} entries`);

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

        // ✅ SINGLE COLLECTION: All metadata is on the devices document itself — no sub-collection reads needed.
        // Re-shape typedGroups into a flat batch using the devices collection.
        const typeBatches = await Promise.all(
            Object.keys(typedGroups).map(async (type) => {
                const ids = typedGroups[type];
                logger.debug(`[NodesController] Fetching ${ids.length} ${type} device documents for IDs:`, ids);
                const refs = ids.map(id => db.collection("devices").doc(id));
                const metas = await chunkGetAll(refs);
                logger.debug(`[NodesController] Successfully loaded ${metas.filter(m => m.exists).length} metadata from ${ids.length} refs for type ${type}`);
                return metas.map(m => m.exists ? { id: m.id, meta: m.data(), type } : null).filter(Boolean);
            })
        );
        logger.debug(`[NodesController] Total metadata loaded: ${typeBatches.reduce((sum, batch) => sum + batch.length, 0)} devices`);

        for (const batch of typeBatches) {
            for (const item of batch) {
                const { id, meta, type } = item;
                
                logger.debug(`[NodesController] Processing device: ID=${id}, type=${type}, label=${meta.label}, category=${meta.category}`);

                  const registry = registryDataMap[id];
                  const effCustomerId = registry?.customer_id || registry?.customerId || meta.customer_id || meta.customerId;

                  // Ownership check only for non-superadmin without an explicit customerId filter
                  if (req.user.role !== "superadmin" && !filterCustomerId) {    
                      if (effCustomerId !== req.user.customer_id) {
                          logger.debug(`[NodesController] ⚠️  Filtering out device ${id}: customer mismatch (effCustomerId=${effCustomerId} vs req.user.customer_id=${req.user.customer_id})`);
                          continue;
                      }
                  }

                // ✅ CRITICAL FIX #4: ENFORCE DEVICE VISIBILITY
                // Non-superadmins: only filter if EXPLICITLY marked as hidden (isVisibleToCustomer === false)
                // If field is missing (old devices), treat as visible by default
                const effIsVisible = registry?.isVisibleToCustomer ?? meta?.isVisibleToCustomer; if (req.user.role !== "superadmin" && effIsVisible === false) {
                    logger.debug(`[NodesController] ⚠️  Filtering out explicitly hidden device ${id} for user ${req.user.uid}`);
                    continue;  // Skip this device
                }
                // Superadmins always see all devices
                if (req.user.role === "superadmin") {
                    logger.debug(`[NodesController] ✅ Superadmin${filterCustomerId ? ` querying customer ${filterCustomerId}` : ''} can see all devices`);
                }

                // ✅ FIX #17: CONSISTENT STATUS CALCULATION
                // CRITICAL: Don't use telemetry_snapshot.timestamp as it gets stale
                // Use only actual telemetry update timestamps
                // Priority (from most reliable to least):
                // 1. last_updated_at (set when telemetry arrives)
                // 2. last_online_at (set when device goes online)
                // 3. lastUpdatedAt / lastUpdated (from TDS updates)
                // 4. last_seen (legacy field)
                const lastSeen = meta.last_updated_at || meta.last_online_at || meta.lastUpdatedAt || meta.lastUpdated || meta.last_seen || null;
                const dynamicStatus = deviceState.calculateDeviceStatus(lastSeen);

                // ✅ DETAILED LOGGING: Show why device is online/offline
                logger.debug(`[NodesController] Device ${id}: lastSeen=${lastSeen}, calculatedStatus=${dynamicStatus}, storedStatus=${meta.status}, label=${meta.label}`);

                // Strip sensitive keys
                const { thingspeak_read_api_key, ...safeMeta } = meta;

                // ✅ FIXED: Enforce Single Source of Truth
                // Pull directly from database document rather than computing locally
                let levelPercentage = meta.level_percentage ?? null;

                const nodeData = {
                    id,
                    ...registryDataMap[id],
                    ...safeMeta,
                    status: dynamicStatus,
                    // Ensure isVisibleToCustomer is always set (default to true for old devices)
                    isVisibleToCustomer: meta.isVisibleToCustomer !== false ? true : false,
                    last_seen: lastSeen,
                    last_updated_at: meta.last_updated_at || lastSeen,
                    last_value: meta.last_value ?? null,
                    last_online_at: meta.last_online_at || lastSeen,
                    zone_name: zoneMap[meta.zone_id] || null,
                    customer_name: customerMap[effCustomerId] || null
                };

                console.log('NODE DEBUG:', nodeData.id, '| device_type:', nodeData.device_type, '| analytics_template:', nodeData.analytics_template);

                // ✅ FIX: Ensure analytics_template is set (fallback for existing devices)
                if (!nodeData.analytics_template) {
                    const deviceType = (nodeData.device_type || "").toLowerCase();
                    if (deviceType === "evaratank") nodeData.analytics_template = "EvaraTank";
                    else if (deviceType === "evaradeep") nodeData.analytics_template = "EvaraDeep";
                    else if (deviceType === "evaraflow") nodeData.analytics_template = "EvaraFlow";
                    else if (deviceType === "evaratds") nodeData.analytics_template = "EvaraTDS";
                    else nodeData.analytics_template = "EvaraTank"; // default
                }

                // Enforce calculated level_percentage for tanks onto nodes list
                const isTankType = type.toLowerCase().includes("tank") || type.toLowerCase().includes("evara");
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
                    const lt = meta.last_telemetry || {};
                    nodeData.last_telemetry = {
                        tdsValue: lt.tdsValue ?? lt.tds_value ?? meta.tdsValue ?? 0,
                        tds_value: lt.tdsValue ?? lt.tds_value ?? meta.tdsValue ?? 0,
                        waterQualityRating: lt.waterQualityRating ?? lt.water_quality ?? meta.waterQualityRating ?? 'Unknown',
                        temperature: lt.temperature ?? meta.temperature ?? 0,
                        tds_history: lt.tds_history ?? meta.tds_history ?? [],
                        timestamp: lt.timestamp ?? meta.lastUpdated ?? meta.updated_at ?? null
                    };
                }

                nodes.push(nodeData);
            }
        }

                logger.debug(`[NodesController] ✅ Final result: ${nodes.length} devices prepared`);
                logger.debug(`[NodesController] Device details:`, nodes.map(n => ({ 
                    id: n.id, 
                    name: n.label || n.displayName,
                    device_type: n.device_type,
                    analytics_template: n.analytics_template,
                    customer_id: n.customer_id
                })));
                
                // ✅ FIX: Additional detailed logging BEFORE response
                logger.debug(`[NodesController] Complete device list (IDs):`, nodes.map(n => n.id).join(', '));
                logger.debug(`[NodesController] Device types breakdown:`, 
                    nodes.reduce((acc, n) => {
                        const type = n.analytics_template || n.device_type || 'unknown';
                        acc[type] = (acc[type] || 0) + 1;
                        return acc;
                    }, {}));

                // Critical N+1 FIX METRICS
                // Show query reduction vs N+1 pattern
                const typeCount = Object.keys(typedGroups).length;
                const actualQueries = 1 + typeCount + 1; // devices list + type metadata batches + zones batch
                const n1Queries = 1 + (nodes.length * 4); // N+1 anti-pattern: 1 + per-device metadata + zone + community queries
                logger.debug(`[NodesController] QUERY REDUCTION:
  - Actual queries: ${actualQueries}
  - N+1 pattern would use: ${n1Queries}
  - Files loaded: ${nodes.length} devices from ${typeCount} types
  - Zone lookups: ${uniqueZoneIds.size} unique zones (pre-fetched, not per-device)
  - Estimated response time improvement: ${Math.round((n1Queries / actualQueries - 1) * 100)}% faster
  - Firestore cost savings: ~${Math.round((1 - actualQueries / n1Queries) * 100)}% reduction`);

        // ✅ FIX #19: DISABLE DEVICE LIST CACHING FOR CONSISTENCY
        // Since we're always fetching fresh from DB to ensure accurate status,
        // there's no point in caching. Status accuracy > performance optimization
        // Once status is stored in DB reliably, we can re-enable caching
        
        // Legacy code - keeping for reference but disabled:
        // if (shouldUseCache && !filterCustomerId) {
        //     logger.debug(`[NodesController] Caching superadmin result for ${Math.ceil(nodes.length / 2)} seconds`);
        //     await cache.set(nodesCacheKey, nodes, Math.ceil(nodes.length / 2));
        // } else if (filterCustomerId) {
        //     logger.debug(`[NodesController] ALWAYS FRESH: Customer-specific query - NOT cached`);
        // }
        
        logger.debug(`[NodesController] ALWAYS FRESH: Device list not cached (status accuracy priority)`);
        
        res.status(200).json(nodes);
    } catch (error) {
        logger.error(`[NodesController] Error in getNodes:`, error);
        res.status(500).json({ error: "Failed to fetch nodes" });
    }
};



exports.getNodeById = async (req, res) => {
    try {
        const doc = await resolveDevice(req.params.id);
        if (!doc || !doc.exists) return res.status(404).json({ error: "Node not found" });

        const registry = doc.data();

        if (req.user.role !== "superadmin") {
            const isOwner = await checkOwnership(req.user.customer_id || req.user.uid, doc.id, req.user.role, req.user.community_id);
            if (!isOwner) return res.status(403).json({ error: "Unauthorized access" });
            if (!checkDeviceVisibilityWithAudit(registry, doc.id, req.user.uid, req.user.role)) {
                return res.status(403).json({ error: "Device not visible to your account" });
            }
        }

        // ✅ SINGLE COLLECTION: All metadata lives directly on the devices document
        // No sub-collection lookup needed — registry IS the metadata
        const metaDoc = await db.collection("devices").doc(doc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata missing" });

        const metadata = metaDoc.data();
        
        // CRITICAL: Lookup customer name (same as getNodes) for analytics modal
        const effCustomerId = registry?.customer_id || registry?.customerId || metadata.customer_id || metadata.customerId;
        let customerName = null;
        if (effCustomerId) {
            const customerDoc = await db.collection("customers").doc(effCustomerId).get();
            if (customerDoc.exists) {
                const customerData = customerDoc.data();
                customerName = customerData.display_name || customerData.displayName || customerData.name || customerData.customerName || null;
            }
        }
        
        // ✅ FIX: Use destructure to exclude API key — Firestore objects are not mutable with delete
        const { thingspeak_read_api_key: _stripped, ...safeMetadata } = metadata;
        
        // MERGE: registry + safeMetadata into single response
        const result = { 
            id: doc.id, 
            ...registry,
            ...safeMetadata,
            customer_name: customerName
        };
        
        logger.debug(`[getNodeById] Returning config with Channel ID:`, result.thingspeak_channel_id, `Customer: ${customerName}`);
        
        await cache.set(`device:${doc.id}:metadata`, result, 3600);
        res.status(200).json(result);
    } catch (error) {
        logger.error('[getNodeById] ERROR:', error.message || String(error), error.stack || '');
        res.status(500).json({ error: "Failed to fetch node", detail: error.message });
    }
};

exports.getNodeTelemetry = async (req, res) => {
    try {
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) return res.status(404).json({ error: "Device not found" });

        const registry = deviceDoc.data();

        // type is still used for device-path branching (flow / tds / tank) but NOT for collection lookup
        let rawType = registry.device_type || registry.asset_type || registry.assetType || "";
        let type = rawType.toLowerCase();

        // ✅ SINGLE COLLECTION: All metadata lives on the devices document itself
        const metaDoc = await db.collection("devices").doc(deviceDoc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });

        if (req.user.role !== "superadmin") {
            const isOwner = await checkOwnership(req.user.customer_id || req.user.uid, deviceDoc.id, req.user.role, req.user.community_id);
            if (!isOwner) return res.status(403).json({ error: "Unauthorized access" });

            // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
            if (!checkDeviceVisibilityWithAudit(registry, deviceDoc.id, req.user.uid, req.user.role)) {
                return res.status(403).json({ error: "Device not visible to your account" });
            }
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
        const storedStatus = metadata.status || DEVICE_STATUS.OFFLINE;

        // ── FLOW DEVICE PATH ──────────────────────────────────────────────────────────
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
            logger.debug(`[ThingSpeak] Fetching: ${url}`);

            try {
                const response = await axios.get(url, { timeout: 8000 });
                const feeds = response.data?.feeds || [];
                logger.debug(`[ThingSpeak] Response status 200, feeds: ${feeds.length}`);

                if (!feeds || feeds.length === 0) {
                    return res.status(200).json({
                        deviceId: deviceDoc.id,
                        status: DEVICE_STATUS.UNKNOWN,
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

                logger.debug(`[ThingSpeak] totalUsage=${totalUsage} flowRate=${flowRate} (fields: total=${totalReadingFieldKey}, flow=${flowRateFieldKey})`);

                const feedTimestamp = latestFeed.created_at;
                const status = deviceState.calculateDeviceStatus(feedTimestamp);

                // ✅ SINGLE COLLECTION: Persist to devices (non-blocking)
                db.collection("devices").doc(deviceDoc.id).update({
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
                logger.error(`[ThingSpeak] Fetch error for device ${deviceDoc.id}:`, err.message);
                return res.status(200).json({
                    deviceId: deviceDoc.id,
                    status: DEVICE_STATUS.UNKNOWN,
                    timestamp: storedLastSeen,
                    flow_rate: null,
                    total_usage: null,
                    error: "ThingSpeak fetch failed"
                });
            }
        }

        // ── TDS DEVICE PATH ──────────────────────────────────────────────────────────
        if (["evaratds", "tds"].includes(type)) {
            const tdsKeys = ['tdsField', 'tds_value', 'tdsValue'];
            const tempKeys = ['tempField', 'temperature', 'temperature_field'];
            
            let tdsFieldKey = Object.keys(fieldMapping).find(k => tdsKeys.includes(fieldMapping[k])) || "field2";
      let tempFieldKey = Object.keys(fieldMapping).find(k => tempKeys.includes(fieldMapping[k])) || "field3";

      if (metadata.tdsField) tdsFieldKey = metadata.tdsField;
      if (metadata.tempField || metadata.temperature_field) tempFieldKey = metadata.tempField || metadata.temperature_field;

            if (!channelId || !apiKey) {
                return res.status(200).json({
                    deviceId: deviceDoc.id,
                    status: storedStatus,
                    timestamp: storedLastSeen,
                    tds_value: metadata.tdsValue ?? metadata.last_tds_value ?? null,
                    temperature: metadata.temperature ?? metadata.last_temperature ?? null,
                    water_quality: metadata.waterQualityRating ?? "Good",
                    field_mapping: { tds_field: tdsFieldKey, temperature_field: tempFieldKey }
                });
            }

            const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1`;
            logger.debug(`[TDS] Fetching: ${url}`);

            try {
                const response = await axios.get(url, { timeout: 8000 });
                const feeds = response.data?.feeds || [];
                logger.debug(`[TDS] Response status 200, feeds: ${feeds.length}`);

                if (!feeds || feeds.length === 0) {
                    logger.debug(`[TDS] No feeds returned`);
                    return res.status(200).json({
                        deviceId: deviceDoc.id,
                        status: DEVICE_STATUS.UNKNOWN,
                        timestamp: storedLastSeen,
                        tds_value: metadata.tdsValue ?? metadata.last_tds_value ?? null,
                        temperature: metadata.temperature ?? metadata.last_temperature ?? null,
                        water_quality: metadata.waterQualityRating ?? "Good",
                        field_mapping: { tds_field: tdsFieldKey, temperature_field: tempFieldKey }
                    });
                }

                const latestFeed = feeds[feeds.length - 1];
                const rawTdsValue = parseFloat(latestFeed[tdsFieldKey]);
                const rawTemperature = parseFloat(latestFeed[tempFieldKey]);
                const tdsValue = isNaN(rawTdsValue) ? null : rawTdsValue;
                const temperature = isNaN(rawTemperature) ? null : rawTemperature;

                logger.debug(`[TDS] Latest feed data:`, latestFeed);
                logger.debug(`[TDS] Extracted values: tdsValue=${tdsValue} temperature=${temperature}`);
                logger.debug(`[TDS] Extracted from fields: tds_field=${tdsFieldKey} (value in feed=${latestFeed[tdsFieldKey]}), temp_field=${tempFieldKey} (value in feed=${latestFeed[tempFieldKey]})`);

                const feedTimestamp = latestFeed.created_at;
                const status = deviceState.calculateDeviceStatus(feedTimestamp);

                // Water quality calculation (simple logic for now)
                let quality = "Good";
                if (tdsValue > 1000) quality = "Critical";
                else if (tdsValue > 500) quality = "Acceptable";

                // ✅ SINGLE COLLECTION: Persist to devices (non-blocking)
                db.collection("devices").doc(deviceDoc.id).update({
                    tdsValue,
                    temperature,
                    waterQualityRating: quality,
                    last_updated_at: feedTimestamp,
                    status,
                    last_telemetry_fetch: new Date().toISOString(),
                    last_tds_value: tdsValue,
                    last_temperature: temperature
                }).catch(() => null);

                return res.status(200).json({
                    deviceId: deviceDoc.id,
                    status,
                    timestamp: normalizeThingSpeakTimestamp(feedTimestamp),
                    last_updated_at: normalizeThingSpeakTimestamp(feedTimestamp),
                    tds_value: tdsValue,
                    temperature: temperature,
                    water_quality: quality,
                    field_mapping: { tds_field: tdsFieldKey, temperature_field: tempFieldKey },
                    raw_data: latestFeed
                });
            } catch (err) {
                logger.error(`[TDS] Fetch error for device ${deviceDoc.id}:`, err.message);
                return res.status(200).json({
                    deviceId: deviceDoc.id,
                    status: DEVICE_STATUS.UNKNOWN,
                    timestamp: storedLastSeen,
                    tds_value: metadata.tdsValue ?? metadata.last_tds_value ?? null,
                    temperature: metadata.temperature ?? metadata.last_temperature ?? null,
                    water_quality: metadata.waterQualityRating ?? "Good",
                    field_mapping: { tds_field: tdsFieldKey, temperature_field: tempFieldKey },
                    error: "ThingSpeak fetch failed"
                });
            }
        }

        // ── TANK / DEEP WELL DEVICE PATH ─────────────────────────────────────────────
        const computeTelemetry = (distance, seenAt, status) => {
            const metrics = computeTankMetrics(distance, {
                depthM: depth,
                deadBandM: deviceDoc.data().dead_band_m || deviceDoc.data().deadBand || deviceDoc.data().configuration?.dead_band_m || 0
            });
            const volume = (capacity * metrics.percentage) / 100;
            const normalizedSeen = normalizeThingSpeakTimestamp(seenAt);

            return {
                deviceId: deviceDoc.id,
                distance,
                level_percentage: metrics.percentage,
                volume,
                last_seen: normalizedSeen,
                last_updated_at: normalizedSeen,
                last_value: distance,
                status: status || DEVICE_STATUS.OFFLINE,
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
                ) || metadata.water_level_field || metadata.fieldKey || "field2";

            const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1`;
            logger.debug(`[ThingSpeak] Fetching: ${url}`);
            const response = await axios.get(url, { timeout: 5000 });
            const feeds = response.data?.feeds || [];
            logger.debug(`[ThingSpeak] Response status 200, feeds: ${feeds.length}`);

            if (!feeds || feeds.length === 0) {
                return res.status(200).json(baseTelemetry);
            }

            const lastFeed = feeds[0];
            const distance = parseFloat(lastFeed[sensorFieldKey]) || 0;
            const feedTimestamp = lastFeed.created_at;
            logger.debug(`[ThingSpeak] distance=${distance} (field=${sensorFieldKey})`);

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

            // ✅ SINGLE COLLECTION: Persist to devices
            await db.collection("devices").doc(deviceDoc.id).update(updatePayload).catch(() => null);

            // Sync status with level_percentage in telemetry_snapshot
            syncNodeStatus(deviceDoc.id, type, feedTimestamp, {
                level_percentage: result.level_percentage,
                distance: distance
            }).catch(err => logger.error("Sync error:", err));

            telemetryCache.set(cacheKey, result);
            return res.status(200).json(result);
        } catch (err) {
            return res.status(200).json(baseTelemetry);
        }
    } catch (error) {
        logger.error("Telemetry error:", error);
        res.status(500).json({ error: "Telemetry fetch failure" });
    }
};


exports.getNodeGraphData = async (req, res) => {
    try {
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) return res.status(404).json({ error: "Device not found" });

        const registry = deviceDoc.data();

        // ✅ SINGLE COLLECTION: All metadata lives on the devices document itself
        const metaDoc = await db.collection("devices").doc(deviceDoc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });

        if (req.user.role !== "superadmin") {
            const isOwner = await checkOwnership(req.user.customer_id || req.user.uid, deviceDoc.id, req.user.role, req.user.community_id);
            if (!isOwner) return res.status(403).json({ error: "Unauthorized" });

            // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
            if (!checkDeviceVisibilityWithAudit(registry, deviceDoc.id, req.user.uid, req.user.role)) {
                return res.status(403).json({ error: "Device not visible to your account" });
            }
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
                    status: DEVICE_STATUS.OFFLINE
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
                            status: DEVICE_STATUS.OFFLINE
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
                    status: DEVICE_STATUS.OFFLINE
                }
            });
        }
    } catch (error) {
        logger.error("Graph data error:", error);
        res.status(500).json({ error: "Graph data fetch failure" });
    }
};

/**
 * ✅ NEW: Get Graph Data with Hybrid Caching
 * Supports: 1W (7 days), 1M (30 days), 3M (90 days), custom date ranges
 * Automatically decides: Database (fast) vs ThingSpeak (archived)
 */
exports.getNodeGraphDataHybrid = async (req, res) => {
    try {
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) {
            return res.status(404).json({ error: "Device not found" });
        }

        const registry = deviceDoc.data();

        // ✅ SINGLE COLLECTION: All metadata lives on the devices document itself
        const metaDoc = await db.collection("devices").doc(deviceDoc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });

        // ✅ Authorization check
        if (req.user.role !== "superadmin") {
            const isOwner = await checkOwnership(
                req.user.customer_id || req.user.uid,
                deviceDoc.id,
                req.user.role,
                req.user.community_id
            );
            if (!isOwner) return res.status(403).json({ error: "Unauthorized" });

            if (!checkDeviceVisibilityWithAudit(registry, deviceDoc.id, req.user.uid, req.user.role)) {
                return res.status(403).json({ error: "Device not visible" });
            }
        }

        // ✅ Parse date range from query
        const { range = "1W", startDate, endDate } = req.query;
        let start, end;

        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
        } else {
            end = new Date();
            const daysMap = { "1W": 7, "1M": 30, "3M": 90, "6M": 180 };
            const days = daysMap[range] || 7;
            start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
        }

        logger.debug(`[HybridGraphData] Device: ${deviceDoc.id}, Range: ${range}, Start: ${start.toISOString()}, End: ${end.toISOString()}`);

        // ✅ Check cache first
        const cacheKey = `graph_hybrid_${deviceDoc.id}_${range}_${start.toISOString()}_${end.toISOString()}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
            logger.debug(`✅ [HybridGraphData] Serving from cache`);
            return res.status(200).json({
                ...cached,
                cached: true,
                cacheAge: "< 5 minutes"
            });
        }

        // ✅ Use Hybrid Resolver
        const metadata = metaDoc.data();
        const resolverResult = await HybridDataResolver.resolveAndFetchTelemetry(
            deviceDoc.id,
            start,
            end,
            { limit: 8000 }
        );

        if (!resolverResult.success || resolverResult.data.length === 0) {
            return res.status(200).json({
                data: [],
                range,
                source: resolverResult.source || "unknown",
                message: "No data available",
                metrics: {
                    currentLevel: null,
                    volume: null,
                    fillRate: null,
                    consumption: null,
                    status: DEVICE_STATUS.OFFLINE
                }
            });
        }

        // ✅ Process data for display
        const fieldMapping = metadata.sensor_field_mapping || {};
        const graphData = resolverResult.data.map(record => ({
            timestamp: record.timestamp instanceof Date ? record.timestamp : new Date(record.timestamp),
            ...record
        }));

        // ✅ Apply light smoothing
        const smoothedData = applyLightSmoothing(graphData);
        const metrics = calculateMetrics(smoothedData);

        const responseData = {
            data: smoothedData,
            range,
            source: resolverResult.source,
            dataAge: TelemetryArchiveService.getDataAgeCategory(start.getTime()),
            metrics,
            count: smoothedData.length,
            fetchedAt: new Date().toISOString(),
            cached: false
        };

        // ✅ Cache for 5 minutes (for recent data) or 1 hour (for archived)
        const cacheMinutes = resolverResult.source === "database" ? 5 : 60;
        await cache.set(cacheKey, responseData, cacheMinutes * 60);

        res.status(200).json(responseData);

    } catch (error) {
        logger.error("[HybridGraphData] Error:", error);
        res.status(500).json({
            error: "Graph data fetch failure",
            message: error.message,
            data: [],
            metrics: null
        });
    }
};

exports.getNodeAnalytics = async (req, res) => {
  try {
    const deviceDoc = await resolveDevice(req.params.id);
    if (!deviceDoc || !deviceDoc.exists)
      return res.status(404).json({ error: "Device not found" });

    // ✅ FIX: All metadata is stored directly on the device document in 'devices' collection
    const registry = deviceDoc.data();
    
    // Determine device type
    let rawType = registry.device_type || registry.asset_type || registry.assetType || "";
    let type = rawType.toLowerCase();
    
    if (!type) {
      logger.error(`[getNodeAnalytics] Device ${req.params.id} has no valid device_type. Registry fields:`, Object.keys(registry));
      return res.status(400).json({ error: "Device type not specified", availableFields: Object.keys(registry) });
    }

    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        deviceDoc.id,
        req.user.role,
        req.user.community_id
      );
      if (!isOwner) return res.status(403).json({ error: "Unauthorized" });

      // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
      if (!checkDeviceVisibilityWithAudit(registry, deviceDoc.id, req.user.uid, req.user.role)) {
        return res.status(403).json({ error: "Device not visible to your account" });
      }
    }

    // ✅ FIX: Read all metadata directly from registry (device document)
    const channelId = (registry.thingspeak_channel_id || registry.thingspeakChannelId)?.trim();
    const apiKey = (registry.thingspeak_read_api_key || registry.thingspeak_api_key || registry.thingspeakApiKey)?.trim();
    const fieldMapping = registry.sensor_field_mapping || registry.sensorFieldMapping || {};
    const depth = registry.configuration?.depth || registry.configuration?.total_depth || registry.total_depth || registry.depth || registry.tank_size || 1.2;
    const capacity = registry.tank_size || registry.total_capacity || registry.capacity || 1000;

    const { range, startDate, endDate } = req.query;

    if (!channelId || !apiKey)
      return res.status(400).json({ error: "Telemetry configuration missing" });

    // â”€â”€ Cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const analyticsCacheKey = `analytics_${deviceDoc.id}_${range || '24H'}_${startDate || ''}_${endDate || ''}`;
    const cachedAnalytics = await cache.get(analyticsCacheKey);
    if (cachedAnalytics) {
      logger.debug(`[NodesController] Serving cached analytics for ${deviceDoc.id}`);
      return res.status(200).json(cachedAnalytics);
    }

    // â”€â”€ Build Dynamic ThingSpeak URL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let thingspeakUrl;
    if (range === '1W') {
      thingspeakUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&days=7&results=8000`;
    } else if (range === '1M') {
      thingspeakUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&days=31&results=8000`;
    } else if (startDate && endDate) {
      thingspeakUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&start=${startDate}&end=${endDate}&results=8000`;
    } else {
      // default 24H - fetching 1000 points to cover a full day (at 1-2 min intervals)
      thingspeakUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1000`;
    }

    const response = await axios.get(thingspeakUrl);
    const feeds = response.data.feeds || [];

    if (feeds.length === 0) {
      return res.status(200).json({
        node_id: req.params.id,
        status: DEVICE_STATUS.UNKNOWN,
        history: [],
        tankBehavior: null,
      });
    }

    // â”€â”€ Resolve field key â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const sampleFeed = feeds[0] || {};
    const definedField =
      registry.secondary_field || registry.water_level_field ||
      registry.fieldKey || registry.configuration?.water_level_field ||
      registry.configuration?.fieldKey;
    const fieldKey =
      fieldMapping.levelField || definedField ||
      Object.keys(fieldMapping).find(k => fieldMapping[k] && fieldMapping[k].includes("water_level")) ||
      (sampleFeed.field2 !== undefined ? "field2" : "field1");

    // â”€â”€ FLOW METER path (unchanged) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        }).catch(err => logger.error("Sync error:", err));

        await cache.set(analyticsCacheKey, flowResult, 300);
        return res.status(200).json(flowResult);
      }
      return res.status(200).json({ node_id: req.params.id, status: DEVICE_STATUS.OFFLINE, history: [] });
    }

    // â”€â”€ TDS path â€” Extract TDS and temperature values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (["evaratds", "tds"].includes(type)) {
      const tdsKeys = ['tdsField', 'tds_value', 'tdsValue'];
      const tempKeys = ['tempField', 'temperature', 'temperature_field'];
      
      let tdsFieldKey = Object.keys(fieldMapping).find(k => tdsKeys.includes(fieldMapping[k])) || "field2";
      let tempFieldKey = Object.keys(fieldMapping).find(k => tempKeys.includes(fieldMapping[k])) || "field3";

      if (registry.tdsField) tdsFieldKey = registry.tdsField;
      if (registry.tempField || registry.temperature_field) tempFieldKey = registry.tempField || registry.temperature_field;

      logger.debug(`[TDS-Analytics] Device ${req.params.id}:`);
      logger.debug(`[TDS-Analytics]   tdsField: ${tdsFieldKey}, temperatureField: ${tempFieldKey}`);
      logger.debug(`[TDS-Analytics]   Total feeds: ${feeds.length}`);

      // CRITICAL: Lookup customer name for the Node Info modal
      const effCustomerId = registry?.customer_id || registry?.customerId;
      let customerName = null;
      if (effCustomerId) {
          const customerDoc = await db.collection("customers").doc(effCustomerId).get();
          if (customerDoc.exists) {
              const customerData = customerDoc.data();
              customerName = customerData.display_name || customerData.displayName || customerData.name || customerData.customerName || null;
          }
      }

      if (feeds.length > 0) {
        const latestFeed = getLatestFeed(feeds);
        const lastUpdatedAt = latestFeed?.created_at;
        const status = lastUpdatedAt ? deviceState.calculateDeviceStatus(lastUpdatedAt) : DEVICE_STATUS.OFFLINE;

        const tdsValue = parseFloat(latestFeed[tdsFieldKey]) || 0;
        const temperature = parseFloat(latestFeed[tempFieldKey]) || 0;

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
          location_name: registry?.location_name || "Not specified",
          customer_name: customerName,
          tdsHistory: feeds.map(f => ({
            value: parseFloat(f[tdsFieldKey]) || 0,
            timestamp: normalizeThingSpeakTimestamp(f.created_at)
          })).reverse(),
          tempHistory: feeds.map(f => ({
            value: parseFloat(f[tempFieldKey]) || 0,
            timestamp: normalizeThingSpeakTimestamp(f.created_at)
          })).reverse(),
          // include HEAD format properties
          tds_value: tdsValue,
          history: feeds.map(f => ({
            timestamp: normalizeThingSpeakTimestamp(f.created_at),
            tds_value: parseFloat(f[tdsFieldKey]) || null,
            temperature: parseFloat(f[tempFieldKey]) || null
          }))
        };

        logger.debug(`[TDS-Analytics] Latest TDS: ${tdsResult.tds_value}, Temp: ${tdsResult.temperature}, Customer: ${customerName}`);

        // ✅ FIX: Only update devices collection - metadata is stored on device document
        await db.collection("devices").doc(deviceDoc.id).update({
          status,
          lastUpdatedAt: normalizeThingSpeakTimestamp(lastUpdatedAt),
          last_telemetry: {
            tdsValue,
            temperature,
            waterQualityRating: quality,
            timestamp: normalizeThingSpeakTimestamp(lastUpdatedAt)
          }
        }).catch(err => logger.error("Registry sync error:", err));

        await cache.set(analyticsCacheKey, tdsResult, 300);
        return res.status(200).json(tdsResult);
      }
      return res.status(200).json({ node_id: req.params.id, status: DEVICE_STATUS.OFFLINE, history: [], tdsHistory: [], tempHistory: [] });
    }

    // â”€â”€ TANK path â€” NEW: use analytics engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    // Run the analytics engine â€” THIS is the 200-reading window classification
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

    // ✅ FIX: Update devices collection directly - metadata is stored on device document
    await db.collection("devices").doc(deviceDoc.id).update({
      level_percentage: latestPoint.level,
      currentVolume: latestPoint.volume,
      waterState: analytics.state,
    }).catch(err => logger.error("Device update error:", err));

    await cache.set(analyticsCacheKey, tankResult, 300);
    return res.status(200).json(tankResult);

  } catch (error) {
    logger.error("Tank Engine Error:", error);
    res.status(500).json({ error: "Tank analytics calculation failure" });
  }
};

