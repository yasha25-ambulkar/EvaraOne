const { db } = require("../config/firebase.js");
const { Filter } = require("firebase-admin/firestore");
const cache = require("../config/cache.js");
const telemetryCache = require("../services/cacheService.js");
const { checkOwnership } = require("../middleware/auth.middleware.js");
// ✅ PHASE 2: Cache versioning (Task #11)
const { getVersionKey, incrementCacheVersion } = require("../utils/cacheVersioning.js");
// ✅ PHASE 2: Audit logging (Task #12)
const { logAudit } = require("../utils/auditLogger.js");
// ✅ PHASE 2: HTTP status codes (Task #13)
const AppError = require("../utils/AppError.js");

exports.createZone = async (req, res) => {
    try {

        const {
            zoneName,
            state,
            country,
            zone_code,
            description
        } = req.body;

        if (!zoneName || !state || !country) {
            // ✅ PHASE 2: Task #13 - Use AppError for 400 status
            throw new AppError("Missing required fields", 400, { 
                required: ['zoneName', 'state', 'country'] 
            });
        }

        const zoneData = {
            zoneName,
            state,
            country,
            zone_code: zone_code || "",
            description: description || "",
            created_at: new Date()
        };

        const docRef = await db.collection("zones").add(zoneData);
        
        // ✅ PHASE 2: Task #11 - Use version-based cache invalidation instead of flushPrefix
        await incrementCacheVersion("zones");
        await incrementCacheVersion("default");
        
        // ✅ PHASE 2: Task #12 - Log audit trail
        logAudit(req.user.uid, 'CREATE', 'zones', docRef.id, { 
            zoneName, state, country 
        });

        return res.status(201).json({
            success: true,
            id: docRef.id,
            message: "Zone created successfully"
        });

    } catch (error) {
        // ✅ PHASE 2: Task #13 - Use AppError to properly handle errors
        if (error instanceof AppError) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        
        req.log?.error({ error: error.message, stack: error.stack }, '[AdminController] Create zone error');
        return res.status(500).json({
            error: "Failed to create zone"
        });
    }
};

exports.getZones = async (req, res) => {
    try {
        // ─── #2 FIX: Tenant Isolation + Query Parameter Validation ──────────
        // ✅ PHASE 2: Task #11 - Use versioned cache keys instead of flushPrefix
        const baseCacheKey = `zones_list_${req.user.role}_${req.query.limit || 50}_${req.query.cursor || ''}`;
        const cacheKey = `${baseCacheKey}_v${(await (async () => {
            const versionDoc = await db.collection('_cache_versions').doc('zones').get();
            return versionDoc.exists ? versionDoc.data().version : 1;
        })())}`;
        
        const cached = await cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        // Validate and cap limit parameter (max 100 per query schema)
        const limitStr = Math.min(parseInt(req.query.limit) || 50, 100);
        let query = db.collection("zones").orderBy("created_at").limit(limitStr);

        // For non-superadmins, only return zones in their tenant
        if (req.user.role !== "superadmin") {
            const tenantId = req.user.community_id || req.user.customer_id || req.user.uid;
            query = query.where("tenant_id", "==", tenantId);
        }

        if (req.query.cursor) {
            const cursorDoc = await db.collection("zones").doc(req.query.cursor).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snapshot = await query.get();
        const zones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        await cache.set(cacheKey, zones, 600); // 10 min
        res.status(200).json(zones);
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        req.log?.error({ error: error.message }, '[AdminController] Get zones error');
        res.status(500).json({ error: "Failed to get zones" });
    }
};

exports.getZoneById = async (req, res) => {
    try {
        const doc = await db.collection("zones").doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: "Zone not found" });
        
        // ✅ FIX #4: HARDENED Tenant Isolation Check
        const zoneData = doc.data();
        
        // Superadmin: allow all
        if (req.user.role === "superadmin") {
            return res.status(200).json({ id: doc.id, ...zoneData });
        }

        // Regular user: MUST verify explicit ownership
        const userTenant = req.user.community_id || req.user.customer_id;
        const zoneOwner = zoneData.owner_customer_id || zoneData.owner_community_id;
        
        // No owner_customer_id = orphaned zone (shouldn't exist, but reject it anyway)
        if (!zoneOwner) {
            console.warn(`[Tenant Isolation] Zone ${req.params.id} has no owner — rejecting access`);
            return res.status(404).json({ error: "Zone not found" });
        }

        // Owner must match exactly
        if (zoneOwner !== userTenant) {
            console.warn(`[Tenant Isolation] Unauthorized zone access attempt`, {
                userId: req.user.uid,
                zoneId: req.params.id,
                requestedTenant: userTenant,
                actualOwner: zoneOwner
            });
            return res.status(403).json({ error: "Access denied" });
        }

        // ✅ Owner verified: return zone
        res.status(200).json({ id: doc.id, ...zoneData });
    } catch (error) {
        console.error("[Zone] Get by ID failed:", error.message);
        res.status(500).json({ error: "Failed to get zone" });
    }
};

exports.updateZone = async (req, res) => {
    try {
        const doc = await db.collection("zones").doc(req.params.id).get();
        if (!doc.exists) {
            throw new AppError("Zone not found", 404);
        }
        
        // ✅ FIX #4: HARDENED Tenant Isolation Check
        const zoneData = doc.data();
        
        // Superadmin: allow all
        if (req.user.role === "superadmin") {
            await db.collection("zones").doc(req.params.id).update(req.body);
            // ✅ PHASE 2: Task #11 - Use incrementCacheVersion instead of flushPrefix
            await incrementCacheVersion("zones");
            // ✅ PHASE 2: Task #12 - Log audit trail
            logAudit(req.user.uid, 'UPDATE', 'zones', req.params.id, req.body);
            return res.status(200).json({ success: true });
        }

        // Regular user: MUST verify explicit ownership
        const userTenant = req.user.community_id || req.user.customer_id;
        const zoneOwner = zoneData.owner_customer_id || zoneData.owner_community_id;
        
        // No owner = orphaned zone (shouldn't exist, but reject anyway)
        if (!zoneOwner) {
            throw new AppError("Zone not found", 404);
        }

        // Owner must match exactly
        if (zoneOwner !== userTenant) {
            throw new AppError("Access denied", 403);
        }

        // ✅ Owner verified: proceed with update
        await db.collection("zones").doc(req.params.id).update(req.body);
        await incrementCacheVersion("zones");
        logAudit(req.user.uid, 'UPDATE', 'zones', req.params.id, req.body);
        res.status(200).json({ success: true });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        req.log?.error({ error: error.message }, '[AdminController] Update zone error');
        res.status(500).json({ error: "Failed to update zone" });
    }
};

exports.deleteZone = async (req, res) => {
    try {
        const doc = await db.collection("zones").doc(req.params.id).get();
        if (!doc.exists) {
            throw new AppError("Zone not found", 404);
        }
        
        // ─── #2 FIX: Tenant Isolation Check ─────────────────────────────────
        // ✅ AUDIT FIX M4: Check actual zone ownership fields, not non-existent tenant_id
        const zoneData = doc.data();
        if (req.user.role !== "superadmin") {
            const tenantId = req.user.community_id || req.user.customer_id || req.user.uid;
            const zoneOwner = zoneData.owner_customer_id || zoneData.customer_id || zoneData.tenant_id;
            if (zoneOwner && zoneOwner !== tenantId) {
                throw new AppError("Access denied", 403);
            }
        }
        
        await db.collection("zones").doc(req.params.id).delete();
        // ✅ PHASE 2: Task #11 - Use incrementCacheVersion instead of flushPrefix
        await incrementCacheVersion("zones");
        // ✅ PHASE 2: Task #12 - Log audit trail
        logAudit(req.user.uid, 'DELETE', 'zones', req.params.id);
        res.status(200).json({ success: true });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        req.log?.error({ error: error.message }, '[AdminController] Delete zone error');
        res.status(500).json({ error: "Failed to delete zone" });
    }
};

