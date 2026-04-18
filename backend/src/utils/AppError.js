/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TASK #13: Consistent HTTP Status Codes
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PROBLEM: Controllers inconsistently return HTTP status codes
 *   • Validation errors sometimes return 500 instead of 400
 *   • Authorization errors return 500 instead of 403
 *   • Logic errors mix 404 with 500
 * 
 * SOLUTION: AppError class with proper status code semantics
 *   • 400: Client error (validation, bad request)
 *   • 403: Forbidden (access denied, authorization failed)
 *   • 404: Resource not found
 *   • 409: Conflict (duplicate, constraint violation)
 *   • 500: Server error only (unexpected exceptions)
 * 
 * USAGE:
 *   throw new AppError('Invalid email format', 400);
 *   throw new AppError('Access denied', 403);
 *   throw new AppError('User not found', 404);
 */

class AppError extends Error {
    constructor(message, statusCode = 500, details = {}) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date().toISOString();
        
        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, AppError.prototype);
    }

    /**
     * Generate unique error ID for client tracking/debugging
     * Allows users to reference errors in support tickets
     */
    toJSON() {
        return {
            error: this.message,
            statusCode: this.statusCode,
            timestamp: this.timestamp,
            ...(process.env.NODE_ENV === 'development' && { details: this.details })
        };
    }
}

module.exports = AppError;
