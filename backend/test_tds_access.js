/**
 * Test script to verify TDS device exists and is accessible
 * Usage: node test_tds_access.js <device-id>
 */

const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Ask for device ID
rl.question('Enter TDS Device ID (from URL /evaratds/:id): ', (deviceId) => {
  rl.close();
  
  if (!deviceId || deviceId.trim().length === 0) {
    console.error('❌ Device ID is required');
    process.exit(1);
  }

  // Now do the test
  testTDSDevice(deviceId.trim());
});

async function testTDSDevice(deviceId) {
  try {
    // Load Firebase
    const { db } = require('./src/config/firebase.js');
    
    console.log(`\n🔍 Testing TDS Device: ${deviceId}\n`);
    
    // Step 1: Check if device exists in devices collection
    console.log(`STEP 1: Checking if device exists in 'devices' collection...`);
    const deviceDoc = await db.collection('devices').doc(deviceId).get();
    
    if (!deviceDoc.exists) {
      console.log(`❌ Device NOT found in 'devices' collection with ID: ${deviceId}`);
      console.log(`\nPossible reasons:`);
      console.log(`  - Device ID is incorrect`);
      console.log(`  - Device was deleted`);
      console.log(`  - Device creation failed`);
      
      // Try to find any TDS devices
      console.log(`\nSearching for ANY TDS devices...`);
      const tdsDevices = await db.collection('devices').where('device_type', '==', 'tds').limit(3).get();
      if (!tdsDevices.empty) {
        console.log(`Found ${tdsDevices.size} TDS device(s):`);
        tdsDevices.forEach(doc => {
          console.log(`  - ID: ${doc.id}`);
          const data = doc.data();
          console.log(`    device_type: ${data.device_type}`);
          console.log(`    label: ${data.label || data.device_name}`);
        });
      } else {
        console.log(`No TDS devices found in database`);
      }
      
      process.exit(1);
    }
    
    const deviceData = deviceDoc.data();
    console.log(`✅ Device found!`);
    console.log(`   device_type: ${deviceData.device_type}`);
    console.log(`   device_id: ${deviceData.device_id}`);
    console.log(`   node_id: ${deviceData.node_id}`);
    console.log(`   label: ${deviceData.label}`);
    console.log(`   isVisibleToCustomer: ${deviceData.isVisibleToCustomer}`);
    console.log(`   customer_id: ${deviceData.customer_id}`);
    
    // Step 2: Check if metadata exists in evaratds collection
    console.log(`\nSTEP 2: Checking if metadata exists in 'evaratds' collection...`);
    const metaDoc = await db.collection('evaratds').doc(deviceId).get();
    
    if (!metaDoc.exists) {
      console.log(`❌ Metadata NOT found with ID: ${deviceId}`);
      console.log(`\n💡 This is the ROOT CAUSE: Device exists but metadata doesn't!`);
      console.log(`\nAttempting to find metadata by device_id or node_id...`);
      
      let found = false;
      
      if (deviceData.device_id) {
        const q1 = await db.collection('evaratds').where('device_id', '==', deviceData.device_id).limit(1).get();
        if (!q1.empty) {
          console.log(`✅ Found metadata with matching device_id: ${q1.docs[0].id}`);
          const metaData = q1.docs[0].data();
          console.log(`   thingspeak_channel_id: ${metaData.thingspeak_channel_id}`);
          console.log(`   thingspeak_read_api_key: ${metaData.thingspeak_read_api_key ? '✅ SET' : '❌ MISSING'}`);
          found = true;
        }
      }
      
      if (!found && deviceData.node_id) {
        const q2 = await db.collection('evaratds').where('node_id', '==', deviceData.node_id).limit(1).get();
        if (!q2.empty) {
          console.log(`✅ Found metadata with matching node_id: ${q2.docs[0].id}`);
          const metaData = q2.docs[0].data();
          console.log(`   thingspeak_channel_id: ${metaData.thingspeak_channel_id}`);
          console.log(`   thingspeak_read_api_key: ${metaData.thingspeak_read_api_key ? '✅ SET' : '❌ MISSING'}`);
          found = true;
        }
      }
      
      if (!found) {
        console.log(`❌ Metadata not found by device_id or node_id either`);
        console.log(`\n🔧 SOLUTION: Need to recreate the device with proper metadata creation`);
      }
      
      process.exit(1);
    }
    
    const metaData = metaDoc.data();
    console.log(`✅ Metadata found!`);
    console.log(`   label: ${metaData.label}`);
    console.log(`   thingspeak_channel_id: ${metaData.thingspeak_channel_id || '❌ MISSING'}`);
    console.log(`   thingspeak_read_api_key: ${metaData.thingspeak_read_api_key ? '✅ SET' : '❌ MISSING'}`);
    console.log(`   sensor_field_mapping: ${JSON.stringify(metaData.sensor_field_mapping)}`);
    
    // Step 3: Validate ThingSpeak credentials
    console.log(`\nSTEP 3: Validating ThingSpeak credentials...`);
    if (!metaData.thingspeak_channel_id || !metaData.thingspeak_read_api_key) {
      console.log(`❌ ThingSpeak credentials are MISSING`);
      console.log(`   channel_id: ${metaData.thingspeak_channel_id || 'NOT SET'}`);
      console.log(`   api_key: ${metaData.thingspeak_read_api_key ? 'SET' : 'NOT SET'}`);
      console.log(`\n💡 Device can be viewed but will show "ThingSpeak credentials missing" error when fetching data`);
    } else {
      console.log(`✅ ThingSpeak credentials are configured`);
      
      // Try to fetch latest data
      const axios = require('axios');
      try {
        console.log(`\nSTEP 4: Attempting to fetch latest data from ThingSpeak...`);
        const url = `https://api.thingspeak.com/channels/${metaData.thingspeak_channel_id}/feeds.json?api_key=${metaData.thingspeak_read_api_key}&results=1&timezone=UTC`;
        const response = await axios.get(url, { timeout: 5000 });
        
        if (response.data && response.data.feeds && response.data.feeds.length > 0) {
          console.log(`✅ Successfully fetched data from ThingSpeak`);
          const feed = response.data.feeds[0];
          console.log(`   Latest feed timestamp: ${feed.created_at}`);
          console.log(`   Field values:`, Object.keys(feed).filter(k => k.startsWith('field')).map(k => `${k}=${feed[k]}`).join(', '));
        } else {
          console.log(`⚠️  No data found in ThingSpeak channel`);
        }
      } catch (err) {
        console.log(`❌ Failed to fetch ThingSpeak data: ${err.message}`);
        console.log(`   This might be normal if the channel has no recent data`);
      }
    }
    
    console.log(`\n✅ DIAGNOSIS COMPLETE\n`);
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Fatal error during diagnosis:', error.message);
    console.error(error);
    process.exit(1);
  }
}
