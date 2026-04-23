/**
 * SaaS Architecture: Tenant Isolation Middleware
 * Ensures that the user operates within their designated tenant namespace.
 * In a fully migrated schema, this ensures req.tenant_id matches the requested resource.
 */
const tenantCheck = (req, res, next) => {
    if (!req.user || req.user.role === "superadmin") {
        return next(); // Superadmins bypass tenant isolation
    }

    // Resolve the virtual tenant ID for the current user session
    // This provides a foundation for future true multi-tenancy migrations
    const tenantId = req.user.community_id || req.user.customer_id || req.user.uid;
    req.tenant_id = tenantId;

    // Never trust client-supplied tenant/customer IDs on mutations
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        // Force overwrite — client body values are completely ignored
        req.body.tenant_id = req.tenant_id;
        req.body.customer_id = req.user.customer_id || req.user.uid;
    }

    // For GET/DELETE, just verify they belong to this tenant
    // (If the route uses :tenantId parameter in the path)
    if (req.params.tenantId && req.params.tenantId !== req.tenant_id) {
        return res.status(403).json({ error: 'Tenant boundary violation' });
    }

    next();
};

module.exports = tenantCheck;
