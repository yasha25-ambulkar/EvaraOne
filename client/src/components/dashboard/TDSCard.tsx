import React from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
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
return (
        <Link
            to={`/evaratds/${node.hardwareId || node.id}`}
            className={clsx(
                "group rounded-[24px] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col relative mx-auto w-full border apple-glass-card",
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
EvaraTDS
                            </span>
                        </div>
                    </div>
                    
                    <span className={clsx(
"flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-[10px] shadow-sm shrink-0 border",
                        isOnline ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
                    )}>
                        <span className={clsx("w-1.5 h-1.5 rounded-full", isOnline ? "bg-emerald-500" : "bg-red-500")} />
{isOnline ? "Online" : "Offline"}
                    </span>
                </div>

{/* TDS Value Row - Mirroring Water Level */}
                <div className="flex flex-col justify-center gap-2">
<div className="flex justify-between items-end">
                        <span className="text-[11.5px] font-[1000] uppercase tracking-wider card-label">TDS VALUE</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-[22px] font-[1000] leading-none tracking-tight card-value">
                                {tdsValue}
                            </span>
<span className="text-xs font-bold opacity-70">ppm</span>
                        </div>
                    </div>

                    {/* Compact Sparkline - Clean layout with blue waves */}
                    <div className="h-10 w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history}>
<defs>
                                    <linearGradient id="colorTds" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
<YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
<Area 
                                    type="monotone" 
                                    dataKey="value" 
                                    stroke="#3B82F6" 
                                    strokeWidth={2}
                                    fillOpacity={1} 
                                    fill="url(#colorTds)" 
dot={false}
isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

{/* Footer: Location + Quality Badge */}
                <div className="mt-auto flex items-center justify-between pt-1">
<div className="flex items-center gap-1.5 text-[12px] font-[800] card-location truncate pr-2">
                        <MapPin size={14} className="shrink-0 card-location" />
                        <span className="truncate uppercase card-location">{node.location_name || node.location || "Main Inlet"}</span>
                    </div>
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
}}
            >
                <span className="relative z-10 drop-shadow-sm">VIEW MORE</span>
                <span className="text-[14px] relative z-10 drop-shadow-sm transform transition-transform group-hover:translate-x-1">→</span>
            </div>
        </Link>
    );
};

export default TDSCard;
