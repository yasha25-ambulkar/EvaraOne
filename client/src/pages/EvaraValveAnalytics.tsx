import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import api from '../services/api';
import clsx from 'clsx';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
    ComposedChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer
} from 'recharts';
import { Play, Square, Settings2 } from 'lucide-react';
import { useDeviceAnalytics } from '../hooks/useDeviceAnalytics';
import { useRealtimeTelemetry } from '../hooks/useRealtimeTelemetry';
import useThingSpeakReader from '../hooks/useThingSpeakReader';

// (Mock data removed) Chart now uses ThingSpeak data only

const ValveStatusGauge = ({ value, max = 10000 }: { value: number; max?: number }) => {
    const percentage = Math.min(100, (value / max) * 100);
    const radius = 90;
    const strokeWidth = 18;
    const circumference = 2 * Math.PI * radius;
    const totalAngle = 270; // Partial circle
    const arcLength = (totalAngle / 360) * circumference;
    const offset = arcLength - (percentage / 100) * arcLength;

    return (
        <div className="apple-glass-card relative flex flex-col items-center justify-center p-5 rounded-[2rem] shadow-xl h-full min-h-[260px] overflow-hidden group">
            <svg className="w-56 h-56 transform rotate-[135deg]">
                <defs>
                    <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#00d2ff" />
                        <stop offset="100%" stopColor="#0066ff" />
                    </linearGradient>
                </defs>
                {/* Background Arc */}
                <circle
                    cx="112"
                    cy="112"
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={`${arcLength} ${circumference}`}
                    strokeLinecap="round"
                    className="text-slate-200 dark:text-slate-800/50"
                />
                {/* Progress Arc */}
                <circle
                    cx="112"
                    cy="112"
                    r={radius}
                    stroke="url(#gaugeGradient)"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={`${arcLength} ${circumference}`}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out drop-shadow-[0_0_8px_rgba(0,102,255,0.4)]"
                />
            </svg>
            
            <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
                <div className="flex items-baseline gap-1">
                    <span className="text-[32px] font-black tracking-tighter text-black dark:text-white leading-none">
                        {value.toLocaleString()}
                    </span>
                    <span className="text-[14px] font-black text-slate-400">L</span>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>
                    Total Volume
                </span>
            </div>

            <div className="absolute bottom-6 flex flex-col items-center">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>Limit</span>
                    <span className="text-[12px] font-black text-blue-600 dark:text-blue-400">{max.toLocaleString()} L</span>
                </div>
            </div>
        </div>
    );
};

