import api, { socket } from "./api";
import type { Device } from "../types/entities";

export interface MapDevice extends Device {
  hardwareId: string;
  firestore_id?: string;
  name?: string;
  location_name?: string;
  last_online_at?: string | null;
  updatedAt?: string;
  last_telemetry?: any;
  customer_config?: {
    showMap?: boolean;
    [key: string]: any;
  };
  isVisibleToCustomer?: boolean;
}

/**
 * Determine device online/offline status from telemetry timestamp freshness.
 * Standardized to 2 hours threshold as per latest user request.
 */
export function computeDeviceStatus(lastTimestamp: any): "Online" | "Offline" {
  if (!lastTimestamp) return "Offline";

  try {
    let date: Date;
    if (typeof lastTimestamp === 'object' && lastTimestamp !== null) {
      if ('_seconds' in lastTimestamp) {
        date = new Date(lastTimestamp._seconds * 1000);
      } else if ('seconds' in lastTimestamp) {
        date = new Date(lastTimestamp.seconds * 1000);
      } else {
        date = new Date(lastTimestamp as any);
      }
    } else if (typeof lastTimestamp === 'number') {
        date = lastTimestamp < 10000000000 ? new Date(lastTimestamp * 1000) : new Date(lastTimestamp);
    } else {
        const tsStr = String(lastTimestamp).trim();
        // Catch purely numeric strings like "1742721660" which evaluates to Invalid Date in new Date()
        if (/^\d+$/.test(tsStr)) {
            const numericVal = parseInt(tsStr, 10);
            date = numericVal < 10000000000 ? new Date(numericVal * 1000) : new Date(numericVal);
        } else {
            // Let the browser parse the date exactly as it does for the UI "2m ago" string!
            // Do not tamper with the timezone or replace spaces, as it diverges the calculation from StaleDataAge.
            date = new Date(tsStr);
            
            // Safari fallback for '2026-03-23 18:01:00'
            if (isNaN(date.getTime()) && tsStr.includes(' ')) {
                date = new Date(tsStr.replace(' ', 'T'));
            }
        }
    }

    if (isNaN(date.getTime())) return "Offline";

    const ageMs = Date.now() - date.getTime();
    
    // 20 minutes threshold (1,200,000 ms)
    // Matches backend calculation in deviceStateService.js
    if (ageMs < 1200000) {
        return "Online";
    }

    return "Offline";
  } catch (err) {
    return "Offline";
  }
}

export interface ProvisioningResult {
  success: boolean;
  message: string;
  device?: {
    id: string;
    label: string;
  };
}

class NodeService {
  private static instance: NodeService;

  private constructor() { }

  public static getInstance(): NodeService {
    if (!NodeService.instance) {
      NodeService.instance = new NodeService();
    }
    return NodeService.instance;
  }

