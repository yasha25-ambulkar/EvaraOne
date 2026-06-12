/**
 * Custom React Hook for Real-time Device Updates
 * Uses Firestore onSnapshot subscriptions
 */
import { useEffect, useState } from 'react';
import { deviceService } from '../services/realtime/DeviceService';
import { useAuth } from '../context/AuthContext';

/**
 * Hook to subscribe to real-time device status changes
 */
export const useDeviceRealtime = () => {
    const { user } = useAuth();
    const [updateCount, setUpdateCount] = useState(0);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [recentUpdates, setRecentUpdates] = useState<unknown[]>([]);


    useEffect(() => {

        let filter = undefined;
        if (user && user.role !== 'superadmin' && (user as any).community_id) {
            filter = { community_id: (user as any).community_id };
        }

        // Subscribe to device updates
        const unsubscribeUpdates = deviceService.subscribeToDeviceUpdates((payload: any) => {
            setUpdateCount((prev) => prev + 1);
            setLastUpdate(new Date());
            setRecentUpdates((prev) => [payload, ...prev.slice(0, 9)]); // Keep last 10
        }, filter);

        // Subscribe to new devices
        const unsubscribeInserts = deviceService.subscribeToNewDevices((payload: any) => {
            setUpdateCount((prev) => prev + 1);
            setLastUpdate(new Date());
            setRecentUpdates((prev) => [payload, ...prev.slice(0, 9)]);
        }, filter);

        return () => {
            unsubscribeUpdates();
            unsubscribeInserts();
        };
    }, [user]);

    return {
        updateCount,
        lastUpdate,
        recentUpdates,
        isConnected: updateCount > 0 || lastUpdate !== null,
    };
};
