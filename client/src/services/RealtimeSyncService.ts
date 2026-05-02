/**
 * Real-Time Sync Service
 * Handles WebSocket connections and real-time data synchronization
 */

import { io, Socket } from 'socket.io-client';
import { getAuth } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';

interface RealtimeConfig {
  enabled: boolean;
  autoReconnect: boolean;
  reconnectInterval: number;
  heartbeatInterval: number;
}

interface SyncStatus {
  connected: boolean;
  lastSync: string | null;
  errorCount: number;
  reconnectAttempts: number;
}

class RealtimeSyncService {
  private socket: Socket | null = null;
  private config: RealtimeConfig;
  private status: SyncStatus;
  private subscribers: Map<string, Set<Function>> = new Map();
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;

  constructor() {
    this.config = {
      enabled: true,
      autoReconnect: true,
      reconnectInterval: 5000,
      heartbeatInterval: 30000
    };

    this.status = {
      connected: false,
      lastSync: null,
      errorCount: 0,
      reconnectAttempts: 0
    };
  }

  // Initialize WebSocket connection
  async connect(token: string): Promise<boolean> {
    try {
      if (this.socket?.connected) {
        return true;
      }

      const SOCKET_URL = import.meta.env.VITE_WS_URL || (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api/v1', '') : 'http://localhost:8000');
      this.socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        timeout: 20000,
        forceNew: true
      });

      this.setupEventHandlers();
      
      return new Promise((resolve) => {
        this.socket!.on('connect', () => {
          this.status.connected = true;
          this.status.lastSync = new Date().toISOString();
          this.status.reconnectAttempts = 0;
          this.startHeartbeat();
          this.notifySubscribers('connection', { connected: true });
          resolve(true);
        });

        this.socket!.on('connect_error', (error) => {
          console.error('[RealtimeSync] Connection error:', error);
          this.status.errorCount++;
          this.notifySubscribers('connection', { connected: false, error });
          resolve(false);
        });
      });

    } catch (error) {
      console.error('[RealtimeSync] Connection failed:', error);
      return false;
    }
  }

  // Setup WebSocket event handlers
  private setupEventHandlers() {
    if (!this.socket) return;

    // Real-time telemetry updates
    this.socket.on('telemetry_update', (data) => {
      this.status.lastSync = new Date().toISOString();
      this.notifySubscribers('telemetry', data);
    });

    // Device status changes
    this.socket.on('device_status', (data) => {
      this.notifySubscribers('device_status', data);
    });

    // System notifications
    this.socket.on('system_notification', (data) => {
      this.notifySubscribers('notification', data);
    });

    // Connection events
    this.socket.on('disconnect', (reason) => {
      console.log('[RealtimeSync] Disconnected:', reason);
      this.status.connected = false;
      this.notifySubscribers('connection', { connected: false, reason });
      this.handleReconnect();
    });

    this.socket.on('error', (error) => {
      console.error('[RealtimeSync] Socket error:', error);
      this.status.errorCount++;
      this.notifySubscribers('error', error);
    });
  }

  // Handle automatic reconnection
  private handleReconnect() {
    if (!this.config.autoReconnect) return;

    this.clearTimers();

    this.reconnectTimer = setTimeout(() => {
      if (this.status.reconnectAttempts < 10) {
        console.log(`[RealtimeSync] Reconnection attempt ${this.status.reconnectAttempts + 1}`);
        this.status.reconnectAttempts++;
        // Reconnect using stored token
        this.reconnect();
      }
    }, this.config.reconnectInterval);
  }

  // Start heartbeat to keep connection alive
  private startHeartbeat() {
    this.clearTimers();

    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('heartbeat', { timestamp: Date.now() });
      }
    }, this.config.heartbeatInterval);
  }

  // Clear all timers
  private clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // Subscribe to specific data types
  subscribe(eventType: string, callback: Function): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    
    this.subscribers.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(eventType);
        }
      }
    };
  }

  // Notify all subscribers of an event
  private notifySubscribers(eventType: string, data: any) {
    const callbacks = this.subscribers.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[RealtimeSync] Error in subscriber callback:`, error);
        }
      });
    }
  }

  // Join device-specific rooms for targeted updates
  joinDeviceRoom(deviceId: string) {
    if (this.socket?.connected) {
      this.socket.emit('join_device_room', { deviceId });
      console.log(`[RealtimeSync] Joined device room: ${deviceId}`);
    }
  }

  // Leave device room
  leaveDeviceRoom(deviceId: string) {
    if (this.socket?.connected) {
      this.socket.emit('leave_device_room', { deviceId });
      console.log(`[RealtimeSync] Left device room: ${deviceId}`);
    }
  }

  // Manual reconnection
  async reconnect(): Promise<boolean> {
    const auth = useAuth();
    const firebaseAuth = getAuth();
    
    if (!auth.user || !firebaseAuth.currentUser) return false;
    
    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      if (!token) return false;
      
      this.disconnect();
      return await this.connect(token);
    } catch (error) {
      console.error('[RealtimeSync] Failed to get token:', error);
      return false;
    }
  }

  // Disconnect from WebSocket
  disconnect() {
    this.clearTimers();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.status.connected = false;
    this.subscribers.clear();
  }

  // Get current connection status
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  // Get connection statistics
  getStats() {
    return {
      connected: this.status.connected,
      lastSync: this.status.lastSync,
      errorCount: this.status.errorCount,
      reconnectAttempts: this.status.reconnectAttempts,
      uptime: this.status.connected ? Date.now() - (this.status.lastSync ? new Date(this.status.lastSync).getTime() : Date.now()) : 0,
      subscribers: Array.from(this.subscribers.entries()).map(([type, callbacks]) => ({
        type,
        count: callbacks.size
      }))
    };
  }

  // Enable/disable real-time sync
  setEnabled(enabled: boolean) {
    this.config.enabled = enabled;
    if (!enabled && this.socket?.connected) {
      this.disconnect();
    }
  }

  // Update configuration
  updateConfig(newConfig: Partial<RealtimeConfig>) {
    this.config = { ...this.config, ...newConfig };
  }
}

// Singleton instance
const realtimeSync = new RealtimeSyncService();
export default realtimeSync;
