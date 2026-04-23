const { db, admin } = require("../config/firebase.js");
const { Filter } = require("firebase-admin/firestore");
const { createNode, updateNode, deleteNode } = require("./admin.controller.js");

/**
 * GET /api/v1/evaratds
 * Get all EvaraTDS devices
 */

/**
 * Helper to resolve device by document ID OR device_id/node_id
 */
async function resolveDevice(id) {
    if (!id) return null;

    // 1. Try direct document lookup
    const directDoc = await db.collection("devices").doc(id).get();
    if (directDoc.exists) return directDoc;

    // 2. Query by device_id field (human-readable hardware ID)
    const q1 = await db.collection("devices").where("device_id", "==", id).limit(1).get();
    if (!q1.empty) return q1.docs[0];

    // 3. Fallback to node_id
    const q2 = await db.collection("devices").where("node_id", "==", id).limit(1).get();
    if (!q2.empty) return q2.docs[0];

    return null;
}

exports.getEvaraTDS = async (req, res) => {
    try {
        const snapshot = await db.collection("evaratds").get();
        const devices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(devices);
    } catch (error) {
        logger.error("Failed to get EvaraTDS devices:", error);
        res.status(500).json({ error: "Failed to fetch EvaraTDS devices" });
    }
};

/**
 * GET /api/v1/evaratds/:id
 * Get single EvaraTDS device
 */
exports.getEvaraTDSById = async (req, res) => {
    try {
        const { id } = req.params;
        logger.debug("DEBUG TDS lookup id:", id);

        const deviceDoc = await resolveDevice(id);
        if (!deviceDoc || !deviceDoc.exists) {
            logger.debug("DEBUG TDS doc NOT FOUND");
            return res.status(404).json({ error: "Device not found" });
        }

        const docId = deviceDoc.id;
        const doc = await db.collection("evaratds").doc(docId).get();
        logger.debug("DEBUG TDS doc exists:", doc.exists);
        
        if (!doc.exists) return res.status(404).json({ error: "Metadata not found" });
        res.status(200).json({ id: doc.id, ...doc.data() });
    } catch (error) {
        logger.error("TDS Get error:", error);
        res.status(500).json({ error: "Failed to get TDS data" });
    }
};

/**
 * POST /api/v1/evaratds
 * Create new EvaraTDS device
 */
exports.createEvaraTDS = async (req, res) => {
    // Inject EvaraTDS assetType if not present
    req.body.assetType = "EvaraTDS";
    return createNode(req, res);
};

/**
 * PUT /api/v1/evaratds/:id
 * Update EvaraTDS device
 */
exports.updateEvaraTDS = async (req, res) => {
    return updateNode(req, res);
};

/**
 * DELETE /api/v1/evaratds/:id
 * Delete EvaraTDS device
 */
exports.deleteEvaraTDS = async (req, res) => {
    return deleteNode(req, res);
};
