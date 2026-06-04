const router = require("express").Router();
const {
  getNodes,
  getNodeById,
  getNodeTelemetry,
  getNodeAnalytics,
  getNodeGraphData,
  getNodeGraphDataHybrid,
} = require("../controllers/nodes.controller.js");
const {
  updateValveCommand,
} = require("../controllers/deviceCommands.controller.js");
const auditLog = require("../middleware/audit.middleware.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const {
  authorizeDeviceAccess,
} = require("../middleware/authorizeDeviceAccess.js");

router.get("/", requireAuth, getNodes);
router.get(
  "/:id",
  requireAuth,
  authorizeDeviceAccess,
  auditLog("VIEW_DEVICE_DETAILS"),
  getNodeById,
);
router.get(
  "/:id/telemetry",
  requireAuth,
  authorizeDeviceAccess,
  getNodeTelemetry,
);
router.get(
  "/:id/analytics",
  requireAuth,
  authorizeDeviceAccess,
  getNodeAnalytics,
);
router.post(
  "/:id/command",
  requireAuth,
  authorizeDeviceAccess,
  auditLog("DEVICE_COMMAND"),
  updateValveCommand,
);
router.get("/:id/graph", requireAuth, authorizeDeviceAccess, getNodeGraphData);
// ✅ NEW: Hybrid graph endpoint for 1W, 1M, 3M, custom ranges
router.get(
  "/:id/graph-hybrid",
  requireAuth,
  authorizeDeviceAccess,
  getNodeGraphDataHybrid,
);

module.exports = router;
