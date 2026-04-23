/**
 * Single Source of Truth for executing geometric tank calculations from raw sensor data.
 * This completely enforces mathematical consistency across the backend.
 * 
 * @param {number} distanceCm - Raw sensor distance reading (e.g. from ThingSpeak field)
 * @param {object} dimensions - Configuration of tank dimensions
 * @param {number} dimensions.depthM - Total physical depth of the tank in meters
 * @param {number} dimensions.deadBandM - Physical deadband at top in meters
 * @returns {object} Calculated telemetry containing precise geometry
 */
function computeTankMetrics(distanceCm, dimensions) {
    if (distanceCm === null || distanceCm === undefined || isNaN(distanceCm)) {
        return {
            waterHeightCm: 0,
            percentage: 0
        };
    }

    const { depthM = 1.2, deadBandM = 0 } = dimensions;
    const distanceM = parseFloat(distanceCm) / 100;
    
    const usableHeightM = Math.max(0, depthM - deadBandM);
    // Distance reading is measured from top-down
    const waterHeightM = Math.min(usableHeightM, Math.max(0, depthM - distanceM));
    
    // Percentage relative to full internal depth
    const percentage = depthM > 0 ? (waterHeightM / depthM) * 100 : 0;
    
    return {
        waterHeightCm: waterHeightM * 100,
        percentage: Math.max(0, Math.min(100, percentage))
    };
}

module.exports = { computeTankMetrics };
