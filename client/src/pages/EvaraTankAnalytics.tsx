import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import {
    TrendingUp, TrendingDown, Timer, Droplets, Clock, Activity,
    Wifi, Info, Bell
} from 'lucide-react';
import api from '../services/api';
import { useStaleDataAge } from '../hooks/useStaleDataAge';
import { useDeviceAnalytics } from '../hooks/useDeviceAnalytics';
import { useRealtimeTelemetry } from '../hooks/useRealtimeTelemetry';
import type { NodeInfoData } from '../hooks/useDeviceAnalytics';
import { computeOnlineStatus } from '../utils/telemetryPipeline';
import type { TankConfig } from '../hooks/useDeviceConfig';
import {
    computeCapacityLitres,
    computeTankMetrics,
    percentageToVolume,
    formatVolume,
} from '../utils/tankCalculations';
import type { TankShape } from '../utils/tankCalculations';
import { useWaterAnalytics } from '../hooks/useWaterAnalytics';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TelemetryPayload {
    timestamp: string;
    data?: Record<string, unknown>;
    level_percentage?: number;
    total_liters?: number;
    created_at?: string;
    level?: number;
    percentage?: number;
    volume?: number;
    currentVolume?: number;
}

interface LocalTankConfig {
    thingspeakChannelId: string;
    thingspeakReadKey: string;
    tankShape: TankShape;
    heightM: number;
    lengthM: number;
    breadthM: number;
    radiusM: number;
    capacityOverrideLitres: number | null;
    fieldDepth: string;
    fieldTemperature: string;
}

const DEFAULT_LOCAL_CFG: LocalTankConfig = {
    thingspeakChannelId: '',
    thingspeakReadKey: '',
    tankShape: 'rectangular',
    heightM: 0,
    lengthM: 0,
    breadthM: 0,
    radiusM: 0,
    capacityOverrideLitres: null,
    fieldDepth: 'field1',
    fieldTemperature: 'field2',
};

function serverConfigToLocal(cfg: TankConfig): LocalTankConfig {
    return {
        thingspeakChannelId: cfg.thingspeak_channel_id ?? '',
        thingspeakReadKey: '',   // never returned by the server for security
        tankShape: (cfg.tank_shape as TankShape) ?? 'rectangular',
        heightM: cfg.height_m ?? cfg.depth ?? cfg.tankHeight ?? 0,
        lengthM: cfg.length_m ?? 0,
        breadthM: cfg.breadth_m ?? 0,
        radiusM: cfg.radius_m ?? 0,
        capacityOverrideLitres: cfg.capacity_liters ?? cfg.capacity ?? null,
        fieldDepth: cfg.water_level_field ?? cfg.fieldKey ?? 'field1',
        fieldTemperature: cfg.temperature_field ?? 'field2',
    };
}

function localToApiBody(lc: LocalTankConfig) {
    return {
        thingspeak_channel_id: lc.thingspeakChannelId || undefined,
        thingspeak_read_key: lc.thingspeakReadKey || undefined,
        tank_shape: lc.tankShape,
        height_m: lc.heightM,
        length_m: lc.lengthM,
        breadth_m: lc.breadthM,
        radius_m: lc.radiusM,
        capacity_liters: lc.capacityOverrideLitres,
        water_level_field: lc.fieldDepth,
        temperature_field: lc.fieldTemperature,
    };
}

