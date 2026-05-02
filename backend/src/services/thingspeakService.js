/**
 * thingspeakService.js
 *
 * Fetches raw distance readings from ThingSpeak and returns
 * a clean array after spike removal.
 *
 * Responsibilities:
 *   1. Call ThingSpeak REST API
 *   2. Extract the correct field (from sensor_field_mapping)
 *   3. Parse timestamps → milliseconds
 *   4. Run spike removal
 *   5. Return clean readings array
 */

'use strict';

const { removeSpikes } = require('../utils/tankMath');

const THINGSPEAK_BASE = 'https://api.thingspeak.com';

// How many results to fetch per poll (last N readings)
const FETCH_RESULTS = 100;

// ─────────────────────────────────────────────────────────────
// Main export: fetch + clean
// ─────────────────────────────────────────────────────────────

/**
 * Fetches readings from ThingSpeak and returns a clean array.
 *
 * @param {object} device - Firestore device document
 * @returns {Promise<Array<{distanceCm: number, timestampMs: number}>>}
 */
async function fetchCleanReadings(device) {
  const { channelId, apiKey, fieldKey } = resolveThingSpeakConfig(device);

  if (!channelId || !apiKey) {
    throw new Error(`[thingspeakService] Missing channelId or apiKey for device ${device.id}`);
  }

  const url = `${THINGSPEAK_BASE}/channels/${channelId}/feeds.json` +
              `?api_key=${apiKey}&results=${FETCH_RESULTS}`;

  let json;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ThingSpeak returned HTTP ${res.status}`);
    json = await res.json();
  } catch (err) {
    throw new Error(`[thingspeakService] Fetch failed: ${err.message}`);
  }

  const feeds = json?.feeds ?? [];
  if (feeds.length === 0) return [];

  // Parse raw feeds → { distanceCm, timestampMs }
  const raw = feeds
    .map(f => ({
      distanceCm:  parseFloat(f[fieldKey]),
      timestampMs: new Date(f.created_at).getTime(),
    }))
    .filter(r => !isNaN(r.distanceCm) && r.distanceCm > 0);

  // Apply spike removal — the only pre-processing step
  const clean = removeSpikes(raw);

  return clean;
}

/**
 * Fetches only the single latest reading from ThingSpeak.
 * Used by the polling worker for live updates.
 *
 * @param {object} device
 * @returns {Promise<{distanceCm: number, timestampMs: number} | null>}
 */
async function fetchLatestReading(device) {
  const { channelId, apiKey, fieldKey } = resolveThingSpeakConfig(device);

  if (!channelId || !apiKey) return null;

  const url = `${THINGSPEAK_BASE}/channels/${channelId}/feeds/last.json` +
              `?api_key=${apiKey}`;

  try {
    const res  = await fetch(url);
    if (!res.ok) return null;
    const feed = await res.json();

    const distanceCm = parseFloat(feed[fieldKey]);
    if (isNaN(distanceCm) || distanceCm <= 0) return null;

    return {
      distanceCm,
      timestampMs: new Date(feed.created_at).getTime(),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Internal: resolve ThingSpeak config from device document
// ─────────────────────────────────────────────────────────────

/**
 * Extracts channelId, apiKey, fieldKey from Firestore device doc.
 *
 * Supports multiple storage patterns used across the project.
 */
function resolveThingSpeakConfig(device) {
  const cfg = device.configuration ?? device.customer_config ?? device ?? {};

  // Channel ID
  const channelId =
    cfg.thingspeak_channel_id ??
    cfg.channel_id             ??
    device.thingspeak_channel_id ??
    device.channel_id          ??
    null;

  // Read API Key
  const apiKey =
    cfg.thingspeak_api_key ??
    cfg.read_api_key        ??
    device.thingspeak_api_key ??
    device.read_api_key     ??
    null;

  // Field key — which ThingSpeak field has distance data
  // Firestore sensor_field_mapping: { water_level: 'field2', temperature: 'field1' }
  const fieldKey =
    device.sensor_field_mapping?.water_level ??
    cfg.sensor_field_mapping?.water_level    ??
    'field2'; // safe default: distance is usually field2

  return { channelId, apiKey, fieldKey };
}

module.exports = {
  fetchCleanReadings,
  fetchLatestReading,
  resolveThingSpeakConfig,
};
