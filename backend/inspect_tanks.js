const path = require('path');
require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function inspectTanks() {
  console.log("=== Inspecting Tank Devices and Metadata ===");
  try {
    const devicesSnap = await db.collection("devices")
      .where("device_type", "in", ["evaratank", "tank"])
      .get();
    
    console.log(`Found ${devicesSnap.size} tank devices in registry.`);

    for (const doc of devicesSnap.docs) {
      const registry = doc.data();
      const id = doc.id;
      console.log(`\n========================================`);
      console.log(`REGISTRY ID: ${id}`);
      console.log(`  device_id: ${registry.device_id}`);
      console.log(`  node_id: ${registry.node_id}`);
      console.log(`  device_type: ${registry.device_type}`);
      console.log(`  status: ${registry.status}`);
      console.log(`  last_seen: ${registry.last_seen}`);
      console.log(`  last_updated_at: ${registry.last_updated_at}`);
      console.log(`  last_online_at: ${registry.last_online_at}`);

      // Now get the specific metadata document in evaratank collection
      const metaDoc = await db.collection("evaratank").doc(id).get();
      if (metaDoc.exists) {
        const meta = metaDoc.data();
        console.log(`\n  METADATA (evaratank/${id}):`);
        console.log(`    thingspeak_channel_id: ${meta.thingspeak_channel_id}`);
        console.log(`    thingspeak_read_api_key: ${meta.thingspeak_read_api_key ? 'PRESENT' : 'MISSING'}`);
        console.log(`    last_seen: ${meta.last_seen}`);
        console.log(`    last_updated_at: ${meta.last_updated_at}`);
        console.log(`    last_online_at: ${meta.last_online_at}`);
        console.log(`    status: ${meta.status}`);
      } else {
        console.log(`  ❌ Metadata document missing from evaratank collection!`);
      }
    }
  } catch (err) {
    console.error("Error inspecting tanks:", err);
  }
  process.exit(0);
}

inspectTanks();
