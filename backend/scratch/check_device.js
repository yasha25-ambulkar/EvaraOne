
require('dotenv').config();
const { db } = require("../src/config/firebase.js");

async function checkDevice() {
    try {
        const id = "EV-TDS-001";
        console.log(`Checking device ${id} in 'evaratds' collection...`);
        const doc = await db.collection("evaratds").doc(id).get();
        
        if (!doc.exists) {
            console.log(`Device ${id} NOT FOUND in 'evaratds'.`);
        } else {
            console.log(`Device ${id} data:`, JSON.stringify(doc.data(), null, 2));
        }

        console.log(`\nChecking device ${id} in 'devices' (registry) collection...`);
        const registryDoc = await db.collection("devices").doc(id).get();
        if (!registryDoc.exists) {
            console.log(`Device ${id} NOT FOUND in 'devices' registry.`);
        } else {
            console.log(`Device registry data:`, JSON.stringify(registryDoc.data(), null, 2));
        }
    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

checkDevice();
