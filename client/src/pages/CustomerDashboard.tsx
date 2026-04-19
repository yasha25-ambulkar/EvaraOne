import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNodes } from '../hooks/useNodes';
import ErrorBoundary from '../components/ErrorBoundary';
import DeviceCard from '../components/dashboard/DeviceCard';
import ConsumptionTrendChart from '../components/dashboard/ConsumptionTrendChart';
import ReportsDownloader from '../components/dashboard/ReportsDownloader';

// ── Stat Card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  accentRgb: string;
}

function StatCard({ label, value, sub, icon, accentRgb }: StatCardProps) {
  return (
    <div
      className="apple-glass-card rounded-[18px] p-4 flex flex-col justify-between relative overflow-hidden transition-all group hover:scale-[1.02] hover:shadow-lg h-full min-h-[105px]"
    >
      <div className="flex justify-between items-start mb-2 relative z-10">
        <span
          className="text-[14px] font-[800] uppercase tracking-tight text-[var(--dashboard-heading)]"
        >
          {label}
        </span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all group-hover:scale-110"
          style={{ 
            backgroundColor: `rgba(${accentRgb}, 0.15)`,
            color: `rgba(${accentRgb}, 1)` 
          }}
        >
          {icon}
        </div>
      </div>
      <div className="relative z-10">
        <p className="text-[32px] font-[800] leading-none mb-1" style={{ color: `rgba(${accentRgb}, 1)` }}>
          {value}
        </p>
        {sub && (
          <p className="text-[10px] font-[700] uppercase tracking-wide" style={{ color: `rgba(${accentRgb}, 0.8)` }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const DevicesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const OnlineIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
  </svg>
);

const AlertIconSvg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12" y2="17" />
  </svg>
);

const DropletIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
);

// ── Section Heading ───────────────────────────────────────────────────────────
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[12px] font-[800] uppercase tracking-[0.1em] mb-3 text-[var(--dashboard-heading)]"
    >
      {children}
    </h2>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CustomerDashboard() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(' ')[0] || 'User';

  // ── Nodes for this customer ──
  const { nodes, loading: nodesLoading } = useNodes();

  // ── Derived stats ──
  const totalDevices = (nodes as any[]).length;
  const onlineDevices = (nodes as any[]).filter((n: any) => {
    if (n.status === 'Online') return true;
    const ts = n.lastPing || n.last_seen;
    if (!ts) return false;
    return Date.now() - new Date(ts).getTime() < 5 * 60 * 1000;
  }).length;

  const isLoading = nodesLoading;

  return (
    <div
      className="w-full min-h-screen flex flex-col bg-transparent relative pb-8"
      style={{ paddingTop: 'max(85px, env(safe-area-inset-top, 85px))' }}
    >
      {/* ── Page Header ── */}
      <div className="px-4 lg:px-6 pt-3 pb-4 relative z-10">
        <h1
          className="text-[28px] font-[800] tracking-tight leading-none mb-1.5 text-[var(--dashboard-heading)]"
        >
          Welcome back, {firstName} 👋
        </h1>
        <p
          className="text-[10px] font-[700] uppercase tracking-[0.15em] opacity-80 text-[var(--dashboard-heading)]"
        >
          Your water system at a glance
        </p>
      </div>

      {/* ── KPI Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 lg:px-6 mb-5 relative z-10">
        <StatCard
          label="Total Devices"
          value={isLoading ? '—' : totalDevices}
          sub={isLoading ? '' : `${onlineDevices} online`}
          icon={<DevicesIcon />}
          accentRgb="132, 204, 22"
        />
        <StatCard
          label="Water Consumed"
          value="1,240 L"
          sub="Today"
          icon={<DropletIcon />}
          accentRgb="20, 184, 166"
        />
        <StatCard
          label="Active Alerts"
          value={0}
          sub="All clear"
          icon={<AlertIconSvg />}
          accentRgb="59, 130, 246"
        />
        <StatCard
          label="System Health"
          value={isLoading ? '—' : (totalDevices > 0 ? `${Math.round((onlineDevices / totalDevices) * 100)}%` : '—')}
          sub={isLoading ? '' : (onlineDevices === totalDevices ? "All systems normal" : "Some nodes offline")}
          icon={<OnlineIcon />}
          accentRgb="99, 102, 241"
        />
      </div>

      {/* ── Device Cards ── */}
      <div className="px-4 lg:px-6 mb-5 relative z-10">
        <SectionHeading>Your Devices</SectionHeading>
        {isLoading ? (
          <div 
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {[1, 2, 3].map((i) => (
              <DeviceCard key={i} isLoading />
            ))}
          </div>
        ) : (nodes as any[]).length === 0 ? (
          <div
            className="apple-glass-card rounded-[20px] p-8 flex flex-col items-center justify-center text-center"
            style={{ minHeight: '120px' }}
          >
            <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
              No devices have been assigned to your account yet.
            </p>
          </div>
        ) : (
          <div 
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {(nodes as any[]).map((node: any) => (
              <ErrorBoundary key={node.id || node.hardwareId}>
                <DeviceCard device={node} />
              </ErrorBoundary>
            ))}
          </div>
        )}
      </div>

      {/* ── Charts Row ── */}
      <div className="px-4 lg:px-6 mb-5 relative z-10">
        <div style={{ minHeight: '320px' }}>
          <ErrorBoundary>
            <ConsumptionTrendChart isLoading={isLoading} data={[]} />
          </ErrorBoundary>
        </div>
      </div>

      {/* ── Reports Row ── */}
      <div className="px-4 lg:px-6 mb-8 relative z-10">
        <div style={{ minHeight: '260px' }}>
          <ErrorBoundary>
            <ReportsDownloader nodes={nodes as any[]} isLoading={isLoading} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
