import { useState } from 'react';

interface ReportsDownloaderProps {
  nodes?: any[];
  isLoading?: boolean;
}

// ── Field mappings per device type ────────────────────────────────────────────
function getDeviceTypeKey(node: any): 'evaratank' | 'evaraflow' | 'evaratds' | 'unknown' {
  const t = (node.asset_type || node.device_type || node.deviceType || node.category || '').toLowerCase();
  if (t.includes('tank')) return 'evaratank';
  if (t.includes('flow')) return 'evaraflow';
  if (t.includes('tds')) return 'evaratds';
  return 'unknown';
}

function getCSVHeaders(deviceType: string): string[] {
  switch (deviceType) {
    case 'evaratank': return ['timestamp', 'distance_cm', 'temperature_c'];
    case 'evaraflow': return ['timestamp', 'meter_reading_low', 'flow_rate', 'meter_reading_high'];
    case 'evaratds':  return ['timestamp', 'tds_ppm', 'temperature_c'];
    default:          return ['timestamp', 'field1', 'field2', 'field3', 'field4'];
  }
}

function feedToRow(feed: any, deviceType: string): string[] {
  const utcDate = feed.created_at ? new Date(feed.created_at) : null;
  const ts = utcDate ? utcDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }).replace(',', '') : '';
  switch (deviceType) {
    case 'evaratank': return [ts, feed.field1 ?? '', feed.field2 ?? ''];
    case 'evaraflow': return [ts, feed.field1 ?? '', feed.field2 ?? '', feed.field3 ?? ''];
    case 'evaratds':  return [ts, feed.field2 ?? '', feed.field3 ?? ''];
    default:          return [ts, feed.field1 ?? '', feed.field2 ?? '', feed.field3 ?? '', feed.field4 ?? ''];
  }
}

async function fetchThingSpeakRange(
  channelId: string,
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  // ThingSpeak expects ISO format: start=2026-05-01T00:00:00Z
  const start = `${startDate}T00:00:00Z`;
  const end   = `${endDate}T23:59:59Z`;
  const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&start=${start}&end=${end}&results=8000`;
  const res  = await fetch(url);
  const json = await res.json();
  return json.feeds || [];
}

// ── Input Styles ──────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '40px',
  padding: '0 12px',
  borderRadius: '10px',
  fontSize: '13px',
  border: '1px solid var(--card-border)',
  backgroundColor: 'var(--card-bg)',
  color: 'var(--text-primary)',
  outline: 'none',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  appearance: 'none' as const,
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-[700] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
      {children}
    </span>
  );
}

function ReportsSkeleton() {
  return (
    <div className="apple-glass-card rounded-[20px] p-5 h-full flex flex-col" style={{ minHeight: '260px' }}>
      <span className="text-[14px] font-[800] uppercase tracking-tight mb-6 block text-[var(--dashboard-heading)]">
        Export Reports
      </span>
      <div className="space-y-4 animate-pulse flex-1">
        {[1,2,3].map(i => (
          <div key={i} className="h-10 rounded-lg" style={{ backgroundColor: 'var(--text-muted)', opacity: 0.18 }} />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ReportsDownloader({ nodes, isLoading }: ReportsDownloaderProps) {
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [startDate, setStartDate]           = useState<string>('');
  const [endDate, setEndDate]               = useState<string>('');
  const [downloading, setDownloading]       = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [rowCount, setRowCount]             = useState<number | null>(null);

  if (isLoading) return <ReportsSkeleton />;

  // Only show supported device types
  const supportedNodes = (nodes || []).filter(n => getDeviceTypeKey(n) !== 'unknown');

  const handleDownload = async () => {
    setError(null);
    setRowCount(null);

    if (!selectedDevice) { setError('Please select a device.'); return; }
    if (!startDate)       { setError('Please select a start date.'); return; }
    if (!endDate)         { setError('Please select an end date.'); return; }
    if (startDate > endDate) { setError('Start date must be before end date.'); return; }

    const node = (nodes || []).find(n => (n.id || n.hardwareId) === selectedDevice);
    if (!node) { setError('Device not found.'); return; }

    const channelId = node.thingspeak_channel_id || node.channelId || node.channel_id;
    const apiKey    = node.thingspeak_read_api_key || node.readApiKey || node.read_api_key;

    if (!channelId || !apiKey) {
      setError('This device has no ThingSpeak channel configured.');
      return;
    }

    setDownloading(true);
    try {
      const feeds      = await fetchThingSpeakRange(channelId, apiKey, startDate, endDate);
      const deviceType = getDeviceTypeKey(node);
      const headers    = getCSVHeaders(deviceType);
      const rows       = feeds.map(f => feedToRow(f, deviceType));
      const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');

      const blob     = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      const label    = node.label || node.displayName || node.hardwareId || selectedDevice;
      a.href         = url;
      a.download     = `${label}_${startDate}_to_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setRowCount(feeds.length);
    } catch {
      setError('Failed to fetch data. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="apple-glass-card rounded-[20px] p-5 h-full flex flex-col">
      <span className="text-[14px] font-[800] uppercase tracking-tight mb-5 block text-[var(--dashboard-heading)]">
        Export Reports
      </span>

      <div className="flex flex-col flex-1 gap-4">

        {/* Device dropdown — no "All Devices" option */}
        <div>
          <FieldLabel>Select Device</FieldLabel>
          <div className="relative">
            <select
              value={selectedDevice}
              onChange={e => { setSelectedDevice(e.target.value); setError(null); setRowCount(null); }}
              style={inputStyle}
            >
              <option value="">— Choose a device —</option>
              {supportedNodes.map(node => (
                <option key={node.id || node.hardwareId} value={node.id || node.hardwareId}>
                  {node.label || node.displayName || node.hardwareId || 'Unnamed'}
                </option>
              ))}
            </select>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          {/* Show device type hint */}
          {selectedDevice && (() => {
            const node = (nodes || []).find(n => (n.id || n.hardwareId) === selectedDevice);
            const type = node ? getDeviceTypeKey(node) : '';
            const labels: any = { evaratank: '🪣 Tank — distance, temperature', evaraflow: '💧 Flow — meter reading, flow rate', evaratds: '🔬 TDS — tds, temperature' };
            return type && labels[type] ? (
              <p className="text-[10px] mt-1 font-[600]" style={{ color: 'var(--text-muted)' }}>{labels[type]}</p>
            ) : null;
          })()}
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Start Date</FieldLabel>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <FieldLabel>End Date</FieldLabel>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputStyle }} min={startDate || undefined} />
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-[11px] font-[600]" style={{ color: 'var(--offline-text)' }}>{error}</p>
        )}

        {/* Success */}
        {rowCount !== null && !error && (
          <p className="text-[11px] font-[600]" style={{ color: 'var(--online-text)' }}>
            ✅ {rowCount} records downloaded successfully!
          </p>
        )}

        {/* Download button */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="mt-auto w-full h-10 rounded-xl text-[13px] font-[700] flex items-center justify-center gap-2 transition-opacity"
          style={{ backgroundColor: 'var(--color-evara-blue)', color: '#ffffff', opacity: downloading ? 0.6 : 1, cursor: downloading ? 'not-allowed' : 'pointer' }}
        >
          {downloading ? (
            <>
              <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Fetching data…
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download CSV
            </>
          )}
        </button>

      </div>
    </div>
  );
}
