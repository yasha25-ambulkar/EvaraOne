#!/usr/bin/env node

/**
 * DEBUG: Device Status Inconsistency Analyzer
 * 
 * This script analyzes why device status shows differently in list vs detail view
 * 
 * Usage: node debug_device_status.js <deviceId>
 * Example: node debug_device_status.js himalaya-device-123
 */

const admin = require("firebase-admin");
const path = require("path");

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, "../config/firebase-secure.js");
const firebaseConfig = require(serviceAccountPath);
admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
    databaseURL: firebaseConfig.databaseURL
});

const db = admin.firestore();

const calculateDeviceStatus = (lastUpdatedAt) => {
    if (!lastUpdatedAt) return "OFFLINE_STOPPED";
    
    try {
        const now = new Date();
        const lastUpdate = new Date(lastUpdatedAt);
        
        const tzOffset = 5.5 * 60 * 60 * 1000;
        const nowIST = new Date(now.getTime() + tzOffset);
        const lastUpdateIST = new Date(lastUpdate.getTime() + tzOffset);
        
        const currentDate = nowIST.toISOString().split('T')[0];
        const lastDataDate = lastUpdateIST.toISOString().split('T')[0];
        
        const timeDiffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
        
        const isSameDay = lastDataDate === currentDate;
        
        if (isSameDay) {
            if (timeDiffMinutes <= 20) {
                return "ONLINE";
            } else {
                return "OFFLINE_RECENT";
            }
        } else {
            return "OFFLINE_STOPPED";
        }
    } catch (err) {
        console.error("Status calculation error:", err.message);
        return "OFFLINE_STOPPED";
    }
};

