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

async function testToggle() {
    const deviceDocId = "s1AmJoDdAFIzMMFYMaZe"; // OBH TANK
    const docRef = db.collection("devices").doc(deviceDocId);

    try {
        console.log("Setting isVisibleToCustomer to FALSE...");
        await docRef.update({ isVisibleToCustomer: false });
        let doc = await docRef.get();
        console.log("New value:", doc.data().isVisibleToCustomer, "Type:", typeof doc.data().isVisibleToCustomer);

        console.log("Setting isVisibleToCustomer back to TRUE...");
        await docRef.update({ isVisibleToCustomer: true });
        doc = await docRef.get();
        console.log("Restored value:", doc.data().isVisibleToCustomer, "Type:", typeof doc.data().isVisibleToCustomer);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testToggle();
