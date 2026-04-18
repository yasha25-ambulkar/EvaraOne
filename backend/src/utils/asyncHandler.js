/**
 * ✅ TASK #7: Async Error Handler Wrapper
 * 
 * VULNERABILITY: Routes with async/await don't catch promise rejections
 * SYMPTOM: app crashes silently, no error logged
 * SOLUTION: Wrap every route handler to catch rejections
 * 
 * Usage:
 *   router.get('/endpoint', asyncHandler(async (req, res) => {
 *     await db.collection(...).get();  // If fails, caught & logged
 *   }));
 */

const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
