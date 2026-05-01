/**
 * addDevice.js
 * Manually adds EV-TNK-001 (EvaraTank) to the devices collection
 * as a fully self-contained single document (registry + metadata merged).
 *
 * Usage:  node addDevice.js
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

const DEVICE_ID = 'EV-TNK-001';

async function addDevice() {
    console.log(`\n🚀 addDevice.js — Adding "${DEVICE_ID}" to Firestore...\n`);

    // Check if it already exists
    const existing = await db.collection('devices').doc(DEVICE_ID).get();
    if (existing.exists) {
        console.log(`⚠️  Document "${DEVICE_ID}" already exists. Current data:\n`);
        console.log(JSON.stringify(existing.data(), null, 2));
        console.log('\n✅ No write needed — document already present.');
        process.exit(0);
    }

    const now = new Date();

    const deviceData = {
        // ── Identity ─────────────────────────────────────────────
        device_id:              DEVICE_ID,
        node_id:                DEVICE_ID,
        device_type:            'evaratank',
        analytics_template:     'EvaraTank',

        // ── Display ──────────────────────────────────────────────
        label:                  'EvaraTank Test Node',
        device_name:            'EvaraTank Test Node',

        // ── Ownership ────────────────────────────────────────────
        customer_id:            '',          // set to real customer ID if needed
        zone_id:                '',
        isVisibleToCustomer:    true,

        // ── ThingSpeak credentials ────────────────────────────────
        // Fill in real values if you have a ThingSpeak channel for this device.
        // Leaving empty will cause analytics to return 400 "Telemetry config missing".
        thingspeak_channel_id:  '',
        thingspeak_read_api_key: '',

        // ── Tank configuration ────────────────────────────────────
        tank_size:              1000,        // litres
        total_capacity:         1000,
        configuration: {
            depth:        1.2,             // metres
            tank_length:  0,
            tank_breadth: 0
        },

        // ── Field mapping ─────────────────────────────────────────
        fields: { water_level: 'field1' },
        sensor_field_mapping: { field1: 'water_level_raw_sensor_reading' },

        // ── Location ─────────────────────────────────────────────
        latitude:   null,
        longitude:  null,

        // ── Status / telemetry defaults ───────────────────────────
        status:             'OFFLINE',
        last_seen:          null,
        last_updated_at:    null,
        last_value:         null,
        level_percentage:   null,

        // ── Customer config ───────────────────────────────────────
        customer_config: {
            showAlerts:       true,
            showConsumption:  true,
            showDeviceHealth: true,
            showEstimations:  true,
            showFillRate:     true,
            showMap:          true,
            showTankLevel:    true,
            showVolume:       true
        },

        // ── Timestamps ────────────────────────────────────────────
        created_at:  now,
        updated_at:  now
    };

    await db.collection('devices').doc(DEVICE_ID).set(deviceData);
    console.log(`✅ Document written: devices/${DEVICE_ID}\n`);

    // Verify it was actually saved
    const verify = await db.collection('devices').doc(DEVICE_ID).get();
    if (verify.exists) {
        console.log('✅ VERIFIED — Document confirmed in Firestore:\n');
        console.log(JSON.stringify(verify.data(), null, 2));
    } else {
        console.error('❌ CRITICAL: Document NOT found after write! Check Firestore rules / credentials.');
    }

    process.exit(0);
}

addDevice().catch(err => {
    console.error('❌ addDevice.js FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
});
