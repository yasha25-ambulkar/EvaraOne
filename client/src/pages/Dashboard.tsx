import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAllNodes, subscribeToNodes } from "../services/nodeService";
import { adminService } from "../services/admin";
import { socket } from "../services/api";
import { computeOnlineStatus } from "../utils/telemetryPipeline";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import clsx from "clsx";

// Operational Components
import KPIAuthoritativeCard from "../components/dashboard/KPIAuthoritativeCard";
import ProductPieChart from "../components/dashboard/ProductPieChart";
import AlertsActivityPanel from "../components/dashboard/AlertsActivityPanel";
import NodeDataExplorer from "../components/dashboard/NodeDataExplorer";
import SharedMap from "../components/map/SharedMap";
import ErrorBoundary from "../components/ErrorBoundary";

/**
 * KPI Unit for simple metric display
 */
const KPIUnitCard = ({
  label,
  value,
  trend,
  trendLabel,
  variant = "default",
}: any) => (
  <div className="apple-glass-card p-[20px] rounded-[20px] flex-1 flex flex-col justify-center shadow-sm">
    <span className="text-[12px] font-[800] text-[#1f2937]/70 uppercase tracking-[0.1em] mb-2">
      {label}
    </span>
    <div className="flex items-baseline gap-2">
      <h2
        className={clsx(
          "text-[26px] font-[800] leading-none tracking-tight",
          variant === "alert" ? "text-red-600" : "text-[#004ba0]",
        )}
      >
        {value}
      </h2>
      {trend !== undefined && (
        <span className="text-[10px] font-bold text-gray-400 uppercase">
          {trend} {trendLabel}
        </span>
      )}
    </div>
  </div>
);