// Customers
exports.createCustomer = async (req, res) => {
    try {
        const { confirmPassword, ...customerData } = req.body;
        const customer = { ...customerData, created_at: new Date() };
        const doc = await db.collection("customers").add(customer);
        // ✅ PHASE 2: Task #11 - Use incrementCacheVersion instead of flushPrefix
        await incrementCacheVersion("customers");
        await incrementCacheVersion("default");
        // ✅ PHASE 2: Task #12 - Log audit trail
        logAudit(req.user.uid, 'CREATE', 'customers', doc.id, customerData);
        res.status(201).json({ success: true, id: doc.id });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        req.log?.error({ error: error.message }, '[AdminController] Create customer error');
        res.status(500).json({ error: "Failed to create customer" });
    }
};

exports.getCustomers = async (req, res) => {
    try {
        const { zone_id, community_id, regionFilter, limit, cursor } = req.query;

        const cacheParams = [
            req.user.role,
            zone_id || 'all',
            community_id || 'all',
            regionFilter || 'all',
            limit || '50',
            cursor || 'none'
        ].join(':');

        const cacheKey = req.user.role === "superadmin" ? `user:admin:customers:${cacheParams}` : `user:${req.user.uid}:customers:${cacheParams}`;
        const cached = await cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const limitStr = parseInt(limit) || 50;
        let query = db.collection("customers");

        console.log(`[AdminController] getCustomers query:`, { zone_id, community_id, role: req.user.role });

        if (req.user.role !== "superadmin") {
            query = query.where("id", "==", req.user.customer_id || req.user.uid);
        } else {
            // REMOVED orderBy("created_at") to avoid complex index requirements that cause silent failures

            if (zone_id && zone_id.trim() !== '') {
                // Primary Filter
                query = query.where("zone_id", "==", zone_id.trim());
            } else if (regionFilter && regionFilter.trim() !== '') {
                query = query.where("regionFilter", "==", regionFilter.trim());
            } else if (community_id && community_id.trim() !== '') {
                query = query.where("community_id", "==", community_id.trim());
            }
        }

        query = query.limit(limitStr);

        if (cursor) {
            const cursorDoc = await db.collection("customers").doc(cursor).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snapshot = await query.get();
        let customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // COMPREHENSIVE FALLBACK: Check alternative field names (zoneId, regionFilter) if no results for zone_id
        if (req.user.role === "superadmin" && zone_id && customers.length === 0) {
            console.log(`[AdminController] No customers found for zone_id: ${zone_id}, trying fallbacks...`);

            // Try zoneId (camelCase)
            const zoneIdSnapshot = await db.collection("customers").where("zoneId", "==", zone_id.trim()).limit(limitStr).get();
            if (!zoneIdSnapshot.empty) {
                console.log(`[AdminController] Found ${zoneIdSnapshot.size} customers via zoneId fallback`);
                customers = [...customers, ...zoneIdSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
            }

            // Try regionFilter (legacy)
            const regionSnapshot = await db.collection("customers").where("regionFilter", "==", zone_id.trim()).limit(limitStr).get();
            if (!regionSnapshot.empty) {
                console.log(`[AdminController] Found ${regionSnapshot.size} customers via regionFilter fallback`);
                // Deduplicate by ID
                const existingIds = new Set(customers.map(c => c.id));
                regionSnapshot.docs.forEach(doc => {
                    if (!existingIds.has(doc.id)) {
                        customers.push({ id: doc.id, ...doc.data() });
                        existingIds.add(doc.id);
                    }
                });
            }
        }

        console.log(`[AdminController] Successfully fetched ${customers.length} customers`);
        await cache.set(cacheKey, customers, 600); // 10 min
        res.status(200).json(customers);
    } catch (error) {
        console.error("[AdminController] getCustomers CRITICAL ERROR:", error);
        res.status(500).json({ error: "Failed to get customers" });
    }
};

exports.getCustomerById = async (req, res) => {
    try {
        // ─── #2 FIX: Tenant Isolation Check ─────────────────────────────────
        // Superadmins can view any customer
        // Regular users can only view their own customer record
        if (req.user.role !== "superadmin" && req.params.id !== req.user.customer_id && req.params.id !== req.user.uid) {
            return res.status(403).json({ error: "Access denied: you do not have permission to view this customer" });
        }
        
        const doc = await db.collection("customers").doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: "Customer not found" });
        res.status(200).json({ id: doc.id, ...doc.data() });
    } catch (error) {
        res.status(500).json({ error: "Failed to get customer" });
    }
};

exports.updateCustomer = async (req, res) => {
    try {
        // ─── #2 FIX: Tenant Isolation Check ─────────────────────────────────
        if (req.user.role !== "superadmin" && req.params.id !== req.user.customer_id && req.params.id !== req.user.uid) {
            throw new AppError("Access denied", 403);
        }
        
        await db.collection("customers").doc(req.params.id).update(req.body);
        // ✅ PHASE 2: Task #11 - Use incrementCacheVersion instead of flushPrefix
        await incrementCacheVersion("customers");
        // ✅ PHASE 2: Task #12 - Log audit trail
        logAudit(req.user.uid, 'UPDATE', 'customers', req.params.id, req.body);
        res.status(200).json({ success: true });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        req.log?.error({ error: error.message }, '[AdminController] Update customer error');
        res.status(500).json({ error: "Failed to update customer" });
    }
};

exports.deleteCustomer = async (req, res) => {
    try {
        // ─── #2 FIX: Tenant Isolation Check ─────────────────────────────────
        if (req.user.role !== "superadmin") {
            throw new AppError("Access denied", 403);
        }
        
        await db.collection("customers").doc(req.params.id).delete();
        // ✅ PHASE 2: Task #11 - Use incrementCacheVersion instead of flushPrefix
        await incrementCacheVersion("customers");
        // ✅ PHASE 2: Task #12 - Log audit trail
        logAudit(req.user.uid, 'DELETE', 'customers', req.params.id);
        res.status(200).json({ success: true });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        req.log?.error({ error: error.message }, '[AdminController] Delete customer error');
        res.status(500).json({ error: "Failed to delete customer" });
    }
};

