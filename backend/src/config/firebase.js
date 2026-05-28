// Load environment variables from the correct .env file based on NODE_ENV
const path = require("path");
const dotenv = require("dotenv");

const nodeEnv = process.env.NODE_ENV || "development";
const envFile = path.resolve(__dirname, `../../.env.${nodeEnv}`);
// Force override: true so .env.development overrides .env
dotenv.config({ path: envFile, override: true });

const admin = require("firebase-admin");
const { logger } = require("../config/pino.js");

try {
  if (!admin.apps.length) {
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

    // Prefer explicit service account via env vars (common in containerized deploys)
    if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
      logger.info("✅ Firebase Admin SDK initialized (service account from env)");
    } else {
      // Fall back to Application Default Credentials (set GOOGLE_APPLICATION_CREDENTIALS),
      // or other environment-provided credentials used by GCP/Cloud SDK.
      try {
        admin.initializeApp();
        logger.info("✅ Firebase Admin SDK initialized (application default credentials)");
      } catch (innerErr) {
        const missing = [];
        if (!FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
        if (!FIREBASE_CLIENT_EMAIL) missing.push('FIREBASE_CLIENT_EMAIL');
        if (!FIREBASE_PRIVATE_KEY) missing.push('FIREBASE_PRIVATE_KEY');

        logger.error("❌ Firebase Admin SDK initialization failed: ", innerErr.message);
        logger.error(`Missing env vars: ${missing.join(', ') || 'none (also no ADC available)'}`);
        logger.error('Tip: For local dev set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON, or provide FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env');
        throw innerErr;
      }
    }
  }
} catch (err) {
  logger.error("❌ Firebase Admin SDK initialization failed:", err.message);
  process.exit(1);
}

const db = admin.firestore();

module.exports = { db, admin };

