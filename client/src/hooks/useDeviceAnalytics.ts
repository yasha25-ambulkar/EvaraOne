import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { deviceService } from "../services/DeviceService";
import { useRealtimeTelemetry } from "./useRealtimeTelemetry";
import type { Device, TelemetrySnapshot } from "../types/entities";

export interface TelemetryData {
  timestamp: string;
  data: {
    entry_id: number;
    [key: string]: any;
  };
}

export interface NodeInfoData {
  id: string;
  hardware_id: string;
  name: string;
  asset_type: string;
  last_seen: string | null;
  zone_name?: string;
  community_name?: string;
  customer_config?: any;
  customer_name?: string | null;
}

export interface AnalyticsData {
  device: Device | null | undefined;
  telemetry: TelemetrySnapshot | null | undefined;
  history: any[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null | undefined;
  data?: {
    config?: any;
    latest?: any;
    info?: { data: NodeInfoData };
    history?: { feeds: any[] };
    predictive?: {
      trends24h: any[];
      dailyConsumption: any[];
    };
    tankBehavior?: any;
    active_fields?: string[];
  };
  refetch: () => void;
  isError: boolean;
}

export const useDeviceAnalytics = (
  hardwareIdOverride?: string, 
  options: { 
    refetchInterval?: number | false; 
    staleTime?: number;
    filter?: { range?: string; startDate?: string; endDate?: string };
  } = {}
): AnalyticsData => {
  const { hardwareId: routeHardwareId } = useParams<{ hardwareId: string }>();
  const hardwareId = hardwareIdOverride || routeHardwareId || '';

  const {
    data: device,
    isLoading: deviceLoading,
    isFetching: deviceFetching,
    error: deviceError,
    refetch: refetchDevice,
    isError: isDeviceError,
  } = useQuery({
    queryKey: ["device_config", hardwareId],
    queryFn: async () => {
      if (!hardwareId) return null;
      return await deviceService.getNodeDetails(hardwareId);
    },
    enabled: !!hardwareId,
    staleTime: options.staleTime ?? (1000 * 30), // Allow override, default 30 seconds for consistent freshness
    refetchInterval: options.refetchInterval ?? false, // Disable auto-refetch by default
  });

  const {
    data: telemetryResult,
    isLoading: telemetryLoading,
    isFetching: telemetryFetching,
    error: telemetryError,
    refetch: refetchTelemetry,
    isError: isTelemetryError,
  } = useQuery({
    queryKey: ["telemetry_backend", hardwareId, options.filter],
    queryFn: async () => {
      if (!hardwareId) return null;
      return await deviceService.getNodeAnalytics(hardwareId, options.filter);
    },
    enabled: !!hardwareId,
    staleTime: 0, // Force fresh data when filter changes
    refetchInterval: options.refetchInterval ?? false, // Disable auto-refetch by default
  });

  const { telemetry: realtimeData } = useRealtimeTelemetry(device?.id || hardwareId);

  const isFetching = telemetryFetching || deviceFetching;
  const isLoading = deviceLoading || telemetryLoading;
  const isError = isDeviceError || isTelemetryError;
  const error = (deviceError as any)?.message || (telemetryError as any)?.message || null;

  // Use useCallback to ensure refetch function reference stays stable
  const refetch = useCallback(() => {
    refetchDevice();
    refetchTelemetry();
  }, [refetchDevice, refetchTelemetry]);

  const unifiedData = useMemo(() => {
    if (!device) return undefined;

    const d = device as any;
    const hw = d.hardwareId || d.hardware_id || d.node_key || device.id || '';
    
    // Fallback chain: Realtime Socket (processed) -> Device Snapshot (processed) -> History Last Point (processed)
    const snapshot = d.telemetry_snapshot || d.telemetry || null;
    const latestFromAPI = telemetryResult?.history?.length > 0 
        ? telemetryResult.history[telemetryResult.history.length - 1] 
        : null;

    let latestTelemetry = null;

    if (realtimeData) {
        // CRITICAL: Use processed real-time data with metadata
        latestTelemetry = {
            timestamp: realtimeData.timestamp || realtimeData.time || new Date().toISOString(),
            level_percentage: realtimeData.level_percentage,
            total_liters: realtimeData.total_liters,
            flow_rate: realtimeData.flow_rate,
            // Include processed metadata
            is_corrected: realtimeData.is_corrected,
            original_value: realtimeData.original_value,
            confidence: realtimeData.confidence,
            pattern: realtimeData.pattern,
            data: realtimeData
        };
    } else if (snapshot && (snapshot.level_percentage !== undefined || snapshot.flow_rate !== undefined)) {
        // Check if snapshot has processed metadata
        if (snapshot.is_corrected !== undefined) {
            latestTelemetry = {
                timestamp: snapshot.timestamp,
                level_percentage: snapshot.level_percentage,
                total_liters: snapshot.total_liters,
                flow_rate: snapshot.flow_rate,
                is_corrected: snapshot.is_corrected,
                original_value: snapshot.original_value,
                confidence: snapshot.confidence,
                pattern: snapshot.pattern,
                data: snapshot
            };
        } else {
            // Fallback to raw snapshot data
            latestTelemetry = {
                timestamp: snapshot.timestamp,
                level_percentage: snapshot.level_percentage ?? snapshot.level ?? snapshot.percentage,
                total_liters: snapshot.total_liters ?? snapshot.volume ?? snapshot.currentVolume,
                flow_rate: snapshot.flow_rate,
                data: snapshot
            };
        }
    } else if (latestFromAPI && (latestFromAPI.level !== undefined || latestFromAPI.flow_rate !== undefined)) {
        // Check if API data has processed metadata
        if (latestFromAPI.is_corrected !== undefined) {
            latestTelemetry = {
                timestamp: latestFromAPI.timestamp,
                level_percentage: latestFromAPI.level,
                total_liters: latestFromAPI.volume ?? latestFromAPI.total_liters,
                flow_rate: latestFromAPI.flow_rate,
                is_corrected: latestFromAPI.is_corrected,
                original_value: latestFromAPI.original_value,
                confidence: latestFromAPI.confidence,
                pattern: latestFromAPI.pattern,
                data: latestFromAPI
            };
        } else {
            // Fallback to raw API data
            latestTelemetry = {
                timestamp: latestFromAPI.timestamp,
                level_percentage: latestFromAPI.level,
                total_liters: latestFromAPI.volume ?? latestFromAPI.total_liters,
                flow_rate: latestFromAPI.flow_rate,
                data: latestFromAPI
            };
        }
    } else if (d.last_telemetry && (d.last_telemetry.level_percentage !== undefined || d.last_telemetry.flow_rate !== undefined)) {
        // Ultimate fallback: registry-level summary
        latestTelemetry = {
            timestamp: d.last_telemetry.timestamp || d.last_online_at,
            level_percentage: d.last_telemetry.level_percentage ?? d.last_telemetry.Level ?? d.last_level,
            total_liters: d.last_telemetry.total_liters ?? d.last_telemetry.Volume ?? d.last_volume,
            flow_rate: d.last_telemetry.flow_rate,
            is_corrected: d.last_telemetry.is_corrected,
            original_value: d.last_telemetry.original_value,
            confidence: d.last_telemetry.confidence,
            pattern: d.last_telemetry.pattern,
            data: d.last_telemetry
        };
    }

    return {
      config: { config: d },
      latest: latestTelemetry,
      info: {
        data: {
          id: device.id || hw,
          hardware_id: hw,
          name: d.displayName || d.name || hw,
          asset_type: d.asset_type || 'Generic',
          last_seen: d.last_seen || null,
          zone_name: d.zone_name,
          community_name: d.community_name,
          customer_config: d.customer_config,
          customer_name: d.customer_name || null,
        } as NodeInfoData
      },
      history: {
        feeds: (telemetryResult?.history || []).map((h: any) => ({
            ...h,
            level_percentage: h.level,
            total_liters: h.volume
        }))
      },
      predictive: telemetryResult?.predictive,
      tankBehavior: telemetryResult?.tankBehavior,
      active_fields: telemetryResult?.active_fields
    };
  }, [device, telemetryResult, realtimeData]);

  return {
    device,
    telemetry: device?.telemetry_snapshot as any,
    isLoading,
    isFetching,
    isError,
    error,
    data: unifiedData,
    history: telemetryResult?.history || [],
    refetch
  };
};
