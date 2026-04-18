/**
 * Query all devices - no WHERE clause
 * Shows if device_type field exists at all
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function checkRaw() {
  console.log('\nQuerying ALL devices (no WHERE clause):\n');

  try {
    const allDevices = await db.collection('devices').get();
    
    console.log(`Total: ${allDevices.size} documents\n`);
    
    let count = 0;
    for (const doc of allDevices.docs) {
      const data = doc.data();
      console.log(`${++count}. ID: ${doc.id}`);
      console.log(`   Type: ${data.device_type || 'UNDEFINED'}`);
      console.log(`   hardware_id: ${data.hardwareId || 'UNDEFINED'}`);
      console.log(`   device_id: ${data.device_id}`);
      console.log();
      
      if (count >= 20) break; // Limit output
    }

  } catch (err) {
    console.error('Error:', err.message);
  }

  process.exit(0);
}

checkRaw();
