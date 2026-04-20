import { useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import TDSMeterVisual from '../components/dashboard/TDSMeterVisual';

<<<<<<< HEAD
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Thermometer, Droplets,
    ChevronLeft, ChevronRight, AlertTriangle,
    Activity, Shield as ShieldIcon, Bell, Info, Settings
} from 'lucide-react';
import api from '../services/api';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
=======
import { useQuery } from '@tanstack/react-query';
import {
    Thermometer, Droplets,
    ChevronRight, AlertTriangle,
    Activity, Shield as ShieldIcon, Bell,
    Info, Settings, RefreshCw, Trash2
} from 'lucide-react';
import api from '../services/api';
import clsx from 'clsx';
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020

// Constants for Water Quality
const QUALITY_CONFIG = {
    Good: {
<<<<<<< HEAD
        color: '#10b981', // emerald-500
=======
        color: '#10b981',
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        text: 'text-emerald-500',
        icon: ShieldIcon,
        description: 'Water is safe for consumption and general use.'
    },
    Acceptable: {
<<<<<<< HEAD
        color: '#f59e0b', // amber-500
=======
        color: '#f59e0b',
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        text: 'text-amber-500',
        icon: AlertTriangle,
        description: 'TDS levels are slightly elevated. Consider filtration.'
    },
    Critical: {
<<<<<<< HEAD
        color: '#ef4444', // red-500
=======
        color: '#ef4444',
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
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
<<<<<<< HEAD
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [chartRange, setChartRange] = useState<'24H' | '1W' | '1M' | 'Range'>('24H');
    const [isRefetching, setIsRefetching] = useState(false);
    const [showNodeInfo, setShowNodeInfo] = useState(false);
    const [showParams, setShowParams] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Fetch EvaraTDS data
    const { data: device, isLoading, isError, error: deviceError, refetch } = useQuery({
        queryKey: ['evaratds_device', id],
        queryFn: async () => {
            console.log(`[TDS Analytics] Fetching telemetry for device: ${id}`);
            try {
                const response = await api.get(`/devices/tds/${id}/telemetry`);
                console.log(`[TDS Analytics] ✅ Telemetry response:`, response.data);
                return response.data;
            } catch (error) {
                console.error(`[TDS Analytics] ❌ Telemetry fetch failed:`, error);
                throw error;
            }
        },
        enabled: !!id,
        refetchInterval: 30000 // Refresh every 30s
    });

    // Fetch TDS history for charts - ONLY 3 HOURS
    const { data: history, isLoading: historyLoading } = useQuery({
        queryKey: ['evaratds_history', id],
        queryFn: async () => {
            try {
                console.log(`[TDS Analytics] Fetching 3-hour history for device: ${id}`);
                const response = await api.get(`/devices/tds/${id}/history?hours=3`);
                console.log(`[TDS Analytics] ✅ History API response:`, response.data);
                
                // Validate response structure
                if (!response.data || typeof response.data !== 'object') {
                    console.error('[TDS Analytics] ❌ Invalid response structure:', response.data);
                    return [];
                }

                const historyArray = response.data.history || response.data.data || [];
                console.log(`[TDS Analytics] 📊 Got ${historyArray.length} history points`);
                
                if (historyArray.length === 0) {
                    console.warn('[TDS Analytics] ⚠️  History array is empty');
                }
                
                return historyArray;
            } catch (error) {
                console.error(`[TDS Analytics] ❌ History fetch failed:`, error);
                return [];
            }
        },
        enabled: !!id,
        refetchInterval: 60000 // Refresh every 60s
    });

    // Combine device and history data
    const deviceWithHistory = device ? {
        ...device,
        tdsHistory: history || []
    } : null;



    // Formatting Helpers
    const formatTimestamp = (ts: string) => {
        if (!ts) return 'N/A';
        return new Date(ts).toLocaleString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: 'short'
        });
    };

    const formatChartTimestamp = (ts: string) => {
        const date = new Date(ts);
        return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    };

    // Derived Data
    const quality = (deviceWithHistory?.waterQualityRating || "Good") as keyof typeof QUALITY_CONFIG;
    const qualityConfig = QUALITY_CONFIG[quality] || QUALITY_CONFIG.Good;

    const tdsHistory = useMemo(() => {
        console.log(`[TDS Analytics] Chart Data Builder - tdsHistory input:`, deviceWithHistory?.tdsHistory);
        
        const allData = (deviceWithHistory?.tdsHistory || []).map((h: any) => ({
            time: formatChartTimestamp(h.timestamp),
            fullTime: formatTimestamp(h.timestamp),
            value: h.value,
            timestamp: new Date(h.timestamp).getTime()
        }));

        console.log(`[TDS Analytics] Formatted data (before filtering):`, allData.length, 'points');

        if (allData.length === 0) {
            console.log(`[TDS Analytics] ⚠️  No history data available for chart`);
            return [];
        }

        // Filter to 15-minute intervals: keep first point, then points at 15-min boundaries
        const filtered: any[] = [];
        let lastTimestamp = 0;
        const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

        for (const point of allData) {
            // Always keep the first point
            if (filtered.length === 0) {
                filtered.push(point);
                lastTimestamp = point.timestamp;
            } 
            // Keep if at least 15 minutes have passed since last kept point
            else if (point.timestamp - lastTimestamp >= FIFTEEN_MINUTES_MS) {
                filtered.push(point);
                lastTimestamp = point.timestamp;
            }
        }

        console.log(`[TDS Analytics] Chart data after 15-min filtering:`, filtered.length, 'points');
        console.log(`[TDS Analytics] First point:`, filtered[0]);
        console.log(`[TDS Analytics] Last point:`, filtered[filtered.length - 1]);

        return filtered;
    }, [deviceWithHistory?.tdsHistory]);

    // Handle refresh data
    const handleRefresh = async () => {
        setIsRefetching(true);
        try {
            await refetch();
            await queryClient.refetchQueries({ queryKey: ['evaratds_history', id] });
        } finally {
            setIsRefetching(false);
        }
    };

    // Handle delete device
    const handleDeleteDevice = async () => {
        try {
            await api.delete(`/admin/nodes/${id}`);
            queryClient.invalidateQueries({ queryKey: ['evaratds_device'] });
            navigate('/nodes');
        } catch (error) {
            console.error('Delete failed:', error);
        }
    };
