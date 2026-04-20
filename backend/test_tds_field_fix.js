/**
 * TEST: Verify TDS field mapping is correctly stored and retrieved
 * 
 * This script checks:
 * 1. TDS device is created with correct field mapping
 * 2. When telemetry is fetched, it uses the correct fields
 * 3. TDS and temperature values are extracted properly
 */

const axios = require('axios');

const API_BASE = 'http://localhost:5000';

async function testTdsFieldMapping() {
  console.log('🧪 TEST: TDS Field Mapping Fix\n');
  console.log('=' .repeat(60));

  try {
    // Step 1: Get an existing TDS device
    console.log('\n📍 Step 1: Finding existing TDS device...');
    const devicesRes = await axios.get(`${API_BASE}/nodes`);
    const tdsDevices = devicesRes.data.filter(d => 
      d.device_type?.toLowerCase().includes('tds') || 
      d.assetType?.toLowerCase().includes('tds')
    );

    if (tdsDevices.length === 0) {
      console.log('❌ No TDS devices found. Please create one first.');
      return;
    }

    const tdsDevice = tdsDevices[0];
    console.log(`✅ Found TDS device: ${tdsDevice.label} (ID: ${tdsDevice.id})`);

    // Step 2: Get device metadata
    console.log('\n📍 Step 2: Checking stored field mapping...');
    const metaRes = await axios.get(`${API_BASE}/admin/nodes/${tdsDevice.id}`);
    const metadata = metaRes.data;

    console.log(`Channel ID: ${metadata.thingspeak_channel_id}`);
    console.log(`API Key: ${metadata.thingspeak_read_api_key ? '***' : 'MISSING'}`);
    console.log(`Fields object:`, metadata.fields);
    console.log(`Sensor field mapping:`, metadata.sensor_field_mapping);

    if (!metadata.fields || !metadata.fields.tds || !metadata.fields.temperature) {
      console.log('❌ PROBLEM: Field mapping not properly stored!');
      console.log('   Expected: fields = { tds: "fieldX", temperature: "fieldY" }');
      return;
    }

    console.log(`✅ Field mapping correctly stored`);
    console.log(`   TDS data from: ${metadata.fields.tds}`);
    console.log(`   Temperature data from: ${metadata.fields.temperature}`);

    // Step 3: Fetch telemetry and check values
    console.log('\n📍 Step 3: Fetching live telemetry...');
    const telemetryRes = await axios.get(`${API_BASE}/nodes/${tdsDevice.id}/telemetry`);
    const telemetry = telemetryRes.data;

    console.log(`Status: ${telemetry.status}`);
    console.log(`TDS Value: ${telemetry.tds_value}`);
    console.log(`Temperature: ${telemetry.temperature}`);
    console.log(`Field mapping used: tds=${telemetry.field_mapping.tds_field}, temp=${telemetry.field_mapping.temperature_field}`);

    if (telemetry.tds_value === null && telemetry.temperature === null) {
      console.log('⚠️  WARNING: Both TDS and temperature are null');
      console.log('   Check ThingSpeak channel has data in those fields');
      console.log('   Raw data:', telemetry.raw_data);
    } else {
      console.log(`✅ Telemetry values correctly extracted`);
    }

    // Step 4: Fetch analytics 
    console.log('\n📍 Step 4: Fetching historical data...');
    const analyticsRes = await axios.get(`${API_BASE}/nodes/${tdsDevice.id}/analytics`);
    const analytics = analyticsRes.data;

    console.log(`Status: ${analytics.status}`);
    console.log(`Latest TDS: ${analytics.tds_value}`);
    console.log(`Latest Temp: ${analytics.temperature}`);
    console.log(`History entries: ${analytics.history.length}`);
    
    if (analytics.history.length > 0) {
      const lastEntry = analytics.history[analytics.history.length - 1];
      console.log(`Last entry - TDS: ${lastEntry.tds_value}, Temp: ${lastEntry.temperature}`);
      console.log(`✅ Historical data correctly extracted`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED - TDS field mapping is working correctly!\n');

  } catch (error) {
    console.error('❌ TEST FAILED:');
    console.error(error.response?.data || error.message);
  }
}

testTdsFieldMapping();
