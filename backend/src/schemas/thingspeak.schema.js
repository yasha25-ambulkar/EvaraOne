const { z } = require("zod");

/**
 * ✅ ISSUE #6: ThingSpeak Configuration Schemas
 * Validates ThingSpeak channel configuration requests
 */

exports.fetchThingSpeakFieldsSchema = z.object({
  channelId: z.string().min(1, "Channel ID is required"),
  apiKey: z.string().optional()
}).strict(); // ✅ Reject unknown fields

exports.saveThingSpeakMetadataSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
  metadata: z.object({
    channel_id: z.string().optional(),
    field1: z.string().optional(),
    field2: z.string().optional(),
    field3: z.string().optional(),
    field4: z.string().optional(),
    field5: z.string().optional(),
    field6: z.string().optional(),
    field7: z.string().optional(),
    field8: z.string().optional(),
    fetched_at: z.string().optional()
  }).strict()
}).strict(); // ✅ Reject unknown fields
