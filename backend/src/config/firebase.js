const admin = require("firebase-admin");
const { logger } = require("../config/pino.js");

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
    logger.info("✅ Firebase Admin SDK initialized successfully");
  }
} catch (err) {
  logger.error("❌ Firebase Admin SDK initialization failed:", err.message);
  process.exit(1);
}

const db = admin.firestore();

module.exports = { db, admin };

