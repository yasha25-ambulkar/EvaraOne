
require('dotenv').config();
const { db } = require('../src/config/firebase');

async function checkTDSData() {
  const deviceId = 'EV-TDS-001';
  
  console.log('--- Checking "devices" collection ---');
  const deviceDoc = await db.collection('devices').doc(deviceId).get();
  if (deviceDoc.exists) {
    console.log('Device found in "devices":', JSON.stringify(deviceDoc.data(), null, 2));
  } else {
    console.log('Device NOT found in "devices"');
  }

  console.log('\n--- Checking "evaratds" collection ---');
  // Try direct lookup
  const tdsDoc = await db.collection('evaratds').doc(deviceId).get();
  if (tdsDoc.exists) {
    console.log('Metadata found in "evaratds" (direct):', JSON.stringify(tdsDoc.data(), null, 2));
  } else {
    console.log('Metadata NOT found in "evaratds" (direct)');
    
    // Try field lookup
    const queryNode = await db.collection('evaratds').where('node_id', '==', deviceId).get();
    if (!queryNode.empty) {
      console.log('Metadata found in "evaratds" (node_id):', JSON.stringify(queryNode.docs[0].data(), null, 2));
    } else {
      const queryDevice = await db.collection('evaratds').where('device_id', '==', deviceId).get();
      if (!queryDevice.empty) {
        console.log('Metadata found in "evaratds" (device_id):', JSON.stringify(queryDevice.docs[0].data(), null, 2));
      } else {
        console.log('Metadata NOT found in "evaratds" at all');
      }
    }
  }
}

checkTDSData().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
