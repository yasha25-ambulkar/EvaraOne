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

async function fix() {
    const customerId = "imwyScqd9faqqZ3lOX5XPR0MYsz2";
    try {
        const snapshot = await db.collection("devices").where("device_id", "==", "EV-TNK-001").get();
        if (snapshot.empty) {
            console.log("OBH Tank (EV-TNK-001) not found in registry.");
        } else {
            const batch = db.batch();
            snapshot.forEach(doc => {
                console.log(`Fixing OBH Tank: ${doc.id}`);
                batch.update(doc.ref, { 
                    customer_id: customerId,
                    isVisibleToCustomer: true
                });
            });
            await batch.commit();
            console.log("OBH Tank repaired.");
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fix();
