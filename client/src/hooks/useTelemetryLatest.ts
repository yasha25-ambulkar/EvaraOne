/**
 * useTelemetryLatest.ts
 *
 * Canonical hook for fetching the latest telemetry snapshot for any device.
 * This is the ONLY place in the frontend that constructs the
 * `['telemetry', deviceId, 'latest']` React Query cache key.
 *
 * Features:
 *  - Auto-refetch every 2 minutes (matches ingestion_service poll budget)
 *  - Exponential back-off retry (max 30 s)
 *  - Online/Offline status derived from timestamp via telemetryPipeline
 *  - Returns a strongly-typed TelemetryLatestResult
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { telemetryService } from '../services/realtime/TelemetryService';
import type { TelemetryData } from '../services/realtime/TelemetryService';
import { computeOnlineStatus } from '../utils/telemetryPipeline';
import { useEffect, useState } from 'react';
import { socket } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The shape returned by the backend `/telemetry/devices/{id}/telemetry/latest`
 * endpoint. Matches TelemetryService.TelemetryData.
 */
export interface TelemetryLatestPayload {
    timestamp: string;
    /** Raw ThingSpeak fields keyed by fieldN name. Also contains entry_id. */
    data: Record<string, unknown>;
    // Typed metrics (pre-computed by backend TelemetryMapper)
    level_percentage?: number | null;
    depth_value?: number | null;
    temperature_value?: number | null;
    flow_rate?: number | null;
    total_liters?: number | null;
    /** Backend-computed online flag (30-min freshness). Prefer this over timestamp-derived status. */
    online?: boolean | null;
}

export interface TelemetryLatestResult {
    /** The normalized snapshot. Null while loading or on error. */
    telemetryData: TelemetryLatestPayload | null;
    /** Derived from telemetryData?.timestamp via computeOnlineStatus. */
    onlineStatus: 'Online' | 'Offline';
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param deviceId   UUID of the device node.
 * @param deviceType 'EvaraTank' | 'EvaraFlow' | 'EvaraDeep'
 *                   Used to pick the correct offline threshold.
 * @param refetchMs  Poll interval in milliseconds. Default 120 000 (2 min).
 */
export function useTelemetryLatest(
    deviceId: string | undefined | null
): TelemetryLatestResult {
    const enabled = Boolean(deviceId);
    const queryClient = useQueryClient();

    // REQUIREMENT STEP 5: Continuous Status Monitoring
    // Use local state to trigger re-renders even when data hasn't changed.
    // This allows the status to flip from 'Online' to 'Offline' automatically while viewing.
    const [statusTicker, setStatusTicker] = useState(0);

    useEffect(() => {
        if (!enabled) return;
        const interval = setInterval(() => {
            setStatusTicker((prev) => prev + 1);
        }, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [enabled]);

    // Trigger status re-calculation when ticker changes
    useEffect(() => {
        if (statusTicker > 0 && queryClient.getQueryData(['telemetry', deviceId, 'latest'])) {
            // Force re-evaluation of online status
            queryClient.invalidateQueries(['telemetry', deviceId, 'latest'], { refetch: false });
        }
    }, [statusTicker, deviceId, queryClient]);

    // ─── Realtime WebSocket Integration ─────────────────────────────────────────
    useEffect(() => {
        if (!deviceId || !enabled) return;

        // Join room
        socket.emit('subscribe_device', deviceId);

        const handleUpdate = (payload: any) => {
            // Update React Query Cache immediately when a socket event arrives
            // This prevents the need for any polling
            queryClient.setQueryData(['telemetry', deviceId, 'latest'], (old: any) => {
                // If the incoming timestamp is newer, update
                if (payload.timestamp && (!old || new Date(payload.timestamp) > new Date(old.timestamp))) {
                    return {
                        ...old,
                        timestamp: payload.timestamp,
                        data: payload.raw_data || payload.data || old?.data || {},
                        level_percentage: payload.level_percentage ?? old?.level_percentage,
                        total_liters: payload.total_liters ?? old?.total_liters,
                        online: true
                    };
                }
                return old;
            });
        };

        socket.on('telemetry_update', handleUpdate);

        return () => {
            socket.emit('unsubscribe_device', deviceId);
            socket.off('telemetry_update', handleUpdate);
        };
    }, [deviceId, enabled, queryClient]);

    const {
        data,
        isLoading,
        isError,
        refetch,
    } = useQuery<TelemetryLatestPayload | null>({
        queryKey: ['telemetry', deviceId, 'latest'],
        queryFn: async () => {
            if (!deviceId) return null;

            // TelemetryService already handles errors gracefully (returns null)
            const result = await telemetryService.getLiveTelemetry(deviceId);
            if (!result) return null;

            // Remap values->{} as data->{} unification:
            // TelemetryService stores raw fields in result.values; analytics pages
            // need them under result.data — bridge both shapes here.
            return {
                timestamp: result.timestamp,
                data: (result as unknown as { data?: Record<string, unknown> }).data
                    ?? (result.values as Record<string, unknown>)
                    ?? {},
                level_percentage: result.level_percentage ?? null,
                depth_value: result.depth_value ?? null,
                temperature_value: result.temperature_value ?? null,
                flow_rate: result.flow_rate ?? null,
                total_liters: result.total_liters ?? null,
                online: (result as TelemetryData & { online?: boolean | null }).online ?? null,
            };
        },
        enabled,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 30, // 30 seconds for consistent freshness
        gcTime: 5 * 60_000,
        refetchInterval: 300000, // Reduced from 5s to 5m
        retry: 3,
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 30_000),
    });

    const telemetryData = data ?? null;

    // Enforce strict 30-min (1800s) timestamp rule universally for real-time accuracy.
    const onlineStatus: 'Online' | 'Offline' = computeOnlineStatus(telemetryData?.timestamp ?? null);

    return { telemetryData, onlineStatus, isLoading, isError, refetch };
}
