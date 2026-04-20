/**
 * ✅ CRITICAL FIX #5: Request Sanitizer
 * Removes sensitive fields from logs to prevent API key/password exposure
 * 
 * SENSITIVE FIELDS:
 * - api_key, apiKey, API_KEY
 * - password, passwd, pwd
 * - token, authorization
 * - credit_card, card_number, cvv
 * - ssn, social_security_number
 * - private_key, jwt
 */

const SENSITIVE_FIELD_NAMES = [
  'api_key', 'apikey', 'api-key', 'x-api-key',
  'password', 'passwd', 'pwd', 'pass',
  'token', 'authorization', 'bearer',
  'credit_card', 'card_number', 'cvv',
  'ssn', 'social_security_number',
  'private_key', 'jwt', 'webhook_secret',
  'client_secret', 'access_token', 'refresh_token',
  'firebase_private_key', 'mqtt_password'
];

/**
 * Recursively sanitize an object, removing sensitive field values
 * @param {*} obj - Object to sanitize (can be null, string, object, array, etc.)
 * @param {number} depth - Max recursion depth (prevent infinite loops)
 * @returns {*} Sanitized copy of the object
 */
function sanitizeObject(obj, depth = 0) {
  // Prevent infinite recursion
  if (depth > 10) return '[REDACTED_DEPTH_EXCEEDED]';

  // Handle null/undefined
  if (obj === null || obj === undefined) return obj;

  // Handle primitives
  if (typeof obj !== 'object') return obj;

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item, idx) => {
      // Don't log array elements if they look like API keys
      if (typeof item === 'string' && item.length > 50 && !item.includes(' ')) {
        return '[REDACTED_LONG_STRING]';
      }
      return sanitizeObject(item, depth + 1);
    });
  }

  // Handle objects
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();

    // If this key is sensitive, redact the value
    if (SENSITIVE_FIELD_NAMES.some(sensitive => keyLower.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } 
    // If value is sensitive string (very long, looks like token/key), redact
    else if (typeof value === 'string' && value.length > 50 && !value.includes(' ') && keyLower !== 'message') {
      sanitized[key] = '[REDACTED_LONG_STRING]';
    }
    // Otherwise, recursively sanitize
    else {
      sanitized[key] = sanitizeObject(value, depth + 1);
    }
  }

  return sanitized;
}

/**
 * Sanitize request body, params, query, headers
 * @param {object} req - Express request object
 * @returns {object} Sanitized request data
 */
function sanitizeRequest(req) {
  return {
    method: req.method,
    path: req.path,
    url: req.url,
    ip: req.ip,
    userId: req.user?.uid ? req.user.uid.substring(0, 4) + '***' : 'anonymous',
    userRole: req.user?.role || 'guest',
    headers: sanitizeObject({
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
      // Remove auth headers entirely
      'authorization': '[REDACTED]',
      'x-api-key': '[REDACTED]',
      'cookie': '[REDACTED]'
    }),
    body: sanitizeObject(req.body),
    query: sanitizeObject(req.query),
    params: sanitizeObject(req.params)
  };
}

/**
 * Sanitize error for logging
 * @param {Error} error - Error object
 * @returns {object} Sanitized error
 */
function sanitizeError(error) {
  return {
    name: error.name,
    message: error.message,
    statusCode: error.statusCode || error.status,
    code: error.code,
    // Stack trace is OK to log (it's code paths, not secrets)
    // But we already logged the request above, which contains sensitives
  };
}

module.exports = {
  sanitizeObject,
  sanitizeRequest,
  sanitizeError,
  SENSITIVE_FIELD_NAMES
};
