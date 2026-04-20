#!/usr/bin/env node

/**
 * COMPLETE END-TO-END TDS DEVICE CREATION & LOOKUP TEST
 * 
 * This script tests the ENTIRE flow:
 * 1. Frontend → Backend: Create device API call
 * 2. Backend: Write to devices + evaratds collections
 * 3. Backend: Get device API call  
 * 4. Database: Verify both collections have data
 * 5. Frontend: Display analytics
 */

require('dotenv').config();
const admin = require('firebase-admin');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Initialize Firebase
const serviceAccountPath = path.join(__dirname, './serviceAccount.json');
let serviceAccountConfig = null;

if (fs.existsSync(serviceAccountPath)) {
    serviceAccountConfig = require(serviceAccountPath);
} else if (process.env.FIREBASE_PRIVATE_KEY) {
    serviceAccountConfig = {
        'project_id': process.env.FIREBASE_PROJECT_ID,
        'private_key_id': process.env.FIREBASE_PRIVATE_KEY_ID,
        'private_key': process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        'client_email': process.env.FIREBASE_CLIENT_EMAIL,
    };
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountConfig),
        projectId: serviceAccountConfig.project_id
    });
}

const db = admin.firestore();
const auth = admin.auth();

async function testCompleteFlow() {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 COMPLETE E2E TDS DEVICE TEST`);
    console.log(`${'='.repeat(80)}\n`);

    try {
        // Step 1: Get superadmin
        console.log(`📖 STEP 1: Getting superadmin user...`);
        const superadminSnap = await db.collection('superadmins').limit(1).get();
        if (superadminSnap.empty) {
            console.error(`❌ No superadmin found!`);
            process.exit(1);
        }
        const superadminDoc = superadminSnap.docs[0];
        const superadminUid = superadminDoc.id;
        console.log(`✅ Found superadmin: ${superadminUid}`);

        // Step 2: Create auth token
        console.log(`\n🔐 STEP 2: Creating auth token...`);
        const customToken = await auth.createCustomToken(superadminUid, {
            role: 'superadmin'
        });
        console.log(`✅ Token created`);

        // Step 3: Exchange for ID token (what frontend does)
        console.log(`\n🔄 STEP 3: Exchanging custom token for ID token...`);
        const response = await axios.post('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + process.env.FIREBASE_API_KEY, {
            token: customToken,
            returnSecureToken: true
        });
        const idToken = response.data.idToken;
        console.log(`✅ ID token obtained`);

        // Step 4: Create device via API
        console.log(`\n📝 STEP 4: Creating TDS device via API...`);
        const timestamp = Date.now();
        const deviceData = {
            displayName: `E2E-Test-${timestamp}`,
            assetType: "EvaraTDS",
            hardwareId: `TEST-E2E-${timestamp}`,
            thingspeakChannelId: "2713286",
            thingspeakReadKey: process.env.THINGSPEAK_READ_KEY || "test_key",
            latitude: 28.6139,
            longitude: 77.2090,
            zoneId: ""
        };

        console.log(`   Payload:`, deviceData);

        try {
            const createResponse = await axios.post(
                'http://localhost:8000/api/v1/admin/nodes',
                deviceData,
                {
                    headers: {
                        'Authorization': `Bearer ${idToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log(`✅ Device created! Response:`, createResponse.data);
            const createdDeviceId = createResponse.data.id || createResponse.data.data?.id;

            if (!createdDeviceId) {
                console.error(`❌ No device ID in response!`);
                console.error(`Response:`, JSON.stringify(createResponse.data, null, 2));
                process.exit(1);
            }

            // Step 5: Verify in database
            console.log(`\n🔍 STEP 5: Verifying device in database...`);

            const deviceRef = await db.collection('devices').doc(createdDeviceId).get();
            if (!deviceRef.exists) {
                console.error(`❌ Device NOT found in devices collection!`);
                process.exit(1);
            }
            const deviceData = deviceRef.data();
            console.log(`✅ Device found in devices/`);
            console.log(`   device_id: ${deviceData.device_id}`);
            console.log(`   node_id: ${deviceData.node_id}`);
            console.log(`   device_type: ${deviceData.device_type}`);

            const metadataRef = await db.collection('evaratds').doc(createdDeviceId).get();
            if (!metadataRef.exists) {
                console.error(`❌ Metadata NOT found in evaratds collection!`);
                process.exit(1);
            }
            const metaData = metadataRef.data();
            console.log(`✅ Metadata found in evaratds/`);
            console.log(`   device_id: ${metaData.device_id}`);
            console.log(`   thingspeak_channel_id: ${metaData.thingspeak_channel_id}`);

            // Step 6: Test GET endpoint
            console.log(`\n📡 STEP 6: Testing GET /api/v1/devices/tds/{id}/telemetry...`);
            try {
                const getResponse = await axios.get(
                    `http://localhost:8000/api/v1/devices/tds/${deviceData.device_id}/telemetry`,
                    {
                        headers: {
                            'Authorization': `Bearer ${idToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                console.log(`✅ GET endpoint works!`);
                console.log(`   Response keys:`, Object.keys(getResponse.data));
                console.log(`   Device name: ${getResponse.data.deviceName || 'N/A'}`);
            } catch (err) {
                console.error(`❌ GET endpoint failed:`, err.response?.data || err.message);
                process.exit(1);
            }

            // Final success
            console.log(`\n${'='.repeat(80)}`);
            console.log(`✅ SUCCESS! Complete flow working`);
            console.log(`${'='.repeat(80)}`);
            console.log(`\nDevice ID: ${createdDeviceId}`);
            console.log(`Hardware ID: ${deviceData.device_id}`);
            console.log(`\nFrontend can now access:`);
            console.log(`  - /evaratds/${deviceData.device_id}`);
            console.log(`  - /evaratds/${createdDeviceId}`);

        } catch (apiErr) {
            console.error(`❌ API call failed:`, apiErr.response?.data || apiErr.message);
            if (apiErr.response?.data) {
                console.error(`Full response:`, JSON.stringify(apiErr.response.data, null, 2));
            }
            process.exit(1);
        }

        process.exit(0);

    } catch (error) {
        console.error(`\n❌ FATAL ERROR:`, error.message);
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
}

testCompleteFlow();
