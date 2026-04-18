/**
 * Field Mapping Resolver
 * Consolidates field mapping logic to resolve which field contains which data type
 */

module.exports = {
  /**
   * Resolve a field key from fieldMapping object by searching through target names
   * Handles both direct lookups and reverse lookups
   * 
   * @param {Object} fieldMapping - The field mapping object (e.g., { field1: "water_level_raw_sensor_reading", ... })
   * @param {Array<string>} targetNames - Names to search for (in order of preference)
   * @param {string} fallback - Default field to return if no match found (default: "field1")
   * @returns {string} The resolved field key
   */
  resolveFieldKey(fieldMapping, targetNames = [], fallback = "field1") {
    if (!fieldMapping || typeof fieldMapping !== "object") {
      return fallback;
    }

    const names = Array.isArray(targetNames) ? targetNames : [targetNames];

    // 1. Direct lookup: try each name in fieldMapping as a key
    for (const name of names) {
      if (fieldMapping[name]) {
        return fieldMapping[name];
      }
    }

    // 2. Reverse lookup: find field that maps to any target name
    for (const [field, value] of Object.entries(fieldMapping)) {
      if (names.includes(value)) {
        return field;
      }
    }

    // 3. Fallback
    return fallback;
  },

  /**
   * Resolve a value from field mapping
   * Gets the value that a field maps to
   * 
   * @param {Object} fieldMapping - The field mapping object
   * @param {string} fieldKey - The field key to look up
   * @param {*} fallback - Default value if not found
   * @returns {*} The mapped value
   */
  resolveFieldValue(fieldMapping, fieldKey, fallback = null) {
    if (!fieldMapping || typeof fieldMapping !== "object") {
      return fallback;
    }

    return fieldMapping[fieldKey] ?? fallback;
  },

  /**
   * Get multiple field keys from mapping
   * Useful when device has multiple sensor types
   * 
   * @param {Object} fieldMapping - The field mapping object
   * @param {Object} targetMap - Map of { fieldName: [possible_values] }
   * @returns {Object} Map of resolved fields
   */
  resolveMultipleFields(fieldMapping, targetMap = {}) {
    const result = {};

    for (const [key, targets] of Object.entries(targetMap)) {
      result[key] = this.resolveFieldKey(fieldMapping, targets);
    }

    return result;
  }
};
