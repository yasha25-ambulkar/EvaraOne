const { z } = require('zod');

const updateCustomerSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  full_name: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(100).optional(),
  customerName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  phone_number: z.string().optional(),
  address: z.string().optional(),
  role: z.enum(["customer", "distributor", "operator", "viewer"]).optional(),
  status: z.enum(["active", "pending", "suspended", "inactive"]).optional(),
  regionFilter: z.string().optional(),
  zone_id: z.string().optional(),
}).strict();

module.exports = { updateCustomerSchema };
