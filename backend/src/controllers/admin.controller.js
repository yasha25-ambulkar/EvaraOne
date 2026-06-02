const { db, admin } = require("../config/firebase.js");
const { Filter } = require("firebase-admin/firestore");
const cache = require("../config/cache.js");
const telemetryCache = require("../services/cacheService.js");
const { checkOwnership } = require("../middleware/auth.middleware.js");
const logger = require("../utils/logger.js");
const { calculateDeviceStatus } = require("../services/deviceStateService.js");
// ✅ PHASE 2: Cache versioning (Task #11)
const { getVersionKey, incrementCacheVersion } = require("../utils/cacheVersioning.js");
// ✅ PHASE 2: Audit logging (Task #12)
const { logAudit } = require("../utils/auditLogger.js");
// ✅ PHASE 2: HTTP status codes (Task #13)
const AppError = require("../utils/AppError.js");
const { updateCustomerSchema } = require("../schemas/customer.schema.js");
const { updateZoneSchema } = require("../schemas/zone.schema.js");

// ✅ CRITICAL FIX #3: Safe number parsing with NaN/Infinity validation
// Replaces parseFloat() which silently accepts "NaN" and "Infinity" strings
function parseNumberSafely(val) {
  const parsed = parseFloat(val);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value) {
    if (!value) return "";
    return String(value).trim().toUpperCase();
}

function resolveDeviceTimestamp(device) {
    return (
        device.last_seen ||
        device.lastSeen ||
        device.last_updated_at ||
        device.lastUpdatedAt ||
        device.lastUpdated ||
        device.updated_at ||
        device.updatedAt ||
        device.timestamp ||
        null
    );
}

