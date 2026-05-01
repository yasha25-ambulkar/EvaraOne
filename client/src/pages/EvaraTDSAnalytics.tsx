import { useState, useMemo } from 'react';
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

    const { chartData: tdsHistory, chartTicks } = useMemo(() => {
        if (!device?.tdsHistory || device.tdsHistory.length === 0) return { chartData: [], chartTicks: [] };
        let filtered = [...device.tdsHistory];

        // Ensure data is sorted by timestamp (ascending)
        filtered.sort((a: any, b: any) => {
            const timeA = a.timestamp?._seconds ? a.timestamp._seconds * 1000 : new Date(a.timestamp).getTime();
            const timeB = b.timestamp?._seconds ? b.timestamp._seconds * 1000 : new Date(b.timestamp).getTime();
            return timeA - timeB;
        });

        if (chartRange === '24H') {
            filtered = filtered.slice(-30);
        }
        
        const chartData = filtered.map((h: any) => {
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

        const chartTicks: number[] = chartData.map((d: any) => d.timestampMs);
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

                    {/* ── Heading + Actions ── */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
                        <div className="flex flex-col gap-2">
                            <nav className="flex items-center gap-1 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                                <button onClick={() => navigate('/')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0">Home</button>
                                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                                <button onClick={() => navigate('/nodes')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0 font-normal" style={{ color: 'var(--text-muted)' }}>All Nodes</button>
                                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                                <span className="font-bold" style={{ color: 'var(--text-primary)', fontWeight: '700' }}>{deviceName}</span>
                            </nav>
                            <h2 className="text-[20px] font-bold tracking-tight mt-1.5" style={{ color: 'var(--text-primary)' }}>{deviceName} Analytics</h2>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap pb-1">
                            <div className="flex items-center gap-2 px-4 py-1.5 bg-[#ecfdf5] dark:bg-emerald-500/10 text-[#059669] dark:text-emerald-400 border border-[#10b981]/50 dark:border-emerald-500/40 rounded-full text-[10px] font-extrabold uppercase tracking-widest transition-all duration-200 shadow-sm">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                                Online
                            </div>
                            <button onClick={handleRefresh} disabled={isRefreshing} className={clsx("flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest transition-all duration-200 shadow-sm active:scale-95", isRefreshing ? "bg-gray-100 dark:bg-white/10 text-gray-400 cursor-not-allowed border-none" : "bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] border border-[#1e40af]/30 dark:bg-transparent dark:text-[#3B82F6] dark:border dark:border-[#3B82F6] dark:hover:bg-[#3B82F6]/10")}>
                                <RefreshCw size={12} className={clsx('stroke-[2.5px]', isRefreshing && 'animate-spin')} />
                                {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
                            </button>
                            <button onClick={() => setShowNodeInfo(true)} className="flex items-center gap-2 px-4 py-1.5 bg-[#f3e8ff] hover:bg-[#e9d5ff] text-[#6b21a8] border border-[#6b21a8]/30 dark:bg-transparent dark:text-[#AF52DE] dark:border dark:border-[#AF52DE] dark:hover:bg-[#AF52DE]/10 rounded-full text-[10px] font-extrabold uppercase tracking-widest transition-all duration-200 shadow-sm active:scale-95">
                                <Info size={12} className="stroke-[2.5px]" /> Node Info
                            </button>
                            <button onClick={() => setShowParams(true)} className="flex items-center gap-2 px-4 py-1.5 bg-[#fef3c7] hover:bg-[#fde68a] text-[#92400e] border border-[#92400e]/30 dark:bg-transparent dark:text-[#FFB340] dark:border dark:border-[#FFB340] dark:hover:bg-[#FFB340]/10 rounded-full text-[10px] font-extrabold uppercase tracking-widest transition-all duration-200 shadow-sm active:scale-95">
                                <Settings size={12} className="stroke-[2.5px]" /> Parameters
                            </button>
                            <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-1.5 bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b] border border-[#991b1b]/30 dark:bg-transparent dark:text-[#FF3B30] dark:border dark:border-[#FF3B30] dark:hover:bg-[#FF3B30]/10 rounded-full text-[10px] font-extrabold uppercase tracking-widest transition-all duration-200 shadow-sm active:scale-95">
                                <Trash2 size={12} className="stroke-[2.5px]" /> Delete Node
                            </button>
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
                                <TDSMeterVisual tdsValue={device.tdsValue || 0} quality={quality as any} />
                            </div>
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

                        {/* Right: Stats Grid + Chart */}
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                                <MiniStatCard title="TDS Monitor" value={device.tdsValue || 0} unit="ppm" icon={Droplets} accentColor="#3b82f6" iconBg="rgba(59,130,246,0.1)" />
                                <MiniStatCard title="Thermal Sense" value={device.temperature || 0} unit="°C" icon={Thermometer} accentColor="#f97316" iconBg="rgba(249,115,22,0.1)" />
                                <MiniStatCard title="Purity Index" value={quality.toUpperCase()} icon={qualityConfig.icon} accentColor={qualityConfig.color} iconBg={`${qualityConfig.color}1a`} />
                                <MiniStatCard title="Notifications" value={device.alertsCount || 0} icon={Bell} accentColor="#ef4444" iconBg="rgba(239,68,68,0.1)" />
                            </div>

                            {/* Chart Card */}
                            <div className="flex-1 rounded-2xl p-6 flex flex-col" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                                    <div>
                                        <h3 className="text-[20px] font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                            <Activity size={18} className="text-blue-500" /> TDS Level Trends
                                        </h3>
                                        <p className="text-[10px] font-black uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-muted)' }}>24-Hour Dissolved Solids Analysis</p>
                                    </div>
                                    <div className="flex p-1 rounded-xl border gap-0.5" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--card-border)' }}>
                                        {(['24H', '1W', '1M', 'RANGE'] as const).map(range => (
                                            <button key={range} onClick={() => setChartRange(range)} className={clsx('px-4 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-widest transition-all', chartRange === range ? 'bg-[#0077ff] text-white shadow' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]')}>{range}</button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex-1 min-h-[400px]">
                                    {tdsHistory.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={450}>
                                            <AreaChart data={tdsHistory}>
                                                <defs>
                                                    <linearGradient id="tdsGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="rgba(0,0,0,0.04)" />
                                                <XAxis dataKey="timestampMs" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={chartTicks} tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} dy={10} />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                                                <Tooltip content={<PremiumTooltip />} cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }} />
                                                <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#tdsGradient)" animationDuration={1500} />
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
            <NodeInfoModal show={showNodeInfo} onClose={() => setShowNodeInfo(false)} device={device} deviceName={deviceName} id={id} />
            <ParamsModal show={showParams} onClose={() => setShowParams(false)} device={device} quality={quality} />
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
            <div className="rounded-2xl p-6 flex flex-col w-full max-w-2xl bg-[#ffffff] dark:bg-[#1a1c1e] border border-[var(--card-border)] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-[17px] font-bold" style={{ color: "var(--text-primary)" }}>Node Information</h3>
                    <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 text-[var(--text-secondary)] border-none cursor-pointer shadow-md">&times;</button>
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
                        <div key={idx} className="rounded-xl p-4 bg-[var(--card-bg)] border border-[var(--card-border)] shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{item.label}</p>
                            <p className="text-sm font-bold mt-1 text-[var(--text-primary)]">{item.val}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-6 flex gap-3">
                    <button className="flex-1 font-semibold py-3 rounded-2xl text-white bg-[#3A7AFE] text-sm hover:scale-[1.02] transition-transform cursor-pointer" onClick={() => { navigator.clipboard.writeText(`Hardware ID: ${id}`); alert('ID copied!'); }}>Copy ID</button>
                    <button onClick={onClose} className="flex-1 font-semibold py-3 rounded-2xl text-white bg-gray-400 text-sm hover:scale-[1.02] transition-transform cursor-pointer">Close</button>
                </div>
            </div>
        </div>
    );
};

const ParamsModal = ({ show, onClose, device, quality }: any) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
            <div className="rounded-2xl p-6 flex flex-col w-full max-w-2xl bg-[#ffffff] dark:bg-[#1a1c1e] border border-[var(--card-border)] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-[17px] font-bold" style={{ color: "var(--text-primary)" }}>Device Parameters</h3>
                    <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 text-[var(--text-secondary)] shadow-md">&times;</button>
                </div>
                <div className="grid grid-cols-1 gap-4 mb-6">
                    {[
                        { label: 'TDS Value', val: `${device?.tdsValue || 'N/A'} ppm` },
                        { label: 'Water Quality', val: quality.toUpperCase() },
                        { label: 'Temperature', val: `${device?.temperature || 'N/A'} °C` }
                    ].map((item, idx) => (
                        <div key={idx} className="rounded-xl p-4 bg-[var(--card-bg)] border border-[var(--card-border)]">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">{item.label}</p>
                            <p className="text-lg font-bold text-[var(--text-primary)]">{item.val}</p>
                        </div>
                    ))}
                </div>
                <button onClick={onClose} className="w-full font-semibold py-3 rounded-2xl text-white bg-gray-400 text-sm">Close</button>
            </div>
        </div>
    );
};

// ─── UI Atomic Components ────────────────────────────────────────────────────

const MiniStatCard = ({ title, value, unit, icon: Icon, accentColor, iconBg }: any) => (
    <div className="rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden group hover:scale-[1.015] transition-all duration-300"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center justify-between">
            <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)' }}>{title}</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: iconBg }}><Icon size={16} style={{ color: accentColor }} /></div>
        </div>
        <div className="mt-auto">
            <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[26px] font-black tracking-tight" style={{ color: accentColor }}>{value}</span>
                {unit && <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)' }}>{unit}</span>}
            </div>
        </div>
        <div className="absolute -bottom-4 -right-4 opacity-[0.04] transition-transform group-hover:scale-110" style={{ color: accentColor }}><Icon size={64} /></div>
    </div>
);

const PremiumTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="rounded-2xl px-5 py-3 shadow-2xl" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--card-border)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-gray-500 dark:text-gray-400">{payload[0].payload.fullTime}</p>
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
