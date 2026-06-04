import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import TDSMeterVisual from '../components/dashboard/TDSMeterVisual';

import { useQuery } from '@tanstack/react-query';
import {
    Thermometer, Droplets,
    ChevronRight,
    Activity, Shield as ShieldIcon, Bell,
    Info, Settings, RefreshCw, Trash2, AlertTriangle
} from 'lucide-react';
import api from '../services/api';
import clsx from 'clsx';
import { useRealtimeTelemetry } from '../hooks/useRealtimeTelemetry';
import { formatOfflineMessage } from '../utils/telemetryPipeline';
import { useAuth } from '../context/AuthContext';

// Constants for Water Quality
const QUALITY_CONFIG = {
    Good: {
        color: '#10b981',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        text: 'text-emerald-500',
        icon: ShieldIcon,
        description: 'Water is safe for consumption and general use.'
    },
    Acceptable: {
        color: '#f59e0b',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        text: 'text-amber-500',
        icon: AlertTriangle,
        description: 'TDS levels are slightly elevated. Consider filtration.'
    },
    Critical: {
        color: '#ef4444',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        text: 'text-red-500',
        icon: AlertTriangle,
        description: 'High TDS levels detected. Unsafe for direct consumption.'
    }
};

const EvaraTDSAnalytics = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [chartRange, setChartRange] = useState<'24H' | '1W' | '1M' | 'RANGE'>('24H');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showNodeInfo, setShowNodeInfo] = useState(false);
    const [showParams, setShowParams] = useState(false);

    // Fetch EvaraTDS data dynamically
    const { data: device, isLoading, refetch } = useQuery({
        queryKey: ['evaratds_device_analytics', id, chartRange],
        queryFn: async () => {
            const response = await api.get(`/nodes/${id}/analytics?range=${chartRange}`);
            return response.data;
        },
        enabled: !!id,
        refetchInterval: 60000 // Slower fetch now that we have real-time
    });

    const { telemetry } = useRealtimeTelemetry(id);

    // Merge real-time telemetry with query data
    const mergedDevice = useMemo(() => {
        if (!device) return null;
        if (!telemetry) return device;
        
        // Priority: Real-time telemetry 'online' flag, then backend 'online_status'
        // If the backend says 'OfflineRecent', we treat it as isOnline=false for the boolean flag
        // but preserve the 'OfflineRecent' string for the status label.
        const backendOnline = (device as any).online_status === true;
        const telemetryOnline = (typeof (telemetry as any).online === 'boolean') ? (telemetry as any).online : true;
        
        const isOnline = telemetryOnline || backendOnline;
        
        // Determine the display status string
        let displayStatus = isOnline ? 'Online' : 'Offline';
        if (!isOnline && (device as any).status === 'OfflineRecent') {
            displayStatus = 'OfflineRecent';
        }

        return {
            ...device,
            tdsValue: telemetry.tdsValue ?? device.tdsValue,
            temperature: telemetry.temperature ?? device.temperature,
            voltage: telemetry.voltage ?? device.voltage,
            waterQualityRating: telemetry.quality ?? device.waterQualityRating,
            status: displayStatus,
            lastTimestamp: telemetry.timestamp || device.lastTimestamp
        };
    }, [device, telemetry]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await refetch();
        setIsRefreshing(false);
    };

    // Derived Offline Message
    const { offlineMessage } = useMemo(() => {
        if (!mergedDevice || mergedDevice.status === 'Online') return { offlineMessage: '' };
        const { label } = formatOfflineMessage(mergedDevice.lastTimestamp);
        return { offlineMessage: label };
    }, [mergedDevice]);

    const handleDelete = async () => {
        if (!id) return;
        setIsDeleting(true);
        try {
            await api.delete(`/admin/nodes/${id}`);
            navigate('/nodes');
        } catch (err) {
            console.error("Failed to delete node:", err);
            alert("Failed to delete node. Please try again.");
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    // Derived Data
    const quality = (mergedDevice?.waterQualityRating || 'Good') as keyof typeof QUALITY_CONFIG;
    const qualityConfig = QUALITY_CONFIG[quality] || QUALITY_CONFIG.Good;
    const deviceName = mergedDevice?.name || mergedDevice?.deviceName || mergedDevice?.device_name || mergedDevice?.label || mergedDevice?.id || 'TDS Meter';

    const { chartData: tdsHistory, chartTicks } = useMemo(() => {
        if (!device?.tdsHistory || device.tdsHistory.length === 0) return { chartData: [], chartTicks: [] };
        let filtered = [...device.tdsHistory];

        // Ensure data is sorted by timestamp (ascending)
        filtered.sort((a: any, b: any) => {
            const timeA = a.timestamp?._seconds ? a.timestamp._seconds * 1000 : new Date(a.timestamp).getTime();
            const timeB = b.timestamp?._seconds ? b.timestamp._seconds * 1000 : new Date(b.timestamp).getTime();
            return timeA - timeB;
        });

        // Create base chart data with proper formatting
        const baseChartData = filtered.map((h: any) => {
            const date = h.timestamp?._seconds
                ? new Date(h.timestamp._seconds * 1000)
                : new Date(h.timestamp);

            return {
                timestampMs: date.getTime(),
                time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                fullTime: date.toLocaleString(),
                value: h.value
            };
        });

        let chartData: any[] = [];

        if (chartRange === '24H') {
            // For 24H: Filter by 24h time window and downsample if > 2000 points
            const cutoff = Date.now() - (24 * 60 * 60 * 1000);
            let filtered24H = baseChartData.filter((d: any) => d.timestampMs >= cutoff);
            if (filtered24H.length > 2000) {
                const step = Math.ceil(filtered24H.length / 2000);
                filtered24H = filtered24H.filter((_: any, i: number) => i % step === 0);
            }
            chartData = filtered24H;
        } else if (chartRange === '1W') {
            // For 1W: Group by day and calculate daily averages
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const today = new Date();
            const result = [];

            for (let i = 6; i >= 0; i--) {
                const targetDate = new Date(today);
                targetDate.setDate(targetDate.getDate() - i);

                const dayData = baseChartData.filter(d => {
                    const ts = new Date(d.timestampMs);
                    return ts.getDate() === targetDate.getDate() && ts.getMonth() === targetDate.getMonth();
                });

                let avgValue: number | null = null;
                if (dayData.length > 0) {
                    avgValue = dayData.reduce((sum, item) => sum + (item.value || 0), 0) / dayData.length;
                }

                result.push({
                    timestampMs: targetDate.getTime(),
                    time: days[targetDate.getDay()],
                    fullTime: targetDate.toLocaleString(),
                    value: avgValue ?? 0
                });
            }
            chartData = result;
        } else if (chartRange === '1M') {
            // For 1M: Group by week and calculate weekly averages
            const result = [];
            const today = new Date();

            for (let i = 3; i >= 0; i--) {
                const targetDate = new Date(today);
                targetDate.setDate(targetDate.getDate() - (i * 7));

                const weekData = baseChartData.filter(d => {
                    const ts = new Date(d.timestampMs);
                    const diffTime = targetDate.getTime() - ts.getTime();
                    const diffDays = diffTime / (1000 * 60 * 60 * 24);
                    return diffDays >= 0 && diffDays < 7;
                });

                let avgValue: number | null = null;
                if (weekData.length > 0) {
                    avgValue = weekData.reduce((sum, item) => sum + (item.value || 0), 0) / weekData.length;
                }

                result.push({
                    timestampMs: targetDate.getTime(),
                    time: `Week ${4 - i}`,
                    fullTime: targetDate.toLocaleString(),
                    value: avgValue ?? 0
                });
            }
            chartData = result;
        } else if (chartRange === 'RANGE') {
            // For RANGE: Use all data (can add custom date range filtering later)
            chartData = baseChartData;
        }

        let chartTicks: any[] | undefined = undefined;
        if (chartRange === '24H') {
            chartTicks = [];
            const now = Date.now();
            const start = now - (24 * 60 * 60 * 1000);
            const interval = 2 * 60 * 60 * 1000; // 2 hours
            const offset = new Date().getTimezoneOffset() * 60000;
            const snap = Math.ceil((start - offset) / interval) * interval + offset;
            for (let t = snap; t <= now; t += interval) {
                chartTicks.push(t);
            }
        } else if (chartRange === 'RANGE') {
            chartTicks = undefined;
        } else {
            chartTicks = chartData.map((d: any) => d.time);
        }

        return { chartData, chartTicks };
    }, [device?.tdsHistory, chartRange]);

    const isOffline = !device;
    if (!id) return <Navigate to="/nodes" replace />;

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-transparent">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <Activity className="text-blue-500 animate-ping absolute opacity-75" size={48} />
                        <Activity className="text-blue-600 relative z-10" size={48} />
                    </div>
                    <div className="text-blue-500 font-bold tracking-widest text-sm uppercase">Loading Device Profile</div>
                </div>
            </div>
        );
    }

    if (isOffline) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-transparent">
                <div className="p-10 rounded-[2rem] w-full max-w-sm text-center shadow-2xl relative overflow-hidden"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--card-border)' }}>
                    <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Droplets className="text-red-500" size={40} />
                    </div>
                    <h2 className="text-2xl font-black mb-3" style={{ color: 'var(--text-primary)' }}>Device Offline</h2>
                    <p className="mb-8 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        This EvaraTDS unit is currently unresponsive or could not be found in our network.
                    </p>
                    <button
                        onClick={() => navigate('/nodes')}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold transition-all active:scale-95"
                    >
                        Back to Stations
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen font-sans relative overflow-x-hidden bg-transparent"
            style={{ color: 'var(--text-primary)' }}>

            <main className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8" style={{ zIndex: 1 }}>
                <div className="max-w-[1400px] mx-auto flex flex-col gap-4">

                    {/* Breadcrumb + Page Heading row */}
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-2">
                        <div className="flex flex-col gap-2">
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
                            <h2 className="text-[20px] font-bold tracking-tight mt-1.5" style={{ color: 'var(--text-primary)' }}>{deviceName} Analytics</h2>
                            {device?.location_name && (
                                <p className="text-xs text-slate-400 m-0 mt-1">
                                    {device.location_name}
                                </p>
                            )}
                            {mergedDevice?.status !== 'Online' && offlineMessage && (
                                <p className="text-xs font-bold text-red-500 m-0">
                                    {offlineMessage}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap pb-1 md:self-end lg:self-auto">
                            {/* Status Button (Pill Style) */}
                            <div className={clsx(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest transition-all duration-200 shadow-sm border",
                                (mergedDevice.status === 'Online')
                                    ? "bg-[#ecfdf5] dark:bg-emerald-500/10 text-[#059669] dark:text-emerald-400 border-[#10b981]/50 dark:border-emerald-500/40"
                                    : (mergedDevice.status === 'OfflineRecent')
                                        ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/40"
                                        : "bg-[#fff1f2] dark:bg-red-500/10 text-[#e11d48] dark:text-red-400 border-[#fb7185]/50 dark:border-red-500/40"
                            )}>
                                <div className={clsx(
                                    "w-1.5 h-1.5 rounded-full animate-pulse",
                                    (mergedDevice.status === 'Online') ? "bg-[#10b981]" : (mergedDevice.status === 'OfflineRecent') ? "bg-amber-500" : "bg-[#e11d48]"
                                )} />
                                {mergedDevice.status || 'Offline'}
                            </div>

                            {/* Node Info Button */}
                            <button
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                className={clsx(
                                    "flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95",
                                    isRefreshing ? "bg-gray-100 dark:bg-white/10 text-gray-400 cursor-not-allowed border-none" : "bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] border border-[#1e40af]/30 dark:bg-transparent dark:text-[#3B82F6] dark:border dark:border-[#3B82F6] dark:hover:bg-[#3B82F6]/10"
                                )}
                            >
                                <span className={clsx('material-icons', isRefreshing && 'animate-spin')} style={{ fontSize: '14px' }}>
                                    {isRefreshing ? 'sync' : 'refresh'}
                                </span>
                                {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
                            </button>

                            <button onClick={() => setShowNodeInfo(true)} className="flex items-center gap-2 px-4 py-1.5 bg-[#f3e8ff] hover:bg-[#e9d5ff] text-[#6b21a8] border border-[#6b21a8]/30 dark:bg-transparent dark:text-[#AF52DE] dark:border dark:border-[#AF52DE] dark:hover:bg-[#AF52DE]/10 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95">
                                <span className="material-icons" style={{ fontSize: '14px' }}>info</span> Node Info
                            </button>

                            <button onClick={() => setShowParams(true)} className="flex items-center gap-2 px-4 py-1.5 bg-[#fef3c7] hover:bg-[#fde68a] text-[#92400e] border border-[#92400e]/30 dark:bg-transparent dark:text-[#FFB340] dark:border dark:border-[#FFB340] dark:hover:bg-[#FFB340]/10 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95">
                                <span className="material-icons" style={{ fontSize: '14px' }}>settings</span> Parameters
                            </button>

                            {/* Delete Button */}
                            {user?.role === 'superadmin' && (
                                <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-1.5 bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b] border border-[#991b1b]/30 dark:bg-transparent dark:text-[#FF3B30] dark:border dark:border-[#FF3B30] dark:hover:bg-[#FF3B30]/10 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95">
                                    <span className="material-icons" style={{ fontSize: '14px' }}>delete_forever</span> Delete Node
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── Main Layout ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2.8fr)] gap-4 items-stretch">

                        {/* Left: Device Visual Card */}
                        <div className="rounded-[2.5rem] p-3 flex flex-col relative overflow-hidden h-full" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
                            <div className="flex justify-between items-center mb-2 z-10 w-full px-2 mt-2">
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
                            <div className="flex-1 flex items-center justify-center py-2">
                                <TDSMeterVisual tdsValue={mergedDevice.tdsValue || 0} quality={quality as any} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/10">
                                    <p style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(16 185 129 / 0.8)', margin: '0 0 4px 0' }}>Water Quality</p>
                                    <p style={{ fontSize: '18px', fontWeight: 900, color: '#10b981', margin: 0 }}>{quality.toUpperCase()}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/10">
                                    <p style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgb(249 115 22 / 0.8)', margin: '0 0 4px 0' }}>Temperature</p>
                                    <p style={{ fontSize: '18px', fontWeight: 900, color: '#f97316', margin: 0 }}>{mergedDevice.temperature || 0}°C</p>
                                </div>
                            </div>
                        </div>

                        {/* Right: Stats Grid + Chart */}
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-4 gap-4">
                                <MiniStatCard title="TDS Monitor" value={mergedDevice.tdsValue || 0} unit="ppm" icon={Droplets} accentColor="#3b82f6" iconBg="rgba(59,130,246,0.1)" />
                                <MiniStatCard title="Temperature" value={mergedDevice.temperature || 0} unit="°C" icon={Thermometer} accentColor="#f97316" iconBg="rgba(249,115,22,0.1)" />
                                <MiniStatCard title="Voltage" value={mergedDevice.voltage || 0} unit="V" icon={Activity} accentColor="#8b5cf6" iconBg="rgba(139,92,246,0.1)" />
                                <MiniStatCard title="Purity Index" value={quality.toUpperCase()} icon={qualityConfig.icon} accentColor={qualityConfig.color} iconBg={`${qualityConfig.color}1a`} />
                            </div>

                            {/* Chart Card */}
                            <div className="apple-glass-card flex flex-col items-stretch justify-between relative overflow-hidden flex-grow" style={{
                                background: "var(--card-bg)",
                                backdropFilter: "var(--card-blur)",
                                WebkitBackdropFilter: "var(--card-blur)",
                                borderRadius: '2.5rem',
                                border: '1px solid var(--card-border)',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
                                padding: '24px',
                                minHeight: '350px'
                            }}>
                                <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
                                    <h2 className="text-[20px] font-bold text-[var(--text-primary)] tracking-tight m-0 leading-tight">TDS LEVEL TRENDS</h2>

                                    <div className="flex p-1 rounded-full border relative overflow-hidden shrink-0 shadow-inner" style={{ background: 'var(--bg-primary)', borderColor: 'var(--card-border)' }}>
                                        {(['24H', '1W', '1M', 'RANGE'] as const).map((r) => {
                                            const active = chartRange === r;
                                            return (
                                                <button
                                                    key={r}
                                                    onClick={() => setChartRange(r)}
                                                    className={`relative z-10 px-4 py-1.5 text-[10px] font-extrabold tracking-widest uppercase rounded-full cursor-pointer transition-all duration-300 ${active ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                                                    style={{
                                                        border: 'none',
                                                        background: active ? '#004F94' : 'transparent',
                                                        boxShadow: active ? '0 4px 12px rgba(0, 79, 148, 0.25)' : 'none'
                                                    }}
                                                >
                                                    {r}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex-1">
                                    {tdsHistory.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={tdsHistory}>
                                                <defs>
                                                    <linearGradient id="tdsGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid-color)" />
                                                <XAxis 
                                                    dataKey={chartRange === '24H' || chartRange === 'RANGE' ? "timestampMs" : "time"} 
                                                    type={chartRange === '24H' || chartRange === 'RANGE' ? "number" : "category"} 
                                                    scale={chartRange === '24H' || chartRange === 'RANGE' ? "time" : "auto"} 
                                                    domain={chartRange === '24H' ? [Date.now() - 24 * 60 * 60 * 1000, Date.now()] : chartRange === 'RANGE' ? ['dataMin', 'dataMax'] : undefined} 
                                                    ticks={chartTicks} 
                                                    tickFormatter={chartRange === '24H' || chartRange === 'RANGE' ? (tick) => new Date(tick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined} 
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                    tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 500 }} 
                                                    dy={10} 
                                                />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 600 }} />
                                                <Tooltip content={<PremiumTooltip />} cursor={{ stroke: '#3b82f6', strokeWidth: 1.5, strokeDasharray: '4 4', opacity: 0.5 }} />
                                                <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#tdsGradient)" animationDuration={1500} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center gap-3 opacity-30">
                                            <Droplets size={40} style={{ color: 'var(--text-muted)' }} />
                                            <p className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>No history available</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <DeleteConfirmModal show={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} onConfirm={handleDelete} isDeleting={isDeleting} deviceName={deviceName} />
            <NodeInfoModal show={showNodeInfo} onClose={() => setShowNodeInfo(false)} device={mergedDevice} deviceName={deviceName} id={id} />
            <ParamsModal show={showParams} onClose={() => setShowParams(false)} device={mergedDevice} quality={quality} />
        </div>
    );
};

// ─── Modals ───────────────────────────────────────────────────────────────────

const DeleteConfirmModal = ({ show, onClose, onConfirm, isDeleting, deviceName }: any) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose}>
            <div className="rounded-[32px] p-8 w-full max-w-sm text-center relative overflow-hidden bg-white shadow-2xl cursor-pointer" onClick={e => e.stopPropagation()}>
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={32} />
                </div>
                <h3 className="text-xl font-bold mb-2 text-gray-900">Delete this Node?</h3>
                <p className="text-sm text-gray-500 mb-8">Permanently remove <strong>{deviceName}</strong> and all its telemetry. This cannot be undone.</p>
                <div className="flex flex-col gap-3">
                    <button onClick={onConfirm} disabled={isDeleting} className={clsx("w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all", isDeleting ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700 text-white shadow-lg")}>{isDeleting ? 'Deleting...' : 'Yes, Delete Node'}</button>
                    <button onClick={onClose} disabled={isDeleting} className="w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-50">Cancel</button>
                </div>
            </div>
        </div>
    );
};

const NodeInfoModal = ({ show, onClose, device, deviceName, id }: any) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
            <div className="rounded-2xl p-6 flex flex-col w-full max-w-2xl shadow-2xl" style={{ background: '#ffffff', border: '1px solid #e5e7eb' }} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-[17px] font-bold" style={{ color: '#111827' }}>Node Information</h3>
                    <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-full border-none cursor-pointer shadow-md" style={{ background: '#f3f4f6', color: '#374151' }}>&times;</button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    {[
                        { label: 'Device Name', val: deviceName },
                        { label: 'Hardware ID', val: id },
                        { label: 'Device Type', val: 'TDS Water Quality Monitor' },
                        { label: 'Location', val: device?.location_name || 'Not specified' },
                        { label: 'Subscription', val: 'PRO' },
                        { label: 'Assigned To', val: device?.customer_name || 'Unassigned' }
                    ].map((item, idx) => (
                        <div key={idx} className="rounded-xl p-4 shadow-sm" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#6b7280' }}>{item.label}</p>
                            <p className="text-sm font-bold mt-1" style={{ color: '#111827' }}>{item.val}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-6 flex gap-3">
                    <button className="flex-1 font-semibold py-3 rounded-2xl text-white text-sm hover:scale-[1.02] transition-transform cursor-pointer" style={{ background: '#3A7AFE', border: 'none' }} onClick={() => { navigator.clipboard.writeText(`Hardware ID: ${id}`); alert('ID copied!'); }}>Copy ID</button>
                    <button onClick={onClose} className="flex-1 font-semibold py-3 rounded-2xl text-white text-sm hover:scale-[1.02] transition-transform cursor-pointer" style={{ background: '#9ca3af', border: 'none' }}>Close</button>
                </div>
            </div>
        </div>
    );
};

const ParamsModal = ({ show, onClose, device, quality }: any) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
            <div className="rounded-2xl p-6 flex flex-col w-full max-w-2xl shadow-2xl" style={{ background: '#ffffff', border: '1px solid #e5e7eb' }} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-[17px] font-bold" style={{ color: '#111827' }}>Device Parameters</h3>
                    <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-full shadow-md" style={{ background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer' }}>&times;</button>
                </div>
                <div className="grid grid-cols-1 gap-4 mb-6">
                    {[
                        { label: 'TDS Value', val: `${device?.tdsValue || 'N/A'} ppm` },
                        { label: 'Water Quality', val: quality.toUpperCase() },
                        { label: 'Temperature', val: `${device?.temperature || 'N/A'} °C` }
                    ].map((item, idx) => (
                        <div key={idx} className="rounded-xl p-4" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>{item.label}</p>
                            <p className="text-lg font-bold" style={{ color: '#111827' }}>{item.val}</p>
                        </div>
                    ))}
                </div>
                <button onClick={onClose} className="w-full font-semibold py-3 rounded-2xl text-white text-sm" style={{ background: '#6b7280', border: 'none', cursor: 'pointer' }}>Close</button>
            </div>
        </div>
    );
};

// ─── UI Atomic Components ────────────────────────────────────────────────────

const MiniStatCard = ({ title, value, unit, icon: Icon, accentColor, iconBg }: any) => (
    <div className="apple-glass-card text-left rounded-2xl p-5 flex flex-col justify-between w-full min-h-[160px] max-h-[45vh] transition-all duration-300"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', position: 'relative' }}>
        
        {/* Top Row: Icons */}
        <div className="flex justify-between items-center w-full">
            <div className="flex items-center justify-center rounded-xl w-8 h-8" style={{ background: iconBg }}>
                <Icon size={18} style={{ color: accentColor }} />
            </div>
            <button className="bg-transparent border-none p-1 cursor-pointer transition-colors hover:bg-black/5 rounded-full flex items-center justify-center">
                <Info size={14} color="#1C1C1E" />
            </button>
        </div>

        {/* Bottom Row: Text */}
        <div className="flex flex-col mt-auto pt-1 gap-0.5">
            <p style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', margin: 0 }}>{title}</p>
            <div className="flex items-baseline gap-1.5">
                <span className="text-[20px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: accentColor }}>{value}</span>
                {unit && <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{unit}</span>}
            </div>
        </div>
    </div>
);

const PremiumTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const date = new Date(payload[0].payload.timestampMs);
        const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        
        return (
            <div className="rounded-2xl px-5 py-3 shadow-2xl" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--card-border)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-gray-500 dark:text-gray-400">{dateStr} &nbsp; {timeStr}</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-[26px] font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>{payload[0].value}</span>
                    <span className="text-[13px] font-bold text-blue-500">PPM</span>
                </div>
            </div>
        );
    }
    return null;
};

export default EvaraTDSAnalytics;
