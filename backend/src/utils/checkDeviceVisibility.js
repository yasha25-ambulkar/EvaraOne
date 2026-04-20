/**
 * ✅ CRITICAL FIX: Device Visibility Enforcement Helper
 * 
 * SECURITY PRINCIPLE: Defense in Depth
 * - Application Layer (here): Check visibility after fetching device
 * - Database Layer (Firestore rules): Check visibility before returning
 * - Both must pass — if either fails, deny access
 * 
 * This prevents customers from accessing devices the admin has hidden from them
 * by guessing the device ID or through direct API access.
 * 
 * Usage:
 *   const device = await db.collection("devices").doc(deviceId).get();
 *   if (!checkDeviceVisibility(device.data(), req.user.role)) {
 *     return res.status(403).json({ error: "Device not visible" });
 *   }
 */

const logger = require('./logger');

/**
 * Check if a user can access a device based on visibility settings
 * 
 * @param {object} device - Device document data
 * @param {string} userRole - Current user's role (from req.user.role)
 * @returns {boolean} true if user can access, false otherwise
 * 
 * Rules:
 * - Superadmins can access all devices (bypass visibility)
 * - Non-superadmins can ONLY access visible devices
 * - Null/undefined device data → access denied
 * - Missing isVisibleToCustomer field → default to false (deny)
 */
function checkDeviceVisibility(device, userRole) {
  // Null check
  if (!device) {
    return false;
  }

  // Superadmin bypass (can see all devices)
  if (userRole === 'superadmin') {
    return true;
  }

  // Non-superadmin: device MUST be explicitly visible
  // Default to false if field missing (secure by default)
  const isVisible = device.isVisibleToCustomer === true;
  
  return isVisible;
}

/**
 * Enforce visibility with logging
 * 
 * Similar to checkDeviceVisibility but logs security events
 * Use this function when you want audit trail of access attempts
 * 
 * @param {object} device - Device document data
 * @param {string} deviceId - Device identifier (for logging)
 * @param {string} userId - User attempting access (for audit)
 * @param {string} userRole - Current user's role
 * @returns {boolean} true if user can access
 */
function checkDeviceVisibilityWithAudit(device, deviceId, userId, userRole) {
  if (!checkDeviceVisibility(device, userRole)) {
    // Log security event: customer tried to access hidden device
    logger.warn(
      `[SECURITY] Visibility check failed`,
      {
        category: 'unauthorized_device_access',
        deviceId,
        userId,
        userRole,
        isVisible: device?.isVisibleToCustomer || false,
        timestamp: new Date().toISOString()
      }
    );
    return false;
  }
  
  return true;
}

/**
 * Middleware version — can be used as Express middleware
 * 
 * Usage in routes:
 *   app.get('/devices/:id', requireAuth, enforceDeviceVisibility, getDevice);
 * 
 * This middleware assumes:
 * - req.user is set (from auth middleware)
 * - req.device is set (device data fetched before this middleware)
 */
function enforceDeviceVisibilityMiddleware(req, res, next) {
  if (!req.device) {
    return res.status(500).json({ error: 'Device not found in context' });
  }

  if (!checkDeviceVisibilityWithAudit(
    req.device,
    req.device.id,
    req.user?.uid || 'anonymous',
    req.user?.role || 'guest'
  )) {
    return res.status(403).json({ error: 'Device not visible to your account' });
  }

  next();
}

module.exports = {
  checkDeviceVisibility,
  checkDeviceVisibilityWithAudit,
  enforceDeviceVisibilityMiddleware
};
