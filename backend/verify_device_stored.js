/**
 * Verify that device creation properly stores device_id and node_id
 * This checks the database for a device with specific hardware ID
 * Usage: node verify_device_stored.js <hardware-id>
 * Example: node verify_device_stored.js EV-TDS-001
 */

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter Hardware ID to verify (e.g., EV-TDS-001): ', (hardwareId) => {
  rl.close();
  
  if (!hardwareId || hardwareId.trim().length === 0) {
    console.error('❌ Hardware ID is required');
    process.exit(1);
  }

  verify(hardwareId.trim());
});

async function verify(hardwareId) {
  try {
    const { db } = require('./src/config/firebase.js');
    
    console.log(`\n🔍 Verifying device storage for hardware ID: "${hardwareId}"\n`);
    
    // Step 1: Query by device_id
    console.log(`STEP 1: Searching 'devices' collection for device_id = "${hardwareId}"...`);
    const q1 = await db.collection('devices').where('device_id', '==', hardwareId).limit(1).get();
    
    if (!q1.empty) {
      const doc = q1.docs[0];
      const data = doc.data();
      console.log(`✅ FOUND by device_id query!`);
      console.log(`   Firestore ID: ${doc.id}`);
      console.log(`   device_id: ${data.device_id}`);
      console.log(`   node_id: ${data.node_id}`);
      console.log(`   device_type: ${data.device_type}`);
      console.log(`   customer_id: ${data.customer_id}`);
      console.log(`   label: ${data.label}`);
      console.log(`   created_at: ${data.created_at}`);
      console.log(`\n🔍 Now checking metadata in evaratds collection...`);
      
      // Check metadata
      const metaDoc = await db.collection('evaratds').doc(doc.id).get();
      if (metaDoc.exists) {
        const metaData = metaDoc.data();
        console.log(`✅ Metadata found!`);
        console.log(`   device_id: ${metaData.device_id}`);
        console.log(`   node_id: ${metaData.node_id}`);
        console.log(`   thingspeak_channel_id: ${metaData.thingspeak_channel_id || '❌ MISSING'}`);
        console.log(`   thingspeak_read_api_key: ${metaData.thingspeak_read_api_key ? '✅ SET' : '❌ MISSING'}`);
        console.log(`\n✅ VERIFICATION PASSED: Device is properly stored!`);
      } else {
        console.log(`❌ Metadata NOT found in evaratds collection!`);
        console.log(`   Expected ID: ${doc.id}`);
      }
    } else {
      console.log(`❌ NOT FOUND by device_id query`);
      
      // Step 2: Query by node_id
      console.log(`\nSTEP 2: Searching for node_id = "${hardwareId}"...`);
      const q2 = await db.collection('devices').where('node_id', '==', hardwareId).limit(1).get();
      
      if (!q2.empty) {
        const doc = q2.docs[0];
        const data = doc.data();
        console.log(`⚠️  Found by node_id (but device_id doesn't match!)`);
        console.log(`   device_id: ${data.device_id}`);
        console.log(`   node_id: ${data.node_id}`);
      } else {
        console.log(`❌ NOT FOUND by node_id either`);
        console.log(`\n💡 This means the device was NOT created in the database!`);
        console.log(`   Check the backend logs for device creation errors.`);
      }
    }
    
    console.log();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}
