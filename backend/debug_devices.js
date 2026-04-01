const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

// Load .env
dotenv.config({ path: path.join(__dirname, '.env') });

const privateKey = process.env.FIREBASE_PRIVATE_KEY 
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
    : undefined;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
}

const db = admin.firestore();

async function audit() {
    try {
        console.log(`--- Firestore Data Type Audit ---`);
        const snapshot = await db.collection("devices").get();
        console.log(`Auditing ${snapshot.size} records...`);
        
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const val = data.isVisibleToCustomer;
            const type = typeof val;
            
            // Check for OBH Tank specifically or any relevant device
            const deviceId = data.device_id || 'N/A';
            if (deviceId.toUpperCase().includes('OBH') || deviceId.toUpperCase().includes('TANK')) {
                console.log(`MATCH FOUND:`);
            }
            
            console.log(`ID: ${doc.id}`);
            console.log(`  device_id: ${deviceId}`);
            console.log(`  isVisibleToCustomer: ${JSON.stringify(val)} (Type: ${type})`);
            console.log(`  customer_id: ${data.customer_id}`);
            console.log(`---`);
        });
        process.exit(0);
    } catch (err) {
        console.error("Audit failed:", err);
        process.exit(1);
    }
}

audit();
