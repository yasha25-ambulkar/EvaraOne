/**
 * Environment Variable Validator
 * Ensures all required secrets are present before the application starts.
 */
const { logger } = require("../config/pino.js");

const REQUIRED_VARS = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "ENCRYPTION_KEY"
];

function validateEnv() {
    const isProd = process.env.NODE_ENV === 'production';

    // Check all required vars are present
    const missing = REQUIRED_VARS.filter(v => !process.env[v]);

    if (missing.length > 0) {
        console.error("❌ MISSING REQUIRED ENVIRONMENT VARIABLES:");
        missing.forEach(v => console.error(`   - ${v}`));
        if (isProd) {
            process.exit(1);
        }
    }

    // Validate ENCRYPTION_KEY is correct format (64 hex characters = 32 bytes)
    if (process.env.ENCRYPTION_KEY) {
        const key = process.env.ENCRYPTION_KEY;
        if (!/^[a-f0-9]{64}$/i.test(key)) {
            console.error("❌ ENCRYPTION_KEY must be a 64-character hex string.");
            console.error("   Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
            if (isProd) {
                process.exit(1);
            }
        }
    }

    // Warn about optional but recommended vars
    if (isProd) {
        if (!process.env.REDIS_URL) {
            logger.warn("⚠️  PRODUCTION: REDIS_URL not set. Using in-memory fallback.");
        }
        if (!process.env.SENTRY_DSN) {
            logger.info("ℹ️  PRODUCTION: Sentry disabled (SENTRY_DSN missing).");
        }
        if (!process.env.MQTT_BROKER_URL) {
            logger.info("ℹ️  PRODUCTION: MQTT disabled (MQTT_BROKER_URL missing).");
        }
    }

    logger.debug("✅ Environment Variables Validated");

    if (!isProd) {
        logger.debug(`[ENV] NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
        logger.debug(`[ENV] Encryption key set: ${!!process.env.ENCRYPTION_KEY ? 'Yes' : 'No'}`);
        logger.debug(`[ENV] Redis configured: ${!!process.env.REDIS_URL ? 'Yes' : 'No'}`);
        logger.debug(`[ENV] Sentry configured: ${!!process.env.SENTRY_DSN ? 'Yes' : 'No'}`);
    }
}

module.exports = validateEnv;

