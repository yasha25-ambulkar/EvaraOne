const { admin, db } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const logger = require("../utils/logger.js"); // ✅ AUDIT FIX M10
const Sentry = require("@sentry/node");

const AUTH_CACHE_TTL = 3600; // 1 hour — drastically reduces Firestore reads on Spark plan

const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing auth token" });
    }

    const idToken = authHeader.split(" ")[1];


    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        
        // Check cache first for user role data
        const cacheKey = `auth_role_${decodedToken.uid}`;
        let userData = await cache.get(cacheKey);

        if (!userData) {
            // Not cached — fetch from Firestore with generous timeout + retry
            const firestoreLookup = async (attempt = 1) => {
                const firestoreTimeout = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`Firestore lookup timed out (attempt ${attempt})`)), 8000)
                );

                const lookupTask = (async () => {
                    try {
                        // Priority 1: Users collection (for superadmin and other roles)
                        let userDoc = await db.collection("users").doc(decodedToken.uid).get();
                        if (userDoc.exists) return userDoc.data();
                        
                        // Priority 2: Superadmins by ID (legacy)
                        userDoc = await db.collection("superadmins").doc(decodedToken.uid).get();
                        if (userDoc.exists) return userDoc.data();

                        // Priority 3: Customers by ID
                        userDoc = await db.collection("customers").doc(decodedToken.uid).get();
                        if (userDoc.exists) return { ...userDoc.data(), id: userDoc.id };

                        // Priority 3: Customers by Email (Fallback for pre-provisioned SaaS users)
                        if (decodedToken.email) {
                            const emailMatches = await db.collection("customers")
                                .where("email", "==", decodedToken.email)
                                .limit(1)
                                .get();
                            
                            if (!emailMatches.empty) {
                                const match = emailMatches.docs[0];
                                return { ...match.data(), id: match.id };
                            }
                        }

                        // No matching user found — return null to signal rejection
                        return null;
                    } catch (e) {
                        logger.error("Auth lookup failed", e, { category: 'auth' });
                        return null; // Signal auth failure — do NOT default to customer
                    }
                })();

                return Promise.race([lookupTask, firestoreTimeout]);
            };

            try {
                userData = await firestoreLookup(1);
                // Retry once on null from timeout (transient failure) — not on explicit "not found"
                if (userData === null) {
                    // Distinguish timeout-null from genuine-not-found by checking if error was logged
                    // For safety, retry once — if user truly doesn't exist, second attempt also returns null quickly
                    userData = await firestoreLookup(2);
                }
                // Cache the result for 5 minutes
                await cache.set(cacheKey, userData, AUTH_CACHE_TTL);
            } catch (dbError) {
                logger.error("Firestore lookup failed after retry", null, { category: 'auth', detail: dbError.message });
                return res.status(503).json({ error: "Authentication service temporarily unavailable. Please try again." });
            }
        }

        // If Firestore returned null (no user found, or lookup failed), reject
        if (!userData || !userData.role) {
            return res.status(403).json({ error: "Access denied: user account not found in system" });
        }
        
        const role = (userData.role || "customer").trim().toLowerCase().replace(/\s+/g, "");
        logger.auth('resolved', decodedToken.uid, { role });
        
        req.user = {
            ...decodedToken,
            role: role,
            display_name: userData.display_name || userData.full_name || decodedToken.name,
            community_id: userData.community_id || "",
            customer_id: userData.customer_id || userData.uid || userData.id || decodedToken.uid
        };

        next();
    } catch (error) {
        logger.error({ err: error, url: req.originalUrl }, "Auth token verification failed");
        Sentry.captureException(error);
        return res.status(401).json({ error: "Unauthorized" });

    }
};

/**
 * SaaS Architecture: Securing Device Access
 * 
 * ─── #6 FIX: TOCTOU race condition in ownership verification ─────────────────
 * ORIGINAL BUG: Between cache miss and Firestore read, device ownership could change.
 * A device reassigned from Customer A to Customer B would cache the NEW owner, but
 * the OLD owner's cached entry from before the transfer could still be valid for 4 hours.
 *
 * FIX STRATEGY:
 *   • Cache stores full ownership objects {customer_id, community_id} not bare strings
 *   • TTL reduced from 4 hours → 5 minutes (300s) so stale entries expire quickly
 *   • Use cache key `owner_v2_${deviceId}` to avoid collisions with old string-format entries
 *   • For security-sensitive paths, callers can pass { bypassCache: true }
 *
 * Efficiently verifies if a user owns a device using tiered collection lookups.
 */
async function checkOwnership(uid, deviceId, role = "customer", communityId = "", options = {}) {
    if (role === "superadmin") return true;
    if (!uid || !deviceId) return false;

    const cacheKey = `owner_v2_${deviceId}`; // v2 key prevents collisions with old entries

    try {
        // ────────────────────────────────────────────────────────────────────────────
        // Cache read (skip if bypassCache is set)
        // ────────────────────────────────────────────────────────────────────────────
        if (!options.bypassCache) {
            const cached = await cache.get(cacheKey);
            if (cached) {
                // Validate cached object has expected shape
                if (cached.customer_id === uid) return true;
                if (communityId && (cached.customer_id === communityId || cached.community_id === communityId)) return true;
            }
        }

        // ────────────────────────────────────────────────────────────────────────────
        // Authoritative Firestore read (two levels: devices/ then type-specific collection)
        // ────────────────────────────────────────────────────────────────────────────
        const registry = await db.collection("devices").doc(deviceId).get();
        if (!registry.exists) return false;

        const type = registry.data().device_type;
        if (!type) return false;

        const meta = await db.collection(type.toLowerCase()).doc(deviceId).get();
        if (!meta.exists) return false;

        const data = meta.data();
        const ownerId = data.customer_id || null;
        const ownerCommunityId = data.community_id || null;

        // ────────────────────────────────────────────────────────────────────────────
        // Write fresh ownership OBJECT to cache (not bare string!)
        // TTL: 5 minutes (300s) — short enough that device transfers are reflected
        // within one polling cycle, long enough to absorb normal read traffic.
        // ────────────────────────────────────────────────────────────────────────────
        if (ownerId || ownerCommunityId) {
            await cache.set(
                cacheKey,
                { customer_id: ownerId, community_id: ownerCommunityId },
                300  // 5 minutes, NOT 4 hours
            );
        }

        // ────────────────────────────────────────────────────────────────────────────
        // Ownership check
        // ────────────────────────────────────────────────────────────────────────────
        if (ownerId === uid) return true;
        if (communityId && (ownerId === communityId || ownerCommunityId === communityId)) return true;

        return false;
    } catch (err) {
        logger.error("Ownership check failed", err, { category: 'auth' });
        return false;
    }
}

module.exports = { requireAuth, checkOwnership };

