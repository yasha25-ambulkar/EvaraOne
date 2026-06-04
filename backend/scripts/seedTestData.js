// Seed test data into evaratech-dev Firestore
const path = require("path");
const dotenv = require("dotenv");

// Load env from project root
const nodeEnv = process.env.NODE_ENV || "development";
const envFile =
  nodeEnv === "development"
    ? path.resolve(__dirname, "../../.env.development")
    : path.resolve(__dirname, "../../.env");
dotenv.config({ path: envFile });

const admin = require("firebase-admin");

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

async function seedTestData() {
  try {
    console.log("\n🌱 Starting test data seed for evaratech-dev...\n");

    // 0. Create Firebase Auth user first
    const testEmail = "mani@evaratech.com";
    const testPassword = "evaratech@1010";
    let authUser;

    try {
      authUser = await admin.auth().createUser({
        email: testEmail,
        password: testPassword,
        displayName: "Mani Test",
        emailVerified: true,
      });
      console.log("✅ Created Firebase Auth user:", testEmail);
    } catch (authErr) {
      if (authErr.code === "auth/email-already-exists") {
        console.log("⚠️  Firebase Auth user already exists:", testEmail);
        // Get the existing user
        authUser = await admin.auth().getUserByEmail(testEmail);
      } else {
        throw authErr;
      }
    }

    // 1. Create test customer
    const customerRef = db.collection("customers").doc("cust-test-001");
    await customerRef.set({
      name: "Test Customer",
      email: "test@evaratech.com",
      phone: "+91-9876543210",
      address: "Test Address",
      subscriptionTier: "premium",
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      active: true,
    });
    console.log("✅ Created test customer: cust-test-001");

    // 2. Create test superadmin in SUPERADMINS collection (for auth lookup)
    const userId = authUser.uid; // Use the Firebase Auth user ID
    const superadminRef = db.collection("superadmins").doc(userId);
    await superadminRef.set({
      uid: userId,
      email: "mani@evaratech.com",
      name: "Mani Test",
      role: "superadmin",
      permissions: ["all"],
      active: true,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });
    console.log("✅ Created superadmin in Firestore:", userId);

    // 3. Also create in USERS collection (for profile/UI lookup)
    const userRef = db.collection("users").doc(userId);
    await userRef.set({
      uid: userId,
      email: "mani@evaratech.com",
      name: "Mani Test",
      role: "superadmin",
      customerId: "cust-test-001",
      permissions: ["all"],
      active: true,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });
    console.log("✅ Created user profile in Firestore:", userId);

    // 4. Create test zone
    const zoneRef = db.collection("zones").doc("zone-test-001");
    await zoneRef.set({
      name: "Test Zone",
      customerId: "cust-test-001",
      description: "Testing zone for development",
      location: "Lab",
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      active: true,
    });
    console.log("✅ Created test zone: zone-test-001");

    console.log("\n✅ Test data seed completed successfully!\n");
    console.log("You can now login with:");
    console.log("  Email: mani@evaratech.com");
    console.log("  Password: evaratech@1010\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding test data:", error.message);
    process.exit(1);
  }
}

seedTestData();
