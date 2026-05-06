require('dotenv').config();
const { db } = require('../src/config/firebase');

async function testQuery() {
    console.log("Testing telemetryWorker query...");
    const snapshot = await db.collection("devices")
      .where("status", "not-in", ["DECOMMISSIONED", "ARCHIVED"])
      .get();
    
    console.log(`Found ${snapshot.docs.length} devices.`);
    snapshot.docs.forEach(doc => {
        console.log(`- ${doc.id} (status: ${doc.data().status})`);
    });
}

testQuery().catch(console.error);
