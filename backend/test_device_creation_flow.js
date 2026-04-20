/**
 * CREATE TEST DEVICE
 * 
 * This simulates what the frontend does when creating a new TDS device
 * Watch backend logs to see if registry gets written to devices/ collection
 */

require('dotenv').config();
const axios = require('axios');
const { admin } = require('./src/config/firebase.js');

async function createTestDevice() {
  console.log('\n' + '═'.repeat(80));
  console.log('CREATING TEST TDS DEVICE');
  console.log('═'.repeat(80) + '\n');

  try {
    // Use the backend's own auth token (for testing only)
    console.log('1️⃣  Getting test auth token...');
    const { admin } = require('./src/config/firebase.js');
    
    const superadminId = '2ynm0CZ6GVUkjjnvN9YuxB6QKn2'; // From error logs
    const customToken = await admin.auth().createCustomToken(superadminId, {
      role: 'superadmin'
    });
    console.log('✅ Custom token created\n');

    // Create device
    console.log('2️⃣  Creating TDS device via API...');
    const deviceData = {
      displayName: `TEST-TDS-${Date.now()}`,
      assetType: 'EvaraTDS',
      hardwareId: `TEST-HW-${Date.now()}`,
      thingspeakChannelId: '2713286',
      thingspeakReadKey: 'dummy_key',
      latitude: 28.6139,
      longitude: 77.209,
      customerId: 'test-customer'
    };

    console.log('📤 Sending to API:');
    console.log(JSON.stringify(deviceData, null, 2));
    console.log();

    const response = await axios.post(
      'http://localhost:8000/api/v1/admin/nodes',
      deviceData,
      {
        headers: {
          'Authorization': `Bearer ${customToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ API Response: 201 Created\n');
    console.log('Response data:');
    console.log(JSON.stringify(response.data, null, 2));

    console.log('\n' + '─'.repeat(80));
    console.log('3️⃣  Verifying in database...');
    console.log('─'.repeat(80) + '\n');

    // Wait a bit for eventual consistency
    await new Promise(r => setTimeout(r, 2000));

    const { db } = require('./src/config/firebase.js');
    
    // Check devices collection
    const deviceId = response.data.device_id;
    const firestoreId = response.data.deviceId;

    console.log(`Looking for device with device_id: "${deviceId}"`);
    console.log(`Firestore ID: "${firestoreId}"\n`);

    // Check devices collection
    const devDoc = await db.collection('devices').doc(firestoreId).get();
    console.log(`devices/${firestoreId}: ${devDoc.exists ? '✅ EXISTS' : '❌ MISSING'}`);
    if (devDoc.exists) {
      const d = devDoc.data();
      console.log(`   device_type: ${d.device_type}`);
      console.log(`   device_id: ${d.device_id}`);
    }

    // Check evaratds collection
    const metaDoc = await db.collection('evaratds').doc(firestoreId).get();
    console.log(`\nevaratds/${firestoreId}: ${metaDoc.exists ? '✅ EXISTS' : '❌ MISSING'}`);
    if (metaDoc.exists) {
      const m = metaDoc.data();
      console.log(`   device_id: ${m.device_id}`);
      console.log(`   channel_id: ${m.thingspeak_channel_id}`);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('TEST COMPLETE');
    console.log('═'.repeat(80) + '\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.response?.data) {
      console.error('Response:', err.response.data);
    }
  }

  process.exit(0);
}

createTestDevice();
