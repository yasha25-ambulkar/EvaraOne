import { useState, useEffect, useRef, useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

const generateMockHistory = (seedValue: number, length: number = 8) => {
  return Array.from({ length }, (_, i) => ({
    index: i,
    value: Math.max(0, seedValue * (0.8 + Math.random() * 0.4))
  }));
};
import {
  Search,
  Filter,
  MapPin,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { useNodes } from "../hooks/useNodes";
import { useToast } from "../components/ToastProvider";
import { getDeviceAnalyticsRoute } from "../utils/deviceRouting";
import { socket } from "../services/api";
import { computeDeviceStatus } from "../services/DeviceService";
import { getTankLevel } from "../utils/telemetryPipeline";
import TDSCard from "../components/dashboard/TDSCard";

type NodeCategory =
  | 'OHT'
  | 'Sump'
  | 'Borewell'
  | 'EvaraTank'
  | 'EvaraDeep'
  | 'EvaraFlow'
  | 'GovtBorewell'
  | 'PumpHouse'
  | 'FlowMeter'
  | 'flow'
  | 'EvaraTDS';
type AnalyticsType = 'EvaraTank' | 'EvaraFlow' | 'EvaraDeep' | 'EvaraTDS';

// ─── Category config ─────────────────────────────────────────────────────────

export const CATEGORY_CONFIG: Record<
  NodeCategory,
  {
    label: string;
    icon: React.ReactNode;
    color: string;
    bg: string;
    badge: string;
    dot: string;
  }
> = {
  OHT: {
    label: "Overhead Tank",
    icon: <img src="/tank.png" className="w-8 h-8 object-contain" />,
    color: "text-blue-600",
    bg: "bg-blue-50",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
  },
  Sump: {
    label: "Sump",
    icon: <img src="/tank.png" className="w-8 h-8 object-contain" />,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
  },
  Borewell: {
    label: "Borewell",
    icon: <img src="/borewell.png" className="w-8 h-8 object-contain" />,
    color: "text-amber-600",
    bg: "bg-amber-50",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
  },
  GovtBorewell: {
    label: "Borewell (Govt)",
    icon: <img src="/borewell.png" className="w-8 h-8 object-contain" />,
    color: "text-slate-600",
    bg: "bg-slate-100",
    badge: "bg-slate-200 text-slate-700",
    dot: "bg-slate-500",
  },
  PumpHouse: {
    label: "Pump House",
    icon: <img src="/meter.png" className="w-8 h-8 object-contain" />,
    color: "text-purple-600",
    bg: "bg-purple-50",
    badge: "bg-purple-100 text-purple-700",
    dot: "bg-purple-500",
  },
  FlowMeter: {
    label: "Water Meter",
    icon: <img src="/meter.png" className="w-8 h-8 object-contain" />,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    badge: "bg-cyan-100 text-cyan-700",
    dot: "bg-cyan-500",
  },
  flow: {
    label: "Water Meter",
    icon: <img src="/meter.png" className="w-8 h-8 object-contain" />,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    badge: "bg-cyan-100 text-cyan-700",
    dot: "bg-cyan-500",
  },
  EvaraTank: {
    label: "EvaraTank",
    icon: <img src="/tank.png" className="w-8 h-8 object-contain" />,
    color: "text-blue-600",
    bg: "bg-blue-50",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
  },
  EvaraDeep: {
    label: "EvaraDeep",
    icon: <img src="/borewell.png" className="w-8 h-8 object-contain" />,
    color: "text-amber-600",
    bg: "bg-amber-50",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
  },
  EvaraFlow: {
    label: "EvaraFlow",
    icon: <img src="/meter.png" className="w-8 h-8 object-contain" />,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    badge: "bg-cyan-100 text-cyan-700",
    dot: "bg-cyan-500",
  },
  EvaraTDS: {
    label: "EvaraTDS",
    icon: <img src="/tds.png" className="w-8 h-8 object-contain drop-shadow-sm" alt="EvaraTDS" />,
    color: "text-blue-600",
    bg: "bg-blue-50",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
  },
};

const ANALYTICS_CONFIG: Record<
  AnalyticsType,
  {
    label: string;
    desc: string;
    icon: React.ReactNode;
    activeBg: string;
    activeText: string;
    activeBorder: string;
    badge: string;
    dot: string;
  }
> = {
  EvaraTank: {
    label: "EvaraTank",
    desc: "OHTs & Sumps",
    icon: <img src="/tank.png" className="w-6 h-6 object-contain" />,
    activeBg: "bg-indigo-600",
    activeText: "text-white",
    activeBorder: "border-indigo-600",
    badge: "bg-indigo-50 text-indigo-600 border border-indigo-200",
    dot: "bg-indigo-500",
  },
  EvaraDeep: {
    label: "EvaraDeep",
    desc: "Borewells",
    icon: <img src="/borewell.png" className="w-6 h-6 object-contain" />,
    activeBg: "bg-sky-600",
    activeText: "text-white",
    activeBorder: "border-sky-600",
    badge: "bg-sky-50 text-sky-700 border border-sky-200",
    dot: "bg-sky-500",
  },
  EvaraFlow: {
    label: "EvaraFlow",
    desc: "Pump Houses",
    icon: <img src="/meter.png" className="w-6 h-6 object-contain" />,
    activeBg: "bg-cyan-600",
    activeText: "text-white",
    activeBorder: "border-cyan-600",
    badge: "bg-cyan-50 text-cyan-700 border border-cyan-200",
    dot: "bg-cyan-500",
  },
  EvaraTDS: {
    label: "EvaraTDS",
    desc: "Water Quality",
    icon: <img src="/tds.png" className="w-6 h-6 object-contain" alt="EvaraTDS" />,
    activeBg: "bg-blue-600",
    activeText: "text-white",
    activeBorder: "border-blue-600",
    badge: "bg-blue-50 text-blue-700 border border-blue-200",
    dot: "bg-blue-500",
  },
};

const NodeCardItem = ({ node, realtimeStatuses }: { node: any, realtimeStatuses: any }) => {
  const cfg = CATEGORY_CONFIG[(node.category as NodeCategory) || "OHT"] || CATEGORY_CONFIG["OHT"];

  const realtimeSnapshot = realtimeStatuses[node.id];
  const base = realtimeSnapshot || node.last_telemetry || {};
  const effectiveTs = 
    base.timestamp || 
    base.lastUpdatedAt || 
    base.last_updated_at || 
    base.created_at || 
    base.last_seen || 
    node.last_seen || 
    node.last_online_at || 
    node.updated_at || 
    null;

  const currentStatus = computeDeviceStatus(effectiveTs);
  const isOnline = currentStatus === "Online";
  const isTank = ["evaratank", "EvaraTank", "tank", "sump", "OHT", "Sump"].includes((node.category || node.asset_type || "").toString());
  const isFlow = node.analytics_template === 'EvaraFlow' || (node.category || "").toString() === 'EvaraFlow' || (node.category || "").toString() === 'flow' || (node.category || "").toString() === 'FlowMeter';

  const lastTel = realtimeSnapshot || node.last_telemetry || {};

  // DRIVER FIX: Use the backend's authoritative smoothed level for absolute parity. 
  const pct = lastTel.level_percentage ?? getTankLevel(node, lastTel);

  if (node.analytics_template === 'EvaraTDS' || (node.category || node.asset_type || '').toString().toLowerCase().includes('tds')) {
    return <TDSCard node={node} realtimeStatus={realtimeSnapshot} />;
  }

  // Dynamic Card Styles - Harmonized with TDSCard
  const cardTint = "bg-[var(--card-bg)] border-[var(--card-border)]";

  return (
    <Link
      to={getDeviceAnalyticsRoute({
        id: node.id,
        hardwareId: node.hardwareId || node.id,
        analytics_template: node.analytics_template || undefined,
        device_type: node.category || undefined,
        asset_type: node.asset_type || undefined,
      })}
      className={clsx(
        "group rounded-[24px] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col relative mx-auto w-full border apple-glass-card",
        cardTint
      )}
    >
      <div className="p-5 flex flex-col flex-1 relative z-10 w-full min-h-[160px] gap-[18px]">
        {/* Top: Icon + Title + Status */}
        <div className="flex items-start justify-between w-full">
          <div className="flex items-start gap-3 w-full pr-2">
            <div className="w-[46px] h-[46px] bg-white dark:bg-white/10 rounded-[14px] shadow-sm flex items-center justify-center shrink-0">
              {cfg.icon}
            </div>
            <div className="flex flex-col justify-center gap-[5px] overflow-hidden pt-0.5">
              <h3 className="font-[900] text-[17px] leading-none truncate w-full uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {node.label}
              </h3>
              <span className="w-fit bg-[#e2eaff] card-subheading device-type-badge text-[8.5px] font-[900] px-2.5 py-[3px] rounded-lg uppercase tracking-wider leading-none shadow-sm whitespace-nowrap">
                {isFlow ? "Water Meter" : cfg.label}
              </span>
            </div>
          </div>

          <span
            className={clsx(
              "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-[10px] shadow-sm shrink-0 ml-1",
              isOnline ? "bg-green-100 text-green-600 dark:text-green-400 border border-green-200" : "bg-red-100 text-red-600 dark:text-red-400 border border-red-200"
            )}
          >
            <span
              className={clsx(
                "w-1.5 h-1.5 rounded-full",
                isOnline ? "bg-green-600" : "bg-red-600"
              )}
            />
            {currentStatus}
          </span>
        </div>

        {/* Middle: Progress / Data */}
        {isTank ? (
          <div className="flex flex-col justify-center flex-1 px-1 mt-2">
            <div className="flex justify-between items-end mb-[10px]">
              <span className="text-[11.5px] font-[1000] uppercase tracking-wider card-label">Water Level</span>
              <span className="text-[22px] font-[1000] leading-none tracking-tight card-value">{pct.toFixed(1)}%</span>
            </div>
            <div className="h-[9px] bg-[#d0eac8] dark:bg-[rgba(52,199,89,0.2)] rounded-full overflow-hidden flex relative shadow-inner">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out relative shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1)]"
                style={{
                  width: `${Math.min(100, Math.max(5, pct))}%`,
                  background: pct > 20 ? "linear-gradient(90deg, #22c55e 0%, #4ade80 100%)" : "linear-gradient(90deg, #f87171 0%, #ef4444 100%)",
                }}
              />
            </div>
          </div>
        ) : isFlow ? (
          <div className="grid grid-cols-2 gap-3 flex-1 px-1 mb-2">
            {/* Flow Rate Tile */}
            <div className="bg-[var(--glass-accent-subtle)] backdrop-blur-md rounded-[20px] p-3.5 border border-[var(--glass-accent-subtle)] flex flex-col justify-between shadow-sm min-h-[110px] relative overflow-hidden group/tile">
              <div className="flex flex-col gap-1 relative z-10">
                <span className="text-[10px] font-black uppercase tracking-widest leading-none card-label" style={{ color: 'var(--text-muted)' }}>Flow Rate</span>
              </div>
              <div className="mt-2 flex flex-col items-start relative z-10">
                <span className="text-[20px] font-black leading-none tracking-tight card-value" style={{ color: 'var(--text-primary)' }}>
                  {Math.abs(lastTel.flow_rate || 0).toFixed(2)}
                </span>
                <div className="text-[10px] font-black uppercase mt-1 tracking-wider leading-none card-number" style={{ color: 'var(--text-muted)' }}>m³/hr</div>
              </div>
              {/* Sparkline Overlay */}
              <div className="absolute inset-x-0 bottom-0 h-10 opacity-30 group-hover/tile:opacity-60 transition-opacity pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={generateMockHistory(lastTel.flow_rate || 10)}>
                    <defs>
                      <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#06b6d4" 
                      strokeWidth={1.5}
                      fillOpacity={1} 
                      fill="url(#colorFlow)" 
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Total Tile */}
            <div className="bg-[var(--glass-accent-subtle)] backdrop-blur-md rounded-[20px] p-3.5 border border-[var(--glass-accent-subtle)] flex flex-col justify-between shadow-sm min-h-[110px] relative overflow-hidden group/tile">
              <div className="flex flex-col gap-1 relative z-10">
                <span className="text-[10px] font-black uppercase tracking-widest leading-none card-label" style={{ color: 'var(--text-muted)' }}>Total</span>
              </div>
              <div className="mt-2 flex flex-col items-start relative z-10">
                <span className="text-[20px] font-black leading-none tracking-tight card-value" style={{ color: 'var(--text-primary)' }}>
                  {Math.round(lastTel.total_liters || 0)}
                </span>
                <div className="text-[10px] font-black uppercase mt-1 tracking-wider leading-none card-number" style={{ color: 'var(--text-muted)' }}>liters</div>
              </div>
              {/* Sparkline Overlay */}
              <div className="absolute inset-x-0 bottom-0 h-10 opacity-30 group-hover/tile:opacity-60 transition-opacity pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={generateMockHistory(20, 10)}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#3b82f6" 
                      strokeWidth={1.5}
                      fillOpacity={1} 
                      fill="url(#colorTotal)" 
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 mt-2"></div>
        )}

        {/* Bottom Metadata (Only for Tanks/Generic) */}
        {!isFlow && (
          <div className="mt-auto flex items-center justify-between pt-3 px-1">
            <div className="flex items-center gap-1.5 text-[12px] font-[800] card-location truncate pr-2">
              <MapPin size={14} className="shrink-0 card-location" />
              <span className="truncate uppercase card-location">{node.location_name || "Unknown"}</span>
            </div>
            <span className="text-[11.5px] font-[1000] card-number bg-white/70 dark:bg-white/5 px-2.5 py-1 rounded-[8px] border border-blue-200 dark:border-white/10 shadow-sm whitespace-nowrap">
              {node.capacity || "N/A"}
            </span>
          </div>
        )}

        {/* Location for Flow Devices (Same as TDS) */}
        {isFlow && (
          <div className="mt-auto flex items-center justify-between pt-1 px-1">
            <div className="flex items-center gap-1.5 text-[12px] font-[800] card-location truncate pr-2">
              <MapPin size={14} className="shrink-0 card-location" />
              <span className="truncate uppercase card-location">{node.zoneName || "IIITH"}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Nav Button - Harmonized with TDSCard */}
      <div
        className="relative overflow-hidden px-5 py-[13px] text-center text-[11.5px] font-[900] tracking-[0.15em] transition-all uppercase w-full flex items-center justify-center gap-1.5 group-hover:bg-[#002868]/70"
        style={{
          color: 'var(--liquid-button-text)',
          background: 'rgba(15, 48, 150, 0.7)',
          borderTop: '1px solid rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(12px)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}
      >
        <span className="relative z-10 drop-shadow-sm">VIEW MORE</span>
        <span className="text-[14px] relative z-10 drop-shadow-sm transform transition-transform group-hover:translate-x-1">→</span>
      </div>
    </Link>
  );
};


// ─── Component ───────────────────────────────────────────────────────────────

const AllNodes = () => {
  const [search, setSearch] = useState("");
  const [analyticsFilter, setAnalyticsFilter] = useState<AnalyticsType | "all">(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState<
    "all" | "Online" | "Offline"
  >("all");

  const { showToast } = useToast();
  const { nodes, loading, error } = useNodes();

  // Track shown errors to prevent notification spam
  const shownErrorsRef = useRef<Set<string>>(new Set());
  const [realtimeStatuses, setRealtimeStatuses] = useState<Record<string, any>>({});

  // SaaS Architecture: Real-time Telemetry Sync for ALL devices
  useEffect(() => {
    const handleUpdate = (data: any) => {
      const id = data.device_id || data.node_id;
      if (!id) return;
      setRealtimeStatuses(prev => ({ ...prev, [id]: data }));
    };
    // Listen to both targeted room events AND global broadcast
    socket.on("telemetry_update", handleUpdate);
    socket.on("telemetry_broadcast", handleUpdate);
    return () => {
      socket.off("telemetry_update", handleUpdate);
      socket.off("telemetry_broadcast", handleUpdate);
    };
  }, []);

  // Show toast notification ONCE per unique error - prevents flooding
  useEffect(() => {
    if (error && !shownErrorsRef.current.has(error)) {
      shownErrorsRef.current.add(error);
      showToast(`Unable to fetch nodes: ${error}`, "error");
    }
  }, [error, showToast]);

  const filtered = useMemo(() => nodes.filter((n) => {
    const matchAnalytics =
      analyticsFilter === "all" || n.analytics_template === analyticsFilter;

    // UNIVERSAL STATUS RESOLUTION: Matches TDSCard.tsx and mapNodeData.
    // Prioritize socket snapshot → then node last_telemetry → then node direct fields.
    const snap = realtimeStatuses[n.id];
    const base = snap || n.last_telemetry || {};
    const effectiveTs = 
      base.timestamp || 
      base.lastUpdatedAt || 
      base.last_updated_at || 
      base.created_at || 
      base.last_seen || 
      n.last_seen || 
      n.last_online_at || 
      null;

    const currentStatus = computeDeviceStatus(effectiveTs);

    const matchStatus = statusFilter === "all" || currentStatus === statusFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      n.label.toLowerCase().includes(q) ||
      (n.location_name || "").toLowerCase().includes(q) ||
      n.node_key.toLowerCase().includes(q);
    return matchAnalytics && matchStatus && matchSearch;
  }), [nodes, analyticsFilter, statusFilter, search, realtimeStatuses]);

  const { onlineCount, offlineCount } = useMemo(() => {
    const statuses = nodes.map(n => {
      const snap = realtimeStatuses[n.id];
      const base = snap || n.last_telemetry || {};
      const effectiveTs = 
        base.timestamp || 
        base.lastUpdatedAt || 
        base.last_updated_at || 
        base.created_at || 
        base.last_seen || 
        n.last_seen || 
        n.last_online_at || 
        null;

      return computeDeviceStatus(effectiveTs);
    });
    const online = statuses.filter(s => s === "Online").length;
    const offline = statuses.filter(s => s === "Offline").length;
    return { onlineCount: online, offlineCount: offline };
  }, [nodes, realtimeStatuses]);

  return (
    <div className="min-h-screen bg-transparent relative flex flex-col pt-[85px] lg:pt-[95px]">

      {/* ── Top Header Bar ── */}
      <div className="px-8 pt-3 pb-2 relative z-10">
        <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-[900] tracking-tight leading-none mb-1.5" style={{ color: 'var(--dashboard-heading)' }}>
              All Nodes
            </h1>
            {loading ? (
              <p className="text-[11px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-[0.15em]">
                Loading infrastructure...
              </p>
            ) : (
              <p className="text-[11px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-[0.15em]">
                {nodes.length} TOTAL ASSETS DEPLOYED — REAL-TIME NETWORK
              </p>
            )}
          </div>

          {/* Stats */}
          {!loading && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 backdrop-blur-md badge-online px-3 py-1.5 rounded-full shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full badge-online-dot animate-pulse"></span>
                <span className="text-[11px] font-[800] uppercase tracking-tight">
                  {onlineCount} Online
                </span>
              </div>
              <div className="flex items-center gap-2 backdrop-blur-md badge-offline px-3 py-1.5 rounded-full shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full badge-offline-dot"></span>
                <span className="text-[11px] font-[800] uppercase tracking-tight">
                  {offlineCount} Offline
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-8 pb-4 pt-1 space-y-6 relative z-10 w-full">
        {/* ── Search + Status filter ── */}
        <div className="flex flex-col lg:flex-row items-center justify-start gap-4 w-full">
          <div className="relative w-full max-w-md group">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets…"
              className="w-full pl-12 pr-4 py-2.5 bg-white/40 dark:bg-white/5 backdrop-blur-xl border border-blue-200 dark:border-white/10 rounded-[18px] text-[13px] font-[500] text-blue-950 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400/50 transition-all shadow-sm placeholder:text-blue-400"
            />
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 group-focus-within:text-blue-600 transition-colors pointer-events-none z-10"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-600 transition-colors z-10"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-blue-200 dark:border-white/10 rounded-[16px] p-1 shadow-sm">
            <div className="px-2.5 text-blue-400">
              <Filter size={14} />
            </div>
            {(["all", "Online", "Offline"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={clsx(
                  "px-3.5 py-1.5 rounded-[12px] text-[10px] font-[800] transition-all uppercase tracking-tight",
                  statusFilter === s
                    ? s === "Online"
                      ? "btn-liquid-glass btn-liquid-glass-green node-label"
                      : s === "Offline"
                        ? "btn-liquid-glass btn-liquid-glass-red node-label"
                        : "bg-blue-500 node-label shadow-md"
                    : "text-blue-950 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-white/10",
                )}
              >
                {s === "all" ? "All Assets" : s}
              </button>
            ))}
          </div>
        </div>

        {/* ── Analytics Type Tabs ── */}
        <div className="flex flex-wrap items-center justify-start gap-3">
          {/* All tab */}
          <button
            onClick={() => setAnalyticsFilter("all")}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 rounded-[15px] text-[11px] font-[800] border transition-all uppercase tracking-tight",
              analyticsFilter === "all"
                ? "bg-blue-500/10 border-blue-500/30 text-blue-950 dark:text-white"
                : "bg-white/60 dark:bg-white/5 backdrop-blur-xl text-blue-900 dark:text-white border-white/80 dark:border-white/10 hover:border-white hover:bg-white/80 shadow-sm font-black",
            )}
          >
            <span className={clsx(analyticsFilter === "all" ? "node-label" : "text-blue-950 dark:text-white")}>
              All Nodes
            </span>
            <span
              className={clsx(
                "text-[10px] font-[900] px-1.5 py-0.5 rounded-full",
                analyticsFilter === "all"
                  ? "bg-white/20 text-blue-950"
                  : "bg-blue-100 text-blue-950",
              )}
            >
              {nodes.length}
            </span>
          </button>

          {/* EvaraTank / EvaraDeep / EvaraFlow tabs */}
          {(Object.keys(ANALYTICS_CONFIG) as AnalyticsType[]).map((key) => {
            const cfg = ANALYTICS_CONFIG[key];
            const count = nodes.filter(
              (n) => n.analytics_template === key,
            ).length;
            const active = analyticsFilter === key;

            // Map template to liquid glass color
            const liquidColorClass =
              key === "EvaraTank"
                ? "btn-liquid-glass-indigo"
                : key === "EvaraDeep"
                  ? "btn-liquid-glass-sky"
                  : "btn-liquid-glass-cyan";

            return (
                <button
                key={key}
                onClick={() => setAnalyticsFilter(key)}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2.5 rounded-[15px] text-[11px] font-[800] border transition-all uppercase tracking-tight shadow-sm",
                  active
                    ? `btn-liquid-glass ${liquidColorClass} text-blue-950 dark:text-white`
                    : "bg-white/60 dark:bg-white/5 backdrop-blur-xl text-blue-950 dark:text-white border-white/80 dark:border-white/10 hover:border-white hover:bg-white/80 font-black shadow-sm",
                )}
              >
                <span className={active ? "text-black" : "text-blue-950"}>
                  {cfg.icon}
                </span>
                <span className="node-label">{cfg.label}</span>
                <span
                  className={clsx(
                    "text-[10px] font-[900] px-1.5 py-0.5 rounded-full",
                    active
                      ? "bg-white/20 text-blue-950"
                      : "bg-blue-100 text-blue-950",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>


        {/* ── Grid ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-slate-500 font-bold mt-4 uppercase tracking-widest text-[12px]">
              Processing Network Nodes...
            </p>
          </div>
        ) : filtered.length > 0 ? (
          <div data-tour="nodes-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 w-full max-w-7xl">
            {filtered.map((node) => (
              <NodeCardItem key={node.node_key || node.id} node={node} realtimeStatuses={realtimeStatuses} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <Search size={28} className="text-slate-300" />
            </div>
            <h3 className="text-slate-600 font-semibold mb-1">
              No nodes found
            </h3>
            <p className="text-slate-400 text-sm">
              Try adjusting your search or filter
            </p>
            <button
              onClick={() => {
                setSearch("");
                setAnalyticsFilter("all");
                setStatusFilter("all");
              }}
              className="mt-4 text-sm text-blue-600 font-semibold hover:underline"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AllNodes;
