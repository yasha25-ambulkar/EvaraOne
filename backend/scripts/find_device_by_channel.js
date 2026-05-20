#!/usr/bin/env node
require('dotenv').config();
const { db } = require('../src/config/firebase');

async function find(channelId) {
  if (!channelId) {
    console.error('Usage: node find_device_by_channel.js <THINGSPEAK_CHANNEL_ID>');
    process.exit(1);
  }

  try {
    console.log(`Searching for devices with thingspeak_channel_id == ${channelId} ...`);

    // Search registry
    const q1 = await db.collection('devices').where('thingspeak_channel_id', '==', channelId).get();
    const q2 = await db.collection('devices').where('channel_id', '==', channelId).get();

    const results = new Map();

    for (const doc of q1.docs) results.set(doc.id, doc.data());
    for (const doc of q2.docs) results.set(doc.id, doc.data());

    if (results.size === 0) {
      console.warn('No device found in `devices` registry with that channel id.');
      console.warn('Check if ThingSpeak channel is stored in a nested `configuration` or `customer_config` field.');
      console.warn('You can list sample device docs with: node scripts/list_devices.js');
      process.exit(0);
    }

    for (const [id, data] of results.entries()) {
      console.log('\n--- Device registry: devices/' + id + ' ---');
      console.log(JSON.stringify(data, null, 2));

      // Try to read typed metadata collection (device_type)
      const type = (data.device_type || data.deviceType || '').toString().toLowerCase();
      if (type) {
        try {
          const metaRef = db.collection(type).doc(id);
          const metaDoc = await metaRef.get();
          if (metaDoc.exists) {
            console.log(`\n--- Typed metadata: ${type}/${id} ---`);
            console.log(JSON.stringify(metaDoc.data(), null, 2));
          } else {
            console.log(`\nNo typed metadata found in collection '${type}' for id ${id}`);
          }
        } catch (err) {
          console.warn('Error reading typed metadata:', err.message);
        }
      } else {
        console.log('Device has no device_type; cannot lookup typed metadata.');
      }
    }

  } catch (err) {
    console.error('Error querying Firestore:', err.message);
    process.exit(2);
  }
}

const channelId = process.argv[2];
find(channelId).then(() => process.exit(0));
