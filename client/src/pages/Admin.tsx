import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { adminService } from "../services/admin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import ErrorBoundary from "../components/ErrorBoundary";
import { AddZoneForm } from "../components/admin/forms/AddZoneForm";

import { AddCustomerForm } from "../components/admin/forms/AddCustomerForm";
import { AddDeviceForm } from "../components/admin/forms/AddDeviceForm";
import { ActionCard } from "../components/admin/ActionCard";
import {
  Users,
  User,
  Crown,
  Globe,
  FileText,
  type LucideIcon,
  PlusCircle,
  Activity,
  Map as MapIcon,
  RefreshCw,
} from "lucide-react";
import { useTenancy } from "../context/TenancyContext";
import { UsageMeter } from "../components/admin/UsageMeter";
import clsx from "clsx";



interface Customer {
  id: string;
  display_name?: string;
  full_name?: string;
}

interface Zone {
  id: string;
  name: string;
  zoneName?: string;
  customers: Customer[];
}

interface AdminStats {
  total_nodes: number;
  online_nodes: number;
  alerts_active: number;
  total_customers: number;
  total_zones: number;
  system_health: number;
}

/* ─── Widget Card Component ─── */
const Widget = ({
  icon: Icon,
  iconBg,
  title,
  summary,
  expanded,
  onClick,
  children,
}: {
  icon: LucideIcon;
  iconBg: string;
  title: string;
  summary: string;
  expanded: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <motion.div
    layout
    onClick={onClick}
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className={clsx(
      "apple-glass-card transition-all duration-500 flex flex-col cursor-pointer lg:min-h-[220px]",
      expanded
        ? "col-span-3 row-span-2 z-50 bg-white/95"
        : "col-span-1 hover:scale-[1.02]",
    )}
  >
    {expanded ? (
      <div className="p-6 flex items-center gap-4 bg-white/50 border-b border-gray-100/50 backdrop-blur-md">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
          style={{ background: iconBg }}
        >
          <Icon size={24} color="#FFF" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-black text-gray-800 tracking-tight">
            {title}
          </h3>
          <p className="text-sm text-gray-500 font-medium">{summary}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="p-2 rounded-xl bg-white/80 border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <X size={20} color="#94A3B8" />
        </button>
      </div>
    ) : (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <motion.div
          whileHover={{ rotate: 12, scale: 1.1 }}
          className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{ background: `${iconBg}15` }}
        >
          <Icon size={44} color={iconBg} />
        </motion.div>
        <div className="text-center">
          <h3 className="text-[19px] font-black text-gray-700 tracking-tight">
            {title}
          </h3>
          <p className="text-[13px] text-gray-400 mt-1.5 font-bold uppercase tracking-wide">
            {summary}
          </p>
        </div>
      </div>
    )}

    <AnimatePresence>
      {expanded && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="p-8 flex-1 overflow-auto custom-scrollbar"
        >
          <ErrorBoundary>{children}</ErrorBoundary>
        </motion.div>
      )}
    </AnimatePresence>
  </motion.div>
);

