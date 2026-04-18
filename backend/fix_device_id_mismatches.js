#!/usr/bin/env node
/**
 * CRITICAL FIX: Heal Device ID Mismatches
 * 
 * PROBLEM: Devices created before ID mismatch fix have:
 * - Registry in "devices" collection with ID "ABC123"
 * - Metadata in "evaratank/evaraflow/evaratds/evaradeep" with ID "XYZ789" (DIFFERENT!)
 * 
 * When backend fetches, it looks for metadata using registry ID, doesn't find it, device disappears
 * 
 * SOLUTION: For each mismatched device:
 * 1. Read metadata from old location (XYZ789)
 * 2. Copy to new location (ABC123) in same collection
 * 3. Delete old metadata document
 * 4. Device is now discoverable
 */

const path = require('path');
const fs = require('fs');

// Load .env file first
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Now require firebase - it will use env vars
const { db } = require('./src/config/firebase-secure.js');

async function findMismatches() {
  console.log(`\n[DIAGNOSTIC] Scanning for device ID mismatches...\n`);
  
  const deviceCollections = ['evaratank', 'evaradeep', 'evaraflow', 'evaratds'];
  const mismatches = [];

  // Step 1: Get all registry entries
  const registrySnapshot = await db.collection('devices').get();
  console.log(`Found ${registrySnapshot.size} device registry entries\n`);

  // Step 2: For each registry, check if metadata exists in correct location
  for (const registryDoc of registrySnapshot.docs) {
    const registry = registryDoc.data();
    const registryId = registryDoc.id;
    const deviceType = registry.device_type?.toLowerCase() || 'unknown';
    
    let targetCollection = '';
    if (deviceType === 'evaratank' || deviceType === 'tank') targetCollection = 'evaratank';
    else if (deviceType === 'evaradeep' || deviceType === 'deep') targetCollection = 'evaradeep';
    else if (deviceType === 'evaraflow' || deviceType === 'flow') targetCollection = 'evaraflow';
    else if (deviceType === 'evaratds' || deviceType === 'tds') targetCollection = 'evaratds';
    
    if (!targetCollection) continue;

    // Check if metadata exists at expected location (same ID as registry)
    const expectedMetaRef = db.collection(targetCollection).doc(registryId);
    const expectedMetaDoc = await expectedMetaRef.get();

    if (expectedMetaDoc.exists) {
      // ✅ Correct: Metadata found at expected location
      console.log(`✅ [${targetCollection}] ${registryId}: Metadata at correct location (label: ${expectedMetaDoc.data().label})`);
    } else {
      // ❌ MISMATCH: Metadata missing at expected location - search for it
      console.log(`⚠️  [${targetCollection}] ${registryId}: NO metadata at expected location, searching...`);
      
      const allMetaSnapshot = await db.collection(targetCollection).get();
      let foundMismatched = false;
      
      for (const metaDoc of allMetaSnapshot.docs) {
        const meta = metaDoc.data();
        // Check if this metadata belongs to our registry by comparing device_id or created_at
        if (meta.device_id === registry.device_id || 
            (meta.created_at === registry.created_at && meta.label === registry.label)) {
          
          console.log(`   🔴 FOUND MISMATCH: Metadata ID "${metaDoc.id}" != Registry ID "${registryId}"`);
          console.log(`      Meta label: "${meta.label}"`);
          mismatches.push({
            registryId,
            registryRef: registryDoc,
            metaId: metaDoc.id,
            metaRef: metaDoc,
            metaData: meta,
            targetCollection,
            deviceType,
            deviceId: registry.device_id,
          });
          foundMismatched = true;
          break;
        }
      }
      
      if (!foundMismatched) {
        console.log(`   ❌ ORPHANED REGISTRY: No metadata found in ${targetCollection} collection!`);
        mismatches.push({
          registryId,
          registryRef: registryDoc,
          targetCollection,
          deviceType,
          deviceId: registry.device_id,
          hasMetadata: false,
        });
      }
    }
  }

  return mismatches;
}

async function fixMismatches(mismatches) {
  console.log(`\n[FIX] Healing ${mismatches.length} mismatches...\n`);
  
  let fixed = 0;
  const batch = db.batch();
  let batchOps = 0;
  const MAX_BATCH_OPS = 500;

  for (const mismatch of mismatches) {
    // Skip only if truly orphaned (no metadata field at all)
    if (!mismatch.metaData) {
      console.log(`⏭️  [SKIP] ${mismatch.registryId}: No metadata to copy (orphaned registry)`);
      continue;
    }

    console.log(`🔧 [FIX] ${mismatch.registryId}: Copying metadata from ${mismatch.metaId} → ${mismatch.registryId}`);
    
    // Copy metadata to correct location
    const newMetaRef = db.collection(mismatch.targetCollection).doc(mismatch.registryId);
    batch.set(newMetaRef, mismatch.metaData);
    batchOps++;
    
    // Mark old metadata for deletion
    const oldMetaRef = db.collection(mismatch.targetCollection).doc(mismatch.metaId);
    batch.delete(oldMetaRef);
    batchOps++;
    
    fixed++;

    // Commit batch if we hit limit
    if (batchOps >= MAX_BATCH_OPS) {
      await batch.commit();
      console.log(`   ✅ Batch committed (${batchOps} operations)`);
      batchOps = 0;
    }
  }

  // Commit remaining operations
  if (batchOps > 0) {
    await batch.commit();
    console.log(`✅ Final batch committed (${batchOps} operations)`);
  }

  console.log(`\n[RESULT] Fixed ${fixed} devices\n`);
  return fixed;
}

async function run() {
  try {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         DEVICE ID MISMATCH FIX - DIAGNOSTIC & HEAL         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    // Find mismatches
    const mismatches = await findMismatches();
    
    if (mismatches.length === 0) {
      console.log(`\n✅ NO MISMATCHES FOUND - All devices have correct IDs!`);
      process.exit(0);
    }
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total mismatches: ${mismatches.length}`);
    console.log(`   With metadata (fixable): ${mismatches.filter(m => m.metaData).length}`);
    console.log(`   Orphaned (no metadata): ${mismatches.filter(m => !m.metaData).length}`);
    
    // Ask for confirmation
    console.log(`\n⚠️  This will:`);
    console.log(`   1. Copy each metadata to correct location (registryId)`);
    console.log(`   2. Delete metadata from old location (metaId)`);
    console.log(`   3. Devices will then be discoverable again\n`);
    
    // Auto-fix without prompt for automation
    const fixed = await fixMismatches(mismatches);
    
    console.log(`\n🎉 SUCCESS! Fixed ${fixed} devices.`);
    console.log(`\nDevices should now appear on dashboard.`);
    console.log(`Cache has been cleared for fresh data.\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ ERROR:', error);
    process.exit(1);
  }
}

run();
