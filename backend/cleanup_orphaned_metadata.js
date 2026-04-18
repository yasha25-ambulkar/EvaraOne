/**
 * CLEANUP SCRIPT
 * 
 * This will:
 * 1. Find all orphaned TDS metadata (in evaratds but NOT in devices)
 * 2. Create registry entries for them in devices collection
 * 3. Verify all TDS devices are now complete
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function cleanup() {
  console.log('\n' + '═'.repeat(80));
  console.log('ORPHANED METADATA CLEANUP');
  console.log('═'.repeat(80) + '\n');

  try {
    // Get all TDS metadata
    console.log('1️⃣  Scanning for orphaned TDS metadata...\n');
    const allMetadata = await db.collection('evaratds').get();
    
    const orphaned = [];
    for (const doc of allMetadata.docs) {
      const meta = doc.data();
      
      // Check if registry exists
      const registry = await db.collection('devices').doc(doc.id).get();
      if (!registry.exists) {
        orphaned.push({ id: doc.id, meta });
        console.log(`❌ ORPHANED: ${doc.id}`);
        console.log(`   device_id: ${meta.device_id}`);
        console.log(`   node_id: ${meta.node_id}`);
      }
    }

    console.log(`\n📊 Found ${orphaned.length} orphaned metadata documents\n`);

    if (orphaned.length === 0) {
      console.log('✅ No orphaned metadata found!\n');
      process.exit(0);
    }

    // Create registry entries for orphaned metadata
    console.log('2️⃣  Creating registry entries for orphaned metadata...\n');
    
    for (const { id, meta } of orphaned) {
      const registryData = {
        device_id: meta.device_id,
        node_id: meta.node_id,
        device_type: 'evaratds',
        customer_id: meta.customer_id || '',
        isVisibleToCustomer: true,
        customer_config: {
          showAlerts: true,
          showConsumption: true,
          showDeviceHealth: true,
          showEstimations: true,
          showFillRate: true,
          showMap: true,
          showTankLevel: true,
          showVolume: true
        },
        analytics_template: 'EvaraTDS',
        created_at: meta.created_at || new Date()
      };

      try {
        await db.collection('devices').doc(id).set(registryData);
        console.log(`✅ Created registry for ${id}`);
        console.log(`   device_id: ${meta.device_id}`);
      } catch (err) {
        console.error(`❌ Failed to create registry for ${id}: ${err.message}`);
      }
    }

    console.log('\n3️⃣  Verifying all TDS devices now have both registry and metadata...\n');

    const allDevices = await db.collection('devices').where('device_type', '==', 'evaratds').get();
    console.log(`Total TDS devices in registry: ${allDevices.size}\n`);

    let allComplete = true;
    for (const doc of allDevices.docs) {
      const meta = await db.collection('evaratds').doc(doc.id).get();
      const complete = meta.exists;
      
      console.log(`${complete ? '✅' : '❌'} ${doc.id}`);
      console.log(`   device_id: ${doc.data().device_id}`);
      console.log(`   Metadata: ${complete ? 'EXISTS' : 'MISSING'}`);
      
      if (!complete) allComplete = false;
    }

    console.log('\n' + '═'.repeat(80));
    if (allComplete) {
      console.log('✅ SUCCESS: All TDS devices are now complete!');
    } else {
      console.log('❌ Some devices still have missing metadata');
    }
    console.log('═'.repeat(80) + '\n');

  } catch (err) {
    console.error('Error:', err.message);
  }

  process.exit(0);
}

cleanup();
