const admin = require("firebase-admin");
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env.development"),
});

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = admin.firestore();

async function fixSuperadmin() {
  const CORRECT_UID = "PASTE_YOUR_FIREBASE_AUTH_UID_HERE"; // ← from Firebase Console → Authentication → Users
  const EMAIL = "ritik@evaratech.com";

  console.log("Looking for superadmin with email:", EMAIL);

  const allDocs = await db.collection("superadmins").get();
  console.log("All superadmin document IDs:");
  allDocs.forEach((doc) => {
    console.log(" -", doc.id, "| data:", JSON.stringify(doc.data()));
  });

  const correctDoc = await db.collection("superadmins").doc(CORRECT_UID).get();
  if (correctDoc.exists) {
    console.log("✅ Correct UID already exists in superadmins!");
    console.log("Data:", correctDoc.data());
    process.exit(0);
  }

  const wrongDocs = await db
    .collection("superadmins")
    .where("email", "==", EMAIL)
    .get();

  if (wrongDocs.empty) {
    console.log("No superadmin doc found — creating fresh one");
    await db.collection("superadmins").doc(CORRECT_UID).set({
      uid: CORRECT_UID,
      email: EMAIL,
      role: "superadmin",
      display_name: "Ritik",
      plan: "enterprise",
      created_at: new Date().toISOString(),
    });
    console.log("✅ Created superadmin document with UID:", CORRECT_UID);
  } else {
    const wrongDoc = wrongDocs.docs[0];
    const wrongData = wrongDoc.data();
    console.log("Found wrong document ID:", wrongDoc.id);
    console.log("Copying to correct UID:", CORRECT_UID);

    await db
      .collection("superadmins")
      .doc(CORRECT_UID)
      .set({
        ...wrongData,
        uid: CORRECT_UID,
        role: "superadmin",
      });

    await db.collection("superadmins").doc(wrongDoc.id).delete();
    console.log(
      "✅ Fixed! Old doc deleted, new doc created with UID:",
      CORRECT_UID,
    );
  }

  process.exit(0);
}

fixSuperadmin().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
