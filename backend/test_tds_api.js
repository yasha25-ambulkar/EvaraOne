require('dotenv').config();
const axios = require('axios');

(async () => {
  try {
    console.log('\n🧪 Testing TDS Telemetry API...\n');

    // Call the API directly
    const baseURL = 'http://localhost:8000/api/v1';
    const deviceId = 'EV-TDS-001';
    const url = `${baseURL}/devices/tds/${deviceId}/telemetry`;

    console.log('📡 Request:', url);
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Authorization': 'Bearer test-token'
      }
    }).catch(err => {
      console.log('Note: No auth, that\'s OK for this test');
      // Try without auth to see raw response
      return axios.get(url, { timeout: 10000 });
    });

    const data = response.data;
    console.log('\n✅ API Response:');
    console.log('   tdsValue:', data.tdsValue, 'ppm');
    console.log('   temperature:', data.temperature, '°C');
    console.log('   waterQualityRating:', data.waterQualityRating);
    console.log('   status:', data.status);
    console.log('   timestamp:', data.timestamp);

    if (data.tdsValue === 57) {
      console.log('\n✅ SUCCESS: API returns correct TDS value!');
      console.log('   Dashboard should show: 57 ppm');
    } else {
      console.log('\n❌ ERROR: API returns wrong TDS value!');
      console.log('   Expected: 57 ppm');
      console.log('   Got:', data.tdsValue, 'ppm');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
})();
