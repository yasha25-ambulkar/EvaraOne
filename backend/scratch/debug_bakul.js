require('dotenv').config();
const { db } = require('../src/config/firebase');

async function debugDevice() {
    const id = "EV-TNK-003";
    const doc = await db.collection('devices').doc(id).get();
    if (!doc.exists) {
        console.log("Device not found!");
        return;
    }
    const data = doc.data();
    console.log(`Fields for ${id}:`);
    Object.keys(data).forEach(key => {
        console.log(`${key}: [${data[key]}] (type: ${typeof data[key]})`);
    });
}

debugDevice().catch(console.error);
