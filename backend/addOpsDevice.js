/**
 * addOpsDevice.js
 * Manually adds EV-OPS-001 (EvaraOps) to the devices collection.
 */

require('dotenv').config();
const { db } = require('./src/config/firebase.js');

const DEVICE_ID = 'EV-OPS-001';
const CUSTOMER_ID = 'lTy0FwjuUdhZbXcjUsxwimeMHQ42'; // Ritik

async function addDevice() {
    console.log(`\n🚀 addOpsDevice.js — Adding "${DEVICE_ID}" to Firestore...\n`);

    const now = new Date();

    const deviceData = {
        // ── Identity ─────────────────────────────────────────────
        device_id:              DEVICE_ID,
        node_id:                DEVICE_ID,
        device_type:            'evaraops',
        category:               'EvaraOps',
        analytics_template:     'EvaraOps',

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

    // Also add to evaraops collection just in case
    await db.collection('evaraops').doc(DEVICE_ID).set({
        hardwareId: DEVICE_ID,
        analytics_template: 'EvaraOps',
        label: 'VINDYA PUMP HOUSE'
    });

    console.log(`✅ Document written: evaraops/${DEVICE_ID}\n`);

    process.exit(0);
}

addDevice().catch(err => {
    console.error('❌ addOpsDevice.js FAILED:', err.message);
    process.exit(1);
});
