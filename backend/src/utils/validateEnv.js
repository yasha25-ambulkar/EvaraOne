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
        logger.error("❌ MISSING REQUIRED ENVIRONMENT VARIABLES:");
        missing.forEach(v => logger.error(`   - ${v}`));
        logger.error("\nPlease check your .env file or deployment configuration.");
        process.exit(1);
    }

    // Production-specific requirements
    if (isProd) {
        const prodMissing = PRODUCTION_REQUIRED_VARS.filter(v => !process.env[v]);
        if (prodMissing.length > 0) {
            logger.error("❌ PRODUCTION: MISSING REQUIRED ENVIRONMENT VARIABLES:");
            prodMissing.forEach(v => logger.error(`   - ${v}`));
            logger.error("\nThese are mandatory in production to ensure security and reliability.");
            logger.error("Configure them in Railway environment variables.");
            process.exit(1);
        }
    }

    // Validate Firebase private key format
    if (process.env.FIREBASE_PRIVATE_KEY && !process.env.FIREBASE_PRIVATE_KEY.includes("BEGIN PRIVATE KEY")) {
        logger.warn("⚠️  WARNING: FIREBASE_PRIVATE_KEY does not look like a valid PEM key.");
        if (isProd) {
            logger.error("❌ PRODUCTION: Invalid Firebase private key. Exiting.");
            process.exit(1);
        }
    }

    // ✅ CRITICAL FIX: Warn if Redis is not configured in production
    if (isProd && !process.env.REDIS_URL) {
        logger.error("❌ PRODUCTION: REDIS_URL not configured.");
        logger.error("   Using in-memory cache will cause:");
        logger.error("   - Lost state on instance restart");
        logger.error("   - Socket.io disconnects across replicas");
        logger.error("   - Rate limit bypass in multi-instance deployments");
        process.exit(1);
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

