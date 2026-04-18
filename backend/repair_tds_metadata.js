/**
 * TDS Device Metadata Repair Script
 * Fixes orphaned metadata and ensures all devices have proper registry entries
 */

const { db, admin } = require("./src/config/firebase.js");

async function repairTdsDevices() {
  console.log("\n🔧 TDS DEVICE REPAIR UTILITY\n");

  try {
    // Get all TDS devices from registry
    const devicesSnap = await db.collection("devices")
      .where("device_type", "in", ["evaratds", "tds"])
      .get();

    if (devicesSnap.empty) {
      console.log("ℹ️  No TDS devices found to repair");
      process.exit(0);
    }

    console.log(`Found ${devicesSnap.size} TDS devices\n`);

    // Get all metadata
    const metadataSnap = await db.collection("evaratds").get();
    const metadataIds = new Set(metadataSnap.docs.map(d => d.id));

    let missingCount = 0;
    let repairCount = 0;

    // Check each device
    for (const doc of devicesSnap.docs) {
      const deviceId = doc.id;
      const data = doc.data();

      if (!metadataIds.has(deviceId)) {
        console.log(`⚠️  Missing metadata for device: ${deviceId}`);
        console.log(`   Label: ${data.label || data.displayName}`);
        console.log(`   Device ID: ${data.device_id}`);
        console.log(`   Node ID: ${data.node_id}`);
        missingCount++;

        // Attempt to find metadata by device_id or node_id
        let foundMeta = null;
        
        if (data.device_id) {
          const q1 = await db.collection("evaratds")
            .where("device_id", "==", data.device_id)
            .limit(1)
            .get();
          if (!q1.empty) foundMeta = q1.docs[0];
        }

        if (!foundMeta && data.node_id) {
          const q2 = await db.collection("evaratds")
            .where("node_id", "==", data.node_id)
            .limit(1)
            .get();
          if (!q2.empty) foundMeta = q2.docs[0];
        }

        if (foundMeta) {
          console.log(`   Found metadata with different ID: ${foundMeta.id}`);
          console.log(`   ✨ REPAIR: Copying metadata to correct document ID...`);
          
          const metaData = foundMeta.data();
          await db.collection("evaratds").doc(deviceId).set(metaData);
          
          console.log(`   ✅ REPAIRED: Metadata copied to ${deviceId}\n`);
          repairCount++;
        } else {
          console.log(`   ❌ NO MATCHING METADATA FOUND`);
          console.log(`   → Please manually create metadata or reinstall device\n`);
        }
      }
    }

    // Remove orphaned metadata (has no corresponding device)
    console.log("\n🧹 Checking for orphaned metadata...\n");
    let orphanCount = 0;

    for (const metaDoc of metadataSnap.docs) {
      if (!devicesSnap.docs.find(d => d.id === metaDoc.id)) {
        console.log(`⚠️  Orphaned metadata: ${metaDoc.id}`);
        const data = metaDoc.data();
        console.log(`   device_id: ${data.device_id}`);
        console.log(`   node_id: ${data.node_id}`);
        orphanCount++;

        // Try to find matching device by device_id or node_id
        let matchingDevice = null;

        const q1 = await db.collection("devices")
          .where("device_id", "==", data.device_id)
          .limit(1)
          .get();
        if (!q1.empty) matchingDevice = q1.docs[0];

        if (!matchingDevice) {
          const q2 = await db.collection("devices")
            .where("node_id", "==", data.node_id)
            .limit(1)
            .get();
          if (!q2.empty) matchingDevice = q2.docs[0];
        }

        if (matchingDevice) {
          console.log(`   Found matching device: ${matchingDevice.id}`);
          console.log(`   ✨ REPAIR: Moving metadata to correct device ID...`);
          
          await db.collection("evaratds").doc(matchingDevice.id).set(data);
          await db.collection("evaratds").doc(metaDoc.id).delete();
          
          console.log(`   ✅ MOVED: ${metaDoc.id} → ${matchingDevice.id}\n`);
          repairCount++;
        } else {
          console.log(`   ℹ️  No matching device found (leaving orphaned)\n`);
        }
      }
    }

    // Final report
    console.log("\n" + "=".repeat(60));
    console.log("📊 REPAIR SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total TDS devices: ${devicesSnap.size}`);
    console.log(`Missing metadata: ${missingCount}`);
    console.log(`Orphaned metadata: ${orphanCount}`);
    console.log(`Repairs completed: ${repairCount}\n`);

    if (missingCount === 0 && orphanCount === 0) {
      console.log("✅ All TDS devices are properly configured!");
    }

  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

// Run repair
repairTdsDevices();
