/**
 * Verify EV-TDS-001 registry entry
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function verify() {
  console.log('\n' + '═'.repeat(80));
  console.log('VERIFYING EV-TDS-001 REGISTRY ENTRY');
  console.log('═'.repeat(80) + '\n');

  try {
    // Find by device_id
    const query = await db.collection('devices')
      .where('device_id', '==', 'EV-TDS-001')
      .get();

    console.log(`Found ${query.docs.length} document(s) with device_id = "EV-TDS-001"\n`);

    for (const doc of query.docs) {
      console.log('📄 Registry Entry:');
      console.log(`   Firestore ID: ${doc.id}`);
      
      const data = doc.data();
      console.log(`   device_id: ${data.device_id}`);
      console.log(`   device_type: ${data.device_type}`);
      console.log(`   customer_id: ${data.customer_id}`);
      console.log(`   created_at: ${data.created_at}`);
      
      // Check if metadata exists
      const metaDoc = await db.collection('evaratds').doc(doc.id).get();
      console.log(`\n   Metadata exists in evaratds: ${metaDoc.exists}`);
      
      if (metaDoc.exists) {
        const meta = metaDoc.data();
        console.log(`   Metadata keys: ${Object.keys(meta).join(', ')}`);
      }
    }

  } catch (err) {
    console.error('Error:', err.message);
  }

  process.exit(0);
}

verify();
