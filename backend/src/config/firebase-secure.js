const admin = require("firebase-admin");
const { Firestore } = require("@google-cloud/firestore");
const path = require("path");
const fs = require("fs");
const { logger } = require("./pino.js"); // ✅ AUDIT FIX M10: Import logger for structured logging

// ═══════════════════════════════════════════════════════════════════════════
// Secure Firebase initialization
// ═══════════════════════════════════════════════════════════════════════════
let serviceAccountConfig = null;

const serviceAccountPath = path.join(__dirname, "../../serviceAccount.json");

if (fs.existsSync(serviceAccountPath)) {
  serviceAccountConfig = require(serviceAccountPath);
} else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL) {
  serviceAccountConfig = {
    "type": process.env.FIREBASE_TYPE || "service_account",
    "project_id": process.env.FIREBASE_PROJECT_ID,
    "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
    "private_key": process.env.FIREBASE_PRIVATE_KEY 
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').trim().replace(/^"/, '').replace(/"$/, '')
      : undefined,
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
    "auth_uri": process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
    "token_uri": process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": process.env.FIREBASE_CLIENT_CERT_URL
  };
} else {
  throw new Error("No Firebase credentials found. Provide serviceAccount.json or set FIREBASE_PRIVATE_KEY env var.");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountConfig),
    projectId: serviceAccountConfig.project_id,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL FIX: Create Firestore with REST transport at construction time.
//
// ROOT CAUSE: Firestore defaults to gRPC transport which hangs on certain
// networks (corporate firewalls, proxies, VPNs). Firebase Auth uses REST
// and works fine — this aligns Firestore to also use REST.
//
// Using the @google-cloud/firestore constructor directly with preferRest
// ensures the REST transport is set BEFORE any connection is attempted.
// ═══════════════════════════════════════════════════════════════════════════
const db = new Firestore({
  projectId: serviceAccountConfig.project_id,
  credentials: {
    client_email: serviceAccountConfig.client_email,
    private_key: serviceAccountConfig.private_key,
  },
  preferRest: true,  // Use REST API instead of gRPC — fixes hanging connections
});

logger.debug("[Firebase] Firestore initialized with REST transport (preferRest: true)");

const auth = admin.auth();
const storage = admin.storage();

// Non-blocking startup connectivity test
(async () => {
  try {
    const testStart = Date.now();
    const snapshot = await db.collection("zones").limit(1).get();
    const elapsed = Date.now() - testStart;
    logger.debug(`[Firebase] ✅ Firestore connectivity OK (${elapsed}ms, docs: ${snapshot.size})`);
  } catch (err) {
    logger.error("[Firebase] ❌ Firestore connectivity FAILED:", err.message);
  }
})();

module.exports = { db, auth, storage, admin };


