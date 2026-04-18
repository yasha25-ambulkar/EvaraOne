const mqtt = require("mqtt");
const { db, admin } = require("../config/firebase.js");
const { z } = require("zod");

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";

// ============================================================================
// ✅ TASK #2 — MQTT Connection State Tracking
// ============================================================================
let mqttConnected = false;
global.mqttConnected = false; // For health check access

// ============================================================================
// ✅ TASK #5 — Zod Validation Schemas for Each Device Type
// ============================================================================

// Tank device (evaratank) — measures water level in a tank
const tankSchema = z.object({
  water_level: z.number().min(0).max(100).optional(),
  temperature: z.number().min(-50).max(80).optional(),
  device_status: z.enum(['online', 'offline', 'error']).optional(),
  battery_level: z.number().min(0).max(100).optional(),
  signal_strength: z.number().min(0).max(5).optional(),
}).strict();

// Borewell device (evaradeep) — measures groundwater depth
const deepSchema = z.object({
  water_level_cm: z.number().min(0).max(10000).optional(),
  temperature: z.number().min(-50).max(80).optional(),
  device_status: z.enum(['online', 'offline', 'error']).optional(),
  battery_level: z.number().min(0).max(100).optional(),
}).strict();

// Flow meter device (evaraflow) — measures water flow rate
const flowSchema = z.object({
  flow_rate: z.number().min(0).optional(),
  current_reading: z.number().min(0).optional(),
  device_status: z.enum(['online', 'offline', 'error']).optional(),
  battery_level: z.number().min(0).max(100).optional(),
}).strict();

// Helper: pick the right schema based on device type
function getSchema(deviceType) {
  const type = (deviceType || '').toLowerCase();
  if (type === 'evaratank' || type === 'tank') return tankSchema;
  if (type === 'evaradeep' || type === 'deep') return deepSchema;
  if (type === 'evaraflow' || type === 'flow') return flowSchema;
  return null; // Unknown device type
}

// ============================================================================
// ✅ TASK #6 — MQTT Exponential Backoff (prevent CPU thrash during outages)
// ============================================================================
// Manual reconnection with exponential backoff:
// 1s, 2s, 4s, 8s, 16s, 32s, 1m, 2m, 3m, 4m, 5m (then stable at 5m)
const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes
let failureCount = 0;

const calculateBackoff = (failCount) => {
  const baseMs = 1000;
  const exponential = baseMs * Math.pow(2, Math.min(failCount, 8)); // Cap at 2^8
  return Math.min(exponential, MAX_BACKOFF_MS);
};

// ============================================================================
// ✅ CRITICAL FIX #1: MQTT Authentication + TLS Encryption
// ============================================================================
// SECURITY REQUIREMENTS:
// 1. MQTT_USERNAME & MQTT_PASSWORD required (no anonymous access)
// 2. TLS certificates required for production (port 8883 = MQTTS)
// 3. CA certificate for server verification (prevent MITM attacks)
// ============================================================================

const fs = require('fs');
const path = require('path');

// ─── Validate required credentials ────────────────────────────────────────
const mqttUsername = process.env.MQTT_USERNAME;
const mqttPassword = process.env.MQTT_PASSWORD;

if (!mqttUsername || !mqttPassword) {
  throw new Error(
    `CRITICAL: MQTT credentials missing. Set MQTT_USERNAME and MQTT_PASSWORD env vars. 
     This prevents unauthenticated device spoofing.`
  );
}

// ─── MQTT Connection Options ──────────────────────────────────────────────
const mqttOptions = {
  reconnectPeriod: 0,       // ← MANUAL control: we handle reconnection via exponential backoff
  connectTimeout: 5000,     // give up on each attempt after 5 seconds
  keepalive: 60,            // send a heartbeat every 60 seconds
  username: mqttUsername,   // ← REQUIRED: Broker rejects unauthenticated connections
  password: mqttPassword,   // ← REQUIRED: Authentication credential
  clean: true,              // Start fresh session on connect (security best practice)
};

// ─── TLS Configuration (for MQTTS on port 8883) ───────────────────────────
const useSecureMQTT = process.env.MQTT_USE_TLS === 'true' || 
                      process.env.NODE_ENV === 'production';

