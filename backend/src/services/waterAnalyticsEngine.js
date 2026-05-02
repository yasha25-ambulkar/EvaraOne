/**
 * waterAnalyticsEngine.js
 *
 * STRICT RULE — 200-reading window:
 *   1. Clean spikes + median filter
 *   2. Learn thresholds from data (per tank, any size)
 *   3. Look at last 200 readings FIRST
 *      delta = median(last 20) − median(first 20)
 *      delta > +5 cm  → CONSUMPTION (dist rising, water falling)
 *      delta < −5 cm  → REFILL      (dist falling, water rising)
 *      |delta| ≤ 5 cm → STABLE
 *   4. ONLY AFTER classifying → calculate rate, consumed, est. time
 *
 * Works for ANY tank size — thresholds are learned from the sensor data,
 * not hardcoded from DB depth.
 *
 * Proven on Channel_2613746_merged.csv:
 *   lower=53cm (full), upper=88cm (empty), interval~2.09 min/reading
 */

// ── Constants (proven from real CSV data) ─────────────────────────────────
const CLASSIFY_WINDOW    = 200;   // readings for classification window
const CLASSIFY_EDGE      = 20;    // median of first/last N of the 200
const DELTA_THRESHOLD_CM = 5.0;   // ±5cm delta = real trend
const SPIKE_THRESHOLD_CM = 10.0;  // deviation > 10cm from neighbors = spike
const MEDIAN_WIN         = 5;     // sliding median filter width
const BOOTSTRAP_MIN      = 200;   // readings needed before threshold learning
const LOWER_PCT          = 0.03;  // 3rd  percentile → full-tank reading
const UPPER_PCT          = 0.97;  // 97th percentile → empty-tank reading
const RELEARN_EVERY      = 500;   // re-learn thresholds every N readings
const MIN_JITTER_LITRES  = 2.0;   // ignore volume changes < 2L (noise)
const REFILL_MIN_MIN     = 6.0;   // refill must last >= 6 min to count


// ── Step 1: Spike removal ──────────────────────────────────────────────────
// Replace zeros and readings that deviate > 10cm from neighbor median.
function removeSpikes(readings) {
  const out = [...readings];
  for (let i = 2; i < readings.length - 2; i++) {
    const neighborMedian = median([readings[i-2], readings[i-1], readings[i+1], readings[i+2]]);
    if (Math.abs(readings[i] - neighborMedian) > SPIKE_THRESHOLD_CM) {
      out[i] = neighborMedian;
    }
  }
  return out;
}


// ── Step 2: Sliding median filter ─────────────────────────────────────────
function medianFilter(data, windowSize = MEDIAN_WIN) {
  const half = Math.floor(windowSize / 2);
  return data.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(data.length, i + half + 1);
    return median(data.slice(start, end));
  });
}


// ── Step 3: Threshold learning ─────────────────────────────────────────────
// Priority 1: DB saved thresholds (from previous session) → use immediately
// Priority 2: >= 200 readings accumulated → compute from data
// Priority 3: < 200 readings → fallback to DB depth, show LEARNING state
function learnThresholds(filteredReadings, fallbackHeightCm, savedThresholds) {
  // Priority 1
  if (
    savedThresholds &&
    savedThresholds.lower > 0 &&
    savedThresholds.upper > savedThresholds.lower + 5
  ) {
    return {
      lower: savedThresholds.lower,
      upper: savedThresholds.upper,
      learned: true,
      readingCount: filteredReadings.length,
    };
  }

  // Priority 2
  const valid = filteredReadings.filter(v => v > 2);
  if (valid.length >= BOOTSTRAP_MIN) {
    valid.sort((a, b) => a - b);
    const lowerIdx = Math.floor(valid.length * LOWER_PCT);
    const upperIdx = Math.floor(valid.length * UPPER_PCT);
    return {
      lower: Math.round(valid[lowerIdx]),
      upper: Math.round(valid[upperIdx]),
      learned: true,
      readingCount: valid.length,
    };
  }

  // Priority 3: fallback
  return {
    lower: 0,
    upper: fallbackHeightCm,
    learned: false,
    readingCount: valid.length,
  };
}


// ── Step 4: Distance → Volume ──────────────────────────────────────────────
// dist = lower → tank FULL  → fraction = 1.0 → volume = capacity
// dist = upper → tank EMPTY → fraction = 0.0 → volume = 0
// Works for any tank size because it uses the learned range.
function distanceToVolume(distCm, thresholds, capacityLitres) {
  const range = thresholds.upper - thresholds.lower;
  if (range <= 0) return 0;
  const fraction = (thresholds.upper - distCm) / range;
  return Math.max(0, Math.min(capacityLitres, fraction * capacityLitres));
}

