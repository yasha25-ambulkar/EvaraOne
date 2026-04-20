/**
 * MONITOR: Watch backend logs in real-time for device creation errors
 * 
 * Run this BEFORE attempting to create a device through the web UI
 * It will show you exactly what's happening during device creation
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

const readline = require('readline');

console.log('═══════════════════════════════════════════════════════════');
console.log('REAL-TIME LOG MONITOR');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('This script will show you backend logs as they happen.');
console.log('Open the web form and create a new TDS device.');
console.log('Watch the logs below to see where the issue occurs.\n');

// Capture all console.log and console.error calls
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

let logBuffer = [];
let showingLogs = false;

console.log = function(...args) {
  const msg = args.join(' ');
  logBuffer.push({ type: 'log', msg, time: new Date().toISOString() });
  
  // Show only backend-related logs
  if (msg.includes('[createNode') || msg.includes('[batch') || msg.includes('evaratds')) {
    originalLog.apply(console, args);
  }
};

console.error = function(...args) {
  const msg = args.join(' ');
  logBuffer.push({ type: 'error', msg, time: new Date().toISOString() });
  
  // Show all errors
  originalError.apply(console, args);
};

console.warn = function(...args) {
  const msg = args.join(' ');
  logBuffer.push({ type: 'warn', msg, time: new Date().toISOString() });
  
  // Show warnings related to device creation
  if (msg.includes('device') || msg.includes('batch') || msg.includes('evaratds')) {
    originalWarn.apply(console, args);
  }
};

// Monitor database for new documents in real-time
async function monitorDeviceCreation() {
  console.log('\n✅ Monitor started. Waiting for new devices...\n');

  // Get existing device count
  const initialDevices = await db.collection('devices').get();
  const initialTDS = await db.collection('evaratds').get();
  
  console.log(`Current state:`);
  console.log(`  devices collection: ${initialDevices.size} documents`);
  console.log(`  evaratds collection: ${initialTDS.size} documents\n`);

  // Watch for new documents in devices collection
  const devicesUnsubscribe = db.collection('devices').orderBy('created_at', 'desc').limit(1)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const data = change.doc.data();
          console.log('\n🚨 NEW DEVICE DETECTED in devices collection!');
          console.log(`   ID: ${change.doc.id}`);
          console.log(`   device_id: ${data.device_id}`);
          console.log(`   device_type: ${data.device_type}`);
          console.log(`   node_id: ${data.node_id}`);
          
          // Now check if metadata exists in evaratds
          checkMetadataExists(change.doc.id, data.device_id, data.device_type);
        }
      });
    }, err => {
      console.error('Error watching devices:', err.message);
    });

  // Keep process alive
  setTimeout(() => {
    console.log('\n⏱️  Monitor timeout (5 minutes). Exiting.');
    devicesUnsubscribe();
    process.exit(0);
  }, 5 * 60 * 1000);
}

async function checkMetadataExists(firestoreId, deviceId, deviceType) {
  console.log(`\n🔍 Checking for metadata in ${deviceType} collection...`);
  
  try {
    // Check using Firestore ID
    const doc1 = await db.collection(deviceType).doc(firestoreId).get();
    if (doc1.exists) {
      console.log(`✅ FOUND metadata using Firestore ID: ${firestoreId}`);
      const meta = doc1.data();
      console.log(`   device_id: ${meta.device_id}`);
      console.log(`   thingspeak_channel_id: ${meta.thingspeak_channel_id}`);
      console.log(`   thingspeak_read_api_key: ${meta.thingspeak_read_api_key ? '✅ SET' : '❌ MISSING'}`);
      return;
    }

    // Check using device_id
    const q1 = await db.collection(deviceType).where('device_id', '==', deviceId).limit(1).get();
    if (!q1.empty) {
      console.log(`✅ FOUND metadata using device_id search: ${deviceId}`);
      const doc = q1.docs[0];
      console.log(`   Firestore ID: ${doc.id}`);
      const meta = doc.data();
      console.log(`   thingspeak_channel_id: ${meta.thingspeak_channel_id}`);
      return;
    }

    // Not found
    console.log(`❌ METADATA NOT FOUND in ${deviceType} collection!`);
    console.log(`   Searched by: Firestore ID and device_id`);
    console.log(`   Device type: ${deviceType}`);
    console.log(`   Hardware ID: ${deviceId}`);
    console.log(`\n⚠️  THIS IS THE PROBLEM! The metadata is not being stored.`);
    console.log(`   The device appears in devices/ but metadata is missing from /${deviceType}\n`);

  } catch (err) {
    console.error(`Error checking metadata: ${err.message}`);
  }
}

// Start monitoring
monitorDeviceCreation().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