// Nodes (Registry + Metadata Architecture)
exports.createNode = async (req, res) => {
    try {
        // Log complete request body immediately
        console.log(`\n[createNode] 📨 RECEIVED REQUEST BODY:`);
        console.log(`[createNode]   Complete body:`, JSON.stringify(req.body, null, 2));
        console.log(`[createNode]   Body keys:`, Object.keys(req.body));
        
        const {
            displayName,
            deviceName,
            assetType,
            zoneId,
            customerId,
            thingspeakChannelId,
            thingspeakReadKey,
            waterLevelField,
            borewellDepthField,
            meterReadingField,
            flowRateField,
            tdsField,
            temperatureField,
            capacity,
            depth,
            tankLength,
            tankBreadth,
            staticDepth,
            dynamicDepth,
            rechargeThreshold,
            latitude,
            longitude,
            hardwareId,
            id: fallbackId
        } = req.body;

        // 🔍 DEBUG: Log immediately after destructuring
        console.log(`\n[createNode] 📥 DESTRUCTURED FROM req.body:`);
        console.log(`[createNode]   hardwareId: "${hardwareId}"`);
        console.log(`[createNode]   thingspeakChannelId: "${thingspeakChannelId}"`);
        console.log(`[createNode]   thingspeakReadKey: "${thingspeakReadKey}"`);
        console.log(`[createNode]   assetType: "${assetType}"`);
        console.log(`[createNode]   Full req.body keys:`, Object.keys(req.body));

        const timestamp = new Date();
        const idForDevice = hardwareId || `DEV-${Date.now()}`;
        
        // ⚠️ CRITICAL: For TDS devices, hardwareId MUST be provided
        if ((assetType === "EvaraTDS" || assetType === "evaratds" || assetType === "tds") && !hardwareId) {
            console.error(`[createNode] ❌ CRITICAL: TDS device created without hardwareId!`);
            return res.status(400).json({
                error: "TDS devices require a hardware ID (node_key)",
                receivedAssetType: assetType,
                receivedHardwareId: hardwareId
            });
        }
        
        console.log(`[createNode] Generated idForDevice: "${idForDevice}"`);
        const typeNormalized = (assetType || "evaratank").toLowerCase();

        // ============================================================================
        // ✅ TASK #6 — Validate device type BEFORE creating batch
        // Errors before batch creation = no database writes at all
        // ============================================================================
        let targetCol = "";
        if (typeNormalized === "evaratank" || typeNormalized === "tank" || assetType === "EvaraTank") {
            targetCol = "evaratank";
        } else if (typeNormalized === "evaradeep" || typeNormalized === "deep" || assetType === "EvaraDeep") {
            targetCol = "evaradeep";
        } else if (typeNormalized === "evaraflow" || typeNormalized === "flow" || assetType === "EvaraFlow") {
            targetCol = "evaraflow";
        } else if (typeNormalized === "evaratds" || typeNormalized === "tds" || assetType === "EvaraTDS") {
            targetCol = "evaratds";
        } else {
            // Unknown device type — reject BEFORE touching database
            return res.status(400).json({
                error: `Unknown asset type: "${assetType}"`,
                validTypes: ['evaratank', 'evaradeep', 'evaraflow', 'evaratds'],
            });
        }

        // ============================================================================
        // ✅ TASK #6 — Create a batch (shopping cart)
        // Nothing is written until batch.commit() is called
        // ============================================================================
        const batch = db.batch();

        // ✅ FIX #5: Generate API key for MQTT authentication
        const crypto = require('crypto');
        const apiKey = crypto.randomBytes(32).toString('hex');
        const apiKeyHash = crypto
          .createHash('sha256')
          .update(apiKey)
          .digest('hex');

        // 1. Prepare REGISTRY entry (Minimal + Ownership for efficient filtering)
        const registryData = {
            device_id: idForDevice,
            device_type: typeNormalized,
            node_id: idForDevice,
            customer_id: customerId || "",
            api_key_hash: apiKeyHash, // ✅ FIX #5: Store hash only (never the key itself)
            // Default visibility: true so device shows to customer when first created
            isVisibleToCustomer: true,
            // Default customer_config: all parameters ON
            customer_config: {
                showAlerts: true,
                showConsumption: true,
                showDeviceHealth: true,
                showEstimations: true,
                showFillRate: true,
                showMap: true,
                showTankLevel: true,
                showVolume: true
            },
            // ✅ FIX: Set analytics_template so frontend can filter by device type
            analytics_template: assetType || "EvaraTank",
            created_at: timestamp
        };

        // Reserve a spot in devices collection
        const deviceDocRef = db.collection("devices").doc();
        const deviceDocId = deviceDocRef.id;
        
        console.log(`[createNode] 📌 CRITICAL: Generating document IDs`);
        console.log(`[createNode]   Generated Firestore ID: ${deviceDocId}`);
        console.log(`[createNode]   Hardware ID (device_id/node_id): ${idForDevice}`);
        console.log(`[createNode]   Target collection: ${targetCol}`);
        console.log(`[createNode] 🔍 REGISTRY DATA TO BE WRITTEN:`);
        console.log(`[createNode]   device_type: "${registryData.device_type}"`);
        console.log(`[createNode]   device_id: "${registryData.device_id}"`);
        console.log(`[createNode]   node_id: "${registryData.node_id}"`);
        console.log(`[createNode]   All keys:`, Object.keys(registryData));
        
        batch.set(deviceDocRef, registryData); // Queue but don't write yet
        console.log(`[createNode] ✅ Registry batch.set() queued for devices/${deviceDocId}`);

        // 🔍 DEBUG: Log what we received from frontend
        console.log(`\n[createNode] 🎯 RECEIVED FROM FRONTEND:`);
        console.log(`[createNode]   thingspeakChannelId value: "${thingspeakChannelId}"`);
        console.log(`[createNode]   thingspeakReadKey value: "${thingspeakReadKey}"`);
        console.log(`[createNode]   assetType: "${assetType}"`);

        // 2. Prepare METADATA entry (Detailed)
        let metadata = {
            device_id: idForDevice,
            node_id: idForDevice,
            label: displayName || deviceName || "Unnamed",
            device_name: deviceName || displayName || "Unknown Device",
            thingspeak_read_api_key: thingspeakReadKey || "",
            thingspeak_channel_id: thingspeakChannelId || "",
            customer_id: customerId || "",
            zone_id: zoneId || "",
            latitude: parseFloat(latitude) || null,
            longitude: parseFloat(longitude) || null,
            created_at: timestamp,
            updated_at: timestamp
        };

        // 🔍 DEBUG: Log metadata BEFORE adding device type specific data
        console.log(`[createNode] 📝 METADATA BASE CREATED:`);
        console.log(`[createNode]   thingspeak_channel_id will be: "${metadata.thingspeak_channel_id}"`);
        console.log(`[createNode]   thingspeak_read_api_key will be: "${metadata.thingspeak_read_api_key}"`);

        // ✅ FIX #7: Add PROPER FIELD MAPPING SCHEMA (Semantic names → ThingSpeak fields)
        // BEFORE: sensor_field_mapping had backwards mapping [field] → "semantic_name"
        // AFTER: New "fields" object maps semantic names → actual field numbers
        // This lets backend do: device.fields.tds instead of hardcoded field1/field2
        
        if (targetCol === "evaratank") {
            metadata.tank_size = capacity || 0;
            metadata.configuration = {
                tank_length: tankLength || 0,
                tank_breadth: tankBreadth || 0,
                depth: depth || 0
            };
            const levelField = waterLevelField || "field2";
            // NEW: Semantic field name → ThingSpeak field number
            metadata.fields = {
                water_level: levelField  // e.g., "field2"
            };
            metadata.sensor_field_mapping = { [levelField]: "water_level_raw_sensor_reading" };
        } else if (targetCol === "evaradeep") {
            metadata.configuration = {
                total_depth: depth || 0,
                static_water_level: staticDepth || 0,
                dynamic_water_level: dynamicDepth || 0,
                recharge_threshold: rechargeThreshold || 0
            };
            const depthField = borewellDepthField || "field2";
            metadata.fields = {
                water_level: depthField
            };
            metadata.sensor_field_mapping = { [depthField]: "water_level_in_cm" };
        } else if (targetCol === "evaraflow") {
            metadata.configuration = {};
            const rateField = flowRateField || "field2";
            const readingField = meterReadingField || "field1";
            metadata.fields = {
                flow_rate: rateField,
                total_liters: readingField
            };
            metadata.sensor_field_mapping = {
                [rateField]: "flow_rate",
                [readingField]: "current_reading"
            };
            console.log(`[createNode-FLOW] 📝 Storing Flow metadata:`);
            console.log(`[createNode-FLOW]   Channel ID: "${metadata.thingspeak_channel_id}"`);
            console.log(`[createNode-FLOW]   API Key: "${metadata.thingspeak_read_api_key ? '***' : 'EMPTY'}"`);
        } else if (targetCol === "evaratds") {
            metadata.configuration = {
                type: "TDS",
                unit: "ppm",
                min_threshold: 0,
                max_threshold: 2000
            };
            // NEW: Use user-provided TDS/Temperature field mapping from frontend
            const userTdsField = req.body.tdsField || req.body.tds_field || "field2";
            const userTempField = req.body.temperatureField || req.body.temperature_field || "field3";
            metadata.fields = {
                tds: userTdsField,
                temperature: userTempField
            };
            metadata.sensor_field_mapping = {
                [userTdsField]: "tdsValue",
                [userTempField]: "temperature"
            };
            metadata.tdsValue = req.body.tdsValue || 0;
            metadata.temperature = req.body.temperature || 0;
            metadata.waterQualityRating = req.body.waterQualityRating || "Good";
            metadata.location = req.body.location || "";
            metadata.status = req.body.status || "online";
            metadata.lastUpdated = timestamp;
            metadata.tdsHistory = [];
            metadata.tempHistory = [];
            
            console.log(`[createNode-TDS] 📝 Storing TDS metadata:`);
            console.log(`[createNode-TDS]   Channel ID: "${metadata.thingspeak_channel_id}"`);
            console.log(`[createNode-TDS]   API Key: "${metadata.thingspeak_read_api_key ? '***' : 'MISSING'}"`);
            console.log(`[createNode-TDS]   TDS Field: "${userTdsField}"`);
            console.log(`[createNode-TDS]   Temperature Field: "${userTempField}"`);
            console.log(`[createNode-TDS]   device_id: "${metadata.device_id}"`);
            console.log(`[createNode-TDS]   node_id: "${metadata.node_id}"`);
            console.log(`[createNode-TDS]   Fields mapping:`, metadata.fields);
        }

        // Critical Fix: Use SAME document ID for metadata as registry
        // This ensures fetch can find metadata using the registry document ID
        console.log(`[createNode] � QUEUING METADATA BATCH OPERATION`);
        console.log(`[createNode]   Target collection: ${targetCol}`);
        console.log(`[createNode]   Document ID: ${deviceDocId}`);
        console.log(`[createNode]   Metadata object keys:`, Object.keys(metadata));
        console.log(`[createNode]   device_id in metadata: "${metadata.device_id}"`);
        console.log(`[createNode]   node_id in metadata: "${metadata.node_id}"`);
        
        const metadataRef = db.collection(targetCol).doc(deviceDocId);
        batch.set(metadataRef, metadata);
        console.log(`[createNode] ✅ Metadata batch.set() queued for ${targetCol}/${deviceDocId}`);

        console.log(`\n[createNode-ALL] 🎯 STORING in ${targetCol} collection:`);
        console.log(`[createNode-ALL] Document ID: ${deviceDocId}`);
        console.log(`[createNode-ALL] hardware ID (device_id/node_id): ${idForDevice}`);
        console.log(`[createNode-ALL] device_type: ${typeNormalized}`);
        console.log(`[createNode-ALL] Full registry keys:`, Object.keys(registryData));
        console.log(`[createNode-ALL] Full metadata keys:`, Object.keys(metadata));
        console.log(`[createNode-ALL] Registry device_id: ${registryData.device_id}`);
        console.log(`[createNode-ALL] Registry node_id: ${registryData.node_id}`);
        console.log(`[createNode-ALL] Metadata device_id: ${metadata.device_id}`);
        console.log(`[createNode-ALL] Metadata node_id: ${metadata.node_id}`);
        console.log(`[createNode-ALL] thingspeak_channel_id VALUE:`, metadata.thingspeak_channel_id);
        console.log(`[createNode-ALL] thingspeak_read_api_key VALUE:`, metadata.thingspeak_read_api_key);
        
        // ⚠️ VALIDATION: Ensure required fields are present
        if (!metadata.device_id) {
            throw new Error(`[VALIDATION FAILED] Metadata device_id is empty or missing!`);
        }
        if (!metadata.node_id) {
            throw new Error(`[VALIDATION FAILED] Metadata node_id is empty or missing!`);
        }
        if (!metadata.thingspeak_channel_id || !metadata.thingspeak_read_api_key) {
            console.warn(`[VALIDATION WARNING] ThingSpeak credentials missing for TDS device - will not be able to fetch telemetry`);
        }
        
        console.log(`[createNode-ALL] 📋 COMPLETE METADATA OBJECT:`, JSON.stringify(metadata, null, 2));
        console.log(`[createNode-ALL] 📋 COMPLETE REGISTRY OBJECT:`, JSON.stringify(registryData, null, 2));

        // Write BOTH documents at once with matching IDs
        // If batch.commit() fails, NEITHER document is written
        console.log(`[createNode-ALL] ⏳ READY TO COMMIT BATCH`);
        console.log(`[createNode-ALL] Batch will contain:`);
        console.log(`[createNode-ALL]   1. Registry: devices/${deviceDocId}`);
        console.log(`[createNode-ALL]   2. Metadata: ${targetCol}/${deviceDocId}`);
        console.log(`[createNode-ALL] User: ${customerId}`);
        console.log(`[createNode-ALL] Firestore batch object type: ${batch.constructor.name}`);
        
        try {
            console.log(`[createNode-ALL] ⏳ NOW COMMITTING BATCH...`);
            await batch.commit();
            console.log(`[createNode-ALL] ✅ Batch.commit() SUCCEEDED!`);
            console.log(`[createNode-ALL] ✅ Should have written to:`);
            console.log(`[createNode-ALL]    - devices/${deviceDocId}`);
            console.log(`[createNode-ALL]    - ${targetCol}/${deviceDocId}`);
        } catch (batchErr) {
            console.error(`[createNode-ALL] ❌ BATCH COMMIT FAILED:`);
            console.error(`[createNode-ALL] Error name: ${batchErr.name}`);
            console.error(`[createNode-ALL] Error message: ${batchErr.message}`);
            console.error(`[createNode-ALL] Error code: ${batchErr.code}`);
            console.error(`[createNode-ALL] Full error:`, JSON.stringify(batchErr, null, 2));
            
            // FALLBACK: Try writing REGISTRY directly to devices collection
            console.log(`[createNode-ALL] 🔄 ATTEMPTING FALLBACK: Direct write to devices collection`);
            try {
                await db.collection("devices").doc(deviceDocId).set(registryData);
                console.log(`[createNode-ALL] ✅ FALLBACK SUCCEEDED: Registry written directly to devices/${deviceDocId}`);
                
                // Now try metadata
                console.log(`[createNode-ALL] 🔄 ATTEMPTING FALLBACK: Direct write to ${targetCol} collection`);
                await db.collection(targetCol).doc(deviceDocId).set(metadata);
                console.log(`[createNode-ALL] ✅ FALLBACK SUCCEEDED: Metadata written directly to ${targetCol}/${deviceDocId}`);
            } catch (fallbackErr) {
                console.error(`[createNode-ALL] ❌ FALLBACK ALSO FAILED:`);
                console.error(`[createNode-ALL] Error: ${fallbackErr.message}`);
                throw new Error(`Failed to create device: ${fallbackErr.message}`);
            }
        }

        // VERIFICATION: Check that both documents were actually written
        console.log(`[createNode-ALL] 🔍 VERIFYING writes...`);
        let registryValid = false;
        let metadataValid = false;
        
        try {
            console.log(`[createNode-ALL] 🔍 Checking devices/${deviceDocId}...`);
            const verifyRegistry = await db.collection("devices").doc(deviceDocId).get();
            if (verifyRegistry.exists) {
                console.log(`[createNode-ALL] ✅ VERIFIED: Registry document EXISTS in devices/${deviceDocId}`);
                const regData = verifyRegistry.data();
                console.log(`[createNode-ALL]    device_id: "${regData.device_id}"`);
                console.log(`[createNode-ALL]    node_id: "${regData.node_id}"`);
                console.log(`[createNode-ALL]    device_type: "${regData.device_type}"`);
                console.log(`[createNode-ALL]    assetType: "${regData.assetType}"`);
                console.log(`[createNode-ALL]    displayName: "${regData.displayName}"`);
                console.log(`[createNode-ALL]    All registry keys:`, Object.keys(regData).join(", "));
                
                if (regData.device_id && regData.node_id) {
                    registryValid = true;
                    console.log(`[createNode-ALL] ✅ Registry has required fields (device_id, node_id)`);
                } else {
                    console.error(`[createNode-ALL] ❌ WARNING: Registry missing device_id or node_id!`);
                }
            } else {
                console.error(`[createNode-ALL] ❌ CRITICAL: Registry document NOT found in devices/${deviceDocId}`);
            }

            console.log(`[createNode-ALL] 🔍 Checking ${targetCol}/${deviceDocId}...`);
            const verifyMetadata = await db.collection(targetCol).doc(deviceDocId).get();
            if (verifyMetadata.exists) {
                console.log(`[createNode-ALL] ✅ VERIFIED: Metadata document EXISTS in ${targetCol}/${deviceDocId}`);
                metadataValid = true;
                const metaData = verifyMetadata.data();
                console.log(`[createNode-ALL]    device_id: "${metaData.device_id}"`);
                console.log(`[createNode-ALL]    node_id: "${metaData.node_id}"`);
                console.log(`[createNode-ALL]    thingspeak_channel_id: "${metaData.thingspeak_channel_id}"`);
                console.log(`[createNode-ALL]    thingspeak_read_api_key: ${metaData.thingspeak_read_api_key ? '✅ SET' : '❌ MISSING'}`);
                console.log(`[createNode-ALL]    All metadata keys:`, Object.keys(metaData).join(", "));
            } else {
                console.error(`[createNode-ALL] ❌ CRITICAL: Metadata document NOT found in ${targetCol}/${deviceDocId}`);
                console.error(`[createNode-ALL]    This means batch.set() for metadata DID NOT WORK!`);
                console.error(`[createNode-ALL]    Collection: ${targetCol}`);
                console.error(`[createNode-ALL]    Expected to see collection in Firestore, but it's empty or doesn't exist!`);
            }
        } catch (verifyErr) {
            console.error(`[createNode-ALL] ❌ Verification check threw exception:`, verifyErr.message);
            console.error(`[createNode-ALL]    Stack:`, verifyErr.stack);
        }
        
        console.log(`[createNode-ALL] ─── VERIFICATION SUMMARY ───`);
        console.log(`[createNode-ALL]    Registry written: ${registryValid ? '✅' : '❌'}`);
        console.log(`[createNode-ALL]    Metadata written: ${metadataValid ? '✅' : '❌'}`);
        if (!metadataValid) {
            console.error(`[createNode-ALL] ⚠️  CRITICAL ISSUE: Metadata not written! Device will be unfetchable!`);
        }

        // SaaS Invalidation: Flush all user-specific and aggregate dashboard caches
        try {
            await Promise.all([
                cache.flushPrefix("nodes_"),
                cache.flushPrefix("user:"),
                cache.flushPrefix("dashboard_init_"),
                cache.flushPrefix("dashboard_summary_")
            ]);
        } catch (cacheErr) {
            // Cache clear failure is not fatal — device was already created successfully
            console.warn('[Device] Cache clear failed:', cacheErr.message);
        }

        // ✅ FIX #8: EMIT REAL-TIME SOCKET EVENT (CRITICAL)
        // BEFORE: Only cache invalidated, frontend waited 12s for polling or refresh
        // AFTER: Socket event pushes new device to all connected clients immediately
        try {
            if (global.io) {
                const fullDevice = {
                    id: deviceDocId,
                    node_key: deviceDocId,
                    ...registryData,
                    ...metadata
                };
                
                // Broadcast to all connected clients of this customer
                global.io.to(`customer:${customerId}`).emit("device:added", {
                    device: fullDevice,
                    timestamp: new Date().toISOString()
                });
                console.log(`[Device] 📡 Emitted device:added to customer ${customerId}`);
            }
        } catch (socketErr) {
            console.warn('[Device] Socket emission failed (non-fatal):', socketErr.message);
        }

        return res.status(201).json({
            success: true,
            deviceId: deviceDocId,
            device_id: idForDevice,
            device_type: typeNormalized,
            target_collection: targetCol,
            api_key: apiKey, // ✅ FIX #5: Return the API key to client (ONE TIME ONLY)
            message: "Device created successfully",
            verification: {
                registry_stored: {
                    deviceId: deviceDocId,
                    device_id: idForDevice,
                    device_type: typeNormalized,
                    node_id: idForDevice,
                    customer_id: customerId
                },
                metadata_stored: {
                    target_collection: targetCol,
                    documentId: deviceDocId,
                    has_channel_id: !!thingspeakChannelId,
                    has_api_key: !!thingspeakReadKey
                }
            }
        });
    } catch (error) {
        console.error('\n[Device] ❌ CREATE DEVICE FAILED:');
        console.error(`[Device] Error message: ${error.message}`);
        console.error(`[Device] Error code: ${error.code}`);
        console.error(`[Device] Full error:`, error);
        console.error(`[Device] Stack trace:`, error.stack);
        
        // Return error response with details for debugging
        res.status(500).json({ 
            error: "Failed to create device",
            details: error.message,
            code: error.code,
            troubleshooting: "Check backend logs for detailed error information"
        });
    }
};

