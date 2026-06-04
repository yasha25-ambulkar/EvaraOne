const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env.development"),
  override: true,
});
const admin = require("firebase-admin");

const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

(async () => {
  const db = admin.firestore();
  const snapshot = await db
    .collection("customers")
    .where("display_name", "==", "TestZone User")
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.log("❌ Customer TestZone User not found");
    process.exit(1);
  }

  const customer = snapshot.docs[0].data();
  console.log("✅ TestZone User found!");
  console.log("📋 zone_id value:", customer.zone_id);
  console.log("✅ zone_id is NOT empty:", !!customer.zone_id);

  if (customer.zone_id && customer.zone_id === "xSJofq1fi3LL1p9LQzfK") {
    console.log("\n🎉🎉🎉 SUCCESS! Zone ID persisted correctly to Firestore!");
  } else {
    console.log("\n❌ Zone ID mismatch or missing");
    console.log("Expected: xSJofq1fi3LL1p9LQzfK");
    console.log("Got:", customer.zone_id);
  }

  process.exit(0);
})().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
