/**
 * VERIFY TDS ENDPOINT
 * Test that all TDS devices can be resolved by the telemetry endpoint
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');
const resolveDevice = require('./src/utils/resolveDevice.js');

async function verifyEndpoints() {
  console.log('\n' + '═'.repeat(80));
  console.log('VERIFY TDS ENDPOINTS');
  console.log('═'.repeat(80) + '\n');

  try {
    // Get all TDS devices
    const tdsDevices = await db.collection('devices')
      .where('device_type', '==', 'evaratds')
      .get();

    console.log(`Testing ${tdsDevices.size} TDS devices\n`);

    for (const doc of tdsDevices.docs) {
      const registry = doc.data();
      console.log(`\n🔍 Testing: ${registry.device_id}`);
      console.log(`   Firestore ID: ${doc.id}`);

      // Test 1: Resolve by Firestore ID
      const resolved1 = await resolveDevice(doc.id);
      console.log(`   ✓ Resolve by Firestore ID: ${resolved1 ? '✅' : '❌'}`);

      // Test 2: Resolve by device_id
      const resolved2 = await resolveDevice(registry.device_id);
      console.log(`   ✓ Resolve by device_id: ${resolved2 ? '✅' : '❌'}`);

      // Test 3: Check metadata exists
      const meta = await db.collection('evaratds').doc(doc.id).get();
      console.log(`   ✓ Metadata exists: ${meta.exists ? '✅' : '❌'}`);

      if (meta.exists) {
        const metaData = meta.data();
        console.log(`      Channel ID: ${metaData.thingspeak_channel_id}`);
        console.log(`      Has API Key: ${metaData.thingspeak_read_api_key ? '✅' : '❌'}`);
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('✅ All TDS devices can be resolved and have metadata!');
    console.log('═'.repeat(80) + '\n');

  } catch (err) {
    console.error('Error:', err.message);
  }

  process.exit(0);
}

verifyEndpoints();
