import { useState, useMemo, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { Info, Settings, Droplets, Bell, Timer } from 'lucide-react';
import {
    ComposedChart, Area, AreaChart,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer
} from 'recharts';
import { useStaleDataAge } from '../hooks/useStaleDataAge';
import { useDeviceAnalytics } from '../hooks/useDeviceAnalytics';
import { useRealtimeTelemetry } from '../hooks/useRealtimeTelemetry';
import { useFirestoreFlowData } from '../hooks/useFirestoreFlowData';
import type { NodeInfoData } from '../hooks/useDeviceAnalytics';
import { computeOnlineStatus, formatOfflineMessage } from '../utils/telemetryPipeline';
import type { FlowConfig } from '../hooks/useDeviceConfig';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TelemetryPayload {
    timestamp: string;
    data: { entry_id: number;[key: string]: unknown };
    flow_rate?: number;
    total_liters?: number;
}

const formatKPIValue = (val: number, isOffline?: boolean) =>
    (isOffline || val == null || isNaN(val) || !isFinite(val)) ? '—' : val.toLocaleString(undefined, { useGrouping: false, maximumFractionDigits: 0 });

const formatMeterValue = (val: number, isOffline?: boolean) =>
    (isOffline || val == null || isNaN(val) || !isFinite(val)) ? '—' : val.toFixed(2);

/**
 * Robust date parser to handle Firestore Timestamps, ISO strings, and numeric timestamps.
 */
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

// ─── Subcomponents ────────────────────────────────────────────────────────────

// ─── Subcomponents ────────────────────────────────────────────────────────────



/** Consumption Pattern (Area chart) */
const ConsumptionPatternCard = ({ history }: { history: { date?: Date, time: string; value: number }[] }) => {
    const [period, setPeriod] = useState<'1H' | '24H' | '1W' | '1M' | 'RANGE'>('1H');
    const [rangeStart, setRangeStart] = useState<string>('');
    const [rangeEnd, setRangeEnd] = useState<string>('');

    const chartData = useMemo(() => {
        if (history.length === 0) return [];

        if (period === '1H') {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            let sorted = [...history].map((d) => ({
                ...d,
                timestampMs: new Date(d.date!).getTime(),
                current: d.value || 0
            })).sort((a, b) => a.timestampMs - b.timestampMs)
                .filter(d => d.timestampMs >= oneHourAgo.getTime());

            if (sorted.length === 0) return [];

            const interpolated = [];
            const startBoundary = Math.floor(oneHourAgo.getTime() / 60000) * 60000;
            const endBoundary = Math.floor(now.getTime() / 60000) * 60000;

            for (let t = startBoundary; t <= endBoundary; t += 60000) {
                let dataIdx = 0;
                while (dataIdx < sorted.length - 1 && sorted[dataIdx + 1].timestampMs <= t) {
                    dataIdx++;
                }
                const point = sorted[dataIdx];
                const nextPoint = sorted[dataIdx + 1];
                let value = point?.current || 0;
                if (nextPoint && point && nextPoint.timestampMs !== point.timestampMs) {
                    const progress = (t - point.timestampMs) / (nextPoint.timestampMs - point.timestampMs);
                    value = point.current + (nextPoint.current - point.current) * progress;
                }
                interpolated.push({
                    timestampMs: t,
                    time: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    fullTime: new Date(t).toLocaleString(),
                    label: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    current: value
                });
            }
            return interpolated;
        } else if (period === '24H') {
            let sorted = [...history].map((d) => ({
                ...d,
                timestampMs: new Date(d.date!).getTime(),
                current: d.value || 0
            })).sort((a, b) => a.timestampMs - b.timestampMs);

            if (sorted.length === 0) return [];

            const now = Date.now();
            const latestBoundary = Math.floor(now / (15 * 60000)) * (15 * 60000);
            const startBoundary = latestBoundary - (24 * 60 * 60000);

            const interpolated = [];
            for (let t = startBoundary; t <= latestBoundary; t += 60000) {
                let dataIdx = 0;
                while (dataIdx < sorted.length - 1 && sorted[dataIdx + 1].timestampMs <= t) {
                    dataIdx++;
                }

                let point = {
                    timestampMs: t,
                    label: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    fullTime: new Date(t).toLocaleString(),
                    current: 0
                };

                if (dataIdx >= sorted.length - 1) {
                    point.current = sorted[sorted.length - 1].current;
                } else if (sorted[dataIdx].timestampMs > t) {
                    point.current = sorted[0].current;
                } else {
                    const p1 = sorted[dataIdx];
                    const p2 = sorted[dataIdx + 1];
                    const ratio = (t - p1.timestampMs) / Math.max(1, p2.timestampMs - p1.timestampMs);
                    point.current = p1.current + (p2.current - p1.current) * ratio;
                }
                interpolated.push(point);
            }
            return interpolated;
        } else if (period === '1W' || period === '1M') {
            return history.map(d => ({ label: d.time, current: d.value }));
        } else if (period === 'RANGE') {
            if (!rangeStart || !rangeEnd) return [];
            const start = new Date(rangeStart);
            const end = new Date(rangeEnd);
            end.setHours(23, 59, 59);
            return history
                .filter(d => d.date && d.date >= start && d.date <= end)
                .map(d => ({ label: d.time, current: d.value }));
        }
        return [];
    }, [history, period, rangeStart, rangeEnd]);

    const peakUsage = useMemo(() => {
        if (chartData.length === 0) return 0;
        return Math.max(...chartData.map(d => d.current || 0));
    }, [chartData]);

    return (
        <div className="apple-glass-card p-6 flex flex-col w-full flex-grow" style={{ 
            background: "var(--card-bg)", 
            border: '1px solid var(--card-border)', 
            minHeight: '350px',
            borderRadius: '2.5rem'
        }}>
            <div className="flex flex-row justify-between items-start mb-6">
        <div className="flex flex-col">
                    <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>Consumption Pattern</h3>
                    <div className="flex items-center gap-4 mt-1">
                        <div className="flex flex-col">
                            <span style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Peak Usage</span>
                            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{peakUsage.toFixed(1)} <span style={{ fontSize: '11px', fontWeight: 700 }}>L/min</span></span>
                        </div>
                    </div>
                </div>
                
                <div className="flex flex-col items-end gap-3">
                    <div className="flex p-1 rounded-full border relative overflow-hidden shrink-0 shadow-inner" style={{ background: 'var(--bg-primary)', borderColor: 'var(--card-border)' }}>
                        {(['1H', '24H', '1W', '1M', 'RANGE'] as const).map((r) => (
                            <button
                                key={r}
                                onClick={() => setPeriod(r)}
                                className={`relative z-10 px-4 py-1.5 text-[10px] font-extrabold tracking-widest uppercase rounded-full cursor-pointer transition-all duration-300 ${period === r ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                                style={{
                                    border: 'none',
                                    background: period === r ? '#004F94' : 'transparent',
                                    boxShadow: period === r ? '0 4px 12px rgba(0, 79, 148, 0.25)' : 'none'
                                }}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-grow w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#34C759" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#34C759" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid-color)" />
                        <XAxis 
                            dataKey="label" 
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 600 }}
                            minTickGap={30}
                        />
                        <YAxis 
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 600 }}
                            tickFormatter={(val) => `${val}L/m`}
                        />
                        <Tooltip 
                            content={(props: any) => {
                                const { active, payload } = props;
                                if (!active || !payload || payload.length === 0) return null;
                                return (
                                    <div style={{
                                        borderRadius: '12px',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--card-border)',
                                        padding: '12px 16px',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                                        backdropFilter: 'blur(20px)'
                                    }}>
                                        <p style={{ margin: '0 0 4px 0', fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {payload[0].payload.fullTime || payload[0].payload.label}
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                            <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)' }}>{payload[0].value.toFixed(2)}</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#34C759' }}>L/min</span>
                                        </div>
                                    </div>
                                );
                            }}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="current" 
                            stroke="#34C759" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#usageGradient)" 
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

/** System Dynamics (formerly Avg Flow Rate / Peak Flow) */
const FlowKPICard = ({ avgFlow, className = "" }: { avgFlow: number; className?: string }) => {
    return (
        <div className={`apple-glass-card rounded-2xl p-5 flex flex-col justify-between w-full min-h-[160px] relative overflow-hidden ${className}`} style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)' }}>
            <div className="flex justify-between items-center w-full">
                <div className="flex items-center justify-center rounded-xl w-8 h-8" style={{ background: 'rgba(10,132,255,0.15)' }}>
                    <Droplets size={18} color="#0A84FF" />
                </div>
                <div className="flex items-center gap-2">
                    <button className="bg-transparent border-none p-1 cursor-pointer transition-colors hover:bg-black/5 rounded-full flex items-center justify-center">
                        <Info size={14} color="var(--text-primary)" />
                    </button>
                </div>
            </div>

            <div className="flex flex-col mt-auto pt-1 gap-2">
                <p style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', margin: 0, lineHeight: 1 }}>FLOW RATE</p>
                <div className="flex items-baseline">
                    {Math.abs(avgFlow) > 0 ? (
                        <p className="m-0 tracking-tight" style={{ fontSize: '16px', fontWeight: 900, lineHeight: 1.1, color: "var(--text-primary)" }}>
                            {formatMeterValue(Math.abs(avgFlow))} <span style={{ fontSize: '13px', fontWeight: 700, color: "var(--text-muted)", marginLeft: '1px' }}>L/min</span>
                        </p>
                    ) : (
                        <p className="m-0 tracking-tight" style={{ fontSize: '16px', fontWeight: 900, lineHeight: 1.1, color: "var(--text-primary)" }}>Stable</p>
                    )}
                </div>
            </div>
        </div>
    );
};

/** Alerts Card - Leak Detection, Status Pills, Thresholds */
const AlertsCard = ({ className = "" }: { flowRate: number; maxFlowRate: number; className?: string }) => {
    return (
        <div className={`apple-glass-card rounded-2xl p-5 flex flex-col justify-between w-full min-h-[160px] relative overflow-hidden ${className}`} style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)' }}>
            <div className="flex justify-between items-center w-full">
                <div className="flex items-center justify-center rounded-xl w-8 h-8" style={{ background: 'rgba(175,82,222,0.15)' }}>
                    <Bell size={18} color="#AF52DE" />
                </div>
                <div className="flex items-center gap-2">
                    <button className="bg-transparent border-none p-1 cursor-pointer transition-colors hover:bg-black/5 rounded-full flex items-center justify-center">
                        <Info size={14} color="var(--text-primary)" />
                    </button>
                </div>
            </div>

            <div className="flex flex-col mt-auto pt-1 gap-2">
                <p style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', margin: 0, lineHeight: 1 }}>ALERTS</p>
                <p className="m-0 tracking-tight" style={{ fontSize: '16px', fontWeight: 900, lineHeight: 1.1, color: "var(--text-primary)" }}>Stable</p>
            </div>
        </div>
    );
};

/** Total Flow Rate Card - with Time Filter */
const TotalFlowRateCard = ({ history, flowRate, maxFlowRate, className = "" }: { history: { date?: Date, time: string; value: number }[]; flowRate: number; maxFlowRate: number; className?: string }) => {
    const isNoFlow = flowRate === 0;
    const isSpike = flowRate > maxFlowRate;
    let statusLabel = "Stable";
    let dotColor = "bg-blue-500";

    if (isNoFlow) {
        statusLabel = "Stable";
        dotColor = "bg-blue-500";
    } else if (isSpike) {
        statusLabel = "Warning";
        dotColor = "bg-red-500";
    }

    const totalValue = useMemo(() => {
        if (history.length === 0) return 0;
        return history.reduce((sum, item) => sum + item.value, 0);
    }, [history]);

    return (
        <div className={`apple-glass-card rounded-2xl p-5 flex flex-col justify-between w-full min-h-[160px] relative overflow-hidden h-full ${className}`} style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)' }}>
            <div className="flex justify-between items-center w-full">
                <div className="flex items-center justify-center rounded-xl w-8 h-8" style={{ background: 'rgba(99,102,241,0.15)' }}>
                    <Timer size={18} color="#6366f1" />
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/5">
                    <div className={`w-1.5 h-1.5 rounded-full ${dotColor} shadow-[0_0_8px_${dotColor === 'bg-blue-500' ? 'rgba(59,130,246,0.5)' : 'rgba(239,68,68,0.5)'}]`}></div>
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-tight" style={{ lineHeight: 1 }}>{statusLabel}</span>
                </div>
            </div>

            <div className="flex flex-col mt-auto pt-1 gap-2">
                <p style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', margin: 0, lineHeight: 1 }}>TOTAL FLOW</p>
                <div className="flex items-baseline">
                    <span className="tracking-tight tabular-nums truncate" style={{ fontSize: '16px', fontWeight: 900, lineHeight: 1.1, color: "var(--text-primary)" }}>
                        {formatMeterValue(totalValue)}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: "var(--text-muted)", marginLeft: '1px' }}>L</span>
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const EvaraFlowAnalytics = () => {
    const { hardwareId } = useParams<{ hardwareId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const [fieldTotal, setFieldTotal] = useState('field1');
    const [fieldFlow, setFieldFlow] = useState('field4');

    const [showParams, setShowParams] = useState(false);
    const [showNodeInfo, setShowNodeInfo] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const handleDelete = async () => {
        if (!hardwareId) return;
        setIsDeleting(true);
        try {
            await api.delete(`/admin/nodes/${hardwareId}`);
            navigate('/nodes');
        } catch (err) {
            console.error("Failed to delete node:", err);
            alert("Failed to delete node. Please try again.");
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    const handleSave = useCallback(async () => {
        setSaving(true);
        setSaveError(null);
        try {
            await api.put(`/admin/nodes/${hardwareId}`, {
                flow_rate_field: fieldFlow,
                meter_reading_field: fieldTotal
            });
            await queryClient.invalidateQueries({ queryKey: ['device_config', hardwareId] });
            setShowParams(false);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to save configuration';
            setSaveError(message);
        } finally {
            setSaving(false);
        }
    }, [hardwareId, fieldFlow, fieldTotal, queryClient]);

    const {
        data: unifiedData,
        isLoading: analyticsLoading,
        isFetching: analyticsFetching,
        refetch,
        error: analyticsError,
    } = useDeviceAnalytics(hardwareId, { refetchInterval: 300000 });
    useRealtimeTelemetry(hardwareId);

    // ── Auto-fetch data when device is selected ────────────────────────────────
    useEffect(() => {
        if (hardwareId) {
            // Immediately fetch fresh data from ThingSpeak when device is selected
            refetch();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hardwareId]); // IMPORTANT: Only depend on hardwareId, NOT refetch

    const deviceConfig = ('config' in (unifiedData?.config ?? {})
        ? (unifiedData!.config as any).config
        : undefined) as FlowConfig | undefined;
    const telemetryData = (unifiedData?.latest && !('error' in unifiedData.latest)
        ? unifiedData.latest
        : undefined) as TelemetryPayload | undefined;
    const deviceInfo = (unifiedData?.info && 'data' in (unifiedData.info as any)
        ? (unifiedData.info as any).data
        : undefined) as NodeInfoData | undefined;

    const alertsCount = (deviceInfo as any)?.alerts_count || 0;
    const customerConfig = (deviceInfo as any)?.customer_config || {};
    const isSuperAdmin = user?.role === 'superadmin';

    const showWaterSecurityParam = isSuperAdmin || customerConfig.showWaterSecurity !== false;
    const showSystemDynamicsParam = isSuperAdmin || customerConfig.showSystemDynamics !== false;
    const showAlertsParam = isSuperAdmin || customerConfig.showAlerts !== false;
    const showConsumptionPatternParam = isSuperAdmin || customerConfig.showConsumptionPattern !== false;

    const historyFeeds = (unifiedData?.history as any)?.feeds || [];
    const maxFlowRate = deviceConfig?.max_flow_rate ?? 30;

    useEffect(() => {
        // High Priority: Use fields discovered by the Smart-Scan backend
        const activeFields = (unifiedData as any)?.active_fields;
        const configFields = (deviceConfig as any)?.fields || {};

        if (Array.isArray(activeFields)) {
            if (activeFields.includes('total_liters')) setFieldTotal(configFields.total_liters || deviceConfig?.meter_reading_field || 'field1');
            if (activeFields.includes('flow_rate')) setFieldFlow(configFields.flow_rate || deviceConfig?.flow_rate_field || 'field4');
        } else if (activeFields) {
            if ((activeFields as any).total_liters) setFieldTotal((activeFields as any).total_liters);
            if ((activeFields as any).flow_rate) setFieldFlow((activeFields as any).flow_rate);
        } else if (deviceConfig) {
            // Low Priority: DB configuration fallback
            if (configFields.total_liters || deviceConfig.meter_reading_field) setFieldTotal(configFields.total_liters || deviceConfig.meter_reading_field || 'field1');
            if (configFields.flow_rate || deviceConfig.flow_rate_field) setFieldFlow(configFields.flow_rate || deviceConfig.flow_rate_field || 'field4');
        }
        console.log('[Flow] activeFields:', activeFields, 'deviceConfig:', { meter: deviceConfig?.meter_reading_field, flow: deviceConfig?.flow_rate_field, fields: configFields });
    }, [deviceConfig, unifiedData]);

    // Debug: Log data source info
    useEffect(() => {
        if (historyFeeds.length > 0) {
            const lastEntry = historyFeeds[historyFeeds.length - 1];
            const firstEntry = historyFeeds[0];
            console.log('[Flow-DEBUG] historyFeeds Analysis:', {
                length: historyFeeds.length,
                firstEntry: { keys: Object.keys(firstEntry), total_liters: firstEntry.total_liters, flow_rate: firstEntry.flow_rate, raw_keys: Object.keys(firstEntry.raw || {}) },
                lastEntry: { total_liters: lastEntry.total_liters, flow_rate: lastEntry.flow_rate },
                fieldFlow: fieldFlow,
                fieldTotal: fieldTotal,
                extracted_flow: lastEntry.flow_rate ?? parseFloat(lastEntry.raw?.[fieldFlow] as string),
                extracted_total: lastEntry.total_liters ?? parseFloat(lastEntry.raw?.[fieldTotal] as string)
            });
        } else {
            console.log('[Flow-DEBUG] historyFeeds is EMPTY');
        }
    }, [historyFeeds, fieldFlow, fieldTotal]);

    const isConfigMissing = !deviceConfig?.thingspeak_channel_id;
    const isDataMissing = !telemetryData;

    // ── Firestore Real-time Subscription (replaces direct ThingSpeak fetch) ──
    // The backend TelemetryWorker polls ThingSpeak every 60s, processes the data,
    // and writes to Firestore. We subscribe to that document for live updates.
    const deviceDocId = deviceInfo?.id || hardwareId;
    const configId = deviceConfig?.id || (unifiedData as any)?.config?.id;
    const deviceType = deviceConfig?.device_type || (unifiedData as any)?.config?.config?.device_type || 'evaraflow';
    const firestoreFlow = useFirestoreFlowData(deviceDocId, deviceType);

    // Derive tsMeterReading and tsCreatedAt from Firestore data
    const tsMeterReading = firestoreFlow.volume;
    const tsCreatedAt = firestoreFlow.timestamp;
    const firestoreFlowRate = firestoreFlow.flowRate;

    console.log('[FirestoreFlow] volume:', tsMeterReading, 'flowRate:', firestoreFlowRate, 'timestamp:', tsCreatedAt, 'status:', firestoreFlow.status);

    // Build a single authoritative "freshest timestamp" across all available sources.
    const resolvedTimestamp = useMemo(() => {
        const candidates = [
            telemetryData?.timestamp,
            (telemetryData as any)?.created_at,
            tsCreatedAt,
            (deviceInfo as any)?.last_updated_at,
            deviceInfo?.last_seen,
            (deviceInfo as any)?.last_online_at,
        ].filter(Boolean);

        let latestRaw: any = null;
        let latestMs = -Infinity;

        for (const c of candidates) {
            const d = safeParseDate(c);
            const ms = d.getTime();
            if (!isNaN(ms) && ms > latestMs) {
                latestMs = ms;
                latestRaw = c;
            }
        }

        return latestRaw;
    }, [telemetryData, tsCreatedAt, deviceInfo]);

    // Resolve online/offline from freshest timestamp first, booleans only as fallback.
    const onlineStatus: 'Online' | 'Offline' = useMemo(() => {
        if (resolvedTimestamp) {
            return computeOnlineStatus(resolvedTimestamp);
        }

        if (typeof (telemetryData as any)?.online === 'boolean') {
            return (telemetryData as any).online ? 'Online' : 'Offline';
        }

        if (typeof (deviceInfo as any)?.online_status === 'boolean') {
            return (deviceInfo as any).online_status ? 'Online' : 'Offline';
        }

        if (typeof firestoreFlow.status === 'string') {
            const s = firestoreFlow.status.toUpperCase();
            if (s === 'ONLINE') return 'Online';
            if (s === 'OFFLINE' || s === 'OFFLINE_STOPPED' || s === 'UNKNOWN') return 'Offline';
        }

        return 'Offline';
    }, [resolvedTimestamp, telemetryData, deviceInfo, firestoreFlow.status]);

    const isOffline = onlineStatus === 'Offline';

    // ── Stale age ─────────────────────────────────────────────────────────────
    const { label: staleLabel } = useStaleDataAge(resolvedTimestamp ?? null);

    // Build a tsFeeds-compatible array from historyFeeds (backend analytics API)
    // This is used by the delta calculations and charts below
    const tsFeeds = useMemo(() => {
        if (!historyFeeds || historyFeeds.length === 0) return [];
        return historyFeeds.map((f: any) => {
            const date = safeParseDate(f.timestamp || f.created_at);
            const utcTime = date.getTime();
            const istTime = isNaN(utcTime) ? date : new Date(utcTime + (5.5 * 60 * 60 * 1000));
            const reading = f.total_liters ?? (f.raw?.[fieldTotal] ? parseFloat(f.raw[fieldTotal]) : null);
            const flowReading = f.flow_rate ?? (f.raw?.[fieldFlow] ? parseFloat(f.raw[fieldFlow]) : null);
            return { ...f, istTime, reading, flowReading };
        }).filter((f: any) => 
            (f.reading != null && !isNaN(f.reading)) || 
            (f.flowReading != null && !isNaN(f.flowReading)) ||
            (!isNaN(f.istTime.getTime()))
        );
    }, [historyFeeds, fieldTotal, fieldFlow]);

    // Derived Offline Logic
    const { tsIstLabel, tsDurationLabel } = useMemo(() => {
        if (!resolvedTimestamp) return { tsIstLabel: '', tsDurationLabel: '' };

        const lastSeenDate = safeParseDate(resolvedTimestamp);
        if (isNaN(lastSeenDate.getTime())) {
            return { tsIstLabel: 'Unknown', tsDurationLabel: 'Syncing data...' };
        }

        const { label, istTime } = formatOfflineMessage(resolvedTimestamp);

        return { tsIstLabel: istTime, tsDurationLabel: label };
    }, [resolvedTimestamp]);

    const effectiveIsOffline = isOffline;

    const deviceName = deviceInfo?.name ?? 'Flow Meter';
    const zoneName = deviceInfo?.zone_name ?? deviceInfo?.community_name ?? '';

    const flowRate = useMemo(() => {
        // Priority 1: Live telemetry (device online)
        if (!effectiveIsOffline && telemetryData) {
            if (telemetryData.flow_rate != null) return Math.max(0, telemetryData.flow_rate);
            const v = parseFloat(telemetryData.data?.[fieldFlow] as string);
            if (!isNaN(v) && v >= 0) return v;
        }
        // Priority 2: Firestore real-time data (works online AND offline)
        if (firestoreFlowRate != null && !isNaN(firestoreFlowRate)) {
            return Math.max(0, firestoreFlowRate);
        }
        // Priority 3: Backend history API (latest reading) - synchronized with graph
        if (historyFeeds && historyFeeds.length > 0) {
            const lastEntry = historyFeeds[historyFeeds.length - 1];
            const val = lastEntry.flow_rate ?? parseFloat(lastEntry.raw?.[fieldFlow] as string);
            if (!isNaN(val)) return Math.max(0, val);
        }
        return 0;
    }, [telemetryData, fieldFlow, effectiveIsOffline, firestoreFlowRate, historyFeeds]);

    const totalRaw = useMemo(() => {
        // Priority 1: Live telemetry (device online)
        if (!effectiveIsOffline && telemetryData) {
            if (telemetryData.total_liters != null) return telemetryData.total_liters;
            const v = parseFloat(telemetryData.data?.[fieldTotal] as string);
            if (!isNaN(v)) return v;
        }
        // Priority 2: Firestore real-time data (works online AND offline)
        if (tsMeterReading != null && !isNaN(tsMeterReading)) {
            return tsMeterReading;
        }
        // Priority 3: Backend history API (latest reading) - synchronized with graph
        if (historyFeeds && historyFeeds.length > 0) {
            const lastEntry = historyFeeds[historyFeeds.length - 1];
            const val = lastEntry.total_liters ?? parseFloat(lastEntry.raw?.[fieldTotal] as string);
            console.log('[TotalRaw] From historyFeeds:', { val, has_total_liters: lastEntry.total_liters != null, fieldTotal, raw_field_value: lastEntry.raw?.[fieldTotal], isValid: !isNaN(val) });
            if (!isNaN(val)) return val;
        }
        console.log('[TotalRaw] Fallback to 0 - historyFeeds:', historyFeeds?.length);
        return 0;
    }, [telemetryData, fieldTotal, effectiveIsOffline, tsMeterReading, historyFeeds]);

    // Odometer digits from total reading — 8-digit (6 black + 2 red)
    const odometer = useMemo(() => {
        const t = Math.abs(totalRaw);
        const intPart = Math.floor(t).toString().padStart(6, '0').slice(-6);
        // Use Math.round to avoid floating point precision issues (e.g. 0.07 * 100 -> 6.999 -> 6)
        const fracDigits = Math.round((t % 1) * 100).toString().padStart(2, '0').slice(-2);
        return { black: intPart.split(''), red: fracDigits.split('') };
    }, [totalRaw]);

    // Flow history (for charts)
    const flowHistory = useMemo(() => {
        const items = historyFeeds.map((f: any) => {
            const d = new Date(f.timestamp || f.created_at);
            const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            const rawFlow = f.flow_rate ?? parseFloat(f.raw?.[fieldFlow] as string) ?? 0;
            return { date: d, time, value: Math.max(0, rawFlow) };
        });
        if (telemetryData) {
            const now = new Date();
            items.push({
                date: now,
                time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`,
                value: Math.max(0, flowRate)
            });
        }
        return items;
    }, [historyFeeds, fieldFlow, telemetryData, flowRate]);

    // ── Delta Water Reading calculations ──────────────────────────────────────
    const meterHistory = useMemo(() => {
        return historyFeeds
            .map((f: any) => {
                const date = safeParseDate(f.timestamp || f.created_at);
                const ts = date.getTime();
                let reading: number;
                if (f.total_liters != null) {
                    reading = f.total_liters;
                } else {
                    const raw = parseFloat(f.raw?.[fieldTotal] as string);
                    reading = isNaN(raw) ? NaN : raw;
                }
                return { ts, reading, date };
            })
            .filter((e: { ts: number; reading: number }) => !isNaN(e.ts) && !isNaN(e.reading));
    }, [historyFeeds, fieldTotal]);

    const { deltaVolumeLitres, avgFlowLperMin } = useMemo(() => {
        if (effectiveIsOffline) {
            if (tsFeeds.length >= 2) {
                const newest = tsFeeds[tsFeeds.length - 1];
                const older = tsFeeds[tsFeeds.length - 2];

                const deltaVol = newest.reading - older.reading;
                const deltaMs = newest.istTime.getTime() - older.istTime.getTime();
                const deltaMin = deltaMs / 60000;

                // Guards
                if (deltaVol < 0) return { deltaVolumeLitres: NaN, avgFlowLperMin: flowRate };
                if (deltaVol > 10000) return { deltaVolumeLitres: NaN, avgFlowLperMin: flowRate };
                if (deltaMin <= 0) return { deltaVolumeLitres: NaN, avgFlowLperMin: flowRate };

                const flowMin = deltaVol / deltaMin;

                return {
                    deltaVolumeLitres: deltaVol,
                    avgFlowLperMin: flowMin,
                };
            }
            return { deltaVolumeLitres: 0, avgFlowLperMin: flowRate };
        }

        // Live Mode (existing logic, potentially with similar improvements)
        if (meterHistory.length >= 2) {
            const oldest = meterHistory[0];
            const newest = meterHistory[meterHistory.length - 1];
            const deltaVol = newest.reading - oldest.reading;
            const deltaMs = newest.ts - oldest.ts;
            const deltaMin = deltaMs / 60_000;

            if (deltaVol < 0 || deltaVol > 10000 || deltaMin <= 0) {
                return { deltaVolumeLitres: NaN, avgFlowLperMin: flowRate, deltaStatusMsg: '—' };
            }

            return {
                deltaVolumeLitres: deltaVol,
                avgFlowLperMin: deltaMin > 0 ? deltaVol / deltaMin : flowRate,
                deltaStatusMsg: null as string | null
            };
        }
        return { deltaVolumeLitres: 0, avgFlowLperMin: flowRate, deltaStatusMsg: 'Insufficient history' as string | null };
    }, [tsFeeds, meterHistory, flowRate, effectiveIsOffline]);

    // ── Usage Forecast Logic (24h Pattern) ──────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { forecastData: _fd, forecastBaseline: _fb, forecastStatus: _fs } = useMemo(() => {
        if (!tsFeeds || tsFeeds.length < 2) {
            return {
                forecastData: [],
                forecastBaseline: 0,
                forecastStatus: { text: 'Insufficient data', val: '—', color: '#94a3b8', bg: '#f1f5f9' }
            };
        }

        // 1. Group by IST Hour
        const hourlyBuckets: Record<number, number[]> = {};
        tsFeeds.forEach((f: any) => {
            const hr = f.istTime.getUTCHours(); // IST hours
            if (!hourlyBuckets[hr]) hourlyBuckets[hr] = [];
            hourlyBuckets[hr].push(f.reading);
        });

        // 2. Calculate hourly consumption
        const hourlyUsage: Record<number, number> = {};
        Object.entries(hourlyBuckets).forEach(([hr, readings]) => {
            if (readings.length >= 2) {
                hourlyUsage[Number(hr)] = readings[readings.length - 1] - readings[0];
            } else {
                hourlyUsage[Number(hr)] = 0;
            }
        });

        // 3. Baseline (dailyTotal / 24)
        const dailyTotal = tsFeeds[tsFeeds.length - 1].reading - tsFeeds[0].reading;
        const baseline = Math.max(0, dailyTotal / 24);

        // 4. Project next 5 hours
        const currentHour = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000)).getUTCHours();
        const projection = [];
        for (let i = 1; i <= 5; i++) {
            const targetHr = (currentHour + i) % 24;
            const ampm = targetHr >= 12 ? 'PM' : 'AM';
            const h12 = targetHr % 12 || 12;

            // If we have history for this hour, use it, else baseline
            const usage = hourlyUsage[targetHr] ?? baseline;
            projection.push({
                time: `${h12}${ampm}`,
                value: usage,
                label: `${String(h12).padStart(2, '0')}:00 ${ampm}`
            });
        }

        // 5. Status logic (based on current hour vs baseline)
        const currentUsage = hourlyUsage[currentHour] ?? 0;
        const variancePct = baseline > 0 ? ((currentUsage - baseline) / baseline) * 100 : 0;

        let status = { text: 'Stable', val: `+${variancePct.toFixed(0)}%`, color: '#16a34a', bg: '#dcfce7' };
        if (variancePct > 25) status = { text: 'Unstable High', val: `+${variancePct.toFixed(0)}%`, color: '#ef4444', bg: '#fee2e2' };
        else if (variancePct > 10) status = { text: 'High usage', val: `+${variancePct.toFixed(0)}%`, color: '#eab308', bg: '#fef9c3' };
        else if (variancePct < -25) status = { text: 'Unstable Low', val: `${variancePct.toFixed(0)}%`, color: '#ef4444', bg: '#fee2e2' };
        else if (variancePct < -10) status = { text: 'Low usage', val: `${variancePct.toFixed(0)}%`, color: '#eab308', bg: '#fef9c3' };

        // Stuck device check
        const allSame = tsFeeds.every((f: any) => f.reading === tsFeeds[0].reading);
        if (allSame && dailyTotal === 0) {
            status = { text: 'No flow detected', val: '0%', color: '#94a3b8', bg: '#f1f5f9' };
        }

        return {
            forecastData: projection,
            forecastBaseline: baseline,
            forecastStatus: status
        };
    }, [tsFeeds]);

    // Derived KPIs

    // Internal helper for KPI display
    const formatKPI = (val: number) => formatKPIValue(val, false);

    // Avg flow in L/hr — kept for potential future use
    void (avgFlowLperMin * 60);
    void (maxFlowRate * 60);

    if (!hardwareId) return <Navigate to="/nodes" replace />;

    if (analyticsLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-transparent">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 rounded-full border-4 border-solid animate-spin" style={{ borderColor: 'rgba(0,119,255,0.2)', borderTopColor: '#0077ff' }} />
                    <p className="text-sm font-medium" style={{ color: '#8E8E93' }}>Loading analytics...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen font-sans relative overflow-x-hidden bg-transparent" style={{ color: '#1C1C1E' }}>
            <main className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8" style={{ zIndex: 1 }}>
                <div className="flex flex-col gap-4">

                    {/* Breadcrumb + Page Heading row */}
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-2">
                        <div className="flex flex-col gap-2">
                            <nav className="flex items-center gap-1 text-[12px] font-normal" style={{ color: "var(--text-muted)" }}>
                                <button onClick={() => navigate('/')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0">
                                    Home
                                </button>
                                <span className="material-icons" style={{ fontSize: '16px', color: "var(--text-muted)" }}>chevron_right</span>
                                <button onClick={() => navigate('/nodes')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0 font-normal" style={{ color: "var(--text-muted)" }}>
                                    All Nodes
                                </button>
                                <span className="material-icons" style={{ fontSize: '16px', color: "var(--text-muted)" }}>chevron_right</span>
                                <span className="font-bold" style={{ color: "var(--text-primary)", fontWeight: '700' }}>{deviceName}</span>
                            </nav>

                            <h2 style={{ fontSize: '22px', fontWeight: '700', marginTop: '6px', color: "var(--text-primary)" }}>
                                {deviceName} Analytics
                            </h2>

                            {effectiveIsOffline && tsDurationLabel && (
                                <p className="text-xs font-bold text-red-500 m-0 mt-1">
                                    {tsDurationLabel}
                                </p>
                            )}
                            {zoneName && (
                                <p className="text-xs text-slate-400 m-0 mt-1">
                                    {zoneName}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap pb-1 md:self-end lg:self-auto">
                            {/* Status Button (Pill Style) */}
                            <div className={clsx(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest transition-all duration-200 shadow-sm border",
                                effectiveIsOffline
                                    ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20"
                                    : "bg-emerald-50 dark:bg-emerald-500/10 text-[#059669] dark:text-emerald-400 border border-[#10b981]/50 dark:border-emerald-500/40"
                            )}>
                                <div className={clsx(
                                    "w-1.5 h-1.5 rounded-full",
                                    effectiveIsOffline ? "bg-red-500" : "bg-[#10b981] animate-pulse"
                                )} />
                                {effectiveIsOffline ? 'Offline' : 'Online'}
                            </div>

                            {/* Node Info Button */}
                            <button
                                onClick={() => refetch()}
                                disabled={analyticsFetching}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95 ${analyticsFetching ? 'bg-gray-100 dark:bg-white/10 text-gray-400 cursor-not-allowed border-none' : 'bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] border border-[#1e40af]/30 dark:bg-transparent dark:text-[#3B82F6] dark:border dark:border-[#3B82F6] dark:hover:bg-[#3B82F6]/10'}`}
                            >
                                <span className={`material-icons ${analyticsFetching ? 'animate-spin' : ''}`} style={{ fontSize: '14px' }}>
                                    {analyticsFetching ? 'sync' : 'refresh'}
                                </span>
                                {analyticsFetching ? 'Refreshing...' : 'Refresh Data'}
                            </button>

                            <button
                                onClick={() => setShowNodeInfo(true)}
                                className="flex items-center gap-2 px-4 py-1.5 bg-[#f3e8ff] hover:bg-[#e9d5ff] text-[#6b21a8] border border-[#6b21a8]/30 dark:bg-transparent dark:text-[#AF52DE] dark:border dark:border-[#AF52DE] dark:hover:bg-[#AF52DE]/10 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                            >
                                <Info size={12} className="stroke-[2.5px]" />
                                Node Info
                            </button>

                            {/* Parameters Button */}
                            <button
                                onClick={() => setShowParams(true)}
                                className="flex items-center gap-2 px-4 py-1.5 bg-[#fef3c7] hover:bg-[#fde68a] text-[#92400e] border border-[#92400e]/30 dark:bg-transparent dark:text-[#FFB340] dark:border dark:border-[#FFB340] dark:hover:bg-[#FFB340]/10 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                            >
                                <Settings size={12} className="stroke-[2.5px]" />
                                Parameters
                            </button>

                            {/* Delete Button */}
                            {user?.role === 'superadmin' && (
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b] border border-[#991b1b]/30 dark:bg-transparent dark:text-[#FF3B30] dark:border dark:border-[#FF3B30] dark:hover:bg-[#FF3B30]/10 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                                >
                                    <span className="material-icons" style={{ fontSize: '14px' }}>delete_forever</span>
                                    Delete Node
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Alerts */}
                    {isConfigMissing && (
                        <div className="rounded-2xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-4"
                            style={{ background: 'rgba(255,149,0,0.1)', color: '#FF9500' }}>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>settings</span>
                                Telemetry configuration missing (Channel ID or API Key)
                            </div>
                        </div>
                    )}
                    {!isConfigMissing && isDataMissing && (
                        <div className="rounded-2xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-4"
                            style={{ background: 'rgba(142,142,147,0.1)', color: '#8E8E93' }}>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>database_off</span>
                                No telemetry data available for this device
                            </div>
                        </div>
                    )}
                    {analyticsError && !isConfigMissing && (
                        <div className="rounded-2xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-4"
                            style={{ background: 'rgba(255,59,48,0.1)', color: '#FF3B30' }}>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>warning</span>
                                Failed to load latest telemetry. Retrying in background...
                            </div>
                            <button onClick={() => refetch()} className="px-3 py-1 bg-[#3A7AFE] text-white rounded-full text-xs font-semibold border-none cursor-pointer hover:bg-blue-600 transition-colors shadow-md">
                                Retry Now
                            </button>
                        </div>
                    )}

                    {/* Parameters Modal */}
                    {showParams && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                            onClick={() => setShowParams(false)}>
                            <div className="rounded-2xl p-6 flex flex-col w-full max-w-md"
                                style={{
                                    background: "var(--bg-secondary)",
                                    border: '1px solid var(--card-border)',
                                    boxShadow: '0 20px 40px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)'
                                }}
                                onClick={e => e.stopPropagation()}>

                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-[17px] font-bold m-0" style={{ color: "var(--text-primary)" }}>Flow Meter Config</h3>
                                    <button onClick={() => setShowParams(false)}
                                        className="flex items-center justify-center rounded-full bg-white border-none cursor-pointer p-0 transition-all hover:scale-110"
                                        style={{
                                            width: 24, height: 24, background: '#f5f5f5', color: '#3c3c43', fontSize: '18px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                        }}>
                                        &times;
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                                    <div className="rounded-xl p-4" style={{ background: 'var(--bg-primary)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Flow Rate Field</p>
                                        <div className="flex items-baseline gap-1 mt-1">
                                            <input type="text" value={fieldFlow}
                                                onChange={e => setFieldFlow(e.target.value)}
                                                className="w-full font-bold text-sm bg-transparent border-none outline-none p-0 m-0"
                                                style={{ color: 'var(--text-primary)' }} />
                                        </div>
                                    </div>
                                    <div className="rounded-xl p-4" style={{ background: 'var(--bg-primary)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total Liters Field</p>
                                        <div className="flex items-baseline gap-1 mt-1">
                                            <input type="text" value={fieldTotal}
                                                onChange={e => setFieldTotal(e.target.value)}
                                                className="w-full font-bold text-sm bg-transparent border-none outline-none p-0 m-0"
                                                style={{ color: "var(--text-primary)" }} />
                                        </div>
                                    </div>
                                </div>

                                {saveError && (
                                    <p className="text-[11px] font-bold text-center mt-0 mb-3" style={{ color: '#FF3B30' }}>{saveError}</p>
                                )}

                                <div className="flex gap-3">
                                    {user?.role === "superadmin" && (
                                        <button onClick={handleSave} disabled={saving}
                                            className="flex-1 font-semibold py-3 rounded-2xl text-white border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                                            style={{
                                                background: '#3A7AFE',
                                                opacity: saving ? 0.5 : 1,
                                                fontSize: '14px',
                                            }}>
                                            {saving ? 'Saving…' : 'Save Changes'}
                                        </button>
                                    )}
                                    <button
                                        className="flex-1 font-semibold py-3 rounded-2xl border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                                        style={{ background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: '14px' }}
                                        onClick={() => setShowParams(false)}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Node Info Modal */}
                    {showNodeInfo && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                            onClick={() => setShowNodeInfo(false)}>
                            <div className="rounded-2xl p-6 flex flex-col w-full max-w-2xl"
                                style={{
                                    background: "var(--bg-secondary)",
                                    border: '1px solid var(--card-border)',
                                    boxShadow: '0 20px 40px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)'
                                }}
                                onClick={e => e.stopPropagation()}>

                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-[17px] font-bold m-0" style={{ color: '#1c1c1e' }}>Node Information</h3>
                                    <button onClick={() => setShowNodeInfo(false)}
                                        className="flex items-center justify-center rounded-full bg-white border-none cursor-pointer p-0 transition-all hover:scale-110"
                                        style={{
                                            width: 24, height: 24, background: '#f5f5f5', color: '#3c3c43', fontSize: '18px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                        }}>
                                        &times;
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="rounded-xl p-4" style={{ background: 'var(--bg-primary)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Device Name</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{deviceName}</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'var(--bg-primary)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Hardware ID</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{hardwareId}</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'var(--bg-primary)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Device Type</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>EvaraFlow Monitor</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'var(--bg-primary)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Location</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{zoneName || 'Not specified'}</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'var(--bg-primary)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Subscription</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: "var(--text-primary)" }}>PRO</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'var(--bg-primary)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Assigned To</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: "var(--text-primary)" }}>{deviceInfo?.customer_name || 'Unassigned'}</p>
                                    </div>
                                </div>

                                <div className="mt-6 flex gap-3">
                                    <button
                                        className="flex-1 font-semibold py-3 rounded-2xl text-white border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                                        style={{ background: '#3A7AFE', fontSize: '14px' }}
                                        onClick={() => {
                                            const info = `Device Name: ${deviceName}\nHardware ID: ${hardwareId}\nDevice Type: EvaraFlow Monitor\nLocation: ${zoneName || 'Not specified'}\nSubscription: PRO\nAssigned To: ${deviceInfo?.customer_name || 'Unassigned'}`;
                                            navigator.clipboard.writeText(info);
                                            alert('Node information copied to clipboard!');
                                        }}
                                    >
                                        Copy Info
                                    </button>
                                    <button
                                        className="flex-1 font-semibold py-3 rounded-2xl border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                                        style={{ background: '#f5f5f5', color: '#1c1c1e', fontSize: '14px' }}
                                        onClick={() => setShowNodeInfo(false)}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── DASHBOARD GRID: Left Column (Meter) | Right Column (Others) ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">

                        {/* LEFT COLUMN: Analog Brass Meter */}
                        <div className="lg:col-span-1 apple-glass-card rounded-[2.5rem] p-4 flex flex-col relative overflow-hidden h-full">
                            <div className="flex justify-between items-center mb-2 z-10 w-full">
                                <div>
                                    <h3 className="text-xl font-semibold m-0 leading-tight" style={{ color: 'var(--text-primary)' }}>{deviceName}</h3>
                                </div>
                                <div className="flex items-center">
                                    <span className="flex items-center gap-1 text-xs font-semibold rounded-md px-2 py-1"
                                        style={{ color: '#0A84FF', background: 'rgba(10,132,255,0.1)' }}>
                                        <span className="material-symbols-rounded" style={{ fontSize: 14 }}>sync</span> Live
                                    </span>
                                </div>
                            </div>

                            <div className="flex-grow flex flex-col items-center justify-center gap-6 py-4">

                                <div className="relative w-72 h-72 drop-shadow-2xl flex-shrink-0">
                                    <svg viewBox="0 0 200 200" className="w-full h-full">
                                        <defs>
                                            <linearGradient id="brassBezelEF" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stopColor="#dfbd69" />
                                                <stop offset="25%" stopColor="#926d25" />
                                                <stop offset="50%" stopColor="#fcf6ba" />
                                                <stop offset="75%" stopColor="#aa8431" />
                                                <stop offset="100%" stopColor="#654321" />
                                            </linearGradient>
                                            <radialGradient id="faceShadeEF" cx="50%" cy="50%" r="50%">
                                                <stop offset="85%" stopColor="#fdfaf2" />
                                                <stop offset="100%" stopColor="#d1d5db" />
                                            </radialGradient>
                                        </defs>
                                        <circle cx="100" cy="100" r="98" fill="url(#brassBezelEF)" stroke="#5d4037" strokeWidth="0.5" />
                                        <circle cx="100" cy="100" r="90" fill="#8d6e63" />
                                        <circle cx="100" cy="100" r="88" fill="url(#brassBezelEF)" />
                                        <circle cx="100" cy="100" r="84" fill="url(#faceShadeEF)" />

                                        {Array.from({ length: 28 }).map((_, i) => {
                                            const angle = -135 + i * (270 / 27);
                                            const rad = (angle * Math.PI) / 180;
                                            const isMajor = i % 3 === 0;
                                            const r1 = isMajor ? 66 : 70;
                                            return (
                                                <line key={i}
                                                    x1={100 + r1 * Math.sin(rad)} y1={100 - r1 * Math.cos(rad)}
                                                    x2={100 + 74 * Math.sin(rad)} y2={100 - 74 * Math.cos(rad)}
                                                    stroke={isMajor ? '#94a3b8' : '#cbd5e1'} strokeWidth={isMajor ? 1.5 : 0.8} />
                                            );
                                        })}

                                        <g transform="translate(37, 78)">
                                            <rect x="0" y="0" width="126" height="22" rx="1" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.5" />
                                            {(totalRaw === 0 && tsMeterReading == null && !telemetryData) ? (
                                                <text x="63" y="15" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="bold">No data available</text>
                                            ) : (
                                                <>
                                                    {odometer.black.map((digit, i) => (
                                                        <g key={i} transform={`translate(${4 + i * 15}, 3)`}>
                                                            <rect x="0" y="0" width="13" height="16" rx="1" fill="#1a1a1a" />
                                                            <text x="6.5" y="12.5" textAnchor="middle" fill="white" fontFamily="monospace" fontSize="10" fontWeight="bold">{digit}</text>
                                                        </g>
                                                    ))}
                                                    {odometer.red.map((digit, i) => (
                                                        <g key={`red-${i}`} transform={`translate(${4 + (6 + i) * 15}, 3)`}>
                                                            <rect x="0" y="0" width="13" height="16" rx="1" fill="#ef4444" />
                                                            <text x="6.5" y="12.5" textAnchor="middle" fill="white" fontFamily="monospace" fontSize="10" fontWeight="bold">{digit}</text>
                                                        </g>
                                                    ))}
                                                </>
                                            )}
                                        </g>
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-end pb-10 pointer-events-none">
                                        <div className="text-[16px] font-bold text-[var(--text-primary)] leading-none tabular-nums">
                                            {totalRaw >= 1000 ? (totalRaw / 1000).toFixed(1) : formatKPI(totalRaw)}
                                        </div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">
                                            {totalRaw >= 1000 ? 'KL' : 'Liters'}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-center mt-2 mb-4">
                                    <p className="text-[13px] font-bold uppercase tracking-widest m-0" style={{ color: '#8E8E93' }}>Flow Rate</p>
                                    <h3 className="text-[30px] font-black m-0 mt-1 tabular-nums leading-none" style={{ color: '#000080' }}>
                                        {formatMeterValue(flowRate)}
                                        <span className="text-[18px] font-medium ml-1" style={{ color: 'rgba(0, 0, 128, 0.6)' }}>L/min</span>
                                    </h3>
                                    <p className="text-xs font-medium m-0 mt-2" style={{ color: '#8E8E93' }}>
                                        {effectiveIsOffline && tsIstLabel ? `Offline (${tsIstLabel})` : staleLabel}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: 4-col grid top row + 1-col full bottom row */}
                        <div className="lg:col-span-2 flex flex-col gap-6 h-full">
                            {/* Top Row: Four equal-height cards */}
                            <div className="grid gap-[1rem] w-full" style={{ gridTemplateColumns: `repeat(${[showWaterSecurityParam, showSystemDynamicsParam, showAlertsParam, true].filter(Boolean).length}, 1fr)` }}>
                                {/* Water Security Monitoring */}
                                {showWaterSecurityParam && (
                                <div className="apple-glass-card rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden h-full w-full min-h-[160px] max-h-[45vh]" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)' }}>
                                    <div className="flex justify-between items-center w-full">
                                        <div className="flex items-center justify-center rounded-xl w-8 h-8" style={{ background: 'rgba(52,199,89,0.2)' }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#34C759"><path d="M12 2C12 2 5 10.5 5 15a7 7 0 0 0 14 0C19 10.5 12 2 12 2Z" /></svg>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button className="bg-transparent border-none p-1 cursor-pointer transition-colors hover:bg-black/5 rounded-full flex items-center justify-center">
                                                <Info size={14} color="var(--text-primary)" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-col mt-auto pt-1 gap-2">
                                        <p style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', margin: 0, lineHeight: 1 }}>WATER USAGE</p>
                                        <div className="flex items-baseline">
                                            <span className="tracking-tight tabular-nums truncate" style={{ fontSize: '16px', fontWeight: 900, lineHeight: 1.1, color: "var(--text-primary)" }}>
                                                {formatMeterValue(deltaVolumeLitres > 0 ? deltaVolumeLitres : totalRaw)}
                                                <span style={{ fontSize: '13px', fontWeight: 700, color: "var(--text-muted)", marginLeft: '1px' }}>L</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                )}

                                {/* System Dynamics (FlowKPI) */}
                                {showSystemDynamicsParam && (
                                    <div className="h-full w-full min-h-[160px] max-h-[45vh] overflow-hidden relative">
                                        {isSuperAdmin && customerConfig.showSystemDynamics === false && (
                                            <span className="absolute top-2 right-2 z-20 text-[9px] font-bold bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full uppercase">HIDDEN FROM CUSTOMER</span>
                                        )}
                                        <FlowKPICard className="h-full" avgFlow={flowRate} />
                                    </div>
                                )}

                                {/* Alerts Card */}
                                {showAlertsParam && (
                                    <div className="h-full w-full min-h-[160px] max-h-[45vh] overflow-hidden relative">
                                        {isSuperAdmin && customerConfig.showAlerts === false && (
                                            <span className="absolute top-2 right-2 z-20 text-[9px] font-bold bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full uppercase">HIDDEN FROM CUSTOMER</span>
                                        )}
                                        <AlertsCard className="h-full" flowRate={flowRate} maxFlowRate={maxFlowRate} />
                                    </div>
                                )}

                                {/* Total Flow Rate Card */}
                                <div className="h-full w-full min-h-[160px] max-h-[45vh] overflow-hidden relative">
                                    <TotalFlowRateCard className="h-full" history={flowHistory} flowRate={flowRate} maxFlowRate={maxFlowRate} />
                                </div>
                            </div>

                            {/* Bottom row — capped so it doesn't balloon on large screens */}
                            {showConsumptionPatternParam && (
                                <div className="flex-1 overflow-hidden relative">
                                    {isSuperAdmin && customerConfig.showConsumptionPattern === false && (
                                        <span className="absolute top-4 right-20 z-20 text-[10px] font-bold bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full uppercase">Hidden from Customer</span>
                                    )}
                                    <ConsumptionPatternCard history={flowHistory} />
                                </div>
                            )}
                        </div>
                    </div>


                </div>
            </main>

            {/* Subtle Loading Indicators — Matches Home Map */}
            {(analyticsLoading || analyticsFetching) && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[400] apple-glass-card backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-slate-200 flex items-center gap-3 animate-pulse">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Syncing Live Data...
                    </span>
                </div>
            )}

            {/* Delete Confirmation Popup */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
                    onClick={() => !isDeleting && setShowDeleteConfirm(false)}>
                    <div className="rounded-3xl p-8 flex flex-col w-full max-sm:max-w-xs max-w-sm text-center"
                        style={{
                            background: "var(--bg-secondary)",
                            border: '1px solid var(--card-border)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                        }}
                        onClick={e => e.stopPropagation()}>

                        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="material-icons" style={{ fontSize: '32px' }}>delete_outline</span>
                        </div>

                        <h3 className="text-xl font-bold mb-2 text-gray-900">Delete this Node?</h3>
                        <p className="text-sm text-gray-500 mb-8">
                            This will permanently remove <strong>{deviceName}</strong> and all its historical telemetry data. This action cannot be undone.
                        </p>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className={`w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all ${isDeleting ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200 active:scale-95'}`}
                            >
                                {isDeleting ? 'Deleting...' : 'Yes, Delete Node'}
                            </button>
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                                className="w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-50 transition-all active:scale-95"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EvaraFlowAnalytics;
