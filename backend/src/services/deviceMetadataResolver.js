/**
 * deviceMetadataResolver.js
 *
 * Single interface for resolving device metadata across all device types.
 * Replaces device-specific resolution logic spread across controllers.
 *
 * Usage:
 *   const metadata = await resolveDeviceMetadata(deviceId, deviceType);
 */

'use strict';

const { db } = require('../config/firebase');
const { getDeviceConfig } = require('../constants/deviceConstants');
const logger = require('../utils/logger');

/**
 * Resolution path function type
 * @typedef {Function} ResolutionPath
 * @returns {Promise<Object|null>} metadata or null if not found
 */

/**
 * Resolve device metadata from Firestore using device-type-specific strategies
 *
 * @param {string} docId - Firestore document ID from 'devices' collection
 * @param {string} deviceType - Device type (e.g., 'EvaraTank', 'EvaraFlow')
 * @param {Object} [registryData] - Optional registry data for hardware ID lookups
 * @returns {Promise<Object>} Resolved metadata with fallback fields
 */
async function resolveDeviceMetadata(docId, deviceType, registryData = null) {
  if (!docId || !deviceType) {
    throw new Error('docId and deviceType are required');
  }

  const typedCollection = deviceType.toLowerCase();
  
  // 1. Prepare search values
  // We try: 1. docId, 2. registry.device_id, 3. registry.node_id
  const searchValues = new Set();
  searchValues.add(docId);
  
  if (registryData) {
    if (registryData.device_id) searchValues.add(registryData.device_id);
    if (registryData.node_id) searchValues.add(registryData.node_id);
    if (registryData.hardware_id) searchValues.add(registryData.hardware_id);
  }

  // 2. Try resolution paths in priority order
  const paths = getResolutionPaths(deviceType);
  
  for (const val of searchValues) {
    for (const resolutionPath of paths) {
      const pathName = resolutionPath.displayName || resolutionPath.name || 'unknownPath';
      try {
        const metadata = await resolutionPath(val, typedCollection);
        if (metadata) {
          logger.debug(
            `[deviceMetadataResolver] Resolved ${docId} via ${pathName} using value "${val}"`,
            { docId, deviceType, val }
          );
          return { ...metadata, resolvedVia: pathName, resolvedValue: val };
        }
      } catch (err) {
        logger.warn(
          `[deviceMetadataResolver] Resolution path failed: ${pathName}`,
          { docId, deviceType, error: err.message }
        );
      }
    }
    
    // Also try lowercase if it's a string and different
    if (typeof val === 'string' && val !== val.toLowerCase()) {
      const lowerVal = val.toLowerCase();
      for (const resolutionPath of paths) {
        const pathName = resolutionPath.displayName || resolutionPath.name || 'unknownPath';
        try {
          const metadata = await resolutionPath(lowerVal, typedCollection);
          if (metadata) {
            return { ...metadata, resolvedVia: pathName, resolvedValue: lowerVal };
          }
        } catch (err) {}
      }
    }
  }

  // If all paths fail, return minimal metadata
  logger.warn(
    `[deviceMetadataResolver] Could not resolve metadata, returning minimal`,
    { docId, deviceType }
  );

  return {
    deviceId: docId,
    deviceType,
    resolvedAt: new Date().toISOString(),
    isPartial: true,
  };
}

/**
 * Enrich device data with resolved metadata
 *
 * @param {Object} device - Base device document
 * @param {Object} metadata - Resolved metadata
 * @returns {Object} Enriched device data
 */
function enrichDeviceData(device, metadata) {
  return {
    ...device,
    ...metadata,
    resolvedAt: new Date().toISOString(),
    isEnriched: true,
  };
}

/**
 * Validate that all required fields are present
 *
 * @param {Object} metadata - Metadata to validate
 * @param {string} deviceType - Device type for validation rules
 * @throws {Error} If required fields are missing
 */
function validateMetadata(metadata, deviceType) {
  const config = getDeviceConfig(deviceType);
  const requiredFields = config.requiredFields || [];

  for (const field of requiredFields) {
    if (!metadata[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  return true;
}

/**
 * Get resolution paths for device type
 * Paths are functions that attempt to find metadata with different strategies
 *
 * @param {string} deviceType - Device type
 * @returns {ResolutionPath[]} Array of resolution functions
 */
function getResolutionPaths(deviceType) {
  const typedCollection = deviceType.toLowerCase();

  return [
    // Path 1: Direct document lookup by ID
    createDirectLookupPath(typedCollection),

    // Path 2: Find by device_id field
    createFieldLookupPath(typedCollection, 'device_id'),

    // Path 3: Find by node_id field (backward compat)
    createFieldLookupPath(typedCollection, 'node_id'),

    // Path 4: Find by hardware_id field
    createFieldLookupPath(typedCollection, 'hardware_id'),
  ];
}

/**
 * Create a direct document lookup resolution path
 */
function createDirectLookupPath(typedCollection) {
  const fn = async (deviceId, collection) => {
    const doc = await db.collection(collection).doc(deviceId).get();
    return doc.exists ? doc.data() : null;
  };
  fn.displayName = `directLookup:${typedCollection}`;
  return fn;
}

/**
 * Create a field-based query resolution path
 */
function createFieldLookupPath(typedCollection, fieldName) {
  const fn = async (deviceId, collection) => {
    const query = await db
      .collection(collection)
      .where(fieldName, '==', deviceId)
      .limit(1)
      .get();

    if (query.docs.length > 0) {
      return query.docs[0].data();
    }
    return null;
  };
  fn.displayName = `fieldLookup:${typedCollection}:${fieldName}`;
  return fn;
}

/**
 * Batch resolve metadata for multiple devices
 * More efficient than calling resolveDeviceMetadata multiple times
 *
 * @param {Array<{id: string, type: string}>} devices - Devices to resolve
 * @returns {Promise<Object>} Map of deviceId → metadata
 */
async function resolveDeviceMetadataBatch(devices) {
  const results = {};

  try {
    // Group by device type for efficient queries
    const byType = {};
    for (const device of devices) {
      if (!byType[device.type]) {
        byType[device.type] = [];
      }
      byType[device.type].push(device.id);
    }

    // Fetch all metadata at once per type
    for (const [deviceType, deviceIds] of Object.entries(byType)) {
      const collection = deviceType.toLowerCase();
      const refs = deviceIds.map(id => db.collection(collection).doc(id));

      const docs = await db.getAll(...refs);

      for (let i = 0; i < deviceIds.length; i++) {
        const deviceId = deviceIds[i];
        results[deviceId] = docs[i].exists ? docs[i].data() : null;
      }
    }
  } catch (err) {
    logger.error(
      '[deviceMetadataResolver] Batch resolution failed',
      { error: err.message, deviceCount: devices.length }
    );
  }

  return results;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  resolveDeviceMetadata,
  enrichDeviceData,
  validateMetadata,
  resolveDeviceMetadataBatch,
};
