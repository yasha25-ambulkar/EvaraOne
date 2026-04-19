import { useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import TDSMeterVisual from '../components/dashboard/TDSMeterVisual';

import { useQuery } from '@tanstack/react-query';
import {
    Thermometer, Droplets,
    ChevronRight, AlertTriangle,
    Activity, Shield as ShieldIcon, Bell,
    Info, Settings, RefreshCw, Trash2
} from 'lucide-react';
import api from '../services/api';
import clsx from 'clsx';

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
    const [chartRange, setChartRange] = useState<'24H' | '1W' | '1M' | 'RANGE'>('24H');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Fetch EvaraTDS data dynamically
    const { data: device, isLoading, isError, refetch } = useQuery({
        queryKey: ['evaratds_device_analytics', id, chartRange],
        queryFn: async () => {
            const response = await api.get(`/nodes/${id}/analytics?range=${chartRange}`);
            return response.data;
        },
        enabled: !!id,
        refetchInterval: 30000
    });

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await refetch();
        setIsRefreshing(false);
    };

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
    const quality = (device?.waterQualityRating || 'Good') as keyof typeof QUALITY_CONFIG;
    const qualityConfig = QUALITY_CONFIG[quality] || QUALITY_CONFIG.Good;
    const deviceName = device?.name || device?.deviceName || device?.device_name || device?.label || device?.id || 'TDS Meter';

    const tdsHistory = useMemo(() => {
        if (!device?.tdsHistory) return [];
        return (device.tdsHistory || []).map((h: any) => {
            const date = h.timestamp?._seconds
                ? new Date(h.timestamp._seconds * 1000)
                : new Date(h.timestamp);
            return {
                time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                fullTime: date.toLocaleString(),
                value: h.value
            };
        });
    }, [device?.tdsHistory]);

    const isOffline = !device; // simplistic — replace with real online-status logic if available

    if (!id) return <Navigate to="/nodes" replace />;

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-transparent">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 rounded-full border-4 border-solid animate-spin"
                        style={{ borderColor: 'rgba(10,132,255,0.2)', borderTopColor: '#0A84FF' }} />
                    <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Loading analytics...</p>
                </div>
            </div>
        );
    }

    if (isError || !device) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-transparent p-6">
                <div className="apple-glass-card p-10 rounded-[40px] text-center max-w-md">
                    <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                        <AlertTriangle className="text-red-500" size={32} />
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

                    {/* ── Row 0: Breadcrumb + Heading + Action Buttons ── */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">

                        {/* Left: breadcrumb + title */}
                        <div className="flex flex-col gap-2">
                            <nav className="flex items-center gap-1 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                                <button onClick={() => navigate('/')}
                                    className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0">
                                    Home
                                </button>
                                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                                <button onClick={() => navigate('/nodes')}
                                    className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0 font-normal"
                                    style={{ color: 'var(--text-muted)' }}>
                                    All Nodes
                                </button>
                                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                                <span className="font-bold" style={{ color: 'var(--text-primary)', fontWeight: '700' }}>
                                    {deviceName}
                                </span>
                            </nav>

                            <h2 style={{ fontSize: '22px', fontWeight: '700', marginTop: '6px', color: 'var(--text-primary)' }}>
                                {deviceName} Analytics
                            </h2>
                        </div>

                        {/* Right: action-button pills */}
                        <div className="flex items-center gap-2 flex-wrap pb-1">

                            {/* Offline / Online pill */}
                            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-sm border-none text-white ${isOffline ? 'bg-[#FF3B30]' : 'bg-[#34C759]'}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                {isOffline ? 'Offline' : 'Online'}
                            </div>

                            {/* Refresh */}
                            <button
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95 border-none ${isRefreshing ? 'bg-gray-100 dark:bg-white/10 text-gray-400 cursor-not-allowed' : 'bg-[#0077ff] hover:bg-[#0062d6] text-white'}`}
                            >
                                <RefreshCw size={12} className={clsx('stroke-[2.5px]', isRefreshing && 'animate-spin')} />
                                {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
                            </button>

                            {/* Node Info */}
                            <button
                                className="flex items-center gap-2 px-4 py-1.5 bg-[#AF52DE] hover:bg-[#9d44ce] text-white border-none rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                            >
                                <Info size={12} className="stroke-[2.5px]" />
                                Node Info
                            </button>

                            {/* Parameters */}
                            <button
                                className="flex items-center gap-2 px-4 py-1.5 bg-[#FFB340] hover:bg-[#f5a623] text-amber-900 border-none rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                            >
                                <Settings size={12} className="stroke-[2.5px]" />
                                Parameters
                            </button>

                            {/* Delete */}
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="flex items-center gap-2 px-4 py-1.5 bg-[#FF3B30] hover:bg-[#e0352b] text-white border-none rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                            >
                                <Trash2 size={12} className="stroke-[2.5px]" />
                                Delete Node
                            </button>
                        </div>
                    </div>

                    {/* Delete confirm modal */}
                    {showDeleteConfirm && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                            style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                            onClick={() => setShowDeleteConfirm(false)}>
                            <div className="rounded-2xl p-6 w-full max-w-sm"
                                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--card-border)', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}
                                onClick={e => e.stopPropagation()}>
                                <h3 className="text-[17px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Delete Node?</h3>
                                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                                    This action cannot be undone. The device and all its data will be permanently removed.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleDelete}
                                        disabled={isDeleting}
                                        className="flex-1 py-3 rounded-2xl text-sm font-bold bg-[#FF3B30] text-white border-none cursor-pointer disabled:opacity-50"
                                    >
                                        {isDeleting ? 'Deleting...' : 'Delete'}
                                    </button>
                                    <button
                                        onClick={() => setShowDeleteConfirm(false)}
                                        className="flex-1 py-3 rounded-2xl text-sm font-bold border-none cursor-pointer"
                                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Main Layout: Device Card (left ~30%) + [Stat Cards + Chart] (right ~70%) ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2.8fr)] gap-4 items-stretch">

                        {/* Device / Probe Card */}
                        <div className="rounded-2xl p-5 flex flex-col gap-4"
                            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>

                            {/* Card header */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{deviceName}</span>
                                <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 rounded-full border border-blue-500/10">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Live</span>
                                </div>
                            </div>

                            {/* Meter visual */}
                            <div className="flex-1 flex items-center justify-center py-2">
                                <TDSMeterVisual
                                    tdsValue={device.tdsValue || 0}
                                    quality={quality as 'Good' | 'Acceptable' | 'Critical'}
                                />
                            </div>

                            {/* Bottom identity panels */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/10">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/80 mb-1">Water Quality</p>
                                    <p className="text-lg font-black text-emerald-500">{quality.toUpperCase()}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/10">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-500/80 mb-1">Temperature</p>
                                    <p className="text-lg font-black text-orange-500">{device.temperature || 0}°C</p>
                                </div>
                            </div>
                        </div>

                        {/* Right column: stat cards + chart stacked */}
                        <div className="flex flex-col gap-4">

                            {/* 4 Stat Cards: 1×4 row */}
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                                <MiniStatCard
                                    title="TDS Monitor"
                                    label="TDS Value"
                                    value={device.tdsValue || 0}
                                    unit="ppm"
                                    icon={Droplets}
                                    accentColor="#3b82f6"
                                    iconBg="rgba(59,130,246,0.1)"
                                />
                                <MiniStatCard
                                    title="Thermal Sense"
                                    label="Temperature"
                                    value={device.temperature || 0}
                                    unit="°C"
                                    icon={Thermometer}
                                    accentColor="#f97316"
                                    iconBg="rgba(249,115,22,0.1)"
                                />
                                <MiniStatCard
                                    title="Purity Index"
                                    label="Quality"
                                    value={quality}
                                    icon={qualityConfig.icon}
                                    accentColor={qualityConfig.color}
                                    iconBg={`${qualityConfig.color}1a`}
                                />
                                <MiniStatCard
                                    title="Notifications"
                                    label="Active Alerts"
                                    value={device.alertsCount || 0}
                                    icon={Bell}
                                    accentColor="#ef4444"
                                    iconBg="rgba(239,68,68,0.1)"
                                />
                            </div>

                            {/* Chart Card — fills remaining height of right column */}
                            <div className="flex-1 rounded-2xl p-6 flex flex-col"
                                style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                                    <div>
                                        <h3 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                            <Activity size={18} className="text-blue-500" />
                                            TDS Level Trends
                                        </h3>
                                        <p className="text-[11px] font-bold uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                            24-Hour Dissolved Solids Analysis
                                        </p>
                                    </div>
                                    <div className="flex p-1 rounded-xl border gap-0.5"
                                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--card-border)' }}>
                                        {(['24H', '1W', '1M', 'RANGE'] as const).map(range => (
                                            <button
                                                key={range}
                                                onClick={() => setChartRange(range)}
                                                className={clsx(
                                                    'px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all',
                                                    chartRange === range
                                                        ? 'bg-[#0077ff] text-white shadow'
                                                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                                )}
                                            >
                                                {range}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex-1 min-h-[200px]">
                                    {tdsHistory.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={tdsHistory}>
                                                <defs>
                                                    <linearGradient id="tdsGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="rgba(0,0,0,0.04)" />
                                                <XAxis dataKey="time" axisLine={false} tickLine={false}
                                                    tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }} dy={10} />
                                                <YAxis axisLine={false} tickLine={false}
                                                    tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }} />
                                                <Tooltip content={<PremiumTooltip />} />
                                                <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3}
                                                    fillOpacity={1} fill="url(#tdsGradient)" animationDuration={1500} strokeLinecap="round" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center gap-3 opacity-30">
                                            <Droplets size={40} style={{ color: 'var(--text-muted)' }} />
                                            <p className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                                No history data available
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>



                </div>
            </main>
        </div>
    );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const MiniStatCard = ({ title, label, value, unit, icon: Icon, accentColor, iconBg }: any) => (
    <div className="rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden group hover:scale-[1.015] transition-all duration-300"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>

        {/* Header: title + icon */}
        <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
                {title}
            </span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: iconBg }}>
                <Icon size={16} style={{ color: accentColor }} />
            </div>
        </div>

        {/* Value */}
        <div>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                {label}
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-black" style={{ color: accentColor }}>
                    {value}
                </span>
                {unit && (
                    <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>{unit}</span>
                )}
            </div>
        </div>

        {/* Decorative bg icon */}
        <div className="absolute -bottom-4 -right-4 opacity-[0.04] transition-transform group-hover:scale-110"
            style={{ color: accentColor }}>
            <Icon size={64} />
        </div>
    </div>
);



const PremiumTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="rounded-2xl px-5 py-3 shadow-2xl"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--card-border)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                    {payload[0].payload.fullTime}
                </p>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{payload[0].value}</span>
                    <span className="text-xs font-bold text-blue-500">PPM</span>
                </div>
            </div>
        );
    }
    return null;
};

export default EvaraTDSAnalytics;
