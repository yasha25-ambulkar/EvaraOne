#!/usr/bin/env node

const admin = require('firebase-admin');
const fs = require('fs');
require('dotenv').config({ override: true });

// Initialize Firebase Admin
const serviceAccountPath = process.env.FIREBASE_KEY_PATH;
if (!serviceAccountPath || !fs.existsSync(serviceAccountPath)) {
  console.error('❌ FIREBASE_KEY_PATH not found or file missing');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

const db = admin.firestore();

(async () => {
  try {
    console.log('🔍 Querying latest customers...\n');
    
    // Query customers collection, ordered by created_at DESC, limit 3
    const snapshot = await db.collection('customers')
      .orderBy('created_at', 'desc')
      .limit(3)
      .get();
    
    if (snapshot.empty) {
      console.log('❌ No customers found');
      return;
    }
    
    console.log(`📋 Found ${snapshot.size} latest customers:\n`);
    
    snapshot.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${'═'.repeat(60)}`);
      console.log(`[${index + 1}] Customer: ${data.display_name}`);
      console.log(`${'─'.repeat(60)}`);
      console.log(`  📧 Email: ${data.email}`);
      console.log(`  👤 Full Name: ${data.full_name || '(empty)'}`);
      console.log(`  📞 Phone: ${data.phone_number || '(empty)'}`);
      console.log(`  🔑 UID: ${data.uid}`);
      console.log(`  🔐 Role: ${data.role}`);
      console.log(`  ⏰ Created: ${data.created_at}`);
      console.log(`  🌍 Zone ID: ${data.zone_id ? `✅ "${data.zone_id}"` : '❌ MISSING/EMPTY'}`);
      console.log(`  📍 Region Filter: ${data.regionFilter || '(empty)'}`);
      console.log('');
    });
    
    // Check specifically for "Zone Fix Test"
    console.log(`${'═'.repeat(60)}`);
    console.log('🎯 Checking for "Zone Fix Test" customer...\n');
    const zoneFixSnapshot = await db.collection('customers')
      .where('display_name', '==', 'Zone Fix Test')
      .get();
    
    if (zoneFixSnapshot.empty) {
      console.log('ℹ️ "Zone Fix Test" customer not found yet');
    } else {
      const doc = zoneFixSnapshot.docs[0];
      const data = doc.data();
      console.log(`✅ FOUND "Zone Fix Test" customer!`);
      console.log(`   zone_id: ${data.zone_id || '❌ EMPTY/MISSING'}`);
      console.log(`   zone_id value: "${data.zone_id}"`);
      console.log(`   zone_id is empty string?: ${data.zone_id === ''}`);
      console.log(`   zone_id is truthy?: ${Boolean(data.zone_id)}`);
    }
    
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    process.exit(0);
  }
})();
