require('dotenv').config();
const { db } = require('../src/config/firebase');

async function findBakul() {
    console.log("Searching for 'Bakul'...");
    const allDevices = await db.collection('devices').get();
    for (const doc of allDevices.docs) {
        const data = doc.data();
        if (data.label?.includes("Bakul") || data.name?.includes("Bakul") || doc.id.includes("Bakul")) {
            console.log(`Found device: ${doc.id}`);
            console.log(JSON.stringify(data, null, 2));
        }
    }
}

findBakul().catch(console.error);