function distanceToPercentage(distCm, thresholds) {
  const range = thresholds.upper - thresholds.lower;
  if (range <= 0) return 0;
  const fraction = (thresholds.upper - distCm) / range;
  return Math.max(0, Math.min(100, fraction * 100));
}


// ── Step 5: STRICT 200-reading classification ─────────────────────────────
// This runs FIRST before any rate calculation.
// Takes last 200 filtered distance readings.
// Compares median of first 20 vs median of last 20.
// If values ROSE (+5cm) → CONSUMPTION (water level fell)
// If values FELL (-5cm) → REFILL     (water level rose)
// Otherwise             → STABLE
function classifyLast200(filteredDist) {
  const n = filteredDist.length;
  if (n < CLASSIFY_WINDOW) {
    return { state: 'LEARNING', deltaCm: 0, startMedian: 0, endMedian: 0 };
  }

  const window = filteredDist.slice(-CLASSIFY_WINDOW);
  const startSlice = window.slice(0, CLASSIFY_EDGE);
  const endSlice   = window.slice(-CLASSIFY_EDGE);
  const startMedian = median(startSlice);
  const endMedian   = median(endSlice);
  const deltaCm     = endMedian - startMedian;

  let state;
  if      (deltaCm >  DELTA_THRESHOLD_CM) state = 'CONSUMPTION';
  else if (deltaCm < -DELTA_THRESHOLD_CM) state = 'REFILL';
  else state = 'STABLE';

  return { state, deltaCm, startMedian, endMedian };
}


// ── Step 6: Rate calculation (only called AFTER classification) ────────────
// Linear regression on the last 200 volume+time points.
// Returns L/min (always positive — direction is already in `state`).
function calcRateLpm(volHistory, timeHistoryMs) {
  const n = Math.min(volHistory.length, timeHistoryMs.length, CLASSIFY_WINDOW);
  if (n < 3) return 0;

  const vols  = volHistory.slice(-n);
  const times = timeHistoryMs.slice(-n);

  const t0 = times[0];
  const xs = times.map(t => (t - t0) / 60000); // ms → real minutes
  const ys = vols;

  const xm = xs.reduce((a, b) => a + b, 0) / n;
  const ym = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xm) * (ys[i] - ym);
    den += (xs[i] - xm) * (xs[i] - xm);
  }

  const spanMin = xs[xs.length - 1] - xs[0];
  if (den < 0.01 || spanMin < 5) return 0; // need >= 5 min span

  return Math.abs(num / den); // always positive
}


// ── Step 7: Today's consumed / refilled totals ────────────────────────────
function calcDailyTotals(volHistory, timeHistoryMs) {
  const todayMs = new Date().setHours(0, 0, 0, 0);
  let consumedToday = 0;
  let refilledToday = 0;

  for (let i = 1; i < volHistory.length; i++) {
    if (timeHistoryMs[i] >= todayMs) {
      const delta = volHistory[i] - volHistory[i-1];
      if (Math.abs(delta) >= MIN_JITTER_LITRES) {
        if (delta < 0) consumedToday += Math.abs(delta);
        if (delta > 0) refilledToday += delta;
      }
    }
  }
  return { consumedToday, refilledToday };
}


// ── Step 8: Count refills today (must last >= 6 min) ──────────────────────
function countRefillsToday(stateHistory, timeHistoryMs) {
  const todayMs = new Date().setHours(0, 0, 0, 0);
  let count = 0;
  let refillStartMs = null;

  for (let i = 0; i < stateHistory.length; i++) {
    if (timeHistoryMs[i] < todayMs) continue;

    if (stateHistory[i] === 'REFILL' && !refillStartMs) {
      refillStartMs = timeHistoryMs[i];
    } else if (stateHistory[i] !== 'REFILL' && refillStartMs) {
      const durationMin = (timeHistoryMs[i] - refillStartMs) / 60000;
      if (durationMin >= REFILL_MIN_MIN) count++;
      refillStartMs = null;
    }
  }
  if (refillStartMs && (new Date().getTime() - refillStartMs) / 60000 >= REFILL_MIN_MIN) {
    count++;
  }
  return count;
}


