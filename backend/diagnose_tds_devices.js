/**
 * TDS Device Diagnostic & Repair Tool
 * Helps identify and fix "Device Not Found" issues
 */

const { db, admin } = require("./src/config/firebase.js");

async function diagnose() {
  console.log("\n📋 TDS DEVICE DIAGNOSTIC REPORT\n");

  try {
    // 1. Check devices collection for TDS entries
    console.log("1️⃣ Scanning 'devices' collection for TDS entries...");
    const devicesSnap = await db.collection("devices")
      .where("device_type", "in", ["evaratds", "tds"])
      .limit(50)
      .get();

    if (devicesSnap.empty) {
      console.log("   ❌ NO TDS DEVICES FOUND IN 'devices' COLLECTION!");
      console.log("   → This is likely why you get 'Device Not Found' errors\n");
    } else {
      console.log(`   ✅ Found ${devicesSnap.size} TDS devices in registry:\n`);
      
      const devices = [];
      devicesSnap.forEach(doc => {
        const data = doc.data();
        devices.push({
          docId: doc.id,
          device_id: data.device_id,
          node_id: data.node_id,
          label: data.label || data.displayName,
          customer_id: data.customer_id,
          device_type: data.device_type
        });
        
        console.log(`   Document ID: ${doc.id}`);
        console.log(`   - device_type: ${data.device_type}`);
        console.log(`   - device_id: ${data.device_id}`);
        console.log(`   - node_id: ${data.node_id}`);
        console.log(`   - label: ${data.label || data.displayName}`);
        console.log(`   - customer_id: ${data.customer_id}`);
      });

      // 2. Check if metadata exists for each device
      console.log("\n2️⃣ Checking 'evaratds' collection for matching metadata...\n");
      
      for (const device of devices) {
        // Try direct lookup
        const metaDoc = await db.collection("evaratds").doc(device.docId).get();
        
        if (metaDoc.exists) {
          const meta = metaDoc.data();
          console.log(`   ✅ Device ${device.docId}: HAS METADATA`);
          console.log(`      - ThingSpeak Channel: ${meta.thingspeak_channel_id}`);
          console.log(`      - API Key: ${meta.thingspeak_read_api_key ? '✓ Present' : '❌ MISSING'}`);
          console.log(`      - Sensor Mapping: ${JSON.stringify(meta.sensor_field_mapping || {})}`);
        } else {
          console.log(`   ❌ Device ${device.docId}: METADATA MISSING!`);
          console.log(`      → This will cause 'TDS metadata not found' error`);
          console.log(`      → Create metadata in 'evaratds' collection with this doc ID\n`);
        }
      }
    }

    // 3. Check evaratds collection directly
    console.log("\n3️⃣ Checking 'evaratds' collection directly...");
    const evaraTdsSnap = await db.collection("evaratds").limit(50).get();
    
    if (evaraTdsSnap.empty) {
      console.log("   ❌ NO DOCUMENTS IN 'evaratds' COLLECTION!\n");
    } else {
      console.log(`   ✅ Found ${evaraTdsSnap.size} metadata documents:\n`);
      evaraTdsSnap.forEach(doc => {
        const data = doc.data();
        console.log(`   Document ID: ${doc.id}`);
        console.log(`   - device_id: ${data.device_id}`);
        console.log(`   - node_id: ${data.node_id}`);
        console.log(`   - ThingSpeak Channel: ${data.thingspeak_channel_id}`);
      });
    }

    // 4. Orphaned metadata check
    console.log("\n4️⃣ Checking for orphaned metadata (metadata without registry)...");
    const orphaned = [];
    
    evaraTdsSnap.forEach(async (doc) => {
      // Check if corresponding device exists
      const registryDoc = await db.collection("devices").doc(doc.id).get();
      if (!registryDoc.exists) {
        orphaned.push(doc.id);
      }
    });

    if (orphaned.length > 0) {
      console.log(`   ⚠️  Found ${orphaned.length} orphaned metadata documents`);
      console.log("   → These won't be accessible (no registry entry)\n");
      orphaned.forEach(id => console.log(`      - ${id}`));
    } else {
      console.log("   ✅ No orphaned metadata found\n");
    }

    // 5. Summary and recommendations
    console.log("\n" + "=".repeat(60));
    console.log("📌 SUMMARY & RECOMMENDATIONS");
    console.log("=".repeat(60) + "\n");

    if (devicesSnap.empty) {
      console.log("🚨 PROBLEM: No TDS devices exist!");
      console.log("SOLUTION: Create a TDS device first:");
      console.log("   1. Go to Admin Dashboard");
      console.log("   2. Create New Node > Select 'EvaraTDS'");
      console.log("   3. Fill in device details and ThingSpeak credentials\n");
    } else if (devicesSnap.size === evaraTdsSnap.size) {
      console.log("✅ GOOD: All TDS devices have metadata");
      console.log("→ Check logs for specific 'Device not found' errors\n");
    } else {
      console.log("❌ MISMATCH: Device registry and metadata don't align!");
      console.log(`   - Devices in registry: ${devicesSnap.size}`);
      console.log(`   - Metadata in evaratds: ${evaraTdsSnap.size}`);
      console.log("→ Run fix_orphaned_tds_devices.js to reconcile\n");
    }

  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

// Run diagnostic
diagnose();
