/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TASK #12: Comprehensive Audit Logging
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PROBLEM: No audit trail for data modifications
 *   • Can't track who deleted what
 *   • Can't investigate unauthorized changes
 *   • Compliance violations (GDPR, data governance)
 * 
 * SOLUTION: Fire-and-forget audit logging middleware
 *   • Never blocks response (async, no await)
 *   • Logs to audit_logs collection with: user_id, action, resource_id, timestamp
 *   • Compatible with rate limit: 1000s of operations per minute
 * 
 * USAGE:
 *   const { logAudit } = require('../utils/auditLogger');
 *   logAudit(req.user.uid, 'CREATE', 'zones', docId);
 *   logAudit(req.user.uid, 'UPDATE', 'devices', deviceId, { change: 'status' });
 *   logAudit(req.user.uid, 'DELETE', 'zones', zoneId);
 */

const { db } = require("../config/firebase.js");

/**
 * Fire-and-forget audit logging
 * Never awaits, never blocks response
 */
function logAudit(userId, action, resourceType, resourceId, metadata = {}) {
    if (!userId || !action || !resourceType || !resourceId) {
        console.warn('[AuditLogger] Missing required fields');
        return;
    }

    // Fire in background - don't await, don't block response
    db.collection("audit_logs").add({
        user_id: userId,
        action: action.toUpperCase(), // CREATE, UPDATE, DELETE, READ
        resource_type: resourceType,
        resource_id: resourceId,
        timestamp: new Date(),
        metadata: metadata || {},
        server_time: new Date().getTime()
    }).catch(err => {
        // Audit log failure shouldn't crash app
        console.error(`[AuditLogger] Failed to log: ${action} ${resourceType}#${resourceId}`, err.message);
    });
}

/**
 * Batch audit logging for bulk operations
 * Use when creating/updating multiple resources
 */
function logAuditBatch(userId, action, logs) {
    if (!logs || !Array.isArray(logs)) return;

    logs.forEach(({ resourceType, resourceId, metadata }) => {
        logAudit(userId, action, resourceType, resourceId, metadata);
    });
}

module.exports = {
    logAudit,
    logAuditBatch
};