const FlowTrendCard = ({ data }: { data: Array<{ ts: number; value: number | null; time: string; fullTime: string }> }) => {
    return (
        <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between mb-4">
                <div className="flex gap-3 items-center">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shadow-sm">
                        <svg className="text-blue-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-[15px] font-bold uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>Flow Trend</h2>
                        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Real-time consumption (L/min)</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 w-full h-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data}>
                        <defs>
                            <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                        <XAxis 
                            dataKey="ts"
                            type="number"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            minTickGap={30}
                            tickFormatter={(ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        />
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            tickFormatter={(v) => `${Number(v).toFixed(1)} L/min`}
                        />
                        <Tooltip
                            cursor={{ stroke: 'rgba(37,99,235,0.35)', strokeWidth: 1 }}
                            labelFormatter={(label) => new Date(Number(label)).toLocaleString()}
                            formatter={(value: any) => [`${Number(value).toFixed(2)} L/min`, 'Flow']}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        />
                        <Area 
                            type="linear" 
                            dataKey="value" 
                            stroke="#2563eb" 
                            strokeWidth={2} 
                            fillOpacity={1} 
                            fill="url(#colorFlow)" 
                            isAnimationActive={false}
                            dot={false}
                            activeDot={{ r: 4, stroke: '#2563eb', strokeWidth: 2, fill: '#ffffff' }}
                            connectNulls={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const ValveControlCard = ({ hardwareId }: { hardwareId?: string }) => {
    const [status, setStatus] = useState<'OPEN' | 'CLOSED' | 'TRANSITIONING'>('CLOSED');
    const [error, setError] = useState<string | null>(null);
    
    const handleControl = async (newStatus: 'OPEN' | 'CLOSED') => {
        if (!hardwareId) {
            setError('Device ID not available');
            return;
        }
        
        setStatus('TRANSITIONING');
        setError(null);
        
        try {
            const valveRef = doc(db, 'devices', hardwareId);
            
            await updateDoc(valveRef, {
                valve_status: newStatus
            });

            console.log(`✅ Valve status updated to: ${newStatus}`);
            setTimeout(() => setStatus(newStatus), 1500);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to update valve status';
            console.error('❌ Error updating valve status:', err);
            setError(errorMsg);
            setStatus('CLOSED');
        }
    };

    return (
        <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col justify-between min-h-[160px] hover:scale-[1.02] transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5 group cursor-pointer">
            <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Valve Control</h3>
                <div className={clsx(
                    "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter transition-all duration-500 animate-pulse",
                    status === 'OPEN' ? "bg-green-100 text-green-600 shadow-[0_0_12px_rgba(34,197,94,0.3)]" : 
                    status === 'CLOSED' ? "bg-red-100 text-red-600 shadow-[0_0_12px_rgba(239,68,68,0.3)]" : 
                    "bg-blue-100 text-blue-600"
                )}>
                    {status}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
                <button 
                    onClick={() => handleControl('OPEN')}
                    disabled={status === 'OPEN' || status === 'TRANSITIONING'}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-black text-[10px] uppercase tracking-widest transition-all duration-300 shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden active:scale-95 hover:-translate-y-0.5"
                >
                    <Play size={12} className="fill-current group-hover:scale-125 transition-transform duration-300" />
                    Open
                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
                </button>
                <button 
                    onClick={() => handleControl('CLOSED')}
                    disabled={status === 'CLOSED' || status === 'TRANSITIONING'}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-[10px] uppercase tracking-widest transition-all duration-300 shadow-lg shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden active:scale-95 hover:-translate-y-0.5"
                >
                    <Square size={10} className="fill-current group-hover:scale-125 transition-transform duration-300" />
                    Close
                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
                </button>
            </div>
            {error && <p className="text-[10px] font-bold text-center mt-2 text-red-500">{error}</p>}
        </div>
    );
};

const SetLimitCard = () => {
    const [limit, setLimit] = useState(7000);
    return (
        <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-1">
                <h3 className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Smart Limit</h3>
                <Settings2 size={12} className="text-blue-500" />
            </div>

            <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[20px] font-black tracking-tighter" style={{ color: 'var(--text-primary)' }}>{limit}</span>
                <span className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Liters</span>
            </div>
            
            <input 
                type="range" 
                min="1000" 
                max="50000" 
                step="1000"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const EvaraValveAnalytics = () => {
    const { hardwareId } = useParams<{ hardwareId: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [showParams, setShowParams] = useState(false);
    const [showNodeInfo, setShowNodeInfo] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Local state for parameters modal
    const [localTsChannel, setLocalTsChannel] = useState('');
    const [localFlowField, setLocalFlowField] = useState('');

    const {
        data: unifiedData,
        isLoading,
    } = useDeviceAnalytics(hardwareId);
    
    useRealtimeTelemetry(hardwareId);

    // mockHistory removed — chart uses real ThingSpeak data only
    
    const deviceInfo = (unifiedData?.info as any)?.data;
    const deviceConfig = (unifiedData?.config as any)?.config || {};

    // ThingSpeak configuration/fields (set during provisioning)
    const tsChannel = deviceConfig?.thingspeak_channel_id || deviceConfig?.thingspeakChannelId || '';
    const positionField = deviceConfig?.position_field || deviceConfig?.positionField || '';
    const statusField = deviceConfig?.status_field || deviceConfig?.statusField || '';
    const flowField = deviceConfig?.flow_field || deviceConfig?.flowField || deviceConfig?.fields?.flow || 'field2';
    const totalVolumeField = deviceConfig?.total_volume_field || deviceConfig?.totalVolumeField || 'field1'; // Default to field1 as a fallback
    const flowFieldName = deviceConfig?.flow_field_name || deviceConfig?.flowFieldName || deviceConfig?.fields?.flow_name || deviceConfig?.fields?.flowName || 'Selected ThingSpeak field';

    const selectedFlowField = useMemo(() => {
        const normalized = String(flowField || '').trim().toLowerCase();
        return /^field[1-8]$/.test(normalized) ? normalized : 'field2';
    }, [flowField]);

    const totalVolumeFieldCandidates = useMemo(
        () => Array.from(new Set([totalVolumeField, 'field1', 'field3'].filter(Boolean))),
        [totalVolumeField]
    );

    const tsFields = useMemo(
        () => Array.from(new Set([positionField, statusField, selectedFlowField, ...totalVolumeFieldCandidates].filter(Boolean))),
        [positionField, statusField, selectedFlowField, totalVolumeFieldCandidates]
    );

    const pickFieldValue = (values: Record<string, string | null> | undefined, candidates: string[]) => {
        for (const candidate of candidates) {
            const value = values?.[candidate];
            if (value !== null && value !== undefined && String(value).trim() !== '') {
                return value;
            }
        }
        return null;
    };

    const tsReadKey = deviceConfig?.thingspeak_read_api_key || deviceConfig?.thingspeakReadKey || undefined;

    const { readings: tsReadings, latest: tsLatest } = useThingSpeakReader(
        tsChannel || undefined,
        tsReadKey,
        tsFields,
        { pollIntervalMs: 15000, windowSeconds: 3600, results: 150 } as any // match ThingSpeak chart defaults
    );

    useEffect(() => {
        setLocalTsChannel(tsChannel);
        setLocalFlowField(flowField);
    }, [tsChannel, flowField]);

    // Create a stable, memoized object for the latest telemetry values
    const latestTelemetry = useMemo(() => {
        if (!tsLatest?.values) {
            return {
                flow: null,
                totalVolume: null,
                status: null,
            };
        }
        return {
            flow: tsLatest.values[selectedFlowField] ?? null,
            totalVolume: pickFieldValue(tsLatest.values, totalVolumeFieldCandidates),
            status: tsLatest.values[statusField] ?? null,
        };
    }, [tsLatest, selectedFlowField, totalVolumeFieldCandidates, statusField]);
    
    // Attempt to ensure at least 15 non-null data points for a denser chart.
    const [backfilledReadings, setBackfilledReadings] = useState<any[] | null>(null);

    useEffect(() => {
        // If we already have 15+ valid points, no backfill needed
        const valid = (tsReadings || []).map(r => {
            const raw = r.values?.[selectedFlowField];
            return raw === null || raw === undefined || String(raw).trim() === '' ? null : parseFloat(String(raw));
        }).filter(v => v !== null);

        if ((valid.length >= 15) || !tsChannel) {
            setBackfilledReadings(null);
            return;
        }

        // Fetch a larger window to try and collect 15 non-null values (one-off backfill)
        (async () => {
            try {
                const url = `https://api.thingspeak.com/channels/${encodeURIComponent(tsChannel)}/feeds.json`;
                const params: any = { results: 800 };
                const key = tsReadKey;
                if (key) params.api_key = key;
                const res = await axios.get(url, { params, timeout: 10000 });
                const feeds = Array.isArray(res.data?.feeds) ? res.data.feeds : [];
                const mapped = feeds
                    .filter((f: any) => f && f.created_at)
                    .map((f: any) => ({
                        timestamp: new Date((/Z|\+|\-/.test(f.created_at) ? f.created_at : f.created_at + 'Z')).toISOString(),
                        entry_id: f.entry_id,
                        values: tsFields.reduce((acc: any, fk: string) => { acc[fk] = f[fk] ?? null; return acc; }, {}),
                    }));

                setBackfilledReadings(mapped);
            } catch (err) {
                // Ignore backfill failures; rely on whatever data we have
                setBackfilledReadings(null);
            }
        })();
    }, [tsReadings, tsChannel, tsReadKey, selectedFlowField, tsFields]);

    const flowHistory = useMemo(() => {
        const source = (backfilledReadings && Array.isArray(backfilledReadings) ? backfilledReadings : tsReadings) || [];
        const mapped = source.map((reading: any) => {
            const raw = reading.values?.[selectedFlowField];
            const parsed = raw === null || raw === undefined || String(raw).trim() === '' ? null : parseFloat(String(raw));
            const value = Number.isFinite(parsed as number) ? parsed : null;
            const time = new Date(reading.timestamp);
            return {
                ts: time.getTime(),
                time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                fullTime: time.toISOString(),
                value,
            };
                }).filter((r: any) => r.value !== null)
                    .sort((a: any, b: any) => a.ts - b.ts);

                // Remove duplicate timestamps to avoid tooltip index ambiguity on hover
                const deduped = mapped.filter((point: any, idx: number, arr: any[]) => idx === 0 || point.ts !== arr[idx - 1].ts);

        // Ensure we display at most the most recent N points, but prefer at least 15 if available
        const minPoints = 15;
        const maxPoints = 150;
        const take = Math.min(maxPoints, Math.max(minPoints, deduped.length));
        return deduped.slice(-take);
    }, [tsReadings, backfilledReadings, selectedFlowField]);

    const isOnline = deviceInfo?.online_status ?? true;

    const handleSave = useCallback(async () => {
        if (!hardwareId) return;

        setSaving(true);
        setSaveError(null);

        try {
            await api.put(`/admin/nodes/${hardwareId}`, {
                thingspeak_channel_id: localTsChannel,
                flow_field: localFlowField,
            });

            await queryClient.invalidateQueries({ queryKey: ['device_analytics', hardwareId] });
            setShowParams(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save parameters';
            setSaveError(message);
        } finally {
            setSaving(false);
        }
    }, [hardwareId, localFlowField, localTsChannel, queryClient]);

    const handleDelete = useCallback(async () => {
        if (!hardwareId) return;

        setIsDeleting(true);
        try {
            await api.delete(`/admin/nodes/${hardwareId}`);
            setShowDeleteConfirm(false);
            navigate('/nodes');
        } catch (err) {
            console.error('Failed to delete node:', err);
            alert('Failed to delete node. Please try again.');
            setIsDeleting(false);
        }
    }, [hardwareId, navigate]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-transparent font-sans relative overflow-x-hidden" style={{ color: 'var(--text-primary)' }}>
            <main className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8" style={{ zIndex: 1 }}>
                <div className="max-w-[1400px] mx-auto w-full relative z-10 flex-1 flex flex-col">
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
                            <span className="font-bold" style={{ color: 'var(--text-primary)', fontWeight: '700' }}>{deviceInfo?.label || hardwareId}</span>
                        </nav>

                        <h2 style={{ fontSize: '22px', fontWeight: '700', marginTop: '6px', color: "var(--text-primary)" }}>
                            {deviceInfo?.label || hardwareId} Analytics
                        </h2>

                        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400 m-0 mt-1">
                            Smart Water Water Control System
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap pb-1 md:self-end lg:self-auto">
                        {/* Status Button (Pill Style) */}
                        <div className={isOnline ? 'pill-button green' : 'pill-button red'}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isOnline ? 'var(--online-dot)' : 'var(--offline-dot)' }} />
                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </div>

                        {/* Refresh Button */}
                        <button
                            onClick={() => window.location.reload()}
                            className="pill-button blue active:scale-95"
                        >
                            <span className="material-icons" style={{ fontSize: '14px' }}>refresh</span>
                            Refresh Data
                        </button>

                        <button onClick={() => setShowNodeInfo(true)} className="pill-button purple active:scale-95">
                            <span className="material-icons" style={{ fontSize: '14px' }}>info</span> Node Info
                        </button>

                        <button onClick={() => setShowParams(true)} className="pill-button amber active:scale-95">
                            <span className="material-icons" style={{ fontSize: '14px' }}>settings</span> Parameters
                        </button>

                        {/* Delete Button */}
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="pill-button red active:scale-95"
                        >
                            <span className="material-icons" style={{ fontSize: '14px' }}>delete_forever</span>
                            Delete Node
                        </button>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
                    {/* Left/Main Area: 8 Columns */}
                    <div className="lg:col-span-8 flex flex-col gap-4 min-h-0">
                        {/* Top Utility Row */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
                            {/* Card 1: Current Flow */}
                            <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col justify-center items-start h-full">
                                <span className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Current Flow</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-[28px] font-black tracking-tighter" style={{ color: 'var(--text-primary)' }}>
                                        {(() => {
                                            const v = latestTelemetry.flow ?? unifiedData?.latest?.flow_rate ?? null;
                                            if (v == null || v === '') return '—';
                                            const n = Number(v);
                                            return Number.isFinite(n) ? n.toFixed(1) : String(v);
                                        })()}
                                    </span>
                                    <span className="text-[14px] font-bold" style={{ color: 'var(--text-muted)' }}>L/min</span>
                                </div>
                            </div>

                            {/* Card 2: Status */}
                            <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col justify-center items-start h-full">
                                <span className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Status</span>
                                <div className="flex items-center gap-2">
                                    <div className={clsx(
                                        "w-2.5 h-2.5 rounded-full",
                                        latestTelemetry.status === 'OPEN' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : (latestTelemetry.status === 'CLOSED' ? 'bg-red-500' : 'bg-gray-300')
                                    )} />
                                    <span className="text-[15px] font-black tracking-tight uppercase" style={{ color: 'var(--text-primary)' }}>
                                        {latestTelemetry.status ?? (isOnline ? 'Operational' : 'Offline')}
                                    </span>
                                </div>
                            </div>

                            {/* Card 3: Recent Activity (Compact) */}
                            <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col justify-center h-full overflow-hidden">
                                <span className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Activity</span>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center text-[10px]">
                                        <span className="font-bold truncate pr-2 text-red-500">Valve Closed</span>
                                        <span className="text-slate-400 shrink-0">10:45 AM</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px]">
                                        <span className="font-bold truncate pr-2 text-green-500">Valve Opened</span>
                                        <span className="text-slate-400 shrink-0">09:30 AM</span>
                                    </div>
                                </div>
                            </div>

                            {/* Card 4: Smart Limit (Compact) */}
                            <SetLimitCard />
                        </div>
                        
                        {/* Wide Graph Area */}
                        <FlowTrendCard data={flowHistory} />
                    </div>

                    {/* Right Stack: 4 Columns */}
                    <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
                        <ValveStatusGauge value={(() => {
                            const v = latestTelemetry.totalVolume ?? unifiedData?.latest?.total_liters ?? unifiedData?.latest?.volume ?? null;
                            const n = v == null || v === '' ? 0 : Number(v);
                            return Number.isFinite(n) ? n : 0;
                        })()} max={(deviceConfig?.capacity && Number(deviceConfig.capacity)) || 10000} />
                        <ValveControlCard hardwareId={hardwareId} />
                    </div>
                </div>
            </div>

            {/* ─── Modals ────────────────────────────────────────────────────────────────── */}

            {/* Node Info Modal */}
            {showNodeInfo && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20"
                    style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                    onClick={() => setShowNodeInfo(false)}
                >
                    <div
                        className="rounded-2xl p-6 flex flex-col w-full max-w-2xl"
                        style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--card-border)',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-[17px] font-bold m-0" style={{ color: 'var(--text-primary)' }}>Node Information</h3>
                            <button
                                onClick={() => setShowNodeInfo(false)}
                                className="flex items-center justify-center rounded-full border-none cursor-pointer p-0 transition-all hover:scale-110"
                                style={{
                                    width: 24,
                                    height: 24,
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-secondary)',
                                    fontSize: '18px',
                                    fontWeight: 'bold',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                }}
                            >
                                &times;
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="rounded-xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Device Name</p>
                                <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{deviceInfo?.label || 'N/A'}</p>
                            </div>

                            <div className="rounded-xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Hardware ID</p>
                                <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{hardwareId}</p>
                            </div>

                            <div className="rounded-xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>ThingSpeak Channel</p>
                                <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{tsChannel || 'Not set'}</p>
                            </div>

                            <div className="rounded-xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Device Type</p>
                                <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{deviceInfo?.type || 'N/A'}</p>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowNodeInfo(false)}
                            className="mt-6 w-full py-3 rounded-2xl font-semibold border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{
                                background: '#3A7AFE',
                                color: '#FFFFFF',
                                fontSize: '14px'
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Parameters Modal */}
            {showParams && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-20"
                    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
                    onClick={() => !saving && setShowParams(false)}
                >
                    <div
                        className="rounded-2xl w-full max-w-md mx-4"
                        style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--card-border)',
                            boxShadow: '0 18px 40px -8px rgba(10,20,30,0.12)'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-5 py-6">
                            <div className="relative">
                                <h3 className="text-lg md:text-xl font-semibold m-0" style={{ color: 'var(--text-primary)', lineHeight: 1.05 }}>Parameters & ThingSpeak Fields</h3>
                                <button
                                    onClick={() => setShowParams(false)}
                                    aria-label="Close parameters"
                                    className="absolute right-0 top-0 w-8 h-8 flex items-center justify-center rounded-full transition-transform hover:scale-105"
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-secondary)',
                                        fontSize: '16px',
                                        fontWeight: '600',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                                    }}
                                >
                                    &times;
                                </button>
                            </div>

                            <div className="mt-4 flex flex-col gap-3">
                                {/* Field Card: Channel ID */}
                                <div className="flex items-center justify-between bg-[var(--card-bg)] border rounded-md px-4 py-3 shadow-sm" style={{ borderColor: 'var(--card-border)' }}>
                                    <div className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>ThingSpeak Channel ID</div>
                                    <div className="font-mono text-sm md:text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>{localTsChannel || 'Not set'}</div>
                                </div>

                                {/* Field Card: Field Number */}
                                <div className="flex items-center justify-between bg-[var(--card-bg)] border rounded-md px-4 py-3 shadow-sm" style={{ borderColor: 'var(--card-border)' }}>
                                    <div className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Field Number</div>
                                    <input
                                        type="text"
                                        value={localFlowField}
                                        onChange={e => setLocalFlowField(e.target.value)}
                                        placeholder="field1, field2..."
                                        className="w-28 text-right font-mono text-sm md:text-[15px] font-semibold bg-transparent border-none outline-none"
                                        style={{ color: 'var(--text-primary)' }}
                                    />
                                </div>

                                {/* Field Card: Field Name */}
                                <div className="flex items-center justify-between bg-[var(--card-bg)] border rounded-md px-4 py-3 shadow-sm" style={{ borderColor: 'var(--card-border)' }}>
                                    <div className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Field Name</div>
                                    <div className="font-mono text-sm md:text-[15px] font-semibold text-right" style={{ color: 'var(--text-primary)' }}>{flowFieldName || 'Not set'}</div>
                                </div>
                            </div>
                        </div>

                        {saveError && <p className="text-[11px] font-bold text-center mt-3 mb-0" style={{ color: '#FF3B30' }}>{saveError}</p>}

                        <div className="flex items-center justify-end gap-3 px-5 pb-6">
                            <button
                                onClick={() => setShowParams(false)}
                                className="px-4 py-2 text-sm rounded-lg font-medium transition-colors hover:bg-[rgba(58,122,254,0.06)]"
                                style={{ background: 'transparent', color: 'var(--text-primary)' }}
                            >
                                Close
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-5 py-2 text-sm rounded-lg font-semibold text-white shadow-sm transition-opacity disabled:opacity-60"
                                style={{ background: '#3A7AFE', opacity: saving ? 0.6 : 1, pointerEvents: saving ? 'none' : 'auto' }}
                            >
                                {saving ? 'Saving…' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-20"
                    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
                    onClick={() => !isDeleting && setShowDeleteConfirm(false)}
                >
                    <div
                        className="rounded-3xl p-8 flex flex-col w-full max-w-sm text-center"
                        style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--card-border)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="material-icons" style={{ fontSize: '32px' }}>delete_outline</span>
                        </div>

                        <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">Delete this Node?</h3>
                        <p className="text-sm text-[var(--text-muted)] mb-8">
                            This will permanently remove <strong>{deviceInfo?.label || hardwareId}</strong> and all its historical telemetry data. This action cannot be undone.
                        </p>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className={`w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all ${isDeleting ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200 active:scale-95'}`}
                            >
                                {isDeleting ? 'Deleting...' : 'Yes, Delete Node'}
                            </button>
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                                className="w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] hover:bg-gray-800 transition-all active:scale-95"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            </main>
        </div>
    );
};

export default EvaraValveAnalytics;
