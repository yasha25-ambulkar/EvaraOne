#!/usr/bin/env node

/**
 * Create a test TDS device via API to trigger device creation logs
 */

require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Initialize Firebase
const serviceAccountPath = path.join(__dirname, './serviceAccount.json');
let serviceAccountConfig = null;

if (fs.existsSync(serviceAccountPath)) {
    serviceAccountConfig = require(serviceAccountPath);
} else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PROJECT_ID) {
    serviceAccountConfig = {
        "type": process.env.FIREBASE_TYPE || "service_account",
        "project_id": process.env.FIREBASE_PROJECT_ID,
        "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
        "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        "client_email": process.env.FIREBASE_CLIENT_EMAIL,
        "auth_uri": process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
        "token_uri": process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": process.env.FIREBASE_CLIENT_CERT_URL
    };
} else {
    console.error(`❌ No Firebase credentials found!`);
    process.exit(1);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountConfig),
        projectId: serviceAccountConfig.project_id
    });
}

const db = admin.firestore();
const auth = admin.auth();

async function createTestDevice() {
    try {
        console.log(`\n🔧 CREATE TEST TDS DEVICE\n`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        // Step 1: Get a superadmin user
        console.log(`\n📖 STEP 1: Finding superadmin user...`);
        const superadminSnap = await db.collection('superadmins').limit(1).get();
        if (superadminSnap.empty) {
            console.error(`❌ No superadmin found!`);
            process.exit(1);
        }
        const superadminDoc = superadminSnap.docs[0];
        const superadminUid = superadminDoc.id;
        const superadminEmail = superadminDoc.data().email;
        console.log(`✅ Found superadmin: ${superadminEmail}`);

        // Step 2: Create custom auth token
        console.log(`\n🔐 STEP 2: Creating auth token...`);
        const customToken = await auth.createCustomToken(superadminUid, {
            role: 'superadmin'
        });
        console.log(`✅ Auth token created`);

        // Step 3: Call API to create device
        console.log(`\n📝 STEP 3: Creating TDS device via API...`);
        const devicePayload = {
            displayName: `TEST-TDS-${Date.now()}`,
            assetType: "EvaraTDS",
            hardwareId: `TEST-HW-${Date.now()}`,
            thingspeakChannelId: "2713286",
            thingspeakReadKey: process.env.THINGSPEAK_READ_KEY || "dummy_key",
            latitude: 28.6139,
            longitude: 77.2090,
            zoneId: ""
        };

        console.log(`\nPayload being sent:`);
        console.log(JSON.stringify(devicePayload, null, 2));

        const response = await axios.post(
            'http://localhost:8000/api/v1/admin/nodes',
            devicePayload,
            {
                headers: {
                    'Authorization': `Bearer ${customToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`\n✅ API RESPONSE:`);
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.success && response.data.id) {
            console.log(`\n✅ DEVICE CREATED! ID: ${response.data.id}`);
            
            // Step 4: Verify in database
            console.log(`\n🔍 STEP 4: Verifying in database...`);
            const docId = response.data.id;
            const deviceRef = await db.collection('devices').doc(docId).get();
            if (deviceRef.exists) {
                const deviceData = deviceRef.data();
                console.log(`✅ Device registry exists in devices/${docId}`);
                console.log(`   Fields:`, Object.keys(deviceData));
                console.log(`   device_id: ${deviceData.device_id}`);
                console.log(`   node_id: ${deviceData.node_id}`);
            }

            const metadataRef = await db.collection('evaratds').doc(docId).get();
            if (metadataRef.exists) {
                const metaData = metadataRef.data();
                console.log(`✅ Metadata exists in evaratds/${docId}`);
                console.log(`   Fields:`, Object.keys(metaData));
                console.log(`   device_id: ${metaData.device_id}`);
                console.log(`   thingspeak_channel_id: ${metaData.thingspeak_channel_id}`);
            } else {
                console.error(`❌ Metadata NOT found in evaratds/${docId}`);
            }
        } else {
            console.error(`❌ Device creation failed!`);
            console.error(response.data);
        }

        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        process.exit(0);

    } catch (error) {
        console.error(`\n❌ ERROR:`, error.message);
        if (error.response) {
            console.error(`Response:`, error.response.data);
        }
        console.error(error);
        process.exit(1);
    }
}

createTestDevice();
