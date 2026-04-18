/**
 * FIX: Create missing DEVICES registry entries for orphaned evaratds
 */

// Load environment variables FIRST
require("dotenv").config();

// Use the backend's Firebase config for proper authentication
const { db } = require("./src/config/firebase-secure.js");

async function fixOrphanedTDS() {
    console.log("\n🔧 FIXING: Creating missing registry entries\n");
    console.log("=" .repeat(70));

    try {
        // Step 1: Get all devices in registry
        const devicesSnap = await db.collection("devices").get();
        const deviceIds = new Set(devicesSnap.docs.map(d => d.id));

        // Step 2: Get all TDS metadata
        const tdsSnap = await db.collection("evaratds").get();
        console.log(`\n   Found ${tdsSnap.size} TDS metadata entries`);

        // Step 3: Find orphaned ones
        const orphaned = [];
        tdsSnap.forEach(doc => {
            if (!deviceIds.has(doc.id)) {
                orphaned.push({ id: doc.id, data: doc.data() });
            }
        });

        if (orphaned.length === 0) {
            console.log(`   ✅ No orphaned TDS entries found!`);
            console.log(`\n   All TDS devices are properly registered.`);
            process.exit(0);
        }

        console.log(`   ❌ Found ${orphaned.length} ORPHANED entries\n`);

        // Step 4: Create registry entries
        console.log(`   Creating registry entries...\n`);
        
        let fixed = 0;
        for (const orphan of orphaned) {
            const meta = orphan.data;
            
            const registryEntry = {
                device_id: meta.device_id || orphan.id,
                device_type: "evaratds",
                node_id: meta.device_id || orphan.id,
                customer_id: meta.customer_id || "",
                api_key_hash: "",
                isVisibleToCustomer: true,
                analytics_template: "EvaraTDS",
                customer_config: {
                    showAlerts: true,
                    showConsumption: true,
                    showDeviceHealth: true,
                    showEstimations: true,
                    showFillRate: true,
                    showMap: true,
                    showTankLevel: true,
                    showVolume: true
                },
                created_at: meta.created_at || new Date()
            };

            try {
                await db.collection("devices").doc(orphan.id).set(registryEntry);
                console.log(`   ✅ Fixed: ${orphan.id}`);
                console.log(`      Label: ${meta.label}`);
                fixed++;
            } catch (err) {
                console.log(`   ❌ Failed: ${orphan.id} - ${err.message}`);
            }
        }

        console.log(`\n   📊 FIXED: ${fixed}/${orphaned.length} devices`);

        // Step 5: Verify
        console.log(`\n   Verifying...`);
        const verifySnap = await db.collection("devices").where("device_type", "==", "evaratds").get();
        console.log(`   ✅ Registry now has: ${verifySnap.size} TDS device(s)`);

        console.log(`\n` + "=" .repeat(70));
        console.log(`✅ FIX COMPLETE!\n`);
        console.log(`   Next steps:`);
        console.log(`   1. Backend is already running`);
        console.log(`   2. Refresh browser: Ctrl+Shift+R`);
        console.log(`   3. Check EVARATDS tab - should show ${verifySnap.size} device\n`);

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        process.exit(0);
    }
}

fixOrphanedTDS();
