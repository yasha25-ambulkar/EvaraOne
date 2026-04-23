const { db } = require("../config/firebase.js");
const logger = require("../utils/logger.js");

/**
 * SaaS Architecture: Enterprise Audit Logging
 * Silently records sensitive read/write actions mapped to specific customer tenants.
 */
const auditLog = (actionName) => {
    return async (req, res, next) => {
        // Fire and forget, don't block the API response
        next();

        try {
            if (!req.user || !req.user.uid) return;

            const logEntry = {
                action: actionName,
                user_id: req.user.uid,
                role: req.user.role,
                community_id: req.user.community_id || null,
                target_endpoint: req.originalUrl,
                method: req.method,
                ip: req.ip || req.headers['x-forwarded-for'],
                timestamp: new Date().toISOString()
            };

            // Optional: Extract requested device ID if it's a detail route
            if (req.params.id) {
                logEntry.target_device = req.params.id;
            }

            // Sync to Firestore 'audit_logs' collection
            await db.collection("audit_logs").add(logEntry);
        } catch (err) {
            logger.error("[AuditLog] Failed to record action:", err.message);
        }
    };
};

module.exports = auditLog;
