/**
 * waterAnalyticsEngine.js
 *
 * This file is now a thin wrapper.
 * All logic has moved to:
 *   - tankMath.js          (pure calculations)
 *   - thingspeakService.js (fetch + spike removal)
 *   - deviceStateService.js (orchestration)
 *
 * Kept here only for backward compatibility if anything still imports it.
 */

'use strict';

const { refreshDeviceState } = require('./deviceStateService');

/**
 * @deprecated Use deviceStateService.refreshDeviceState() directly.
 * Kept for backward compatibility only.
 */
async function analyzeWaterTank(device) {
  return await refreshDeviceState(device);
}

module.exports = { analyzeWaterTank };
