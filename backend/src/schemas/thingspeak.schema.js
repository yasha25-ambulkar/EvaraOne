const { z } = require("zod");

/**
 * ThingSpeak Configuration Schemas
 * NOTE: No .strict() — avoids rejecting extra fields the frontend may send
 */

exports.fetchThingSpeakFieldsSchema = z.object({
  channelId: z
    .string()
    .min(1, "Channel ID is required")
    .trim()
    .refine((id) => /^\d+$/.test(id.trim()), "Channel ID must contain only digits"),

  apiKey: z
    .union([z.string().trim().max(100), z.literal("")])
    .optional()
    .nullable()
    .default(""),
});

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
    fetched_at: z.string().optional(),
    channel_name: z.string().optional(),
    channel_description: z.string().optional(),
  }),
});