function isDeviceOnline(device) {
    const status = normalizeStatus(device.status || device.online_status || device.operational_status);
    if (status === "ONLINE") return true;
    if (status === "OFFLINE") return false;

    const resolvedTimestamp = resolveDeviceTimestamp(device);
    if (!resolvedTimestamp) return false;

    return calculateDeviceStatus(resolvedTimestamp) === "ONLINE";
}

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
            logger.warn(`[Tenant Isolation] Zone ${req.params.id} has no owner — rejecting access`);
            return res.status(404).json({ error: "Zone not found" });
        }

        // Owner must match exactly
        if (zoneOwner !== userTenant) {
            logger.warn(`[Tenant Isolation] Unauthorized zone access attempt`, {
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
        logger.error("[Zone] Get by ID failed:", error.message);
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
            const safeData = updateZoneSchema.parse(req.body);
            await db.collection("zones").doc(req.params.id).update(safeData);
            // ✅ PHASE 2: Task #11 - Use incrementCacheVersion instead of flushPrefix
            await incrementCacheVersion("zones");
            // ✅ PHASE 2: Task #12 - Log audit trail
            logAudit(req.user.uid, 'UPDATE', 'zones', req.params.id, safeData);
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
        const safeData = updateZoneSchema.parse(req.body);
        await db.collection("zones").doc(req.params.id).update(safeData);
        await incrementCacheVersion("zones");
        logAudit(req.user.uid, 'UPDATE', 'zones', req.params.id, safeData);
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
        const { confirmPassword, password, regionFilter, zone_id, ...customerData } = req.body;
        
        // ✅ DEBUG LOGGING
        console.log('[createCustomer] ─────────────────────────────────────────');
        console.log('[createCustomer] 📨 REQUEST BODY:', JSON.stringify(req.body, null, 2));
        console.log('[createCustomer] zone_id received:', zone_id);
        console.log('[createCustomer] regionFilter received:', regionFilter);
        
        // Create Firebase Auth user
        let firebaseUser = null;
        console.log('[createCustomer] Creating Firebase Auth user:', {
            email: customerData.email,
            display_name: customerData.display_name,
            role: customerData.role,
            zone_id: zone_id || regionFilter,
            password_length: password?.length
        });
        try {
            firebaseUser = await admin.auth().createUser({
                email: customerData.email,
                password: password,
                displayName: customerData.display_name || customerData.full_name,
            });
        } catch (authError) {
            // If auth user already exists, get them
            if (authError.code === 'auth/email-already-exists') {
                firebaseUser = await admin.auth().getUserByEmail(customerData.email);
            } else {
                throw new AppError(authError.message, 400);
            }
        }

        // ✅ Ensure zone_id is properly set
        const finalZoneId = zone_id || regionFilter || "";
        console.log('[createCustomer] Final zone_id to be saved:', finalZoneId);

        // Save to customers collection with Firebase UID + Zone ID
        const customer = {
            ...customerData,
            uid: firebaseUser.uid,
            firebase_uid: firebaseUser.uid,
            zone_id: finalZoneId,
            regionFilter: finalZoneId,
            created_at: new Date()
        };

        console.log('[createCustomer] 💾 Customer document to save:', JSON.stringify(customer, null, 2));

        // Also save to users collection so login works
        const usersDoc = {
            uid: firebaseUser.uid,
            email: customerData.email,
            display_name: customerData.display_name,
            full_name: customerData.full_name,
            role: customerData.role || 'customer',
            status: customerData.status || 'active',
            phone_number: customerData.phone_number,
            zone_id: finalZoneId,
            created_at: new Date()
        };
        console.log('[createCustomer] 📝 Users collection document:', JSON.stringify(usersDoc, null, 2));
        await db.collection("users").doc(firebaseUser.uid).set(usersDoc);
        console.log('[createCustomer] ✅ Users collection saved');

        console.log('[createCustomer] 📝 About to save customers collection:', JSON.stringify(customer, null, 2));
        const doc = await db.collection("customers").add(customer);
        console.log('[createCustomer] ✅ Customer created with ID:', doc.id);
        console.log('[createCustomer] ✅ Stored zone_id:', finalZoneId);
        
        // Verify what was actually saved
        const savedCustomer = await doc.get();
        console.log('[createCustomer] ✅ VERIFICATION - Data in Firestore:', JSON.stringify(savedCustomer.data(), null, 2));

        await incrementCacheVersion("customers");
        await incrementCacheVersion("default");
        // logAudit(req.user.uid, 'CREATE', 'customers', doc.id, customerData);

        res.status(201).json({ success: true, id: doc.id });
    } catch (error) {
        console.log('[createCustomer] ❌ ERROR:', error.code, error.message, error.statusCode);
        if (error instanceof AppError) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        req.log?.error({ error: error.message }, '[AdminController] Create customer error');
        res.status(500).json({ error: error.message || "Failed to create customer" });
    }
};

exports.getCustomers = async (req, res) => {
    try {
        const { zone_id, community_id, regionFilter, limit, cursor } = req.query;
        
        console.log('[getCustomers] 🔍 REQUEST PARAMS:', {zone_id, community_id, regionFilter, limit, user_role: req.user.role});

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
        if (cached) {
            console.log('[getCustomers] ✅ Cache HIT, returning', cached.length, 'customers');
            return res.status(200).json(cached);
        }

        const limitStr = parseInt(limit) || 50;
        let query = db.collection("customers");

        logger.debug(`[AdminController] getCustomers query:`, { zone_id, community_id, role: req.user.role });

        if (req.user.role !== "superadmin") {
            query = query.where("id", "==", req.user.customer_id || req.user.uid);
        } else {
            // REMOVED orderBy("created_at") to avoid complex index requirements that cause silent failures

            if (zone_id && zone_id.trim() !== '') {
                // NOTE: Query by zone_id only - we'll fetch regionFilter matches separately and merge
                query = query.where("zone_id", "==", zone_id.trim());
            } else if (regionFilter && regionFilter.trim() !== '') {
                query = query.where("regionFilter", "==", regionFilter.trim());
            } else if (community_id && community_id.trim() !== '') {
                query = query.where("community_id", "==", community_id.trim());
            }
            // NOTE: If no filters provided, query returns ALL customers (limited by limitStr)
        }

        query = query.limit(limitStr);

        if (cursor) {
            const cursorDoc = await db.collection("customers").doc(cursor).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snapshot = await query.get();
        console.log('[getCustomers] 📊 Query executed, found:', snapshot.size, 'documents');
        
        let customers = snapshot.docs.map(doc => {
            const data = doc.data();
            console.log('[getCustomers] 👤 Customer DOC:', {
                id: doc.id,
                display_name: data.display_name,
                email: data.email,
                zone_id: data.zone_id || 'MISSING!!!',
                regionFilter: data.regionFilter
            });
            return { id: doc.id, ...data };
        });

        // COMPREHENSIVE FALLBACK: For superadmins, also check regionFilter when zone_id is queried
        // This handles customers created with AddCustomerForm which uses regionFilter instead of zone_id
        if (req.user.role === "superadmin" && zone_id) {
            logger.debug(`[AdminController] Checking regionFilter fallback for zone_id: ${zone_id}`);

            // Try zoneId (camelCase)
            const zoneIdSnapshot = await db.collection("customers").where("zoneId", "==", zone_id.trim()).limit(limitStr).get();
            if (!zoneIdSnapshot.empty) {
                logger.debug(`[AdminController] Found ${zoneIdSnapshot.size} customers via zoneId fallback`);
                // Deduplicate and merge
                const existingIds = new Set(customers.map(c => c.id));
                zoneIdSnapshot.docs.forEach(doc => {
                    if (!existingIds.has(doc.id)) {
                        customers.push({ id: doc.id, ...doc.data() });
                        existingIds.add(doc.id);
                    }
                });
            }

            // Try regionFilter (legacy - customers created via AddCustomerForm use this field)
            const regionSnapshot = await db.collection("customers").where("regionFilter", "==", zone_id.trim()).limit(limitStr).get();
            if (!regionSnapshot.empty) {
                logger.debug(`[AdminController] Found ${regionSnapshot.size} customers via regionFilter fallback`);
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

        logger.debug(`[AdminController] Successfully fetched ${customers.length} customers`);
        console.log('[getCustomers] ✅ FINAL RESULT: Returning', customers.length, 'customers');
        customers.forEach(c => {
            console.log('   - ' + c.display_name || c.email, '(zone_id:', c.zone_id || 'NONE', ')');
        });

        const [zonesSnap, devicesSnap] = await Promise.all([
            db.collection("zones").get(),
            db.collection("devices").get()
        ]);

        const zoneMap = zonesSnap.docs.reduce((acc, doc) => {
            const zone = { id: doc.id, ...doc.data() };
            acc[zone.id] = zone;
            return acc;
        }, {});

        const devices = devicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const normalizePhone = (customer) =>
            customer.phone_number || customer.phone || customer.contact_phone || customer.mobile || null;

        const resolveCustomerIds = (customer) => {
            const ids = [customer.id, customer.uid, customer.firebase_uid, customer.customer_id]
                .filter(Boolean)
                .map(v => String(v));
            return Array.from(new Set(ids));
        };

        // ✅ ENRICHMENT: Add device count and last seen for each customer
        const enrichedCustomers = await Promise.all(
            customers.map(async (customer) => {
                try {
                    const customerZoneId = customer.zone_id || customer.zoneId || customer.regionFilter || customer.community_id || customer.communityId || null;
                    const customerZone = customerZoneId ? zoneMap[customerZoneId] : null;
                    const candidateIds = resolveCustomerIds(customer);
                    const customerDevices = devices.filter((device) => {
                        const ownerId = device.customer_id || device.customerId || device.customerID || "";
                        return candidateIds.includes(String(ownerId));
                    });

                    const deviceCount = customerDevices.length;
                    const onlineDeviceCount = customerDevices.filter(isDeviceOnline).length;

                    const latestDeviceTimestamp = customerDevices
                        .map(resolveDeviceTimestamp)
                        .filter(Boolean)
                        .reduce((latest, timestamp) => {
                            if (!latest) return timestamp;
                            const latestMs = new Date(latest).getTime();
                            const timestampMs = new Date(timestamp).getTime();
                            if (Number.isNaN(latestMs)) return timestamp;
                            if (Number.isNaN(timestampMs)) return latest;
                            return timestampMs > latestMs ? timestamp : latest;
                        }, customer.updated_at || customer.updatedAt || customer.last_seen || customer.lastSeen || null);

                    const normalizedLastSeen = latestDeviceTimestamp || customer.updated_at || customer.updatedAt || customer.last_seen || customer.lastSeen || null;
                    const status = onlineDeviceCount > 0 ? "Online" : "Offline";

                    return {
                        ...customer,
                        phone_number: normalizePhone(customer),
                        phone: normalizePhone(customer),
                        devices: customerDevices.map((device) => ({
                            id: device.id,
                            device_name: device.device_name || device.displayName || device.label || device.name || null,
                            label: device.label || device.displayName || device.device_name || device.name || null,
                            status: device.status || device.operational_status || (isDeviceOnline(device) ? "Online" : "Offline"),
                            analytics_template: device.analytics_template || device.device_type || device.assetType || null,
                            node_key: device.node_key || device.hardwareId || device.device_id || device.id || null,
                            location: device.location || device.zoneName || device.zone_name || null
                        })),
                        deviceCount,
                        onlineDeviceCount,
                        isActive: onlineDeviceCount > 0,
                        status,
                        zoneName: customerZone?.zoneName || customerZone?.name || customer.zoneName || customer.communityName || null,
                        communityName: customerZone?.zoneName || customerZone?.name || customer.communityName || null,
                        updated_at: normalizedLastSeen,
                        last_seen: normalizedLastSeen,
                        lastSeen: normalizedLastSeen,
                        lastUpdated: normalizedLastSeen
                    };
                } catch (err) {
                    logger.warn(`[AdminController] Failed to enrich customer ${customer.id}:`, err.message);
                    return {
                        ...customer,
                        phone_number: normalizePhone(customer),
                        phone: normalizePhone(customer),
                        devices: [],
                        deviceCount: 0,
                        onlineDeviceCount: 0,
                        isActive: false,
                        status: "Offline",
                        zoneName: customer.zoneName || customer.communityName || null,
                        communityName: customer.communityName || null,
                        updated_at: customer.updated_at || customer.updatedAt || customer.last_seen || customer.lastSeen || null,
                        last_seen: customer.last_seen || customer.lastSeen || null
                    };
                }
            })
        );

        await cache.set(cacheKey, enrichedCustomers, 600); // 10 min
        res.status(200).json(enrichedCustomers);
    } catch (error) {
        logger.error("[AdminController] getCustomers CRITICAL ERROR:", error);
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

        const customer = { id: doc.id, ...doc.data() };
        const customerIds = Array.from(new Set([
            customer.id,
            customer.uid,
            customer.firebase_uid,
            customer.customer_id,
        ].filter(Boolean).map(v => String(v))));

        const [devicesSnap, zonesSnap] = await Promise.all([
            db.collection("devices").get(),
            db.collection("zones").get()
        ]);

        const zoneMap = zonesSnap.docs.reduce((acc, z) => {
            acc[z.id] = { id: z.id, ...z.data() };
            return acc;
        }, {});

        const normalizePhone = (cust) => cust.phone_number || cust.phone || cust.contact_phone || cust.mobile || null;

        const customerDevices = devicesSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(device => customerIds.includes(String(device.customer_id || device.customerId || device.customerID || "")));

        const customerZoneId = customer.zone_id || customer.zoneId || customer.regionFilter || customer.community_id || customer.communityId || null;
        const customerZone = customerZoneId ? zoneMap[customerZoneId] : null;

        res.status(200).json({
            ...customer,
            phone_number: normalizePhone(customer),
            phone: normalizePhone(customer),
            devices: customerDevices.map((device) => ({
                id: device.id,
                device_name: device.device_name || device.displayName || device.label || device.name || null,
                label: device.label || device.displayName || device.device_name || device.name || null,
                status: device.status || device.operational_status || (isDeviceOnline(device) ? "Online" : "Offline"),
                analytics_template: device.analytics_template || device.device_type || device.assetType || null,
                node_key: device.node_key || device.hardwareId || device.device_id || device.id || null,
                location: device.location || device.zoneName || device.zone_name || null,
            })),
            deviceCount: customerDevices.length,
            onlineDeviceCount: customerDevices.filter(isDeviceOnline).length,
            isActive: customerDevices.some(isDeviceOnline),
            status: customerDevices.some(isDeviceOnline) ? "Online" : "Offline",
            zoneName: customerZone?.zoneName || customerZone?.name || customer.zoneName || customer.communityName || null,
            communityName: customerZone?.zoneName || customerZone?.name || customer.communityName || null,
            last_seen: customer.last_seen || customer.lastSeen || customer.updated_at || customer.updatedAt || null,
        });
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
        
        const safeData = updateCustomerSchema.parse(req.body);
        const customerRef = db.collection("customers").doc(req.params.id);
        const customerDoc = await customerRef.get();
        if (!customerDoc.exists) {
            throw new AppError("Customer not found", 404);
        }

        const currentData = customerDoc.data() || {};
        const normalizedData = {
            ...safeData,
            phone: safeData.phone || safeData.phone_number || currentData.phone || currentData.phone_number,
            phone_number: safeData.phone_number || safeData.phone || currentData.phone_number || currentData.phone,
            zone_id: safeData.zone_id || safeData.regionFilter || currentData.zone_id || currentData.regionFilter || "",
            regionFilter: safeData.regionFilter || safeData.zone_id || currentData.regionFilter || currentData.zone_id || "",
            updated_at: new Date(),
        };

        await customerRef.update(normalizedData);

        const authUid = currentData.uid || currentData.firebase_uid;
        if (authUid) {
            const userUpdate = {
                email: normalizedData.email,
                display_name: normalizedData.display_name,
                full_name: normalizedData.full_name,
                phone_number: normalizedData.phone_number,
                role: normalizedData.role,
                status: normalizedData.status,
            };

            await db.collection("users").doc(authUid).set(userUpdate, { merge: true });

            const authPayload = {};
            if (normalizedData.email) authPayload.email = normalizedData.email;
            if (normalizedData.display_name || normalizedData.full_name) {
                authPayload.displayName = normalizedData.display_name || normalizedData.full_name;
            }
            if (normalizedData.status) {
                authPayload.disabled = normalizedData.status !== "active";
            }

            if (Object.keys(authPayload).length > 0) {
                await admin.auth().updateUser(authUid, authPayload);
            }
        }

        // ✅ PHASE 2: Task #11 - Use incrementCacheVersion instead of flushPrefix
        await incrementCacheVersion("customers");
        // ✅ PHASE 2: Task #12 - Log audit trail
        logAudit(req.user.uid, 'UPDATE', 'customers', req.params.id, normalizedData);
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
        if (req.user.role !== "superadmin") {
            throw new AppError("Access denied", 403);
        }

        const customerId = req.params.id;

        // Get customer data first to find their Firebase Auth UID
        const customerDoc = await db.collection("customers").doc(customerId).get();
        const userData = customerDoc.data();

        // Delete from customers collection
        await db.collection("customers").doc(customerId).delete();

        // Also delete from users collection if exists
        await db.collection("users").doc(customerId).delete().catch(() => {});

        // Also delete Firebase Auth user if UID exists
        if (userData?.uid || userData?.firebase_uid) {
            const uid = userData?.uid || userData?.firebase_uid;
            await admin.auth().deleteUser(uid).catch(() => {});
        }

        // Try deleting by email from users collection
        if (userData?.email) {
            const userQuery = await db.collection("users").where("email", "==", userData.email).get();
            userQuery.forEach(doc => doc.ref.delete());
        }

        await incrementCacheVersion("customers");
        await incrementCacheVersion("users");

        // Clear all customer list cache keys directly
        const cacheKeysToDelete = [
            `user:admin:customers:superadmin:all:all:all:50:none`,
            `user:admin:customers:superadmin:all:all:all:50:none`,
        ];
        for (const key of cacheKeysToDelete) {
            await cache.del(key).catch(() => {});
        }

        // Nuclear option - flush all customer-related cache
        await cache.flushPattern?.('*customers*').catch(() => {});
        logAudit(req.user.uid, 'DELETE', 'customers', customerId);

        res.status(200).json({ success: true });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        req.log?.error({ error: error.message }, '[AdminController] Delete customer error');
        res.status(500).json({ error: "Failed to delete customer" });
    }
};

// Nodes (Single Document Architecture)
exports.createNode = async (req, res) => {
    let firebaseUser = null;
    let createdFirebaseUser = false;
    try {
        logger.debug(`\n[createNode] 📨 RECEIVED REQUEST BODY:`);
        logger.debug(`[createNode]   Complete body:`, JSON.stringify(req.body, null, 2));
        
        const {
            displayName,
            deviceName,
            assetType,
            assetSubType,
            subType,
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
            flow_field,
            flow_field_name,
            total_volume_field,
            total_volume_field_name,
            valve_status,
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
            esp32_email,
            esp32_password
        } = req.body;

        const timestamp = new Date();
        const idForDevice = hardwareId || `DEV-${Date.now()}`;
        
        // ⚠️ CRITICAL: For TDS devices, hardwareId MUST be provided
        if ((assetType === "EvaraTDS" || assetType === "evaratds" || assetType === "tds") && !hardwareId) {
            return res.status(400).json({
                error: "TDS devices require a hardware ID (node_key)",
                receivedAssetType: assetType,
                receivedHardwareId: hardwareId
            });
        }
        
        const typeNormalized = (assetType || "evaratank").toLowerCase();
        const isValveDevice = typeNormalized === "evaravalve" || typeNormalized === "valve";
        const normalizedNodeKey = String(idForDevice).trim().toLowerCase();
        const deviceEmail = esp32_email || (isValveDevice ? `esp32-${normalizedNodeKey}@evaratech.com` : "");
        const devicePassword = esp32_password || (isValveDevice ? `evlv-${normalizedNodeKey}-pass` : "");

        // Validate device type
        const validTypes = ['evaratank', 'evaradeep', 'evaraflow', 'evaratds', 'evaraphase', 'evaravalve', 'tank', 'deep', 'flow', 'tds', 'phase', 'valve'];
        if (!validTypes.includes(typeNormalized)) {
            return res.status(400).json({
                error: `Unknown asset type: "${assetType}"`,
                validTypes: ['evaratank', 'evaradeep', 'evaraflow', 'evaratds', 'evaraphase', 'evaravalve']
            });
        }

        if (isValveDevice) {
            try {
                firebaseUser = await admin.auth().createUser({
                    email: deviceEmail,
                    password: devicePassword,
                    displayName: displayName || deviceName || idForDevice,
                });
                createdFirebaseUser = true;
                logger.debug(`[createNode] ✅ Created Firebase Auth user for valve device: ${deviceEmail}`);
            } catch (authError) {
                if (authError.code === "auth/email-already-exists") {
                    firebaseUser = await admin.auth().getUserByEmail(deviceEmail);
                    logger.debug(`[createNode] ℹ️ Reused existing Firebase Auth user for valve device: ${deviceEmail}`);
                } else {
                    throw new AppError(authError.message, 400);
                }
            }
        }

        // ✅ FIX #5: Generate API key for MQTT authentication
        const crypto = require('crypto');
        const apiKey = crypto.randomBytes(32).toString('hex');
        const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

        // ✅ SINGLE DOCUMENT: Merge registry and metadata into one document
        const deviceData = {
            // Registry fields
            device_id: idForDevice,
            device_type: typeNormalized,
            node_id: idForDevice,
            customer_id: customerId || "",
            api_key_hash: apiKeyHash,
            isVisibleToCustomer: true,
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
            analytics_template: assetType || "EvaraTank",
            subType: subType || assetSubType || "",
            firebase_uid: firebaseUser?.uid || "",
            esp32_email: deviceEmail,
            esp32_password: devicePassword,
            created_at: timestamp,
            // Metadata fields (merged)
            label: displayName || deviceName || "Unnamed",
            device_name: deviceName || displayName || "Unknown Device",
            thingspeak_channel_id: thingspeakChannelId || "",
            thingspeak_read_api_key: thingspeakReadKey || "",
            zone_id: zoneId || "",
            latitude: parseNumberSafely(latitude),
            longitude: parseNumberSafely(longitude),
            updated_at: timestamp
        };

        // Add device type specific fields
        if (typeNormalized === "evaratank" || typeNormalized === "tank") {
            deviceData.tank_size = capacity || 0;
            deviceData.total_capacity = capacity || 0;
            deviceData.configuration = {
                depth: depth || 0,
                tank_length: tankLength || 0,
                tank_breadth: tankBreadth || 0,
                height_cm: depth ? depth * 100 : 0,
                length_cm: tankLength ? tankLength * 100 : 0,
                breadth_cm: tankBreadth ? tankBreadth * 100 : 0
            };
            const levelField = waterLevelField || "field2";
            deviceData.fields = { water_level: levelField };
            deviceData.sensor_field_mapping = { [levelField]: "water_level_raw_sensor_reading" };
        } else if (typeNormalized === "evaradeep" || typeNormalized === "deep") {
            deviceData.configuration = {
                total_depth: depth || 0,
                static_water_level: staticDepth || 0,
                dynamic_water_level: dynamicDepth || 0,
                recharge_threshold: rechargeThreshold || 0
            };
            const depthField = borewellDepthField || "field2";
            deviceData.fields = { water_level: depthField };
            deviceData.sensor_field_mapping = { [depthField]: "water_level_in_cm" };
        } else if (typeNormalized === "evaraflow" || typeNormalized === "flow") {
            deviceData.configuration = {};
            const rateField = flowRateField || "field2";
            const readingField = meterReadingField || "field1";
            deviceData.fields = { flow_rate: rateField, total_liters: readingField };
            deviceData.sensor_field_mapping = {
                [rateField]: "flow_rate",
                [readingField]: "current_reading"
            };
        } else if (typeNormalized === "evaratds" || typeNormalized === "tds") {
            deviceData.configuration = {
                type: "TDS",
                unit: "ppm",
                min_threshold: 0,
                max_threshold: 2000
            };
            const userTdsField = tdsField || "field2";
            const userTempField = temperatureField || "field3";
            deviceData.fields = { tds: userTdsField, temperature: userTempField };
            deviceData.sensor_field_mapping = {
                [userTdsField]: "tdsValue",
                [userTempField]: "temperature"
            };
            deviceData.tdsValue = req.body.tdsValue || 0;
            deviceData.temperature = req.body.temperature || 0;
            deviceData.waterQualityRating = req.body.waterQualityRating || "Good";
            deviceData.location = req.body.location || "";
            deviceData.status = req.body.status || "online";
            deviceData.lastUpdated = timestamp;
        } else if (typeNormalized === "evaraphase" || typeNormalized === "phase") {
            deviceData.configuration = {
                type: "Phase",
                unit: "V/A",
                voltage_min: 0,
                voltage_max: 500,
                current_min: 0,
                current_max: 100
            };
            const voltageField = req.body.voltageField || "field1";
            const currentField = req.body.currentField || "field2";
            const powerField = req.body.powerField || "field3";
            const frequencyField = req.body.frequencyField || "field4";
            deviceData.fields = { voltage: voltageField, current: currentField, power: powerField, frequency: frequencyField };
            deviceData.sensor_field_mapping = {
                [voltageField]: "voltageValue",
                [currentField]: "currentValue",
                [powerField]: "powerValue",
                [frequencyField]: "frequencyValue"
            };
            deviceData.voltageValue = req.body.voltageValue || 0;
            deviceData.currentValue = req.body.currentValue || 0;
            deviceData.powerValue = req.body.powerValue || 0;
            deviceData.frequencyValue = req.body.frequencyValue || 50;
            deviceData.powerFactor = req.body.powerFactor || 1.0;
            deviceData.status = req.body.status || "online";
            deviceData.lastUpdated = timestamp;
        } else if (typeNormalized === "evaravalve" || typeNormalized === "valve") {
            deviceData.configuration = {
                type: "Valve",
                unit: "%",
                min_position: 0,
                max_position: 100
            };
            const selectedFlowField = (flow_field || req.body.flowField || flowRateField || "field2").trim
                ? (flow_field || req.body.flowField || flowRateField || "field2").trim()
                : (flow_field || req.body.flowField || flowRateField || "field2");
            const selectedTotalField = (total_volume_field || req.body.totalVolumeField || "field1").trim
                ? (total_volume_field || req.body.totalVolumeField || "field1").trim()
                : (total_volume_field || req.body.totalVolumeField || "field1");
            deviceData.flow_field = selectedFlowField;
            deviceData.flow_field_name = flow_field_name || req.body.flow_field_name || req.body.flowFieldName || "";
            deviceData.total_volume_field = selectedTotalField;
            deviceData.total_volume_field_name = total_volume_field_name || req.body.total_volume_field_name || req.body.totalVolumeFieldName || "";
            deviceData.fields = { flow: selectedFlowField, total_volume: selectedTotalField };
            deviceData.valve_status = valve_status || "CLOSED";
            deviceData.location = req.body.location || "";
            deviceData.status = req.body.status || "online";
            deviceData.lastUpdated = timestamp;
        }

        logger.debug(`[createNode] 📝 Creating single document in devices/${idForDevice}`);
        logger.debug(`[createNode]   Device type: ${typeNormalized}`);
        logger.debug(`[createNode]   Keys:`, Object.keys(deviceData));

        // ✅ SINGLE DOCUMENT WRITE: Use hardware ID as document ID for direct lookup
        const deviceDocRef = db.collection("devices").doc(idForDevice);
        await deviceDocRef.set(deviceData);

        logger.debug(`[createNode] ✅ Document created successfully in devices/${idForDevice}`);

        // Verification
        const verifyDoc = await db.collection("devices").doc(idForDevice).get();
        if (verifyDoc.exists) {
            logger.debug(`[createNode] ✅ VERIFIED: Document exists in devices/${idForDevice}`);
        } else {
            logger.error(`[createNode] ❌ CRITICAL: Document not found after write!`);
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
            logger.warn('[Device] Cache clear failed:', cacheErr.message);
        }

        // ✅ FIX #8: EMIT REAL-TIME SOCKET EVENT (CRITICAL)
        if (thingspeakChannelId && thingspeakReadKey) {
            logger.debug(`[createNode] 🔄 Fetching and saving channel metadata for device ${idForDevice}`);
            try {
                const { fetchAndSaveChannelMetadata } = require("../services/channelMetadataService.js");
                const channelMeta = await fetchAndSaveChannelMetadata(
                    idForDevice,
                    thingspeakChannelId,
                    thingspeakReadKey
                );
                
                if (channelMeta) {
                    logger.debug(`[createNode] ✅ Channel metadata saved successfully`);
                } else {
                    logger.warn(`[createNode] ⚠️  Channel metadata fetch returned null (non-fatal)`);
                }
            } catch (metaErr) {
                logger.warn(`[createNode] ⚠️  Failed to fetch/save channel metadata (non-fatal):`, metaErr.message);
            }
        }

        try {
            if (global.io) {
                const fullDevice = {
                    id: idForDevice,
                    node_key: idForDevice,
                    ...deviceData
                };
                
                // Broadcast to all connected clients of this customer
                global.io.to(`customer:${customerId}`).emit("device:added", {
                    device: fullDevice,
                    timestamp: new Date().toISOString()
                });
                logger.debug(`[Device] 📡 Emitted device:added to customer ${customerId}`);
            }
        } catch (socketErr) {
            logger.warn('[Device] Socket emission failed (non-fatal):', socketErr.message);
        }

        return res.status(201).json({
            success: true,
            deviceId: idForDevice,
            device_id: idForDevice,
            device_type: typeNormalized,
            esp32_email: deviceEmail,
            esp32_password: devicePassword,
            api_key: apiKey, // ✅ FIX #5: Return the API key to client (ONE TIME ONLY)
            message: "Device created successfully",
            verification: {
                document_id: idForDevice,
                device_type: typeNormalized,
                has_channel_id: !!thingspeakChannelId,
                has_api_key: !!thingspeakReadKey
            }
        });
    } catch (error) {
        if (firebaseUser?.uid && createdFirebaseUser) {
            try {
                await admin.auth().deleteUser(firebaseUser.uid);
            } catch (cleanupErr) {
                logger.warn('[createNode] ⚠️ Failed to clean up Firebase Auth user after node creation error:', cleanupErr.message);
            }
        }
        logger.error('\n[Device] ❌ CREATE DEVICE FAILED:');
        logger.error(`[Device] Error message: ${error.message}`);
        logger.error(`[Device] Error code: ${error.code}`);
        logger.error(`[Device] Full error:`, error);
        logger.error(`[Device] Stack trace:`, error.stack);
        
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
        logger.debug(`[AdminController] getNodes for user:`, req.user.uid, "role:", req.user.role);
        const nodesCacheKey = req.user.role === "superadmin"
            ? "user:admin:devices"
            : `user:${req.user.customer_id || req.user.uid}:devices`;
        logger.debug(`[AdminController] Cache Key:`, nodesCacheKey);
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
                // Don't filter out if metadata is missing — return what we have in registry
                return metas.map(m => ({ 
                    id: m.id, 
                    meta: m.exists ? m.data() : {}, 
                    type 
                }));
            })
        );

        for (const batch of typeBatches) {
            for (const item of batch) {
                const { id, meta, type } = item;
                const registryData = registryDataMap[id];

                // Auth check for non-superadmins
                if (req.user.role !== "superadmin") {
                    const ownerId = meta.customer_id || registryData.customer_id;
                    if (ownerId !== (req.user.customer_id || req.user.uid)) continue;
                }

                const { thingspeak_read_api_key, ...safeMeta } = meta;

                // ✅ FIX: Map device_type to analytics_template if missing
                let analyticsTemplate = registryData.analytics_template || meta.analytics_template;
                if (!analyticsTemplate) {
                    const typeLower = type.toLowerCase();
                    if (typeLower === "evaratank") analyticsTemplate = "EvaraTank";
                    else if (typeLower === "evaradeep") analyticsTemplate = "EvaraDeep";
                    else if (typeLower === "evaraflow") analyticsTemplate = "EvaraFlow";
                    else if (typeLower === "evaratds") analyticsTemplate = "EvaraTDS";
                    else analyticsTemplate = "EvaraTank"; // default
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

        logger.debug(`[AdminController] Final devices with analytics_template:`, devices.map(d => ({ id: d.id, type: d.device_type, template: d.analytics_template })));

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

        if (body.latitude !== undefined) metaUpdate.latitude = parseNumberSafely(body.latitude);
        if (body.longitude !== undefined) metaUpdate.longitude = parseNumberSafely(body.longitude);

        // Type-specific updates (flexible naming)
        if (type === "evaratank" || type === "tank") {
            const cap = body.capacity || body.tank_size || body.capacity_liters || body.capacity_liters_override;
            if (cap !== undefined) metaUpdate.tank_size = parseFloat(cap) || 0;

            const config = {};
            const depthVal = body.depth || body.height_m || body.max_depth || body.tank_height;
            if (depthVal !== undefined) {
                const d = parseFloat(depthVal) || 0;
                config.depth = d;
                config.height_cm = d * 100;
            }

            const len = body.tankLength || body.length_m || body.tank_length;
            if (len !== undefined) {
                const l = parseFloat(len) || 0;
                config.tank_length = l;
                config.length_cm = l * 100;
            }

            const br = body.tankBreadth || body.breadth_m || body.tank_breadth;
            if (br !== undefined) {
                const b = parseFloat(br) || 0;
                config.tank_breadth = b;
                config.breadth_cm = b * 100;
            }

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
            
            // ✅ FIX: Store ONLY latest values for quick display, NOT history arrays
            // Historical data should come from ThingSpeak API, not Firestore
            if (body.tdsValue !== undefined) metaUpdate.tdsValue = parseFloat(body.tdsValue) || 0;
            if (body.temperature !== undefined) metaUpdate.temperature = parseFloat(body.temperature) || 0;
            if (body.waterQualityRating) metaUpdate.waterQualityRating = trimmed(body.waterQualityRating);
            if (body.location) metaUpdate.location = trimmed(body.location);
            if (body.status) metaUpdate.status = trimmed(body.status);
            metaUpdate.lastUpdated = new Date();
            
            // ✅ REMOVED: tdsHistory and tempHistory arrays
            // These fields bloat the document (50KB+) and belong in ThingSpeak
            // Frontend will fetch historical data from /api/nodes/:id/analytics endpoint
            // which retrieves data from ThingSpeak, not from Firestore device doc
        } else if (type === "evaraphase" || type === "phase") {
            // Phase monitoring device updates
            const config = {};
            if (body.configuration) {
                if (body.configuration.voltage_max !== undefined) config.voltage_max = parseFloat(body.configuration.voltage_max) || 500;
                if (body.configuration.current_max !== undefined) config.current_max = parseFloat(body.configuration.current_max) || 100;
            }
            if (body.voltage_max !== undefined || body.voltageMax !== undefined) {
                config.voltage_max = parseFloat(body.voltage_max || body.voltageMax) || 500;
            }
            if (body.current_max !== undefined || body.currentMax !== undefined) {
                config.current_max = parseFloat(body.current_max || body.currentMax) || 100;
            }
            if (Object.keys(config).length > 0) metaUpdate.configuration = config;
            
            // Handle field mappings
            if (body.voltageField || body.currentField || body.powerField || body.frequencyField || body.waterLevelField ||
                body.voltage_field || body.current_field || body.power_field || body.frequency_field || body.water_level_field) {
                const docData = (await metaRef.get()).data() || {};
                const currentMap = docData.sensor_field_mapping || {};

                let voltF = body.voltageField || body.voltage_field;
                if (!voltF) voltF = Object.keys(currentMap).find(k => currentMap[k] === "voltageValue") || "field1";

                let currF = body.currentField || body.current_field;
                if (!currF) currF = Object.keys(currentMap).find(k => currentMap[k] === "currentValue") || "field2";

                let powF = body.powerField || body.power_field;
                if (!powF) powF = Object.keys(currentMap).find(k => currentMap[k] === "powerValue") || "field3";

                let freqF = body.frequencyField || body.frequency_field;
                if (!freqF) freqF = Object.keys(currentMap).find(k => currentMap[k] === "frequencyValue") || "field4";

                const newMapping = {
                    [trimmed(voltF)]: "voltageValue",
                    [trimmed(currF)]: "currentValue",
                    [trimmed(powF)]: "powerValue",
                    [trimmed(freqF)]: "frequencyValue"
                };

                let lvlF = body.waterLevelField || body.water_level_field;
                if (lvlF) {
                    newMapping[trimmed(lvlF)] = "water_level_raw_sensor_reading";
                } else {
                    const existingLvl = Object.keys(currentMap).find(k => currentMap[k] === "water_level_raw_sensor_reading");
                    if (existingLvl) newMapping[existingLvl] = "water_level_raw_sensor_reading";
                }

                metaUpdate.sensor_field_mapping = newMapping;
                metaUpdate.fields = {
                    voltage: voltF,
                    current: currF,
                    power: powF,
                    frequency: freqF,
                    water_level: lvlF || ""
                };
            }

            if (body.voltageValue !== undefined) metaUpdate.voltageValue = parseFloat(body.voltageValue) || 0;
            if (body.currentValue !== undefined) metaUpdate.currentValue = parseFloat(body.currentValue) || 0;
            if (body.powerValue !== undefined) metaUpdate.powerValue = parseFloat(body.powerValue) || 0;
            if (body.frequencyValue !== undefined) metaUpdate.frequencyValue = parseFloat(body.frequencyValue) || 50;
            if (body.powerFactor !== undefined) metaUpdate.powerFactor = parseFloat(body.powerFactor) || 1.0;
            if (body.status) metaUpdate.status = trimmed(body.status);
            metaUpdate.lastUpdated = new Date();
        } else if (type === "evaravalve" || type === "valve") {
            // Valve control device updates
            const config = {};
            if (body.configuration) {
                if (body.configuration.max_position !== undefined) config.max_position = parseFloat(body.configuration.max_position) || 100;
            }
            if (Object.keys(config).length > 0) metaUpdate.configuration = config;
            
            const selectedFlowField = (body.flow_field || body.flowField || body.flowRateField || body.flow_rate_field || "field2");
            const selectedTotalField = (body.total_volume_field || body.totalVolumeField || "");
            if (selectedFlowField) {
                const normalizedFlowField = trimmed(selectedFlowField);
                metaUpdate.flow_field = normalizedFlowField;
                if (body.flow_field_name || body.flowFieldName) {
                    metaUpdate.flow_field_name = trimmed(body.flow_field_name || body.flowFieldName);
                }
                const fieldsUpdate = { flow: normalizedFlowField };
                if (selectedTotalField) {
                    const normalizedTotalField = trimmed(selectedTotalField);
                    metaUpdate.total_volume_field = normalizedTotalField;
                    fieldsUpdate.total_volume = normalizedTotalField;
                    if (body.total_volume_field_name || body.totalVolumeFieldName) {
                        metaUpdate.total_volume_field_name = trimmed(body.total_volume_field_name || body.totalVolumeFieldName);
                    }
                }
                metaUpdate.fields = fieldsUpdate;
                metaUpdate.sensor_field_mapping = {
                    [normalizedFlowField]: "flowValue",
                    ...(selectedTotalField ? { [trimmed(selectedTotalField)]: "totalVolume" } : {}),
                };
            }

            // Remove legacy valve-specific fields so the document only keeps the selected flow mapping.
            metaUpdate.position_field = admin.firestore.FieldValue.delete();
            metaUpdate.status_field = admin.firestore.FieldValue.delete();
            metaUpdate.positionValue = admin.firestore.FieldValue.delete();
            metaUpdate.statusValue = admin.firestore.FieldValue.delete();
            metaUpdate.flowValue = admin.firestore.FieldValue.delete();
            if (body.flow_field_name === "") metaUpdate.flow_field_name = admin.firestore.FieldValue.delete();
            if (body.location !== undefined) metaUpdate.location = trimmed(body.location);
            if (body.status) metaUpdate.status = trimmed(body.status);
            metaUpdate.lastUpdated = new Date();
        }

        await metaRef.set(metaUpdate, { merge: true });

        // Keep devices registry in sync for valve nodes (provisioned via single-doc createNode)
        if (type === "evaravalve" || type === "valve") {
            const registrySync = {};
            if (metaUpdate.thingspeak_channel_id) registrySync.thingspeak_channel_id = metaUpdate.thingspeak_channel_id;
            if (metaUpdate.thingspeak_read_api_key) registrySync.thingspeak_read_api_key = metaUpdate.thingspeak_read_api_key;
            if (metaUpdate.flow_field) registrySync.flow_field = metaUpdate.flow_field;
            if (metaUpdate.flow_field_name) registrySync.flow_field_name = metaUpdate.flow_field_name;
            if (metaUpdate.total_volume_field) registrySync.total_volume_field = metaUpdate.total_volume_field;
            if (metaUpdate.total_volume_field_name) registrySync.total_volume_field_name = metaUpdate.total_volume_field_name;
            if (metaUpdate.fields) registrySync.fields = metaUpdate.fields;
            if (Object.keys(registrySync).length > 0) {
                await db.collection("devices").doc(deviceDoc.id).set(registrySync, { merge: true });
            }
        }

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
            logger.debug(`[AdminController] ✅ device:updated event emitted for device: ${deviceDoc.id}, customer: ${customerId}`);
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
            logger.debug(`[AdminController] ✅ device:deleted event emitted for device: ${deviceId}, customer: ${customerId}`);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        logger.error("[AdminController] deleteNode error:", error);
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

        logger.debug(`[Dashboard] Real-time node count: ${actualNodeCount}`);

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

        logger.debug(`[Dashboard] Returning stats:`, result);

        res.status(200).json(result);
    } catch (error) {
        logger.error("[Dashboard] Failed to get summary:", error.message);
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
        logger.error("Hierarchy fetch error:", error);
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
        logger.error("[AdminController] getAuditLogs error:", error.message);
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
        logger.error("[AdminController] getZoneStats error:", error);
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
        logger.error("[Init] Aggregate failure:", error.message);
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
        logger.error("[AdminController] getSystemConfig error:", error);
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
        logger.error("[AdminController] updateSystemConfig error:", error);
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
            logger.debug(`[AdminController] ✅ device:updated event emitted for visibility change: ${deviceDoc.id}`);
        }

        logger.debug(`[AdminController] Device ${id} visibility set to: ${isVisibleToCustomer}`);
        return res.status(200).json({ success: true, isVisibleToCustomer });
    } catch (error) {
        logger.error("[AdminController] updateDeviceVisibility error:", error);
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
            logger.debug(`[AdminController] ✅ device:updated event emitted for parameter changes: ${deviceDoc.id}`);
        }

        logger.debug(`[AdminController] Device ${id} parameters updated:`, customer_config);
        return res.status(200).json({ success: true, customer_config });
    } catch (error) {
        logger.error("[AdminController] updateDeviceParameters error:", error);
        return res.status(500).json({ error: "Failed to update device parameters" });
    }
};