=======
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
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020

    if (!id) return <Navigate to="/nodes" replace />;

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-transparent">
                <div className="flex flex-col items-center gap-4">
<<<<<<< HEAD
                    <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    <p className="font-medium animate-pulse" style={{ color: "var(--text-muted)" }}>Loading Water Quality Labs...</p>
=======
                    <div className="w-8 h-8 rounded-full border-4 border-solid animate-spin"
                        style={{ borderColor: 'rgba(10,132,255,0.2)', borderTopColor: '#0A84FF' }} />
                    <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Loading analytics...</p>
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                </div>
            </div>
        );
    }

<<<<<<< HEAD
    if (isError || !deviceWithHistory) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-transparent p-6">
                <div className="apple-glass-card p-8 rounded-[32px] text-center max-w-md">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="text-red-500" size={32} />
                    </div>
                    <h2 className="text-xl font-black mb-2" style={{ color: "var(--text-primary)" }}>Device Not Found</h2>
                    <p className="mb-6" style={{ color: "var(--text-muted)" }}>The EvaraTDS unit you are looking for could not be found or is unavailable.</p>
                    {isError && (
                        <div className="mb-6 p-4 bg-red-500/10 rounded-lg text-left border border-red-500/20">
                            <p className="text-xs text-red-600 font-mono break-all font-bold mb-2">❌ ERROR DETAILS:</p>
                            <p className="text-xs text-red-600 font-mono break-all mb-2">
                                {(deviceError as any)?.response?.data?.error || 
                                (deviceError as any)?.message ||
                                'Unknown error occurred'}
                            </p>
                            <p className="text-xs text-red-600 font-mono break-all mb-2">Status: {(deviceError as any)?.response?.status || 'Unknown'}</p>
                            <p className="text-xs text-red-600 font-mono mt-3 border-t border-red-500/20 pt-2">Device ID: {id}</p>
                            <p className="text-xs text-red-600 font-mono">API Endpoint: /api/v1/devices/tds/{id}/telemetry</p>
                        </div>
                    )}
                    <button
                        onClick={() => navigate('/nodes')}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all"
                    >
                        Back to Dashboard
