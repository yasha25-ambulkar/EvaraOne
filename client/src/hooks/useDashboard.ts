import { useQuery } from "@tanstack/react-query";
import { adminService } from "../services/admin";
import { VITE_API_URL } from "../services/api";
import { useAuth } from "../context/AuthContext";

export interface DashboardStats {
  total_nodes: number;
  online_nodes: number;
  active_alerts: number;
  system_health: string;
}

export interface SystemHealth {
  status: string;
  timestamp: string;
  uptime: string;
  services: {
    firebase: string;
    redis: string;
    mqtt: string;
  };
}

export const useDashboardStats = () => {
  const { isAuthenticated } = useAuth(); // Depend on true Supabase auth instead of stale localStorage

  return useQuery({
    queryKey: ["dashboard_stats"],
    queryFn: async () => {
      if (!isAuthenticated) {
        console.warn(
          "[useDashboardStats] No active Supabase session, returning zeros",
        );
        return {
          total_nodes: 0,
          online_nodes: 0,
          active_alerts: 0,
          system_health: "Unknown",
        };
      }

      try {
        // Fetch stats directly via Supabase View
        const stats = (await adminService.getStats()) as any;
        return {
          total_nodes: stats.total_nodes || 0,
          online_nodes: stats.online_nodes || 0,
          active_alerts: stats.active_alerts || 0,
          system_health: "ok", // Usually retrieved from backend /health
        };
      } catch (error: any) {
        // eslint-disable-line @typescript-eslint/no-explicit-any
        console.warn("[useDashboardStats] Request failed:", error.message);
        return {
          total_nodes: 0,
          online_nodes: 0,
          active_alerts: 0,
          system_health: "Unknown",
        };
      }
    },
    staleTime: 2000,
    refetchInterval: 300000, // Reduced from 5s to 5m
    retry: false,
    enabled: isAuthenticated, // Only run if authenticated
  });
};

export const useSystemHealth = () => {
  return useQuery({
    queryKey: ["system_health"],
    queryFn: async () => {
      const healthUrl = `${VITE_API_URL}/health`;
      const response = await fetch(healthUrl);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      const data = await response.json();
      return data as SystemHealth;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });
};

export const useActiveAlerts = () => {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ["active_alerts"],
    queryFn: async () => {
      if (!isAuthenticated) {
        return [];
      }
      // Temporarily returning empty array until alerts are moved to Supabase DB
      return [];
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    refetchInterval: 1000 * 60 * 10, // Auto-refresh every 10 min
    retry: false,
    enabled: isAuthenticated,
  });
};
