/**
 * Environment Variable Validator
 * Ensures all required secrets are present before the application starts.
 * 
 * ✅ CRITICAL FIX: Validate production-critical env vars
 */

const REQUIRED_VARS = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY"
];

// ✅ CRITICAL FIX: In production, these are REQUIRED (not optional)
const PRODUCTION_REQUIRED_VARS = [
    "REDIS_URL",
    "MQTT_BROKER_URL",
    "MQTT_USERNAME",
    "MQTT_PASSWORD",
    "SENTRY_DSN"
];

function validateEnv() {
    const isProd = process.env.NODE_ENV === 'production';
    
    // Always required
    const missing = REQUIRED_VARS.filter(v => !process.env[v]);
    
    if (missing.length > 0) {
        console.error("❌ MISSING REQUIRED ENVIRONMENT VARIABLES:");
        missing.forEach(v => console.error(`   - ${v}`));
        console.error("\nPlease check your .env file or deployment configuration.");
        process.exit(1);
    }

    // Production-specific requirements
    if (isProd) {
        const prodMissing = PRODUCTION_REQUIRED_VARS.filter(v => !process.env[v]);
        if (prodMissing.length > 0) {
            console.error("❌ PRODUCTION: MISSING REQUIRED ENVIRONMENT VARIABLES:");
            prodMissing.forEach(v => console.error(`   - ${v}`));
            console.error("\nThese are mandatory in production to ensure security and reliability.");
            console.error("Configure them in Railway environment variables.");
            process.exit(1);
        }
    }

    // Validate Firebase private key format
    if (process.env.FIREBASE_PRIVATE_KEY && !process.env.FIREBASE_PRIVATE_KEY.includes("BEGIN PRIVATE KEY")) {
        console.warn("⚠️  WARNING: FIREBASE_PRIVATE_KEY does not look like a valid PEM key.");
        if (isProd) {
            console.error("❌ PRODUCTION: Invalid Firebase private key. Exiting.");
            process.exit(1);
        }
    }

    // ✅ CRITICAL FIX: Warn if Redis is not configured in production
    if (isProd && !process.env.REDIS_URL) {
        console.error("❌ PRODUCTION: REDIS_URL not configured.");
        console.error("   Using in-memory cache will cause:");
        console.error("   - Lost state on instance restart");
        console.error("   - Socket.io disconnects across replicas");
        console.error("   - Rate limit bypass in multi-instance deployments");
        process.exit(1);
    }

    // ✅ CRITICAL FIX: Warn if MQTT is not configured in production
    if (isProd && !process.env.MQTT_BROKER_URL) {
        console.error("❌ PRODUCTION: MQTT_BROKER_URL not configured.");
        console.error("   Device telemetry ingestion will fail.");
        process.exit(1);
    }

    // ✅ CRITICAL FIX: Validate MQTT credentials are set
    if (isProd && (!process.env.MQTT_USERNAME || !process.env.MQTT_PASSWORD)) {
        console.error("❌ PRODUCTION: MQTT authentication credentials missing.");
        console.error("   - MQTT_USERNAME required");
        console.error("   - MQTT_PASSWORD required");
        console.error("\n   Without authentication, unauthorized devices can spoof telemetry.");
        process.exit(1);
    }

    console.log("✅ Environment Variables Validated");
    
    // Log security-relevant info in dev
    if (!isProd) {
        console.log(`[ENV] NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
        console.log(`[ENV] Redis configured: ${!!process.env.REDIS_URL ? 'Yes' : 'No (in-memory only)'}`);
        console.log(`[ENV] MQTT configured: ${!!process.env.MQTT_BROKER_URL ? 'Yes' : 'No'}`);
        console.log(`[ENV] Sentry configured: ${!!process.env.SENTRY_DSN ? 'Yes' : 'No'}`);
    }
}

module.exports = validateEnv;

