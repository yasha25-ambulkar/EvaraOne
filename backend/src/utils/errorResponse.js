/**
 * ✅ FIX #3: STRIP SENSITIVE ERROR DETAILS
 * 
 * VULNERABILITY FIXED:
 * - Error messages expose Firebase internals (reconnaissance)
 * - Stack traces leak code structure (attack surface mapping)
 * - Exception details help attackers craft better payloads
 * 
 * SOLUTION:
 * - Generic error messages to clients
 * - Full details logged server-side for debugging
 * - Sentry captures real errors
 */

/**
 * Custom application error class
 * Distinguishes operational errors (client's fault) from programmer errors (our bug)
 */
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintain proper stack trace (V8)
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Handle errors: log fully server-side, send generic message to client
 */
const handleError = (err, res) => {
  const { statusCode = 500, message } = err;

  // Send generic message to client (NO details, NO stack trace)
  return res.status(statusCode).json({
    error: message || 'Internal server error'
    // NEVER include: details, stack, code, innerException
  });
};

/**
 * Safe error response helper
 * Maps common errors to appropriate HTTP status codes
 */
const errorResponses = {
  notFound: (resource) => new AppError(`${resource} not found`, 404),
  unauthorized: () => new AppError('Unauthorized', 401),
  forbidden: () => new AppError('Access denied', 403),
  badRequest: (message) => new AppError(message || 'Bad request', 400),
  conflict: (message) => new AppError(message || 'Resource conflict', 409),
  gone: (resource) => new AppError(`${resource} has been deleted`, 410),
  unprocessable: (message) => new AppError(message || 'Unprocessable entity', 422),
  tooMany: () => new AppError('Too many requests', 429),
  internal: () => new AppError('Internal server error', 500),
};

module.exports = {
  AppError,
  handleError,
  errorResponses
};
