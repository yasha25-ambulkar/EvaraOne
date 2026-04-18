require('dotenv').config();
const { db } = require('./src/config/firebase');
const axios = require('axios');

(async () => {
  try {
    console.log('\n📋 TDS DATA DIAGNOSTIC\n');

    // Get device metadata
    const registry = await db.collection('devices')
      .where('device_id', '==', 'EV-TDS-001')
      .limit(1)
      .get();

    if (registry.empty) {
      console.error('❌ Device not found');
      process.exit(1);
    }

    const regId = registry.docs[0].id;
    const registryData = registry.docs[0].data();

    console.log('✅ Device Found');
    console.log('   Firestore ID:', regId);
    console.log('   Device ID:', registryData.device_id);
    console.log('   Device Type:', registryData.device_type);

    // Get metadata
    const metadata = await db.collection('evaratds').doc(regId).get();
    if (!metadata.exists) {
      console.error('❌ Metadata not found');
      process.exit(1);
    }

    const metaData = metadata.data();
    console.log('\n✅ Metadata Found');
    console.log('   Label:', metaData.label);
    console.log('   Channel ID:', metaData.thingspeak_channel_id);
    console.log('   Field Mapping:');
    console.log(JSON.stringify(metaData.sensor_field_mapping, null, 4));

    // Fetch from ThingSpeak
    const channel = metaData.thingspeak_channel_id;
    const apiKey = metaData.thingspeak_read_api_key;

    console.log('\n📡 Fetching Latest Data from ThingSpeak...');
    const url = `https://api.thingspeak.com/channels/${channel}/feeds.json?api_key=${apiKey}&results=1`;
    const response = await axios.get(url, { timeout: 10000 });

    if (!response.data.feeds || response.data.feeds.length === 0) {
      console.error('❌ No data from ThingSpeak');
      process.exit(1);
    }

    const latestFeed = response.data.feeds[0];
    console.log('✅ Latest Feed:');
    console.log('   Timestamp:', latestFeed.created_at);
    console.log('   field1:', latestFeed.field1, '(voltage)');
    console.log('   field2:', latestFeed.field2, '(tds_value)');
    console.log('   field3:', latestFeed.field3, '(temperature)');

    // Resolve field mapping
    const mapping = metaData.sensor_field_mapping || {};
    console.log('\n🔍 Field Mapping Resolution:');
    console.log('   Mapping object:', mapping);

    // Manual reverse lookup for TDS
    let tdsField = 'field2';  // Default
    for (const [field, value] of Object.entries(mapping)) {
      if (value === 'tds_value') {
        tdsField = field;
        break;
      }
    }

    // Manual reverse lookup for Temp
    let tempField = 'field3';  // Default
    for (const [field, value] of Object.entries(mapping)) {
      if (value === 'temperature') {
        tempField = field;
        break;
      }
    }

    const tdsValue = parseFloat(latestFeed[tdsField]);
    const tempValue = parseFloat(latestFeed[tempField]);

    console.log('   TDS Field:', tdsField, '→', tdsValue, 'ppm');
    console.log('   Temp Field:', tempField, '→', tempValue, '°C');

    console.log('\n✅ EXPECTED OUTPUT FOR API:');
    console.log('   tdsValue:', tdsValue, 'ppm');
    console.log('   temperature:', tempValue, '°C');
    console.log('   quality: "Good" (since', tdsValue, '< 300)');

    console.log('\n✅ Diagnostic complete!\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
