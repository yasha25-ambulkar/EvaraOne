import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { Info, Settings } from 'lucide-react';
import {
    ComposedChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer
} from 'recharts';
import { useStaleDataAge } from '../hooks/useStaleDataAge';
import { useDeviceAnalytics } from '../hooks/useDeviceAnalytics';
import { useRealtimeTelemetry } from '../hooks/useRealtimeTelemetry';
import { useFirestoreFlowData } from '../hooks/useFirestoreFlowData';
import type { NodeInfoData } from '../hooks/useDeviceAnalytics';
import { computeOnlineStatus } from '../utils/telemetryPipeline';
import type { FlowConfig } from '../hooks/useDeviceConfig';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TelemetryPayload {
    timestamp: string;
    data: { entry_id: number;[key: string]: unknown };
    flow_rate?: number;
    total_liters?: number;
}

const formatKPIValue = (val: number, isOffline?: boolean) =>
    (isOffline || isNaN(val)) ? '—' : val.toLocaleString(undefined, { useGrouping: false, maximumFractionDigits: 0 });

const formatMeterValue = (val: number, isOffline?: boolean) =>
    (isOffline || isNaN(val)) ? '—' : val.toFixed(2);

// ─── Subcomponents ────────────────────────────────────────────────────────────

// ─── Subcomponents ────────────────────────────────────────────────────────────



