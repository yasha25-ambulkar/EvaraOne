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

async function search() {
    const collections = ["evaratank", "evaradeep", "evaraflow"];
    console.log("Searching metadata collections for 'Bakul'...");

    try {
        for (const col of collections) {
            const snapshot = await db.collection(col).get();
            snapshot.forEach(doc => {
                const d = doc.data();
                const name = d.device_name || d.label || d.name || "";
                if (name.includes("Bakul")) {
                    console.log(`FOUND in ${col}: [${doc.id}] Name: ${name}, Customer: ${d.customer_id}`);
                }
            });
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

search();
