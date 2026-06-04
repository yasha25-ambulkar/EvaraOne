const resolveDevice = require("../utils/resolveDevice.js");
const { checkDeviceVisibilityWithAudit } = require("../utils/checkDeviceVisibility.js");

function hasDeviceAccess(user, registry) {
  if (!user || !registry) return false;
  if (user.role === "superadmin") return true;

  const ownerCustomerId = registry.customer_id || registry.customerId || registry.customerID || null;
  const ownerCommunityId = registry.community_id || registry.communityId || null;
  const userCustomerId = user.customer_id || user.uid || null;
  const userCommunityId = user.community_id || null;

  if (ownerCustomerId && userCustomerId && String(ownerCustomerId) === String(userCustomerId)) {
    return true;
  }

  if (
    userCommunityId &&
    (String(ownerCustomerId || "") === String(userCommunityId) ||
      String(ownerCommunityId || "") === String(userCommunityId))
  ) {
    return true;
  }

  return false;
}

async function authorizeDeviceAccess(req, res, next) {
  try {
    const deviceDoc = await resolveDevice(req.params.id);
    if (!deviceDoc) {
      return res.status(404).json({ error: "Device not found" });
    }

    const registry = { id: deviceDoc.id, ...deviceDoc.data() };

    if (!hasDeviceAccess(req.user, registry)) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!checkDeviceVisibilityWithAudit(registry, deviceDoc.id, req.user?.uid, req.user?.role)) {
      return res.status(403).json({ error: "Device not visible to your account" });
    }

    req.deviceDoc = deviceDoc;
    req.device = registry;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authorizeDeviceAccess, hasDeviceAccess };
