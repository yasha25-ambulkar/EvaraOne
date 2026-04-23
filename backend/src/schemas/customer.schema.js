const { z } = require('zod');

const updateCustomerSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(100).optional(),
  customerName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  // Strict schema drops any unexpected keys like role, owner_id, etc.
}).strict();

module.exports = { updateCustomerSchema };
