const path = require('path');
const axios = require('axios');

const backendDir = path.resolve(__dirname, '../backend');
require('dotenv').config({ path: path.join(backendDir, '.env') });
const firebasePath = path.join(backendDir, 'src/config/firebase.js');
const { db } = require(firebasePath);

async function fetchRawFeeds() {
  console.log("=== Fetching Raw Telemetry from ThingSpeak ===");
  try {
    const devicesSnap = await db.collection("devices").get();
    console.log(`Found ${devicesSnap.size} devices in registry.`);

    for (const doc of devicesSnap.docs) {
      const device = doc.data();
      const type = (device.device_type || device.deviceType || "").toLowerCase();
      
      if (!type.includes('flow') && !type.includes('tank')) {
        continue;
      }

      console.log(`\n----------------------------------------`);
      console.log(`DEVICE ID: ${device.device_id || device.node_id} (${device.device_type})`);

      // Fetch metadata from collection type
      const metaDoc = await db.collection(type).doc(doc.id).get();
      if (!metaDoc.exists) {
        console.log(`❌ Metadata doc not found in collection: ${type}`);
        continue;
      }

      const meta = metaDoc.data();
      const channelId = meta.thingspeak_channel_id || device.thingspeak_channel_id;
      const apiKey = meta.thingspeak_read_api_key || device.thingspeak_read_api_key;

      console.log(`Channel ID: ${channelId}`);
      console.log(`Has Read API Key: ${apiKey ? 'Yes' : 'No'}`);

      if (!channelId || !apiKey) {
        console.log(`❌ Missing ThingSpeak configuration.`);
        continue;
      }

      const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=5`;
      try {
        const res = await axios.get(url);
        const feeds = res.data.feeds || [];
        
        if (type.includes('flow')) {
          console.log(">>> FLOW RAW FEEDS:");
        } else {
          console.log(">>> TANK RAW FEEDS:");
        }
        
        if (feeds.length === 0) {
          console.log("  (No feeds found on ThingSpeak)");
        } else {
          feeds.forEach((feed, idx) => {
            console.log(`  [Feed ${idx + 1}] Created At: ${feed.created_at} | field1: ${feed.field1} | field2: ${feed.field2} | field3: ${feed.field3}`);
          });
        }
      } catch (err) {
        console.log(`❌ ThingSpeak Fetch Failed: ${err.message}`);
      }
    }
  } catch (err) {
    console.error("❌ Diagnostic Execution Error:", err);
  }
  process.exit(0);
}

fetchRawFeeds();
