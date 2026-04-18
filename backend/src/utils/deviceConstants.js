/**
 * Device Constants - Centralized device-related constants
 * Ensures consistency across all controllers and services
 */

module.exports = {
  // Device Status Enums (returned to frontend)
  DEVICE_STATUS: {
    ONLINE: "Online",
    OFFLINE: "Offline",
    OFFLINE_RECENT: "OfflineRecent",
    UNKNOWN: "Unknown"
  },

  // Status checking threshold - same for all device types
  // If last seen is older than this, device is considered offline
  STATUS_THRESHOLD_MS: 30 * 60 * 1000, // 30 minutes

  // Device Types
  DEVICE_TYPES: {
    TANK: "evaratank",
    FLOW: "evaraflow",
    DEEP: "evarades",
    TDS: "evaratds"
  },

  // Category names for frontend
  DEVICE_CATEGORIES: {
    TANK: "tank",
    FLOW: "flow",
    DEEP: "deepwell",
    TDS: "tds"
  }
};
