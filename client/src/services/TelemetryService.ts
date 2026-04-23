import api from "./api";

export interface TelemetryData {
  timestamp: string;
  values: Record<string, number | string | null>;
  deviceId: string;

  // Typed Fields (Phase 1 Alignment)
  level_percentage?: number | null;
  depth_value?: number | null;
  temperature_value?: number | null;
  tdsValue?: number | null;
  tds_value?: number | null;
  flow_rate?: number | null;
  total_liters?: number | null;

  // Normalized Fields (Harden Phase)
  temperature?: number | null;
  humidity?: number | null;
  battery_level?: number | null;
  signal_strength?: number | null;

  // Calculation fields
  waterLevel?: number;
  distance?: number;
}

export interface DeviceMetadata {
  id: string;
  node_key: string | null;
  classification: string;
}

class TelemetryService {
  private static instance: TelemetryService;

  private constructor() { }

  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  /**
   * Fetches real-time telemetry from the hardened FastAPI gateway.
   */
  public async getLiveTelemetry(
    deviceId: string,
  ): Promise<TelemetryData | null> {
    try {
      // Use the actual backend endpoint that exists
      const response = await api.get(`/nodes/${deviceId}/telemetry`);
      const data = response.data;

      if (!data) return null;

      return {
        timestamp: data.last_seen || data.timestamp || new Date().toISOString(),
        values: data.raw_data || data,
        deviceId: deviceId,
        level_percentage: data.level_percentage ?? null,
        depth_value: data.distance ?? null,
        temperature_value: data.temperature ?? data.temp ?? null,
        temperature: data.temperature ?? data.temp ?? null,
        tdsValue: data.tdsValue ?? data.tds_value ?? null,
        flow_rate: data.flow_rate ?? data.flowRate ?? data.waterFlow ?? data.raw_data?.[data.flow_rate_field] ?? data.raw_data?.field3 ?? null,
        total_liters: data.volume ?? data.total_liters ?? data.raw_data?.[data.meter_reading_field] ?? data.raw_data?.field1 ?? null,
        distance: data.distance,
        waterLevel: data.level_percentage,
      };
    } catch (err) {
      console.error(
        "[TelemetryService] Live telemetry fetch failed for",
        deviceId,
        ":",
        err,
      );
      return null;
    }
  }

  /**
   * Fetches historical telemetry from the hardened FastAPI gateway.
   */
  public async getHistoryTelemetry(
    deviceId: string,
  ): Promise<TelemetryData[] | null> {
    try {
      // Use the actual backend endpoint that exists
      const response = await api.get(`/nodes/${deviceId}/analytics`);
      const rawData = response.data;

      if (!rawData || !rawData.history) return null;

      return rawData.history.map((feed: any) => ({
        timestamp: feed.timestamp || feed.created_at,
        values: feed,
        deviceId: deviceId,
        level_percentage: feed.level ?? null,
        total_liters: feed.volume ?? null,
      }));
    } catch (err) {
      console.error(
        "[TelemetryService] History fetch failed for",
        deviceId,
        ":",
        err,
      );
      return null;
    }
  }

  /**
   * Clears local state.
   */
  public clearCache(): void {
  }
}

export const telemetryService = TelemetryService.getInstance();
