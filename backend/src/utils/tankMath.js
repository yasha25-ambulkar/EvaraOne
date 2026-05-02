/**
 * Single Source of Truth for executing geometric tank calculations from raw sensor data.
 * This completely enforces mathematical consistency across the backend.
 * 
 * @param {number} distanceCm - Raw sensor distance reading (e.g. from ThingSpeak field)
 * @param {object} dimensions - Configuration of tank dimensions
 * @param {number} dimensions.heightCm - Total physical depth of the tank in centimeters
 * @returns {object} Calculated telemetry containing precise geometry
 */
function computeTankMetrics(distanceCm, dimensions) {
    if (distanceCm === null || distanceCm === undefined || isNaN(distanceCm)) {
        return {
            waterHeightCm: 0,
            percentage: 0
        };
    }

    const { heightCm = 210.82 } = dimensions;
    const distCm = parseFloat(distanceCm);
    
    // The formula: waterHeightCm = heightCm - distanceCm (clamped 0 to heightCm)
    const waterHeightCm = Math.max(0, Math.min(heightCm, heightCm - distCm));
    
    // percentage = (waterHeightCm / heightCm) * 100
    const percentage = heightCm > 0 ? (waterHeightCm / heightCm) * 100 : 0;
    
    return {
        waterHeightCm: waterHeightCm,
        percentage: Math.max(0, Math.min(100, percentage))
    };
}

module.exports = { computeTankMetrics };
