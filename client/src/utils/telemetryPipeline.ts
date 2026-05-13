import { computeDeviceStatus } from '../services/DeviceService';

export const computeOnlineStatus = (lastSeen: string | null): 'Online' | 'Offline' => {
    return computeDeviceStatus(lastSeen);
};

/**
 * RAW Authoritative Level Resolver
 * Strictly prefers backend-calculated level_percentage.
 */
import { computeTankMetrics } from './tankCalculations';
import type { TankDimensions } from './tankCalculations';

export const getTankLevel = (node: any, snap: any): number => {
    // 1. Trust pure backend field first (snapshot from telemetryWorker or nodesController)
    const pct = snap?.level_percentage ?? snap?.Level ?? snap?.level ?? 
              node?.telemetry_snapshot?.level_percentage ?? 
              node?.last_telemetry?.level_percentage ?? 
              node?.last_telemetry?.Level;
    
    if (typeof pct === 'number' && !isNaN(pct)) {
        return Math.max(0, Math.min(100, pct));
    }

    // 2. RAW Fallback using unified computeTankMetrics
    const rawSource = snap?.raw_data || snap?.data || snap || node?.last_telemetry || {};
    const mapping = node?.sensor_field_mapping || {};
    const fieldKey = Object.keys(mapping).find(k => mapping[k]?.includes("water_level")) || 
                     (rawSource.field2 !== undefined ? "field2" : "field1");
    
    const distanceVal = rawSource[fieldKey];
    const sensorCm = (distanceVal !== undefined && distanceVal !== null) ? parseFloat(String(distanceVal)) : null;
    
    const dims: TankDimensions = {
        tankShape: node?.tank_shape || node?.configuration?.tank_shape || 'rectangular',
        heightM: node?.configuration?.depth || node?.height_m || node?.depth || 1.2,
        lengthM: node?.configuration?.length_m || node?.length_m || 2.0,
        breadthM: node?.configuration?.breadth_m || node?.breadth_m || 2.0,
        radiusM: node?.configuration?.radius_m || node?.radius_m || 0.6,
        deadBandM: node?.configuration?.dead_band_m || node?.dead_band_m || 0,
        capacityOverrideLitres: node?.configuration?.capacity_liters || node?.capacity || node?.capacity_liters || null
    };

    const metrics = computeTankMetrics({ sensorReadingCm: sensorCm, dims });
    return metrics.percentage;
};

/**
 * ─── RAW PASS-THROUGH ───
 * All client-side signal processing (Kalman filters, etc.) has been removed 
 * to achieve absolute parity with the raw sensor stream.
 */
export const smoothData = (feeds: any[]): any[] => {
    return feeds || []; 
};

/**
 * Format offline status message based on last_seen timestamp
 * Returns: { label: string, istTime: string, hoursOffline: number }
 * - If offline < 24 hours: "Device offline · Last seen X hours/minutes ago"
 * - If offline >= 24 hours: "Device is offline more than 24 hrs - Last seen DD MMM YYYY HH:MM IST"
 */
export const formatOfflineMessage = (lastSeenTs: any): { label: string; istTime: string; hoursOffline: number } => {
    const safeParseDate = (ts: any): Date => {
        if (!ts) return new Date(NaN);
        if (ts instanceof Date) return ts;
        if (typeof ts === 'object') {
            if ('_seconds' in ts) return new Date(ts._seconds * 1000);
            if ('seconds' in ts) return new Date(ts.seconds * 1000);
        }
        if (typeof ts === 'number') {
            return ts < 10000000000 ? new Date(ts * 1000) : new Date(ts);
        }
        const d = new Date(ts);
        if (isNaN(d.getTime()) && typeof ts === 'string' && ts.includes(' ')) {
            return new Date(ts.replace(' ', 'T'));
        }
        return d;
    };

    const lastSeenDate = safeParseDate(lastSeenTs);
    if (isNaN(lastSeenDate.getTime())) {
        return { label: 'Syncing data...', istTime: 'Unknown', hoursOffline: 0 };
    }

    const now = new Date();
    const diffMs = now.getTime() - lastSeenDate.getTime();
    const diffMin = diffMs / 60000;
    const hoursOffline = Math.floor(diffMin / 60);

    // Format IST time (DD MMM YYYY HH:MM IST)
    const formatOptions: Intl.DateTimeFormatOptions = {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata'
    };

    let istTime = 'Unknown';
    try {
        istTime = new Intl.DateTimeFormat('en-IN', formatOptions).format(lastSeenDate).replace(',', '') + ' IST';
    } catch (e) {
        console.error('Date formatting failed:', e);
    }

    // Format label based on duration
    let label = '';
    if (hoursOffline >= 24) {
        label = `Device is offline more than 24 hrs - Last seen ${istTime}`;
    } else if (hoursOffline > 0) {
        label = `Device offline · Last seen ${hoursOffline} hours ago`;
    } else {
        label = `Device offline · Last seen ${Math.max(0, Math.floor(diffMin))} minutes ago`;
    }

    return { label, istTime, hoursOffline };
};
