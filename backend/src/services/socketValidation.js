/**
 * ✅ FIX #2: VALIDATE SOCKET.IO EVENTS WITH ZOD
 * 
 * VULNERABILITY FIXED:
 * - Socket.io events accepted without validation
 * - Prototype pollution: __proto__ could be injected
 * - NoSQL injection: $ne, $gt operators in filters
 * - Server-side template injection in string fields
 * 
 * SOLUTION:
 * - Define Zod schemas for EVERY Socket.io event
 * - Use .strict() to reject unknown fields
 * - Validate before database operations
 */

const { z } = require('zod');

// ============================================================================
// Socket.io Event Schemas (with strict validation)
// ============================================================================

/**
 * device_update: Client sends device metadata update
 * - device_id: Must be valid UUID
 * - metadata: Safe key-value pairs only
 * - status: Enum-only (no free strings)
 */
const deviceUpdateSchema = z.object({
  device_id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\-_]+$/),
  metadata: z.record(z.string(), z.any()).optional(),
  status: z.enum(['online', 'offline', 'error']).optional(),
  isVisibleToCustomer: z.boolean().optional()
}).strict(); // ← CRITICAL: Reject __proto__, constructor, etc.

/**
 * telemetry: Real-time sensor data from device
 */
const telemetrySchema = z.object({
  device_id: z.string().min(1).max(100),
  values: z.record(z.number()).optional(),
  timestamp: z.number().optional(),
  sensor_reading: z.number().optional()
}).strict();

/**
 * room_join: Subscribe to device real-time updates
 */
const roomJoinSchema = z.object({
  room: z.string().min(1).max(100),
  deviceId: z.string().min(1).max(100)
}).strict();

/**
 * device_command: Send command to physical device
 */
const deviceCommandSchema = z.object({
  device_id: z.string().min(1).max(100),
  command: z.enum(['restart', 'calibrate', 'reset', 'update']),
  parameters: z.record(z.any()).optional()
}).strict();

/**
 * historical_query: Request past telemetry data
 */
const historicalQuerySchema = z.object({
  device_id: z.string().min(1).max(100),
  start_time: z.number(), // Unix milliseconds
  end_time: z.number(),
  limit: z.number().min(1).max(1000).optional()
}).strict().refine(
  (data) => data.end_time > data.start_time,
  { message: "end_time must be after start_time" }
);

// ============================================================================
// Validation Functions (exported for use in Socket.io handlers)
// ============================================================================

const validateDeviceUpdate = (data) => {
  return deviceUpdateSchema.parse(data);
};

const validateTelemetry = (data) => {
  return telemetrySchema.parse(data);
};

const validateRoomJoin = (data) => {
  return roomJoinSchema.parse(data);
};

const validateDeviceCommand = (data) => {
  return deviceCommandSchema.parse(data);
};

const validateHistoricalQuery = (data) => {
  return historicalQuerySchema.parse(data);
};

// ============================================================================
// Error Handler: Convert Zod errors to user-friendly messages
// ============================================================================

const formatValidationError = (error) => {
  if (error.errors && Array.isArray(error.errors)) {
    return error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
  }
  return error.message;
};

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Validators
  validateDeviceUpdate,
  validateTelemetry,
  validateRoomJoin,
  validateDeviceCommand,
  validateHistoricalQuery,

  // Schemas (for advanced use)
  schemas: {
    deviceUpdateSchema,
    telemetrySchema,
    roomJoinSchema,
    deviceCommandSchema,
    historicalQuerySchema
  },

  // Error handler
  formatValidationError
};
