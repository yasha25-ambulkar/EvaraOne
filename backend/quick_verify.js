/**
 * QUICK VERIFICATION SCRIPT
 * 
 * Run this to see:
 * 1. How many devices are in the database
 * 2. Which devices have metadata
 * 3. Which devices are MISSING metadata
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function quickCheck() {
  console.log('\n' + '═'.repeat(70));
  console.log('QUICK DATABASE VERIFICATION');
  console.log('═'.repeat(70) + '\n');

  try {
    // Get ALL devices
    const allDevices = await db.collection('devices').get();
    console.log(`📊 Total devices in database: ${allDevices.size}\n`);

    // Count by type
    const byType = {};
    for (const doc of allDevices.docs) {
      const type = doc.data().device_type;
      byType[type] = (byType[type] || 0) + 1;
    }

    console.log('Breakdown by device_type:');
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type}: ${count} devices`);
    }

    // Now check metadata
    console.log('\n' + '─'.repeat(70));
    console.log('CHECKING METADATA FOR EACH DEVICE:');
    console.log('─'.repeat(70) + '\n');

    let hasMetadata = 0;
    let missingMetadata = 0;

    for (const doc of allDevices.docs) {
      const data = doc.data();
      const type = (data.device_type || 'evaratank').toLowerCase();
      const deviceId = data.device_id;
      
      // Check if metadata exists
      const metaDoc = await db.collection(type).doc(doc.id).get();
      
      if (metaDoc.exists) {
        hasMetadata++;
        console.log(`✅ ${deviceId} (${type})`);
        console.log(`   Firestore ID: ${doc.id}`);
        console.log(`   Metadata found in ${type}/${doc.id}`);
      } else {
        missingMetadata++;
        console.log(`❌ ${deviceId} (${type})`);
        console.log(`   Firestore ID: ${doc.id}`);
        console.log(`   ⚠️  METADATA MISSING in ${type}/${doc.id}`);
      }
      console.log();
    }

    console.log('─'.repeat(70));
    console.log('SUMMARY:');
    console.log('─'.repeat(70) + '\n');
    console.log(`✅ Devices WITH metadata: ${hasMetadata}`);
    console.log(`❌ Devices WITHOUT metadata: ${missingMetadata}`);
    console.log(`   Total: ${allDevices.size}\n`);

    if (missingMetadata > 0) {
      console.log('⚠️  PROBLEM IDENTIFIED:');
      console.log(`   ${missingMetadata} device(s) are missing metadata!`);
      console.log('   These devices will NOT appear in analytics pages.\n');
    } else {
      console.log('✅ ALL DEVICES HAVE METADATA!\n');
    }

  } catch (err) {
    console.error('Error:', err.message);
  }

  process.exit(0);
}

quickCheck();
