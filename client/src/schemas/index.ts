import { z } from "zod";

// ── AUTH SCHEMAS ────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(2, "Display name must be at least 2 characters"),
});

// ── ADMIN SCHEMAS ────────────────────────────────────────────────────────

export const regionSchema = z.object({
  zoneName: z.string().min(2, "Zone name is required"),
  state: z.string().optional(),
  country: z.string().default("India"),
  zone_code: z.string().optional(),
  description: z.string().optional(),
});

export const communitySchema = z.object({
  name: z.string().min(2, "Community name is required"),
  zone_id: z.string().min(1, "Please select a valid zone"),
  address: z.string().optional(),
  pincode: z
    .string()
    .regex(/^\d{6}$/, "Invalid pincode (6 digits required)")
    .optional()
    .or(z.literal("")),
  contact_person: z.string().optional(),
  contact_email: z.string().email("Invalid email").optional().or(z.literal("")),
  contact_phone: z.string().optional(),
  operational_status: z
    .enum(["active", "pending", "inactive"])
    .default("active"),
});

export const customerSchema = z
  .object({
    display_name: z.string().min(2, "Display name is required"),
    full_name: z.string().optional(),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
    phone_number: z.string().optional(),
    role: z.enum(["customer", "distributor", "operator", "viewer"]),
    status: z.enum(["active", "pending", "suspended", "inactive"]),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const deviceSchema = z.object({
  name: z.string().min(2, "Device name is required"),
  device_type: z.string().min(1, "Device type is required"),
  physical_category: z.string().optional(),
  analytics_template: z.string().min(1, "Analytics template is required"),
  latitude: z
    .string()
    .min(1, "Latitude is required")
    .refine(
      (v) => !isNaN(Number(v)) && Number(v) >= -90 && Number(v) <= 90,
      "Invalid latitude (-90 to 90)",
    ),
  longitude: z
    .string()
    .min(1, "Longitude is required")
    .refine(
      (v) => !isNaN(Number(v)) && Number(v) >= -180 && Number(v) <= 180,
      "Invalid longitude (-180 to 180)",
    ),
  capacity: z.string().optional(),
  specifications: z.string().optional(),
  thingspeak_channel_id: z.string().optional(),
  thingspeak_read_key: z.string().optional(),
  thingspeak_write_key: z.string().optional(),
  water_level_field: z.string().optional(),
  depth_field: z.string().optional(),
  meter_reading_field: z.string().optional(),
  flow_rate_field: z.string().optional(),
  tds_field: z.string().optional(),
  temperature_field: z.string().optional(),
  // Technical metadata fields
  max_depth: z.string().optional(),
  static_depth: z.string().optional(),
  dynamic_depth: z.string().optional(),
  recharge_threshold: z.string().optional(),
  pipe_diameter: z.string().optional(),
  max_flow_rate: z.string().optional(),
  // Tank physical dimensions
  length: z.string().optional(),
  breadth: z.string().optional(),
  node_key: z.string().min(4, "Node key (Hardware ID) is required"),
  customer_id: z
    .string()
    .min(1, "Customer assignment is strictly required for hierarchy"),
  is_active: z.boolean().default(true),
  status: z.string().default("Online"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type RegionInput = z.infer<typeof regionSchema>;
export type CommunityInput = z.infer<typeof communitySchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type DeviceInput = z.infer<typeof deviceSchema>;
