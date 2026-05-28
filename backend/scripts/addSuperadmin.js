// Add a new superadmin user to evaratech-dev
const path = require("path");
const dotenv = require("dotenv");

// Load dev environment
const nodeEnv = process.env.NODE_ENV || "development";
const envFile = path.resolve(__dirname, `../.env.${nodeEnv}`);
dotenv.config({ path: envFile, override: true });

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

async function addSuperadmin(email, password, name) {
  try {
    console.log("\n🌱 Adding superadmin...\n");

    // 1. Create Firebase Auth user
    let authUser;
    try {
      authUser = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: name,
        emailVerified: true,
      });
      console.log("✅ Created Firebase Auth user:", email);
    } catch (authErr) {
      if (authErr.code === 'auth/email-already-exists') {
        console.log("⚠️  Firebase Auth user already exists:", email);
        authUser = await admin.auth().getUserByEmail(email);
      } else {
        throw authErr;
      }
    }

    // 2. Create superadmin in SUPERADMINS collection
    const userId = authUser.uid;
    const superadminRef = db.collection("superadmins").doc(userId);
    await superadminRef.set({
      uid: userId,
      email: email,
      name: name,
      role: "superadmin",
      permissions: ["all"],
      active: true,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });
    console.log("✅ Created superadmin in Firestore:", userId);

    // 3. Also create in USERS collection
    const userRef = db.collection("users").doc(userId);
    await userRef.set({
      uid: userId,
      email: email,
      name: name,
      role: "superadmin",
      permissions: ["all"],
      active: true,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });
    console.log("✅ Created user profile in Firestore:", userId);

    console.log("\n✅ Superadmin added successfully!\n");
    console.log("Login with:");
    console.log("  Email:", email);
    console.log("  Password:", password, "\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error adding superadmin:", error.message);
    process.exit(1);
  }
}

// Get arguments from command line
const email = process.argv[2];
const password = process.argv[3];
const name = process.argv[4];

if (!email || !password || !name) {
  console.log("Usage: node addSuperadmin.js <email> <password> <name>");
  console.log("Example: node addSuperadmin.js ritik@evaratech.com evaratech@1010 'Ritik'");
  process.exit(1);
}

addSuperadmin(email, password, name);