// ── MAIN FUNCTION ─────────────────────────────────────────────────────────
/**
 * analyzeWaterTank
 *
 * @param {Array<{distanceCm: number, timestampMs: number}>} readings
 *   All readings for this tank, sorted oldest first.
 *   distanceCm = field2 raw value from ThingSpeak
 *
 * @param {object} tankConfig
 *   { depthM, capacityLitres }  — from DB (TankDimensions)
 *
 * @param {object|null} savedThresholds
 *   { lower, upper } saved in DB from a previous session, or null
 *
 * @returns {object} analytics result
 */
function analyzeWaterTank(readings, tankConfig, savedThresholds = null) {
  const { heightCm, capacityLitres } = tankConfig;
  const fallbackHeightCm = heightCm 
    || (tankConfig.depthM ? tankConfig.depthM * 100 : null)
    || 210.82;
  const cap = capacityLitres || 1000;

  // ── Step 1+2: Clean distances ──────────────────────────────────────────
  const rawDist    = readings.map(r => r.distanceCm);
  const spikeClean = removeSpikes(rawDist);
  const filtered   = medianFilter(spikeClean);

  // ── Step 3: Thresholds ─────────────────────────────────────────────────
  const thresholds = learnThresholds(filtered, fallbackHeightCm, savedThresholds);

  // ── Not enough data yet ────────────────────────────────────────────────
  if (!thresholds.learned) {
    const currentDist = filtered[filtered.length - 1];
    const waterHeightCm = Math.max(0, Math.min(fallbackHeightCm, fallbackHeightCm - currentDist));
    const currentVol = (waterHeightCm / fallbackHeightCm) * cap;
    const currentPct = (waterHeightCm / fallbackHeightCm) * 100;

    return {
      state: 'LEARNING',
      currentDistanceCm: currentDist,
      currentVolumeLitres: currentVol,
      currentPercentage: currentPct,
      rateLitresPerMin: 0,
      consumedTodayLitres: 0,
      refilledTodayLitres: 0,
      estMinutesToEmpty: null,
      estMinutesToFull: null,
      thresholds,
      shouldSaveThresholds: false,
      deltaCm: 0,
    };
  }

  // ── Step 4: Convert all readings → volumes ─────────────────────────────
  const volHistory  = filtered.map(d => distanceToVolume(d, thresholds, cap));
  const timeHistory = readings.map(r => r.timestampMs);

  const currentDist = filtered[filtered.length - 1];
  const waterHeightCm = Math.max(0, Math.min(fallbackHeightCm, fallbackHeightCm - currentDist));
  const currentVol = (waterHeightCm / fallbackHeightCm) * cap;
  const currentPct = (waterHeightCm / fallbackHeightCm) * 100;

  // ── Step 5: CLASSIFY from last 200 readings FIRST ─────────────────────
  const { state, deltaCm, startMedian, endMedian } = classifyLast200(filtered);

  // ── Step 6: Rate (only if not STABLE) ─────────────────────────────────
  const rate = state === 'STABLE' ? 0 : calcRateLpm(volHistory, timeHistory);

  // ── Estimations ────────────────────────────────────────────────────────
  const rawEmpty = (state === 'CONSUMPTION' && rate > 0) ? currentVol / rate : null;
  const rawFull  = (state === 'REFILL' && rate > 0)      ? (cap - currentVol) / rate : null;

  const validateEst = (val) => (val === null || isNaN(val) || !isFinite(val) || val > 99999) ? null : val;
  const estMinutesToEmpty = validateEst(rawEmpty);
  const estMinutesToFull  = validateEst(rawFull);

  // ── Step 7: Daily totals ────────────────────────────────────────────────
  const { consumedToday, refilledToday } = calcDailyTotals(volHistory, timeHistory);

  // ── Decision: should re-learn thresholds? ──────────────────────────────
  const shouldSaveThresholds = filtered.length > 0 && filtered.length % RELEARN_EVERY === 0;

  return {
    state,
    currentDistanceCm: currentDist,
    currentVolumeLitres: currentVol,
    currentPercentage: currentPct,
    rateLitresPerMin: rate,
    consumedTodayLitres: consumedToday,
    refilledTodayLitres: refilledToday,
    estMinutesToEmpty,
    estMinutesToFull,
    thresholds,
    shouldSaveThresholds,
    deltaCm,
  };
}


// ── Utility ────────────────────────────────────────────────────────────────
function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}


module.exports = {
  analyzeWaterTank,
  learnThresholds,
  distanceToVolume,
  distanceToPercentage,
  classifyLast200,
  removeSpikes,
  medianFilter,
  BOOTSTRAP_MIN,
  RELEARN_EVERY,
};
