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
    const customerId = "imwyScqd9faqqZ3lOX5XPR0MYsz2";
    console.log("Listing ALL devices for customer:", customerId);

    try {
        const snapshot = await db.collection("devices")
            .where("customer_id", "==", customerId)
            .get();

        console.log("Count:", snapshot.size);
        snapshot.forEach(doc => {
            console.log(`--- ID: ${doc.id} ---`);
            console.log(JSON.stringify(doc.data(), null, 2));
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listAll();
