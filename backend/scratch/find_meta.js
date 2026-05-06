require('dotenv').config();
const { db } = require('../src/config/firebase');

async function findInMeta() {
    const label = "Bakul Tank ";
    console.log("Searching in evaratank...");
    const snap = await db.collection('evaratank').get();
    for (const doc of snap.docs) {
        const d = doc.data();
        if (d.label === label || d.name === label || doc.id.includes("TNK-003")) {
            console.log(`Found in evaratank: ${doc.id}`);
            console.log(JSON.stringify(d, null, 2));
        }
    }
}

findInMeta().catch(console.error);
