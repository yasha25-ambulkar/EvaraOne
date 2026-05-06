require('dotenv').config();
const { db } = require('../src/config/firebase');

async function fixBakul() {
    const id = "EV-TNK-003";
    console.log(`Fixing Bakul Tank (${id})...`);
    
    // 1. Update main registry
    await db.collection('devices').doc(id).update({
        status: "ACTIVE",
        "sensor_field_mapping.water_level": "field2",
        "fields.water_level": "field2"
    });
    console.log("Updated 'devices' collection.");

    // 2. Update metadata collection
    await db.collection('evaratank').doc(id).update({
        status: "ACTIVE",
        "sensor_field_mapping.water_level": "field2"
    });
    console.log("Updated 'evaratank' collection.");

    console.log("Bakul fix complete!");
}

fixBakul().catch(console.error);
