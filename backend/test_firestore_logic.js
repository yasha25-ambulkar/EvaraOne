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
    const cid = "imwyScqd9faqqZ3lOX5XPR0MYsz2";
    try {
        console.log("--- Query: != false ---");
        const s1 = await db.collection("devices")
            .where("customer_id", "==", cid)
            .where("isVisibleToCustomer", "!=", false)
            .get();
        console.log(`Found: ${s1.size}`);
        s1.forEach(d => console.log(`- ${d.id}`));

        console.log("\n--- Manual Check of ALL for CID ---");
        const s2 = await db.collection("devices").where("customer_id", "==", cid).get();
        console.log(`Found: ${s2.size}`);
        s2.forEach(d => {
            const data = d.data();
            console.log(`- ${d.id} | isVisibleToCustomer: ${data.isVisibleToCustomer}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
