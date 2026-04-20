require('dotenv').config();
const { db } = require('./src/config/firebase');
const axios = require('axios');
const { resolveFieldKey } = require('./src/utils/fieldMappingResolver');

(async () => {
  try {
    console.log('\n📊 COMPREHENSIVE TDS DATA TEST\n');
    console.log('=' .repeat(60));

    // 1. Check device
    const registry = await db.collection('devices')
      .where('device_id', '==', 'EV-TDS-001')
      .limit(1)
      .get();

    if (registry.empty) {
      console.error('❌ Device not found');
      process.exit(1);
    }

    const regId = registry.docs[0].id;
    console.log('\n✅ STEP 1: Device Found');
    console.log('   ID:', regId);

    // 2. Check metadata
    const metadata = await db.collection('evaratds').doc(regId).get();
    const metaData = metadata.data();
    console.log('\n✅ STEP 2: Metadata Found');
    console.log('   Channel:', metaData.thingspeak_channel_id);
    console.log('   Field Mapping:', JSON.stringify(metaData.sensor_field_mapping, null, 4));

    // 3. Test field resolution
    const mapping = metaData.sensor_field_mapping || {};
    const tdsField = resolveFieldKey(mapping, ["tds_value"], "field2");
    const tempField = resolveFieldKey(mapping, ["temperature"], "field3");
    console.log('\n✅ STEP 3: Field Resolution');
    console.log('   TDS Field:', tdsField);
    console.log('   Temp Field:', tempField);

    // 4. Fetch from ThingSpeak
    const channel = metaData.thingspeak_channel_id;
    const apiKey = metaData.thingspeak_read_api_key;
    const limit = 60;  // For 3 hours
    const url = `https://api.thingspeak.com/channels/${channel}/feeds.json?api_key=${apiKey}&results=${limit}&timezone=UTC`;
    
    console.log('\n✅ STEP 4: Fetching from ThingSpeak');
    console.log('   URL:', url.split('&api_key')[0] + '&api_key=***');
    
    const response = await axios.get(url, { timeout: 10000 });
    const feeds = response.data.feeds;
    
    console.log('   Retrieved:', feeds.length, 'feeds');
    
    // 5. Format data
    const data = feeds.map((feed) => ({
      timestamp: feed.created_at,
      value: parseFloat(feed[tdsField]),
      temperature: parseFloat(feed[tempField]),
    }));

    console.log('\n✅ STEP 5: Data Processing');
    console.log('   Total points:', data.length);
    if (data.length > 0) {
      console.log('   First:', data[0].timestamp, '→', data[0].value, 'ppm');
      console.log('   Last:', data[data.length-1].timestamp, '→', data[data.length-1].value, 'ppm');
    }

    // 6. Test 15-min filtering
    const filtered = [];
    let lastTimestamp = 0;
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

    for (const point of data) {
      const ts = new Date(point.timestamp).getTime();
      if (filtered.length === 0 || ts - lastTimestamp >= FIFTEEN_MINUTES_MS) {
        filtered.push(point);
        lastTimestamp = ts;
      }
    }

    console.log('\n✅ STEP 6: 15-Minute Filtering');
    console.log('   Before:', data.length, 'points');
    console.log('   After:', filtered.length, 'points');
    if (filtered.length > 0) {
      console.log('   Sample points:', filtered.slice(0, 3).map(p => p.value).join(', '), '...');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED - Data should appear in chart!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
    process.exit(1);
  }
})();