  /**
   * Standardized mapping function for all node/device data.
   * Centralizes identity extraction, status computation, and category normalization.
   */
  public static mapNodeData(data: any): MapDevice {
    const docId = data.id || data.hardwareId || data.node_id || data.uid;
    const hardwareId = data.node_id || data.hardwareId || docId;
    
    // Determine last communication timestamp for status.
    // Ensure we prioritize EXACT ThingSpeak timestamps (last_seen, last_telemetry.timestamp)
    // BEFORE falling back to last_online_at (which is just when the server polled last).
    const lastSeenTime = 
      data.last_telemetry?.timestamp || 
      data.last_telemetry?.lastUpdatedAt ||
      data.last_telemetry?.last_updated_at ||
      data.last_telemetry?.created_at || 
      data.lastUpdatedAt ||
      data.last_updated_at ||
      data.last_seen || 
      data.last_telemetry_seen || 
      data.last_online_at || 
      null;

    const categoryRaw = (data.device_type || data.assetType || data.asset_type || data.category || "tank").toLowerCase();
    
    // Map to UI-friendly categories used in AllNodes
    let category: 'tank' | 'flow' | 'deep' | 'sump' | 'tds' | 'unknown' = 'unknown';
    if (categoryRaw.includes('tank') || categoryRaw === 'oht') category = 'tank';
    else if (categoryRaw.includes('deep') || categoryRaw.includes('bore')) category = 'deep';
    else if (categoryRaw.includes('flow') || categoryRaw.includes('pump')) category = 'flow';
    else if (categoryRaw.includes('sump')) category = 'sump';
    else if (categoryRaw.includes('tds')) category = 'tds';
    else category = 'unknown';

    const displayName = data.displayName || data.display_name || data.label || hardwareId;

    const conf = data.configuration || {};
    const depthM = conf.depth ?? data.depth ?? data.height_m ?? data.tankHeight ?? data.height ?? data.max_depth ?? 0;
    const capacityLitres = conf.tank_size || data.capacity || data.capacity_liters || data.tank_size || data.tank_capacity || null;

    const safeIso = (dateStr: any): string | null => {
      if (!dateStr) return null;
      try {
        if (typeof dateStr === 'object') {
          if ('_seconds' in dateStr) return new Date(dateStr._seconds * 1000).toISOString();
          if ('seconds' in dateStr) return new Date(dateStr.seconds * 1000).toISOString();
          if (dateStr instanceof Date) return dateStr.toISOString();
        } else if (typeof dateStr === 'number') {
          return new Date(dateStr < 10000000000 ? dateStr * 1000 : dateStr).toISOString();
        } else if (typeof dateStr === 'string' && /^\d+$/.test(dateStr.trim())) {
          const val = parseInt(dateStr.trim(), 10);
          return new Date(val < 10000000000 ? val * 1000 : val).toISOString();
        }
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d.toISOString();
      } catch (e) {
        return null;
      }
    };

    return {
      ...data,
      id: docId,
      firestore_id: docId,
      node_key: hardwareId,
      hardwareId: hardwareId,
      label: data.label || displayName,
      displayName: displayName,
      name: displayName,
      status: computeDeviceStatus(lastSeenTime),
      asset_type: categoryRaw,
      assetType: categoryRaw,
      category: category as any,
      device_type: data.device_type || categoryRaw,
      analytics_template: data.analyticsTemplate || data.analytics_template || (
          category === 'tank' || category === 'sump' ? 'EvaraTank' :
          category === 'flow' ? 'EvaraFlow' :
          category === 'deep' ? 'EvaraDeep' :
          category === 'tds' ? 'EvaraTDS' :
          null  // unknown devices get null, not EvaraTank
      ),
      analyticsTemplate: data.analyticsTemplate || data.analytics_template || (
          category === 'tank' || category === 'sump' ? 'EvaraTank' :
          category === 'flow' ? 'EvaraFlow' :
          category === 'deep' ? 'EvaraDeep' :
          category === 'tds' ? 'EvaraTDS' :
          null
      ),
      last_seen: safeIso(lastSeenTime),
      last_online_at: safeIso(lastSeenTime),
      updatedAt: safeIso(lastSeenTime) || new Date().toISOString(),
      location_name: data.location_name || data.community_name || data.zone_name || "Main Site",
      community_name: data.community_name,
      zone_name: data.zone_name,
      communityId: data.community_id || data.communityId,
      zoneId: data.zone_id || data.zoneId,
      capacity: capacityLitres,
      depth: depthM,
      // DRIVER FIX: Elevate telemetry_snapshot as the primary source for last_telemetry.
      // This ensures Dashboard and Map pick up the backend-calculated smoothed values.
      last_telemetry: data.telemetry_snapshot || data.last_telemetry || {
        Level: data.last_level || 0,
        level_percentage: data.last_level || 0,
        total_liters: 0,
        Battery: data.battery_voltage || "4.2V",
        Signal: data.signal_strength || "Good"
      }
    } as any; // Cast as any to satisfy legacy UI property lookups during transition
  }

  /**
   * Replaced onSnapshot with standard polling mechanism
   */
  subscribeToNodeUpdates(
    callback: (payload: any) => void,
    filter?: { community_id?: string },
  ) {
    let timeoutId: any;

    const poll = async () => {
      try {
        const nodes = await this.getMapNodes(filter?.community_id);
        nodes.forEach(node => callback(node));
      } catch (error) {
        console.error("Polling nodes failed", error);
      }
      timeoutId = setTimeout(poll, 15000);
    };

    poll();

    return () => clearTimeout(timeoutId);
  }