exports.getNodes = async (req, res) => {
    try {
        console.log(`[AdminController] getNodes for user:`, req.user.uid, "role:", req.user.role);
        const nodesCacheKey = req.user.role === "superadmin"
            ? "user:admin:devices"
            : `user:${req.user.customer_id || req.user.uid}:devices`;
        console.log(`[AdminController] Cache Key:`, nodesCacheKey);
        const cachedNodes = await cache.get(nodesCacheKey);
        if (cachedNodes) return res.status(200).json(cachedNodes);

        const limitStr = parseInt(req.query.limit) || 100;
        let query = db.collection("devices");

        if (req.user.role !== "superadmin") {
            // Customers only see devices where isVisibleToCustomer is true
            query = query
                .where("customer_id", "==", req.user.customer_id || req.user.uid)
                .where("isVisibleToCustomer", "==", true);
        }

        const snapshot = await query.limit(limitStr).get();

        // Batched Metadata Fetching (Eliminates N+1 reads)
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

        const devices = [];
        const typeBatches = await Promise.all(
            Object.keys(typedGroups).map(async (type) => {
                const ids = typedGroups[type];
                const refs = ids.map(id => db.collection(type.toLowerCase()).doc(id));
                const metas = await db.getAll(...refs);
                return metas.map(m => m.exists ? { id: m.id, meta: m.data(), type } : null).filter(Boolean);
            })
        );

        for (const batch of typeBatches) {
            for (const item of batch) {
                const { id, meta } = item;
                if (req.user.role !== "superadmin" && meta.customer_id !== req.user.uid) continue;

                const { thingspeak_read_api_key, ...safeMeta } = meta;
                const registryData = registryDataMap[id];

                // ✅ FIX: Map device_type to analytics_template if missing
                let analyticsTemplate = registryData.analytics_template;
                if (!analyticsTemplate) {
                    const deviceType = (registryData.device_type || "").toLowerCase();
                    console.log(`[AdminController] Auto-injecting analytics_template for device ${id}: device_type="${deviceType}"`);
                    if (deviceType === "evaratank") analyticsTemplate = "EvaraTank";
                    else if (deviceType === "evaradeep") analyticsTemplate = "EvaraDeep";
                    else if (deviceType === "evaraflow") analyticsTemplate = "EvaraFlow";
                    else if (deviceType === "evaratds") analyticsTemplate = "EvaraTDS";
                    else analyticsTemplate = "EvaraTank"; // default
                    console.log(`[AdminController] Injected: analyticsTemplate="${analyticsTemplate}"`);
                }

                const deviceObject = {
                    id,
                    ...registryData,
                    ...safeMeta,
                    analytics_template: analyticsTemplate // ✅ Ensure field exists
                };

                // For customers: filter out hidden parameters from customer_config
                if (req.user.role !== "superadmin" && registryData.customer_config) {
                    deviceObject.customer_config = registryData.customer_config;
                }

                devices.push(deviceObject);
            }
        }

        console.log(`[AdminController] Final devices with analytics_template:`, devices.map(d => ({ id: d.id, type: d.device_type, template: d.analytics_template })));

        await cache.set(nodesCacheKey, devices, 300); // 5 min
        res.status(200).json(devices);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch devices" });
    }
};

