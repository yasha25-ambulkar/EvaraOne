const crypto = require('crypto');
const { db } = require('../config/firebase.js');
const cache = require('../config/cache.js');
const logger = require('../utils/logger.js');

/**
 * ✅ FIX #5: API Key Authentication Middleware
 * Validates API keys for device-to-server communication (MQTT, device updates, etc.)
 * 
 * Usage: app.get('/endpoint', apiKeyAuth, controller)
 * 
 * Expected header format:
 *   Authorization: Bearer <api_key>
 *   OR
 *   X-API-Key: <api_key>
 */
const apiKeyAuth = async (req, res, next) => {
    try {
        // Extract API key from header (try both standard Bearer and custom X-API-Key)
        let apiKey = null;
        
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            apiKey = authHeader.split(' ')[1];
        } else if (req.headers['x-api-key']) {
            apiKey = req.headers['x-api-key'];
        }

        if (!apiKey) {
            return res.status(401).json({ error: 'Missing API key' });
        }

        // ✅ FIX #5: Hash the provided API key with SHA-256
        const apiKeyHash = crypto
            .createHash('sha256')
            .update(apiKey)
            .digest('hex');

        // Try cache first
        const cacheKey = `device_auth_${apiKeyHash}`;
        let deviceData = await cache.get(cacheKey);

        if (!deviceData) {
            // Query registry for device with matching API key hash
            const result = await db.collection('devices')
                .where('api_key_hash', '==', apiKeyHash)
                .limit(1)
                .get();

            if (result.empty) {
                return res.status(401).json({ error: 'Invalid API key' });
            }

            const storedHash = result.docs[0].data().api_key_hash;
            
            // ✅ FIX #5: Use timingSafeEqual to prevent timing attacks
            // Ensures comparison takes same time regardless of where hash differs
            if (!crypto.timingSafeEqual(
                Buffer.from(apiKeyHash),
                Buffer.from(storedHash)
            )) {
                return res.status(401).json({ error: 'Invalid API key' });
            }

            deviceData = {
                deviceId: result.docs[0].id,
                ...result.docs[0].data()
            };

            // Cache for 1 hour
            await cache.set(cacheKey, deviceData, 3600);
        }

        // Attach device info to request
        req.device = deviceData;
        req.deviceId = deviceData.deviceId;

        next();
    } catch (error) {
        logger.error('[apiKeyAuth] Authentication error:', error);
        return res.status(500).json({ error: 'Authentication failed' });
    }
};

module.exports = { apiKeyAuth };
