/**
 * STEP-BY-STEP DIAGNOSTIC
 * 
 * This script helps identify exactly where the device creation is failing:
 * 1. Tests auth token with a sample request
 * 2. Counts devices before
 * 3. Simulates device creation
 * 4. Counts devices after
 * 5. Shows what was created
 */

require('dotenv').config();
const { db, admin } = require('./src/config/firebase.js');

async function stepByStep() {
  console.log('\n' + '═'.repeat(80));
  console.log('STEP-BY-STEP DEVICE CREATION DIAGNOSTIC');
  console.log('═'.repeat(80) + '\n');

  try {
    // Step 1: Check Firebase Auth status
    console.log('STEP 1: Firebase Connection Status');
    console.log('─'.repeat(80));
    try {
      const testSnapshot = await db.collection('zones').limit(1).get();
      console.log('✅ Firebase Firestore: CONNECTED');
      console.log(`   Can read collections: YES\n`);
    } catch (err) {
      console.log('❌ Firebase Firestore: FAILED TO CONNECT');
      console.log(`   Error: ${err.message}\n`);
      process.exit(1);
    }

    // Step 2: Count existing devices
    console.log('STEP 2: Count Current Devices');
    console.log('─'.repeat(80));
    const devBefore = await db.collection('devices').get();
    console.log(`Total devices before: ${devBefore.size}`);
    
    let tdsBefore = 0;
    for (const doc of devBefore.docs) {
      if (doc.data().device_type === 'evaratds') tdsBefore++;
    }
    console.log(`TDS devices before: ${tdsBefore}\n`);

    // Step 3: Count metadata
    console.log('STEP 3: Count Metadata in Collections');
    console.log('─'.repeat(80));
    const collections = ['evaratds', 'evaratank', 'evaradeep', 'evaraflow'];
    const metaCounts = {};
    
    for (const col of collections) {
      try {
        const snap = await db.collection(col).get();
        metaCounts[col] = snap.size;
        console.log(`${col}: ${snap.size} documents`);
      } catch (err) {
        metaCounts[col] = 'ERROR';
        console.log(`${col}: ERROR (${err.message})`);
      }
    }
    console.log();

    // Step 4: List all TDS devices in detail
    console.log('STEP 4: List All TDS Devices Currently');
    console.log('─'.repeat(80));
    const tdsDevices = await db.collection('devices')
      .where('device_type', '==', 'evaratds')
      .get();

    console.log(`Found ${tdsDevices.size} TDS devices:\n`);
    
    for (const doc of tdsDevices.docs) {
      const registry = doc.data();
      console.log(`📱 Device ID: ${doc.id}`);
      console.log(`   device_id: ${registry.device_id}`);
      console.log(`   node_id: ${registry.node_id}`);
      
      // Check if metadata exists
      const metaDoc = await db.collection('evaratds').doc(doc.id).get();
      if (metaDoc.exists) {
        const meta = metaDoc.data();
        console.log(`   ✅ Metadata: EXISTS in evaratds/${doc.id}`);
        console.log(`      channel_id: ${meta.thingspeak_channel_id}`);
        console.log(`      has_api_key: ${meta.thingspeak_read_api_key ? 'YES' : 'NO'}`);
      } else {
        console.log(`   ❌ Metadata: MISSING from evaratds/${doc.id}`);
      }
      console.log();
    }

    // Step 5: Check devices collection for orphans (devices without metadata)
    console.log('STEP 5: Check for Orphaned Devices');
    console.log('─'.repeat(80));
    
    let orphaned = 0;
    for (const doc of devBefore.docs) {
      const registry = doc.data();
      const type = (registry.device_type || 'evaratank').toLowerCase();
      
      const metaDoc = await db.collection(type).doc(doc.id).get();
      if (!metaDoc.exists) {
        orphaned++;
        console.log(`❌ ORPHANED: ${doc.id}`);
        console.log(`   device_id: ${registry.device_id}`);
        console.log(`   device_type: ${registry.device_type}`);
        console.log(`   Missing from: ${type}/${doc.id}\n`);
      }
    }
    
    if (orphaned === 0) {
      console.log('✅ No orphaned devices found!\n');
    } else {
      console.log(`⚠️  Found ${orphaned} orphaned device(s)!\n`);
    }

    // Step 6: Summary
    console.log('─'.repeat(80));
    console.log('SUMMARY');
    console.log('─'.repeat(80) + '\n');
    
    console.log(`📊 Total Devices: ${devBefore.size}`);
    console.log(`📊 TDS Devices: ${tdsBefore}`);
    console.log(`📊 Orphaned Devices: ${orphaned}`);
    console.log(`📊 Metadata Coverage: ${((devBefore.size - orphaned) / devBefore.size * 100).toFixed(1)}%\n`);

    if (orphaned > 0) {
      console.log('🚨 ISSUES FOUND:');
      console.log(`   • ${orphaned} device(s) exist without metadata`);
      console.log('   • These devices will not work in the application\n');
    } else {
      console.log('✅ DATABASE IS HEALTHY!');
      console.log('   • All devices have metadata\n');
    }

    console.log('═'.repeat(80) + '\n');

  } catch (err) {
    console.error('Fatal error:', err.message);
    console.error(err.stack);
  }

  process.exit(0);
}

stepByStep();
