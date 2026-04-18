/**
 * DIAGNOSTIC SCRIPT: Identify why evaratds metadata is not being written
 * 
 * This will test:
 * 1. Can we write to evaratds collection directly?
 * 2. Can we write to both collections in a batch?
 * 3. Are there Firestore rules blocking writes?
 * 4. Is the collection name correct?
 */

require('dotenv').config();

// Use the same Firebase initialization as the backend
const { db } = require('./src/config/firebase.js');

console.log('✅ Firebase initialized\n');

async function testBatchWrite() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 1: Direct write to evaratds collection');
  console.log('═══════════════════════════════════════════════════════════\n');

  const testDocId = `TEST-DIRECT-${Date.now()}`;
  const testData = {
    device_id: 'TEST-DEVICE',
    node_id: 'TEST-DEVICE',
    thingspeak_channel_id: '2713286',
    thingspeak_read_api_key: 'test_key_12345',
    created_at: new Date(),
    test_marker: 'DIRECT_WRITE'
  };

  try {
    console.log(`Writing to evaratds/${testDocId}...`);
    await db.collection('evaratds').doc(testDocId).set(testData);
    console.log('✅ DIRECT WRITE SUCCEEDED\n');
    
    // Verify it was written
    const verify = await db.collection('evaratds').doc(testDocId).get();
    if (verify.exists) {
      console.log('✅ VERIFIED: Document exists in evaratds collection');
      console.log('   Data:', verify.data());
    } else {
      console.log('❌ Document was not found after write!');
    }
  } catch (err) {
    console.error('❌ DIRECT WRITE FAILED:', err.message);
    console.error('   Error code:', err.code);
    console.error('   Full error:', err);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TEST 2: Batch write to both devices and evaratds');
  console.log('═══════════════════════════════════════════════════════════\n');

  const batchTestId = `TEST-BATCH-${Date.now()}`;
  const batch = db.batch();

  const registryData = {
    device_id: 'TEST-BATCH-DEVICE',
    device_type: 'evaratds',
    node_id: 'TEST-BATCH-DEVICE',
    customer_id: 'test-customer',
    created_at: new Date(),
    test_marker: 'BATCH_REGISTRY'
  };

  const metadataData = {
    device_id: 'TEST-BATCH-DEVICE',
    node_id: 'TEST-BATCH-DEVICE',
    thingspeak_channel_id: '2713286',
    thingspeak_read_api_key: 'test_batch_key_12345',
    created_at: new Date(),
    test_marker: 'BATCH_METADATA'
  };

  try {
    console.log(`Setting up batch operations with ID: ${batchTestId}`);
    
    const deviceRef = db.collection('devices').doc(batchTestId);
    const metadataRef = db.collection('evaratds').doc(batchTestId);

    console.log('  1. Queueing registry write to devices/...');
    batch.set(deviceRef, registryData);

    console.log('  2. Queueing metadata write to evaratds/...');
    batch.set(metadataRef, metadataData);

    console.log('  3. Committing batch...');
    await batch.commit();
    console.log('✅ BATCH COMMIT SUCCEEDED\n');

    // Verify both were written
    console.log('Verifying writes...');
    
    const verifyRegistry = await db.collection('devices').doc(batchTestId).get();
    console.log(`  devices/${batchTestId}: ${verifyRegistry.exists ? '✅ EXISTS' : '❌ MISSING'}`);
    if (verifyRegistry.exists) {
      console.log('    Data:', verifyRegistry.data());
    }

    const verifyMetadata = await db.collection('evaratds').doc(batchTestId).get();
    console.log(`  evaratds/${batchTestId}: ${verifyMetadata.exists ? '✅ EXISTS' : '❌ MISSING'}`);
    if (verifyMetadata.exists) {
      console.log('    Data:', verifyMetadata.data());
    } else {
      console.error('\n⚠️  CRITICAL: Metadata not written even though batch.commit() succeeded!');
      console.error('    This suggests a silent failure in the batch operation.');
    }

  } catch (err) {
    console.error('❌ BATCH WRITE FAILED:', err.message);
    console.error('   Error code:', err.code);
    console.error('   Full error:', err);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TEST 3: Check if evaratds collection exists');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const snapshot = await db.collection('evaratds').limit(1).get();
    console.log(`✅ evaratds collection exists`);
    console.log(`   Documents in collection: ${snapshot.size}`);
    
    if (snapshot.size > 0) {
      const sample = snapshot.docs[0].data();
      console.log('   Sample document keys:', Object.keys(sample).slice(0, 5).join(', '));
    }
  } catch (err) {
    console.error(`❌ Error accessing evaratds: ${err.message}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TEST 4: Simulate actual device creation flow');
  console.log('═══════════════════════════════════════════════════════════\n');

  const simulatedId = `SIMULATED-${Date.now()}`;
  const hardwareId = `HW-${Date.now()}`;

  try {
    console.log(`Simulating device creation with:`);
    console.log(`  Firestore ID: ${simulatedId}`);
    console.log(`  Hardware ID: ${hardwareId}`);
    console.log(`  Device Type: evaratds`);
    console.log(`  Channel ID: 2713286\n`);

    const batch2 = db.batch();

    // Create registry entry
    const registryEntry = {
      device_id: hardwareId,
      device_type: 'evaratds',
      node_id: hardwareId,
      customer_id: 'test-customer',
      analytics_template: 'EvaraTDS',
      created_at: new Date()
    };

    // Create metadata entry
    const metadataEntry = {
      device_id: hardwareId,
      node_id: hardwareId,
      label: 'Test TDS Device',
      device_name: 'Test Device',
      thingspeak_read_api_key: 'test_key_abc123',
      thingspeak_channel_id: '2713286',
      customer_id: 'test-customer',
      created_at: new Date()
    };

    console.log('Setting batch operations...');
    batch2.set(db.collection('devices').doc(simulatedId), registryEntry);
    batch2.set(db.collection('evaratds').doc(simulatedId), metadataEntry);

    console.log('Committing batch...');
    await batch2.commit();
    console.log('✅ Batch commit succeeded\n');

    // Verify
    console.log('Verifying documents were written:\n');
    
    const devDoc = await db.collection('devices').doc(simulatedId).get();
    console.log(`devices/${simulatedId}:`);
    console.log(`  Exists: ${devDoc.exists ? '✅' : '❌'}`);
    if (devDoc.exists) {
      const d = devDoc.data();
      console.log(`  device_id: ${d.device_id}`);
      console.log(`  device_type: ${d.device_type}`);
    }

    const tdsDoc = await db.collection('evaratds').doc(simulatedId).get();
    console.log(`\nevaratds/${simulatedId}:`);
    console.log(`  Exists: ${tdsDoc.exists ? '✅' : '❌'}`);
    if (tdsDoc.exists) {
      const d = tdsDoc.data();
      console.log(`  device_id: ${d.device_id}`);
      console.log(`  thingspeak_channel_id: ${d.thingspeak_channel_id}`);
      console.log(`  thingspeak_read_api_key: ${d.thingspeak_read_api_key ? '✅ SET' : '❌ MISSING'}`);
    } else {
      console.error('\n❌ CRITICAL ISSUE FOUND:');
      console.error('   Metadata not written to evaratds collection!');
      console.error('   Possible causes:');
      console.error('   1. Firestore security rules blocking writes to evaratds');
      console.error('   2. Collection-level permissions issue');
      console.error('   3. Silent failure in batch operation');
    }

  } catch (err) {
    console.error('❌ Simulated flow failed:', err.message);
    console.error('   Error code:', err.code);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('DONE');
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(0);
}

// Run all tests
testBatchWrite().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
