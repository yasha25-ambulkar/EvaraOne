
require('dotenv').config();
const { db } = require("../src/config/firebase.js");

async function checkDB() {
    try {
        console.log("Checking 'evaratds' collection...");
        const snapshot = await db.collection("evaratds").get();
        if (snapshot.empty) {
            console.log("No TDS devices found in 'evaratds' collection.");
        } else {
            snapshot.forEach(doc => {
                console.log(`Device ID: ${doc.id}`);
                console.log(`Data:`, JSON.stringify(doc.data(), null, 2));
            });
        }

        console.log("\nChecking 'devices' collection...");
        const devicesSnap = await db.collection("devices").get();
        if (devicesSnap.empty) {
            console.log("No devices found in 'devices' collection.");
        } else {
            devicesSnap.forEach(doc => {
                console.log(`Device Registry ID: ${doc.id}`);
                console.log(`Data:`, JSON.stringify(doc.data(), null, 2));
            });
        }
    } catch (error) {
        console.error("Error checking DB:", error);
    } finally {
        process.exit(0);
    }
}

checkDB();
