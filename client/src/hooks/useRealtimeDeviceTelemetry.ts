/**
 * useRealtimeDeviceTelemetry.ts
 *
 * CANONICAL real-time telemetry hook - single source of truth for device data
 *
 * Replaces:
 *  - useTelemetry.ts (old socket-based)
 *  - useRealtimeTelemetry.ts (old socket-based)
 *  - useTelemetryLatest.ts (old polling-based)
 *
 * Features:
 *  - WebSocket-first: subscribes to real-time device updates
 *  - Polling fallback: activates if WebSocket unavailable
 *  - Single data source: no duplicate updates or race conditions
 *  - Automatic cleanup: unsubscribes on unmount
 *  - Error handling: graceful degradation on failures
 *  - Loading states: distinguishes between connecting/connected/error
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './useSocket';

export interface RealtimeDeviceTelemetryOptions {
  /** Enable polling fallback if socket unavailable (default: true) */
  enablePolling?: boolean;
  /** Polling interval in milliseconds (default: 60000 = 60s) */
  pollingInterval?: number;
  /** Maximum retry attempts before giving up (default: 3) */
  retryAttempts?: number;
  /** Callback on errors */
  onError?: (error: Error) => void;
}

export interface RealtimeDeviceTelemetryState {
  /** Latest telemetry data from device */
  data: any | null;
  /** Current connection status */
  status: 'connecting' | 'connected' | 'polling' | 'disconnected' | 'error';
  /** Any error that occurred */
  error: Error | null;
  /** True while loading initial data */
  isLoading: boolean;
  /** True if using polling fallback instead of WebSocket */
  isPollingFallback: boolean;
}

/**
 * Hook for subscribing to real-time device telemetry
 *
 * Usage:
 * ```
 * const { data, status, error, isLoading } = useRealtimeDeviceTelemetry(deviceId, {
 *   enablePolling: true,
 *   pollingInterval: 60000,
 * });
 * ```
 *
 * Data flow:
 * 1. Connect to WebSocket
 * 2. Emit 'subscribe_device' event
 * 3. Listen for 'telemetry:update' events
 * 4. If socket disconnects: fallback to polling
 * 5. On unmount: emit 'unsubscribe_device' and cleanup
 */
export function useRealtimeDeviceTelemetry(
  deviceId: string | null | undefined,
  options: RealtimeDeviceTelemetryOptions = {}
): RealtimeDeviceTelemetryState {
  const {
    enablePolling = true,
    pollingInterval = 60000,
    retryAttempts = 3,
    onError,
  } = options;

  const socket = useSocket();
  const [data, setData] = useState<any | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'polling' | 'disconnected' | 'error'>('connecting');
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(!data);
  const [isPollingFallback, setIsPollingFallback] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const isSubscribedRef = useRef(false);

  // Fetch telemetry via HTTP polling fallback
  const fetchTelemetryViaPolling = useCallback(async () => {
    if (!deviceId) return;

    try {
      const response = await fetch(`/api/v1/devices/${deviceId}/telemetry`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const newData = await response.json();
      setData(newData);
      setStatus('polling');
      setIsPollingFallback(true);
      setError(null);
      retryCountRef.current = 0; // Reset retry count on success
      setIsLoading(false);
    } catch (err) {
      retryCountRef.current++;
      const errObj = err instanceof Error ? err : new Error(String(err));

      if (retryCountRef.current >= retryAttempts) {
        setStatus('error');
        setError(errObj);
        onError?.(errObj);
        // Stop polling after max retries
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    }
  }, [deviceId, retryAttempts, onError]);

  // Start polling
  const startPolling = useCallback(() => {
    if (!enablePolling || pollingRef.current) return;

    setIsPollingFallback(true);
    fetchTelemetryViaPolling(); // Initial fetch
    pollingRef.current = setInterval(fetchTelemetryViaPolling, pollingInterval);
  }, [enablePolling, pollingInterval, fetchTelemetryViaPolling]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
      setIsPollingFallback(false);
    }
  }, []);

  // Subscribe to device via WebSocket
  const subscribe = useCallback(() => {
    if (!socket || !deviceId || isSubscribedRef.current) return;

    try {
      socket.emit('subscribe_device', { deviceId }, (ack: any) => {
        if (ack?.error) {
          const err = new Error(ack.error);
          setError(err);
          setStatus('error');
          onError?.(err);
          // Fallback to polling on subscription error
          if (enablePolling) startPolling();
        } else {
          setStatus('connected');
          setError(null);
          stopPolling(); // Stop polling if socket is working
          setIsLoading(false);
        }
      });

      isSubscribedRef.current = true;
    } catch (err) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      setError(errObj);
      onError?.(errObj);
      if (enablePolling) startPolling();
    }
  }, [socket, deviceId, enablePolling, startPolling, stopPolling, onError]);

  // Unsubscribe from device via WebSocket
  const unsubscribe = useCallback(() => {
    if (!socket || !deviceId || !isSubscribedRef.current) return;

    try {
      socket.emit('unsubscribe_device', { deviceId });
      isSubscribedRef.current = false;
    } catch (err) {
      console.error('[useRealtimeDeviceTelemetry] Unsubscribe failed:', err);
    }
  }, [socket, deviceId]);

  // Handle incoming telemetry updates
  useEffect(() => {
    if (!socket) return;

    const handleTelemetryUpdate = (payload: any) => {
      if (payload.deviceId === deviceId) {
        setData(payload.data);
        setStatus('connected');
        setError(null);
        stopPolling(); // Socket is active, stop polling
        setIsLoading(false);
      }
    };

    socket.on('telemetry:update', handleTelemetryUpdate);

    return () => {
      socket.off('telemetry:update', handleTelemetryUpdate);
    };
  }, [socket, deviceId, stopPolling]);

  // Handle socket connection state
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      if (deviceId && isSubscribedRef.current) {
        setStatus('connecting');
        subscribe();
      }
    };

    const handleDisconnect = () => {
      if (enablePolling) {
        startPolling();
      } else {
        setStatus('disconnected');
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket, deviceId, enablePolling, subscribe, startPolling]);

  // Main effect: subscribe on mount, unsubscribe on unmount
  useEffect(() => {
    if (!deviceId) {
      setStatus('disconnected');
      setData(null);
      return;
    }

    if (socket?.connected) {
      setStatus('connecting');
      subscribe();
    } else if (enablePolling) {
      startPolling();
    } else {
      setStatus('disconnected');
    }

    // Cleanup on unmount
    return () => {
      unsubscribe();
      stopPolling();
    };
  }, [deviceId, socket?.connected, subscribe, unsubscribe, enablePolling, startPolling, stopPolling]);

  return {
    data,
    status,
    error,
    isLoading,
    isPollingFallback,
  };
}