// ─── Main component ───────────────────────────────────────────────────────────
const EvaraTankAnalytics = () => {
    const { hardwareId } = useParams<{ hardwareId: string }>();
    const { user } = useAuth();

    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // ── Config panel form state ───────────────────────────────────────────────
    const [localCfg, setLocalCfg] = useState<LocalTankConfig>(DEFAULT_LOCAL_CFG);
    const [cfgDirty, setCfgDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [showParams, setShowParams] = useState(false);
    const [showNodeInfo, setShowNodeInfo] = useState(false);


    // ── Unified Analytics Data ────────────────────────────────────────────────
    const {
        data: unifiedData,
        isLoading: analyticsLoading,
        refetch
    } = useDeviceAnalytics(hardwareId);

    const deviceConfig = ('config' in (unifiedData?.config ?? {})
        ? (unifiedData!.config as { config: TankConfig }).config
        : undefined) as TankConfig | undefined;
    const telemetryData = (unifiedData?.latest && !('error' in unifiedData.latest)
        ? unifiedData.latest
        : undefined) as TelemetryPayload | undefined;
    const deviceInfo = ('data' in (unifiedData?.info ?? {})
        ? (unifiedData!.info as { data: NodeInfoData }).data
        : undefined) as NodeInfoData | undefined;



    // ── Real-time Telemetry Integration ──────────────────────────────────────
    const { telemetry: realtimeData } = useRealtimeTelemetry(hardwareId || "");
    const [liveFeeds, setLiveFeeds] = useState<TelemetryPayload[]>([]);

    // Sync initial history to live feeds
    useEffect(() => {
        const history = (unifiedData?.history as { feeds?: TelemetryPayload[] })?.feeds || [];
        if (history.length > 0) {
            setLiveFeeds(history);
        }
    }, [unifiedData?.history]);

    // Handle incoming real-time data
    useEffect(() => {
        if (realtimeData) {
            setLiveFeeds(prev => {
                const last = prev[prev.length - 1];
                // Avoid duplicates if the same timestamp comes in
                if (last && last.timestamp === realtimeData.timestamp) return prev;

                const newPoint = {
                    ...realtimeData,
                    // Ensure naming consistency with historical feeds
                    timestamp: realtimeData.timestamp || new Date().toISOString(),
                    level_percentage: realtimeData.level_percentage ?? realtimeData.percentage ?? realtimeData.Level ?? 0,
                    total_liters: realtimeData.total_liters ?? realtimeData.volume ?? 0,
                };

                // Keep last 50 points for the "Live" feel
                const updated = [...prev, newPoint];
                return updated.slice(-50);
            });
        }
    }, [realtimeData]);

    // Use realtimeData if available, fallback to fetched latest
    const activeTelemetry = realtimeData || telemetryData;

    const telemetryLoading = analyticsLoading;
    const historyLoading = analyticsLoading;

    // Online status
    const snapshotTs = activeTelemetry?.timestamp ?? null;
    const deviceLastSeen = deviceInfo?.last_seen ?? null;
    const bestTimestamp = snapshotTs ?? deviceLastSeen;
    const onlineStatus = computeOnlineStatus(bestTimestamp);

    useEffect(() => {
        if (deviceConfig) {
            setLocalCfg(serverConfigToLocal(deviceConfig));
            setCfgDirty(false);
        }
    }, [deviceConfig]);

    const isOffline = onlineStatus === 'Offline';

    // ── Stale-data age ────────────────────────────────────────────────────────
    const { label: staleLabel } = useStaleDataAge(activeTelemetry?.timestamp ?? null);

    // ── Derive current metrics ────────────────────────────────────────────────
    const metrics = useMemo(() => {
        const backendPct = activeTelemetry?.level_percentage;
        const backendVolume = activeTelemetry?.total_liters ?? null;

        if (backendPct != null && isFinite(backendPct)) {
            const capacityLitres = computeCapacityLitres({
                tankShape: localCfg.tankShape, heightM: localCfg.heightM,
                lengthM: localCfg.lengthM, breadthM: localCfg.breadthM,
                radiusM: localCfg.radiusM, capacityOverrideLitres: localCfg.capacityOverrideLitres,
            });
            const pctVal = Math.max(0, Math.min(100, backendPct));
            const volumeLitres = (backendVolume != null && isFinite(backendVolume))
                ? backendVolume
                : percentageToVolume(pctVal, capacityLitres);
            return {
                waterHeightCm: (pctVal / 100) * localCfg.heightM * 100,
                percentage: pctVal,
                volumeLitres,
                capacityLitres,
                isDataValid: true,
            };
        }
        const rawField = activeTelemetry?.data?.[localCfg.fieldDepth] as string | number | undefined;
        const sensorCm = rawField != null ? parseFloat(String(rawField)) : null;
        return computeTankMetrics({
            sensorReadingCm: sensorCm !== null && isFinite(sensorCm) ? sensorCm : null,
            dims: { tankShape: localCfg.tankShape, heightM: localCfg.heightM, lengthM: localCfg.lengthM, breadthM: localCfg.breadthM, radiusM: localCfg.radiusM, capacityOverrideLitres: localCfg.capacityOverrideLitres },
        });
    }, [activeTelemetry, localCfg]);

    // ── Water Analytics ────────────────────────────────────────────────────────
    const rawSensorField = activeTelemetry?.data?.[localCfg.fieldDepth] as string | number | undefined;
    const sensorDistanceM = rawSensorField != null ? parseFloat(String(rawSensorField)) / 100 : null;

    const waterAnalytics = useWaterAnalytics(
        localCfg.heightM,
        metrics.capacityLitres,
        sensorDistanceM,
        metrics.volumeLitres,
        metrics.percentage,
        activeTelemetry?.timestamp || new Date().toISOString(),
        liveFeeds
    );
    const combinedChartData = useMemo(() => {
        const data: { time: string; level: number; volume: number }[] = [];

        for (const feed of liveFeeds) {
            const d = new Date(feed.timestamp || feed.created_at || new Date().toISOString());
            const time = `${d.getHours().toString().padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
            data.push({
                time,
                level: feed.level_percentage || feed.level || feed.percentage || 0,
                volume: feed.total_liters || feed.volume || feed.currentVolume || 0
            });
        }
        return data;
    }, [liveFeeds]);

    const pct = metrics.percentage;
    const deviceName = deviceInfo?.name || (deviceInfo as { label?: string })?.label || 'Tank';

    // ── Computed capacity preview ─────────────────────────────────────────────
    const previewCapacity = useMemo(
        () => computeCapacityLitres({ tankShape: localCfg.tankShape, heightM: localCfg.heightM, lengthM: localCfg.lengthM, breadthM: localCfg.breadthM, radiusM: localCfg.radiusM, capacityOverrideLitres: localCfg.capacityOverrideLitres }),
        [localCfg],
    );

    // ── Config save ───────────────────────────────────────────────────────────
    // ── Config save ───────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        setSaving(true);
        setSaveError(null);
        try {
            await api.put(`/admin/nodes/${hardwareId}`, localToApiBody(localCfg));
            await queryClient.invalidateQueries({ queryKey: ['device_config', hardwareId] });
            setCfgDirty(false);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to save configuration';
            setSaveError(message);
        } finally {
            setSaving(false);
        }
    }, [hardwareId, localCfg, queryClient]);

    function patch(updates: Partial<LocalTankConfig>) {
        setLocalCfg((prev) => ({ ...prev, ...updates }));
        setCfgDirty(true);
    }

    // ── Volume unit for chart axis ─────────────────────
    const { volDivisor } = useMemo(() => {
        const maxVol = Math.max(...combinedChartData.map(d => d.volume), 1);
        return maxVol >= 1000 ? { volDivisor: 1000 } : { volDivisor: 1 };
    }, [combinedChartData]);

    // Guard: if no hardwareId id in route, redirect to /nodes
    if (!hardwareId) return <Navigate to="/nodes" replace />;

    if (analyticsLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-transparent">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 rounded-full border-4 border-solid animate-spin" style={{ borderColor: 'rgba(10,132,255,0.2)', borderTopColor: '#0A84FF' }} />
                    <p className="text-sm font-medium" style={{ color: '#8E8E93' }}>Loading analytics...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen font-sans relative overflow-x-hidden" style={{
            background: 'linear-gradient(145deg, #e8f0fe 0%, #d1e3f4 50%, #b8d4e8 100%)',
            color: '#1C1C1E'
        }}>
            <main className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8" style={{ zIndex: 1 }}>
                <div className="max-w-[1400px] mx-auto flex flex-col gap-6">

                    {/* Breadcrumb + Page Heading row */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
                        <div className="flex flex-col gap-2">
                            <nav className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#8E8E93' }}>
                                <button onClick={() => navigate('/')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0">
                                    Home
                                </button>
                                <span className="text-[#C7C7CC]">›</span>
                                <button onClick={() => navigate('/nodes')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0 font-medium" style={{ color: '#8E8E93' }}>
                                    All Nodes
                                </button>
                                <span className="text-[#C7C7CC]">›</span>
                                {deviceName}
                            </nav>
                            <h1 className="text-3xl font-bold tracking-tight m-0" style={{ color: '#1C1C1E' }}>
                                {deviceName} Analytics
                            </h1>
                        </div>

                        <div className="flex items-center gap-2 mb-1">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                                style={{ background: isOffline ? 'rgba(255,59,48,0.1)' : 'rgba(52,199,89,0.1)', color: isOffline ? '#FF3B30' : '#34C759' }}>
                                <span className="relative flex" style={{ width: 8, height: 8 }}>
                                    {!isOffline && <span className="absolute inset-0 rounded-full" style={{ background: '#34C759', animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite', opacity: 0.75 }} />}
                                    <span className="relative rounded-full block w-full h-full" style={{ background: isOffline ? '#FF3B30' : '#34C759' }} />
                                </span>
                                {isOffline ? 'Offline' : 'Online'}
                            </div>
                            <button
                                className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-3 py-1.5 transition-all hover:scale-95"
                                style={{
                                    background: 'rgba(175,82,222,0.1)',
                                    color: '#AF52DE',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                                onClick={() => setShowNodeInfo(true)}
                            >
                                Node Info
                            </button>
                            <button onClick={() => setShowParams(true)}
                                className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-3 py-1.5 transition-all hover:scale-95"
                                style={{ background: 'rgba(255,149,0,0.1)', color: '#FF9500', border: 'none', cursor: 'pointer' }}>
                                Parameters
                            </button>
                            <button onClick={() => refetch()}
                                className="flex items-center justify-center gap-1.5 text-sm font-semibold rounded-full px-4 py-1.5 transition-all hover:scale-95"
                                style={{ background: 'rgba(10,132,255,0.1)', color: '#0A84FF', border: 'none', cursor: 'pointer' }}>
                                Refresh
                            </button>
                        </div>

                        {/* Parameters Popup Modal */}
                        {showParams && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                                onClick={() => setShowParams(false)}>
                                <div className="rounded-[1.5rem] p-6 flex flex-col w-full max-w-sm"
                                    style={{ background: '#e5e5e5', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}
                                    onClick={e => e.stopPropagation()}>

                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-[17px] font-bold m-0" style={{ color: '#1c1c1e' }}>Parameters</h3>
                                        <button onClick={() => setShowParams(false)}
                                            className="flex items-center justify-center rounded-full bg-white border-none cursor-pointer p-0"
                                            style={{ width: 24, height: 24, color: '#3c3c43', fontSize: '18px', fontWeight: 'bold' }}>
                                            &times;
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3 mb-5">
                                        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl" style={{ background: '#f5f5f5', border: '1px solid rgba(0,0,0,0.03)' }}>
                                            <label className="text-[10px] font-bold" style={{ color: '#8e8e93' }}>Length</label>
                                            <div className="flex items-baseline gap-1">
                                                <input type="number" step="0.1" value={localCfg.lengthM}
                                                    onChange={e => patch({ lengthM: parseFloat(e.target.value) || 0 })}
                                                    className="w-14 text-right font-bold text-sm bg-transparent border-none outline-none p-0 m-0"
                                                    style={{ color: '#1c1c1e', WebkitAppearance: 'none', MozAppearance: 'textfield' }} />
                                                <span className="text-sm font-bold" style={{ color: '#1c1c1e' }}>m</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl" style={{ background: '#f5f5f5', border: '1px solid rgba(0,0,0,0.03)' }}>
                                            <label className="text-[10px] font-bold" style={{ color: '#8e8e93' }}>Breadth</label>
                                            <div className="flex items-baseline gap-1">
                                                <input type="number" step="0.1" value={localCfg.breadthM}
                                                    onChange={e => patch({ breadthM: parseFloat(e.target.value) || 0 })}
                                                    className="w-14 text-right font-bold text-sm bg-transparent border-none outline-none p-0 m-0"
                                                    style={{ color: '#1c1c1e', WebkitAppearance: 'none', MozAppearance: 'textfield' }} />
                                                <span className="text-sm font-bold" style={{ color: '#1c1c1e' }}>m</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl" style={{ background: '#f5f5f5', border: '1px solid rgba(0,0,0,0.03)' }}>
                                            <label className="text-[10px] font-bold" style={{ color: '#8e8e93' }}>Height</label>
                                            <div className="flex items-baseline gap-1">
                                                <input type="number" step="0.1" value={localCfg.heightM}
                                                    onChange={e => patch({ heightM: parseFloat(e.target.value) || 0 })}
                                                    className="w-14 text-right font-bold text-sm bg-transparent border-none outline-none p-0 m-0"
                                                    style={{ color: '#1c1c1e', WebkitAppearance: 'none', MozAppearance: 'textfield' }} />
                                                <span className="text-sm font-bold" style={{ color: '#1c1c1e' }}>m</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-center justify-center p-4 rounded-2xl mb-5" style={{ background: '#c6d6ef' }}>
                                        <span className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#0A84FF' }}>Estimated Capacity</span>
                                        <span className="text-xl font-bold" style={{ color: '#2b4d83' }}>{formatVolume(previewCapacity)}</span>
                                    </div>

                                    {saveError && (
                                        <p className="text-[11px] font-bold text-center mt-0 mb-3" style={{ color: '#FF3B30' }}>{saveError}</p>
                                    )}

                                    {user?.role === "superadmin" && (
                                        <button onClick={async () => { await handleSave(); if (!saveError) setShowParams(false); }} disabled={!cfgDirty || saving}
                                            className="w-full font-semibold py-3.5 rounded-2xl text-white border-none cursor-pointer transition-opacity"
                                            style={{
                                                background: '#3A82F6',
                                                opacity: (cfgDirty && !saving) ? 1 : 0.5,
                                                pointerEvents: (cfgDirty && !saving) ? 'auto' : 'none',
                                                fontSize: '14px',
                                            }}>
                                            {saving ? 'Saving…' : 'Save Changes'}
                                        </button>
                                    )}

                                </div>
                            </div>
                        )}
                    </div>

                    {/* Node Info Modal */}
                    {showNodeInfo && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                            onClick={() => setShowNodeInfo(false)}>
                            <div className="rounded-[1.5rem] p-6 flex flex-col w-full max-w-2xl"
                                style={{
                                    background: 'linear-gradient(145deg, #e8f0fe 0%, #d1e3f4 50%, #b8d4e8 100%)',
                                    boxShadow: '0 20px 40px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)'
                                }}
                                onClick={e => e.stopPropagation()}>

                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-[17px] font-bold m-0" style={{ color: '#1c1c1e' }}>Node Information</h3>
                                    <button onClick={() => setShowNodeInfo(false)}
                                        className="flex items-center justify-center rounded-full bg-white border-none cursor-pointer p-0 transition-all hover:scale-110"
                                        style={{
                                            width: 24,
                                            height: 24,
                                            background: '#f5f5f5',
                                            color: '#3c3c43',
                                            fontSize: '18px',
                                            fontWeight: 'bold',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                        }}>
                                        &times;
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5e7c9a' }}>Device Name</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: '#2c3e50' }}>{deviceName}</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5e7c9a' }}>Hardware ID</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: '#2c3e50' }}>{hardwareId}</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5e7c9a' }}>Device Type</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: '#2c3e50' }}>Water Tank Monitor</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5e7c9a' }}>Location</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: '#2c3e50' }}>Not specified</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5e7c9a' }}>Subscription</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: '#2c3e50' }}>PRO</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5e7c9a' }}>Status</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: isOffline ? '#e74c3c' : '#27ae60' }}>
                                            {isOffline ? 'Offline' : 'Online'}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-6 flex gap-3">
                                    <button
                                        className="flex-1 font-semibold py-3 rounded-2xl text-white border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                                        style={{
                                            background: '#AF52DE',
                                            fontSize: '14px'
                                        }}
                                        onClick={() => {
                                            const info = `Device Name: ${deviceName}\nHardware ID: ${hardwareId}\nDevice Type: Water Tank Monitor\nLocation: Not specified\nSubscription: PRO\nStatus: ${isOffline ? 'Offline' : 'Online'}`;
                                            navigator.clipboard.writeText(info);
                                            alert('Node information copied to clipboard!');
                                        }}
                                    >
                                        Copy Info
                                    </button>
                                    <button
                                        className="flex-1 font-semibold py-3 rounded-2xl border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                                        style={{
                                            background: '#f5f5f5',
                                            color: '#1c1c1e',
                                            fontSize: '14px'
                                        }}
                                        onClick={() => setShowNodeInfo(false)}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch w-full">
                        {/* TANK VISUALIZER */}
                        <div className="apple-glass-card rounded-[2.5rem] p-6 flex flex-col relative overflow-hidden flex-grow">
                            <div className="flex justify-between items-center mb-2 z-10 w-full">
                                <div>
                                    <h3 className="text-xl font-semibold m-0 leading-tight">{deviceName}</h3>
                                </div>
                                <div className="flex items-center">
                                    <span className="flex items-center gap-1 text-xs font-semibold rounded-md px-2 py-1"
                                        style={{ color: '#0A84FF', background: 'rgba(10,132,255,0.1)' }}>
                                        <span className="material-symbols-rounded" style={{ fontSize: 14 }}>sync</span> Live
                                    </span>
                                </div>
                            </div>

                            <div className="flex-grow flex items-center justify-center py-4 z-10 mt-4 mb-4" style={{ minHeight: '300px' }}>
                                <div className="relative" style={{ width: 160, height: 230 }}>
                                    <div className="absolute inset-0 rounded-[40px] overflow-hidden z-10 tank-glass"
                                        style={{ border: '3px solid rgba(255,255,255,0.6)', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
                                        <div className="absolute top-0 bottom-0 left-2" style={{ width: 16, background: 'linear-gradient(90deg,rgba(255,255,255,0.6),transparent)', filter: 'blur(2px)', zIndex: 30 }} />
                                        <div className="absolute top-0 bottom-0 right-1" style={{ width: 8, background: 'linear-gradient(270deg,rgba(255,255,255,0.4),transparent)', filter: 'blur(1px)', zIndex: 30 }} />

                                        <div className="absolute bottom-0 left-0 right-0 overflow-hidden z-20"
                                            style={{ height: telemetryLoading ? '50%' : `${pct}%`, transition: 'height 1.5s cubic-bezier(0.34,1.56,0.64,1)', background: 'linear-gradient(180deg, #0A84FF 0%, #004ba0 100%)' }}>
                                            <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.1)', mixBlendMode: 'overlay' }} />
                                            {/* Level text inside water if high enough */}
                                            {pct > 15 && (
                                                <div className="absolute top-6 left-0 right-0 text-center pointer-events-none z-30"
                                                    style={{
                                                        color: '#ffffff',
                                                        fontSize: '36px',
                                                        fontWeight: 800,
                                                        lineHeight: 1,
                                                        textShadow: '0 2px 6px rgba(0,0,0,0.35)',
                                                        letterSpacing: '-1px'
                                                    }}>
                                                    {Math.round(pct)}%
                                                </div>
                                            )}
                                            <div className="absolute bottom-0 w-[200%] h-full left-0 wave-animation" style={{ opacity: 0.8 }}>
                                                <svg viewBox="0 0 800 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                                                    <path d="M 0,30 Q 100,50 200,30 T 400,30 T 600,30 T 800,30 L 800,100 L 0,100 Z" fill="rgba(255,255,255,0.3)" />
                                                </svg>
                                            </div>
                                        </div>

                                        <div className="absolute right-3 top-0 bottom-0 flex flex-col justify-between py-6 z-30" style={{ opacity: 0.6, width: 32 }}>
                                            {[['100', true], ['', false], ['75', true], ['', false], ['50', true], ['', false], ['25', true], ['', false], ['0', true]].map(([lbl, show], i) => (
                                                <div key={i} className="flex items-center justify-end gap-1">
                                                    {show && <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'monospace', color: '#475569' }}>{lbl}</span>}
                                                    <div style={{ width: (show as boolean) ? 8 : 4, height: 2, background: show ? '#94a3b8' : '#cbd5e1', borderRadius: 2 }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col mt-auto pt-4 gap-2 z-10 w-full">
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 w-full">
                                    <div className="text-left rounded-xl p-2 flex flex-col justify-center" style={{ background: 'rgba(10,132,255,0.05)', border: '1px solid rgba(10,132,255,0.1)' }}>
                                        <p className="text-[8px] font-bold uppercase tracking-wider m-0 mb-0.5" style={{ color: '#0A84FF' }}>Water Level</p>
                                        <p className="text-sm font-black m-0 tracking-tight" style={{ color: '#0A84FF' }}>{Math.round(pct)}%</p>
                                    </div>
                                    <div className="text-left rounded-xl p-2 flex flex-col justify-center" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                                        <p className="text-[8px] font-bold uppercase tracking-wider m-0 mb-0.5" style={{ color: '#8E8E93' }}>Water Height</p>
                                        <p className="text-sm font-black m-0 tracking-tight" style={{ color: '#1C1C1E' }}>{waterAnalytics.waterHeightM.toFixed(1)} m</p>
                                    </div>
                                    <div className="text-left rounded-xl p-2 flex flex-col justify-center" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                                        <p className="text-[8px] font-bold uppercase tracking-wider m-0 mb-0.5" style={{ color: '#8E8E93' }}>Sensor</p>
                                        <p className="text-sm font-black m-0 tracking-tight" style={{ color: '#1C1C1E' }}>{waterAnalytics.sensorDistanceM.toFixed(2)} m</p>
                                    </div>
                                    <div className="text-left rounded-xl p-2 flex flex-col justify-center" style={{ background: 'rgba(52,199,89,0.05)', border: '1px solid rgba(52,199,89,0.1)' }}>
                                        <p className="text-[8px] font-bold uppercase tracking-wider m-0 mb-0.5" style={{ color: '#34C759' }}>Available</p>
                                        <p className="text-sm font-black m-0 tracking-tight" style={{ color: '#115C29' }}>{Math.round(metrics.volumeLitres).toLocaleString()} L</p>
                                    </div>
                                    <div className="text-left rounded-xl p-2 flex flex-col justify-center" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                                        <p className="text-[8px] font-bold uppercase tracking-wider m-0 mb-0.5" style={{ color: '#8E8E93' }}>Total Cap</p>
                                        <p className="text-sm font-black m-0 tracking-tight" style={{ color: '#1C1C1E' }}>{Math.round(metrics.capacityLitres).toLocaleString()} L</p>
                                    </div>
                                    <div className="text-left rounded-xl p-2 flex flex-col justify-center" style={{ background: 'rgba(255,149,0,0.05)', border: '1px solid rgba(255,149,0,0.1)' }}>
                                        <p className="text-[8px] font-bold uppercase tracking-wider m-0 mb-0.5" style={{ color: '#FF9500' }}>Remaining</p>
                                        <p className="text-sm font-black m-0 tracking-tight" style={{ color: '#995900' }}>{Math.round(waterAnalytics.remainingCapacityLiters).toLocaleString()} L</p>
                                    </div>
                                </div>

                                <div className="text-center w-full mt-1">
                                    <span className="text-[10px] font-medium" style={{ color: '#8E8E93' }}>{staleLabel}</span>
                                </div>
                            </div>

                            {/* Estimation Cards row - Positioned below Tank visualizer to align with Timeline neighbor */}
                            <div className="grid grid-cols-2 gap-4 w-full">
                                <div className="apple-glass-card p-4 rounded-3xl flex flex-col justify-between" style={{ background: 'rgba(255, 149, 0, 0.1)', border: '1px solid rgba(255, 149, 0, 0.2)', minHeight: '130px', boxShadow: '0 8px 32px rgba(255, 149, 0, 0.05)' }}>
                                    <div className="flex justify-between items-start">
                                        <div className="p-1.5 rounded-lg" style={{ background: 'rgba(255, 149, 0, 0.15)' }}>
                                            <Timer size={18} color="#FF9500" />
                                        </div>
                                        <Info size={14} color="#8E8E93" className="cursor-help opacity-60 hover:opacity-100" />
                                    </div>
                                    <div className="flex flex-col mt-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#8E8E93' }}>Est. Time Until Empty</span>
                                        <span className="text-lg font-black tracking-tight mt-0.5" style={{ color: '#1C1C1E' }}>
                                            {waterAnalytics.estimatedEmptyTimeMinutes ?
                                                `${Math.floor(waterAnalytics.estimatedEmptyTimeMinutes / 60)}h ${Math.floor(waterAnalytics.estimatedEmptyTimeMinutes % 60)}m`
                                                : '--'}
                                        </span>
                                    </div>
                                </div>
                                <div className="apple-glass-card p-4 rounded-3xl flex flex-col justify-between" style={{ background: 'rgba(10, 132, 255, 0.1)', border: '1px solid rgba(10, 132, 255, 0.2)', minHeight: '130px', boxShadow: '0 8px 32px rgba(10, 132, 255, 0.05)' }}>
                                    <div className="flex justify-between items-start">
                                        <div className="p-1.5 rounded-lg" style={{ background: 'rgba(10, 132, 255, 0.15)' }}>
                                            <Droplets size={18} color="#0A84FF" />
                                        </div>
                                        <Info size={14} color="#8E8E93" className="cursor-help opacity-60 hover:opacity-100" />
                                    </div>
                                    <div className="flex flex-col mt-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#8E8E93' }}>Est. Time Until Full</span>
                                        <span className="text-lg font-black tracking-tight mt-0.5" style={{ color: '#1C1C1E' }}>
                                            {waterAnalytics.estimatedFullTimeMinutes ?
                                                (waterAnalytics.estimatedFullTimeMinutes > 60 ?
                                                    `${Math.floor(waterAnalytics.estimatedFullTimeMinutes / 60)}h ${Math.floor(waterAnalytics.estimatedFullTimeMinutes % 60)}m`
                                                    : `${Math.floor(waterAnalytics.estimatedFullTimeMinutes)} min`)
                                                : '--'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* COLUMN 2 - GRAPHS & INSIGHTS */}
                        <div className="lg:col-span-2 flex flex-col gap-4 w-full h-full">
                            {/* RATE CARDS */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                                <div className="apple-glass-card text-left rounded-[1.5rem] p-5 flex flex-col justify-between" style={{ background: 'rgba(255, 255, 255, 0.25)', border: '1px solid rgba(255,255,255,0.35)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', minHeight: '130px', position: 'relative' }}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center justify-center rounded-xl w-10 h-10" style={{ background: 'rgba(52,199,89,0.15)' }}>
                                            <TrendingUp size={22} color="#34C759" />
                                        </div>
                                        <Info size={16} color="#8E8E93" className="cursor-help" />
                                    </div>
                                    <div className="flex flex-col mt-auto pt-3 gap-0.5">
                                        <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: '#8E8E93' }}>Fill Rate</p>
                                        <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: '#34C759' }}>
                                            {waterAnalytics.fillRateLpm > 0 ? (
                                                <>+{waterAnalytics.fillRateLpm.toFixed(0)} <span className="text-[13px] font-bold" style={{ color: '#8E8E93' }}>L/min</span></>
                                            ) : '--'}
                                        </p>
                                    </div>
                                </div>
                                <div className="apple-glass-card text-left rounded-[1.5rem] p-5 flex flex-col justify-between" style={{ background: 'rgba(255, 255, 255, 0.25)', border: '1px solid rgba(255,255,255,0.35)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', minHeight: '130px', position: 'relative' }}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center justify-center rounded-xl w-10 h-10" style={{ background: 'rgba(255,59,48,0.15)' }}>
                                            <TrendingDown size={22} color="#FF3B30" />
                                        </div>
                                        <Info size={16} color="#8E8E93" className="cursor-help" />
                                    </div>
                                    <div className="flex flex-col mt-auto pt-3 gap-0.5">
                                        <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: '#8E8E93' }}>Consumption</p>
                                        <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: '#FF3B30' }}>
                                            {waterAnalytics.drainRateLpm > 0 ? (
                                                <>-{waterAnalytics.drainRateLpm.toFixed(0)} <span className="text-[13px] font-bold" style={{ color: '#8E8E93' }}>L/min</span></>
                                            ) : '--'}
                                        </p>
                                    </div>
                                </div>
                                <div className="apple-glass-card text-left rounded-[1.5rem] p-5 flex flex-col justify-between" style={{ background: 'rgba(255, 255, 255, 0.25)', border: '1px solid rgba(255,255,255,0.35)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', minHeight: '130px', position: 'relative' }}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center justify-center rounded-xl w-10 h-10" style={{ background: 'rgba(175,82,222,0.15)' }}>
                                            <Bell size={22} color="#AF52DE" />
                                        </div>
                                        <Info size={16} color="#8E8E93" className="cursor-help" />
                                    </div>
                                    <div className="flex flex-col mt-auto pt-3 gap-0.5">
                                        <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: '#8E8E93' }}>Alerts</p>
                                        <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: '#1C1C1E' }}>
                                            0 <span className="text-[13px] font-bold" style={{ color: '#8E8E93' }}>Active</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="apple-glass-card text-left rounded-[1.5rem] p-5 flex flex-col justify-between" style={{ background: 'rgba(255, 255, 255, 0.25)', border: '1px solid rgba(255,255,255,0.35)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', minHeight: '130px', position: 'relative' }}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center justify-center rounded-xl w-10 h-10" style={{ background: 'rgba(10,132,255,0.15)' }}>
                                            <Wifi size={22} color="#0A84FF" />
                                        </div>
                                        <Info size={16} color="#8E8E93" className="cursor-help" />
                                    </div>
                                    <div className="flex flex-col mt-auto pt-3 gap-0.5">
                                        <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: '#8E8E93' }}>Device Health</p>
                                        <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: '#34C759' }}>
                                            Healthy
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* COMBINED HISTORY CHART */}
                            <div className="apple-glass-card flex flex-col items-stretch justify-between relative overflow-hidden flex-grow" style={{
                                background: 'rgba(255, 255, 255, 0.25)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                borderRadius: '24px',
                                border: '1px solid rgba(255,255,255,0.35)',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
                                padding: '24px',
                                minHeight: '350px'
                            }}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="m-0" style={{ fontSize: '18px', fontWeight: 600, color: 'rgba(0,0,0,0.75)' }}>
                                            TANK LEVEL AND VOLUME
                                        </h4>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full" style={{ background: '#0A84FF' }} />
                                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(0,0,0,0.5)' }}>Tank Level (%)</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full" style={{ background: '#FF9500' }} />
                                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(0,0,0,0.5)' }}>Volume</span>
                                        </div>
                                    </div>
                                </div>

                                {historyLoading ? (
                                    <div className="flex-grow flex items-center justify-center text-slate-400">Loading history…</div>
                                ) : (
                                    <div className="flex-grow flex flex-col relative justify-end">
                                        <ResponsiveContainer width="100%" height={280}>
                                            <AreaChart data={combinedChartData.slice(-50)} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.15} />
                                                        <stop offset="95%" stopColor="#0A84FF" stopOpacity={0} />
                                                    </linearGradient>
                                                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#FF9500" stopOpacity={0.15} />
                                                        <stop offset="95%" stopColor="#FF9500" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8E8E93' }} />

                                                {/* LEFT Y-AXIS - LEVEL % */}
                                                <YAxis yAxisId="left" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#0A84FF' }}
                                                    label={{ value: 'Level (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 10, fill: '#0A84FF', fontWeight: 600 } }} />

                                                {/* RIGHT Y-AXIS - VOLUME KL */}
                                                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#FF9500' }}
                                                    tickFormatter={(v) => volDivisor === 1000 ? `${(v / 1000).toFixed(1)}K` : v}
                                                    label={{ value: `Volume (${volDivisor === 1000 ? 'KL' : 'L'})`, angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fontSize: 10, fill: '#FF9500', fontWeight: 600 } }} />

                                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }} />


                                                <Area yAxisId="left" type="monotone" name="Tank Level (%)" dataKey="level" stroke="#0A84FF" fillOpacity={1} fill="url(#colorLevel)" strokeWidth={2.5} />
                                                <Area yAxisId="right" type="monotone" name="Volume" dataKey="volume" stroke="#FF9500" fillOpacity={1} fill="url(#colorVolume)" strokeWidth={2.5} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>

                            {/* TODAY'S EVENT TIMELINE - Relocated below graphs */}
                            <div className="apple-glass-card p-5 rounded-[2rem] mt-1" style={{ background: 'rgba(255, 255, 255, 0.25)', border: '1px solid rgba(255,255,255,0.35)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}>
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(10,132,255,0.1)' }}>
                                            <Activity size={18} color="#0A84FF" />
                                        </div>
                                        <h4 className="m-0 text-sm font-bold uppercase tracking-widest" style={{ color: 'rgba(0,0,0,0.6)' }}>Today's Event Timeline</h4>
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                        <Clock size={12} />
                                        <span>LAST 24 HOURS</span>
                                    </div>
                                </div>

                                <div className="relative h-24 flex items-center px-4">
                                    {/* Timeline Base Line */}
                                    <div className="absolute left-6 right-6 h-0.5 bg-slate-100 rounded-full" />
                                    
                                    {/* Event Samples */}
                                    <div className="relative flex justify-between w-full">
                                        {[
                                            { time: '08:15', label: 'Refill', icon: TrendingUp, color: '#34C759', pos: '15%' },
                                            { time: '12:30', label: 'Peak Use', icon: Activity, color: '#FF3B30', pos: '45%' },
                                            { time: '15:45', label: 'Stable', icon: Activity, color: '#0A84FF', pos: '70%' },
                                            { time: '19:20', label: 'Refill', icon: TrendingUp, color: '#34C759', pos: '90%' }
                                        ].map((event, idx) => (
                                            <div key={idx} className="absolute flex flex-col items-center group cursor-pointer" style={{ left: event.pos, transform: 'translateX(-50%)' }}>
                                                <div className="w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm mb-2 transition-transform group-hover:scale-125" style={{ background: event.color }} />
                                                <div className="apple-glass-card p-1.5 px-2 rounded-lg flex flex-col items-center gap-0.1 shadow-sm opacity-80 group-hover:opacity-100 transition-opacity" style={{ background: 'white', minWidth: '65px', border: `1px solid ${event.color}20` }}>
                                                    <span className="text-[10px] font-black leading-none" style={{ color: event.color }}>{event.time}</span>
                                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">{event.label}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
};

export default EvaraTankAnalytics;
