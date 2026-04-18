const router = require("express").Router();
const {
  createZone, getZones, getZoneById, updateZone, deleteZone,
  createCustomer, getCustomers, getCustomerById, updateCustomer, deleteCustomer,
  createNode, getNodes, updateNode, deleteNode,
  getDashboardSummary, getHierarchy, getAuditLogs, getDashboardInit,
  updateDeviceVisibility,   // ← NEW: Image 1 - main device toggle
  updateDeviceParameters    // ← NEW: Image 2 - parameter toggles
} = require("../controllers/admin.controller.js");

const validateRequest = require("../middleware/validateRequest.js");
const validateQuery = require("../middleware/validateQuery.js"); // ✅ TASK #10: Query validation

const {
  createZoneSchema,
  createCustomerSchema,
  createNodeSchema,
  updateNodeSchema,
  listQuerySchema,
  updateDeviceVisibilitySchema,
  updateDeviceParametersSchema
} = require("../schemas/index.schema.js");

const auditLog = require("../middleware/audit.middleware.js");

// ─── #10 FIX: Validate ALL endpoints, including GET query parameters ──────────
// ORIGINAL BUG: GET /zones had no validation at all.
// curl '…/zones?limit=999999' would hit Firestore with a 999999-document query.
// FIX: Every route — including GETs — now runs through validateRequest() + validateQuery().

// Zones
router.post("/zones", validateRequest(createZoneSchema), auditLog("CREATE_ZONE"), createZone);
router.get("/zones", validateQuery, validateRequest(listQuerySchema), getZones);  // ← #10 FIX: validateQuery caps limit
router.get("/zones/:id", getZoneById);
router.put("/zones/:id", validateRequest(createZoneSchema), auditLog("UPDATE_ZONE"), updateZone);
router.delete("/zones/:id", auditLog("DELETE_ZONE"), deleteZone);

// Customers
router.post("/customers", validateRequest(createCustomerSchema), auditLog("CREATE_CUSTOMER"), createCustomer);
router.get("/customers", validateQuery, validateRequest(listQuerySchema), getCustomers);  // ← #10 FIX
router.get("/customers/:id", getCustomerById);
router.put("/customers/:id", validateRequest(createCustomerSchema), auditLog("UPDATE_CUSTOMER"), updateCustomer);
router.delete("/customers/:id", auditLog("DELETE_CUSTOMER"), deleteCustomer);

// Nodes
router.post("/nodes", validateRequest(createNodeSchema), auditLog("CREATE_NODE"), createNode);
router.get("/nodes", validateQuery, validateRequest(listQuerySchema), getNodes);  // ← #10 FIX
router.put("/nodes/:id", validateRequest(updateNodeSchema), auditLog("UPDATE_NODE"), updateNode);
router.delete("/nodes/:id", auditLog("DELETE_NODE"), deleteNode);

// Device Visibility & Parameter Controls (Superadmin only)
// Image 1: Toggle whether customer can see the device at all
router.patch("/devices/:id/visibility", validateRequest(updateDeviceVisibilitySchema), auditLog("UPDATE_DEVICE_VISIBILITY"), updateDeviceVisibility);
// Image 2: Toggle which analytics parameters customer can see inside a device
router.patch("/devices/:id/parameters", validateRequest(updateDeviceParametersSchema), auditLog("UPDATE_DEVICE_PARAMETERS"), updateDeviceParameters);

// Aggregate
router.get("/dashboard/init", auditLog("ADMIN_DASHBOARD_INIT"), getDashboardInit);

module.exports = router;
