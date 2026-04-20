/**
 * Diagnostic script to check TDS device creation
 * Verifies both devices collection (registry) and evaratds collection (metadata)
 */

const { db, admin } = require("./src/config/firebase.js");

async function diagnose() {
  try {
    console.log("\n🔍 TDS DEVICE CREATION DIAGNOSIS\n");

    // 1. Check devices collection for TDS devices
    console.log("1️⃣  Checking DEVICES Collection (Registry)...");
    const devicesSnapshot = await db.collection("devices").where("device_type", "==", "tds").limit(5).get();
    
    if (devicesSnapshot.empty) {
      console.log("❌ No TDS devices found in devices collection");
      
      // Try with uppercase
      const devicesSnapshot2 = await db.collection("devices").where("device_type", "==", "TDS").limit(5).get();
      if (!devicesSnapshot2.empty) {
        console.log("⚠️  Found TDS devices with uppercase!");
        devicesSnapshot2.forEach(doc => {
          console.log(`   - ${doc.id}: ${JSON.stringify(doc.data(), null, 2)}`);
        });
      }
      
      // Try with evaratds
      const devicesSnapshot3 = await db.collection("devices").where("device_type", "==", "evaratds").limit(5).get();
      if (!devicesSnapshot3.empty) {
        console.log("⚠️  Found devices with 'evaratds' type!");
        devicesSnapshot3.forEach(doc => {
          console.log(`   - ${doc.id}: ${JSON.stringify(doc.data(), null, 2)}`);
        });
      }
    } else {
      console.log(`✅ Found ${devicesSnapshot.size} TDS device(s):`);
      devicesSnapshot.forEach(doc => {
        console.log(`\n📋 Device ID: ${doc.id}`);
        const data = doc.data();
        console.log(`   Device Type: ${data.device_type}`);
        console.log(`   Device ID Field: ${data.device_id || "N/A"}`);
        console.log(`   Node ID: ${data.node_id || "N/A"}`);
        console.log(`   Label: ${data.label || "N/A"}`);
        console.log(`   Device Name: ${data.device_name || "N/A"}`);
        console.log(`   Sub Type: ${data.sub_type || "N/A"}`);
        console.log(`   Full Data: ${JSON.stringify(data, null, 2)}`);
      });
    }

    // 2. Check evaratds collection for metadata
    console.log("\n\n2️⃣  Checking EVARATDS Collection (Metadata)...");
    const tdsSnapshot = await db.collection("evaratds").limit(5).get();
    
    if (tdsSnapshot.empty) {
      console.log("❌ No TDS metadata documents found in evaratds collection");
    } else {
      console.log(`✅ Found ${tdsSnapshot.size} TDS metadata document(s):`);
      tdsSnapshot.forEach(doc => {
        console.log(`\n📋 Metadata ID: ${doc.id}`);
        const data = doc.data();
        console.log(`   Label: ${data.label || "N/A"}`);
        console.log(`   Device ID: ${data.device_id || "N/A"}`);
        console.log(`   Node ID: ${data.node_id || "N/A"}`);
        console.log(`   ThingSpeak Channel: ${data.thingspeak_channel_id || "N/A"}`);
        console.log(`   ThingSpeak API Key: ${data.thingspeak_read_api_key ? "✅ SET" : "❌ MISSING"}`);
        console.log(`   Sensor Field Mapping: ${JSON.stringify(data.sensor_field_mapping || {})}`);
        console.log(`   Full Data: ${JSON.stringify(data, null, 2)}`);
      });
    }

    // 3. Check if IDs match between collections
    console.log("\n\n3️⃣  CROSS-CHECKING Device Registry ↔️ Metadata...");
    const allDevices = await db.collection("devices").where("device_type", "in", ["tds", "TDS", "evaratds"]).get();
    const allMetadata = await db.collection("evaratds").get();

    console.log(`Devices collection has ${allDevices.size} TDS device(s)`);
    console.log(`Evaratds collection has ${allMetadata.size} metadata document(s)`);

    allDevices.forEach(devDoc => {
      const devId = devDoc.id;
      const devData = devDoc.data();
      console.log(`\n   Device: ${devId}`);
      
      // Check if metadata exists with same ID
      let found = false;
      allMetadata.forEach(metaDoc => {
        if (metaDoc.id === devId) {
          console.log(`   ✅ Metadata found with same ID`);
          found = true;
        }
      });
      
      if (!found) {
        console.log(`   ❌ Metadata NOT found with ID ${devId}`);
        console.log(`      Trying to find by device_id: ${devData.device_id}`);
        
        let foundByDeviceId = false;
        allMetadata.forEach(metaDoc => {
          if (metaDoc.data().device_id === devData.device_id) {
            console.log(`         ✅ Found metadata with device_id: ${metaDoc.id}`);
            foundByDeviceId = true;
          }
        });
        
        if (!foundByDeviceId) {
          console.log(`         ❌ Metadata not found by device_id either`);
        }
      }
    });

    console.log("\n✅ Diagnosis complete\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during diagnosis:", error);
    process.exit(1);
  }
}

diagnose();
