#!/usr/bin/env node

/**
 * FIX EXISTING TDS DEVICE
 * 
 * This script fixes a TDS device that was created but missing:
 * 1. device_id and node_id fields in devices registry
 * 2. Entire evaratds metadata collection document
 * 
 * Usage: node fix_existing_tds_device.js <firestore_doc_id> <hardware_id>
 */

require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Try to load serviceAccount.json
const serviceAccountPath = path.join(__dirname, './serviceAccount.json');
let serviceAccountConfig = null;

if (fs.existsSync(serviceAccountPath)) {
    serviceAccountConfig = require(serviceAccountPath);
    console.log(`✅ Loaded serviceAccount.json`);
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
    console.log(`✅ Loaded Firebase credentials from env vars`);
} else {
    console.error(`❌ No Firebase credentials found!`);
    console.error(`   Looking for serviceAccount.json at: ${serviceAccountPath}`);
    console.error(`   Or set FIREBASE_PRIVATE_KEY env var`);
    process.exit(1);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountConfig),
        projectId: serviceAccountConfig.project_id,
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
}

const db = admin.firestore();

async function fixTDSDevice() {
    try {
        // The existing device from Firestore screenshot
        const docId = '1QaJqPOeSSfLPyxAGUI3';
        const hardwareId = 'EV-TDS-001';

        console.log(`\n🔧 FIXING TDS DEVICE`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`Document ID: ${docId}`);
        console.log(`Hardware ID: ${hardwareId}`);

        // Step 1: Check current device state
        console.log(`\n📖 STEP 1: Reading current device...`);
        const deviceRef = db.collection('devices').doc(docId);
        const deviceSnap = await deviceRef.get();

        if (!deviceSnap.exists) {
            console.error(`❌ Device not found!`);
            process.exit(1);
        }

        const currentDevice = deviceSnap.data();
        console.log(`✅ Device found. Current fields:`, Object.keys(currentDevice));
        console.log(`   customer_id: ${currentDevice.customer_id}`);
        console.log(`   device_type: ${currentDevice.device_type}`);
        console.log(`   device_id: ${currentDevice.device_id || 'MISSING ❌'}`);
        console.log(`   node_id: ${currentDevice.node_id || 'MISSING ❌'}`);

        // Step 2: Update device registry with device_id and node_id
        console.log(`\n✏️  STEP 2: Adding device_id and node_id to registry...`);
        await deviceRef.update({
            device_id: hardwareId,
            node_id: hardwareId
        });
        console.log(`✅ Updated devices/${docId} with device_id and node_id`);

        // Step 3: Check if evaratds collection has metadata
        console.log(`\n📖 STEP 3: Checking evaratds collection...`);
        const metadataRef = db.collection('evaratds').doc(docId);
        const metadataSnap = await metadataRef.get();

        if (metadataSnap.exists) {
            console.log(`⚠️  Metadata already exists. Current fields:`, Object.keys(metadataSnap.data()));
            console.log(`   Skipping metadata creation`);
        } else {
            console.log(`❌ evaratds/${docId} not found - creating metadata...`);

            // Create the metadata document
            const metadata = {
                device_id: hardwareId,
                node_id: hardwareId,
                label: currentDevice.displayName || 'EV-TDS Device',
                device_name: currentDevice.displayName || 'Unknown Device',
                thingspeak_read_api_key: currentDevice.thingspeak_read_api_key || '',
                thingspeak_channel_id: currentDevice.thingspeak_channel_id || '',
                customer_id: currentDevice.customer_id || '',
                zone_id: currentDevice.zone_id || '',
                latitude: currentDevice.latitude || null,
                longitude: currentDevice.longitude || null,
                configuration: {
                    type: 'TDS',
                    unit: 'ppm',
                    min_threshold: 0,
                    max_threshold: 2000
                },
                fields: {
                    tds: 'field1',
                    temperature: 'field2'
                },
                sensor_field_mapping: {
                    field1: 'tds_ppm',
                    field2: 'temperature_celsius'
                },
                created_at: new Date(),
                updated_at: new Date()
            };

            await metadataRef.set(metadata);
            console.log(`✅ Created evaratds/${docId} metadata document`);
            console.log(`   Metadata keys:`, Object.keys(metadata));
        }

        // Step 4: Verify both documents are now correct
        console.log(`\n✅ STEP 4: Verifying fixes...`);
        
        const verifyDevice = await deviceRef.get();
        const verifyData = verifyDevice.data();
        console.log(`\n📍 Updated devices/${docId}:`);
        console.log(`   device_id: ${verifyData.device_id}`);
        console.log(`   node_id: ${verifyData.node_id}`);
        console.log(`   device_type: ${verifyData.device_type}`);
        
        if (verifyData.device_id === hardwareId && verifyData.node_id === hardwareId) {
            console.log(`   ✅ Both fields are correct!`);
        } else {
            console.log(`   ❌ Fields not correct!`);
        }

        const verifyMetadata = await metadataRef.get();
        if (verifyMetadata.exists) {
            const metaData = verifyMetadata.data();
            console.log(`\n📍 evaratds/${docId}:`);
            console.log(`   device_id: ${metaData.device_id}`);
            console.log(`   node_id: ${metaData.node_id}`);
            console.log(`   thingspeak_channel_id: ${metaData.thingspeak_channel_id || 'NOT SET'}`);
            console.log(`   thingspeak_read_api_key: ${metaData.thingspeak_read_api_key ? '✅ SET' : '❌ EMPTY'}`);
            console.log(`   ✅ Metadata document exists!`);
        } else {
            console.log(`\n📍 evaratds/${docId}: ❌ NOT FOUND`);
        }

        console.log(`\n✅ DEVICE FIX COMPLETE!`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        process.exit(0);

    } catch (error) {
        console.error(`\n❌ ERROR:`, error.message);
        console.error(error);
        process.exit(1);
    }
}

fixTDSDevice();
