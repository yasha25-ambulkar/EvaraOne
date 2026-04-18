/**
 * ✅ AUDIT FIX L2: Shared Device Resolution Utility
 * 
 * Resolves a device by document ID, device_id (hardware ID), or node_id.
 * Previously duplicated in admin.controller.js, nodes.controller.js, and tds.controller.js.
 * Now single source of truth.
 * 
 * @param {string} id - Document ID, device_id, or node_id
 * @returns {DocumentSnapshot|null} Firestore document snapshot or null
 */

const { db } = require("../config/firebase.js");

async function resolveDevice(id) {
    if (!id) return null;

    console.log(`[resolveDevice] Looking for device: "${id}"`);

    // 1. Try direct document lookup (fastest — indexed by default)
    console.log(`[resolveDevice] Attempt 1: Direct doc lookup`);
    const directDoc = await db.collection("devices").doc(id).get();
    if (directDoc.exists) {
        console.log(`[resolveDevice] ✅ Found by direct ID`);
        return directDoc;
    }
    console.log(`[resolveDevice] ❌ Not found by direct ID`);

    // 2. Query by device_id field (human-readable hardware ID)
    console.log(`[resolveDevice] Attempt 2: Query by device_id field`);
    const q1 = await db.collection("devices").where("device_id", "==", id).limit(1).get();
    if (!q1.empty) {
        console.log(`[resolveDevice] ✅ Found by device_id: ${q1.docs[0].id}`);
        return q1.docs[0];
    }
    console.log(`[resolveDevice] ❌ Not found by device_id`);

    // 3. Fallback to node_id
    console.log(`[resolveDevice] Attempt 3: Query by node_id field`);
    const q2 = await db.collection("devices").where("node_id", "==", id).limit(1).get();
    if (!q2.empty) {
        console.log(`[resolveDevice] ✅ Found by node_id: ${q2.docs[0].id}`);
        return q2.docs[0];
    }
    console.log(`[resolveDevice] ❌ Not found by node_id`);

    console.log(`[resolveDevice] ❌ DEVICE NOT FOUND: "${id}"`);
    return null;
}

module.exports = resolveDevice;