/**
 * Helper to resolve device by document ID OR device_id
 */
// ✅ AUDIT FIX L2: Use shared resolveDevice utility (was duplicated in 3 controllers)
const resolveDevice = require("../utils/resolveDevice.js");

exports.updateNode = async (req, res) => {
    try {
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) return res.status(404).json({ error: "Device not found" });

        const type = (deviceDoc.data().device_type || "").toLowerCase();
        if (!type) return res.status(400).json({ error: "Device type not specified" });
        const metaRef = db.collection(type).doc(deviceDoc.id);

        // Sanitize and support both naming conventions
        const body = req.body;
        const trimmed = (val) => (typeof val === "string" ? val.trim() : val);

        const metaUpdate = { updated_at: new Date() };

        // General fields
        if (body.displayName || body.label) metaUpdate.label = trimmed(body.displayName || body.label);
        if (body.deviceName || body.device_name) metaUpdate.device_name = trimmed(body.deviceName || body.device_name);

        // ThingSpeak credentials (flexible naming)
        const readKey = body.thingspeakReadKey || body.thingspeak_read_key || body.thingspeak_read_api_key;
        if (readKey) metaUpdate.thingspeak_read_api_key = trimmed(readKey);

        const channelId = body.thingspeakChannelId || body.thingspeak_channel_id;
        if (channelId) metaUpdate.thingspeak_channel_id = trimmed(channelId);

        if (body.customerId || body.customer_id) {
            const cid = trimmed(body.customerId || body.customer_id);
            metaUpdate.customer_id = cid;
            // Also sync to registry
            await db.collection("devices").doc(deviceDoc.id).update({ customer_id: cid });
        }

        if (body.latitude !== undefined) metaUpdate.latitude = parseFloat(body.latitude);
        if (body.longitude !== undefined) metaUpdate.longitude = parseFloat(body.longitude);

        // Type-specific updates (flexible naming)
        if (type === "evaratank" || type === "tank") {
            const cap = body.capacity || body.tank_size || body.capacity_liters || body.capacity_liters_override;
            if (cap !== undefined) metaUpdate.tank_size = parseFloat(cap) || 0;

            const config = {};
            const depthVal = body.depth || body.height_m || body.max_depth || body.tank_height;
            if (depthVal !== undefined) config.depth = parseFloat(depthVal) || 0;

            const len = body.tankLength || body.length_m || body.tank_length;
            if (len !== undefined) config.tank_length = parseFloat(len) || 0;

            const br = body.tankBreadth || body.breadth_m || body.tank_breadth;
            if (br !== undefined) config.tank_breadth = parseFloat(br) || 0;

            const rad = body.radius || body.radius_m || body.tank_radius;
            if (rad !== undefined) config.tank_radius = parseFloat(rad) || 0;

            if (Object.keys(config).length > 0) metaUpdate.configuration = config;

            const field = body.waterLevelField || body.water_level_field;
            if (field) {
                metaUpdate.sensor_field_mapping = { [trimmed(field)]: "water_level_raw_sensor_reading" };
            }
        } else if (type === "evaradeep") {
            const config = {};
            const depthVal = body.depth || body.total_bore_depth || body.total_depth;
            if (depthVal !== undefined) config.total_depth = parseFloat(depthVal) || 0;

            const stat = body.staticDepth || body.static_water_level || body.static_depth;
            if (stat !== undefined) config.static_water_level = parseFloat(stat) || 0;

            const dyn = body.dynamicDepth || body.dynamic_water_level || body.dynamic_depth;
            if (dyn !== undefined) config.dynamic_water_level = parseFloat(dyn) || 0;

            const thres = body.rechargeThreshold || body.recharge_threshold;
            if (thres !== undefined) config.recharge_threshold = parseFloat(thres) || 0;

            if (Object.keys(config).length > 0) metaUpdate.configuration = config;

            const field = body.borewellDepthField || body.water_level_field || body.depth_field;
            if (field) {
                metaUpdate.sensor_field_mapping = { [trimmed(field)]: "water_level_in_cm" };
            }
        } else if (type === "evaraflow") {
            const config = {};
            if (body.maxFlowRate || body.max_flow_rate) config.max_flow_rate = parseFloat(body.maxFlowRate || body.max_flow_rate) || 0;
            if (Object.keys(config).length > 0) metaUpdate.configuration = config;

            if (body.flowRateField || body.meterReadingField || body.flow_rate_field || body.meter_reading_field) {
                const docData = (await metaRef.get()).data();
                const currentMap = docData.sensor_field_mapping || {};

                let rateField = body.flowRateField || body.flow_rate_field;
                if (!rateField) rateField = Object.keys(currentMap).find(k => currentMap[k] === "flow_rate") || "field2";

                let readingField = body.meterReadingField || body.meter_reading_field;
                if (!readingField) readingField = Object.keys(currentMap).find(k => currentMap[k] === "current_reading") || "field1";

                metaUpdate.sensor_field_mapping = {
                    [trimmed(rateField)]: "flow_rate",
                    [trimmed(readingField)]: "current_reading"
                };
            }
        } else if (type === "evaratds" || type === "tds") {
            // TDS device configuration updates
            const config = {};
            if (body.configuration) {
                if (body.configuration.min_threshold !== undefined) config.min_threshold = parseFloat(body.configuration.min_threshold) || 0;
                if (body.configuration.max_threshold !== undefined) config.max_threshold = parseFloat(body.configuration.max_threshold) || 2000;
            }
            if (Object.keys(config).length > 0) metaUpdate.configuration = config;
            if (body.tdsValue !== undefined) metaUpdate.tdsValue = parseFloat(body.tdsValue) || 0;
            if (body.temperature !== undefined) metaUpdate.temperature = parseFloat(body.temperature) || 0;
            if (body.waterQualityRating) metaUpdate.waterQualityRating = trimmed(body.waterQualityRating);
            if (body.location) metaUpdate.location = trimmed(body.location);
            if (body.status) metaUpdate.status = trimmed(body.status);
            metaUpdate.lastUpdated = new Date();
            
            // Handle history updates if provided
            if (body.tdsValue !== undefined) {
                metaUpdate.tdsHistory = admin.firestore.FieldValue.arrayUnion({
                    value: parseFloat(body.tdsValue) || 0,
                    timestamp: new Date()
                });
            }
            if (body.temperature !== undefined) {
                metaUpdate.tempHistory = admin.firestore.FieldValue.arrayUnion({
                    value: parseFloat(body.temperature) || 0,
                    timestamp: new Date()
                });
            }
        }

        await metaRef.set(metaUpdate, { merge: true });

        // SaaS Invalidation
        await Promise.all([
            cache.flushPrefix("nodes_"),
            cache.flushPrefix("user:"),
            cache.flushPrefix("dashboard_init_"),
            cache.flushPrefix("dashboard_summary_")
        ]);
        if (typeof telemetryCache !== 'undefined') {
            telemetryCache.del(`telemetry_${deviceDoc.id}`);
            telemetryCache.del(`status_${deviceDoc.id}`);
        }

        // ✅ FIX #13: EMIT SOCKET EVENT FOR DEVICE UPDATE
        // Notify all users of this customer that a device was updated
        // This triggers frontend to refresh device data without full query invalidation
        const customerId = metaUpdate.customer_id || deviceDoc.data().customer_id || deviceDoc.data().customerId;
        if (customerId && global.io) {
            global.io.to(`customer:${customerId}`).emit("device:updated", {
                deviceId: deviceDoc.id,
                changes: metaUpdate,
                success: true,
                timestamp: new Date().toISOString()
            });
            console.log(`[AdminController] ✅ device:updated event emitted for device: ${deviceDoc.id}, customer: ${customerId}`);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to update metadata" });
    }
};

