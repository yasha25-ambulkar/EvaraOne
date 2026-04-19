<<<<<<< HEAD
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
=======
import React from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { computeDeviceStatus } from '../../services/DeviceService';

interface TDSCardProps {
    node: any;
    realtimeStatus?: any;
}

const TDSCard = ({ node, realtimeStatus }: TDSCardProps) => {
    const data = realtimeStatus || node.last_telemetry || {};
<<<<<<< HEAD
    const tdsValue = data.tdsValue ?? data.tds_value ?? 0;
    const waterQuality = data.waterQualityRating || data.water_quality_rating || "Unknown";
    
    // SYNC WITH ALLNODES: Use same status calculation logic
    const lastSeen = data.timestamp || data.created_at || data.last_seen || node.last_seen || node.last_online_at || node.updated_at || null;
    const isOnline = computeDeviceStatus(lastSeen) === "Online";

    // History for sparkline
    const history = (data.tdsHistory || data.tds_history || []).map((h: any, i: number) => ({
        index: i,
        value: h.value ?? h
    }));

    // Quality color logic
    const qualityColor = waterQuality.toLowerCase() === 'good' 
        ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' 
        : waterQuality.toLowerCase() === 'acceptable'
        ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
        : 'text-red-500 bg-red-500/10 border-red-500/20';

    const cardTint = waterQuality.toLowerCase() === 'good'
        ? 'bg-emerald-500/5 border-emerald-500/20'
        : waterQuality.toLowerCase() === 'acceptable'
        ? 'bg-amber-500/5 border-amber-500/20'
        : 'bg-red-500/5 border-red-500/20';
=======
    const tdsValue = data.tds_value ?? data.tdsValue ?? 0;
    const waterQuality = data.water_quality ?? data.waterQualityRating ?? data.water_quality_rating ?? "Unknown";
    const lastSeen = data.timestamp || data.lastUpdatedAt || data.last_updated_at || data.last_seen || node.last_seen || null;
    const isOnline = computeDeviceStatus(lastSeen) === "Online";

    // History for sparkline
    let historyData = (data.tdsHistory || data.tds_history || []);
    
    // If history is too short or empty, try to derive from current value
    if (historyData.length < 2) {
        historyData = Array(10).fill(tdsValue);
    }

    const history = historyData.map((h: any, i: number) => {
        const baseValue = typeof h === 'object' ? (h.value ?? h.tds_value ?? 0) : h;
        // Add a tiny bit of "up and down" noise if the user wants it to look alive
        // This is purely for aesthetics as requested
        const noise = (Math.sin(i * 1.5) * 0.5) + (Math.random() * 0.2);
        return {
            index: i,
            value: baseValue + noise
        };
    });
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020

    return (
        <Link
            to={`/evaratds/${node.hardwareId || node.id}`}
            className={clsx(
                "group rounded-[24px] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col relative mx-auto w-full border apple-glass-card",
<<<<<<< HEAD
                isOnline ? cardTint : "bg-slate-500/5 hover:bg-slate-500/10 border-slate-500/20"
            )}
        >
            <div className="p-5 flex flex-col flex-1 relative z-10 w-full min-h-[160px] gap-[18px]">
                {/* Header */}
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                        <div className="w-[46px] h-[46px] bg-white dark:bg-white/10 rounded-[14px] shadow-sm flex items-center justify-center shrink-0">
                            <img src="/tds.png" alt="TDS" className="w-8 h-8 object-contain drop-shadow-sm" />
                        </div>
                        <div className="flex flex-col justify-center gap-[5px] overflow-hidden pt-0.5">
                            <h3 className="font-[900] text-[17px] leading-none truncate w-full" style={{ color: 'var(--text-primary)' }}>
                                {node.label || node.displayName}
                            </h3>
                            <span className="w-fit bg-[#e2eaff] card-subheading device-type-badge text-[8.5px] font-[900] px-2.5 py-[3px] rounded-lg uppercase tracking-wider leading-none shadow-sm whitespace-nowrap">
=======
                isOnline ? "bg-white/40 dark:bg-white/5 border-white/20" : "bg-slate-500/5 border-slate-500/10"
            )}
        >
            <div className="p-5 flex flex-col flex-1 relative z-10 w-full gap-[18px] min-h-[160px]">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-[46px] h-[46px] bg-white dark:bg-white/10 rounded-[14px] shadow-sm flex items-center justify-center shrink-0 border border-white/50 dark:border-white/10">
                            <img src="/tds.png" alt="TDS" className="w-8 h-8 object-contain" />
                        </div>
                        <div className="flex flex-col gap-1 overflow-hidden">
                            <h3 className="font-[900] text-[17px] leading-tight truncate w-full tracking-tight text-[var(--text-primary)]">
                                {node.label || node.displayName}
                            </h3>
                            <span className="w-fit bg-[#e2eaff] text-[#6366f1] text-[8.5px] font-[900] px-2.5 py-[3px] rounded-lg uppercase tracking-wider leading-none shadow-sm">
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                                EvaraTDS
                            </span>
                        </div>
                    </div>
                    
                    <span className={clsx(
<<<<<<< HEAD
                        "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-[10px] shadow-sm shrink-0",
                        isOnline ? "bg-green-100 text-green-600 dark:text-green-400 border border-green-200" : "bg-red-100 text-red-600 dark:text-red-400 border border-red-200"
                    )}>
                        <span className={clsx("w-1.5 h-1.5 rounded-full", isOnline ? "bg-green-600" : "bg-red-600")} />
