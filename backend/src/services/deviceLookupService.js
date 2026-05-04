const resolveDevice = require('../utils/resolveDevice');
const { resolveDeviceMetadata, enrichDeviceData } = require('./deviceMetadataResolver');

/**
 * Wraps resolveDevice to return an enriched data object with 'id' field
 * and metadata from type-specific collections.
 */
async function getNodeDetails(id) {
    const doc = await resolveDevice(id);
    if (!doc) return null;
    
    const registryData = doc.data();
    const deviceType = registryData.device_type;
    
    if (deviceType) {
        try {
            // Pass registry data to allow resolution by hardware IDs (device_id/node_id)
            const metadata = await resolveDeviceMetadata(doc.id, deviceType, registryData);
            return { 
                id: doc.id, 
                ...enrichDeviceData(registryData, metadata)
            };
        } catch (err) {
            console.error(`[getNodeDetails] Metadata resolution failed for ${doc.id}:`, err.message);
        }
    }
    
    return { id: doc.id, ...registryData };
}

module.exports = { getNodeDetails };