exports.deleteNode = async (req, res) => {
    try {
        // Resolve node by doc id or hardware id (node_id/device_id)
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) return res.status(404).json({ error: "Device not found" });

        const deviceId = deviceDoc.id;
        const type = (deviceDoc.data().device_type || "").toLowerCase();

        const batch = db.batch();
        batch.delete(db.collection("devices").doc(deviceId));
        if (type) {
            batch.delete(db.collection(type).doc(deviceId));
        }

        await batch.commit();

        // SaaS Invalidation
        await Promise.all([
            cache.flushPrefix("nodes_"),
            cache.flushPrefix("user:"),
            cache.flushPrefix("dashboard_init_"),
            cache.flushPrefix("dashboard_summary_")
        ]);
        if (typeof telemetryCache !== 'undefined') {
            telemetryCache.del(`telemetry_${deviceId}`);
            telemetryCache.del(`status_${deviceId}`);
        }

        // Remove any remaining cached polling list to ensure deleted device no longer polled
        try {
            await cache.del("nodes:polling:list");
        } catch (err) {
            // ignore cache delete errors
        }

        // ✅ FIX #12: EMIT SOCKET EVENT FOR DEVICE DELETION
        // Notify all users of this customer that a device was deleted
        // This triggers frontend to remove device from state immediately
        const deviceData = deviceDoc.data();
        const customerId = deviceData.customer_id || deviceData.customerId;
        if (customerId && global.io) {
            global.io.to(`customer:${customerId}`).emit("device:deleted", {
                deviceId,
                success: true,
                timestamp: new Date().toISOString()
            });
            console.log(`[AdminController] ✅ device:deleted event emitted for device: ${deviceId}, customer: ${customerId}`);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error("[AdminController] deleteNode error:", error);
        res.status(500).json({ error: "Failed to delete device" });
    }
};

