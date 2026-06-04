import { z } from 'zod';

// Shared Validation Helpers
export const requiredString = (msg: string) => z.string().min(1, { message: msg });
export const phoneRegex = new RegExp(/^([+]?[\s0-9]+)?(\d{3}|[(]?[0-9]+[)])?([-]?[\s]?[0-9])+$/);

// -------------------------------------------------------------
// 1. Zone Management
// -------------------------------------------------------------
export const RegionSchema = z.object({
  name: requiredString("Zone name is required").max(100),
  state: requiredString("State is required"),
  country: requiredString("Country is required").default("India"),
  description: z.string().optional(),
});

export type RegionFormData = z.infer<typeof RegionSchema>;


// -------------------------------------------------------------
// 2. Community Management
// -------------------------------------------------------------
export const CommunitySchema = z.object({
  name: requiredString("Community name is required").max(150),
  zone_id: requiredString("Zone selection is required"),
  address: requiredString("Address is required"),
  pincode: requiredString("Pincode is required").min(5, "Invalid pincode"),
});

export type CommunityFormData = z.infer<typeof CommunitySchema>;


// -------------------------------------------------------------
// 3. Customer (User) Management
// -------------------------------------------------------------
export const CustomerSchema = z.object({
  display_name: requiredString("Display name is required"),
  full_name: requiredString("Full name is required"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  confirmPassword: z.string().optional(),
  phone_number: z.string().regex(phoneRegex, "Invalid phone number").optional(),
  zone_id: requiredString("Zone assignment is required"),
  role: z.enum(["customer", "operator", "viewer"]).default("customer"),
  status: z.enum(["active", "pending", "suspended"]).default("active"),
  community_id: z.string().optional(),
});

export type CustomerFormData = z.infer<typeof CustomerSchema>;
export type CustomerInput = z.infer<typeof CustomerSchema>;


// -------------------------------------------------------------
// 4. Device Provisioning
// -------------------------------------------------------------
export const DeviceSchema = z.object({
  node_key: requiredString("Node key (MAC) is required"),
  label: requiredString("Device label is required"),
  asset_type: z.enum(["Flow Meter", "Valve", "Tank Level", "Pump", "Energy Meter"]),
  asset_category: z.enum(["Source", "Distribution", "Consumption"]),
  physical_category: z.enum(["Pipeline", "Node", "Reservoir"]),
  customer_id: requiredString("Owning Customer is required"),
  community_id: requiredString("Associated Community is required"),
  latitude: z.number({ error: "Latitude is required and must be a valid number" }).min(-90).max(90),
  longitude: z.number({ error: "Longitude is required and must be a valid number" }).min(-180).max(180),
});

export type DeviceFormData = z.infer<typeof DeviceSchema>;
