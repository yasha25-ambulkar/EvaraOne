const router = require("express").Router();
const {
    getEvaraTDS,
    getEvaraTDSById,
    createEvaraTDS,
    updateEvaraTDS,
    deleteEvaraTDS
} = require("../controllers/evaratds.controller.js");

const validateRequest = require("../middleware/validateRequest.js");
const { createNodeSchema, updateNodeSchema } = require("../schemas/index.schema.js");
const auditLog = require("../middleware/audit.middleware.js");

router.get("/", auditLog("VIEW_TDS_DEVICES"), getEvaraTDS);
router.get("/:id", auditLog("VIEW_TDS_DEVICE"), getEvaraTDSById);
router.post("/", validateRequest(createNodeSchema), auditLog("CREATE_TDS_DEVICE"), createEvaraTDS);
router.put("/:id", validateRequest(updateNodeSchema), auditLog("UPDATE_TDS_DEVICE"), updateEvaraTDS);
router.delete("/:id", auditLog("DELETE_TDS_DEVICE"), deleteEvaraTDS);

module.exports = router;
