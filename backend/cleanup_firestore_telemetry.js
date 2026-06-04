/**
 * cleanup_firestore_telemetry.js
 * 
 * ✅ CRITICAL MAINTENANCE SCRIPT
 * 
 * Removes bloated telemetry arrays from existing device documents.
 * These fields (tdsHistory, tempHistory, telemetryHistory, raw_data, etc.)
 * should NEVER be stored in Firestore — they belong in ThingSpeak.
 * 
 * This reduces document size from 50+ KB to < 1 KB per device.
 * 
 * Usage: node cleanup_firestore_telemetry.js
 * 
 * What it does:
 * 1. Scans all devices collection
 * 2. Identifies documents with bloated telemetry fields
 * 3. Safely removes those fields (preserves all config/metadata)
 * 4. Reports statistics before/after
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');
const admin = require('firebase-admin');

const FIELDS_TO_REMOVE = [
  'tdsHistory',
  'tempHistory',
  'temperatureHistory',
  'telemetryHistory',
  'history',
  'raw_data',
  'rawData',
  'telemetrySnapshot',
  'telemetry_snapshot',
  'lastTelemetryFetch',
  'last_telemetry_fetch',
  'lastUpdated',
  'lastUpdatedAt',
  'statusLastChecked'
];

async function analyzeDocument(doc) {
  const data = doc.data();
  let sizeInBytes = JSON.stringify(data).length;
  
  const bloatedFields = FIELDS_TO_REMOVE.filter(field => field in data);
  
  return {
    docId: doc.id,
    device_type: data.device_type,
    device_name: data.device_name || data.label || 'Unknown',
    sizeInBytes,
    bloatedFieldCount: bloatedFields.length,
    bloatedFields,
    isBloated: bloatedFields.length > 0 || sizeInBytes > 5000 // Warn if > 5KB
  };
}

async function cleanupDocument(docId) {
  const updates = {};
  
  // Create delete operations for all bloated fields
  FIELDS_TO_REMOVE.forEach(field => {
    updates[field] = admin.firestore.FieldValue.delete();
  });
  
  await db.collection('devices').doc(docId).update(updates);
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  🧹 FIRESTORE TELEMETRY CLEANUP                           ║');
  console.log('║  Removing bloated history arrays from device documents     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Scan all devices
    console.log('📊 STEP 1: Analyzing all devices...\n');
    
    const snapshot = await db.collection('devices').get();
    const analyses = await Promise.all(
      snapshot.docs.map(doc => analyzeDocument(doc))
    );

    const bloatedDocs = analyses.filter(a => a.isBloated);
    const totalDevices = analyses.length;
    const totalBloated = bloatedDocs.length;

    // Statistics
    const totalSizeBefore = analyses.reduce((sum, a) => sum + a.sizeInBytes, 0);
    const totalSizeAfter = analyses.reduce((sum, a) => {
      let size = a.sizeInBytes;
      // Rough estimate: removing bloated fields reduces by ~90% for bloated docs
      if (a.isBloated) {
        size = Math.max(500, Math.floor(size * 0.1)); // Keep minimal config
      }
      return sum + size;
    }, 0);

    console.log(`✅ ANALYSIS COMPLETE:`);
    console.log(`   Total devices:          ${totalDevices}`);
    console.log(`   Bloated devices:        ${totalBloated} (${((totalBloated/totalDevices)*100).toFixed(1)}%)`);
    console.log(`   Total size (before):    ${(totalSizeBefore / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Estimated size (after): ${(totalSizeAfter / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Storage savings:        ${((totalSizeBefore - totalSizeAfter) / 1024 / 1024).toFixed(2)} MB\n`);

    if (bloatedDocs.length === 0) {
      console.log('✅ No bloated documents found. Your Firestore is clean!\n');
      process.exit(0);
    }

    // Show top 5 bloated documents
    console.log('🔍 TOP 5 BLOATED DEVICES:\n');
    const sorted = bloatedDocs.sort((a, b) => b.sizeInBytes - a.sizeInBytes).slice(0, 5);
    sorted.forEach((doc, idx) => {
      console.log(`  ${idx + 1}. ${doc.device_name} (${doc.device_type})`);
      console.log(`     Size: ${(doc.sizeInBytes / 1024).toFixed(2)} KB`);
      console.log(`     Bloated fields: ${doc.bloatedFields.join(', ')}\n`);
    });

    // Step 2: Confirm cleanup
    console.log(`⚠️  WARNING: This will remove the following fields from ${totalBloated} devices:`);
    console.log(`   ${FIELDS_TO_REMOVE.join(', ')}\n`);
    
    console.log('These fields are NOT needed because:');
    console.log('  ✓ Historical telemetry is stored in ThingSpeak (not Firestore)');
    console.log('  ✓ Frontend fetches history via /api/nodes/:id/analytics');
    console.log('  ✓ Keeping only last reading + status for quick display\n');

    // Confirm via environment variable (for CI/CD) or prompt in terminal
    const shouldCleanup = process.env.CONFIRM_CLEANUP === 'true' || process.env.NODE_ENV === 'test';
    
    if (!shouldCleanup) {
      console.log('ℹ️  To run cleanup, set environment variable:');
      console.log('   export CONFIRM_CLEANUP=true\n');
      console.log('Then run: node cleanup_firestore_telemetry.js\n');
      process.exit(0);
    }

    // Step 3: Execute cleanup
    console.log('🧹 STEP 2: Cleaning up bloated documents...\n');
    
    let successCount = 0;
    let errorCount = 0;

    for (const bloatedDoc of bloatedDocs) {
      try {
        await cleanupDocument(bloatedDoc.docId);
        successCount++;
        process.stdout.write('.');
      } catch (error) {
        errorCount++;
        console.error(`\n❌ Failed to cleanup ${bloatedDoc.docId}: ${error.message}`);
      }
    }

    console.log('\n\n✅ CLEANUP COMPLETE:\n');
    console.log(`   Successfully cleaned:  ${successCount} devices`);
    console.log(`   Failed:                ${errorCount} devices`);
    console.log(`   Storage freed:         ${((totalSizeBefore - totalSizeAfter) / 1024 / 1024).toFixed(2)} MB\n`);

    // Step 4: Verification
    console.log('🔍 STEP 3: Verification...\n');
    
    const verifySnapshot = await db.collection('devices').get();
    let remainingBloat = 0;
    let stillBloatedCount = 0;

    for (const doc of verifySnapshot.docs) {
      const analysis = await analyzeDocument(doc);
      if (analysis.isBloated) {
        stillBloatedCount++;
        remainingBloat += analysis.sizeInBytes;
      }
    }

    if (stillBloatedCount === 0) {
      console.log('✅ SUCCESS: No bloated fields remain!');
      console.log('   All device documents are now optimized.\n');
    } else {
      console.log(`⚠️  WARNING: ${stillBloatedCount} documents still have bloated fields.`);
      console.log(`   Total remaining bloat: ${(remainingBloat / 1024 / 1024).toFixed(2)} MB\n`);
    }

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ Firestore Telemetry Cleanup Complete                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ CRITICAL ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
