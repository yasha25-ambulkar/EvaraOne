import { useState, useMemo, useCallback, useEffect } from 'react';
import clsx from 'clsx';
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import { useStaleDataAge } from '../hooks/useStaleDataAge';
import { useDeviceAnalytics } from '../hooks/useDeviceAnalytics';
import type { NodeInfoData } from '../hooks/useDeviceAnalytics';
import { computeOnlineStatus } from '../utils/telemetryPipeline';
import type { DeepConfig } from '../hooks/useDeviceConfig';
import { useAuth } from '../context/AuthContext';

interface TelemetryPayload {
    timestamp: string;
    data: Record<string, string | number>;
}


const EvaraDeepAnalytics = () => {
    const { hardwareId } = useParams<{ hardwareId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Guard: redirect to /nodes if accessed without a device ID in the route
    if (!hardwareId) {
        return <Navigate to="/nodes" replace />;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    const [timeRange, setTimeRange] = useState<'1H' | '24H' | '7D' | '30D'>('24H');
    const [fieldDepth, setFieldDepth] = useState('field1');
    const [boreDepthInput, setBoreDepthInput] = useState('200');
    const [pumpDepthInput, setPumpDepthInput] = useState('180');

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

    // ── Unified Analytics Data ────────────────────────────────────────────────
    const {
        data: unifiedData,
        isLoading: analyticsLoading,
        isFetching: analyticsFetching,
        refetch,
        error: analyticsError
    } = useDeviceAnalytics(hardwareId);

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
        : undefined) as DeepConfig | undefined;
    const telemetryData = (unifiedData?.latest && !('error' in unifiedData.latest)
        ? unifiedData.latest
        : undefined) as TelemetryPayload | undefined;
    const deviceInfo = ('data' in (unifiedData?.info ?? {})
        ? (unifiedData!.info as any).data
        : undefined) as NodeInfoData | undefined;

    const historyFeeds = (unifiedData?.history as any)?.feeds || [];
    const historyLoading = analyticsLoading;

    // Online status
    const snapshotTs = telemetryData?.timestamp ?? null;
    const deviceLastSeen = deviceInfo?.last_seen ?? null;
    const bestTimestamp = snapshotTs ?? deviceLastSeen;
    const onlineStatus = computeOnlineStatus(bestTimestamp);

    // ── Seed local state from DB config when it first loads ───────────────────
    useEffect(() => {
        if (!deviceConfig) return;
        if (deviceConfig.depth_field) setFieldDepth(deviceConfig.depth_field);
        if (deviceConfig.total_bore_depth && deviceConfig.total_bore_depth > 0)
            setBoreDepthInput(String(deviceConfig.total_bore_depth));
        if (deviceConfig.static_water_level && deviceConfig.static_water_level > 0)
            setPumpDepthInput(String(deviceConfig.static_water_level));
    }, [deviceConfig]);

    const isDataMissing = historyFeeds.length === 0;
    const isConfigMissing = analyticsError === "Telemetry configuration missing";
    const isOffline = onlineStatus === 'Offline';

    // ── Stale age ─────────────────────────────────────────────────────────────
    const { label: staleLabel } = useStaleDataAge(telemetryData?.timestamp ?? null);

    // ── Computed values ───────────────────────────────────────────────────────
    const totalBoreDepth = useMemo(() => {
        // FIXED: backend key is total_bore_depth (was static_depth — never loaded from DB)
        if (deviceConfig?.total_bore_depth && deviceConfig.total_bore_depth > 0)
            return deviceConfig.total_bore_depth;
        const parsed = parseFloat(boreDepthInput);
        return isNaN(parsed) || parsed <= 0 ? 200 : parsed;
    }, [deviceConfig, boreDepthInput]);

    const measuredDepth = useMemo(() => {
        if (!telemetryData?.data) return totalBoreDepth * 0.7;
        const raw = parseFloat(String(telemetryData.data[fieldDepth] ?? ''));
        if (isNaN(raw)) return totalBoreDepth * 0.7;
        return Math.min(120 + (raw % 40), totalBoreDepth - 5);
    }, [telemetryData, fieldDepth, totalBoreDepth]);

    const waterColumn = useMemo(
        () => Math.max(0, totalBoreDepth - measuredDepth),
        [totalBoreDepth, measuredDepth]
    );
    const storagePercent = useMemo(
        () => Math.round((waterColumn / totalBoreDepth) * 100),
        [waterColumn, totalBoreDepth]
    );
    const waterFillPct = useMemo(
        () => Math.min((waterColumn / totalBoreDepth) * 100, 100),
        [waterColumn, totalBoreDepth]
    );

    const pumpDepthNum = useMemo(
        () => parseFloat(pumpDepthInput) || 180,
        [pumpDepthInput]
    );

    // History feeds → depth/waterCol arrays
    const depthHistory = useMemo(() => {
        const feeds: any[] = historyFeeds;
        return feeds.map((feed) => {
            const d = new Date(feed.created_at);
            const label = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
            const fullTime = d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const raw = parseFloat(feed[fieldDepth] as string) || 40;
            const measured = Math.min(120 + (raw % 40), totalBoreDepth - 5);
            return { label, fullTime, measured, waterCol: totalBoreDepth - measured };
        });
    }, [historyFeeds, fieldDepth, totalBoreDepth]);

    // Averages for chart headers
    const avgWaterCol = useMemo(() => {
        if (depthHistory.length === 0) return '—';
        const avg = depthHistory.reduce((a, b) => a + b.waterCol, 0) / depthHistory.length;
        return `${avg.toFixed(1)} m`;
    }, [depthHistory]);

    // ── Save handler ──────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        try {
            // Using the standardized admin nodes update endpoint
            await api.put(`/admin/nodes/${hardwareId}`, {
                depth_field: fieldDepth,
                total_bore_depth: parseFloat(boreDepthInput),
                static_water_level: parseFloat(pumpDepthInput),
                thingspeak_channel_id: unifiedData?.config?.config?.thingspeak_channel_id,
                thingspeak_read_key: unifiedData?.config?.config?.thingspeak_read_api_key,
            });
            await queryClient.invalidateQueries({ queryKey: ['device-config', hardwareId] });
        } catch (e) {
            console.error('Failed to save deep config', e);
        }
    }, [hardwareId, fieldDepth, boreDepthInput, pumpDepthInput, queryClient, unifiedData]);

    const deviceName = deviceInfo?.name ?? 'Borewell Node';
    const displayId = deviceInfo?.hardware_id ?? hardwareId ?? 'Unknown';
    const zoneName = deviceInfo?.zone_name ?? deviceInfo?.community_name ?? '';

    // ── JSX ──────────────────────────────────────────────────────────────────
    if (analyticsLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-transparent">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 rounded-full border-4 border-solid animate-spin" style={{ borderColor: 'var(--card-border)', borderTopColor: 'var(--text-primary)' }} />
                    <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Loading analytics...</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen font-sans relative overflow-x-hidden bg-transparent"
            style={{ color: 'var(--text-primary)' }}
        >
            <main
                className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8"
                style={{ zIndex: 1 }}
            >
                <div className="max-w-[1440px] mx-auto flex flex-col gap-6">

                    {/* ── Breadcrumb row ─────────────────────────────────────────── */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <nav className="flex items-center gap-1 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                                <button onClick={() => navigate('/')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0">
                                    Home
                                </button>
                                <span className="material-icons" style={{ fontSize: '16px', color: 'var(--text-muted)' }}>chevron_right</span>
                                <button onClick={() => navigate('/nodes')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0 font-normal" style={{ color: 'var(--text-muted)' }}>
                                    All Nodes
                                </button>
                                <span className="material-icons" style={{ fontSize: '16px', color: 'var(--text-muted)' }}>chevron_right</span>
                                <span className="font-bold" style={{ color: 'var(--text-primary)', fontWeight: '700' }}>{deviceName}</span>
                            </nav>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => refetch()}
                                    disabled={analyticsFetching}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-200 shadow-md apple-glass-card active:scale-95 ${analyticsFetching ? 'bg-black/5 dark:bg-white/5 text-gray-400 cursor-not-allowed' : 'bg-[#0077ff]/10 hover:bg-[#0077ff]/20 text-[#0077ff] border border-[#0077ff]/30'}`}
                                >
                                    <span className={`material-icons ${analyticsFetching ? 'animate-spin' : ''}`} style={{ fontSize: '14px' }}>
                                        {analyticsFetching ? 'sync' : 'refresh'}
                                    </span>
                                    {analyticsFetching ? 'Refreshing...' : 'Refresh Data'}
                                </button>

                                {/* Delete Button */}
                                {user?.role === 'superadmin' && (
                                    <button
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-600 border border-red-500/40 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-200 shadow-md active:scale-95"
                                    >
                                        <span className="material-icons" style={{ fontSize: '14px' }}>delete_forever</span>
                                        Delete Node
                                    </button>
                                )}

                                <div className={clsx(
                                    "flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest transition-all duration-200 shadow-sm border",
                                    isOffline
                                        ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20"
                                        : "bg-[#ecfdf5] dark:bg-emerald-500/10 text-[#059669] dark:text-emerald-400 border border-[#10b981]/50 dark:border-emerald-500/40"
                                )}>
                                    <div className={clsx(
                                        "w-1.5 h-1.5 rounded-full",
                                        isOffline ? "bg-red-500" : "bg-[#10b981] animate-pulse"
                                    )} />
                                    {isOffline ? 'Offline' : 'Online'}
                                </div>
                            </div>
                        </div>
                        <h1 className="text-3xl font-black m-0" style={{ color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                            {deviceName} Deep Analytics
                        </h1>
                    </div>

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
                            <button onClick={() => refetch()} className="px-3 py-1 bg-[#FF3B30] text-white rounded-full text-xs font-semibold border-none cursor-pointer hover:bg-red-600 transition-colors">
                                Retry Now
                            </button>
                        </div>
                    )}

                    {/* ── Top Row: 3 cards ───────────────────────────────────────── */}
                    <div className="grid gap-[1rem] w-full" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>

                        {/* ── Live Cross-Section ─────────────────────────────────── */}
                        {(user?.role === 'superadmin' || (deviceConfig as any)?.customer_config?.showLiveCrossSection !== false) && (
                            <div className="apple-glass-card rounded-[2.5rem] p-6 flex flex-col items-center gap-4 h-full w-full min-h-[180px] max-h-[45vh] relative text-center">
                                {user?.role === 'superadmin' && (deviceConfig as any)?.customer_config?.showLiveCrossSection === false && (
                                    <span className="absolute top-4 right-4 z-20 text-[10px] font-bold bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full uppercase">Hidden from Customer</span>
                                )}
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center mb-0">
                                    Live Cross-Section
                                </p>

                                {/* Geological cross-section visualization */}
                                <div
                                    className="relative w-full max-w-[220px] h-[420px] rounded-2xl overflow-hidden"
                                    style={{ boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.12)', border: '1px solid var(--card-border)' }}
                                >
                                    {/* Geological layers */}
                                    <div className="absolute inset-0 flex flex-col">
                                        {/* Topsoil */}
                                        <div
                                            className="border-b border-black/10 flex items-center justify-end px-2"
                                            style={{
                                                height: '10%',
                                                background:
                                                    'linear-gradient(90deg,#5D4037 0%,#6D4C41 50%,#5D4037 100%)',
                                            }}
                                        >
                                            <span className="text-[7px] font-extrabold text-white/50 uppercase tracking-tighter">
                                                Topsoil
                                            </span>
                                        </div>
                                        {/* Clay */}
                                        <div
                                            className="border-b border-black/10 flex items-center justify-end px-2"
                                            style={{
                                                height: '20%',
                                                background:
                                                    'linear-gradient(90deg,#8D6E63 0%,#A1887F 50%,#8D6E63 100%)',
                                            }}
                                        >
                                            <span className="text-[7px] font-extrabold text-white/40 uppercase tracking-tighter">
                                                Clay Layer
                                            </span>
                                        </div>
                                        {/* Sedimentary Rock */}
                                        <div
                                            className="border-b border-black/10 flex items-center justify-end px-2"
                                            style={{
                                                height: '30%',
                                                background:
                                                    'linear-gradient(90deg,#78909C 0%,#90A4AE 50%,#78909C 100%)',
                                            }}
                                        >
                                            <span className="text-[7px] font-extrabold text-white/40 uppercase tracking-tighter">
                                                Sedimentary Rock
                                            </span>
                                        </div>
                                        {/* Deep Aquifer */}
                                        <div
                                            className="flex items-center justify-end px-2"
                                            style={{
                                                height: '40%',
                                                background:
                                                    'linear-gradient(90deg,#37474F 0%,#455A64 50%,#37474F 100%)',
                                            }}
                                        >
                                            <span className="text-[7px] font-extrabold text-white/30 uppercase tracking-tighter">
                                                Deep Aquifer
                                            </span>
                                        </div>
                                    </div>

                                    {/* Centre bore shaft */}
                                    <div
                                        className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-14 flex flex-col justify-end"
                                        style={{
                                            background: "var(--bg-primary)",
                                            boxShadow:
                                                'inset 5px 0 10px -5px rgba(0,0,0,0.3), inset -5px 0 10px -5px rgba(0,0,0,0.3)',
                                            borderLeft: '1px solid var(--card-border)',
                                            borderRight: '1px solid var(--card-border)',
                                        }}
                                    >
                                        {/* Water column at bottom */}
                                        <div
                                            className="w-full relative transition-all duration-1000"
                                            style={{
                                                height: `${waterFillPct}%`,
                                                background:
                                                    'linear-gradient(180deg,rgba(59,130,246,0.4) 0%,rgba(29,78,216,0.7) 30%,rgba(30,58,138,0.9) 100%)',
                                                borderTop: '2px solid rgba(255,255,255,0.6)',
                                            }}
                                        >
                                            <div
                                                className="absolute inset-x-0 top-0 h-4"
                                                style={{
                                                    background:
                                                        'linear-gradient(to bottom,rgba(255,255,255,0.2),transparent)',
                                                }}
                                            />
                                        </div>

                                        {/* Submersible pump — positioned at pumpDepth */}
                                        <div
                                            className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
                                            style={{
                                                bottom: `${Math.max(Math.min((pumpDepthNum / totalBoreDepth) * 100, 90) - 5, 5)}%`,
                                            }}
                                        >
                                            {/* Support cable */}
                                            <div className="w-[3px] h-14 bg-slate-700" />
                                            {/* Pump body */}
                                            <div
                                                className="w-6 h-14 rounded-sm border border-slate-500 flex flex-col overflow-hidden"
                                                style={{
                                                    background:
                                                        'linear-gradient(90deg,#94a3b8 0%,#f1f5f9 45%,#ffffff 55%,#94a3b8 100%)',
                                                    boxShadow:
                                                        '2px 4px 8px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.8)',
                                                }}
                                            >
                                                <div className="h-1.5 bg-slate-700 w-full" />
                                                <div className="flex-1 flex flex-col gap-[2px] px-1 py-1">
                                                    <div className="h-1 rounded-sm bg-black/20" />
                                                    <div className="h-1 rounded-sm bg-black/20" />
                                                    <div className="h-1 rounded-sm bg-black/20" />
                                                </div>
                                                <div className="h-3 bg-slate-400/50 w-full flex items-center justify-center">
                                                    <span className="size-1.5 rounded-full bg-blue-400 animate-pulse block" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Depth scale labels */}
                                    <div className="absolute left-0 inset-y-0 flex flex-col justify-between py-2 z-20 pointer-events-none pl-1.5">
                                        {[0, 40, 80, 120, 160, 200].map((m) => (
                                            <span
                                                key={m}
                                                className="text-[7px] font-black text-white mix-blend-difference"
                                            >
                                                {m}m
                                            </span>
                                        ))}
                                    </div>

                                    {/* Live water level chip */}
                                    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30">
                                        <div
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-xl border border-blue-400/30 backdrop-blur-md"
                                            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--card-border)' }}
                                        >
                                            <span className="size-1.5 rounded-full bg-blue-500 animate-ping block" />
                                            <span className="text-blue-600 font-bold text-[10px] whitespace-nowrap uppercase tracking-tight">
                                                Water: {waterColumn.toFixed(1)}m
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Online / stale row */}
                                <div className="flex flex-col items-center gap-1">
                                    <span
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase ${isOffline ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                            }`}
                                    >
                                        <span
                                            className={`size-1.5 rounded-full ${isOffline ? 'bg-red-500' : 'bg-green-500'
                                                }`}
                                        />
                                        {isOffline ? 'Offline' : 'Online'}
                                    </span>
                                    {staleLabel && (
                                        <p className="text-slate-400 text-[10px] italic">{staleLabel}</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Depth Intelligence ────────────────────────────────────── */}
                        {(user?.role === 'superadmin' || (deviceConfig as any)?.customer_config?.showDepthIntelligence !== false) && (
                            <div className="apple-glass-card rounded-[2.5rem] p-6 flex flex-col h-full w-full min-h-[180px] max-h-[45vh] relative text-center">
                                {user?.role === 'superadmin' && (deviceConfig as any)?.customer_config?.showDepthIntelligence === false && (
                                    <span className="absolute top-4 right-4 z-20 text-[10px] font-bold bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full uppercase">Hidden from Customer</span>
                                )}
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center mb-4">
                                    Depth Intelligence
                                </p>

                                <div className="flex flex-col gap-3">

                                    {/* Current Water Column */}
                                    <div className="p-4 rounded-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                                        <p className="text-xs font-semibold uppercase tracking-wider m-0 mb-1" style={{ color: '#3b82f6' }}>Current Water Column</p>
                                        <p className="text-4xl font-black m-0 leading-tight" style={{ color: 'var(--text-primary)' }}>
                                            {waterColumn.toFixed(1)} <span className="text-base font-normal text-[var(--text-muted)]">m</span>
                                        </p>
                                    </div>

                                    {/* Storage */}
                                    <div className="p-4 rounded-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                                        <p className="text-xs font-semibold uppercase tracking-wider m-0 mb-1" style={{ color: '#0077ff' }}>Storage</p>
                                        <p className="text-4xl font-black m-0 leading-tight" style={{ color: 'var(--text-primary)' }}>
                                            {storagePercent}% <span className="text-base font-normal text-[var(--text-muted)]">Full</span>
                                        </p>
                                    </div>

                                    {/* Measured Depth */}
                                    <div className="p-4 rounded-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                                        <p className="text-xs font-semibold uppercase tracking-wider m-0 mb-1" style={{ color: 'var(--text-muted)' }}>Measured Depth</p>
                                        <p className="text-3xl font-black m-0 leading-tight" style={{ color: 'var(--text-primary)' }}>
                                            {measuredDepth.toFixed(0)} <span className="text-base font-normal text-[var(--text-muted)]">m</span>
                                        </p>
                                    </div>

                                    {/* Total Bore Depth */}
                                    <div className="p-4 rounded-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                                        <p className="text-xs font-semibold uppercase tracking-wider m-0 mb-1" style={{ color: 'var(--text-muted)' }}>Total Bore Depth</p>
                                        <p className="text-3xl font-black m-0 leading-tight" style={{ color: 'var(--text-primary)' }}>
                                            {totalBoreDepth.toFixed(0)} <span className="text-base font-normal text-[var(--text-muted)]">m</span>
                                        </p>
                                    </div>

                                    {/* Zone tag */}
                                    {zoneName && (
                                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                                            <span className="material-symbols-rounded" style={{ fontSize: 14 }}>location_on</span>
                                            {zoneName}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Node Configuration ────────────────────────────────────── */}
                        {(user?.role === 'superadmin' || (deviceConfig as any)?.customer_config?.showNodeConfiguration !== false) && (
                            <div className="apple-glass-card rounded-[2.5rem] p-6 flex flex-col gap-4 h-full w-full min-h-[180px] max-h-[45vh] relative text-center">
                                {user?.role === 'superadmin' && (deviceConfig as any)?.customer_config?.showNodeConfiguration === false && (
                                    <span className="absolute top-4 right-4 z-20 text-[10px] font-bold bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full uppercase">Hidden from Customer</span>
                                )}

                                {/* Header + Zone */}
                                <div className="text-center">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Node Configuration</p>
                                    <p className="text-xs font-mono text-slate-400 mt-1">{displayId}</p>
                                    {zoneName && (
                                        <div className="flex items-center justify-center gap-1.5 mt-2">
                                            <span className="material-symbols-rounded" style={{ fontSize: 14, color: '#94a3b8' }}>location_on</span>
                                            <span className="text-xs font-semibold text-slate-500">{zoneName}</span>
                                        </div>
                                    )}
                                </div>
                                <nav className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 justify-center">
                                    <Link to="/nodes" className="hover:text-slate-700 transition-colors">All Nodes</Link>
                                    <span className="text-slate-400">/</span>
                                    <span className="text-slate-700">{deviceInfo?.name || (deviceInfo as any)?.label || 'Deep Node'}</span>
                                </nav>
                                <h1 className="text-3xl font-bold tracking-tight m-0 text-center" style={{ color: 'var(--text-primary)' }}>
                                    {deviceInfo?.name || (deviceInfo as any)?.label || 'Deep Node'} Analytics
                                </h1>

                                {/* Cloud mapping */}
                                <div className="flex flex-col gap-3 p-4 rounded-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        Cloud Mapping
                                    </p>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-semibold text-slate-500 px-1">Depth Field Source</label>
                                        <select
                                            value={fieldDepth}
                                            onChange={(e) => setFieldDepth(e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl text-sm ios-input"
                                        >
                                            {['field1', 'field2', 'field3', 'field4'].map((f) => (
                                                <option key={f} value={f}>
                                                    {f.replace('field', 'ThingSpeak Field ')}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {user?.role === "superadmin" && (
                                        <button
                                            onClick={handleSave}
                                            className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/20"
                                            style={{ background: 'linear-gradient(135deg, #3A7AFE, #2563EB)' }}
                                        >
                                            Save Mapping
                                        </button>
                                    )}
                                </div>

                                {/* Physical parameters */}
                                <div className="flex flex-col gap-3 p-4 rounded-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        Physical Parameters
                                    </p>
                                    <div className="flex flex-col gap-3">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-xs font-semibold text-slate-500 px-1">Bore Depth (m)</label>
                                            <input
                                                type="number"
                                                value={boreDepthInput}
                                                onChange={(e) => setBoreDepthInput(e.target.value)}
                                                className="w-full px-4 py-3 rounded-xl text-sm ios-input"
                                                placeholder="200"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-xs font-semibold text-slate-500 px-1">Pump Depth (m)</label>
                                            <input
                                                type="number"
                                                value={pumpDepthInput}
                                                onChange={(e) => setPumpDepthInput(e.target.value)}
                                                className="w-full px-4 py-3 rounded-xl text-sm ios-input"
                                                placeholder="180"
                                            />
                                        </div>
                                    </div>
                                </div>

                            </div>
                        )}
                    </div>

                    {/* ── Historical Analytics ──────────────────────────────────────── */}
                    {(user?.role === 'superadmin' || (deviceConfig as any)?.customer_config?.showHistoricalAnalytics !== false) && (
                        <div className="apple-glass-card rounded-[2.5rem] p-8 relative">
                            {user?.role === 'superadmin' && (deviceConfig as any)?.customer_config?.showHistoricalAnalytics === false && (
                                <span className="absolute top-8 right-8 z-20 text-[10px] font-bold bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full uppercase">Hidden from Customer</span>
                            )}
                            <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
                                <div>
                                    <h3 className="font-bold text-lg text-[var(--text-primary)]">Historical Analytics</h3>
                                    <p className="text-[var(--text-muted)] text-xs">
                                        Comprehensive depth performance tracking
                                    </p>
                                </div>
                                <div
                                    className="flex p-1 rounded-full gap-1"
                                    style={{ background: 'var(--bg-primary)', border: '1px solid var(--card-border)' }}
                                >
                                    {(['1H', '24H', '7D', '30D'] as const).map((r) => (
                                        <button
                                            key={r}
                                            onClick={() => setTimeRange(r)}
                                            className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase transition-all ${timeRange === r
                                                ? 'bg-[#3A7AFE] text-white shadow-sm'
                                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                                }`}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {historyLoading ? (
                                <div className="h-64 flex items-center justify-center text-[var(--text-muted)] text-sm gap-2">
                                    <span className="material-symbols-rounded animate-spin" style={{ fontSize: 20 }}>progress_activity</span>
                                    Loading history…
                                </div>
                            ) : depthHistory.length === 0 ? (
                                <div className="h-64 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                                    <span className="material-symbols-rounded" style={{ fontSize: 32 }}>signal_disconnected</span>
                                    <p className="text-sm font-medium">No data for this time range</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3 min-h-[300px]">

                                    {/* Single Water Column chart — full width */}
                                    <div className="flex justify-between items-center px-1">
                                        <div>
                                            <p className="text-sm font-bold text-[var(--text-primary)]">Water Column Depth</p>
                                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Height of water in bore over time</p>
                                        </div>
                                        <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: 'rgba(58,122,254,0.1)', color: '#3A7AFE' }}>Avg: {avgWaterCol}</span>
                                    </div>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={depthHistory.slice(-1000)} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="deepWaterGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3A7AFE" stopOpacity={0.25} />
                                                    <stop offset="95%" stopColor="#3A7AFE" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-color)" vertical={false} opacity={0.3} />
                                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 600 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                            <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} unit="m" width={45} />
                                            <RechartsTooltip
                                                content={(props: any) => {
                                                    const { active, payload } = props;
                                                    if (!active || !payload || payload.length === 0) return null;
                                                    const data = payload[0].payload;
                                                    return (
                                                        <div style={{
                                                            borderRadius: '14px',
                                                            background: 'var(--bg-secondary)',
                                                            border: '1px solid var(--card-border)',
                                                            padding: '12px 16px',
                                                            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                                                            backdropFilter: 'blur(10px)'
                                                        }}>
                                                            <p style={{ margin: '0 0 4px 0', fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                                {data.fullTime}
                                                            </p>
                                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                                                <span style={{ fontSize: 24, fontBlack: 900, color: 'var(--text-primary)', fontWeight: 900 }}>{parseFloat(data.waterCol || 0).toFixed(1)}</span>
                                                                <span style={{ fontSize: 13, fontWeight: 700, color: '#3A7AFE' }}>METER (Water Col)</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }}
                                                cursor={{ stroke: '#3A7AFE', strokeWidth: 1.5, strokeDasharray: '4 4', opacity: 0.5 }}
                                            />
                                            <Area type="monotone" dataKey="waterCol" stroke="#3A7AFE" strokeWidth={2.5} fill="url(#deepWaterGrad)" dot={false} activeDot={{ r: 5, fill: '#3A7AFE', strokeWidth: 0 }} />
                                        </AreaChart>
                                    </ResponsiveContainer>

                                </div>
                            )}
                        </div>
                    )}

                </div>
            </main>

            {/* Footer */}
            <footer className="text-center pb-8">
                <p className="text-[var(--text-muted)] text-xs font-medium">
                    © {new Date().getFullYear()} EvaraDeep Systems · Precision Borewell Analytics
                </p>
            </footer>

            {/* Delete Confirmation Popup */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)' }}
                    onClick={() => !isDeleting && setShowDeleteConfirm(false)}>
                    <div className="rounded-3xl p-8 flex flex-col w-full max-sm:max-w-xs max-w-sm text-center"
                        style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--card-border)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                        }}
                        onClick={e => e.stopPropagation()}>

                        <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="material-icons" style={{ fontSize: '32px' }}>delete_outline</span>
                        </div>

                        <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">Delete this Node?</h3>
                        <p className="text-sm text-[var(--text-muted)] mb-8">
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
                                className="w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-95"
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

export default EvaraDeepAnalytics;
