
require('dotenv').config();
const { db } = require("../src/config/firebase.js");
const { getTDSHistory } = require("../src/services/tdsStateService.js");
const { getNodeDetails } = require("../src/services/deviceLookupService.js");

async function testHistory() {
    try {
        console.log("Fetching 'devices' collection for TDS devices...");
        const snapshot = await db.collection("devices").where("device_type", "==", "evaratds").get();
        
        if (snapshot.empty) {
            console.log("No TDS devices found in registry.");
            return;
        }

        for (const registryDoc of snapshot.docs) {
            const deviceId = registryDoc.id;
            console.log(`\nFetching details for ${deviceId}...`);
            const device = await getNodeDetails(deviceId);
            
            if (!device) {
                console.log(`Failed to get details for ${deviceId}`);
                continue;
            }

            console.log(`--- Testing History for ${device.id} ---`);
            console.log(`Label: ${device.label}`);
            console.log(`Channel: ${device.thingspeak_channel_id}`);
            console.log(`API Key: ${device.thingspeak_read_api_key}`);
            
            const history = await getTDSHistory(device, 5);
            console.log(`History points: ${history.length}`);
            if (history.length > 0) {
                console.log(`First point:`, JSON.stringify(history[0], null, 2));
            }
        }
    } catch (error) {
        console.error("Test failed:", error);
    } finally {
        process.exit(0);
    }
}

testHistory();