  subscribeToNewNodes(
    callback: (payload: any) => void,
    filter?: { community_id?: string },
  ) {
    return this.subscribeToNodeUpdates(callback, filter);
  }

  /**
   * Fetch a single node details via API.
   */
  async getNodeDetails(id: string): Promise<MapDevice> {
    const response = await api.get(`/nodes/${id}`);
    return NodeService.mapNodeData(response.data);
  }

  /**
   * Subscribe to all nodes for map display via WebSockets (with initial API fetch).
   */
  subscribeToMapNodes(
    callback: (nodes: MapDevice[]) => void,
    communityId?: string,
  ) {
    let currentNodes: MapDevice[] = [];
    let isSubscribed = true;

    const updateAndNotify = (updatedNodes: MapDevice[]) => {
      currentNodes = updatedNodes;
      if (isSubscribed) callback(currentNodes);
    };

    // Initial Fetch
    this.getMapNodes(communityId).then(nodes => {
      if (isSubscribed) updateAndNotify(nodes);
    });

    const onTelemetryUpdate = (payload: any) => {
      if (!isSubscribed) return;
      
      // Patch the specific node in our local list
      const index = currentNodes.findIndex(n => n.id === payload.device_id || n.id === payload.id || n.hardwareId === payload.device_id);
      if (index !== -1) {
        const updatedNodes = [...currentNodes];
        updatedNodes[index] = {
          ...updatedNodes[index],
          last_telemetry: {
            ...updatedNodes[index].last_telemetry,
            ...payload
          },
          last_online_at: payload.timestamp || new Date().toISOString(),
          status: "Online" // If we just got a packet, it's online
        };
        updateAndNotify(updatedNodes);
      }
    };

    const setupSocket = () => {
      if (communityId) {
        socket.emit("subscribe_community", communityId);
      }
      socket.on("telemetry_update", onTelemetryUpdate);
    };

    if (socket.connected) {
      setupSocket();
    }
    
    socket.on("connect", setupSocket);

    // Backup Polling (Slow) to ensure we don't miss new nodes added to registry
    const pollInterval = setInterval(() => {
        this.getMapNodes(communityId).then(nodes => {
            if (isSubscribed) updateAndNotify(nodes);
        });
    }, 60000); // 1 minute poll for structural changes

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
      socket.off("telemetry_update", onTelemetryUpdate);
      socket.off("connect", setupSocket);
      if (communityId) {
        socket.emit("unsubscribe_community", communityId);
      }
    };
  }

  /**
   * Fetch all nodes for map display via API.
   */
  async getMapNodes(communityId?: string, customerId?: string): Promise<MapDevice[]> {
    const params: any = {};
    if (communityId) params.community_id = communityId;
    if (customerId) params.customer_id = customerId;

    const response = await api.get("/nodes", { params });
    const allNodes = response.data;

    if (!Array.isArray(allNodes)) return [];

    return allNodes.map((data: any) => NodeService.mapNodeData(data));
  }

  async getMapDevices(communityId?: string): Promise<MapDevice[]> {
    return this.getMapNodes(communityId);
  }

  async createNode(data: any): Promise<ProvisioningResult> {
    const response = await api.post<{ status: string; data: any }>(
      "/nodes",
      data,
    );
    return {
      success: response.data.status === "ok",
      message: response.data.status === "ok" ? "Node provisioned" : "Error",
      device: {
        id: response.data.data.id,
        label: response.data.data.displayName,
      },
    };
  }

  async exportNodeReadings(id: string): Promise<void> {
    const response = await api.get(`/reports/node/${id}/export`, {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `node-readings-${id}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async getNodeAnalytics(id: string, params?: { range?: string; startDate?: string; endDate?: string }): Promise<any> {
    const response = await api.get(`/nodes/${id}/analytics`, { params });
    return response.data;
  }

  async getNodeTelemetry(id: string): Promise<any> {
    const response = await api.get(`/nodes/${id}/telemetry`);
    return response.data;
  }
}

export const deviceService = NodeService.getInstance();
