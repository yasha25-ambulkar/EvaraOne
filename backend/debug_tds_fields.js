/**
 * DEBUG: Check what's actually stored for TDS devices
 * Shows all fields in the devices collection for TDS devices
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function debugTDS() {
  console.log('\n' + '═'.repeat(80));
  console.log('DEBUG: Checking TDS Device Fields');
  console.log('═'.repeat(80) + '\n');

  try {
    // Get all TDS devices
    const tdsDevices = await db.collection('devices')
      .where('device_type', '==', 'evaratds')
      .get();

    console.log(`Found ${tdsDevices.size} TDS devices\n`);

    for (const doc of tdsDevices.docs) {
      const data = doc.data();
      
      console.log(`📱 Firestore ID: ${doc.id}`);
      console.log(`   Full registry object:`);
      console.log(JSON.stringify(data, null, 2));
      console.log('\n   Key fields:');
      console.log(`   - device_id: "${data.device_id || 'MISSING/EMPTY'}"`);
      console.log(`   - node_id: "${data.node_id || 'MISSING/EMPTY'}"`);
      console.log(`   - device_type: "${data.device_type}"`);
      console.log(`   - hardwareId: "${data.hardwareId || 'MISSING/EMPTY'}"`);
      console.log();
    }

    // Now check the evaratds collection
    console.log('─'.repeat(80));
    console.log('evaratds Metadata Collection:');
    console.log('─'.repeat(80) + '\n');

    const metaDevices = await db.collection('evaratds').get();
    console.log(`Found ${metaDevices.size} documents in evaratds\n`);

    for (const doc of metaDevices.docs) {
      const data = doc.data();
      console.log(`📋 Doc ID: ${doc.id}`);
      console.log(`   device_id: "${data.device_id || 'MISSING/EMPTY'}"`);
      console.log(`   node_id: "${data.node_id || 'MISSING/EMPTY'}"`);
      console.log(`   label: "${data.label || 'MISSING/EMPTY'}"`);
      console.log(`   thingspeak_channel_id: "${data.thingspeak_channel_id}"`);
      console.log(`   thingspeak_read_api_key: ${data.thingspeak_read_api_key ? '✅ SET' : '❌ MISSING'}`);
      console.log();
    }

  } catch (err) {
    console.error('Error:', err.message);
  }

  process.exit(0);
}

debugTDS();
