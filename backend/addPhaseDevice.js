/**
 * addPhaseDevice.js
 * Manually adds EV-PHS-001 (EvaraPhase) to the devices collection.
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

const DEVICE_ID = 'EV-PHS-001';
const CUSTOMER_ID = 'lTy0FwjuUdhZbXcjUsxwimeMHQ42'; // Ritik

async function addDevice() {
    console.log(`\n🚀 addPhaseDevice.js — Adding "${DEVICE_ID}" to Firestore...\n`);

    const now = new Date();

    const deviceData = {
        // ── Identity ─────────────────────────────────────────────
        device_id:              DEVICE_ID,
        node_id:                DEVICE_ID,
        device_type:            'evaraphase',
        category:               'EvaraPhase',
        analytics_template:     'EvaraPhase',

        // ── Display ──────────────────────────────────────────────
        label:                  'VINDYA PUMP HOUSE',
        device_name:            'VINDYA PUMP HOUSE',
        location_name:          'PUMP HOUSE A',


        // ── Ownership ────────────────────────────────────────────
        customer_id:            CUSTOMER_ID,
        isVisibleToCustomer:    true,

        // ── Status / telemetry defaults ───────────────────────────
        status:             'Online',
        last_seen:          now,
        last_updated_at:    now,

        // ── Timestamps ────────────────────────────────────────────
        created_at:  now,
        updated_at:  now
    };

    await db.collection('devices').doc(DEVICE_ID).set(deviceData);
    console.log(`✅ Document written: devices/${DEVICE_ID}\n`);

    // Also add to evaraphase collection just in case
    await db.collection('evaraphase').doc(DEVICE_ID).set({
        hardwareId: DEVICE_ID,
        analytics_template: 'EvaraPhase',
        label: 'VINDYA PUMP HOUSE'
    });

    console.log(`✅ Document written: evaraphase/${DEVICE_ID}\n`);

    process.exit(0);
}

addDevice().catch(err => {
    console.error('❌ addPhaseDevice.js FAILED:', err.message);
    process.exit(1);
});
