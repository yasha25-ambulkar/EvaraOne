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

async function verify() {
    const ids = ['pBRE2M84H9vypGTENvrr', 's1AmJoDdAFIzMMFYMaZe', 'qG6sM6N7B7vypGTENvrr'];
    try {
        for (const id of ids) {
            const doc = await db.collection('devices').doc(id).get();
            if (doc.exists) {
                const d = doc.data();
                console.log(`ID: ${id} | Visible: ${d.isVisibleToCustomer} | CID: '${d.customer_id}' | Type: ${d.device_type}`);
            } else {
                console.log(`ID: ${id} | DOES NOT EXIST`);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verify();