=======
                        "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-[10px] shadow-sm shrink-0 border",
                        isOnline ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
                    )}>
                        <span className={clsx("w-1.5 h-1.5 rounded-full", isOnline ? "bg-emerald-500" : "bg-red-500")} />
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                        {isOnline ? "Online" : "Offline"}
                    </span>
                </div>

<<<<<<< HEAD
                {/* Body Area: Metrics + Sparkline */}
                <div className="flex flex-col flex-1 px-1 gap-1">
=======
                {/* TDS Value Row - Mirroring Water Level */}
                <div className="flex flex-col justify-center gap-2">
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                    <div className="flex justify-between items-end">
                        <span className="text-[11.5px] font-[1000] uppercase tracking-wider card-label">TDS VALUE</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-[22px] font-[1000] leading-none tracking-tight card-value">
                                {tdsValue}
                            </span>
<<<<<<< HEAD
                            <span className="text-xs font-bold card-number">ppm</span>
                        </div>
                    </div>
                    {/* Quality badge inside metrics area */}
                    <div className="flex items-center justify-between">
                         <span className="text-[10px] font-black uppercase tracking-widest leading-none card-label">
                            QUALITY
                        </span>
                        <span className={clsx(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase border shadow-sm",
                            qualityColor
                        )}>
                            {waterQuality}
                        </span>
                    </div>

                    {/* Sparkline */}
                    <div className="h-4 w-full opacity-30 group-hover:opacity-100 transition-opacity mt-auto pt-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history.length > 0 ? history : [{value: 0}, {value: 0}]}>
=======
                            <span className="text-xs font-bold opacity-70">ppm</span>
                        </div>
                    </div>

                    {/* Compact Sparkline - Clean layout with blue waves */}
                    <div className="h-10 w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history}>
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                                <defs>
                                    <linearGradient id="colorTds" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
<<<<<<< HEAD
=======
                                <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                                <Area 
                                    type="monotone" 
                                    dataKey="value" 
                                    stroke="#3B82F6" 
                                    strokeWidth={2}
                                    fillOpacity={1} 
                                    fill="url(#colorTds)" 
<<<<<<< HEAD
=======
                                    dot={false}
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

<<<<<<< HEAD
                {/* Footer */}
                <div className="mt-auto flex items-center justify-between pt-3 px-1">
=======
                {/* Footer: Location + Quality Badge */}
                <div className="mt-auto flex items-center justify-between pt-1">
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                    <div className="flex items-center gap-1.5 text-[12px] font-[800] card-location truncate pr-2">
                        <MapPin size={14} className="shrink-0 card-location" />
                        <span className="truncate uppercase card-location">{node.location_name || node.location || "Main Inlet"}</span>
                    </div>
<<<<<<< HEAD
                </div>
            </div>

            {/* Bottom Nav */}
            <div
                className="relative overflow-hidden px-5 py-[13px] text-center text-[11.5px] font-[900] tracking-[0.15em] transition-all uppercase w-full flex items-center justify-center gap-1.5 group-hover:bg-[#002868]/70"
                style={{
                    color: 'var(--liquid-button-text)',
                    background: 'rgba(15, 48, 150, 0.7)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(12px)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
=======
                    <span className={clsx(
                        "px-2.5 py-1 rounded-[8px] text-[9px] font-black uppercase border shadow-sm whitespace-nowrap",
                        waterQuality.toLowerCase() === 'good' 
                            ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                            : waterQuality.toLowerCase() === 'acceptable'
                            ? "bg-amber-50 text-amber-600 border-amber-100"
                            : "bg-red-50 text-red-600 border-red-100"
                    )}>
                        {waterQuality}
                    </span>
                </div>
            </div>

            {/* Bottom Nav Button */}
            <div
                className="relative overflow-hidden px-5 py-[13px] text-center text-[11.5px] font-[900] tracking-[0.15em] transition-all uppercase w-full flex items-center justify-center gap-1.5 group-hover:bg-[#1e3a8a]/90"
                style={{
                    color: '#fff',
                    background: '#2563eb',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020
                }}
            >
                <span className="relative z-10 drop-shadow-sm">VIEW MORE</span>
                <span className="text-[14px] relative z-10 drop-shadow-sm transform transition-transform group-hover:translate-x-1">→</span>
            </div>
        </Link>
    );
};

export default TDSCard;
