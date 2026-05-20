#!/usr/bin/env node
require('dotenv').config();
const { db } = require('../src/config/firebase');
const deviceState = require('../src/services/deviceStateService');

async function refresh(deviceId) {
  if (!deviceId) {
    console.error('Usage: node refresh_device.js <DEVICE_ID>');
    process.exit(1);
  }

  try {
    // Load device registry doc
    const regDoc = await db.collection('devices').doc(deviceId).get();
    if (!regDoc.exists) {
      console.error(`Registry document devices/${deviceId} not found.`);
      process.exit(2);
    }

    const device = { id: deviceId, ...regDoc.data() };

    console.log(`Refreshing device state for ${deviceId} (ThingSpeak channel: ${device.thingspeak_channel_id || device.channel_id})`);

    const state = await deviceState.refreshDeviceState(device, { light: true });

    console.log('--- Computed state ---');
    console.log(JSON.stringify(state, null, 2));

    // Show registry fields after small delay to allow Firestore runTransaction to complete
    await new Promise(r => setTimeout(r, 1500));

    const freshReg = await db.collection('devices').doc(deviceId).get();
    console.log('\n--- Registry document after refresh ---');
    console.log(JSON.stringify(freshReg.data(), null, 2));

  } catch (err) {
    console.error('Error refreshing device:', err.message);
    process.exit(3);
  }
}

const deviceId = process.argv[2];
refresh(deviceId).then(() => process.exit(0));
