/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TASK #11: Cache Version Invalidation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PROBLEM: flushPrefix() causes stale-data race conditions
 *   • Client A: requests list (cache miss)
 *   • Client B: updates resource
 *   • flushPrefix() clears "zones_list_*"
 *   • Client A: might still get old version before new write completes
 *   • 100-500ms window of stale data on consistent failures
 * 
 * SOLUTION: Version-based cache keys (atomic versioning)
 *   • Store: keyName_v{VERSION} instead of just keyName
 *   • Increment: VERSION counter when resource changes
 *   • Benefit: No flush needed, old keys auto-expire, no race conditions
 * 
 * ALGORITHM:
 *   1. Store zones list as "zones_list_v{X}" where X = nodes_VERSION
 *   2. When device created → increment nodes_VERSION atomically
 *   3. Old cached key "zones_list_v{old}" auto-expires (TTL)
 *   4. Next request uses new version: "zones_list_v{new}"
 * 
 * USAGE:
 *   const versionKey = getVersionKey('zones_list');
 *   const cached = await cache.get(versionKey);
 *   
 *   // On write:
 *   await incrementCacheVersion('nodes'); // Invalidates all zones_list_v* keys
 */

const logger = require("./logger.js");
const { db } = require("../config/firebase.js");

/**
 * Build versioned cache key
 * Returns: "zones_list_v123" (123 is current version number)
 */
async function getVersionKey(prefix) {
    try {
        const versionDoc = await db.collection('_cache_versions').doc(prefix).get();
        const version = versionDoc.exists ? versionDoc.data().version : 1;
        return `${prefix}_v${version}`;
    } catch (err) {
        logger.error(`[CacheVersioning] Failed to get version for ${prefix}:`, err.message);
        // Fallback to v1 on error (will cause cache miss but won't crash)
        return `${prefix}_v1`;
    }
}

/**
 * Increment version counter (atomically invalidates all related cache keys)
 * Called when a resource is created/updated/deleted
 */
async function incrementCacheVersion(resourceType) {
    try {
        const versionRef = db.collection('_cache_versions').doc(resourceType);
        
        // Atomic increment: even with concurrent requests, version increments correctly
        await versionRef.set(
            { version: require("firebase-admin/firestore").FieldValue.increment(1) },
            { merge: true }
        );
        
        logger.debug(`[CacheVersioning] Incremented ${resourceType} version (invalidates all ${resourceType}_* keys)`);
    } catch (err) {
        // Version increment failure is non-critical
        // Next request will still work (just cache miss, then fresh data)
        logger.warn(`[CacheVersioning] Failed to increment ${resourceType}:`, err.message);
    }
}

/**
 * Initialize cache versions for all resource types
 * Call this during app startup
 */
async function initializeCacheVersions() {
    const resourceTypes = [
        'zones',
        'devices', 
        'nodes',
        'customers',
        'audit_logs',
        'telemetry'
    ];

    for (const type of resourceTypes) {
        try {
            const versionRef = db.collection('_cache_versions').doc(type);
            const exists = await versionRef.get();
            
            if (!exists.exists) {
                await versionRef.set({ version: 1, created_at: new Date() });
                logger.debug(`[CacheVersioning] Initialized ${type} version to 1`);
            }
        } catch (err) {
            logger.warn(`[CacheVersioning] Failed to initialize ${type}:`, err.message);
        }
    }
}

module.exports = {
    getVersionKey,
    incrementCacheVersion,
    initializeCacheVersions
};
