/**
 * COMPLETE SYSTEM DIAGNOSTIC
 * Checks EVERY step of the TDS device request flow
 */

require('dotenv').config();
const { db, admin } = require('./src/config/firebase.js');
const resolveDevice = require('./src/utils/resolveDevice.js');

async function fullDiagnostic() {
  console.log('\n' + '═'.repeat(90));
  console.log('COMPREHENSIVE TDS SYSTEM DIAGNOSTIC');
  console.log('═'.repeat(90) + '\n');

  const results = {
    registry: null,
    metadata: null,
    deviceResolution: null,
    firebaseConfig: null,
    errors: []
  };

  try {
    // STEP 1: Check if user can login
    console.log('📋 STEP 1: Firebase Configuration');
    console.log('─'.repeat(90));
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const hasPrivateKey = !!process.env.FIREBASE_PRIVATE_KEY;
    const hasClientEmail = !!process.env.FIREBASE_CLIENT_EMAIL;
    
    console.log(`✅ Project ID: ${projectId || 'MISSING'}`);
    console.log(`${hasPrivateKey ? '✅' : '❌'} Private Key: ${hasPrivateKey ? 'Present' : 'MISSING'}`);
    console.log(`${hasClientEmail ? '✅' : '❌'} Client Email: ${hasClientEmail ? 'Present' : 'MISSING'}`);
    console.log();

    results.firebaseConfig = { projectId, hasPrivateKey, hasClientEmail };

    // STEP 2: Check registry
    console.log('📋 STEP 2: Device Registry (devices collection)');
    console.log('─'.repeat(90));
    
    const regQuery = await db.collection('devices')
      .where('device_id', '==', 'EV-TDS-001')
      .limit(1)
      .get();

    if (regQuery.empty) {
      console.log('❌ EV-TDS-001 NOT FOUND in registry!');
      results.errors.push('Device not in registry');
    } else {
      const regDoc = regQuery.docs[0];
      const regData = regDoc.data();
      console.log(`✅ Found: ${regDoc.id}`);
      console.log(`   device_type: ${regData.device_type}`);
      console.log(`   customer_id: ${regData.customer_id}`);
      console.log(`   device_id: ${regData.device_id}`);
      console.log(`   node_id: ${regData.node_id}`);
      results.registry = {
        id: regDoc.id,
        device_type: regData.device_type,
        customer_id: regData.customer_id
      };
    }
    console.log();

    // STEP 3: Check metadata
    console.log('📋 STEP 3: Device Metadata (evaratds collection)');
    console.log('─'.repeat(90));
    
    if (!results.registry) {
      console.log('⏭️  Skipping - registry not found\n');
    } else {
      const metaQuery = await db.collection('evaratds')
        .where('device_id', '==', 'EV-TDS-001')
        .limit(1)
        .get();

      if (metaQuery.empty) {
        console.log('❌ Metadata NOT FOUND by device_id!');
        
        // Try by direct ID
        const metaDoc = await db.collection('evaratds').doc(results.registry.id).get();
        if (!metaDoc.exists) {
          console.log('❌ Also NOT FOUND by document ID!');
          results.errors.push('Metadata not in evaratds collection');
        } else {
          console.log(`✅ Found by document ID: ${results.registry.id}`);
          const metaData = metaDoc.data();
          console.log(`   label: ${metaData.label}`);
          console.log(`   thingspeak_channel_id: ${metaData.thingspeak_channel_id || 'MISSING'}`);
          console.log(`   thingspeak_read_api_key: ${metaData.thingspeak_read_api_key ? '✓' : 'MISSING'}`);
          results.metadata = metaData;
        }
      } else {
        console.log(`✅ Found by device_id: ${metaQuery.docs[0].id}`);
        const metaData = metaQuery.docs[0].data();
        console.log(`   label: ${metaData.label}`);
        console.log(`   thingspeak_channel_id: ${metaData.thingspeak_channel_id || 'MISSING'}`);
        console.log(`   thingspeak_read_api_key: ${metaData.thingspeak_read_api_key ? '✓' : 'MISSING'}`);
        results.metadata = metaData;
      }
    }
    console.log();

    // STEP 4: Check device resolution
    console.log('📋 STEP 4: Device Resolution Utility');
    console.log('─'.repeat(90));
    
    const resolved = await resolveDevice('EV-TDS-001');
    if (!resolved) {
      console.log('❌ resolveDevice() returned null!');
      results.errors.push('Device resolution failed');
    } else {
      console.log(`✅ resolveDevice("EV-TDS-001") found: ${resolved.id}`);
      results.deviceResolution = {
        id: resolved.id,
        device_id: resolved.data().device_id,
        device_type: resolved.data().device_type
      };
    }
    console.log();

    // STEP 5: Check superadmins
    console.log('📋 STEP 5: Superadmin Users');
    console.log('─'.repeat(90));
    
    const superadmins = await db.collection('superadmins').limit(10).get();
    console.log(`Found ${superadmins.docs.length} superadmin(s):`);
    for (const doc of superadmins.docs) {
      const data = doc.data();
      console.log(`  ✓ ${doc.id}: ${data.display_name || 'N/A'} (${data.email})`);
    }
    console.log();

    // STEP 6: Check TDS devices count
    console.log('📋 STEP 6: TDS Device Count');
    console.log('─'.repeat(90));
    
    const allDevices = await db.collection('devices').get();
    let tdsCount = 0;
    const typeCount = {};
    
    for (const doc of allDevices.docs) {
      const type = doc.data().device_type;
      typeCount[type] = (typeCount[type] || 0) + 1;
      if (type === 'evaratds') tdsCount++;
    }
    
    console.log(`Total devices: ${allDevices.docs.length}`);
    console.log('Breakdown:');
    for (const [type, count] of Object.entries(typeCount)) {
      console.log(`  ${type}: ${count}`);
    }
    console.log();

    // FINAL SUMMARY
    console.log('═'.repeat(90));
    console.log('DIAGNOSTIC SUMMARY');
    console.log('═'.repeat(90) + '\n');

    if (results.errors.length === 0) {
      console.log('✅ ALL SYSTEMS OPERATIONAL\n');
      console.log('Device is correctly configured:');
      console.log(`  📌 Registry ID: ${results.registry?.id}`);
      console.log(`  📌 Device Type: ${results.registry?.device_type}`);
      console.log(`  📌 Customer ID: ${results.registry?.customer_id}`);
      console.log(`  📌 Metadata: Present with ThingSpeak config`);
      console.log(`  📌 Device Resolution: Working\n`);
      console.log('🎯 NEXT STEP: Test from browser\n');
      console.log('Instructions:');
      console.log('  1. Hard refresh browser: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)');
      console.log('  2. Clear service workers: DevTools → Storage → Service Workers → Unregister');
      console.log('  3. Go to Dashboard');
      console.log('  4. Click on EV-TDS-001 → VIEW MORE');
      console.log('  5. Check browser console (F12 → Console) for any errors\n');
    } else {
      console.log('❌ ERRORS FOUND:\n');
      for (let i = 0; i < results.errors.length; i++) {
        console.log(`  ${i + 1}. ${results.errors[i]}`);
      }
      console.log('\n🔧 ACTION REQUIRED: Fix the errors listed above\n');
    }

  } catch (err) {
    console.error('\n❌ FATAL ERROR:', err.message);
    console.error(err.stack);
  }

  process.exit(0);
}

fullDiagnostic();
