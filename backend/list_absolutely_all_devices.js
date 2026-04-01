const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
    })
});

const db = admin.firestore();

async function listAll() {
    try {
        const snapshot = await db.collection("devices").get();
        console.log("TOTAL_DEVICES_IN_DB:", snapshot.size);
        snapshot.forEach(doc => {
            const d = doc.data();
            console.log(`ID: ${doc.id} | NAME: ${d.name} | DEVICE_ID: ${d.device_id} | CUSTOMER: ${d.customer_id}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listAll();
