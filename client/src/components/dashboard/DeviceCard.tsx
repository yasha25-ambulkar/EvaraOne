interface DeviceCardProps {
  device?: any;
  isLoading?: boolean;
}

const productLabel = (device: any): string => {
  const t = device?.product_type || device?.asset_type || '';
  if (/deep/i.test(t)) return 'EvaraDeep';
  if (/flow/i.test(t)) return 'EvaraFlow';
  if (/tank|sump/i.test(t)) return 'EvaraTank';
  if (/tds/i.test(t)) return 'EvaraTDS';
  return 'Device';
};

const isNodeOnline = (device: any): boolean => {
  if (device?.status === 'Online') return true;
  if (device?.lastPing) {
    return new Date().getTime() - new Date(device.lastPing).getTime() < 5 * 60 * 1000;
  }
  if (device?.last_seen) {
    return new Date().getTime() - new Date(device.last_seen).getTime() < 5 * 60 * 1000;
  }
  return false;
};

// ── Loading Skeleton ──────────────────────────────────────────────────────────
function DeviceCardSkeleton() {
  return (
    <div
      className="apple-glass-card rounded-[16px] p-3 h-full flex flex-col justify-between animate-pulse gap-3"
    >
      <div className="flex justify-between items-center">
        <div className="h-4 rounded" style={{ width: '45%', backgroundColor: 'var(--text-muted)', opacity: 0.2 }} />
        <div className="h-5 rounded-full" style={{ width: '56px', backgroundColor: 'var(--text-muted)', opacity: 0.2 }} />
      </div>
      <div className="flex justify-between items-center">
        <div className="h-3 rounded" style={{ width: '35%', backgroundColor: 'var(--text-muted)', opacity: 0.15 }} />
        <div className="h-3 rounded" style={{ width: '25%', backgroundColor: 'var(--text-muted)', opacity: 0.15 }} />
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
function DeviceCardEmpty() {
  return (
    <div
      className="apple-glass-card rounded-[16px] p-3 h-full flex flex-col items-center justify-center text-center gap-2"
    >
      <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
        No device data
      </p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DeviceCard({ device, isLoading }: DeviceCardProps) {
  if (isLoading) return <DeviceCardSkeleton />;
  if (!device) return <DeviceCardEmpty />;

  const online = isNodeOnline(device);
  const label = device.displayName || device.label || device.name || 'Unnamed Device';
  const hwId = device.hardwareId || device.hardware_id || device.id || '—';
  const lastSeen = device.lastPing || device.last_seen;

  return (
    <div
      className="apple-glass-card rounded-[18px] p-4 h-full flex flex-col justify-between transition-all gap-4 group hover:shadow-md border border-[var(--card-border)]"
      style={{ minHeight: '100px' }}
    >
      {/* ── Top Row ── */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2.5" style={{ flex: 1, minWidth: 0 }}>
          <h3
            className="text-[16px] font-[800] truncate text-[var(--dashboard-heading)]"
            title={label}
          >
            {label}
          </h3>
          <p className="text-[11px] hidden sm:block truncate shrink-0 opacity-70 text-[var(--text-primary)]" style={{ color: 'var(--text-muted)' }}>
            {productLabel(device)}
          </p>
        </div>

        {/* Status badge */}
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-[800] shrink-0 ml-2"
          style={
            online
              ? {
                  color: 'var(--online-text)',
                  border: '1px solid var(--online-border)',
                  backgroundColor: 'var(--online-bg)',
                }
              : {
                  color: 'var(--offline-text)',
                  border: '1px solid var(--offline-border)',
                  backgroundColor: 'var(--offline-bg)',
                }
          }
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: online ? 'var(--online-dot)' : 'var(--offline-dot)' }}
          />
          {online ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* ── Bottom Row ── */}
      <div className="flex justify-between items-center mt-1">
        <div className="flex items-baseline gap-1.5 truncate">
          <span
            className="text-[9px] font-[800] uppercase tracking-wider text-[var(--text-primary)] opacity-60"
          >
            HW ID
          </span>
          <span
            className="text-[12px] font-mono font-[600] truncate text-[var(--text-primary)]"
          >
            {hwId}
          </span>
        </div>

        {lastSeen && (
          <div className="flex items-baseline gap-1.5 shrink-0 ml-2">
            <span
              className="text-[9px] font-[800] uppercase tracking-wider hidden xs:inline text-[var(--text-primary)] opacity-60"
            >
              Last Seen
            </span>
            <span className="text-[11px] font-[600] text-[var(--text-primary)]">
              {new Date(lastSeen).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
