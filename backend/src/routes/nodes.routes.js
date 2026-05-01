const router = require("express").Router();
const { getNodes, getNodeById, getNodeTelemetry, getNodeAnalytics, getNodeGraphData, getNodeGraphDataHybrid } = require("../controllers/nodes.controller.js");
const auditLog = require("../middleware/audit.middleware.js");
const { requireAuth } = require("../middleware/auth.middleware.js");

router.get("/", requireAuth, getNodes);
router.get("/:id", requireAuth, auditLog("VIEW_DEVICE_DETAILS"), getNodeById);
router.get("/:id/telemetry", requireAuth, getNodeTelemetry);
router.get("/:id/analytics", requireAuth, getNodeAnalytics);
router.get("/:id/graph", requireAuth, getNodeGraphData);
// ✅ NEW: Hybrid graph endpoint for 1W, 1M, 3M, custom ranges
router.get("/:id/graph-hybrid", requireAuth, getNodeGraphDataHybrid);

module.exports = router;
