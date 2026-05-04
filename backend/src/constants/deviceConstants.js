/**
 * deviceConstants.js
 *
 * Single source of truth for all device type constants, enums, and mappings.
 * Used across the backend to ensure consistency.
 *
 * Replaces scattered device type strings and switch statements.
 */

// ============================================================================
// Device Type Enum
// ============================================================================

const DEVICE_TYPES = {
  TANK: 'EvaraTank',
  FLOW: 'EvaraFlow',
  DEEP: 'EvaraDeep',
  TDS: 'EvaraTDS',
};

// ============================================================================
// Device Status Enum
// ============================================================================

const DEVICE_STATUS = {
  ONLINE: 'ONLINE',
  OFFLINE_RECENT: 'OFFLINE_RECENT',
  OFFLINE: 'OFFLINE',
  UNKNOWN: 'UNKNOWN',
  DECOMMISSIONED: 'DECOMMISSIONED',
  ARCHIVED: 'ARCHIVED',
};

// ============================================================================
// Analytics Template Mapping
// ============================================================================

const ANALYTICS_TEMPLATES = {
  EvaraTank: 'EvaraTank',
  EvaraFlow: 'EvaraFlow',
  EvaraDeep: 'EvaraDeep',
  EvaraTDS: 'EvaraTDS',
};

// ============================================================================
// Device-Specific Configuration
// ============================================================================

const DEVICE_CONFIG = {
  EvaraTank: {
    label: 'Water Tank',
    defaultFields: ['water_level', 'temperature', 'ph', 'tds'],
    thingspeakFields: {
      1: 'water_level',
      2: 'temperature',
      3: 'ph',
      4: 'tds',
    },
    pollingEnabled: true,
    statusThresholdMs: 60 * 60 * 1000, // 60 minutes
    requiredFields: ['thingspeakChannelId', 'thingspeakReadKey'],
  },
  EvaraFlow: {
    label: 'Flow Meter',
    defaultFields: ['flow_rate', 'temperature'],
    thingspeakFields: {
      1: 'flow_rate',
      2: 'temperature',
    },
    pollingEnabled: true,
    statusThresholdMs: 60 * 60 * 1000,
    requiredFields: ['thingspeakChannelId', 'thingspeakReadKey'],
  },
  EvaraDeep: {
    label: 'Deep Well Sensor',
    defaultFields: ['depth', 'ph', 'temperature'],
    thingspeakFields: {
      1: 'depth',
      2: 'ph',
      3: 'temperature',
    },
    pollingEnabled: true,
    statusThresholdMs: 60 * 60 * 1000,
    requiredFields: ['thingspeakChannelId', 'thingspeakReadKey'],
  },
  EvaraTDS: {
    label: 'TDS Meter',
    defaultFields: ['tds_value', 'temperature'],
    thingspeakFields: {
      1: 'tds_value',
      2: 'temperature',
    },
    pollingEnabled: true,
    statusThresholdMs: 60 * 60 * 1000,
    requiredFields: ['thingspeakChannelId', 'thingspeakReadKey'],
  },
};

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if a string is a valid device type
 */
function isValidDeviceType(type) {
  return Object.values(DEVICE_TYPES).includes(type);
}

/**
 * Check if a string is a valid device status
 */
function isValidStatus(status) {
  return Object.values(DEVICE_STATUS).includes(status);
}

/**
 * Get analytics template for device type
 */
function getAnalyticsTemplate(deviceType) {
  if (!ANALYTICS_TEMPLATES[deviceType]) {
    throw new Error(`Unknown device type: ${deviceType}`);
  }
  return ANALYTICS_TEMPLATES[deviceType];
}

/**
 * Get configuration for device type
 */
function getDeviceConfig(deviceType) {
  if (!DEVICE_CONFIG[deviceType]) {
    throw new Error(`No configuration for device type: ${deviceType}`);
  }
  return DEVICE_CONFIG[deviceType];
}

/**
 * Get all supported device types
 */
function getAllDeviceTypes() {
  return Object.values(DEVICE_TYPES);
}

/**
 * Get ThingSpeak field mapping for device type
 */
function getThingspeakFieldMapping(deviceType) {
  const config = DEVICE_CONFIG[deviceType];
  if (!config) {
    throw new Error(`No ThingSpeak mapping for device type: ${deviceType}`);
  }
  return config.thingspeakFields;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Enums
  DEVICE_TYPES,
  DEVICE_STATUS,
  ANALYTICS_TEMPLATES,
  DEVICE_CONFIG,

  // Helpers
  isValidDeviceType,
  isValidStatus,
  getAnalyticsTemplate,
  getDeviceConfig,
  getAllDeviceTypes,
  getThingspeakFieldMapping,
};
