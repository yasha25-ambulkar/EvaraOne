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

async function audit() {
    const customerId = "imwyScqd9faqqZ3lOX5XPR0MYsz2";
    console.log("Auditing customer:", customerId);

    try {
        const s = await db.collection('devices').where('customer_id', '==', customerId).get();
        console.log(`Found ${s.size} devices in Registry`);
        
        for (const d of s.docs) {
            const reg = d.data();
            const type = reg.device_type;
            let name = "Unknown";
            if (type) {
                const metaDoc = await db.collection(type.toLowerCase()).doc(d.id).get();
                if (metaDoc.exists) {
                    const m = metaDoc.data();
                    name = m.device_name || m.label || m.name || "Unknown";
                }
            }
            console.log(`- [${d.id}] Type: ${type} | DeviceID: ${reg.device_id} | DisplayName: ${name} | Visible: ${reg.isVisibleToCustomer}`);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

audit();
