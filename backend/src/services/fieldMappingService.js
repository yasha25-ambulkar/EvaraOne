/**
 * fieldMappingService.js
 *
 * Centralized field mapping resolution for all device types.
 * Maps logical field names (water_level, temperature) to actual field locations.
 *
 * Handles:
 *  - Device-specific sensor field mappings
 *  - ThingSpeak field mappings
 *  - Field name aliases and fallbacks
 *  - Consistent field extraction across device types
 */

'use strict';

const { getDeviceConfig, getThingspeakFieldMapping } = require('../constants/deviceConstants');
const logger = require('../utils/logger');

/**
 * Resolve a logical field name to its actual location in device data
 *
 * Priority order:
 * 1. Custom sensor field mapping (device-specific config)
 * 2. Device-type field mapping (from constants)
 * 3. Default field name (direct match)
 *
 * @param {Object} device - Firestore device document
 * @param {string} logicalFieldName - Logical name (e.g., 'water_level', 'temperature')
 * @returns {string|null} Actual field name or null if not found
 */
function resolveFieldMapping(device, logicalFieldName) {
  // Priority 1: Check custom sensor field mapping (most specific)
  if (device.sensor_field_mapping && device.sensor_field_mapping[logicalFieldName]) {
    const mappedName = device.sensor_field_mapping[logicalFieldName];
    logger.debug(
      `[fieldMappingService] Resolved field via custom mapping`,
      { logical: logicalFieldName, actual: mappedName }
    );
    return mappedName;
  }

  // Priority 2: Check device-type config
  try {
    const config = getDeviceConfig(device.asset_type || device.deviceType);
    if (config.fieldMappings && config.fieldMappings[logicalFieldName]) {
      const mappedName = config.fieldMappings[logicalFieldName];
      logger.debug(
        `[fieldMappingService] Resolved field via device config`,
        { logical: logicalFieldName, actual: mappedName, deviceType: device.asset_type }
      );
      return mappedName;
    }
  } catch (err) {
    logger.warn(
      `[fieldMappingService] No device config for type`,
      { deviceType: device.asset_type, error: err.message }
    );
  }

  // Priority 3: Return default field name
  logger.debug(
    `[fieldMappingService] Using default field name`,
    { logical: logicalFieldName }
  );
  return logicalFieldName;
}

/**
 * Map raw ThingSpeak fields to logical field names
 *
 * Takes raw API response and converts field1, field2, etc. to meaningful names
 *
 * @param {Object} rawTelemetry - Raw ThingSpeak API response (e.g., { field1: 45.2, field2: 28.5 })
 * @param {Object} device - Device configuration (knows which fields to map)
 * @returns {Object} Mapped telemetry (e.g., { water_level: 45.2, temperature: 28.5 })
 */
function mapThingspeakFields(rawTelemetry, device) {
  const mapped = {};

  try {
    // Get device-type-specific ThingSpeak field mapping
    const fieldMap = getThingspeakFieldMapping(device.asset_type || device.deviceType);

    // Map each ThingSpeak field to logical name
    for (const [fieldNum, logicalName] of Object.entries(fieldMap)) {
      const fieldKey = `field${fieldNum}`;

      if (rawTelemetry[fieldKey] !== undefined && rawTelemetry[fieldKey] !== null) {
        mapped[logicalName] = rawTelemetry[fieldKey];
      }
    }

    logger.debug(
      `[fieldMappingService] Mapped ThingSpeak fields`,
      { mappedCount: Object.keys(mapped).length, deviceType: device.asset_type }
    );
  } catch (err) {
    logger.warn(
      `[fieldMappingService] ThingSpeak mapping failed`,
      { deviceType: device.asset_type, error: err.message }
    );
  }

  return mapped;
}

/**
 * Get expected fields for a device type
 *
 * @param {string} deviceType - Device type (e.g., 'EvaraTank')
 * @returns {string[]} Array of logical field names
 */
function getExpectedFields(deviceType) {
  try {
    const config = getDeviceConfig(deviceType);
    return config.defaultFields || [];
  } catch (err) {
    logger.warn(
      `[fieldMappingService] No default fields for type`,
      { deviceType, error: err.message }
    );
    return [];
  }
}

/**
 * Check if all expected fields are present
 *
 * @param {Object} data - Data object to check
 * @param {string} deviceType - Device type
 * @returns {boolean} True if all expected fields present
 */
function hasAllExpectedFields(data, deviceType) {
  const expectedFields = getExpectedFields(deviceType);
  return expectedFields.every(field => field in data && data[field] !== undefined);
}

/**
 * Extract and validate fields from device data
 *
 * @param {Object} data - Device telemetry data
 * @param {string[]} requiredFields - Fields that must be present
 * @returns {Object} Extracted fields with validation status
 */
function extractFields(data, requiredFields = []) {
  const extracted = {};
  const missing = [];

  for (const field of requiredFields) {
    if (field in data && data[field] !== undefined) {
      extracted[field] = data[field];
    } else {
      missing.push(field);
    }
  }

  return {
    fields: extracted,
    missing,
    isValid: missing.length === 0,
  };
}

/**
 * Get all field name aliases for a logical field
 *
 * Useful for finding data when field name varies across devices
 *
 * @param {string} logicalFieldName - Logical field name
 * @returns {string[]} Array of possible field name aliases
 */
function getFieldAliases(logicalFieldName) {
  const aliases = {
    water_level: ['water_level', 'level', 'level_percentage', 'Level', 'waterLevel'],
    temperature: ['temperature', 'temp', 'Temperature', 'Temp'],
    ph: ['ph', 'pH', 'ph_value', 'phValue'],
    tds: ['tds', 'TDS', 'tds_value', 'tdsValue'],
    depth: ['depth', 'wellDepth', 'well_depth'],
    flow_rate: ['flow_rate', 'flowRate', 'flow', 'Flow'],
  };

  return aliases[logicalFieldName] || [logicalFieldName];
}

/**
 * Try to find field value using multiple aliases
 *
 * @param {Object} data - Data object
 * @param {string} logicalFieldName - Logical field name
 * @returns {any} Field value or undefined if not found
 */
function getFieldByAliases(data, logicalFieldName) {
  const aliases = getFieldAliases(logicalFieldName);

  for (const alias of aliases) {
    if (alias in data && data[alias] !== undefined) {
      return data[alias];
    }
  }

  return undefined;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  resolveFieldMapping,
  mapThingspeakFields,
  getExpectedFields,
  hasAllExpectedFields,
  extractFields,
  getFieldAliases,
  getFieldByAliases,
};
