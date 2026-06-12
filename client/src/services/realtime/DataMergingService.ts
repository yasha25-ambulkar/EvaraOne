/**
 * Unified Data Merging Service
 * Standardizes data merging across all analytics pages
 */

import { fieldMappingService, type FieldMappingResult } from './FieldMappingService';

export interface TelemetryPoint {
  timestamp: string;
  level_percentage?: number;
  total_liters?: number;
  flow_rate?: number;
  distance?: number;
  temperature?: number;
  _source: 'thingspeak' | 'local' | 'realtime';
  raw_data?: any;
  // Added processed data fields
  is_corrected?: boolean;
  original_value?: number;
  confidence?: number;
  // ENHANCED: Add conditional processing fields
  data_label?: 'RAW' | 'CORRECTED' | 'PREDICTED';
  prediction_mode?: boolean;
  consecutive_anomalies?: number;
}

export interface MergedDataResult {
  mergedData: TelemetryPoint[];
  latestPoint: TelemetryPoint | null;
  dataPoints: number;
  timeRange: { start: string; end: string } | null;
}

class DataMergingService {
  private static instance: DataMergingService;

  private constructor() {}

  public static getInstance(): DataMergingService {
    if (!DataMergingService.instance) {
      DataMergingService.instance = new DataMergingService();
    }
    return DataMergingService.instance;
  }

