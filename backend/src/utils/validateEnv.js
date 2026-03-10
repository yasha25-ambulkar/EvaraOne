/**
 * Environment Variable Validator
 * Ensures all required secrets are present before the application starts.
 */

const REQUIRED_VARS = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY"
];

function validateEnv() {
    const missing = REQUIRED_VARS.filter(v => !process.env[v]);
    
    if (missing.length > 0) {
        console.error("❌ MISSING REQUIRED ENVIRONMENT VARIABLES:");
        missing.forEach(v => console.error(`   - ${v}`));
        console.error("\nPlease check your .env file or deployment configuration.");
        process.exit(1);
    }

    // Check for private key format
    if (process.env.FIREBASE_PRIVATE_KEY && !process.env.FIREBASE_PRIVATE_KEY.includes("BEGIN PRIVATE KEY")) {
        console.warn("⚠️  WARNING: FIREBASE_PRIVATE_KEY does not look like a valid PEM key.");
    }

    console.log("✅ Environment Variables Validated");
}

module.exports = validateEnv;
