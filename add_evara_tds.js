const { db } = require("./backend/src/config/firebase.js");

async function provisionTDS() {
    const customerId = "unassigned"; // No customer provided
    const zoneId = "IIIT"; 
    const deviceId = "EV-TDS_001";
    
    console.log(`[Provision] Provisioning EvaraTDS: ${deviceId}...`);
    
    const timestamp = new Date();
    
    try {
        // 1. Registry entry
        const registryRef = db.collection("devices").doc(deviceId);
        await registryRef.set({
            hardwareId: deviceId, // updated standard key
            node_key: deviceId,
            device_id: deviceId,
            device_type: "tds",
            assetType: "EvaraTDS",
            label: "Evara TDS Sensor",
            device_name: "EvaraTDS-001",
            displayName: "EvaraTDS-001",
            customer_id: customerId,
            customerId: customerId,
            zone_id: zoneId,
            zoneId: zoneId,
            isVisibleToCustomer: true,
            latitude: 17.445217,
            longitude: 78.349629,
            thingspeakChannelId: "2713286",
            thingspeakReadKey: "EHEK3A1XD48TY98B",
            tdsField: "field2",
            temperatureField: "field3",
            thingspeak_channel_id: "2713286",
            thingspeak_read_key: "EHEK3A1XD48TY98B",
            tds_field: "field2",
            temperature_field: "field3",
            created_at: timestamp,
            updated_at: timestamp,
            status: "Online"
        }, { merge: true });
        
        // 2. Metadata entry
        const metaRef = db.collection("evaratds").doc(deviceId);
        await metaRef.set({
            tdsValue: 0,
            temperature: 0,
            waterQualityRating: "Unknown",
            location: "IIIT Zone",
            status: "online",
            lastUpdated: timestamp,
            thingspeak_channel_id: "2713286",
            thingspeak_read_api_key: "EHEK3A1XD48TY98B",
            customer_id: customerId,
            zone_id: zoneId,
            created_at: timestamp,
            updated_at: timestamp
        }, { merge: true });
        
        console.log("[Provision] EvaraTDS provisioned successfully! You can verify in the platform.");
    } catch (err) {
        console.error("[Provision] Error saving EvaraTDS:", err);
    }
}

provisionTDS().then(() => process.exit(0)).catch(err => {
    console.error("[Provision] Failed:", err);
    process.exit(1);
});
