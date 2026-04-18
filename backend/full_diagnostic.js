/**
 * COMPREHENSIVE DIAGNOSTIC: Full flow test for EV-TDS-001
 */

require('dotenv').config();
const { db, admin } = require('./src/config/firebase.js');
const resolveDevice = require('./src/utils/resolveDevice.js');

async function diagnostic() {
  console.log('\n' + '═'.repeat(80));
  console.log('COMPREHENSIVE TDS DEVICE DIAGNOSTIC');
  console.log('═'.repeat(80) + '\n');

  try {
    // STEP 1: Check device registry
    console.log('STEP 1: Checking device registry...');
    const deviceReg = await db.collection('devices')
      .where('device_id', '==', 'EV-TDS-001')
      .limit(1)
      .get();

    if (deviceReg.empty) {
      console.error('❌ ERROR: Device not found in registry!');
      process.exit(1);
    }

    const deviceDoc = deviceReg.docs[0];
    const registry = deviceDoc.data();
    console.log(`✅ Device found: ${deviceDoc.id}`);
    console.log(`   device_id: ${registry.device_id}`);
    console.log(`   device_type: ${registry.device_type}`);
    console.log(`   customer_id: ${registry.customer_id}\n`);

    // STEP 2: Verify device type
    console.log('STEP 2: Validating device type...');
    if (registry.device_type?.toLowerCase() !== 'evaratds' && registry.device_type?.toLowerCase() !== 'tds') {
      console.error(`❌ ERROR: Device type is "${registry.device_type}", expected "evaratds" or "tds"`);
      process.exit(1);
    }
    console.log(`✅ Device type valid: ${registry.device_type}\n`);

    // STEP 3: Check metadata
    console.log('STEP 3: Checking metadata in evaratds collection...');
    const metaDoc = await db.collection('evaratds').doc(deviceDoc.id).get();
    
    if (!metaDoc.exists) {
      console.error(`❌ ERROR: Metadata not found in evaratds collection!`);
      process.exit(1);
    }

    const metadata = metaDoc.data();
    console.log(`✅ Metadata found`);
    console.log(`   thingspeak_channel_id: ${metadata.thingspeak_channel_id || 'MISSING'}`);
    console.log(`   thingspeak_read_api_key: ${metadata.thingspeak_read_api_key ? '✓' : '❌ MISSING'}`);
    console.log(`   label: ${metadata.label || 'MISSING'}\n`);

    // STEP 4: Check ThingSpeak credentials
    console.log('STEP 4: Validating ThingSpeak credentials...');
    const channel = metadata.thingspeak_channel_id?.trim();
    const apiKey = metadata.thingspeak_read_api_key?.trim();

    if (!channel || !apiKey) {
      console.warn('⚠️  WARNING: ThingSpeak credentials incomplete!');
      console.log('   This will result in offline status but device should still be found');
    } else {
      console.log(`✅ ThingSpeak credentials present\n`);
    }

    // STEP 5: Test resolveDevice
    console.log('STEP 5: Testing resolveDevice utility...');
    const resolved = await resolveDevice('EV-TDS-001');
    if (!resolved) {
      console.error(`❌ ERROR: resolveDevice("EV-TDS-001") returned null!`);
      process.exit(1);
    }
    console.log(`✅ resolveDevice working: found ${resolved.id}\n`);

    // STEP 6: Check superadmin
    console.log('STEP 6: Checking superadmin users...');
    const superadmins = await db.collection('superadmins').limit(10).get();
    console.log(`✅ Found ${superadmins.docs.length} superadmin(s):`);
    for (const doc of superadmins.docs) {
      console.log(`   - ${doc.id}: ${doc.data().display_name}`);
    }
    console.log();

    // SUMMARY
    console.log('═'.repeat(80));
    console.log('✅ ALL CHECKS PASSED');
    console.log('═'.repeat(80));
    console.log('\nThe device is correctly configured.');
    console.log('If you still see a 404 error, it may be due to:');
    console.log('  1. Browser cache - clear it and try again');
    console.log('  2. User not logged in - check browser console for auth status');
    console.log('  3. Backend code not loaded - restart backend with: npm start');
    console.log('\nNext: Monitor backend logs when you try to access the device analytics\n');

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

diagnostic();
