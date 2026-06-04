const logger = require("../utils/logger.js");
const { db } = require("../config/firebase.js");
const { createNode, updateNode, deleteNode } = require("./admin.controller.js");
const resolveDevice = require("../utils/resolveDevice.js");

/**
 * GET /api/v1/evaratds
 * Get all EvaraTDS devices
 */

exports.getEvaraTDS = async (req, res) => {
  try {
    let query = db.collection("devices");

    if (req.user.role !== "superadmin") {
      query = query
        .where("customer_id", "==", req.user.customer_id || req.user.uid)
        .where("isVisibleToCustomer", "==", true);
    }

    const snapshot = await query.limit(200).get();
    const devices = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((device) => {
        const type = String(device.device_type || "").toLowerCase();
        return type === "evaratds" || type === "tds";
      });

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
    const deviceDoc = req.deviceDoc || (await resolveDevice(req.params.id));
    if (!deviceDoc || !deviceDoc.exists) {
      return res.status(404).json({ error: "Device not found" });
    }

    const device = { id: deviceDoc.id, ...deviceDoc.data() };
    const metadataDoc = await db.collection("evaratds").doc(deviceDoc.id).get();
    const metadata = metadataDoc.exists ? metadataDoc.data() : {};

    res.status(200).json({
      ...device,
      ...metadata,
      id: deviceDoc.id,
    });
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
