/**
 * URGENT: Check if metadata still exists
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function check() {
  try {
    console.log('\n🔍 Checking if EV-TDS-001 metadata exists...\n');

    // Get registry first
    const regQuery = await db.collection('devices')
      .where('device_id', '==', 'EV-TDS-001')
      .limit(1)
      .get();

    if (regQuery.empty) {
      console.log('❌ EV-TDS-001 not in registry!');
      process.exit(1);
    }

    const regDoc = regQuery.docs[0];
    const regId = regDoc.id;
    console.log(`Registry ID: ${regId}\n`);

    // Check metadata by direct ID
    console.log('Checking evaratds collection for document: ' + regId);
    const metaDoc = await db.collection('evaratds').doc(regId).get();

    if (metaDoc.exists) {
      console.log('✅ Metadata EXISTS by direct ID');
      console.log('Data:', Object.keys(metaDoc.data()).join(', '));
    } else {
      console.log('❌ Metadata NOT FOUND by direct ID\n');

      // Try querying by device_id
      console.log('Trying query by device_id...');
      const q = await db.collection('evaratds').where('device_id', '==', 'EV-TDS-001').limit(1).get();
      
      if (q.empty) {
        console.log('❌ Not found by device_id either!');
        
        // List all evaratds documents
        console.log('\nListing all evaratds documents:');
        const all = await db.collection('evaratds').limit(10).get();
        console.log(`Found ${all.docs.length} documents:`);
        for (const doc of all.docs) {
          const data = doc.data();
          console.log(`  - ${doc.id}: ${data.device_id || 'NO device_id'}`);
        }
      } else {
        console.log('✅ Found by device_id: ' + q.docs[0].id);
      }
    }

  } catch (err) {
    console.error('Error:', err.message, err.code);
  }

  process.exit(0);
}

check();