exports.getDashboardSummary = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized: Missing user information" });
        }
        const isSuperAdmin = req.user.role === "superadmin";

        let nodesQuery = db.collection("devices");
        let customersQuery = db.collection("customers");
        let zonesQuery = db.collection("zones");

        if (!isSuperAdmin) {
            if (req.user.community_id && req.user.customer_id) {
                nodesQuery = nodesQuery.where(
                    Filter.where("customer_id", "==", req.user.customer_id)
                );
            } else {
                nodesQuery = nodesQuery.where("customer_id", "==", req.user.customer_id || req.user.uid);
            }
            customersQuery = customersQuery.where("id", "==", req.user.customer_id || req.user.uid);
        }

        const devicesSnapshot = await nodesQuery.get();
        const actualNodeCount = devicesSnapshot.size;

        console.log(`[Dashboard] Real-time node count: ${actualNodeCount}`);

        const [customersSnap, zonesSnap] = await Promise.all([
            customersQuery.count().get(),
            zonesQuery.count().get()
        ]);

        const totalCustomers = customersSnap.data().count;

        const onlineNodes = devicesSnapshot.docs.filter(doc => {
            const device = doc.data();
            return device.status === 'ONLINE' || device.status === 'Online';
        }).length;

        const totalZones = zonesSnap.data().count;

        const result = {
            total_nodes: actualNodeCount,
            total_customers: totalCustomers,
            total_zones: totalZones,
            online_nodes: onlineNodes,
            alerts_active: 0,
            system_health: actualNodeCount > 0 ? 92 : 0
        };

        console.log(`[Dashboard] Returning stats:`, result);

        res.status(200).json(result);
    } catch (error) {
        console.error("[Dashboard] Failed to get summary:", error.message);
        res.status(500).json({ error: "Failed to get dashboard summary" });
    }
};

exports.getHierarchy = async (req, res) => {
    try {
        const cacheKey = "admin_hierarchy";
        const cached = await cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const [zonesSnap, customersSnap] = await Promise.all([
            db.collection("zones").get(),
            db.collection("customers").get()
        ]);

        const zones = zonesSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), customers: [] }));
        const customers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const zoneMap = {};
        zones.forEach(z => zoneMap[z.id] = z);
        customers.forEach(cust => {
            if (cust.zone_id && zoneMap[cust.zone_id]) {
                zoneMap[cust.zone_id].customers.push(cust);
            } else if (cust.regionFilter && zoneMap[cust.regionFilter]) {
                zoneMap[cust.regionFilter].customers.push(cust);
            }
        });

        await cache.set(cacheKey, zones, 600); // 10 min
        res.status(200).json(zones);
    } catch (error) {
        console.error("Hierarchy fetch error:", error);
        res.status(500).json({ error: "Failed to get hierarchy" });
    }
};

exports.getAuditLogs = async (req, res) => {
    try {
        // ✅ AUDIT FIX L8: Real audit log query with tenant isolation + pagination
        const isSuperAdmin = req.user.role === "superadmin";
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const cursor = req.query.cursor;

        let query = db.collection("audit_logs")
            .orderBy("timestamp", "desc")
            .limit(limit);

        // Tenant isolation: non-superadmins only see their own actions
        if (!isSuperAdmin) {
            query = query.where("user_id", "==", req.user.uid);
        }

        // Cursor-based pagination
        if (cursor) {
            const cursorDoc = await db.collection("audit_logs").doc(cursor).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snapshot = await query.get();
        const logs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        const nextCursor = logs.length === limit ? logs[logs.length - 1].id : null;

        res.status(200).json({
            logs,
            count: logs.length,
            nextCursor
        });
    } catch (error) {
        console.error("[AdminController] getAuditLogs error:", error.message);
        res.status(500).json({ error: "Failed to get audit logs" });
    }
};

exports.getZoneStats = async (req, res) => {
    try {
        const cacheKey = "zone_stats_all";
        const cached = await cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const [zonesSnap, customersSnap, devicesSnap] = await Promise.all([
            db.collection("zones").get(),
            db.collection("customers").get(),
            db.collection("devices").get()
        ]);

        const zones = zonesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const customers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const devices = devicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const zoneStats = zones.map(zone => {
            const zoneCustomers = customers.filter(c =>
                c.zone_id === zone.id ||
                c.zoneId === zone.id ||
                c.regionFilter === zone.id
            );

            const zoneCustomerIds = new Set(zoneCustomers.map(c => c.id));

            const zoneDevices = devices.filter(d =>
                zoneCustomerIds.has(d.customer_id) ||
                d.zone_id === zone.id ||
                d.zoneId === zone.id
            );

            const onlineDevices = zoneDevices.filter(d =>
                d.status === 'ONLINE' || d.status === 'Online'
            ).length;

            return {
                zone_id: zone.id,
                region_name: zone.zoneName || "Unnamed Zone",
                state: zone.state || "",
                customer_count: zoneCustomers.length,
                device_count: zoneDevices.length,
                online_devices: onlineDevices,
                offline_devices: zoneDevices.length - onlineDevices
            };
        });

        await cache.set(cacheKey, zoneStats, 300); // 5 min cache
        res.status(200).json(zoneStats);
    } catch (error) {
        console.error("[AdminController] getZoneStats error:", error);
        res.status(500).json({ error: "Failed to get zone statistics" });
    }
};

/**
 * SaaS Architecture: Aggregate Init Endpoint
 * Combines Summary, Zones, and Nodes into ONE cached response.
 * Drastically reduces frontend network overhead.
 */
exports.getDashboardInit = async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === "superadmin";
        const cacheKey = `dashboard_init_${isSuperAdmin ? 'admin' : req.user.customer_id || req.user.uid}`;
        const cached = await cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const [zonesRes, nodesRes, summaryRes] = await Promise.all([
            new Promise(resolve => exports.getZones(req, { status: () => ({ json: resolve }) })),
            new Promise(resolve => exports.getNodes(req, { status: () => ({ json: resolve }) })),
            new Promise(resolve => exports.getDashboardSummary(req, { status: () => ({ json: resolve }) }))
        ]);

        const result = {
            summary: summaryRes,
            zones: zonesRes,
            nodes: nodesRes,
            timestamp: new Date().toISOString()
        };

        await cache.set(cacheKey, result, 180); // 3 min
        res.status(200).json(result);
    } catch (error) {
        console.error("[Init] Aggregate failure:", error.message);
        res.status(500).json({ error: "Aggregate fetch failed" });
    }
};

