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

async function findBakul() {
    try {
        const snapshot = await db.collection("devices").get();
        snapshot.forEach(doc => {
            const d = doc.data();
            if ((d.name && d.name.includes("Bakul")) || (d.device_id && d.device_id.includes("Bakul"))) {
                console.log(`FOUND: ${d.name || d.device_id} | ID: ${doc.id} | CUSTOMER: ${d.customer_id} | VISIBLE: ${d.isVisibleToCustomer}`);
            }
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

findBakul();