async function debugDeviceStatus(deviceId) {
    console.log(`\n🔍 Analyzing Status for Device: ${deviceId}\n`);
    
    try {
        // 1. Get registry data
        const registryDoc = await db.collection("devices").doc(deviceId).get();
        if (!registryDoc.exists) {
            console.error(`❌ Device ${deviceId} not found in registry`);
            process.exit(1);
        }

        const registry = registryDoc.data();
        const deviceType = registry.device_type?.toLowerCase();
        
        console.log(`📋 Registry Data:`);
        console.log(`   - ID: ${deviceId}`);
        console.log(`   - Type: ${registry.device_type}`);
        console.log(`   - Customer: ${registry.customer_id}`);
        console.log(`   - Visible: ${registry.isVisibleToCustomer !== false}`);

        // 2. Get metadata from appropriate collection
        const metaDoc = await db.collection(deviceType).doc(deviceId).get();
        if (!metaDoc.exists) {
            console.error(`❌ Metadata not found for device in ${deviceType} collection`);
            process.exit(1);
        }

        const meta = metaDoc.data();
        
        console.log(`\n📊 Metadata (Status Source):`);
        console.log(`   - Label: ${meta.label}`);
        console.log(`   - Status (stored): ${meta.status}`);
        console.log(`   - Stored Last Updated: ${meta.last_updated_at}`);
        console.log(`   - Stored Last Seen: ${meta.last_seen}`);
        
        console.log(`\n📡 Telemetry Snapshot:`);
        if (meta.telemetry_snapshot) {
            console.log(`   - Timestamp: ${meta.telemetry_snapshot.timestamp}`);
            console.log(`   - Status: ${meta.telemetry_snapshot.status}`);
            console.log(`   - Fields:`, Object.keys(meta.telemetry_snapshot).join(", "));
        } else {
            console.log(`   - No telemetry_snapshot found`);
        }

        // 3. Calculate what status SHOULD be
        console.log(`\n🧮 Status Calculation Analysis:`);
        
        const lastSeenOptions = {
            "telemetry_snapshot.timestamp": meta.telemetry_snapshot?.timestamp,
            "last_updated_at": meta.last_updated_at,
            "last_seen": meta.last_seen
        };

        console.log(`   Potential 'lastSeen' values:`);
        for (const [key, value] of Object.entries(lastSeenOptions)) {
            if (value) {
                const calc = calculateDeviceStatus(value);
                const date = new Date(value);
                const hoursAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60);
                console.log(`   ✓ ${key}: ${value} (${hoursAgo.toFixed(1)} hours ago) => ${calc}`);
            }
        }

        // 4. Priority order status calculation
        const lastSeen = meta.telemetry_snapshot?.timestamp || meta.last_updated_at || meta.last_seen || null;
        console.log(`\n✨ Priority-Based Last Seen: ${lastSeen}`);
        
        const calculatedStatus = calculateDeviceStatus(lastSeen);
        const storedStatus = meta.status;
        
        console.log(`\n📈 Status Comparison:`);
        console.log(`   - Stored Status: ${storedStatus}`);
        console.log(`   - Calculated Status: ${calculatedStatus}`);
        console.log(`   - Match: ${storedStatus === calculatedStatus ? '✅ YES' : '❌ NO (INCONSISTENT!)'}`);

        // 5. Detailed timing analysis
        if (lastSeen) {
            const lastDate = new Date(lastSeen);
            const now = new Date();
            const diffMs = now - lastDate;
            const diffMins = diffMs / (1000 * 60);
            const diffHours = diffMins / 60;
            const diffDays = diffHours / 24;
            
            console.log(`\n⏱️ Timing Details:`);
            console.log(`   - Last Update: ${lastDate.toLocaleString('en-IN')}`);
            console.log(`   - Current Time: ${now.toLocaleString('en-IN')}`);
            console.log(`   - Time Since Update:`);
            console.log(`     • ${diffMins.toFixed(1)} minutes`);
            console.log(`     • ${diffHours.toFixed(2)} hours`);
            console.log(`     • ${diffDays.toFixed(2)} days`);
            console.log(`   - Status Category:`);
            if (diffMins <= 20 && lastDate.toLocaleDateString() === now.toLocaleDateString()) {
                console.log(`     📍 ONLINE (within 20 mins, same day)`);
            } else if (lastDate.toLocaleDateString() === now.toLocaleDateString()) {
                console.log(`     📍 OFFLINE_RECENT (>20 mins, same day)`);
            } else {
                console.log(`     📍 OFFLINE_STOPPED (different day)`);
            }
        }

        // 6. Check cache keys
        console.log(`\n💾 Cache Information:`);
        console.log(`   - Cache key format: telemetry_${deviceId}`);
        console.log(`   - Nodes list cache: user:admin:devices or user:{userId}:devices`);

        // 7. Check if there's a newer update somewhere
        console.log(`\n🔄 Checking for Recent Updates:`);
        const recentCheck = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
        console.log(`   - Checking for updates since: ${recentCheck.toLocaleString('en-IN')}`);
        
        // Check telemetry logs if available
        if (meta.telemetry_stream) {
            console.log(`   - Found telemetry_stream: ${meta.telemetry_stream.length} entries`);
        }

        // 8. Recommendations
        console.log(`\n💡 Recommendations:`);
        if (storedStatus !== calculatedStatus) {
            console.log(`   ⚠️ Status mismatch detected!`);
            console.log(`   1. The stored status (${storedStatus}) doesn't match calculated (${calculatedStatus})`);
            console.log(`   2. Frontend should recalculate status fresh, not use stored value`);
            console.log(`   3. Backend should update stored status field regularly`);
        } else {
            console.log(`   ✅ Status is consistent`);
        }

        if (!lastSeen) {
            console.log(`   ⚠️ No lastSeen value found!`);
            console.log(`   - Device may never have received telemetry`);
            console.log(`   - Or telemetry fields are not being set properly`);
        }

        console.log(`\n`);
        process.exit(0);

    } catch (error) {
        console.error("❌ Error:", error.message);
        console.error(error);
        process.exit(1);
    }
}

// Main
const deviceId = process.argv[2];
if (!deviceId) {
    console.error("Usage: node debug_device_status.js <deviceId>");
    process.exit(1);
}

debugDeviceStatus(deviceId);
