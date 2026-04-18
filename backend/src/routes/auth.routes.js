const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const authController = require("../controllers/auth.controller.js");
const authLimiter = require("../middleware/authLimiter.js"); // ✅ TASK #8: Auth rate limiter

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

module.exports = router;