/**
 * SYSTEM CONFIGURATION (Superadmin only)
 * Stores global settings like sampling intervals and firmware policies.
 */
exports.getSystemConfig = async (req, res) => {
    try {
        const doc = await db.collection("settings").doc("system_config").get();
        if (!doc.exists) {
            // Default settings if not initialized
            return res.status(200).json({
                samplingIntervals: {
                    evaraTank: 60,
                    evaraDeep: 300,
                    evaraFlow: 30,
                    evaraTDS: 120
                },
                batterySaverMode: false,
                firmwarePolicies: {
                    autoUpdate: false,
                    updateWindow: { start: "02:00", end: "04:00" }
                }
            });
        }
        res.status(200).json(doc.data());
    } catch (error) {
        console.error("[AdminController] getSystemConfig error:", error);
        res.status(500).json({ error: "Failed to get system configuration" });
    }
};

exports.updateSystemConfig = async (req, res) => {
    try {
        const config = req.body;
        await db.collection("settings").doc("system_config").set({
            ...config,
            updatedAt: new Date(),
            updatedBy: req.user.uid
        }, { merge: true });

        // Flush relevant caches if necessary (e.g., if polling workers use this)
        await cache.del("system_config");
        
        res.status(200).json({ success: true, message: "System configuration updated" });
    } catch (error) {
        console.error("[AdminController] updateSystemConfig error:", error);
        res.status(500).json({ error: "Failed to update system configuration" });
    }
};

// ============================================================
// DEVICE VISIBILITY & PARAMETER CONTROLS (Superadmin only)
// ============================================================

/**
 * PATCH /api/admin/devices/:id/visibility
 * Superadmin toggles whether a device is visible to the customer (Image 1 toggle)
 * Body: { "isVisibleToCustomer": true | false }
 */
exports.updateDeviceVisibility = async (req, res) => {
    try {
        const { id } = req.params;
        const { isVisibleToCustomer } = req.body;

        if (typeof isVisibleToCustomer !== "boolean") {
            return res.status(400).json({ error: "isVisibleToCustomer must be a boolean (true or false)" });
        }

        const deviceDoc = await resolveDevice(id);
        if (!deviceDoc || !deviceDoc.exists) {
            return res.status(404).json({ error: "Device not found" });
        }

        // ============================================================================
        // ✅ TASK #7 — TOCTOU Fix: Bypass cache for mutations
        // Ensure device wasn't reassigned between cache check and actual write
        // ============================================================================
        const isOwner = await checkOwnership(
            req.user.customer_id,
            id,
            req.user.role,
            req.user.community_id,
            { bypassCache: true }  // ← Always fresh from Firestore for mutations
        );

        if (!isOwner) {
            return res.status(403).json({ error: "Not authorized to update this device" });
        }

        await db.collection("devices").doc(deviceDoc.id).update({
            isVisibleToCustomer
        });

        // Get customer_id so we can flush that specific customer's cache
        const customerId = deviceDoc.data().customer_id;

        // Flush customer-facing caches so change reflects immediately
        await Promise.all([
            cache.flushPrefix("user:"),
            cache.flushPrefix("dashboard_init_"),
            cache.flushPrefix(`user:${customerId}:`)  // ← flush this specific customer's node cache
        ]);

        // ✅ FIX #14: EMIT SOCKET EVENT FOR VISIBILITY CHANGE
        if (customerId && global.io) {
            global.io.to(`customer:${customerId}`).emit("device:updated", {
                deviceId: deviceDoc.id,
                changes: { isVisibleToCustomer },
                success: true,
                timestamp: new Date().toISOString()
            });
            console.log(`[AdminController] ✅ device:updated event emitted for visibility change: ${deviceDoc.id}`);
        }

        console.log(`[AdminController] Device ${id} visibility set to: ${isVisibleToCustomer}`);
        return res.status(200).json({ success: true, isVisibleToCustomer });
    } catch (error) {
        console.error("[AdminController] updateDeviceVisibility error:", error);
        return res.status(500).json({ error: "Failed to update device visibility" });
    }
};

/**
 * PATCH /api/admin/devices/:id/parameters
 * Superadmin controls which analytics parameters are visible to the customer (Image 2 toggles)
 * Body: { "customer_config": { "showAlerts": false, "showConsumption": true, ... } }
 */
exports.updateDeviceParameters = async (req, res) => {
    try {
        const { id } = req.params;
        const { customer_config } = req.body;

        if (!customer_config || typeof customer_config !== "object" || Array.isArray(customer_config)) {
            return res.status(400).json({ error: "customer_config must be a valid object" });
        }

        // Validate that all values are booleans
        for (const [key, value] of Object.entries(customer_config)) {
            if (typeof value !== "boolean") {
                return res.status(400).json({
                    error: `Invalid value for "${key}": all parameter values must be true or false`
                });
            }
        }

        const deviceDoc = await resolveDevice(id);
        if (!deviceDoc || !deviceDoc.exists) {
            return res.status(404).json({ error: "Device not found" });
        }

        // ============================================================================
        // ✅ TASK #7 — TOCTOU Fix: Bypass cache for mutations
        // Ensure device wasn't reassigned between cache check and actual write
        // ============================================================================
        const isOwner = await checkOwnership(
            req.user.customer_id,
            id,
            req.user.role,
            req.user.community_id,
            { bypassCache: true }  // ← Always fresh from Firestore for mutations
        );

        if (!isOwner) {
            return res.status(403).json({ error: "Not authorized to update this device" });
        }

        await db.collection("devices").doc(deviceDoc.id).update({
            customer_config
        });

        // Flush customer-facing caches so change reflects immediately
        await Promise.all([
            cache.flushPrefix("user:"),
            cache.flushPrefix("dashboard_init_")
        ]);

        // ✅ FIX #15: EMIT SOCKET EVENT FOR PARAMETER CHANGES
        const deviceData = deviceDoc.data();
        const customerId = deviceData.customer_id || deviceData.customerId;
        if (customerId && global.io) {
            global.io.to(`customer:${customerId}`).emit("device:updated", {
                deviceId: deviceDoc.id,
                changes: { customer_config },
                success: true,
                timestamp: new Date().toISOString()
            });
            console.log(`[AdminController] ✅ device:updated event emitted for parameter changes: ${deviceDoc.id}`);
        }

        console.log(`[AdminController] Device ${id} parameters updated:`, customer_config);
        return res.status(200).json({ success: true, customer_config });
    } catch (error) {
        console.error("[AdminController] updateDeviceParameters error:", error);
        return res.status(500).json({ error: "Failed to update device parameters" });
    }
};
