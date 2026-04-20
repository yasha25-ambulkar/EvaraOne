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

async function test() {
    try {
        const s = await db.collection("devices").where("device_type", "==", "evaratds").get();
        console.log(`Found ${s.size} TDS devices:`);
        s.forEach(d => {
            const data = d.data();
            console.log(`DocID: ${d.id} | device_id: ${data.device_id} | node_id: ${data.node_id} | label: ${data.label || data.displayName}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
