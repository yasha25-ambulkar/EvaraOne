/**
 * TDS Device Routes
 * Endpoints for provisioning, querying, and managing TDS water quality sensors
 */

const express = require("express");
const router = express.Router({ mergeParams: true });
const { requireAuth } = require("../middleware/auth.middleware.js");
const validateRequest = require("../middleware/validateRequest.js");
const tdsController = require("../controllers/tds.controller.js");
const { createTDSDeviceSchema, updateTDSDeviceSchema, getTDSDeviceSchema } = require("../schemas/tds.schema.js");

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/v1/devices/tds/:id/telemetry
 * Get latest TDS reading and water quality status
 */
router.get("/:id/telemetry", tdsController.getTDSTelemetry);

/**
 * GET /api/v1/devices/tds/:id/history
 * Get historical TDS readings
 * Query params: hours=24, limit=288
 */
router.get("/:id/history", tdsController.getTDSHistory);

/**
 * GET /api/v1/devices/tds/:id/config
 * Get TDS device configuration
 */
router.get("/:id/config", tdsController.getTDSConfig);

/**
 * PUT /api/v1/devices/tds/:id/config
 * Update TDS device configuration
 */
router.put("/:id/config", validateRequest(updateTDSDeviceSchema), tdsController.updateTDSConfig);

/**
 * GET /api/v1/devices/tds/:id/analytics
 * Get TDS analytics summary (avg, min, max)
 * Query params: hours=24
 */
router.get("/:id/analytics", tdsController.getTDSAnalytics);

module.exports = router;
