const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const authController = require("../controllers/auth.controller.js");
const authLimiter = require("../middleware/authLimiter.js");
const { db } = require("../config/firebase.js");

const router = express.Router();

/**
 * POST /api/v1/auth/verify-token
 * Verify Firebase ID token and return user profile with correct role
 * Used during initial login
 * Public endpoint - no auth required
 * ✅ TASK #8: Protected with 5 attempts / 15 min rate limit
 */
router.post("/verify-token", authLimiter, authController.verifyToken);

/**
 * GET /api/v1/auth/me
 * Get current authenticated user's profile with correct role
 * Protected endpoint - requires valid token
 */
router.get("/me", requireAuth, authController.getUserProfile);

router.get("/debug-uid", requireAuth, async (req, res) => {
  const uid = req.user?.uid;
  const email = req.user?.email;

  try {
    const testRead = await db.collection("superadmins").limit(1).get();
    const superadminCount = testRead.size;

    const superadminDoc = await db.collection("superadmins").doc(uid).get();
    const customerDoc = await db.collection("customers").doc(uid).get();

    const allSuperadmins = await db.collection("superadmins").limit(3).get();
    const superadminIds = allSuperadmins.docs.map((d) => d.id);

    return res.json({
      uid,
      email,
      firestore_reachable: true,
      superadmin_collection_count: superadminCount,
      uid_in_superadmins: superadminDoc.exists,
      uid_in_customers: customerDoc.exists,
      first_3_superadmin_ids: superadminIds,
    });
  } catch (err) {
    return res.json({
      uid,
      email,
      firestore_reachable: false,
      error: err.message,
      error_code: err.code,
    });
  }
});

module.exports = router;
