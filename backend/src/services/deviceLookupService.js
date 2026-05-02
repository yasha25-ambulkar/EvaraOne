const resolveDevice = require('../utils/resolveDevice');

/**
 * Wraps resolveDevice to return a plain data object with 'id' field,
 * matching the expected behavior of getNodeDetails.
 */
async function getNodeDetails(id) {
    const doc = await resolveDevice(id);
    if (!doc) return null;
    return { id: doc.id, ...doc.data() };
}

module.exports = { getNodeDetails };
