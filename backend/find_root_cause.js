/**
 * ROOT CAUSE CHECK: Is TDS device in BOTH collections?
 */

// Load environment variables FIRST
require("dotenv").config();

// Use the backend's Firebase config for proper authentication
const { db } = require("./src/config/firebase-secure.js");

async function findRootCause() {
    console.log("\n🔍 ROOT CAUSE ANALYSIS\n");
    console.log("=" .repeat(70));

    try {
        // Step 1: Get all entries in DEVICES collection
        console.log("\n1️⃣  DEVICES Collection (Registry):");
        console.log("-".repeat(70));
        
        const devicesSnap = await db.collection("devices").get();
        const deviceIds = new Set();
        
        console.log(`   Total entries: ${devicesSnap.size}`);
        devicesSnap.forEach(doc => {
            deviceIds.add(doc.id);
            const dt = doc.data().device_type;
            console.log(`   ✅ ${doc.id} → device_type: "${dt}"`);
        });

        // Step 2: Get all entries in EVARATDS collection
        console.log(`\n2️⃣  EVARATDS Collection (Metadata):`);
        console.log("-".repeat(70));
        
        const tdsSnap = await db.collection("evaratds").get();
        const tdsIds = [];
        
        console.log(`   Total entries: ${tdsSnap.size}`);
        tdsSnap.forEach(doc => {
            tdsIds.push(doc.id);
            const inRegistry = deviceIds.has(doc.id);
            const status = inRegistry ? "✅ FOUND" : "❌ MISSING";
            console.log(`   ${status} in registry → ${doc.id} (${doc.data().label})`);
        });

        // Step 3: DIAGNOSIS
        console.log(`\n3️⃣  DIAGNOSIS:`);
        console.log("=" .repeat(70));
        
        let orphanedCount = 0;
        let orphanedIds = [];
        for (const tdsId of tdsIds) {
            if (!deviceIds.has(tdsId)) {
                orphanedCount++;
                orphanedIds.push(tdsId);
                console.log(`\n   ❌ ORPHANED FOUND:`);
                console.log(`      ID: ${tdsId}`);
                console.log(`      Status: In evaratds BUT NOT in devices!`);
            }
        }

        if (orphanedCount === 0) {
            console.log(`\n   ✅ All TDS devices have registry entries`);
            console.log(`   Problem is elsewhere (cache, API filtering, etc)`);
        } else {
            console.log(`\n   ⚠️  Found ${orphanedCount} ORPHANED TDS device(s)!`);
            console.log(`\n   NEXT STEP:`);
            console.log(`   Run: node backend/fix_orphaned_tds_devices.js`);
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        process.exit(0);
    }
}

findRootCause();
