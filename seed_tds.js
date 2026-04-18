const { db, admin } = require("./backend/src/config/firebase.js");

async function seedTDS() {
    const customerId = "cust_tds_demo"; // Example customer ID
    const zoneId = "zone_main"; // Example zone ID
    const deviceId = "TDS-UNIT-001";
    
    console.log(`[Seed] Seeding EvaraTDS: ${deviceId}...`);
    
    const timestamp = new Date();
    
    // 1. Registry entry
    const registryRef = db.collection("devices").doc(deviceId);
    await registryRef.set({
        device_id: deviceId,
        device_type: "EvaraTDS",
        label: "Main Water TDS",
        device_name: "EvaraTDS-Demo",
        customer_id: customerId,
        zone_id: zoneId,
        isVisibleToCustomer: true,
        latitude: 12.9716,
        longitude: 77.5946,
        created_at: timestamp,
        updated_at: timestamp
    });
    
    // 2. Metadata entry
    const metaRef = db.collection("evaratds").doc(deviceId);
    await metaRef.set({
        tdsValue: 450,
        temperature: 24.5,
        waterQualityRating: "Good",
        location: "Main Inlet",
        status: "online",
        lastUpdated: timestamp,
        tdsHistory: [
            { value: 440, timestamp: new Date(timestamp.getTime() - 3600000) },
            { value: 450, timestamp: timestamp }
        ],
        tempHistory: [
            { value: 24.0, timestamp: new Date(timestamp.getTime() - 3600000) },
            { value: 24.5, timestamp: timestamp }
        ],
        thingspeak_channel_id: "",
        thingspeak_read_api_key: "",
        customer_id: customerId,
        zone_id: zoneId,
        created_at: timestamp,
        updated_at: timestamp
    });
    
    console.log("[Seed] EvaraTDS seeded successfully!");
}

seedTDS().then(() => process.exit(0)).catch(err => {
    console.error("[Seed] Failed:", err);
    process.exit(1);
});
