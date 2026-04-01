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

async function backfill() {
    try {
        const snapshot = await db.collection("devices").get();
        console.log(`Checking ${snapshot.size} devices...`);

        const batch = db.batch();
        let count = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.isVisibleToCustomer === undefined) {
                batch.update(doc.ref, { isVisibleToCustomer: true });
                console.log(`Backfilling ID: ${doc.id}`);
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
            console.log(`Successfully backfilled ${count} devices.`);
        } else {
            console.log("No devices required backfilling.");
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

backfill();
