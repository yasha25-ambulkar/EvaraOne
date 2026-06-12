import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { deviceService } from '../services/realtime/DeviceService';

interface RealtimeOptions {
    deviceId: string;
    latestQueryKey: any[];
    historyQueryKey: any[];
    snapshotTable: string;
    snapshotMerger: (old: any, snap: any) => any;
}

export const useTelemetryRealtime = (options: RealtimeOptions) => {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!options.deviceId) return;


        // This is a placeholder for actual real-time subscription logic.
        // In a real implementation, this would connect to Firestore or WebSockets.
        const unsubscribe = deviceService.subscribeToNodeUpdates((payload: any) => {
            if (payload.id === options.deviceId) {
                queryClient.setQueryData(options.latestQueryKey, (oldData: any) => {
                    return options.snapshotMerger(oldData, payload);
                });
                // Also invalidate history to trigger a refetch if needed
                queryClient.invalidateQueries({ queryKey: options.historyQueryKey });
            }
        });

        return () => unsubscribe();
    }, [options.deviceId, queryClient, options.latestQueryKey, options.historyQueryKey, options.snapshotTable, options.snapshotMerger]);
};
