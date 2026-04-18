/**
 * TEST: Call endpoint with REAL superadmin UID from Firestore
 */

require('dotenv').config();
const axios = require('axios');
const { admin } = require('./src/config/firebase.js');

async function test() {
  console.log('\n' + '═'.repeat(80));
  console.log('TESTING WITH CORRECT SUPERADMIN UID');
  console.log('═'.repeat(80) + '\n');

  try {
    // Use the correct Ritik UID from Firestore
    const correctRitikId = '5vAwCRibuEV3r0sZze8PEtV2qzQ2';
    
    console.log('1️⃣  Creating custom token with correct UID...');
    const customToken = await admin.auth().createCustomToken(correctRitikId);
    console.log('✅ Token created\n');

    // Exchange for ID token using REST API
    console.log('2️⃣  Exchanging for ID token...');
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    
    if (!firebaseApiKey) {
      console.log('⚠️  FIREBASE_API_KEY not in .env, trying without it...');
    }
    
    const authResponse = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseApiKey || 'AIzaSyAkXF8hDnEb_cHhiXRjk5Kb7ZfL2g5Fwwk'}`,
      { token: customToken, returnSecureToken: true }
    );
    
    const idToken = authResponse.data.idToken;
    console.log('✅ ID token obtained\n');

    // Call endpoint
    console.log('3️⃣  Calling: GET /api/v1/devices/tds/EV-TDS-001/telemetry\n');
    
    const response = await axios.get(
      'http://localhost:8000/api/v1/devices/tds/EV-TDS-001/telemetry',
      { headers: { 'Authorization': `Bearer ${idToken}` } }
    );

    console.log('✅ SUCCESS! 200 Response\n');
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (err) {
    if (err.response) {
      console.error('❌ ERROR:\n');
      console.error(`Status: ${err.response.status}`);
      console.error(`Error: ${err.response.data?.error}`);
      if (err.response.data?.details) {
        console.error(`Details: ${err.response.data.details}`);
      }
      if (err.response.data?.debug) {
        console.error(`\nDebug:`);
        console.error(JSON.stringify(err.response.data.debug, null, 2));
      }
    } else {
      console.error('❌ Error:', err.message);
    }
  }

  process.exit(0);
}

test();
