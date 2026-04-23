const { z } = require('zod');

const updateZoneSchema = z.object({
    zoneName: z.string().min(1).max(100).optional(),
    state: z.string().min(1).max(100).optional(),
    country: z.string().min(1).max(100).optional(),
    zone_code: z.string().max(50).optional(),
    description: z.string().max(500).optional()
    // Strips explicitly any tenant_id or owner overrides if passed
}).strict();

module.exports = { updateZoneSchema };