const X = ({ size, color }: { size: number; color: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const StatPill = ({
  icon,
  value,
  label,
  color,
  trend,
}: {
  icon: string;
  value: string;
  label: string;
  color: string;
  trend?: string;
}) => (
  <motion.div
    whileHover={{ y: -5 }}
    style={{
      padding: "20px 16px",
      background: "#FFF",
      borderRadius: "24px",
      border: "1px solid #E2E8F0",
      boxShadow:
        "0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span style={{ fontSize: "20px" }}>{icon}</span>
      {trend && (
        <span
          style={{
            fontSize: "10px",
            fontWeight: 800,
            color:
              trend.includes("+") ||
                trend.includes("Clear") ||
                trend.includes("Operational")
                ? "#10B981"
                : "#64748B",
            background:
              trend.includes("+") ||
                trend.includes("Clear") ||
                trend.includes("Operational")
                ? "#F0FDF4"
                : "#F8FAFC",
            padding: "2px 8px",
            borderRadius: "20px",
          }}
        >
          {trend}
        </span>
      )}
    </div>
    <div>
      <div
        style={{
          fontSize: "24px",
          fontWeight: 900,
          color: "#1E293B",
          letterSpacing: "-0.03em",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "11px",
          color: "#64748B",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
    </div>
    <div
      style={{
        height: "3px",
        width: "100%",
        background: `${color}15`,
        borderRadius: "10px",
        overflow: "hidden",
      }}
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: "100%" }}
        transition={{ duration: 1 }}
        style={{ height: "100%", background: color }}
      />
    </div>
  </motion.div>
);

const Admin = () => {
  const { user, isAuthenticated } = useAuth();
  const { selectedDistributorId, activeDistributor, distributors } =
    useTenancy();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<
    "zone" | "customer" | "node" | null
  >(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) navigate("/login", { replace: true });
  }, [isAuthenticated, navigate]);

  // Data Fetching
  const { data: hierarchy = [], isLoading: loadingHierarchy } = useQuery<
    Zone[]
  >({
    queryKey: ["admin_hierarchy", selectedDistributorId],
    queryFn: () => adminService.getHierarchy() as Promise<Zone[]>,
    enabled: isAuthenticated && user?.role === "superadmin",
  });

  const { data: stats, isLoading: loadingStats } = useQuery<AdminStats>({
    queryKey: ["admin_stats", selectedDistributorId],
    queryFn: () =>
      adminService.getStats() as Promise<AdminStats>,
    enabled: isAuthenticated,
    refetchInterval: 1000 * 60 * 5, // Refresh every 5 minutes (saves reads)
  });

  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["admin_audit_logs", selectedDistributorId],
    queryFn: () =>
      adminService.getAuditLogs(),
    enabled: isAuthenticated && user?.role === "superadmin",
  });

  const activeTab = user?.role === "superadmin" ? "Command" : "Customer";
  const tabs = [
    { name: "Command", subtitle: "Super Admin", icon: Crown, color: "#6366F1" },
    { name: "Customer", subtitle: "End User", icon: User, color: "#10B981" },
  ];
  const t = tabs.find((x) => x.name === activeTab) || tabs[2];

  const toggle = (key: string) =>
    setExpanded((prev) => (prev === key ? null : key));

  const onCreationSuccess = (type: string) => {
    setActiveForm(null);
    // Invalidate all relevant queries
    queryClient.invalidateQueries({ queryKey: ["admin_hierarchy"] });
    queryClient.invalidateQueries({ queryKey: ["admin_stats"] });
    queryClient.invalidateQueries({ queryKey: ["admin_customers"] });
    queryClient.invalidateQueries({ queryKey: ["admin_audit_logs"] });

    setNotification({
      type: "success",
      message: `${type} created successfully!`,
    });
    setTimeout(() => setNotification(null), 5000);
  };

  if (!isAuthenticated) return null;

  return (
    <div
      style={{
        height: "calc(100vh - 64px)",
        display: "flex",
        flexDirection: "column",
        padding: "24px",
        gap: "20px",
        overflow: "hidden",
        background: "#F8FAFC",
      }}
    >
      {/* Header Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          flexShrink: 0,
          background: "#FFF",
          borderRadius: "24px",
          padding: "16px 28px",
          border: "1px solid #E2E8F0",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.03)",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "14px",
            background: t.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 8px 16px ${t.color}40`,
          }}
        >
          <t.icon size={24} color="#FFF" />
        </div>
        <div style={{ flex: 1 }}>
          <h1
            style={{
              fontWeight: 900,
              fontSize: "22px",
              color: "#1E293B",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Administration
          </h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "2px",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                background: `${t.color}10`,
                color: t.color,
                padding: "2px 10px",
                borderRadius: "20px",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {t.subtitle}
            </span>
            <span
              style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 500 }}
            >
              •
            </span>
            <span
              style={{ fontSize: "12px", color: "#64748B", fontWeight: 600 }}
            >
              Real-time Governance
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => queryClient.invalidateQueries()}
            className="p-2.5 apple-glass-inner border border-slate-200 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all"
          >
            <RefreshCw
              size={18}
              className={loadingHierarchy || loadingStats ? "animate-spin" : ""}
            />
          </button>
        </div>
      </motion.div>

      {/* Dashboard Grid */}
      {/* Premium Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              position: "fixed",
              bottom: "40px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2000,
              background:
                notification.type === "success" ? "#10B981" : "#EF4444",
              color: "#FFF",
              padding: "16px 32px",
              borderRadius: "24px",
              fontWeight: 800,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              border: "2px solid rgba(255,255,255,0.2)",
            }}
          >
            <span>{notification.type === "success" ? "✅" : "⚠️"}</span>
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        style={{
          flex: 1,
          display: "grid",
          gap: "24px",
          minHeight: 0,
          gridTemplateColumns: "repeat(3, 1fr)",
          gridAutoRows: "minmax(200px, auto)",
          gridAutoFlow: "dense",
          overflow: "auto",
          paddingBottom: "30px",
          paddingRight: "12px",
        }}
      >
        {activeTab === "Command" && (
          <>
            {/* SaaS Plan Usage - Visible when a distributor is selected */}
            {activeDistributor && stats && (
              <div style={{ gridColumn: "span 3", marginBottom: "16px" }}>
                <div className="p-6 rounded-[32px] apple-glass border border-white/40 shadow-xl flex flex-col md:flex-row gap-8 items-center">
                  <div className="flex-1 w-full">
                    <UsageMeter
                      label="Device Quota"
                      current={stats.total_nodes}
                      max={activeDistributor.plan?.max_devices || 5}
                    />
                  </div>
                  <div className="hidden md:block w-px h-12 bg-slate-200/50" />
                  <div className="flex flex-col items-center md:items-start text-left">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      Current Plan
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black text-slate-800">
                        {activeDistributor.plan?.name || "Base"}
                      </span>
                      <button className="text-[11px] font-bold text-indigo-500 hover:text-indigo-600 underline">
                        View Limits
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Real-time System Overview Badges */}
            <div
              style={{
                gridColumn: "span 3",
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "16px",
                marginBottom: "8px",
              }}
            >
              <StatPill
                icon="🌍"
                value={String(stats?.total_zones || 0)}
                label="TOTAL ZONES"
                color="#6366F1"
                trend="Geographic"
              />

              <StatPill
                icon="👥"
                value={String(stats?.total_customers || 0)}
                label="TOTAL CUSTOMERS"
                color="#8B5CF6"
                trend={stats?.total_customers ? "Active" : "No users"}
              />
              <StatPill
                icon="📡"
                value={String(stats?.total_nodes || 0)}
                label="TOTAL DEVICES"
                color="#10B981"
                trend="Stable"
              />
            </div>

            {/* Quick Actions (Always Expanded) */}
            <div
              style={{
                gridColumn: "span 3",
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "16px",
                marginBottom: "8px",
              }}
            >
              <ActionCard
                color="indigo"
                icon={MapIcon}
                title="New Zone"
                description="Define geographical zone"
                onClick={() => setActiveForm("zone")}
              />

              <ActionCard
                color="purple"
                icon={Users}
                title="Register Admin"
                description="Onboard distributor"
                onClick={() => setActiveForm("customer")}
              />
              <ActionCard
                color="amber"
                icon={PlusCircle}
                title="Provision Node"
                description="Connect new hardware"
                onClick={() => setActiveForm("node")}
              />
            </div>

            {/* Hierarchy Visualizer */}
            <Widget
              icon={Globe}
              iconBg="#6366F1"
              title="Infrastructure Mapping"
              summary={`${hierarchy.length} Zones · ${hierarchy.reduce((acc, r: any) => acc + (r.customers?.length || 0), 0)} Customers`}
              expanded={expanded === "infra"}
              onClick={() => toggle("infra")}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {hierarchy.map((zone) => (
                  <div
                    key={zone.id}
                    className="p-5 rounded-3xl apple-glass-inner border border-slate-200 hover:border-indigo-300 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500" />
                        {zone.name}
                      </h3>
                      <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                        {(zone as any).customers?.length || 0} Customers
                      </span>
                    </div>
                    <div className="space-y-2">
                      {(zone as any).customers?.map((c: any) => (
                        <div
                          key={c.id}
                          className="text-xs text-slate-500 font-semibold pl-4 border-l-2 border-slate-200 flex items-center justify-between"
                        >
                          {c.display_name || c.full_name}
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400">
                            →
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Widget>

            {/* Operational Stats */}
            <Widget
              icon={Activity}
              iconBg="#10B981"
              title="System Vitality"
              summary={`${stats?.online_nodes || 0} / ${stats?.total_nodes || 0} Nodes Active`}
              expanded={expanded === "stats"}
              onClick={() => toggle("stats")}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "12px",
                }}
              >
                <StatPill
                  icon="🌍"
                  value={String(hierarchy.length)}
                  label="REACH"
                  color="#6366F1"
                />
                <StatPill
                  icon="📡"
                  value={String(stats?.total_nodes || 0)}
                  label="PROVISIONED"
                  color="#3B82F6"
                />
                <StatPill
                  icon="⚡"
                  value={`${stats?.total_nodes ? Math.round(((stats?.online_nodes || 0) / stats.total_nodes) * 100) : 0}%`}
                  label="STABILITY"
                  color="#10B981"
                />
                <StatPill
                  icon="⚠️"
                  value={String(stats?.alerts_active || 0)}
                  label="CRITICAL"
                  color="#EF4444"
                />
              </div>
            </Widget>

            {/* Governance & Multi-Tenancy */}
            <div
              style={{
                gridColumn: "span 3",
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "16px",
                marginBottom: "8px",
              }}
            >
              <div className="p-5 rounded-[28px] bg-indigo-50/50 border border-indigo-100 flex flex-col justify-center">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">
                  Active Tenants
                </span>
                <span className="text-2xl font-black text-indigo-900 leading-none">
                  {distributors.length}
                </span>
              </div>
              <div className="p-5 rounded-[28px] bg-emerald-50/50 border border-emerald-100 flex flex-col justify-center">
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">
                  Global Health
                </span>
                <span className="text-2xl font-black text-emerald-900 leading-none">
                  {stats?.system_health || 100}%
                </span>
              </div>
              <div className="p-5 rounded-[28px] bg-rose-50/50 border border-rose-100 flex flex-col justify-center">
                <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">
                  Alerts
                </span>
                <span className="text-2xl font-black text-rose-900 leading-none">
                  {stats?.alerts_active || 0}
                </span>
              </div>
            </div>

            {/* Audit Timeline */}
            <Widget
              icon={FileText}
              iconBg="#64748B"
              title="Governance Audit"
              summary="Recent security & system events"
              expanded={expanded === "audit"}
              onClick={() => toggle("audit")}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      display: "flex",
                      gap: "16px",
                      padding: "12px 0",
                      borderBottom: "1px solid #F1F5F9",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "18px",
                        padding: "8px",
                        background: "#F8FAFC",
                        borderRadius: "10px",
                      }}
                    >
                      {log.action.includes("create")
                        ? "🆕"
                        : log.action.includes("update")
                          ? "📝"
                          : "🔒"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 700,
                          color: "#334155",
                        }}
                      >
                        {log.action || log.action_type}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748B" }}>
                        {log.resource_type} •{" "}
                        <span style={{ color: "#94A3B8" }}>
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#6366F1",
                      }}
                    >
                      {log.user?.full_name ||
                        log.profiles?.full_name ||
                        "System"}
                    </div>
                  </div>
                ))}
              </div>
            </Widget>
          </>
        )}

        {activeTab === "Customer" && (
          <>
            <Widget
              icon={Users}
              iconBg="#10B981"
              title="Subscribed Nodes"
              summary="Nodes linked to your profile"
              expanded={expanded === "cust-nodes"}
              onClick={() => toggle("cust-nodes")}
            >
              <div className="p-4 text-center apple-glass-inner rounded-2xl">
                Customer nodes view...
              </div>
            </Widget>
          </>
        )}
      </div>

      {/* Creation Modals */}
      <AnimatePresence>
        {activeForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: "rgba(15, 23, 42, 0.4)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "20px",
            }}
            onClick={() => setActiveForm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "rgba(255, 255, 255, 0.95)",
                backdropFilter: "blur(20px)",
                borderRadius: "40px",
                width: "100%",
                maxWidth: "640px",
                padding: "40px",
                boxShadow: "0 60px 100px -20px rgba(15, 23, 42, 0.3)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                maxHeight: "92vh",
                overflow: "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "24px",
                }}
              >
                <h2
                  style={{
                    fontSize: "24px",
                    fontWeight: 900,
                    color: "#1E293B",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {activeForm === "zone" && "🌍 Create New Zone"}
                  {activeForm === "customer" && "👥 Add New User"}
                  {activeForm === "node" && "📡 Provision Hardware"}
                </h2>
                <button
                  onClick={() => setActiveForm(null)}
                  style={{
                    padding: "8px",
                    borderRadius: "50%",
                    background: "#F1F5F9",
                  }}
                >
                  <X size={20} color="#64748B" />
                </button>
              </div>

              {activeForm === "zone" && (
                <AddZoneForm
                  onSubmit={() => onCreationSuccess("Zone")}
                  onCancel={() => setActiveForm(null)}
                />
              )}
              {activeForm === "customer" && (
                <AddCustomerForm
                  onSubmit={() => onCreationSuccess("User")}
                  onCancel={() => setActiveForm(null)}
                />
              )}
              {activeForm === "node" && (
                <AddDeviceForm
                  onSubmit={() => onCreationSuccess("Device")}
                  onCancel={() => setActiveForm(null)}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Admin;