function Dashboard() {
  const queryClient = useQueryClient();

  // Fetch real nodes from Firestore
  const { data: nodes = [] } = useQuery<any[]>({
    queryKey: ["real_nodes"],
    queryFn: getAllNodes,
    staleTime: 1000 * 60 * 5,
  });

  const [realtimeStatuses, setRealtimeStatuses] = useState<Record<string, "Online" | "Offline">>({});

  // SaaS Architecture: Real-time Status Sync
  useEffect(() => {
    const handleUpdate = (data: any) => {
        const id = data.device_id || data.node_id;
        if (!id) return;
        const status = computeOnlineStatus(data.timestamp || data.created_at || data.last_seen, id);
        setRealtimeStatuses(prev => ({ ...prev, [id]: status }));
    };
    socket.on("telemetry_update", handleUpdate);
    return () => { socket.off("telemetry_update", handleUpdate); };
  }, []);

  // Real-time listener for nodes
  useEffect(() => {
    const unsubscribe = subscribeToNodes((updatedNodes) => {
      queryClient.setQueryData(["real_nodes"], updatedNodes);
    });
    return () => unsubscribe();
  }, [queryClient]);

  // Live calculations from real data — memoized to avoid recomputation
  const { totalDevices, onlineDevices, offlineDevices, tankNodes, flowNodes, deepNodes } = useMemo(() => {
    const total = nodes.length;
    const online = nodes.filter(
      (n) => (realtimeStatuses[n.id] || n.status) === "Online",
    ).length;
    const tank = nodes.filter(
      (n) =>
        n.asset_type === "evaratank" ||
        n.asset_type === "EvaraTank" ||
        n.asset_type === "tank" ||
        n.asset_type === "sump",
    ).length;
    const flow = nodes.filter(
      (n) =>
        n.asset_type === "evaraflow" ||
        n.asset_type === "EvaraFlow" ||
        n.asset_type === "flow" ||
        n.asset_type === "flow_meter",
    ).length;
    const deep = nodes.filter(
      (n) =>
        n.asset_type === "evaradeep" ||
        n.asset_type === "EvaraDeep" ||
        n.asset_type === "bore" ||
        n.asset_type === "govt",
    ).length;
    return { totalDevices: total, onlineDevices: online, offlineDevices: total - online, tankNodes: tank, flowNodes: flow, deepNodes: deep };
  }, [nodes]);

  const { data: auditLogs = [] } = useQuery({
    queryKey: ["dashboard_audit_logs"],
    queryFn: async () => {
      const logs = await adminService.getAuditLogs();
      return logs.map((l) => ({
        id: l.id,
        device_id: l.resource_id || "SYSTEM",
        event_type: l.action_type,
        timestamp: new Date(l.created_at).toLocaleTimeString(),
        severity: (l.action_type.toLowerCase().includes("critical")
          ? "critical"
          : l.action_type.toLowerCase().includes("warn")
            ? "warning"
            : "info") as "critical" | "warning" | "info",
      }));
    },
    staleTime: 1000 * 60 * 5,
  });


  // Map real nodes to Explorer format — memoized
  const explorerNodes = useMemo(() => nodes.map((n) => {
    const isOnline = n.status === "Online";
    const nodeHardwareId = n.hardwareId || n.id;

    return {
      id: nodeHardwareId,
      firestore_id: n.firestore_id || n.id,
      name:
        n.displayName || n.name || nodeHardwareId || n.node_key || "Unknown Node",
      type: (n.asset_type === "evaratank" ||
        n.asset_type === "EvaraTank" ||
        n.asset_type === "tank" ||
        n.asset_type === "sump"
        ? "tank"
        : n.asset_type === "evaraflow" ||
          n.asset_type === "EvaraFlow" ||
          n.asset_type === "flow" ||
          n.asset_type === "flow_meter"
          ? "flow"
          : "deep") as "tank" | "flow" | "deep",
      status: n.status as "Online" | "Offline",
      isStale: !isOnline,
      lastSeen: n.last_seen || n.updatedAt || undefined,
      metrics: n.last_telemetry || {},
      location: n.location_name || n.community_name || n.zone_name || (n.communityId || n.zoneId ? "Main Site" : "General Area"),
      device: n.assetType || n.asset_type || "Sensor",
    };
  }), [nodes]);

  // Map real nodes for the SharedMap — memoized
  const mapDevices = useMemo(() => nodes.map((n) => {
    const nodeHardwareId = n.hardwareId || n.id;
    return {
      id: nodeHardwareId,
      firestore_id: n.firestore_id || n.id,
      name: n.displayName || n.name || nodeHardwareId || n.node_key || "Unknown Node",
      status: n.status as "Online" | "Offline",
      latitude: n.latitude,
      longitude: n.longitude,
      asset_type: n.assetType || n.asset_type,
      analytics_template: n.analytics_template || n.analyticsTemplate,
      device_type: n.device_type || n.category
    };
  }), [nodes]);

  const totalStale = explorerNodes.filter((n) => n.isStale).length;
  const systemStatus =
    totalStale > nodes.length * 0.2 ? "Attention" : "Optimal";

  return (
    <div className="w-full h-screen overflow-hidden bg-transparent relative flex flex-col">
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      ></div>

      <div className="flex-1 w-full px-8 pt-[110px] pb-[40px] overflow-hidden flex flex-col relative z-10 gap-[14px]">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-[36px] font-[800] tracking-tight text-[#004ba0] leading-none mb-2">
              System Dashboard
            </h1>
            <p className="text-[12px] text-blue-500 font-bold uppercase tracking-[0.2em] leading-none">
              REAL-TIME NETWORK INTELLIGENCE
            </p>
          </div>

        </header>

        <div
          className="flex-1 grid grid-cols-12 gap-[14px] min-h-0"
          style={{ gridTemplateRows: "38% minmax(0, 1fr)" }}
        >
          {/* ROW 1 */}
          <div className="col-span-3 h-full">
            <KPIAuthoritativeCard
              total={totalDevices}
              online={onlineDevices}
              offline={offlineDevices}
              className="h-full"
            />
          </div>

          <div className="col-span-3 h-full">
            <AlertsActivityPanel
              total={auditLogs.length}
              critical={
                auditLogs.filter((l) => l.severity === "critical").length
              }
              warning={auditLogs.filter((l) => l.severity === "warning").length}
              recentAlerts={auditLogs.slice(0, 3)}
              className="h-full"
            />
          </div>

          <div className="col-span-2 h-full flex flex-col gap-[14px]">
            <div className="apple-glass-card p-[20px] rounded-[20px] flex-1 flex flex-col justify-center shadow-sm">
              <span className="text-[12px] font-[800] text-[#1f2937]/70 uppercase tracking-[0.1em] mb-2">
                System Health
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    "w-3 h-3 rounded-full shadow-lg",
                    systemStatus === "Optimal"
                      ? "bg-green-500 shadow-green-500/50"
                      : "bg-amber-500 shadow-amber-500/50",
                  )}
                />
                <span className="text-[18px] font-[800] text-gray-800 leading-none">
                  {systemStatus === "Optimal" ? "100%" : "90%"}
                </span>
              </div>
            </div>
            <KPIUnitCard
              label="Active Alerts"
              value={auditLogs.length}
              trend={0}
              trendLabel="Critical"
              variant="alert"
            />
          </div>

          <div className="col-span-4 h-full relative group rounded-[24px] overflow-hidden border border-white/40 shadow-sm">
            <SharedMap
              devices={mapDevices as any}
              pipelines={[]}
              height="100%"
              showZoom={false}
              className="h-full"
            />
            <div className="absolute top-4 right-4 z-[500]">
              <Link
                to="/map"
                className="px-5 py-2 rounded-[20px] bg-white text-[11px] font-[800] text-blue-600 shadow-xl border border-white flex items-center gap-2 transition-all opacity-0 group-hover:opacity-100 uppercase tracking-widest"
              >
                Expand Map <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>

          {/* ROW 2 */}
          <div className="col-span-4 h-full">
            <ProductPieChart
              tank={tankNodes}
              flow={flowNodes}
              deep={deepNodes}
              className="h-full"
            />
          </div>

          <div className="col-span-8 h-full min-h-0">
            <NodeDataExplorer nodes={explorerNodes} className="h-full" />
          </div>
        </div>

      </div>
    </div>
  );
}

export default function DashboardWithBoundary() {
  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  );
}