/** Consumption Pattern (Area chart) */
const ConsumptionPatternCard = ({ history }: { history: { date?: Date, time: string; value: number }[] }) => {
    const [period, setPeriod] = useState<'24H' | '1W' | '1M' | 'RANGE'>('24H');
    const [rangeStart, setRangeStart] = useState<string>('');
    const [rangeEnd, setRangeEnd] = useState<string>('');
    const [isHovered, setIsHovered] = useState(false);

    const chartData = useMemo(() => {
        if (history.length === 0) {
            return [];
        }

        if (period === '24H') {
            return history.slice(-7).map(d => ({
                label: d.time,
                current: d.value
            }));
        } else if (period === '1W') {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const today = new Date();
            const result = [];

            for (let i = 6; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);

                const dayData = history.filter(h => h.date && h.date.getDate() === d.getDate() && h.date.getMonth() === d.getMonth());

                let val: number | null = null;
                if (dayData.length > 0) {
                    val = dayData.reduce((sum, item) => sum + item.value, 0) / dayData.length;
                }

                result.push({
                    label: days[d.getDay()],
                    current: val
                });
            }
            return result;
        } else if (period === '1M') {
            const result = [];
            const today = new Date();

            for (let i = 3; i >= 0; i--) {
                const targetDate = new Date(today);
                targetDate.setDate(targetDate.getDate() - (i * 7));

                const weekData = history.filter(h => {
                    if (!h.date) return false;
                    const diffTime = targetDate.getTime() - h.date.getTime();
                    const diffDays = diffTime / (1000 * 60 * 60 * 24);
                    return diffDays >= 0 && diffDays < 7;
                });

                let val: number | null = null;
                if (weekData.length > 0) {
                    val = weekData.reduce((sum, item) => sum + item.value, 0) / weekData.length;
                }

                result.push({
                    label: `Week ${4 - i}`,
                    current: val
                });
            }
            return result;
        } else if (period === 'RANGE') {
            if (!rangeStart || !rangeEnd) {
                return history.slice(-7).map(d => ({
                    label: d.time,
                    current: d.value
                }));
            }

            const start = new Date(rangeStart);
            const end = new Date(rangeEnd);
            end.setHours(23, 59, 59);

            return history
                .filter(d => d.date && d.date >= start && d.date <= end)
                .map(d => ({
                    label: d.time,
                    current: d.value
                }));
        }

        return [];
    }, [history, period, rangeStart, rangeEnd]);

    const activeLabel = chartData[Math.floor(chartData.length / 2)]?.label || '--:--';

    const peakUsage = useMemo(() => {
        if (chartData.length === 0) return 0;
        return Math.max(...chartData.map(d => d.current || 0));
    }, [chartData]);

    const CustomXAxisTick = ({ x, y, payload }: any) => {
        const isActive = payload.value === activeLabel;
        return (
            <text x={x} y={y + 15} textAnchor="middle" fill={isActive ? 'var(--text-primary)' : 'var(--text-muted)'} fontSize={11} fontWeight={600}>
                {payload.value}
            </text>
        );
    };

    const CustomYAxisTick = ({ x, y, payload }: any) => {
        return (
            <text x={x} y={y} dy={4} textAnchor="start" fill="var(--text-muted)" fontSize={10} fontWeight={500}>
                {payload.value === 0 ? '0' : `${Math.round(payload.value)}L/m`}
            </text>
        );
    };

    return (
        <div className="apple-glass-card rounded-[2rem] p-6 flex flex-col h-full relative overflow-hidden">
            {/* Header Flex Container */}
            <div className="flex items-start justify-between mb-8 z-10 w-full relative">

                {/* Left: Icon, Title, Subtitle */}
                <div className="flex gap-4 items-center">
                    <div className="w-10 h-10 rounded-[0.8rem] bg-[#e0f2fe] dark:bg-white/10 flex items-center justify-center shrink-0 shadow-sm border border-blue-100/20">
                        <svg className="fill-[#004F94] dark:fill-blue-400" width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5 10h3v10H5zm5-4h3v14h-3zm5 7h3v7h-3z" />
                            <circle cx="6.5" cy="5.5" r="1.5" />
                        </svg>
                    </div>
                    <div className="flex flex-col">
                        <h2 className="text-[22px] font-black text-[var(--text-primary)] tracking-tight m-0 leading-tight mb-0.5 uppercase">Consumption Pattern</h2>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Peak Usage</span>
                            <span className="text-[20px] font-black tracking-tight text-[var(--text-primary)]">{formatKPIValue(peakUsage, false)} L/min</span>
                        </div>
                    </div>
                </div>

                {/* Mode Selector and Date Range */}
                <div className="flex flex-col items-end gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        {/* Time Range Selector */}
                        <div className="flex bg-[#f8fafc] dark:bg-white/5 p-1 rounded-full border border-slate-100/50 dark:border-white/10 relative overflow-hidden shrink-0 shadow-inner backdrop-blur-md">
                            {(['24H', '1W', '1M', 'RANGE'] as const).map(p => {
                                const active = period === p;
                                return (
                                    <button
                                        key={p}
                                        onClick={() => setPeriod(p)}
                                        className={`relative z-10 px-5 py-2 text-[10px] sm:text-[11px] font-black tracking-widest uppercase rounded-full cursor-pointer transition-all duration-300 ${active ? 'text-white' : 'text-[#64748b] hover:text-[#334155]'
                                            }`}
                                        style={{
                                            border: 'none',
                                            background: active ? '#004F94' : 'transparent',
                                            borderStyle: 'none',
                                            boxShadow: active ? '0 4px 12px rgba(0, 79, 148, 0.25)' : 'none'
                                        }}
                                    >
                                        {p}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Date Inputs - Integrated inside the header for visual parity */}
                        {period === 'RANGE' && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
                                <input
                                    type="date"
                                    value={rangeStart}
                                    onChange={(e) => setRangeStart(e.target.value)}
                                    className="bg-[var(--bg-secondary)] border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-primary)] focus:ring-1 focus:ring-black outline-none shadow-sm"
                                />
                                <span className="text-[10px] text-[var(--text-muted)] font-black tracking-widest">TO</span>
                                <input
                                    type="date"
                                    value={rangeEnd}
                                    onChange={(e) => setRangeEnd(e.target.value)}
                                    className="bg-[var(--bg-secondary)] border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-primary)] focus:ring-1 focus:ring-black outline-none shadow-sm"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Chart Area */}
            <div className="flex-1 w-full relative min-h-[220px]"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}>

                {/* Hover Legend */}
                <div className={`absolute top-[-35px] right-0 z-20 flex items-center gap-4 transition-all duration-300 pointer-events-none ${isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#004F94]" />
                        <span className="text-[10px] font-black tracking-widest text-[var(--text-primary)] uppercase">CURRENT</span>
                    </div>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                        {/* Use dynamic CSS variable for grid lines to ensure visibility across themes */}
                        <CartesianGrid strokeDasharray="0" vertical={false} stroke="var(--chart-grid-color)" />

                        <YAxis
                            orientation="right"
                            axisLine={false}
                            tickLine={false}
                            tick={<CustomYAxisTick />}
                            domain={['auto', 'auto']}
                        />

                        <XAxis
                            dataKey="label"
                            axisLine={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                            tickLine={false}
                            tick={<CustomXAxisTick />}
                            padding={{ left: 20, right: 20 }}
                        />

                        <Tooltip
                            content={(props: any) => {
                                const { active, payload } = props;
                                if (!active || !payload || payload.length === 0) return null;
                                const dataPoint = payload[0]?.payload;
                                const label = dataPoint?.label || '--';
                                return (
                                    <div style={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', background: 'var(--bg-secondary)', padding: '10px 14px', minWidth: 180 }}>
                                        <p style={{ margin: '0 0 2px 0', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{label}</p>
                                        {payload.map((entry: any, i: number) => (
                                            <p key={i} style={{ margin: '4px 0 0', fontSize: 13, color: entry.color, fontWeight: 600 }}>
                                                {`Flow Rate: ${Math.max(0, entry.value).toFixed(2)} L/min`}
                                            </p>
                                        ))}
                                    </div>
                                );
                            }}
                        />

                        {chartData.some(d => d.current != null) && (
                            <Area type="monotone" dataKey="current" fill="#e0f2fe" stroke="#0ea5e9" strokeWidth={2} />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>



        </div>
    );
};

/** System Dynamics (formerly Avg Flow Rate / Peak Flow) */
const FlowKPICard = ({ avgFlow, className = "" }: { avgFlow: number; className?: string }) => {
    return (
        <div className={`apple-glass-card rounded-[2rem] p-4 flex flex-col relative overflow-hidden ${className}`}>
            {/* Header: HYDROLOGICAL LENS / System Dynamics */}
            <div className="flex justify-between items-start mb-2 h-11">
                <div className="flex flex-col justify-center h-full">
                    <h2 className="text-[17px] font-black tracking-tight text-[var(--text-primary)] m-0">FLOW RATE</h2>
                </div>
                {/* Top Right Water Drop Icon */}
                <div className="w-9 h-9 rounded-[12px] bg-white dark:bg-white/10 flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-slate-50 dark:border-white/10">
                    <svg className="fill-[#004F94] dark:fill-blue-400" width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.477 2 2 17.523 2 12c0-4.478 4.477-8 10-10 5.522 2 10 5.522 10 10 0 5.523-4.478 10-10 10zm-1.125-5.996c1.32-.4 1.838-1.536 1.838-3.085 0-.448-.363-.811-.812-.811s-.812.363-.812.81c0 .756-.168 1.53-1.076 1.805-.427.13-.672.58-.55.1 0 0 .193-.76-.023-1.312-.224-.575-.98-1.34-1.38-2.586-.135-.423-.74-.287-.698.156.096.994.499 2.146 1.344 3.256.621.815 1.373 1.48 2.169 1.667z" />
                    </svg>
                </div>
            </div>

            {/* Avg Flow Rate */}
            <div className="flex items-center gap-3 w-full overflow-hidden">
                <div className="w-8 h-8 rounded-lg bg-[#f1f5f9] flex items-center justify-center shrink-0">
                    {/* Speedometer SVG */}
                    <svg className="fill-[#004F94] dark:fill-blue-400" width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v4l3.5 3.5-1.42 1.42L11 12.5V7z" />
                    </svg>
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-widest truncate">Avg Flow Rate</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl lg:text-3xl font-black tracking-tighter text-[#004F94] leading-tight">
                            {formatMeterValue(Math.abs(avgFlow))}
                        </span>
                        <span className="text-[0.8rem] font-black tracking-tight text-[var(--text-muted)]">L/min</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

/** Alerts Card - Leak Detection, Status Pills, Thresholds */
const AlertsCard = ({ className = "" }: { flowRate: number; maxFlowRate: number; className?: string }) => {
    return (
        <div className={`apple-glass-card rounded-[2rem] p-5 flex flex-col relative overflow-hidden ${className}`}>
            {/* Header: ALERT MONITOR / Alerts */}
            <div className="flex justify-between items-start mb-2 h-11">
                <div className="flex flex-col justify-center h-full">
                    <h2 className="text-[17px] font-black tracking-tight text-[var(--text-primary)] m-0">ALERTS</h2>
                </div>
                {/* Top Right Red Exclamation Icon */}
                <div className="w-9 h-9 rounded-[12px] bg-white dark:bg-white/10 flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-slate-50 dark:border-white/10">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.139 3.564c.394-.682 1.328-.682 1.722 0l8.383 14.5c.395.683-.098 1.54-.861 1.54H3.617c-.763 0-1.256-.857-.861-1.54l8.383-14.5Z" fill="#EF4444" stroke="#B91C1C" strokeWidth="1.5" strokeLinejoin="round" />
                        <path d="M12 9v4" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
                        <circle cx="12" cy="16.5" r="1.5" fill="#FFFFFF" />
                    </svg>
                </div>
            </div>

            {/* Bottom Content: "0 Active" */}
            <div className="mt-auto flex items-center justify-between">
                {/* Active Alerts Count */}
                <div className="flex items-baseline gap-1.5">
                    <span className="text-[36px] font-black text-[var(--text-primary)] leading-none">0</span>
                    <span className="text-[16px] font-black text-[var(--text-muted)] uppercase tracking-widest">Active</span>
                </div>
            </div>
        </div>
    );
};

/** Total Flow Rate Card - with Time Filter */
const TotalFlowRateCard = ({ history, flowRate, maxFlowRate, className = "" }: { history: { date?: Date, time: string; value: number }[]; flowRate: number; maxFlowRate: number; className?: string }) => {
    const [period, setPeriod] = useState<'24H' | '1W' | '1M' | 'RANGE'>('24H');
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setHours(d.getHours() - 24);
        return d.toISOString().slice(0, 16);
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 16));

    const isNoFlow = flowRate === 0;
    const isSpike = flowRate > maxFlowRate;
    let statusLabel = "Continuous Flow";
    let dotColor = "bg-blue-500";

    if (isNoFlow) {
        statusLabel = "No Flow";
        dotColor = "bg-red-400";
    } else if (isSpike) {
        statusLabel = "Unusual Spike";
        dotColor = "bg-yellow-400";
    }

    const totalValue = useMemo(() => {
        if (history.length === 0) return 0;
        const now = new Date();
        let filtered = history;

        if (period === '24H') {
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            filtered = history.filter(h => h.date && h.date >= yesterday);
        } else if (period === '1W') {
            const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            filtered = history.filter(h => h.date && h.date >= lastWeek);
        } else if (period === '1M') {
            const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            filtered = history.filter(h => h.date && h.date >= lastMonth);
        } else if (period === 'RANGE') {
            const start = new Date(startDate);
            const end = new Date(endDate);
            filtered = history.filter(h => h.date && h.date >= start && h.date <= end);
        }

        return filtered.reduce((sum, item) => sum + item.value, 0);
    }, [history, period]);

    return (
        <div className={`apple-glass-card rounded-[2rem] p-4 flex flex-col relative overflow-hidden h-full ${className}`}>
            <div className="flex justify-between items-start mb-1 h-11">
                <div className="flex flex-col justify-center h-full">
                    <h2 className="text-[14px] font-black tracking-tight text-[var(--text-primary)] m-0 uppercase leading-tight">Total Flow Rate</h2>
                </div>
                <div className="w-8 h-8 rounded-[10px] bg-white dark:bg-white/10 flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-slate-50 dark:border-white/10">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                </div>
            </div>

            {/* Status Indicator - Placed 'a bit up' */}
            <div className="flex items-center gap-1.5 mb-1 animate-in fade-in slide-in-from-bottom-1 duration-300">
                <div className={`w-1.5 h-1.5 rounded-full ${dotColor} shadow-[0_0_8px_${dotColor === 'bg-blue-500' ? 'rgba(59,130,246,0.5)' : 'rgba(239,68,68,0.5)'}]`}></div>
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-tight">{statusLabel}</span>
            </div>

            <div className="flex items-baseline gap-1 mt-auto">
                <span className="text-2xl font-black tracking-tighter text-[#6366f1] leading-none tabular-nums truncate">
                    {formatMeterValue(totalValue)}
                </span>
                <span className="text-[0.7rem] font-black tracking-tight text-[var(--text-muted)]">L</span>
            </div>

            <div className="mt-3 flex bg-[#f8fafc]/50 p-0.5 rounded-lg border border-slate-100/30 w-fit">
                {(['24H', '1W', '1M', 'RANGE'] as const).map(p => (
                    <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`px-2 py-0.5 text-[8px] font-black tracking-tight uppercase rounded-md transition-all duration-200 ${
                            period === p ? 'bg-[#6366f1] text-white shadow-sm' : 'text-[#64748b] hover:text-[#334155]'
                        }`}
                        style={{ border: 'none' }}
                    >
                        {p}
                    </button>
                ))}
            </div>

            {/* Custom Range Selection UI (only show if RANGE is selected) */}
            {period === 'RANGE' && (
                <div className="mt-4 grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                    <div className="flex flex-col gap-1">
                        <label className="text-[7.5px] font-black uppercase text-[var(--text-muted)] ml-1 tracking-wider">From</label>
                        <input
                            type="datetime-local"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="bg-white/40 border border-slate-200/40 rounded-md px-1 py-1 text-[8px] font-bold text-[var(--text-primary)] outline-none focus:border-[#6366f1]/40 transition-all shadow-sm apple-glass"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[7.5px] font-black uppercase text-[var(--text-muted)] ml-1 tracking-wider">To</label>
                        <input
                            type="datetime-local"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="bg-white/40 border border-slate-200/40 rounded-md px-1 py-1 text-[8px] font-bold text-[var(--text-primary)] outline-none focus:border-[#6366f1]/40 transition-all shadow-sm apple-glass"
                        />
                    </div>
                </div>
            )}
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
    const [fieldFlow, setFieldFlow] = useState('field3');

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
    const deviceInfo = ('data' in (unifiedData?.info ?? {})
        ? (unifiedData!.info as any).data
        : undefined) as NodeInfoData | undefined;

    const customerConfig = (deviceInfo as any)?.customer_config || {};
    const isSuperAdmin = user?.role === 'superadmin';

    const showWaterSecurityParam    = isSuperAdmin || customerConfig.showWaterSecurity    !== false;
    const showSystemDynamicsParam   = isSuperAdmin || customerConfig.showSystemDynamics   !== false;
    const showAlertsParam           = isSuperAdmin || customerConfig.showAlerts           !== false;
    const showConsumptionPatternParam = isSuperAdmin || customerConfig.showConsumptionPattern !== false;

    const historyFeeds = (unifiedData?.history as any)?.feeds || [];
    const maxFlowRate = deviceConfig?.max_flow_rate ?? 30;

    const snapshotTs = telemetryData?.timestamp ?? null;
    const deviceLastSeen = deviceInfo?.last_seen ?? null;
    const bestTimestamp = snapshotTs ?? deviceLastSeen;
    const onlineStatus = computeOnlineStatus(bestTimestamp);

    useEffect(() => {
        // High Priority: Use fields discovered by the Smart-Scan backend
        const activeFields = (unifiedData as any)?.active_fields;
        if (activeFields) {
            if (activeFields.total_liters) setFieldTotal(activeFields.total_liters);
            if (activeFields.flow_rate) setFieldFlow(activeFields.flow_rate);
        } else if (deviceConfig) {
            // Low Priority: DB configuration fallback
            if (deviceConfig.meter_reading_field) setFieldTotal(deviceConfig.meter_reading_field);
            if (deviceConfig.flow_rate_field) setFieldFlow(deviceConfig.flow_rate_field);
        }
    }, [deviceConfig, unifiedData]);


    const isConfigMissing = !deviceConfig?.thingspeak_channel_id;
    const isDataMissing = !telemetryData;
    const isOffline = onlineStatus === 'Offline';

    // ── Stale age ─────────────────────────────────────────────────────────────
    const { label: staleLabel } = useStaleDataAge(telemetryData?.timestamp ?? null);

    // ── Firestore Real-time Subscription (replaces direct ThingSpeak fetch) ──
    // The backend TelemetryWorker polls ThingSpeak every 60s, processes the data,
    // and writes to Firestore. We subscribe to that document for live updates.
    const deviceDocId = deviceInfo?.id || hardwareId;
    const deviceType = deviceConfig?.device_type || (unifiedData as any)?.config?.config?.device_type || 'flow_meter';
    const firestoreFlow = useFirestoreFlowData(deviceDocId, deviceType);

    // Derive tsMeterReading and tsCreatedAt from Firestore data
    const tsMeterReading = firestoreFlow.volume;
    const tsCreatedAt = firestoreFlow.timestamp;
    const firestoreFlowRate = firestoreFlow.flowRate;

    console.log('[FirestoreFlow] volume:', tsMeterReading, 'flowRate:', firestoreFlowRate, 'timestamp:', tsCreatedAt, 'status:', firestoreFlow.status);

    // Build a tsFeeds-compatible array from historyFeeds (backend analytics API)
    // This is used by the delta calculations and charts below
    const tsFeeds = useMemo(() => {
        if (!historyFeeds || historyFeeds.length === 0) return [];
        return historyFeeds.map((f: any) => {
            const utcTime = new Date(f.timestamp || f.created_at).getTime();
            const istTime = new Date(utcTime + (5.5 * 60 * 60 * 1000));
            const reading = f.total_liters ?? (f.raw?.[fieldTotal] ? parseFloat(f.raw[fieldTotal]) : null);
            const flowReading = f.flow_rate ?? (f.raw?.[fieldFlow] ? parseFloat(f.raw[fieldFlow]) : null);
            return { ...f, istTime, reading, flowReading };
        }).filter((f: any) => (f.reading != null && !isNaN(f.reading)) || (f.flowReading != null && !isNaN(f.flowReading)));
    }, [historyFeeds, fieldTotal, fieldFlow]);

    // Derived Offline Logic
    const { isTSOffline, tsIstLabel, tsDurationLabel } = useMemo(() => {
        if (!tsCreatedAt) return { isTSOffline: false, tsIstLabel: '', tsDurationLabel: '' };

        const lastSeenDate = new Date(tsCreatedAt);
        const now = new Date();
        const diffMs = now.getTime() - lastSeenDate.getTime();
        const diffMin = diffMs / 60000;
        const offline = diffMin > 30;

        // IST Formatting (21 Mar 2026, 14:44 IST)
        const formatOptions: Intl.DateTimeFormatOptions = {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Kolkata'
        };
        const istLabel = new Intl.DateTimeFormat('en-IN', formatOptions).format(lastSeenDate).replace(',', '') + ' IST';

        // Duration Formatting
        const hoursAgo = Math.floor(diffMin / 60);
        const durationLabel = hoursAgo > 0
            ? `Device offline · Last seen ${hoursAgo} hours ago`
            : `Device offline · Last seen ${Math.floor(diffMin)} minutes ago`;

        return { isTSOffline: offline, tsIstLabel: istLabel, tsDurationLabel: durationLabel };
    }, [tsCreatedAt]);

    const effectiveIsOffline = isOffline || isTSOffline;

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
            if (!isNaN(val)) return val;
        }
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
        return historyFeeds.map((f: any) => {
            const d = new Date(f.timestamp || f.created_at);
            const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            const rawFlow = f.flow_rate ?? parseFloat(f.raw?.[fieldFlow] as string) ?? 0;
            return { date: d, time, value: Math.max(0, rawFlow) };
        });
    }, [historyFeeds, fieldFlow]);

    // ── Delta Water Reading calculations ──────────────────────────────────────
    const meterHistory = useMemo(() => {
        return historyFeeds
            .map((f: any) => {
                const ts = new Date(f.timestamp || f.created_at).getTime();
                let reading: number;
                if (f.total_liters != null) {
                    reading = f.total_liters;
                } else {
                    const raw = parseFloat(f.raw?.[fieldTotal] as string);
                    reading = isNaN(raw) ? NaN : raw;
                }
                return { ts, reading };
            })
            .filter((e: { ts: number; reading: number }) => !isNaN(e.reading));
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
                <div className="max-w-[1400px] mx-auto flex flex-col gap-6">

                    {/* Breadcrumb + title */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <nav className="flex items-center gap-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                                <button onClick={() => navigate('/')} className="hover:text-[#0077ff] transition-colors bg-transparent border-none cursor-pointer p-0">Home</button>
                                <span className="material-icons" style={{ fontSize: '16px', color: "var(--text-muted)" }}>chevron_right</span>
                                <button onClick={() => navigate('/nodes')} className="hover:text-[#0077ff] transition-colors bg-transparent border-none cursor-pointer p-0 font-normal" style={{ color: "var(--text-muted)" }}>All Nodes</button>
                                <span className="material-icons" style={{ fontSize: '16px', color: "var(--text-muted)" }}>chevron_right</span>
                                <span className="font-bold" style={{ color: "var(--text-primary)", fontWeight: '700' }}>{deviceName}</span>
                            </nav>
                            <div className="flex items-center gap-2">
                                <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-sm border-none transition-all duration-300 text-white ${effectiveIsOffline ? 'bg-[#FF3B30]' : 'bg-[#34C759]'}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                    {effectiveIsOffline ? 'Offline' : 'Online'}
                                </div>

                                <button
                                    onClick={() => refetch()}
                                    disabled={analyticsFetching}
                                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95 border-none ${analyticsFetching ? 'bg-gray-100 dark:bg-white/10 text-gray-400 cursor-not-allowed' : 'bg-[#0077ff] hover:bg-[#0062d6] text-white'}`}
                                >
                                    <span className={`material-icons ${analyticsFetching ? 'animate-spin' : ''}`} style={{ fontSize: '14px' }}>
                                        {analyticsFetching ? 'sync' : 'refresh'}
                                    </span>
                                    {analyticsFetching ? 'Refreshing...' : 'Refresh Data'}
                                </button>

                                <button
                                    onClick={() => setShowNodeInfo(true)}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-[#AF52DE] hover:bg-[#9d44ce] text-white border-none rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                                >
                                    <Info size={12} className="stroke-[2.5px]" />
                                    Node Info
                                </button>

                                <button
                                    onClick={() => setShowParams(true)}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-[#FFB340] hover:bg-[#f5a623] text-amber-900 border-none rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                                >
                                    <Settings size={12} className="stroke-[2.5px]" />
                                    Parameters
                                </button>

                                {/* Delete Button */}
                                {user?.role === 'superadmin' && (
                                    <button
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="flex items-center gap-2 px-4 py-1.5 bg-[#FF3B30] hover:bg-[#e0352b] text-white border-none rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                                    >
                                        <span className="material-icons" style={{ fontSize: '14px' }}>delete_forever</span>
                                        Delete Node
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <h1 className="text-3xl font-black m-0" style={{ color: "var(--text-primary)", letterSpacing: '-0.5px' }}>
                                {deviceName} Flow Analytics
                            </h1>
                            {effectiveIsOffline && tsDurationLabel && (
                                <p className="text-xs font-bold text-red-500 m-0">
                                    {tsDurationLabel}
                                </p>
                            )}
                            {zoneName && (
                                <p className="text-xs text-slate-400 m-0">
                                    {zoneName}
                                </p>
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
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: effectiveIsOffline ? '#e74c3c' : '#27ae60' }}>
                                            {effectiveIsOffline ? 'Offline' : 'Online'}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-6 flex gap-3">
                                    <button
                                        className="flex-1 font-semibold py-3 rounded-2xl text-white border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                                        style={{ background: '#3A7AFE', fontSize: '14px' }}
                                        onClick={() => {
                                            const info = `Device Name: ${deviceName}\nHardware ID: ${hardwareId}\nDevice Type: EvaraFlow Monitor\nLocation: ${zoneName || 'Not specified'}\nSubscription: PRO\nStatus: ${effectiveIsOffline ? 'Offline' : 'Online'}`;
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
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch mb-6">

                        {/* LEFT COLUMN: Analog Brass Meter */}
                        <div className="lg:col-span-1 apple-glass-card rounded-[2rem] p-10 flex flex-col items-center justify-center gap-6 min-h-[460px] h-full relative overflow-hidden">

                            <div className="mt-2 mb-4" />

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
                                    <div className="text-[2.5rem] font-black text-[var(--text-primary)] leading-none tabular-nums">
                                        {totalRaw >= 1000 ? (totalRaw / 1000).toFixed(1) : formatKPI(totalRaw)}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">
                                        {totalRaw >= 1000 ? 'KL' : 'Liters'}
                                    </div>
                                </div>
                            </div>

                            <div className="text-center mt-2 mb-4">
                                <p className="text-xs font-bold uppercase tracking-widest m-0" style={{ color: '#8E8E93' }}>Flow Rate</p>
                                <h3 className="text-[2.5rem] font-black text-[var(--text-primary)] m-0 mt-1 tabular-nums leading-none">
                                    {formatMeterValue(flowRate)}
                                    <span className="text-2xl font-medium text-slate-400 ml-1">L/min</span>
                                </h3>
                                <p className="text-xs font-medium m-0 mt-2" style={{ color: '#8E8E93' }}>
                                    {effectiveIsOffline && tsIstLabel ? `Offline (${tsIstLabel})` : staleLabel}
                                </p>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: 4-col grid top row + 1-col full bottom row */}
                        <div className="lg:col-span-2 flex flex-col gap-6 h-full">
                            {/* Top Row: Four equal-height cards */}
                            <div className="grid gap-[1rem] w-full" style={{ gridTemplateColumns: `repeat(${[showWaterSecurityParam, showSystemDynamicsParam, showAlertsParam, true].filter(Boolean).length}, 1fr)` }}>
                                {/* Water Security Monitoring */}
                                {showWaterSecurityParam && (
                                    <div className="apple-glass-card rounded-[2rem] p-4 flex flex-col relative overflow-hidden h-full w-full min-h-[160px] max-h-[45vh]">
                                        {/* Header */}
                                        <div className="flex items-start justify-between mb-4 h-11">
                                            <div className="flex flex-col justify-center h-full">
                                                <h2 className="text-[17px] font-black tracking-tight text-[var(--text-primary)] m-0">WATER USAGE</h2>
                                                {isSuperAdmin && customerConfig.showWaterSecurity === false && (
                                                    <span className="text-[9px] font-bold bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full uppercase w-fit mt-1">HIDDEN FROM CUSTOMER</span>
                                                )}
                                            </div>
                                            {/* Top Right Box Icon */}
                                            <div className="w-9 h-9 rounded-[12px] bg-white dark:bg-white/10 flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-slate-50 dark:border-white/10">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="#3A7AFE"><path d="M12 2C12 2 5 10.5 5 15a7 7 0 0 0 14 0C19 10.5 12 2 12 2Z" /></svg>
                                            </div>
                                        </div>

                                        {/* KPI row: horizontal constraint to guarantee two-column layout */}
                                        <div className="flex flex-row items-end justify-between gap-4 w-full mb-auto flex-nowrap overflow-hidden">

                                            {/* LEFT: USAGE */}
                                            <div className="flex flex-col gap-1 min-w-0">
                                                <div className="flex items-center gap-1">
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="#3A7AFE"><path d="M12 2C12 2 5 10.5 5 15a7 7 0 0 0 14 0C19 10.5 12 2 12 2Z" /></svg>
                                                    <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]">USAGE</span>
                                                </div>
                                                <span className="text-[1.3rem] lg:text-[1.5rem] font-black text-[var(--text-primary)] leading-none tabular-nums truncate">
                                                    {formatMeterValue(deltaVolumeLitres > 0 ? deltaVolumeLitres : totalRaw)}
                                                    <span className="text-[0.8rem] font-black text-[#94a3b8] ml-0.5">L</span>
                                                </span>
                                            </div>

                                            {/* RIGHT: FLOW */}
                                            <div className="flex flex-col gap-1 flex-shrink-0 text-right items-end">
                                                <div className="flex items-center justify-end gap-1">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /></svg>
                                                    <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]">FLOW</span>
                                                </div>
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
                                <div className="flex-1 min-h-[420px] overflow-hidden relative">
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
