/**
 * ✅ TASK #10: Query Parameter Validation + Limit Cap
 * 
 * VULNERABILITY: No validation on query params
 * ATTACK: curl "https://api.../zones?limit=999999"
 * RESULT: Fetches 999k documents, costs $300+ in Firestore reads
 * 
 * SOLUTION: Middleware validates and caps query params
 * - limit: cap at 1000, default 50, min 1
 * - cursor: must be valid format or empty
 * - search: max 200 chars, no special chars
 */

const { z } = require('zod');
const logger = require('../utils/logger.js');

/**
 * Schema for list query parameters
 * Applied to ALL GET endpoints that return lists
 */
const querySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Minimum limit is 1')
    .max(1000, 'Maximum limit is 1000')
    .default(50),  // Default: 50 documents per page
  
  cursor: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^[a-zA-Z0-9+/=_-]+$/.test(val),
      'Invalid cursor format'
    ),
  
  search: z
    .string()
    .max(200, 'Search query too long')
    .optional()
    .refine(
      (val) => !val || !/[<>%$"']/g.test(val),
      'Search contains invalid characters'
    ),
  
  sortBy: z
    .enum(['created_at', 'updated_at', 'name'])
    .optional()
    .default('created_at'),
  
  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc'),
});

/**
 * Middleware: Validate and sanitize query parameters
 * 
 * Usage:
 *   router.get('/zones', validateQuery, getZones);
 */
const validateQuery = (req, res, next) => {
  try {
    // Parse and validate query parameters
    const validated = querySchema.parse(req.query);
    
    // Replace req.query with validated params
    req.query = validated;
    
    logger.debug(`[Query Validation] ✅ Valid query:`, {
      limit: validated.limit,
      cursor: validated.cursor ? 'provided' : 'none',
      search: validated.search ? `"${validated.search}"` : 'none'
    });
    
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(`[Query Validation] ❌ Invalid query params:`, error.errors);
      
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
    }
    
    next(error);
  }
};

module.exports = validateQuery;
