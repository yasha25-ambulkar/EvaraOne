import type { AlertHistory } from '../../services/admin';

interface AlertsPanelProps {
  alerts?: AlertHistory[];
  isLoading?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function conditionSymbol(condition: string | undefined): string {
  if (!condition) return '≠';
  if (condition === '>') return '>';
  if (condition === '<') return '<';
  if (condition === '==') return '=';
  return condition;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
function AlertsSkeleton() {
  return (
    <div className="apple-glass-card rounded-[20px] p-5 h-full flex flex-col">
      <span
        className="text-[14px] font-[800] uppercase tracking-tight mb-5 block text-[var(--dashboard-heading)]"
      >
        Recent Alerts
      </span>
      <div className="flex-1 space-y-3 overflow-hidden">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl"
            style={{
              height: '64px',
              backgroundColor: 'var(--text-muted)',
              opacity: 0.15,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
function AlertsEmpty() {
  return (
    <div className="apple-glass-card rounded-[20px] p-5 h-full flex flex-col">
      <span
        className="text-[14px] font-[800] uppercase tracking-tight mb-5 block text-[var(--dashboard-heading)]"
      >
        Recent Alerts
      </span>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6 text-center">
        {/* Green checkmark illustration */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--online-bg)', border: '1px solid var(--online-border)' }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--online-text)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-[14px] font-[600]" style={{ color: 'var(--text-primary)' }}>
          All systems healthy
        </p>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          No active alerts for your devices
        </p>
      </div>
    </div>
  );
}

// ── Alert Row ─────────────────────────────────────────────────────────────────
function AlertRow({ alert }: { alert: AlertHistory }) {
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-xl transition-colors"
      style={{
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
      }}
    >
      {/* Status dot */}
      <div className="shrink-0 mt-1">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: 'var(--offline-dot)' }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Alert name */}
        <p
          className="text-[13px] font-[600] truncate"
          style={{ color: 'var(--text-primary)' }}
          title={alert.rule?.name || 'Device Alert'}
        >
          {alert.rule?.name || 'Device Alert'}
        </p>

        {/* Metric / condition */}
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {alert.rule?.metric || 'value'} {conditionSymbol(alert.rule?.condition)}{' '}
          {alert.rule?.threshold} &mdash; read&nbsp;
          <span style={{ color: 'var(--offline-text)', fontWeight: 700 }}>
            {alert.value_at_time}
          </span>
        </p>
      </div>

      {/* Time */}
      <span
        className="text-[10px] shrink-0"
        style={{ color: 'var(--text-muted)', opacity: 0.7, marginTop: '2px' }}
      >
        {timeAgo(alert.triggered_at)}
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AlertsPanel({ alerts, isLoading }: AlertsPanelProps) {
  if (isLoading) return <AlertsSkeleton />;
  if (!alerts || alerts.length === 0) return <AlertsEmpty />;

  return (
    <div className="apple-glass-card rounded-[20px] p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <span
          className="text-[14px] font-[800] uppercase tracking-tight text-[var(--dashboard-heading)]"
        >
          Recent Alerts
        </span>
        <span
          className="px-2 py-0.5 rounded-full text-[11px] font-[700]"
          style={{
            backgroundColor: 'var(--offline-bg)',
            border: '1px solid var(--offline-border)',
            color: 'var(--offline-text)',
          }}
        >
          {alerts.length} active
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto space-y-2"
        style={{
          maxHeight: '320px',
          // custom scrollbar handled via global styles
          scrollbarWidth: 'thin',
        }}
      >
        {alerts.map((alert) => (
          <AlertRow key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  );
}
