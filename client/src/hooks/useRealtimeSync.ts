/**
 * Real-Time Sync Hook
 * Provides real-time synchronization functionality for React components
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { auth, isFirebaseEnabled } from '../lib/firebase';
import realtimeSync from '../services/realtime/RealtimeSyncService';

interface UseRealtimeSyncOptions {
  deviceId?: string;
  autoConnect?: boolean;
}

interface RealtimeSyncState {
  connected: boolean;
  lastSync: string | null;
  errorCount: number;
  reconnectAttempts: number;
  isRealtime: boolean;
}

interface UseRealtimeSyncReturn extends RealtimeSyncState {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  reconnect: () => Promise<boolean>;
  joinDevice: (deviceId: string) => void;
  leaveDevice: (deviceId: string) => void;
  toggleRealtime: () => void;
  stats: any;
}

export const useRealtimeSync = (options: UseRealtimeSyncOptions = {}): UseRealtimeSyncReturn => {
  const { deviceId, autoConnect = true } = options;

  const [state, setState] = useState<RealtimeSyncState>({
    connected: false,
    lastSync: null,
    errorCount: 0,
    reconnectAttempts: 0,
    isRealtime: false
  });

  const subscribersRef = useRef<Map<string, Function>>(new Map());

  // Update connection status
  const updateStatus = useCallback((newStatus: Partial<RealtimeSyncState>) => {
    setState((prev: RealtimeSyncState) => ({ ...prev, ...newStatus }));
  }, []);

  // Handle telemetry updates
  const handleTelemetryUpdate = useCallback((data: any) => {
    // Trigger re-render in components that use this hook
    window.dispatchEvent(new CustomEvent('telemetry_update', { detail: data }));
  }, []);

  // Handle connection status changes
  const handleConnectionChange = useCallback((data: any) => {
    updateStatus({
      connected: data.connected,
      lastSync: data.connected ? new Date().toISOString() : state.lastSync,
      isRealtime: data.connected
    });
  }, [state.lastSync]);

  // Handle errors
  const handleError = useCallback((error: any) => {
    console.error('[RealtimeSync] Error:', error);
    updateStatus((prev: RealtimeSyncState) => ({
      ...prev,
      errorCount: prev.errorCount + 1
    }));
  }, []);

  // Connect to real-time sync
  const connect = useCallback(async (): Promise<boolean> => {
    try {
      if (!isFirebaseEnabled || !auth?.currentUser) {
        console.warn('[RealtimeSync] Firebase auth is disabled or no authenticated user is available');
        return false;
      }

      const token = await auth.currentUser.getIdToken();
      const success = await realtimeSync.connect(token);
      if (success && deviceId) {
        realtimeSync.joinDeviceRoom(deviceId);
      }
      return success;
    } catch (error) {
      console.error('[RealtimeSync] Connection failed:', error);
      return false;
    }
  }, [deviceId]);

  // Disconnect from real-time sync
  const disconnect = useCallback(() => {
    realtimeSync.disconnect();
    updateStatus({
      connected: false,
      isRealtime: false
    });
  }, []);

  // Reconnect to real-time sync
  const reconnect = useCallback(async (): Promise<boolean> => {
    return await realtimeSync.reconnect();
  }, []);

  // Join device room
  const joinDevice = useCallback((deviceId: string) => {
    realtimeSync.joinDeviceRoom(deviceId);
  }, []);

  // Leave device room
  const leaveDevice = useCallback((deviceId: string) => {
    realtimeSync.leaveDeviceRoom(deviceId);
  }, []);

  // Toggle real-time sync
  const toggleRealtime = useCallback(() => {
    if (state.connected) {
      disconnect();
    } else {
      connect();
    }
  }, [state.connected, connect, disconnect]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    // Subscribe to real-time events
    const unsubscribeTelemetry = realtimeSync.subscribe('telemetry', handleTelemetryUpdate);
    const unsubscribeConnection = realtimeSync.subscribe('connection', handleConnectionChange);
    const unsubscribeError = realtimeSync.subscribe('error', handleError);

    // Store unsubscribe functions
    subscribersRef.current.set('telemetry', unsubscribeTelemetry);
    subscribersRef.current.set('connection', unsubscribeConnection);
    subscribersRef.current.set('error', unsubscribeError);

    // Cleanup on unmount
    return () => {
      unsubscribeTelemetry();
      unsubscribeConnection();
      unsubscribeError();
      if (deviceId) {
        realtimeSync.leaveDeviceRoom(deviceId);
      }
    };
  }, [autoConnect, deviceId, handleTelemetryUpdate, handleConnectionChange, handleError, connect]);

  // Update configuration
  useEffect(() => {
    realtimeSync.updateConfig({
      autoReconnect: true,
      reconnectInterval: 5000
    });
  }, []);

  // Join device room when deviceId changes
  useEffect(() => {
    if (deviceId && state.connected) {
      realtimeSync.joinDeviceRoom(deviceId);
    }
  }, [deviceId, state.connected]);

  return {
    ...state,
    connect,
    disconnect,
    reconnect,
    joinDevice,
    leaveDevice,
    toggleRealtime,
    stats: realtimeSync.getStats()
  };
};