  /**
   * Unified data merging for all device types
   */
  public mergeDataSources(
    historyData: any[],
    liveData: any[],
    latestTelemetry: any,
    deviceType: string,
    config?: any
  ): MergedDataResult {
    const fieldMapping = fieldMappingService.getFieldMapping(deviceType, config);
    
    // Process all data sources through unified pipeline
    const processedHistory = this.processDataPoints(historyData, fieldMapping, 'thingspeak');
    const processedLiveData = this.processDataPoints(liveData, fieldMapping, 'realtime');
    
    // CRITICAL FIX: Process latest telemetry with highest priority
    const processedLatest = latestTelemetry ? 
      this.processDataPoints([latestTelemetry], fieldMapping, 'realtime') : [];
    
    // Combine and deduplicate with priority: realtime > local > thingspeak
    const allPoints = [...processedHistory, ...processedLiveData, ...processedLatest];
    const mergedData = this.deduplicateByTimestamp(allPoints);
    
    // Sort by timestamp
    mergedData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      mergedData,
      latestPoint: mergedData.length > 0 ? mergedData[mergedData.length - 1] : null,
      dataPoints: mergedData.length,
      timeRange: mergedData.length > 0 ? {
        start: mergedData[0].timestamp,
        end: mergedData[mergedData.length - 1].timestamp
      } : null
    };
  }

  /**
   * Process raw data points with standardized field mapping
   */
  private processDataPoints(
    rawPoints: any[],
    fieldMapping: FieldMappingResult,
    source: 'thingspeak' | 'local' | 'realtime'
  ): TelemetryPoint[] {
    return rawPoints
      .map(point => this.processSinglePoint(point, fieldMapping, source))
      .filter(point => point !== null) as TelemetryPoint[];
  }

  /**
   * Process single data point
   */
  private processSinglePoint(
    point: any,
    fieldMapping: FieldMappingResult,
    source: 'thingspeak' | 'local' | 'realtime'
  ): TelemetryPoint | null {
    if (!point) return null;

    // Extract timestamp with fallbacks
    const timestamp = point.timestamp || 
                     point.created_at || 
                     point.time || 
                     new Date().toISOString();

    if (!timestamp) return null;

    // Extract fields using unified mapping
    const fields = fieldMappingService.extractAllFields(point.raw_data || point, fieldMapping);

    return {
      timestamp,
      // DATA PARITY: Prioritize backend-processed level_percentage over raw field re-derivation
      // This ensures the graph shows the SAME value the tank display shows
      level_percentage: point.level_percentage ?? point.level ?? point.percentage ?? fields.waterLevel,
      total_liters: fields.totalizer ?? point.total_liters ?? point.volume ?? point.currentVolume,
      flow_rate: fields.flowRate ?? point.flow_rate,
      distance: fields.depth ?? point.distance ?? point.distance_cm,
      temperature: fields.temperature ?? point.temperature,
      is_corrected: point.is_corrected ?? point.is_predicted ?? false,
      original_value: point.original_value,
      confidence: point.confidence,
      // ENHANCED: Add conditional processing labels
      data_label: point.data_label || 'RAW',
      prediction_mode: point.prediction_mode || false,
      consecutive_anomalies: point.consecutive_anomalies || 0,
      _source: source,
      raw_data: point
    };
  }

  /**
   * Deduplicate data points by timestamp (10-second buckets)
   */
  private deduplicateByTimestamp(points: TelemetryPoint[]): TelemetryPoint[] {
    const seen = new Map<number, TelemetryPoint>();
    
    points.forEach(point => {
      const timestamp = new Date(point.timestamp).getTime();
      const bucketKey = Math.floor(timestamp / 10000) * 10000; // 10-second buckets
      
      if (!seen.has(bucketKey)) {
        seen.set(bucketKey, point);
      } else {
        // Prefer realtime data over cached data
        const existing = seen.get(bucketKey)!;
        if (point._source === 'realtime' && existing._source !== 'realtime') {
          seen.set(bucketKey, point);
        }
      }
    });

    return Array.from(seen.values()).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * Get chart-ready data with time formatting and smoothing
   */
  public getChartData(
    mergedData: TelemetryPoint[],
    limit: number = 1000,
    capacity?: number
  ): Array<{
    time: string;
    timestamp: string;
    level: number;
    volume: number;
    flowRate?: number;
    temperature?: number;
    is_corrected: boolean;
    original_value?: number;
    confidence?: number;
  }> {
    const limitedData = mergedData.slice(-limit);
    
    // Step 1: Remove trend anomalies (catches spikes in raw ThingSpeak history)
    const cleanedData = this.removeTrendAnomalies(limitedData);
    
    // Step 2: Apply Exponential Moving Average (EMA) for visual smoothing
    // This removes the "noisy" zig-zags as requested by the user.
    const smoothedData = this.applyExponentialSmoothing(cleanedData, 0.2);

    // Step 3: Detect capacity so volume tracks level perfectly
    // capacity = max_volume_in_data / (corresponding_level / 100)
    let detectedCapacity = 0;
    for (const pt of smoothedData) {
      const lv = pt.level_percentage || 0;
      const vol = pt.total_liters || 0;
      if (lv > 5 && vol > 0) {
        const cap = (vol / lv) * 100;
        if (cap > detectedCapacity) detectedCapacity = cap;
      }
    }
    
    return smoothedData.map(point => {
      const date = new Date(point.timestamp);
      const timeStr = `${date.getHours().toString().padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

      const cleanedLevel = Math.max(0, Math.min(100, point.level_percentage || 0));
      // Derive volume from provided capacity or detected capacity
      const effectiveCapacity = capacity || detectedCapacity;
      const derivedVolume = effectiveCapacity > 0
        ? Math.round((cleanedLevel / 100) * effectiveCapacity)
        : Math.max(0, point.total_liters || 0);

      return {
        time: timeStr,
        timestamp: point.timestamp,
        level: cleanedLevel,
        volume: derivedVolume,
        flowRate: point.flow_rate,
        temperature: point.temperature,
        is_corrected: point.is_corrected || false,
        original_value: point.original_value,
        confidence: point.confidence,
        data_label: point.data_label || 'RAW',
        prediction_mode: point.prediction_mode || false,
        consecutive_anomalies: point.consecutive_anomalies || 0
      };
    });
  }

  /**
   * Multi-pass trend-based anomaly removal
   * Handles burst anomalies of 20-30 consecutive spike points
   * Pass 1: Build stable baseline from accepted points
   * Pass 1: Forward scan comparing each point to a stable baseline
   * Pass 2: Replace rejected points with linearly interpolated values
   */
  private removeTrendAnomalies(data: TelemetryPoint[]): TelemetryPoint[] {
    if (data.length < 5) return data;

    const MAX_DELTA = 2.0; // Max 2% jump allowed in one step
    const RETURN_WINDOW = 8; // How many future points to check for return to baseline
    const RETURN_THRESHOLD = 3.0; // Must return within 3% of baseline to be "coming back"

    // ── Pass 1: Forward-scan anomaly detection ──
    const accepted: boolean[] = new Array(data.length).fill(true);
    let baseline = data[0].level_percentage || 0; // Established baseline

    for (let i = 1; i < data.length; i++) {
      const level = data[i].level_percentage || 0;
      if (level <= 0) { accepted[i] = false; continue; }

      const deltaFromBaseline = Math.abs(level - baseline);

      if (deltaFromBaseline <= MAX_DELTA) {
        // Within normal range — accept and update baseline gradually
        baseline = baseline * 0.8 + level * 0.2; // Slow-moving baseline
        continue;
      }

      // Big jump detected. Is this a real shift or a spike burst?
      // Check: do the FUTURE points return to the current baseline?
      let returnsToBaseline = false;
      for (let k = i + 1; k < Math.min(i + RETURN_WINDOW, data.length); k++) {
        const futureLevel = data[k].level_percentage || 0;
        if (Math.abs(futureLevel - baseline) <= RETURN_THRESHOLD) {
          // Future point returns close to baseline — this IS a spike
          returnsToBaseline = true;
          break;
        }
      }

      if (returnsToBaseline) {
        // This is a temporary spike — reject it (and it will be interpolated later)
        accepted[i] = false;
      } else {
        // No return to baseline in the next 8 points. This is a genuine level change.
        // Accept it and shift baseline
        baseline = level;
      }
    }

    // ── Pass 2: Backward sweep to catch trailing spikes ──
    baseline = data[data.length - 1].level_percentage || 0;
    for (let i = data.length - 2; i >= 0; i--) {
      if (!accepted[i]) continue;
      const level = data[i].level_percentage || 0;
      if (level <= 0) continue;

      const delta = Math.abs(level - baseline);
      if (delta <= MAX_DELTA) {
        baseline = baseline * 0.8 + level * 0.2;
      } else {
        // Check if this isolated point disagrees with both neighbors
        const prevAccepted = this.findNearestAccepted(data, accepted, i, -1);
        const nextAccepted = this.findNearestAccepted(data, accepted, i, 1);
        
        if (prevAccepted !== null && nextAccepted !== null) {
          const neighborAvg = (prevAccepted + nextAccepted) / 2;
          if (Math.abs(level - neighborAvg) > MAX_DELTA * 2) {
            accepted[i] = false;
          }
        }
        baseline = level;
      }
    }

    // ── Pass 3: Replace rejected points with interpolated values ──
    const result: TelemetryPoint[] = [];

    for (let i = 0; i < data.length; i++) {
      if (accepted[i]) {
        result.push(data[i]);
      } else {
        const prevValue = this.findNearestAccepted(data, accepted, i, -1) || baseline;
        const nextValue = this.findNearestAccepted(data, accepted, i, 1) || prevValue;
        const interpolated = (prevValue + nextValue) / 2;

        result.push({
          ...data[i],
          level_percentage: interpolated,
          total_liters: data[i].total_liters,
        });
      }
    }

    return result;
  }

  private findNearestAccepted(data: TelemetryPoint[], accepted: boolean[], from: number, direction: 1 | -1): number | null {
    for (let i = from + direction; i >= 0 && i < data.length; i += direction) {
      if (accepted[i]) return data[i].level_percentage || 0;
    }
    return null;
  }

  // CONDITIONAL smoothing: only smooth CORRECTED/PREDICTED points, RAW passes through untouched
  private applyExponentialSmoothing(data: TelemetryPoint[], alpha: number = 0.3): TelemetryPoint[] {
    if (data.length === 0) return data;
    
    const smoothed: TelemetryPoint[] = [];
    let lastSmoothedLevel = data[0].level_percentage || 0;
    let lastSmoothedVolume = data[0].total_liters || 0;
    
    data.forEach((point, index) => {
      if (index === 0) {
        smoothed.push(point);
      } else if (point.data_label === 'RAW') {
        // RAW data: pass through untouched — preserve real sensor readings
        lastSmoothedLevel = point.level_percentage || 0;
        lastSmoothedVolume = point.total_liters || 0;
        smoothed.push(point);
      } else {
        // CORRECTED/PREDICTED data: apply exponential smoothing for visual continuity
        const smoothedLevel = alpha * (point.level_percentage || 0) + (1 - alpha) * lastSmoothedLevel;
        const smoothedVolume = alpha * (point.total_liters || 0) + (1 - alpha) * lastSmoothedVolume;
        
        lastSmoothedLevel = smoothedLevel;
        lastSmoothedVolume = smoothedVolume;
        
        smoothed.push({
          ...point,
          level_percentage: smoothedLevel,
          total_liters: smoothedVolume
        });
      }
    });
    
    return smoothed;
  }

  /**
   * Calculate data quality metrics
   */
  public getDataQuality(mergedData: TelemetryPoint[]): {
    completeness: number;
    recency: number;
    consistency: number;
  } {
    if (mergedData.length === 0) {
      return { completeness: 0, recency: 0, consistency: 0 };
    }

    const now = new Date().getTime();
    const latestTimestamp = new Date(mergedData[mergedData.length - 1].timestamp).getTime();
    
    // Completeness: % of points with valid data
    const validPoints = mergedData.filter(p => 
      p.level_percentage !== null && 
      !isNaN(p.level_percentage || NaN)
    ).length;
    const completeness = (validPoints / mergedData.length) * 100;

    // Recency: How recent is the latest data (0-100%)
    const ageMinutes = (now - latestTimestamp) / (1000 * 60);
    const recency = Math.max(0, Math.min(100, 100 - (ageMinutes / 60) * 100)); // Decay over 1 hour

    // Consistency: Time interval regularity
    const intervals = [];
    for (let i = 1; i < Math.min(mergedData.length, 10); i++) {
      const interval = new Date(mergedData[i].timestamp).getTime() - 
                     new Date(mergedData[i - 1].timestamp).getTime();
      intervals.push(interval);
    }
    
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const consistency = Math.max(0, 100 - (variance / (avgInterval * avgInterval)) * 100);

    return {
      completeness: Math.round(completeness),
      recency: Math.round(recency),
      consistency: Math.round(consistency)
    };
  }
}

export const dataMergingService = DataMergingService.getInstance();
