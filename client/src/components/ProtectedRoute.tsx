import React, { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, type UserRole, type UserPlan } from '../context/AuthContext';

interface ProtectedRouteProps {
    allowedRoles?: UserRole[];
    allowedPlans?: UserPlan[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles, allowedPlans }) => {
    const { user, loading, isAuthenticated } = useAuth();
    const queryClient = useQueryClient();

    // Invalidate queries when authentication state changes
    useEffect(() => {
        if (isAuthenticated && user) {
            queryClient.invalidateQueries({ queryKey: ['nodes'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
            queryClient.invalidateQueries({ queryKey: ['active_alerts'] });
        }
    }, [isAuthenticated, user, queryClient]);

    // Always wait for loading to complete first
    if (loading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center apple-glass-inner">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // Check authentication after loading is complete
    if (!isAuthenticated || !user) {
        return <Navigate to="/login" replace />;
    }

    // Role-based protection: Check role only after loading and auth are confirmed
    if (allowedRoles && allowedRoles.length > 0) {
        // If we reach here, loading is false and user exists
        // Role should definitely be available now
        if (!user.role) {
            console.warn('[ProtectedRoute] Role unavailable after loading complete');
            return <Navigate to="/dashboard" replace />;
        }
        
        if (!allowedRoles.includes(user.role)) {
            console.warn(`[ProtectedRoute] User role '${user.role}' not in allowed roles: ${allowedRoles.join(', ')}`);
            return <Navigate to="/dashboard" replace />;
        }
    }

    if (allowedPlans && !allowedPlans.includes(user.plan)) {
        return <Navigate to="/dashboard" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