=======
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
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                    </button>
                </div>
            </div>
        );
    }

    return (
<<<<<<< HEAD
        <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 bg-transparent selection:bg-blue-500/30">
            <div className="max-w-7xl mx-auto space-y-6">

                <div className="flex flex-col gap-2 mb-2">
                    <nav className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>
                        <button onClick={() => navigate('/')} className="hover:text-blue-400 transition-colors bg-transparent border-none cursor-pointer p-0 uppercase font-bold">
                            Home
                        </button>
                        <ChevronRight size={12} className="opacity-40" />
                        <button onClick={() => navigate('/nodes')} className="hover:text-blue-400 transition-colors bg-transparent border-none cursor-pointer p-0 uppercase font-bold">
                            All Nodes
                        </button>
                        <ChevronRight size={12} className="opacity-40" />
                        <span className="text-[var(--text-primary)] font-bold">{deviceWithHistory.deviceName}</span>
                    </nav>

                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>
                                {deviceWithHistory.deviceName} TDS Analytics
                            </h1>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-sm border-none text-white bg-[#34C759]">
                                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                Online
                            </div>

                            <button
                                onClick={handleRefresh}
                                disabled={isRefetching}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95 border-none ${isRefetching ? 'bg-gray-100 dark:bg-white/10 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                            >
                                <svg className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                {isRefetching ? 'Refreshing...' : 'Refresh Data'}
                            </button>

                            <button
                                onClick={() => setShowNodeInfo(true)}
                                className="flex items-center gap-2 px-4 py-1.5 bg-purple-500 hover:bg-purple-600 text-white border-none rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                            >
                                <Info size={14} className="stroke-[2px]" />
                                Node Info
                            </button>

                            <button
                                onClick={() => setShowParams(true)}
                                className="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-amber-900 border-none rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                            >
                                <Settings size={14} className="stroke-[2px]" />
                                Parameters
                            </button>

                            {user?.role === 'superadmin' && (
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white border-none rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                    Delete Node
                                </button>
                            )}
                        </div>
                    </div>
                </div>


                <div className="grid lg:grid-cols-12 gap-8">
                    {/* --- LEFT COLUMN: DEVICE VISUALIZATION --- */}
                    <div className="lg:col-span-4 space-y-4">

                        {/* Hero: TDS Meter SVG + Animated Water */}
                        <div className="apple-glass-card rounded-[2.5rem] border border-white/5 relative overflow-hidden flex flex-col p-6 min-h-[560px]">
                            {/* Card Header: Device Name + Live Badge */}
                            <div className="flex items-center justify-between mb-4 relative z-10">
                                <h3 className="text-xl font-bold tracking-tight text-black dark:text-white">
                                    {deviceWithHistory.deviceName} TDS Meter
                                </h3>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">Live</span>
                                </div>
                            </div>

                            <div className="flex-grow flex items-center justify-center">
                                <TDSMeterVisual
                                    tdsValue={deviceWithHistory.tdsValue || 0}
=======
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
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                            onClick={() => setShowDeleteConfirm(false)}>
                            <div className="rounded-[32px] p-8 w-full max-w-sm text-center relative overflow-hidden"
                                style={{
                                    background: 'white',
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
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                                    quality={quality as 'Good' | 'Acceptable' | 'Critical'}
                                />
                            </div>

<<<<<<< HEAD
                            {/* Parameter Cards at the bottom - Mirroring EvaraTank style */}
                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <div className="text-left rounded-2xl p-4 flex flex-col justify-center transition-all hover:scale-[1.02]"
                                    style={{
                                        background: quality === 'Good' ? 'rgba(16, 185, 129, 0.06)' :
                                            quality === 'Acceptable' ? 'rgba(245, 158, 11, 0.06)' :
                                                'rgba(239, 68, 68, 0.06)',
                                        border: `1px solid ${quality === 'Good' ? 'rgba(16, 185, 129, 0.12)' :
                                            quality === 'Acceptable' ? 'rgba(245, 158, 11, 0.12)' :
                                                'rgba(239, 68, 68, 0.12)'}`
                                    }}>
                                    <p className="text-[9px] font-bold uppercase tracking-wider m-0 mb-1"
                                        style={{ color: qualityConfig.color, opacity: 0.8 }}>Water Quality</p>
                                    <p className="text-lg font-black m-0 tracking-tight"
                                        style={{ color: qualityConfig.color }}>{quality.toUpperCase()}</p>
                                </div>

                                <div className="text-left rounded-2xl p-4 flex flex-col justify-center transition-all hover:scale-[1.02]"
                                    style={{
                                        background: 'rgba(255, 149, 0, 0.06)',
                                        border: '1px solid rgba(255, 149, 0, 0.12)'
                                    }}>
                                    <p className="text-[9px] font-bold uppercase tracking-wider m-0 mb-1"
                                        style={{ color: '#FF9500', opacity: 0.8 }}>Temperature</p>
                                    <p className="text-lg font-black m-0 tracking-tight"
                                        style={{ color: '#FF9500' }}>{deviceWithHistory.temperature || 0}°C</p>
=======
                            {/* Bottom identity panels */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/10">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/80 mb-1">Water Quality</p>
                                    <p className="text-lg font-black text-emerald-500">{quality.toUpperCase()}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/10">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-500/80 mb-1">Temperature</p>
                                    <p className="text-lg font-black text-orange-500">{device.temperature || 0}°C</p>
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                                </div>
                            </div>
                        </div>

<<<<<<< HEAD
                    </div>

                    {/* --- RIGHT COLUMN: DASHBOARD --- */}
                    <div className="lg:col-span-8 space-y-6">
                        {/* 4 Cards Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard
                                label="TDS LEVEL"
                                value={deviceWithHistory.tdsValue || 0}
                                unit="ppm"
                                icon={Droplets}
                                topIcon={Droplets}
                                topIconColor="text-blue-500"
                            />
                            <StatCard
                                label="TEMPERATURE"
                                value={deviceWithHistory.temperature || 0}
                                unit="°C"
                                icon={Thermometer}
                                topIcon={Thermometer}
                                topIconColor="text-orange-500"
                            />
                            <StatCard
                                label="WATER QUALITY"
                                value={quality}
                                unit=""
                                icon={qualityConfig.icon}
                                topIcon={ShieldIcon}
                                topIconColor={qualityConfig.text}
                            />
                            <StatCard
                                label="NOTIFICATIONS"
                                value={deviceWithHistory.alertsCount || 0}
                                unit=""
                                icon={Bell}
                                topIcon={Bell}
                                topIconColor="text-red-500"
                            />
                        </div>

                        {/* TDS TREND CHART */}
                        <div className="apple-glass-card rounded-[32px] p-6 lg:p-8 border border-white/5 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-5">
                                <Activity size={120} className="text-blue-500" />
                            </div>

                            <div className="flex items-center justify-between mb-8 relative z-10">
                                <div>
                                    <h3 className="text-lg font-black text-gray-800 dark:text-white flex items-center gap-2">
                                        <Activity size={20} className="text-blue-500" />
                                        TDS Level Trends
                                    </h3>
                                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">Dissolved Solids Monitoring (PPM)</p>
                                </div>
                                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                                    {(['24H', '1W', '1M', 'Range'] as const).map(range => (
                                        <button
                                            key={range}
                                            onClick={() => setChartRange(range)}
                                            className={clsx(
                                                "px-4 py-1.5 rounded-lg text-xs font-black transition-all",
                                                chartRange === range ? "bg-blue-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                            )}
                                        >
                                            {range}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="h-[350px] w-full mt-4 relative">
                                {tdsHistory.length === 0 ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-white/5 to-transparent rounded-lg">
                                        <Activity size={40} className="text-gray-400 mb-2" />
                                        <p className="text-sm font-semibold text-gray-500">No data available</p>
                                        <p className="text-xs text-gray-400 mt-1">Fetching last 3 hours of data...</p>
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={tdsHistory}>
                                            <defs>
                                                <linearGradient id="tdsGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid-color)" />
                                            <XAxis
                                                dataKey="time"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 700 }}
                                                className="text-gray-400 dark:text-gray-500"
                                                dy={10}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 700 }}
                                                className="text-gray-400 dark:text-gray-500" />
                                            <Tooltip
                                                content={<CustomTooltip />}
                                                cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="value"
                                                stroke="#3b82f6"
                                                strokeWidth={4}
                                                fillOpacity={1}
                                                fill="url(#tdsGradient)"
                                                animationDuration={1500}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>


                    </div>
                </div>
            </div>

            {/* NODE INFO MODAL */}
            {showNodeInfo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} onClick={() => setShowNodeInfo(false)}>
                    <div className="rounded-3xl p-6 flex flex-col w-full max-w-md apple-glass-card border border-white/10" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-black mb-4" style={{ color: "var(--text-primary)" }}>Node Information</h3>
                        <div className="space-y-3 mb-6 text-sm">
                            <div>
                                <p className="font-bold text-xs uppercase" style={{ color: "var(--text-muted)" }}>Device Name</p>
                                <p style={{ color: "var(--text-primary)" }}>{deviceWithHistory.deviceName}</p>
                            </div>
                            <div>
                                <p className="font-bold text-xs uppercase" style={{ color: "var(--text-muted)" }}>Device ID</p>
                                <p style={{ color: "var(--text-primary)" }} className="font-mono text-xs break-all">{deviceWithHistory.deviceId || id}</p>
                            </div>
                            <div>
                                <p className="font-bold text-xs uppercase" style={{ color: "var(--text-muted)" }}>TDS Level</p>
                                <p style={{ color: "var(--text-primary)" }}>{deviceWithHistory.tdsValue || 0} ppm</p>
                            </div>
                            <div>
                                <p className="font-bold text-xs uppercase" style={{ color: "var(--text-muted)" }}>Temperature</p>
                                <p style={{ color: "var(--text-primary)" }}>{deviceWithHistory.temperature || 0}°C</p>
                            </div>
                            <div>
                                <p className="font-bold text-xs uppercase" style={{ color: "var(--text-muted)" }}>Water Quality</p>
                                <p style={{ color: qualityConfig.color }}>{quality}</p>
                            </div>
                        </div>
                        <button onClick={() => setShowNodeInfo(false)} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all">
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* PARAMETERS MODAL */}
            {showParams && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} onClick={() => setShowParams(false)}>
                    <div className="rounded-3xl p-6 flex flex-col w-full max-w-md apple-glass-card border border-white/10" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-black mb-4" style={{ color: "var(--text-primary)" }}>Device Parameters</h3>
                        <div className="space-y-3 mb-6 text-sm">
                            <div>
                                <p className="font-bold text-xs uppercase" style={{ color: "var(--text-muted)" }}>TDS Threshold (Warning)</p>
                                <p style={{ color: "var(--text-primary)" }}>300 ppm</p>
                            </div>
                            <div>
                                <p className="font-bold text-xs uppercase" style={{ color: "var(--text-muted)" }}>TDS Threshold (Critical)</p>
                                <p style={{ color: "var(--text-primary)" }}>500 ppm</p>
                            </div>
                            <div>
                                <p className="font-bold text-xs uppercase" style={{ color: "var(--text-muted)" }}>Temperature Range</p>
                                <p style={{ color: "var(--text-primary)" }}>0 - 50°C</p>
                            </div>
                            <div>
                                <p className="font-bold text-xs uppercase" style={{ color: "var(--text-muted)" }}>Measurement Interval</p>
                                <p style={{ color: "var(--text-primary)" }}>Every 30 seconds</p>
                            </div>
                        </div>
                        <button onClick={() => setShowParams(false)} className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-amber-900 rounded-xl font-bold transition-all">
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* DELETE CONFIRMATION MODAL */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} onClick={() => setShowDeleteConfirm(false)}>
                    <div className="rounded-3xl p-6 flex flex-col w-full max-w-md apple-glass-card border border-red-500/20" onClick={(e) => e.stopPropagation()}>
                        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                            <AlertTriangle className="text-red-500" size={24} />
                        </div>
                        <h3 className="text-xl font-black mb-2" style={{ color: "var(--text-primary)" }}>Delete Device</h3>
                        <p className="mb-6 text-sm" style={{ color: "var(--text-muted)" }}>Are you sure you want to permanently delete this TDS device? This action cannot be undone.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-bold transition-all">
                                Cancel
                            </button>
                            <button onClick={handleDeleteDevice} className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
=======
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
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
        </div>
    );
};

<<<<<<< HEAD
// --- SUB-COMPONENTS ---

const StatCard = ({ label, subLabel, value, unit, icon: Icon, topIcon: TopIcon, color, topIconColor = "#004F94" }: any) => (
    <div className="apple-glass-card rounded-[2rem] p-4 flex flex-col relative overflow-hidden transition-all duration-300 hover:border-white/10 border border-white/5 h-full">
        {/* Header: Label / Top Icon */}
        <div className="flex justify-between items-start mb-2 h-11">
            <div className="flex flex-col justify-center h-full">
                <h2 className="text-[15px] font-bold tracking-tight text-[var(--text-primary)] m-0 uppercase leading-tight">{label}</h2>
            </div>
            {/* Top Right Icon Box */}
            <div className="w-8 h-8 rounded-[10px] bg-white dark:bg-white/10 flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-slate-50 dark:border-white/10">
                <TopIcon width="16" height="16" className={topIconColor} />
            </div>
        </div>

        {/* Body Content */}
        <div className="flex items-center gap-2.5 w-full overflow-hidden mt-auto">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${color || "bg-[#f1f5f9] dark:bg-white/5"}`}>
                <Icon size={16} className={topIconColor} />
            </div>
            <div className="flex flex-col min-w-0">
                {subLabel && <span className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-widest truncate">{subLabel}</span>}
                <div className="flex items-baseline gap-1">
                    <span className="text-xl lg:text-2xl font-bold tracking-tighter leading-tight" style={{ color: topIconColor }}>
                        {value}
                    </span>
                    {unit && <span className="text-xs font-bold tracking-tight text-[var(--text-muted)]">{unit}</span>}
                </div>
            </div>
        </div>
=======
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
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
    </div>
);


<<<<<<< HEAD
const CustomTooltip = ({ active, payload, unit = 'ppm' }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="apple-glass-card px-4 py-3 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl">
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>{payload[0].payload.fullTime}</p>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{payload[0].value}</span>
                    <span className="text-xs font-bold text-blue-400">{unit}</span>
=======

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
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                </div>
            </div>
        );
    }
    return null;
};

export default EvaraTDSAnalytics;
