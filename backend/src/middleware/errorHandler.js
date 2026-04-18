const logger = require('../utils/logger');
const { sanitizeRequest, sanitizeError } = require('../utils/requestSanitizer');

// ─── #8 FIX: Never expose stack traces or internal details in production ──────
const isDev = () => process.env.NODE_ENV !== 'production';

// ─── Safe response builder ────────────────────────────────────────────────────
const getPublicMessage = (statusCode) => {
  const messages = {
    400: "Bad request — check your input and try again",
    401: "Authentication required",
    403: "You do not have permission to perform this action",
    404: "The requested resource was not found",
    409: "A conflict occurred — the resource may already exist",
    422: "Validation failed — check your request body",
    429: "Too many requests — please slow down",
    500: "Something went wrong on our end — we have been notified",
    502: "Upstream service unavailable",
    503: "Service temporarily unavailable",
  };
  return messages[statusCode] || "An unexpected error occurred";
};

const createErrorResponse = (error, statusCode = 500) => {
  return {
    success: false,
    error: {
      // Production: generic message — NEVER the real error.message
      message: isDev()
        ? (error.message || 'Internal Server Error')
        : getPublicMessage(statusCode),
      code: error.code || 'INTERNAL_ERROR',
      statusCode,
      // Stack ONLY in development — stripped in production
      ...(isDev() && error.stack ? { stack: error.stack } : {}),
    },
    timestamp: new Date().toISOString()
  };
};

// Main error handling middleware
const errorHandler = (err, req, res, next) => {
  // ✅ CRITICAL FIX #5: Sanitize request before logging
  const sanitizedReq = sanitizeRequest(req);
  const sanitizedErr = sanitizeError(err);

  // ── Internal logging — always log everything in dev, minimal in prod ──
  if (isDev()) {
    logger.error('Request error', err, {
      ...sanitizedReq,
      error: sanitizedErr,
      stack: err.stack
    });
  } else {
    // Production: don't log headers or body (may contain tokens)
    logger.error('Request error', err, {
      method: req.method,
      url: req.url,
      userId: req.user?.uid ? req.user.uid.substring(0, 4) + '***' : 'anonymous',
      error: sanitizedErr
    });
  }

  // Handle specific error types
  let statusCode = 500;

  if (err.name === 'ValidationError' || err.name === 'ZodError') {
    statusCode = 400;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
  } else if (err.name === 'ConflictError') {
    statusCode = 409;
  }

  res.status(statusCode).json(createErrorResponse(err, statusCode));
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'AppError';
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
    this.name = 'ValidationError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

module.exports = {
  errorHandler,
  asyncHandler,
  createErrorResponse,
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError
};
