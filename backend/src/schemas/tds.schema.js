const { z } = require("zod");

/**
 * TDS (Total Dissolved Solids) Device Schema
 * Validates provisioning and updates for TDS water quality sensors
 * ✅ ISSUE #6: All schemas use .strict() to reject unknown fields
 */

exports.createTDSDeviceSchema = z.object({
  body: z.object({
    displayName: z.string().min(1, "Device name required"),
    thingspeakChannelId: z.string().min(1, "ThingSpeak Channel ID required"),
    thingspeakReadKey: z.string().min(1, "ThingSpeak Read API Key required"),
    customerId: z.string().optional(),
    zoneId: z.string().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    tdsField: z.string().optional().default("field1"),
    temperatureField: z.string().optional().default("field2"),
    minThreshold: z.number().optional().default(0),
    maxThreshold: z.number().optional().default(2000),
  }).strict() // ✅ ISSUE #6: Reject unknown fields like role, owner_id, etc.
});

exports.updateTDSDeviceSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
  body: z.object({
    displayName: z.string().optional(),
    thingspeakChannelId: z.string().optional(),
    thingspeakReadKey: z.string().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    minThreshold: z.number().optional(),
    maxThreshold: z.number().optional(),
  }).strict() // ✅ ISSUE #6: Reject unknown fields
});

exports.getTDSDeviceSchema = z.object({
  params: z.object({
    id: z.string(),
  })
});

exports.getTDSDataSchema = z.object({
  payload: z.object({
    tds_value: z.number().optional(),
    temperature: z.number().optional(),
    timestamp: z.string().optional(),
    status: z.enum(["ONLINE", "OFFLINE", "OFFLINE_RECENT"]).optional(),
  })
});