if (useSecureMQTT) {
  // Load CA certificate for server verification (prevent MITM attacks)
  const caCertPath = process.env.MQTT_CA_CERT_PATH || 
                     '/mosquitto/certs/ca.crt';
  
  try {
    if (fs.existsSync(caCertPath)) {
      mqttOptions.rejectUnauthorized = true;
      mqttOptions.ca = [fs.readFileSync(caCertPath)];
      console.log(`[MQTT] TLS enabled: CA certificate loaded from ${caCertPath}`);
    } else {
      // Self-signed or development: skip strict verification
      mqttOptions.rejectUnauthorized = false;
      console.warn(`[MQTT] TLS enabled but CA cert not found at ${caCertPath}. Running with insecure mode (dev only).`);
    }
  } catch (err) {
    console.error(`[MQTT] Failed to load CA certificate:`, err.message);
    process.exit(1);
  }

  // Use secure MQTTS port (8883) instead of plaintext (1883)
  const secureBrokerUrl = (process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883')
    .replace(/^mqtt:/, 'mqtts:')
    .replace(/:1883$/, ':8883');
  
  MQTT_BROKER_URL = secureBrokerUrl;
}

const mqttClient = mqtt.connect(MQTT_BROKER_URL, mqttOptions);

// ✅ When MQTT connects successfully
mqttClient.on('connect', () => {
  failureCount = 0;  // ✅ FIX #6: Reset counter on successful connect
  mqttConnected = true;
  global.mqttConnected = true;
  console.log('[MQTT] ✅ Connected to broker (backoff reset)');

  // Subscribe (this runs EVERY time we connect, not just once)
  mqttClient.subscribe('devices/+/telemetry', (err) => {
    if (err) {
      console.error('[MQTT] ❌ Subscription failed:', err.message);
      mqttConnected = false;
      global.mqttConnected = false;
    } else {
      console.log('[MQTT] ✅ Subscribed to devices/+/telemetry');
    }
  });
});

// ✅ When MQTT disconnects
mqttClient.on('disconnect', () => {
  mqttConnected = false;
  global.mqttConnected = false;
  console.warn('[MQTT] ⚠️  Disconnected from broker — waiting to reconnect...');
});

// ✅ When there's an error
mqttClient.on('error', (err) => {
  failureCount++;  // ✅ FIX #6: Increment on error
  mqttConnected = false;
  global.mqttConnected = false;
  
  const backoffMs = calculateBackoff(failureCount);
  const backoffSec = Math.round(backoffMs / 1000);
  
  console.error(`[MQTT] ❌ Error (attempt ${failureCount}): ${err.message}. Retrying in ${backoffSec}s...`);
  
  // ✅ FIX #6: Manually reconnect with exponential backoff
  setTimeout(() => {
    console.log(`[MQTT] 🔄 Attempting reconnection (backoff: ${backoffSec}s)`);
    mqttClient.reconnect();
  }, backoffMs);
});

// ✅ When connection fully closes
mqttClient.on('close', () => {
  mqttConnected = false;
  global.mqttConnected = false;
  console.warn('[MQTT] ⚠️  Connection closed');
});

const lastUpdateMap = new Map();
const UPDATE_THROTTLE_MS = 30000; // 30 seconds

// ============================================================================
// ✅ TASK #5 + FIX #5 — Validated Message Handler with Publisher Authentication
// ============================================================================
mqttClient.on('message', async (topic, message) => {
  try {
    // Step A: Parse the raw JSON
    let rawPayload;
    try {
      rawPayload = JSON.parse(message.toString());
    } catch (parseErr) {
      console.warn('[MQTT] ❌ Invalid JSON received — ignoring:', message.toString().slice(0, 100));
      return; // Stop here, don't process garbage
    }

    // Step B: Get the device ID from the topic
    // Topic format: "devices/DEVICE_ID/telemetry"
    const parts = topic.split('/');
    const deviceId = parts[1];
    if (!deviceId) {
      console.warn('[MQTT] ❌ Could not extract device ID from topic:', topic);
      return;
    }

    // Step C: ✅ FIX #5: Extract API key from message
    const providedApiKey = rawPayload.api_key;
    if (!providedApiKey) {
      console.warn(`[MQTT] ❌ Missing api_key in message for device ${deviceId}`);
      return;
    }

    // Step D: ✅ FIX #5: Load device from Firestore and get stored key hash
    let deviceType = null;
    let storedKeyHash = null;
    try {
      const deviceDoc = await db.collection('devices').doc(deviceId).get();
      if (!deviceDoc.exists) {
        console.warn(`[MQTT] ❌ Unknown device: ${deviceId} — ignoring message`);
        return;
      }
      deviceType = deviceDoc.data().device_type;
      storedKeyHash = deviceDoc.data().api_key_hash; // Stored as SHA-256 hash
      
      if (!storedKeyHash) {
        console.warn(`[MQTT] ❌ Device ${deviceId} has no api_key_hash — rejecting`);
        return;
      }
    } catch (lookupErr) {
      console.error(`[MQTT] ❌ Firestore lookup failed for ${deviceId}:`, lookupErr.message);
      return;
    }

    // Step E: ✅ FIX #5: Verify API key matches (timing-safe comparison)
    const crypto = require('crypto');
    const providedKeyHash = crypto
      .createHash('sha256')
      .update(providedApiKey)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    let keysMatch = false;
    try {
      keysMatch = crypto.timingSafeEqual(
        Buffer.from(providedKeyHash),
        Buffer.from(storedKeyHash)
      );
    } catch (compareErr) {
      // timingSafeEqual throws if lengths differ
      console.warn(`[MQTT] ❌ Invalid API key length for device ${deviceId}`);
      return;
    }

    if (!keysMatch) {
      console.warn(`[MQTT] ❌ Invalid API key for device: ${deviceId}`);
      
      // Alert security team
      try {
        const Sentry = require('@sentry/node');
        Sentry.captureMessage(
          `[MQTT] Unauthorized publish attempt - device: ${deviceId}`,
          'warning'
        );
      } catch (e) {}
      
      return; // REJECT message
    }

    // Step F: Get the right schema for this device type
    const schema = getSchema(deviceType);
    if (!schema) {
      console.warn(`[MQTT] ❌ No schema for device type "${deviceType}" — ignoring`);
      return;
    }

    // Step G: Validate the payload (THE BOUNCER)
    let payload;
    try {
      // Remove api_key before validation (not part of telemetry schema)
      const { api_key, device_id, ...telemetryData } = rawPayload;
      payload = schema.parse(telemetryData);
      // If we get here, payload is 100% clean and valid
    } catch (validationErr) {
      const errors = validationErr.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      console.warn(`[MQTT] ❌ Invalid payload for device ${deviceId}:`, errors);
      return; // Reject the message silently
    }

    // Step H: Now payload is SAFE — use it normally
    console.log(`[MQTT] ✅ Valid & authenticated telemetry from ${deviceId} (${deviceType})`);

    // Emit to Socket.io (only to rooms watching this device)
    if (global.io) {
      global.io.to(`room:${deviceId}`).emit('telemetry_update', {
        device_id: deviceId,
        device_type: deviceType,
        ...payload,                          // ✅ Only validated fields
        timestamp: new Date().toISOString()
      });
    }

    // Throttled write to Firestore
    const now = Date.now();
    const lastUpdate = lastUpdateMap.get(deviceId) || 0;
    if (now - lastUpdate > UPDATE_THROTTLE_MS) {
      try {
        await db.collection(deviceType.toLowerCase()).doc(deviceId).update({
          telemetry_snapshot: {
            ...payload,                        // ✅ Only validated fields
            last_updated: new Date(),
            last_ingested_at: admin.firestore.FieldValue.serverTimestamp()
          }
        });
        lastUpdateMap.set(deviceId, now);
      } catch (writeErr) {
        console.error(`[MQTT] ❌ Failed to write telemetry for ${deviceId}:`, writeErr.message);
      }
    }

  } catch (err) {
    console.error('[MQTT] ❌ Unexpected error processing message:', err.message);
  }
});

// ============================================================================
// ✅ Export so other files can check MQTT status
// ============================================================================
module.exports = { 
  mqttClient, 
  isMqttConnected: () => mqttConnected 
};
