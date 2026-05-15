import { useState, useMemo, useEffect } from 'react';
import clsx from 'clsx';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    ComposedChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer
} from 'recharts';
import { Info, Settings, Play, Square, Settings2 } from 'lucide-react';
import { useDeviceAnalytics } from '../hooks/useDeviceAnalytics';
import { useRealtimeTelemetry } from '../hooks/useRealtimeTelemetry';

// ─── Mock Data Helpers ────────────────────────────────────────────────────────
const generateMockFlowHistory = () => {
    const data = [];
    const now = new Date();
    for (let i = 60; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60000);
        data.push({
            time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            fullTime: time.toLocaleString(),
            value: Math.random() * 50 + 10, // 10-60 L/min
        });
    }
    return data;
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

const ValveStatusGauge = ({ value, max = 10000 }: { value: number; max?: number }) => {
    const percentage = Math.min(100, (value / max) * 100);
    const radius = 90;
    const strokeWidth = 18;
    const circumference = 2 * Math.PI * radius;
    const totalAngle = 270; // Partial circle
    const arcLength = (totalAngle / 360) * circumference;
    const offset = arcLength - (percentage / 100) * arcLength;

    return (
        <div className="relative flex flex-col items-center justify-center p-5 bg-white/50 dark:bg-white/5 rounded-[2rem] border border-white/20 shadow-xl backdrop-blur-xl h-full min-h-[260px] overflow-hidden group">
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

const FlowTrendCard = ({ data }: { data: any[] }) => {
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
                            dataKey="time" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            minTickGap={30}
                        />
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            tickFormatter={(v) => `${v}L`}
                        />
                        <Tooltip
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="value" 
                            stroke="#2563eb" 
                            strokeWidth={3} 
                            fillOpacity={1} 
                            fill="url(#colorFlow)" 
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const ValveControlCard = () => {
    const [status, setStatus] = useState<'OPEN' | 'CLOSED' | 'TRANSITIONING'>('CLOSED');
    
    const handleControl = (newStatus: 'OPEN' | 'CLOSED') => {
        setStatus('TRANSITIONING');
        setTimeout(() => setStatus(newStatus), 1500);
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
        </div>
    );
};

const SetLimitCard = () => {
    const [limit, setLimit] = useState(7000);
    return (
        <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col justify-center bg-white dark:bg-white/5 border border-white/20 h-full">
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
    const { user } = useAuth();

    const {
        data: unifiedData,
        isLoading,
        error
    } = useDeviceAnalytics(hardwareId);
    
    useRealtimeTelemetry(hardwareId);

    const mockHistory = useMemo(() => generateMockFlowHistory(), []);
    
    const deviceInfo = (unifiedData?.info as any)?.data;
    const isOnline = deviceInfo?.online_status ?? true;

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
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
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
                            Smart Water Control System
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap pb-1">
                        {/* Status Button (Pill Style) */}
                        <div className={clsx(
                            "flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest transition-all duration-200 shadow-sm border",
                            !isOnline
                                ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20"
                                : "bg-[#ecfdf5] dark:bg-emerald-500/10 text-[#059669] dark:text-emerald-400 border border-[#10b981]/50 dark:border-emerald-500/40"
                        )}>
                            <div className={clsx(
                                "w-1.5 h-1.5 rounded-full",
                                !isOnline ? "bg-red-500" : "bg-[#10b981] animate-pulse"
                            )} />
                            {isOnline ? 'Online' : 'Offline'}
                        </div>

                        {/* Refresh Button */}
                        <button
                            onClick={() => window.location.reload()}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95 bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] border border-[#1e40af]/30 dark:bg-transparent dark:text-[#3B82F6] dark:border dark:border-[#3B82F6] dark:hover:bg-[#3B82F6]/10"
                        >
                            <span className="material-icons" style={{ fontSize: '14px' }}>refresh</span>
                            Refresh Data
                        </button>

                        <button className="flex items-center gap-2 px-4 py-1.5 bg-[#f3e8ff] hover:bg-[#e9d5ff] text-[#6b21a8] border border-[#6b21a8]/30 dark:bg-transparent dark:text-[#AF52DE] dark:border dark:border-[#AF52DE] dark:hover:bg-[#AF52DE]/10 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95">
                            <span className="material-icons" style={{ fontSize: '14px' }}>info</span> Node Info
                        </button>

                        <button className="flex items-center gap-2 px-4 py-1.5 bg-[#fef3c7] hover:bg-[#fde68a] text-[#92400e] border border-[#92400e]/30 dark:bg-transparent dark:text-[#FFB340] dark:border dark:border-[#FFB340] dark:hover:bg-[#FFB340]/10 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95">
                            <span className="material-icons" style={{ fontSize: '14px' }}>settings</span> Parameters
                        </button>

                        {/* Delete Button */}
                        <button
                            className="flex items-center gap-2 px-4 py-1.5 bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b] border border-[#991b1b]/30 dark:bg-transparent dark:text-[#FF3B30] dark:border dark:border-[#FF3B30] dark:hover:bg-[#FF3B30]/10 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
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
                            <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col justify-center items-start bg-white dark:bg-white/5 border border-white/20 h-full">
                                <span className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Current Flow</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-[28px] font-black tracking-tighter" style={{ color: 'var(--text-primary)' }}>34.5</span>
                                    <span className="text-[14px] font-bold" style={{ color: 'var(--text-muted)' }}>L/min</span>
                                </div>
                            </div>

                            {/* Card 2: Status */}
                            <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col justify-center items-start bg-white dark:bg-white/5 border border-white/20 h-full">
                                <span className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Status</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                                    <span className="text-[15px] font-black tracking-tight uppercase" style={{ color: 'var(--text-primary)' }}>Operational</span>
                                </div>
                            </div>

                            {/* Card 3: Recent Activity (Compact) */}
                            <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col justify-center bg-white dark:bg-white/5 border border-white/20 h-full overflow-hidden">
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
                        <FlowTrendCard data={mockHistory} />
                    </div>

                    {/* Right Stack: 4 Columns */}
                    <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
                        <ValveStatusGauge value={4280} max={10000} />
                        <ValveControlCard />
                    </div>
                </div>
            </div>
            </main>
        </div>
    );
};

export default EvaraValveAnalytics;
