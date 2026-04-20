const { createNode } = require("./src/controllers/admin.controller.js");

async function testCreateNode() {
    console.log("\n====== TESTING CREATE NODE WITH THINGSPEAK CREDENTIALS ======\n");
    
    const req = {
        body: {
            displayName: "Test Flow Meter",
            deviceName: "flow_test_123",
            assetType: "flowmeter",
            thingspeakChannelId: "3233465",
            thingspeakReadKey: "KIJSYALzLELFDAP",
            zoneId: "test_zone",
            customerId: "test_customer",
            latitude: "40.7128",
            longitude: "-74.0060"
        },
        user: { 
            role: "superadmin",
            uid: "test_user_123" 
        }
    };
    
    const res = {
        status: (code) => {
            console.log(`\n[TEST] Response Status: ${code}`);
            return {
                json: (data) => {
                    console.log(`[TEST] Response Body:`, JSON.stringify(data, null, 2).substring(0, 500));
                }
            };
        }
    };
    
    try {
        console.log("[TEST] Calling createNode with:");
        console.log("  - displayName:", req.body.displayName);
        console.log("  - thingspeakChannelId:", req.body.thingspeakChannelId);
        console.log("  - thingspeakReadKey:", req.body.thingspeakReadKey);
        console.log("\n[TEST] Check console for [createNode] DEBUG logs...\n");
        
        await createNode(req, res);
        
        console.log("\n[TEST] createNode execution complete\n");
    } catch (e) {
        console.error("[TEST] Error:", e.message);
        console.error(e);
    }
}

testCreateNode().then(() => {
    console.log("[TEST] Waiting 3 seconds then exiting...");
    setTimeout(() => process.exit(0), 3000);
}).catch(e => { 
    console.error("[TEST] Fatal error:", e); 
    process.exit(1); 
});
