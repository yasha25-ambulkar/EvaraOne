
const path = require('path');
require('dotenv').config({ path: 'd:/03-04-2026/MAIN/backend/.env' });
const firebasePath = path.resolve('d:/03-04-2026/MAIN/backend/src/config/firebase.js');
const { db } = require(firebasePath);

async function diagnose() {
  console.log("--- Diagnosing HIMALAYA Node ---");
  
  try {
    // 1. Find all nodes to find the one named HIMALAYA
    const devicesSnap = await db.collection("devices").get();
    let himalayaNode = null;
    
    for (const doc of devicesSnap.docs) {
        const data = doc.data();
        // Check various name fields
        if (data.device_id === "HIMALAYA" || data.node_id === "HIMALAYA" || data.name === "HIMALAYA" || data.displayName === "HIMALAYA") {
            himalayaNode = { id: doc.id, ...data };
            break;
        }
    }

    if (!himalayaNode) {
        console.log("❌ Node HIMALAYA not found in registry by name/id.");
        // List first 10 for context
        console.log("Context - first 10 devices:");
        devicesSnap.docs.slice(0, 10).forEach(d => console.log(`- ${d.id}: ${d.data().device_id} | ${d.data().name}`));
        return;
    }

    console.log("Found HIMALAYA node:", JSON.stringify(himalayaNode, null, 2));
    
    const type = himalayaNode.device_type.toLowerCase();
    const metaDoc = await db.collection(type).doc(himalayaNode.id).get();
    
    if (!metaDoc.exists) {
        console.log(`❌ Metadata document not found in collection ${type}`);
        return;
    }
    
    const meta = metaDoc.data();
    console.log("--- Metadata ---");
    console.log("Channel ID:", meta.thingspeak_channel_id);
    console.log("Read API Key:", meta.thingspeak_read_api_key);
    console.log("Mapping:", JSON.stringify(meta.sensor_field_mapping, null, 2));
    console.log("Telemetry Snapshot:", JSON.stringify(meta.telemetry_snapshot, null, 2));
    console.log("Last Seen:", meta.last_seen || meta.last_updated_at);
    
    // 2. Fetch from ThingSpeak
    if (meta.thingspeak_channel_id && meta.thingspeak_read_api_key) {
        const axios = require("axios");
        const url = `https://api.thingspeak.com/channels/${meta.thingspeak_channel_id}/feeds.json?api_key=${meta.thingspeak_read_api_key}&results=1`;
        console.log(`Attempting fetch: ${url}`);
        try {
            const res = await axios.get(url);
            const feeds = res.data.feeds || [];
            if (feeds.length > 0) {
                const latest = feeds[0];
                console.log("ThingSpeak Latest Feed:", JSON.stringify(latest, null, 2));
                
                // My fix logic
                const mapping = meta.sensor_field_mapping || {};
                const flowKeys = ['flowField', 'flow_rate', 'flow_rate_field'];
                const totalKeys = ['volumeField', 'current_reading', 'total_reading', 'meter_reading_field'];

                const fieldFlow = Object.keys(mapping).find(k => flowKeys.includes(mapping[k])) || "field3";
                const fieldTotal = Object.keys(mapping).find(k => totalKeys.includes(mapping[k])) || "field1";
                
                console.log(`Resolved: fieldFlow=${fieldFlow}, fieldTotal=${fieldTotal}`);
                console.log(`Values: Flow=${latest[fieldFlow]}, Total=${latest[fieldTotal]}`);
            } else {
                console.log("No feeds returned from ThingSpeak.");
            }
        } catch (e) {
            console.log("ThingSpeak Fetch Failed:", e.message);
        }
    }
    
  } catch (err) {
    console.error("DIAGNOSE ERROR:", err);
  }
}

diagnose();
