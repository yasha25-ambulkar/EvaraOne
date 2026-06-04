const resolveDevice = require('../utils/resolveDevice');
const { resolveDeviceMetadata, enrichDeviceData } = require('./deviceMetadataResolver');

// COST OPT A8 - cache device metadata
const _deviceCache = new Map();
const DEVICE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Wraps resolveDevice to return an enriched data object with 'id' field
 * and metadata from type-specific collections.
 */
async function getNodeDetails(id) {
    if (!id) return null;

    // COST OPT A8 - cache device metadata
    const cached = _deviceCache.get(id);
    if (cached && (Date.now() - cached.cachedAt) < DEVICE_CACHE_TTL_MS) {
        return cached.data;
    }

    const doc = await resolveDevice(id);
    if (!doc) return null;
    
    const registryData = doc.data();
    const deviceType = registryData.device_type;
    
    let result;
    if (deviceType) {
        try {
            // Pass registry data to allow resolution by hardware IDs (device_id/node_id)
            const metadata = await resolveDeviceMetadata(doc.id, deviceType, registryData);
            result = { 
                id: doc.id, 
                ...enrichDeviceData(registryData, metadata)
            };
        } catch (err) {
            console.error(`[getNodeDetails] Metadata resolution failed for ${doc.id}:`, err.message);
            result = { id: doc.id, ...registryData };
        }
    } else {
        result = { id: doc.id, ...registryData };
    }
    
    _deviceCache.set(id, { data: result, cachedAt: Date.now() });
    return result;
}

function clearCache(deviceId) {
    if (deviceId) {
        _deviceCache.delete(deviceId);
    }
}

module.exports = { getNodeDetails, clearCache };
