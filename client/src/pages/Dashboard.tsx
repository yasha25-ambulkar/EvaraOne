import { useAuth } from "../context/AuthContext";
import ErrorBoundary from "../components/ErrorBoundary";
import SuperAdminDashboard from "./SuperAdminDashboard";
import CustomerDashboard from "./CustomerDashboard";

export default function Dashboard() {
    const { user } = useAuth();

    return (
        <ErrorBoundary>
            {user?.role === "superadmin" ? (
                <SuperAdminDashboard />
            ) : (
                <CustomerDashboard />
            )}
        </ErrorBoundary>
    );
}
