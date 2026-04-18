/**
 * FINAL TEST: Complete end-to-end test simulating frontend request
 * This tests the exact flow that would happen when user clicks device
 */

require('dotenv').config();
const axios = require('axios');
const { db, admin } = require('./src/config/firebase.js');

async function eToETest() {
  console.log('\n' + '═'.repeat(80));
  console.log('COMPLETE END-TO-END TEST');
  console.log('═'.repeat(80) + '\n');

  try {
    // Step 1: Create a test custom token for a superadmin
    console.log('Step 1: Creating custom token for superadmin...');
    const correctRitikId = '5vAwCRibuEV3r0sZze8PEtV2qzQ2';
    
    const customToken = await admin.auth().createCustomToken(correctRitikId);
    console.log('✅ Custom token created\n');

    // Step 2: Verify device exists
    console.log('Step 2: Verifying device exists in database...');
    const deviceQuery = await db.collection('devices')
      .where('device_id', '==', 'EV-TDS-001')
      .limit(1)
      .get();
    
    if (deviceQuery.empty) {
      console.error('❌ Device not found!');
      process.exit(1);
    }

    const deviceDoc = deviceQuery.docs[0];
    console.log(`✅ Device found: ${deviceDoc.id}\n`);

    // Step 3: Verify metadata
    console.log('Step 3: Verifying metadata exists...');
    const metaDoc = await db.collection('evaratds').doc(deviceDoc.id).get();
    
    if (!metaDoc.exists) {
      console.error('❌ Metadata not found!');
      process.exit(1);
    }
    
    console.log('✅ Metadata found\n');

    // Step 4: Simulate API call to backend
    console.log('Step 4: Calling backend endpoint /api/v1/devices/tds/EV-TDS-001/telemetry');
    console.log('        (Using custom token - backend will verify auth)\n');

    try {
      const response = await axios.post(
        'http://localhost:8000/api/v1/auth/exchange-token',
        { token: customToken }
      ).catch(() => null);

      // If we get here, auth endpoint might exist
      const idToken = response?.data?.idToken || customToken;

      // Call TDS endpoint
      const tdsResponse = await axios.get(
        'http://localhost:8000/api/v1/devices/tds/EV-TDS-001/telemetry',
        {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        }
      );

      console.log('✅ SUCCESS! 200 Response\n');
      console.log('Response data:');
      console.log(JSON.stringify(tdsResponse.data, null, 2));

    } catch (err) {
      if (err.response) {
        console.error(`❌ HTTP ${err.response.status}:\n`);
        console.error('Error:', err.response.data?.error);
        
        if (err.response.data?.debug) {
          console.error('\nDebug Info:');
          console.error(JSON.stringify(err.response.data.debug, null, 2));
        }

        if (err.response.data?.details) {
          console.error('\nDetails:', err.response.data.details);
        }
        
        // Show full response for investigation
        console.error('\nFull response:');
        console.error(JSON.stringify(err.response.data, null, 2));
      } else {
        console.error('Connection error:', err.message);
      }
    }

  } catch (err) {
    console.error('Test error:', err.message);
  }

  process.exit(0);
}

eToETest();
