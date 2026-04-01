import { useState, useEffect, useRef, useMemo } from "react";
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

type NodeCategory =
  | 'OHT'
  | 'Sump'
  | 'Borewell'
  | 'EvaraTank'
  | 'EvaraDeep'
  | 'EvaraFlow'
  | 'GovtBorewell'
  | 'PumpHouse'
  | 'FlowMeter';
type AnalyticsType = 'EvaraTank' | 'EvaraFlow' | 'EvaraDeep';

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
    label: "Flow Meter",
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
};

const NodeCardItem = ({ node, realtimeStatuses }: { node: any, realtimeStatuses: any }) => {
  const cfg = CATEGORY_CONFIG[(node.category as NodeCategory) || "OHT"] || CATEGORY_CONFIG["OHT"];

  // DRIVER FIX: Compute status in real-time using the same logic as Analytics pages
  const realtimeSnapshot = realtimeStatuses[node.id];
  const effectiveLastSeen = realtimeSnapshot?.timestamp || realtimeSnapshot?.created_at || node.last_seen || node.last_online_at || node.updated_at || null;
  const currentStatus = computeDeviceStatus(effectiveLastSeen);
  const isOnline = currentStatus === "Online";
  const isTank = ["evaratank", "EvaraTank", "tank", "sump", "OHT", "Sump"].includes((node.category || node.asset_type || "").toString());

  const lastTel = realtimeSnapshot || node.last_telemetry || {};

  // DRIVER FIX: Use the backend's authoritative smoothed level for absolute parity. 
  // This eliminates divergence between Map, List, and Analytics.
  const pct = lastTel.level_percentage ?? getTankLevel(node, lastTel);

  const cardDynamicClasses = isOnline
    ? "apple-glass-card bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/20"
    : "apple-glass-card bg-slate-500/5 hover:bg-slate-500/10 border-slate-500/20";

  return (
    <Link
      to={getDeviceAnalyticsRoute({
        id: node.id,
        hardwareId: node.hardwareId || node.id,
        analytics_template: node.analytics_template || undefined,
        device_type: node.category || undefined,
        asset_type: node.asset_type || undefined,
      })}
      className={`group rounded-[24px] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col relative mx-auto w-full border ${cardDynamicClasses}`}
    >
      <div className="p-5 flex flex-col flex-1 relative z-10 w-full min-h-[160px] gap-[18px]">
        {/* Top: Icon + Title + Status */}
        <div className="flex items-start justify-between w-full">
          <div className="flex items-start gap-3 w-full pr-2">
            <div className="w-[46px] h-[46px] bg-white rounded-[14px] shadow-sm flex items-center justify-center shrink-0">
              {cfg.icon}
            </div>
            <div className="flex flex-col justify-center gap-[5px] overflow-hidden pt-0.5">
              <h3 className="font-[900] text-[#0066cc] text-[17px] leading-none truncate w-full">
                {node.label}
              </h3>
              <span className="w-fit bg-[#e2eaff] text-[#3451b2] text-[8.5px] font-[900] px-2.5 py-[3px] rounded-lg uppercase tracking-wider leading-none shadow-sm whitespace-nowrap">
                {cfg.label}
              </span>
            </div>
          </div>

          <span
            className={clsx(
              "flex items-center gap-1.5 text-[10px] font-[900] uppercase tracking-wider px-2.5 py-1.5 rounded-[10px] shadow-sm min-w-max shrink-0 ml-1",
              isOnline ? "bg-[#eafdec] text-[#008f39] border border-[#d1ebd4]" : "bg-[#fdeded] text-red-600 border border-[#fad1d1]",
            )}
          >
            <span
              className={clsx(
                "w-1.5 h-1.5 rounded-full",
                isOnline ? "bg-[#008f39]" : "bg-red-500"
              )}
            />
            {currentStatus}
          </span>
        </div>

        {/* Middle: Progress / Data */}
        {isTank ? (
          <div className="flex flex-col justify-center flex-1 px-1 mt-2">
            <div className="flex justify-between items-end mb-[10px]">
              <span className="text-[11.5px] font-[900] text-[#6b8a70] uppercase tracking-wider">Water Level</span>
              <span className="text-[22px] font-[900] text-[#1e3a24] leading-none tracking-tight">{pct.toFixed(1)}%</span>
            </div>
            <div className="h-[9px] bg-[#d0eac8] rounded-full overflow-hidden flex relative shadow-inner">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out relative shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1)]"
                style={{
                  width: `${Math.min(100, Math.max(5, pct))}%`,
                  background: pct > 20 ? "linear-gradient(90deg, #22c55e 0%, #4ade80 100%)" : "linear-gradient(90deg, #f87171 0%, #ef4444 100%)",
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1"></div>
        )}

        {/* Bottom: Location + Capacity */}
        <div className="mt-auto flex items-center justify-between pt-3 px-1">
          <div className="flex items-center gap-1.5 text-[12px] font-[800] text-[#789682] truncate pr-2">
            <MapPin size={14} className="shrink-0 text-[#83a48e]" />
            <span className="truncate uppercase text-[#719379]">{node.location_name || "Unknown"}</span>
          </div>
          <span className="text-[11.5px] font-[900] text-[#5e6e82] bg-white/70 px-2.5 py-1 rounded-[8px] border border-white/50 shadow-sm whitespace-nowrap">
            {node.capacity || "N/A"}
          </span>
        </div>
      </div>

      {/* Footer Nav Button - Glassmorphic */}
      <div
        className="relative overflow-hidden px-5 py-[13px] text-center text-[11.5px] font-[900] tracking-[0.15em] transition-all uppercase w-full flex items-center justify-center gap-1.5 group-hover:bg-[#002868]/70"
        style={{
          background: 'rgba(15, 48, 150, 0.7)',
          color: '#ffffff',
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

    // Consistent status calculation for filtering
    const snapshot = realtimeStatuses[n.id] || n || {};
    const effectiveLastSeen = snapshot.timestamp || snapshot.created_at || n.last_seen || n.last_online_at || n.updated_at || null;
    const currentStatus = computeDeviceStatus(effectiveLastSeen);
    const matchStatus = statusFilter === "all" || currentStatus === statusFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      n.label.toLowerCase().includes(q) ||
      (n.location_name || "").toLowerCase().includes(q) ||
      n.node_key.toLowerCase().includes(q);
    return matchAnalytics && matchStatus && matchSearch;
  }), [nodes, analyticsFilter, statusFilter, search]);

  const { onlineCount, offlineCount } = useMemo(() => {
    const statuses = nodes.map(n => {
      const snap = realtimeStatuses[n.id];
      const ts = snap?.timestamp || snap?.created_at || n.last_seen || n.last_online_at || n.updated_at || null;
      return computeDeviceStatus(ts);
    });
    const online = statuses.filter(s => s === "Online").length;
    const offline = statuses.filter(s => s === "Offline").length;
    return { onlineCount: online, offlineCount: offline };
  }, [nodes, realtimeStatuses]);

  return (
    <div className="min-h-screen bg-transparent relative flex flex-col pt-[85px] lg:pt-[95px]">
      {/* SVG Noise Overlay */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      ></div>

      {/* ── Top Header Bar ── */}
      <div className="px-8 pt-3 pb-2 relative z-10">
        <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-[800] tracking-tight text-[#004ba0] leading-none mb-1.5">
              All Nodes
            </h1>
            {loading ? (
              <p className="text-[11px] text-blue-500 font-bold uppercase tracking-[0.15em] opacity-80">
                Loading infrastructure...
              </p>
            ) : (
              <p className="text-[11px] text-blue-500 font-bold uppercase tracking-[0.15em] opacity-80">
                {nodes.length} TOTAL ASSETS DEPLOYED — REAL-TIME NETWORK
              </p>
            )}
          </div>

          {/* Stats */}
          {!loading && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-white/40 backdrop-blur-md border border-white/60 px-3 py-1.5 rounded-full shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-[11px] font-[800] text-green-700 uppercase tracking-tight">
                  {onlineCount} Online
                </span>
              </div>
              <div className="flex items-center gap-2 bg-white/40 backdrop-blur-md border border-white/60 px-3 py-1.5 rounded-full shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                <span className="text-[11px] font-[800] text-red-700 uppercase tracking-tight">
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
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-400 group-focus-within:text-blue-600 transition-colors"
              size={16}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets…"
              className="w-full pl-10 pr-4 py-2.5 bg-white/40 backdrop-blur-xl border border-white/60 rounded-[18px] text-[13px] font-[500] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400/50 transition-all shadow-sm placeholder:text-slate-400"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 bg-white/60 backdrop-blur-xl border border-white/80 rounded-[16px] p-1 shadow-sm">
            <div className="px-2.5 text-slate-400">
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
                      ? "btn-liquid-glass btn-liquid-glass-green"
                      : s === "Offline"
                        ? "btn-liquid-glass btn-liquid-glass-red"
                        : "btn-liquid-glass btn-liquid-glass-slate"
                    : "text-slate-500 hover:bg-white/40",
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
                ? "btn-liquid-glass btn-liquid-glass-slate"
                : "bg-white/60 backdrop-blur-xl text-slate-600 border-white/80 hover:border-white hover:bg-white/80 shadow-sm",
            )}
          >
            All Nodes
            <span
              className={clsx(
                "text-[10px] font-[900] px-1.5 py-0.5 rounded-full",
                analyticsFilter === "all"
                  ? "bg-white/20 text-white"
                  : "bg-blue-100 text-[#004ba0]",
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
                    ? `btn-liquid-glass ${liquidColorClass}`
                    : "bg-white/60 backdrop-blur-xl text-slate-600 border-white/80 hover:border-white hover:bg-white/80",
                )}
              >
                <span className={active ? "text-white/90" : "text-slate-400"}>
                  {cfg.icon}
                </span>
                <span>{cfg.label}</span>
                <span
                  className={clsx(
                    "text-[10px] font-[900] px-1.5 py-0.5 rounded-full",
                    active
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 text-slate-500",
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 w-full max-w-7xl">
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
