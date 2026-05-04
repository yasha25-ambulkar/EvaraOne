import { useState, useEffect } from 'react';
import { socket } from '../services/api';

/**
 * Hook to subscribe to real-time telemetry updates for a specific device via WebSockets.
 */
export const useRealtimeTelemetry = (deviceId: string | undefined) => {
    const [telemetry, setTelemetry] = useState<any>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

    useEffect(() => {
        if (!deviceId) return;

        const onConnect = () => {
            setStatus('connected');
            socket.emit('subscribe_device', deviceId);
        };

        const onDisconnect = () => {
            setStatus('connecting');
        };

        const onTelemetryUpdate = (data: any) => {
            // Ensure the update is for the current device
            const incomingId = data.device_id || data.deviceId || data.node_id || data.id;
            if (incomingId === deviceId) {
                setTelemetry(data);
            }
        };

        // If already connected, subscribe immediately
        if (socket.connected) {
            onConnect();
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('telemetry_update', onTelemetryUpdate);

        // Emit subscription
        socket.emit('subscribe_device', deviceId);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('telemetry_update', onTelemetryUpdate);
            socket.emit('unsubscribe_device', deviceId);
        };
    }, [deviceId]);

    return { 
        telemetry, 
        status,
        isConnected: status === 'connected' 
    };
};
