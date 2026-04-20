/**
 * TEST: Call /api/v1/devices/tds/EV-TDS-001/telemetry with proper ID token
 */

require('dotenv').config();
const axios = require('axios');
const { admin } = require('./src/config/firebase.js');

async function test() {
  console.log('\n' + '═'.repeat(80));
  console.log('TESTING: GET /api/v1/devices/tds/EV-TDS-001/telemetry');
  console.log('═'.repeat(80) + '\n');

  try {
    // Create custom token
    const superadminId = '2ynm0CZ6GVUkjjnvN9YuxB6QKn2';
    console.log('1️⃣  Creating custom token for superadmin...');
    const customToken = await admin.auth().createCustomToken(superadminId);
    console.log('✅ Custom token created\n');

    // Exchange for ID token using REST API
    console.log('2️⃣  Exchanging for ID token...');
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    const authResponse = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseApiKey}`,
      {
        token: customToken,
        returnSecureToken: true
      }
    );
    
    const idToken = authResponse.data.idToken;
    console.log('✅ ID token obtained\n');

    // Call endpoint
    console.log('3️⃣  Calling endpoint: GET /api/v1/devices/tds/EV-TDS-001/telemetry\n');
    
    const response = await axios.get(
      'http://localhost:8000/api/v1/devices/tds/EV-TDS-001/telemetry',
      {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      }
    );

    console.log('✅ SUCCESS! 200 Response\n');
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (err) {
    if (err.response) {
      console.error('❌ ERROR Response:\n');
      console.error(`Status: ${err.response.status}`);
      console.error(`Message: ${err.response.data?.error}`);
      
      if (err.response.data?.debug) {
        console.error('\n📋 Debug Info:');
        console.error(JSON.stringify(err.response.data.debug, null, 2));
      }
      
      console.error('\nFull response:');
      console.error(JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('❌ Error:', err.message);
    }
  }

  process.exit(0);
}

test();
