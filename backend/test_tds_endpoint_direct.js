/**
 * TEST: Can we access the telemetry endpoint for EV-TDS-001?
 */

require('dotenv').config();
const axios = require('axios');
const { admin } = require('./src/config/firebase.js');

async function testEndpoint() {
  console.log('\n' + '═'.repeat(80));
  console.log('TEST: TDS TELEMETRY ENDPOINT');
  console.log('═'.repeat(80) + '\n');

  try {
    // Get auth token
    console.log('1️⃣  Getting auth token...');
    const superadminId = '2ynm0CZ6GVUkjjnvN9YuxB6QKn2';
    const customToken = await admin.auth().createCustomToken(superadminId, {
      role: 'superadmin'
    });
    console.log('✅ Token created\n');

    // Test endpoint
    console.log('2️⃣  Testing endpoint: /api/v1/devices/tds/EV-TDS-001/telemetry\n');
    
    try {
      const response = await axios.get(
        'http://localhost:8000/api/v1/devices/tds/EV-TDS-001/telemetry',
        {
          headers: {
            'Authorization': `Bearer ${customToken}`
          }
        }
      );

      console.log('✅ SUCCESS! 200 Response\n');
      console.log('Response data:');
      console.log(JSON.stringify(response.data, null, 2));

    } catch (err) {
      console.error('❌ ERROR:\n');
      console.error(`Status: ${err.response?.status}`);
      console.error(`Message: ${err.response?.data?.error}`);
      
      if (err.response?.data?.debug) {
        console.error(`\nDebug Info:`);
        console.error(JSON.stringify(err.response.data.debug, null, 2));
      }
      
      console.error(`\nFull response:`);
      console.error(JSON.stringify(err.response?.data, null, 2));
    }

  } catch (err) {
    console.error('Auth error:', err.message);
  }

  process.exit(0);
}

testEndpoint();
