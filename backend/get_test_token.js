#!/usr/bin/env node

/**
 * Generate a Firebase custom token for testing
 * This token can be used in the Authorization header as: Bearer <token>
 */

const { admin, db } = require("./src/config/firebase.js");

async function getTestToken() {
    try {
        // Create or get a test user
        const testUid = "test-user-dev-001";
        const testEmail = "test@local.dev";

        console.log(`[TokenGen] Creating/getting test user: ${testUid}...`);

        // First, ensure the user exists in Firebase Auth
        try {
            await admin.auth().getUser(testUid);
            console.log(`[TokenGen] ✅ Test user ${testUid} already exists in Firebase Auth`);
        } catch (err) {
            if (err.code === "auth/user-not-found") {
                console.log(`[TokenGen] Test user not found, creating...`);
                const createdUser = await admin.auth().createUser({
                    uid: testUid,
                    email: testEmail,
                    emailVerified: true,
                    displayName: "Test Developer"
                });
                console.log(`[TokenGen] ✅ Created test user: ${createdUser.uid}`);
            } else {
                throw err;
            }
        }

        // Ensure test user exists in Firestore (superadmin for device creation)
        const superadminRef = db.collection("superadmins").doc(testUid);
        const superadminSnap = await superadminRef.get();
        
        if (!superadminSnap.exists) {
            console.log(`[TokenGen] Creating superadmin profile...`);
            await superadminRef.set({
                role: "superadmin",
                display_name: "Test Developer",
                email: testEmail,
                created_at: new Date().toISOString()
            });
            console.log(`[TokenGen] ✅ Created superadmin profile for ${testUid}`);
        } else {
            console.log(`[TokenGen] ✅ Superadmin profile already exists`);
        }

        // Generate custom token
        console.log(`[TokenGen] Generating custom token...`);
        const customToken = await admin.auth().createCustomToken(testUid);
        
        console.log("\n" + "=".repeat(80));
        console.log("✅ TEST TOKEN GENERATED SUCCESSFULLY");
        console.log("=".repeat(80));
        console.log("\n📋 Token Details:");
        console.log(`   User UID: ${testUid}`);
        console.log(`   Email: ${testEmail}`);
        console.log(`   Role: superadmin`);
        console.log("\n🔑 Token (use in Authorization header):");
        console.log(`   Authorization: Bearer ${customToken}`);
        console.log("\n📝 PowerShell Command Template:");
        console.log(`\n$token = "${customToken}"\n`);
        console.log(`$headers = @{\n`);
        console.log(`  "Content-Type" = "application/json"\n`);
        console.log(`  "Authorization" = "Bearer $token"\n`);
        console.log(`}\n`);
        console.log(`Invoke-WebRequest -Uri http://localhost:8000/api/v1/admin/devices \`\n`);
        console.log(`  -Method POST \`\n`);
        console.log(`  -Headers $headers \`\n`);
        console.log(`  -Body $body \`\n`);
        console.log(`  -UseBasicParsing\n`);
        console.log("=".repeat(80) + "\n");

        process.exit(0);
    } catch (error) {
        console.error("[TokenGen] Error:", error.message);
        process.exit(1);
    }
}

getTestToken();
