import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api/v1';

// Backend audit log schema
interface AuditLogCreate {
    action: string;
    resource_type: string;
    resource_id?: string | null;
    details?: Record<string, unknown> | null;
}

/**
 * Utility: write an audit log entry via FastAPI backend.
 * Automatically attaches the current user's id from JWT token.
 * Call this at every mutation point (pipeline create/update/delete, user create, node create, etc.)
 */
export async function logAction(
    entry: AuditLogCreate
): Promise<void> {
    try {
        // Get auth token from localStorage
        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.warn('[Audit] No auth token found, skipping audit log');
            return;
        }

        // Call FastAPI audit endpoint
        await axios.post(
            `${API_URL}/audit-logs`,
            {
                action: entry.action,
                resource_type: entry.resource_type,
                resource_id: entry.resource_id,
                details: entry.details
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );
    } catch (error) {
        // Audit logging failures must never break the main flow
        console.warn('[Audit] Failed to log action:', error);
    }
}
