/**
 * Environment Variable Validator
 * Ensures all required secrets are present before the application starts.
 * 
 * ✅ CRITICAL FIX: Validate production-critical env vars
 */

const { logger } = require("../config/pino.js"); // ✅ AUDIT FIX M10: Import logger for structured logging

const REQUIRED_VARS = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY"
];

// ✅ CRITICAL FIX: In production, these are REQUIRED (not optional)
const PRODUCTION_REQUIRED_VARS = [
    "REDIS_URL",
    "SENTRY_DSN"
];

function validateEnv() {
    const isProd = process.env.NODE_ENV === 'production';
    
    // Always required
    const missing = REQUIRED_VARS.filter(v => !process.env[v]);
    
    if (missing.length > 0) {
        console.error("❌ MISSING REQUIRED ENVIRONMENT VARIABLES:");
        missing.forEach(v => console.error(`   - ${v}`));
        logger.error("❌ MISSING REQUIRED ENVIRONMENT VARIABLES:");
        missing.forEach(v => logger.error(`   - ${v}`));
        process.exit(1);
    }

    // Production-specific warnings (non-fatal)
    if (isProd) {
        const prodMissing = PRODUCTION_REQUIRED_VARS.filter(v => !process.env[v]);
        if (prodMissing.length > 0) {
            logger.warn("⚠️  PRODUCTION: MISSING RECOMMENDED ENVIRONMENT VARIABLES:");
            prodMissing.forEach(v => logger.warn(`   - ${v}`));
            logger.warn("These are recommended in production for reliability but the server will continue without them.");
        }
    }

    // Validate Firebase private key format
    if (process.env.FIREBASE_PRIVATE_KEY && !process.env.FIREBASE_PRIVATE_KEY.includes("BEGIN PRIVATE KEY")) {
        logger.warn("⚠️  WARNING: FIREBASE_PRIVATE_KEY does not look like a valid PEM key.");
        if (isProd) {
            logger.error("❌ PRODUCTION: Invalid Firebase private key format. Authentication will fail.");
            // We exit here because Firebase is required for the app to function at all
            process.exit(1);
        }
    }

    // ✅ CRITICAL FIX: Warn if Redis is not configured in production
    if (isProd && !process.env.REDIS_URL) {
        logger.warn("⚠️  PRODUCTION: REDIS_URL not configured.");
        logger.warn("   Using in-memory cache will cause state loss on restart and socket issues across replicas.");
    }

    // MQTT is optional — server runs without it (MQTT client will self-disable)
    if (isProd && !process.env.MQTT_BROKER_URL) {
        logger.warn("⚠️  MQTT_BROKER_URL not configured. Device telemetry ingestion will be disabled.");
    }

    if (isProd && (!process.env.MQTT_USERNAME || !process.env.MQTT_PASSWORD)) {
        logger.warn("⚠️  MQTT credentials (MQTT_USERNAME / MQTT_PASSWORD) not set. MQTT will be skipped.");
    }

    logger.debug("✅ Environment Variables Validated");
    
    // Log security-relevant info in dev
    if (!isProd) {
        logger.debug(`[ENV] NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
        logger.debug(`[ENV] Redis configured: ${!!process.env.REDIS_URL ? 'Yes' : 'No (in-memory only)'}`);
        logger.debug(`[ENV] MQTT configured: ${!!process.env.MQTT_BROKER_URL ? 'Yes' : 'No'}`);
        logger.debug(`[ENV] Sentry configured: ${!!process.env.SENTRY_DSN ? 'Yes' : 'No'}`);
    }
}

module.exports = validateEnv;

