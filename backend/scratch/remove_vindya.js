require('dotenv').config();
const { db } = require('../src/config/firebase');

async function findAndRemove() {
    const targetLabel = "VINDYA PUMP HOUSE";
    console.log(`Searching for device with label: ${targetLabel}`);
    
    const snapshot = await db.collection('devices').where('label', '==', targetLabel).get();
    
    if (snapshot.empty) {
        // Try checking in nested configuration or other collections
        const allDevices = await db.collection('devices').get();
        let found = false;
        for (const doc of allDevices.docs) {
            const data = doc.data();
            if (data.label === targetLabel || (data.configuration && data.configuration.label === targetLabel)) {
                console.log(`Found device: ${doc.id}`);
                await removeDevice(doc.id, data.device_type);
                found = true;
                break;
            }
        }
        if (!found) console.log("Device not found by label.");
    } else {
        for (const doc of snapshot.docs) {
            console.log(`Found device: ${doc.id}`);
            await removeDevice(doc.id, doc.data().device_type);
        }
    }
}

async function removeDevice(id, type) {
    console.log(`Removing device ${id} from 'devices' collection...`);
    await db.collection('devices').doc(id).delete();
    
    if (type) {
        const typeColl = type.toLowerCase();
        console.log(`Checking metadata collection '${typeColl}' for ID ${id}...`);
        const metaDoc = await db.collection(typeColl).doc(id).get();
        if (metaDoc.exists) {
            console.log(`Removing metadata from '${typeColl}'...`);
            await db.collection(typeColl).doc(id).delete();
        }
    }
    console.log(`Successfully removed ${id}.`);
}

findAndRemove().catch(console.error);
