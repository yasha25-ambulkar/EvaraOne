/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TASK #15: Structured JSON Logging (Pino)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PROBLEM: console.log + Morgan creates unstructured, unsearchable logs
 *   • Railway log search impractical (gigabytes of unstructured text)
 *   • Can't filter by userId, requestId, status code
 *   • Can't correlate errors across logs
 *   • Production incidents take 3x longer to debug
 * 
 * SOLUTION: Pino structured JSON logging
 *   • Every log is valid JSON with: level, timestamp, msg, requestId, userId
 *   • Railway can parse and search: level:"error" AND userId:"abc123"
 *   • Error traces include full context
 *   • Log aggregation tools (DataDog, New Relic) parse automatically
 * 
 * LOGS INCLUDE:
 *   • HTTP requests: method, path, status, duration, userAgent
 *   • Errors: stack trace, context, requestId for client reference
 *   • App events: startup, connections, warnings
 * 
 * RAILWAY SEARCH EXAMPLES:
 *   • level:"error" AND resource_type:"zones" → Find all zone errors
 *   • userId:"user123" AND action:"DELETE" → Find all user modifications
 *   • durationMs:>1000 → Find slow queries
 */

const pino = require('pino');
const pinoHttp = require('pino-http');

// Use pretty-printing in development, JSON in production
const transport = process.env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
        }
    }
    : undefined;

// Create logger instance
const logger = pino(
    {
        level: process.env.LOG_LEVEL || 'info',
        timestamp: pino.stdTimeFunctions.isoTime,
        transport: transport,
        // Skip healthchecks in production logs
        serializers: {
            req: (req) => {
                // Omit sensitive headers
                const headers = { ...req.headers };
                delete headers['authorization'];
                delete headers['cookie'];
                return {
                    method: req.method,
                    path: req.path || req.url,
                    headers: headers,
                    id: req.id
                };
            },
            res: (res) => ({
                statusCode: res.statusCode,
                headers: res.getHeaders?.()
            })
        }
    }
);

// HTTP request logger middleware for Express
const httpLogger = pinoHttp({
    logger: logger,
    autoLogging: {
        ignorePaths: ['/health', '/metrics', '/.well-known/health'],
        ignoreGetRoutesMiddleware: true
    },
    customLogLevel: function (req, res, err) {
        // Errors should be error level, not info
        if (res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
    },
    // Custom object to include in every request log
    serializers: {
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res
    }
});

// Request ID middleware - adds tracking ID to every log
function requestIdMiddleware(req, res, next) {
    const requestId = req.headers['x-request-id'] 
        || req.id 
        || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    req.id = requestId;
    res.setHeader('x-request-id', requestId);
    
    // Attach to logger child so all logs include requestId
    req.log = logger.child({ requestId, userId: req.user?.uid });
    
    next();
}

/**
 * Log with context (request ID, user, resource)
 * USAGE: req.log.info({ action: 'CREATE', resource: 'zones', id: docId })
 */
const getChild = (context = {}) => {
    return logger.child(context);
};

module.exports = {
    logger,
    httpLogger,
    requestIdMiddleware,
    getChild
};
