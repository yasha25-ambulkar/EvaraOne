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



    // Validate Firebase private key format
    if (process.env.FIREBASE_PRIVATE_KEY && !process.env.FIREBASE_PRIVATE_KEY.includes("BEGIN PRIVATE KEY")) {
        logger.warn("⚠️  WARNING: FIREBASE_PRIVATE_KEY does not look like a valid PEM key.");
        if (isProd) {
            logger.error("❌ PRODUCTION: Invalid Firebase private key format. Authentication will fail.");
            // We exit here because Firebase is required for the app to function at all
            process.exit(1);
        }
    }

    // ✅ PRODUCTION: Optimization Warnings (Non-fatal)
    if (isProd) {
        if (!process.env.REDIS_URL) {
            logger.warn("⚠️  PRODUCTION: REDIS_URL not configured. Using in-memory fallback (performance may be impacted).");
        }
        if (!process.env.SENTRY_DSN) {
            logger.info("ℹ️  PRODUCTION: Sentry monitoring disabled (SENTRY_DSN missing).");
        }
        if (!process.env.MQTT_BROKER_URL) {
            logger.info("ℹ️  PRODUCTION: MQTT disabled (MQTT_BROKER_URL missing).");
        }
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

