/**
 * tankMath.js
 *
 * Pure calculation functions for EvaraTank.
 * No I/O, no side effects — just math.
 *
 * All inputs in cm, all volumes in litres.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// 1. Total Capacity
// ─────────────────────────────────────────────────────────────
/**
 * Total tank capacity in litres.
 * Formula: (H × L × B) / 1000  [cm³ → litres]
 */
function computeCapacity(heightCm, lengthCm, breadthCm) {
  return (heightCm * lengthCm * breadthCm) / 1000;
}

// ─────────────────────────────────────────────────────────────
// 2. Water Level
// ─────────────────────────────────────────────────────────────
/**
 * How high the water is from the bottom of the tank.
 * Formula: H - distance  (clamped 0 → H)
 */
function computeWaterLevel(heightCm, distanceCm) {
  return Math.max(0, Math.min(heightCm, heightCm - distanceCm));
}

// ─────────────────────────────────────────────────────────────
// 3. Current Volume
// ─────────────────────────────────────────────────────────────
/**
 * Current water volume in litres.
 * Formula: (waterLevelCm × L × B) / 1000
 */
function computeVolume(waterLevelCm, lengthCm, breadthCm) {
  return Math.max(0, (waterLevelCm * lengthCm * breadthCm) / 1000);
}

// ─────────────────────────────────────────────────────────────
// 4. Fill Percentage
// ─────────────────────────────────────────────────────────────
/**
 * Fill % = (waterLevelCm / H) × 100
 */
function computePercentage(waterLevelCm, heightCm) {
  if (heightCm <= 0) return 0;
  return Math.max(0, Math.min(100, (waterLevelCm / heightCm) * 100));
}

// ─────────────────────────────────────────────────────────────
// 5. Consumption / Fill Rate
// ─────────────────────────────────────────────────────────────
/**
 * Rate in L/min between two readings.
 *
 * Returns:
 *   positive → consuming (volume dropping)
 *   negative → refilling (volume rising)
 *   0        → stable
 *
 * @param {number} prevVolume   - previous volume in litres
 * @param {number} currVolume   - current volume in litres
 * @param {number} deltaMinutes - time between readings in minutes
 */
function computeRate(prevVolume, currVolume, deltaMinutes) {
  if (!deltaMinutes || deltaMinutes <= 0) return 0;
  const rate = (prevVolume - currVolume) / deltaMinutes;
  return Math.round(rate * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// 6. Water State
// ─────────────────────────────────────────────────────────────
/**
 * Classify state based on rate.
 * Matches frontend WaterState type exactly:
 *   'CONSUMPTION' | 'REFILL' | 'STABLE'
 *
 * Dead band: ±0.1 L/min to avoid flickering.
 */
function computeWaterState(rateLpm) {
  if (rateLpm > 0.1)  return 'CONSUMPTION';
  if (rateLpm < -0.1) return 'REFILL';
  return 'STABLE';
}

// ─────────────────────────────────────────────────────────────
// 7. Time Estimates
// ─────────────────────────────────────────────────────────────
/**
 * Estimated minutes until tank is empty.
 * Only valid when consuming (drainRateLpm > 0).
 */
function computeTimeToEmpty(currentVolume, drainRateLpm) {
  if (!drainRateLpm || drainRateLpm <= 0) return null;
  return Math.min(99999, Math.round(currentVolume / drainRateLpm));
}

/**
 * Estimated minutes until tank is full.
 * Only valid when refilling (fillRateLpm > 0).
 */
function computeTimeToFull(currentVolume, totalCapacity, fillRateLpm) {
  if (!fillRateLpm || fillRateLpm <= 0) return null;
  const remaining = totalCapacity - currentVolume;
  if (remaining <= 0) return 0;
  return Math.min(99999, Math.round(remaining / fillRateLpm));
}

// ─────────────────────────────────────────────────────────────
// 8. Daily Consumption
// ─────────────────────────────────────────────────────────────
/**
 * Total water consumed since midnight.
 * Only counts drops — ignores refill periods.
 * Never negative.
 *
 * @param {number} midnightVolume - volume at midnight (litres)
 * @param {number} currentVolume  - current volume (litres)
 */
function computeDailyConsumption(midnightVolume, currentVolume) {
  return Math.max(0, Math.round(midnightVolume - currentVolume));
}

// ─────────────────────────────────────────────────────────────
// 9. Spike Removal (only pre-processing)
// ─────────────────────────────────────────────────────────────
/**
 * Removes sensor spikes from raw distance readings.
 *
 * Rule: if a reading differs from the previous by more than
 * SPIKE_THRESHOLD_CM, discard it and substitute the previous value.
 *
 * @param {Array<{distanceCm: number, timestampMs: number}>} readings
 * @returns {Array<{distanceCm: number, timestampMs: number}>}
 */
const SPIKE_THRESHOLD_CM = 15;

function removeSpikes(readings) {
  if (!readings || readings.length === 0) return [];

  const cleaned = [readings[0]];

  for (let i = 1; i < readings.length; i++) {
    const prev  = cleaned[cleaned.length - 1];
    const curr  = readings[i];
    const delta = Math.abs(curr.distanceCm - prev.distanceCm);

    if (delta > SPIKE_THRESHOLD_CM) {
      // Spike — keep timestamp but substitute previous clean value
      cleaned.push({ distanceCm: prev.distanceCm, timestampMs: curr.timestampMs });
    } else {
      cleaned.push(curr);
    }
  }

  return cleaned;
}

// ─────────────────────────────────────────────────────────────
// 10. All-in-one: full metrics from one distance reading
// ─────────────────────────────────────────────────────────────
/**
 * @param {number} distanceCm  - clean sensor reading in cm
 * @param {object} dims        - { heightCm, lengthCm, breadthCm }
 */
function computeAllMetrics(distanceCm, dims) {
  const { heightCm, lengthCm, breadthCm } = dims;
  const totalCapacityLitres = computeCapacity(heightCm, lengthCm, breadthCm);
  const waterLevelCm        = computeWaterLevel(heightCm, distanceCm);
  const volumeLitres        = computeVolume(waterLevelCm, lengthCm, breadthCm);
  const percentage          = computePercentage(waterLevelCm, heightCm);

  return {
    waterLevelCm:        Math.round(waterLevelCm * 100) / 100,
    percentage:          Math.round(percentage   * 100) / 100,
    volumeLitres:        Math.round(volumeLitres),
    totalCapacityLitres: Math.round(totalCapacityLitres),
  };
}

module.exports = {
  computeCapacity,
  computeWaterLevel,
  computeVolume,
  computePercentage,
  computeRate,
  computeWaterState,
  computeTimeToEmpty,
  computeTimeToFull,
  computeDailyConsumption,
  removeSpikes,
  computeAllMetrics,
  SPIKE_THRESHOLD_CM,
};
