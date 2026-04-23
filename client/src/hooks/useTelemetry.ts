import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { telemetryService, type TelemetryData } from '../services/TelemetryService';
import { socket } from '../services/api';

export const useTelemetry = (nodeId: string | undefined) => {
    const queryClient = useQueryClient();
    
    const {
        data: initialData,
        isLoading: loading,
        error: queryError,
        refetch: refresh
    } = useQuery<TelemetryData | null>({
        queryKey: ['telemetry', nodeId],
        queryFn: () => {
            if (!nodeId) return Promise.resolve(null);
            return telemetryService.getLiveTelemetry(nodeId);
        },
        enabled: !!nodeId,
    });

    const [realtimeData, setRealtimeData] = useState<TelemetryData | null>(null);

    useEffect(() => {
        if (!nodeId) return;

        const onUpdate = (payload: any) => {
            if (payload.device_id === nodeId || payload.id === nodeId) {
                const mapped: TelemetryData = {
                    timestamp: payload.timestamp || new Date().toISOString(),
                    values: payload.raw_data || payload,
                    deviceId: nodeId,
                    level_percentage: payload.level_percentage ?? null,
                    depth_value: payload.distance ?? null,
                    flow_rate: payload.flow_rate ?? payload.flowRate ?? payload.waterFlow ?? payload.raw_data?.[payload.flow_rate_field] ?? payload.raw_data?.field3 ?? null,
                    temperature: payload.temperature ?? payload.temp ?? null,
                    tdsValue: payload.tdsValue ?? payload.tds_value ?? null,
                    total_liters: payload.volume ?? payload.total_liters ?? payload.raw_data?.[payload.meter_reading_field] ?? payload.raw_data?.field1 ?? null,
                    distance: payload.distance,
                    waterLevel: payload.level_percentage,
                };
                setRealtimeData(mapped);
                
                // Also update the react-query cache so other components stay in sync
                queryClient.setQueryData(['telemetry', nodeId], mapped);
            }
        };

        // Listen to both room-based and global broadcast events
        socket.on('telemetry_update', onUpdate);
        socket.on('telemetry_broadcast', onUpdate);
        
        // If we switch nodes, clear the local state
        setRealtimeData(null);

        return () => {
            socket.off('telemetry_update', onUpdate);
            socket.off('telemetry_broadcast', onUpdate);
        };
    }, [nodeId, queryClient]);

    const error = queryError ? (queryError as Error).message : null;
    const finalData = realtimeData || initialData || null;

    return { data: finalData, loading, error, refresh };
};
