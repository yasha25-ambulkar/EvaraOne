const path = require("path");
const dotenv = require("dotenv");
const admin = require("firebase-admin");
const { logger } = require("../config/pino.js");

// Load exactly one backend env file from project root.
// Priority:
// 1. ENV_FILE (explicit override)
// 2. .env.development for local development
// 3. .env as generic fallback
const explicitEnvFile = process.env.ENV_FILE;
const defaultEnvFile =
  process.env.NODE_ENV === "development"
    ? path.resolve(__dirname, "../../../.env.development")
    : path.resolve(__dirname, "../../../.env");
const fallbackEnvFile = path.resolve(__dirname, "../../../.env");
const envFile = explicitEnvFile
  ? path.resolve(process.cwd(), explicitEnvFile)
  : defaultEnvFile;

dotenv.config({ path: envFile, override: false });
if (!explicitEnvFile && envFile !== fallbackEnvFile) {
  dotenv.config({ path: fallbackEnvFile, override: false });
}

function getFirebaseCredentialOptions() {
  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_STORAGE_BUCKET,
    FIREBASE_DATABASE_URL,
  } = process.env;

  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return {
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
      projectId: FIREBASE_PROJECT_ID,
      ...(FIREBASE_STORAGE_BUCKET
        ? { storageBucket: FIREBASE_STORAGE_BUCKET }
        : {}),
      ...(FIREBASE_DATABASE_URL ? { databaseURL: FIREBASE_DATABASE_URL } : {}),
    };
  }

  return null;
}

try {
  if (!admin.apps.length) {
    const firebaseOptions = getFirebaseCredentialOptions();

    if (firebaseOptions) {
      admin.initializeApp(firebaseOptions);
      logger.info(
        `✅ Firebase Admin SDK initialized from env file: ${path.basename(envFile)}`,
      );
    } else {
      admin.initializeApp();
      logger.info(
        "✅ Firebase Admin SDK initialized using application default credentials",
      );
    }
  }
} catch (err) {
  logger.error("❌ Firebase Admin SDK initialization failed:", err.message);
  process.exit(1);
}

const db = admin.firestore();

module.exports = { db, admin };
