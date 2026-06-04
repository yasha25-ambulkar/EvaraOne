
const path = require('path');
require('dotenv').config({ path: 'd:/03-04-2026/MAIN/backend/.env' });
const { db } = require(path.resolve('d:/03-04-2026/MAIN/backend/src/config/firebase.js'));
const { processThingSpeakData, updateFirestoreTelemetry } = require(path.resolve('d:/03-04-2026/MAIN/backend/src/services/deviceStateService.js'));
const { fetchChannelFeeds } = require(path.resolve('d:/03-04-2026/MAIN/backend/src/services/thingspeakService.js'));

async function pulse() {
    const id = 'fxUPNmxyEPS8gaSeIoHE';
    console.log("--- Pulsing HIMALAYA (Manual) ---");
    
    // 1. Get current device and metadata (like telemetry worker does)
    const deviceDoc = await db.collection("devices").doc(id).get();
    const metaDoc = await db.collection("evaraflow").doc(id).get();
    
    if (!deviceDoc.exists || !metaDoc.exists) {
        console.log("❌ Device/Metadata not found");
        return;
    }
    
    const deviceData = {
        ...deviceDoc.data(),
        ...metaDoc.data(),
        id,
        type: deviceDoc.data().device_type,
        mapping: metaDoc.data().sensor_field_mapping || {}
    };
    
    console.log("Device Type:", deviceData.type);
    console.log("Mapping:", JSON.stringify(deviceData.mapping, null, 2));
    
    // 2. Fetch from ThingSpeak
    const feeds = await fetchChannelFeeds(deviceData.thingspeak_channel_id, deviceData.thingspeak_read_api_key, 1);
    if (!feeds || feeds.length === 0) {
        console.log("❌ No feeds from ThingSpeak");
        return;
    }
    
    console.log("Latest Feed:", JSON.stringify(feeds[0], null, 2));
    
    // 3. Process
    const processed = await processThingSpeakData(deviceData, feeds);
    console.log("Processed Data:", JSON.stringify(processed, null, 2));
    
    if (processed.flow_rate === 0 && processed.total_liters === 0) {
        console.log("❌ STILL GETTING ZEROS!");
    } else {
        console.log("✅ DATA MAPPED CORRECTLY!");
        // 4. Update Firestore
        await updateFirestoreTelemetry("evaraflow", id, processed, feeds);
        console.log("✅ FIRESTORE UPDATED!");
    }
}

pulse();
