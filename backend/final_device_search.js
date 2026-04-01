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
    const customerId = "imwyScqd9faqqZ3lOX5XPR0MYsz2";
    console.log("Searching for customer:", customerId);
    
    try {
        const snapshot = await db.collection("devices").get();
        console.log("Total devices in DB:", snapshot.size);
        
        snapshot.forEach(doc => {
            const d = doc.data();
            const isMatch = (d.customer_id === customerId);
            const isBakul = (d.name && d.name.includes("Bakul")) || (d.device_id && d.device_id.includes("Bakul"));
            
            if (isMatch || isBakul) {
                console.log(`MATCH: [${doc.id}] Name: ${d.name}, DeviceID: ${d.device_id}, Customer: ${d.customer_id}, Visible: ${d.isVisibleToCustomer}`);
            }
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

search();
