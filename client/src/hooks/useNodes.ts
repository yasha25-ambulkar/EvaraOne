import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deviceService } from "../services/DeviceService";
import { useAuth } from "../context/AuthContext";
import { socket } from "../services/api";

export const useNodes = (searchQuery: string = "") => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Unified real-time socket listener
  useEffect(() => {
    const handleUpdate = (data: any) => {
      const deviceId = data.device_id || data.node_id;
      if (!deviceId) return;

      // Invalidate all node-related queries to trigger a fresh fetch from cache/API
      // This ensures all UI components using useNodes stay perfectly in sync
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
    };

    socket.on("telemetry_update", handleUpdate);
    socket.on("node_update", handleUpdate);

    return () => {
      socket.off("telemetry_update", handleUpdate);
      socket.off("node_update", handleUpdate);
    };
  }, [queryClient]);

  const {
    data: nodes = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["nodes", searchQuery, user?.id, user?.role],
    queryFn: async () => {
      const isSuperAdmin = user?.role === "superadmin";
      const mappedNodes = await deviceService.getMapNodes(
        undefined,
        isSuperAdmin ? undefined : user?.customer_id,
      );

      if (!searchQuery) return mappedNodes;

      const searchLower = searchQuery.toLowerCase();
      return mappedNodes.filter(
        (n: any) =>
          (n.displayName || "").toLowerCase().includes(searchLower) ||
          (n.hardwareId || "").toLowerCase().includes(searchLower) ||
          (n.label || "").toLowerCase().includes(searchLower) ||
          (n.id || "").toLowerCase().includes(searchLower),
      );
    },
    refetchInterval: 12000, // Balanced: fetch every 12 seconds (not too aggressive)
    staleTime: 5000, // Data becomes stale after 5 seconds
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  return {
    nodes,
    loading: isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refresh: refetch,
  };
};
