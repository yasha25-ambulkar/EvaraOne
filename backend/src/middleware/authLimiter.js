const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const logger = require('../utils/logger.js');

/**
 * ✅ TASK #8: Strict rate limiter for authentication endpoints
 * 
 * VULNERABILITY: Auth endpoints wide open to brute force
 * CURRENT: 100 requests per minute (4.3k per hour)
 * NEW: 5 attempts per 15 minutes (20 per hour)
 * 
 * This prevents:
 * - Brute force login attempts
 * - Token verification spam
 * - CSRF attacks using scattered requests
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minute window
  max: 5,                      // 5 attempts max
  standardHeaders: true,       // Return RateLimit-* headers
  legacyHeaders: false,        // Disable X-RateLimit-* headers
  message: {
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
    retryAfter: '900'  // 15 minutes in seconds
  },
  // ✅ AUDIT FIX L12/L13: Removed `skip` function
  // req.user is NOT set at rate-limit time (auth middleware runs after this),
  // so the superadmin skip never actually fired. All users rate-limited equally.
  keyGenerator: (req, res) => {
    // Rate-limit by IP + username (if both provided)
    // Use ipKeyGenerator for IPv6 support
    const ipKey = ipKeyGenerator(req, res);
    const username = req.body?.email || 'unknown';
    return `${ipKey}:${username}`;
  },
  handler: (req, res) => {
    logger.warn('[Auth Rate Limit] ❌ Rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
      timestamp: new Date().toISOString()
    });
    res.status(429).json({
      error: 'Too many authentication attempts. Please try again in 15 minutes.'
    });
  }
});

module.exports = authLimiter;
