#!/usr/bin/env node

const admin = require('firebase-admin');
require('dotenv').config({ path: '.env', override: true });
require('dotenv').config({ path: '.env.development', override: true });

// Initialize Firebase Admin using credentials from environment
if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
        projectId: process.env.FIREBASE_PROJECT_ID || 'evaratech-dev',
      });
    } else {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT_JSON env var not found');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Firebase initialization error:', err.message);
    process.exit(1);
  }
}

const db = admin.firestore();

(async () => {
  try {
    console.log('🔍 Querying latest customers...\n');
    
    // Query customers collection, ordered by created_at DESC, limit 5
    const snapshot = await db.collection('customers')
      .orderBy('created_at', 'desc')
      .limit(5)
      .get();
    
    if (snapshot.empty) {
      console.log('❌ No customers found');
      return;
    }
    
    console.log(`📋 Found ${snapshot.size} latest customers:\n`);
    
    let hasZoneFix = false;
    
    snapshot.forEach((doc, index) => {
      const data = doc.data();
      const hasZoneId = data.zone_id && data.zone_id !== '';
      console.log(`${'═'.repeat(65)}`);
      console.log(`[${index + 1}] ${data.display_name}`);
      console.log(`${'─'.repeat(65)}`);
      console.log(`  📧 Email: ${data.email}`);
      console.log(`  🔑 UID: ${data.uid}`);
      console.log(`  ⏰ Created: ${data.created_at}`);
      console.log(`  🌍 Zone ID: ${hasZoneId ? `✅ "${data.zone_id}"` : '❌ MISSING/EMPTY'}`);
      console.log('');
      
      if (data.display_name === 'Zone Fix Test') {
        hasZoneFix = true;
        console.log(`\n🎯 ZONE FIX TEST CUSTOMER FOUND!`);
        console.log(`   zone_id: "${data.zone_id}"`);
        console.log(`   zone_id is truthy?: ${Boolean(data.zone_id)}`);
      }
    });
    
    if (!hasZoneFix) {
      console.log(`\n⚠️  "Zone Fix Test" customer not found in top 5`);
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.message.includes('Cannot find module')) {
      console.log('ℹ️  Try running this from the backend directory: cd backend && node verify_zone_fix.js');
    }
  } finally {
    process.exit(0);
  }
})();
