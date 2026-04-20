// ─── #5 FIX: RBAC middleware ──────────────────────────────────────────────────
const logger = require("../utils/logger.js"); // ✅ AUDIT FIX M10
// ORIGINAL BUG: When allowedRoles was empty ([]) and role was undefined/empty,
// the middleware fell through to next() — granting access with no role at all.
//
// FIX: Hard-reject at the top of the middleware if role is missing or empty.
// A request with no resolvable role is an authentication failure, not an
// authorization decision — return 401, not 403.

const rbac = (allowedRoles = []) => {
    return (req, res, next) => {
        // ── Guard 1: user object must exist ──────────────────────────────────
        if (!req.user) {
            return res.status(401).json({
                error: "Authentication required: No user context on request",
            });
        }

        // ── Guard 2: role must be a non-empty string ──────────────────────────
        // This fires when requireAuth's Firestore lookup timed out and fell back
        // to an empty role, or when a token is valid but the user has no record.
        const userRole = typeof req.user.role === "string"
            ? req.user.role.trim().toLowerCase()
            : "";

        if (!userRole) {
            logger.warn(`RBAC rejection — role not resolved`, { uid: req.user.uid });
            return res.status(401).json({
                error: "Authentication failed: User role could not be determined — please sign in again",
            });
        }

        // ── Superadmin bypass ─────────────────────────────────────────────────
        if (userRole === "superadmin") {
            return next();
        }

        // ── Endpoint-specific role requirements ───────────────────────────────
        // If the route was mounted with rbac(["admin", "manager"]), only those
        // roles are allowed. An empty allowedRoles means "any authenticated user".
        if (allowedRoles.length > 0) {
            const normalizedAllowed = allowedRoles.map((r) => r.trim().toLowerCase());
            if (!normalizedAllowed.includes(userRole)) {
                return res.status(403).json({
                    error: `Access denied: this endpoint requires ${normalizedAllowed.join(" or ")}`,
                });
            }
        }

        // ── Viewer read-only enforcement ──────────────────────────────────────
        // Viewers may call GET but never mutate data
        if (
            userRole === "viewer" &&
            ["POST", "PUT", "DELETE", "PATCH"].includes(req.method)
        ) {
            return res.status(403).json({
                error: "Access denied: viewer accounts cannot modify data",
            });
        }

        next();
    };
};

module.exports = rbac;
