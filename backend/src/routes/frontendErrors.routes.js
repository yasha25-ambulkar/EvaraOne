const router = require("express").Router();
const logger = require("../utils/logger.js");
const rateLimit = require("express-rate-limit");
const { requireFirebaseIdentity } = require("../middleware/auth.middleware.js");

const frontendErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/", frontendErrorLimiter, requireFirebaseIdentity, async (req, res) => {
  const payload = {
    userId: req.user?.uid || null,
    email: req.user?.email || null,
    url: req.body?.url || null,
    error_message: req.body?.error_message || "Unknown frontend error",
    stack_trace: req.body?.stack_trace || null,
    user_agent: req.body?.user_agent || null,
    timestamp: new Date().toISOString(),
  };

  logger.error("[FrontendError] Client runtime error reported", null, payload);
  return res.status(202).json({ success: true });
});

module.exports = router;
