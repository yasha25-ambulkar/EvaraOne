
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Try to find service account
const serviceAccountPath = path.join(__dirname, 'backend', 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('Service account key not found at:', serviceAccountPath);
    process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
    console.log('--- TDS DEVICES IN REGISTRY ---');
    const snapshot = await db.collection('devices')
        .where('device_type', 'in', ['EvaraTDS', 'tds', 'evaratds'])
        .get();
    
    for (const doc of snapshot.docs) {
        const data = doc.data();
        console.log(`Device ID: ${doc.id}`);
        console.log(`Label: ${data.label}`);
        console.log(`Device ID (HW): ${data.device_id}`);
        console.log(`Node ID: ${data.node_id}`);
        console.log(`Last Telemetry: ${JSON.stringify(data.last_telemetry)}`);
        
        console.log('--- METADATA ---');
        const type = data.device_type.toLowerCase();
        // Try direct lookup by doc.id
        const metaDoc = await db.collection(type).doc(doc.id).get();
        if (metaDoc.exists) {
            console.log(`Metadata found by DocID (${doc.id}):`, JSON.stringify(metaDoc.data()));
        } else {
            // Try field lookup by device_id
            const metaQuery = await db.collection(type).where('device_id', '==', data.device_id || '').get();
            if (!metaQuery.empty) {
                console.log(`Metadata found by device_id (${data.device_id}):`, JSON.stringify(metaQuery.docs[0].data()));
            } else {
                console.log(`❌ No metadata found in collection "${type}"`);
            }
        }
        console.log('----------------------------');
    }
}

run().catch(console.error);
