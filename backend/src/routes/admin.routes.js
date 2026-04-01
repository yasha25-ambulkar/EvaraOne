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
const {
  createZoneSchema,
  createCustomerSchema,
  createNodeSchema,
  updateNodeSchema
} = require("../schemas/index.schema.js");

const auditLog = require("../middleware/audit.middleware.js");

// Zones
router.post("/zones", validateRequest(createZoneSchema), auditLog("CREATE_ZONE"), createZone);
router.get("/zones", getZones);
router.get("/zones/:id", getZoneById);
router.put("/zones/:id", validateRequest(createZoneSchema), auditLog("UPDATE_ZONE"), updateZone);
router.delete("/zones/:id", auditLog("DELETE_ZONE"), deleteZone);

// Customers
router.post("/customers", validateRequest(createCustomerSchema), auditLog("CREATE_CUSTOMER"), createCustomer);
router.get("/customers", getCustomers);
router.get("/customers/:id", getCustomerById);
router.put("/customers/:id", validateRequest(createCustomerSchema), auditLog("UPDATE_CUSTOMER"), updateCustomer);
router.delete("/customers/:id", auditLog("DELETE_CUSTOMER"), deleteCustomer);

// Nodes
router.post("/nodes", validateRequest(createNodeSchema), auditLog("CREATE_NODE"), createNode);
router.get("/nodes", getNodes);
router.put("/nodes/:id", validateRequest(updateNodeSchema), auditLog("UPDATE_NODE"), updateNode);
router.delete("/nodes/:id", auditLog("DELETE_NODE"), deleteNode);

// Device Visibility & Parameter Controls (Superadmin only)
// Image 1: Toggle whether customer can see the device at all
router.patch("/devices/:id/visibility", auditLog("UPDATE_DEVICE_VISIBILITY"), updateDeviceVisibility);
// Image 2: Toggle which analytics parameters customer can see inside a device
router.patch("/devices/:id/parameters", auditLog("UPDATE_DEVICE_PARAMETERS"), updateDeviceParameters);

// Aggregate
router.get("/dashboard/init", auditLog("ADMIN_DASHBOARD_INIT"), getDashboardInit);

module.exports = router;
