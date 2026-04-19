import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

type Timeframe = '24H' | '7D' | '30D';

interface DataPoint {
  name: string;
  value: number;
}

interface ConsumptionTrendChartProps {
  data?: DataPoint[];
  isLoading?: boolean;
}

// ── Tab Button ────────────────────────────────────────────────────────────────
function TabButton({
  label,
  active,
  onClick,
}: {
  label: Timeframe;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-[12px] font-[600] transition-all"
      style={{
        minWidth: '38px',
        backgroundColor: active ? 'var(--color-evara-blue)' : 'transparent',
        color: active ? '#ffffff' : 'var(--text-muted)',
      }}
    >
      {label}
    </button>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        backdropFilter: 'blur(12px)',
        borderRadius: '10px',
        padding: '8px 12px',
      }}
    >
      <p style={{ color: 'var(--text-muted)', fontSize: '10px', marginBottom: '3px' }}>{label}</p>
      <p style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700 }}>
        {payload[0].value} L
      </p>
    </div>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
function ConsumptionSkeleton() {
  return (
    <div
      className="apple-glass-card rounded-[20px] p-5 h-full flex flex-col animate-pulse"
      style={{ minHeight: '300px' }}
    >
      <div className="flex justify-between items-center mb-6">
        <div
          className="h-4 rounded"
          style={{ width: '40%', backgroundColor: 'var(--text-muted)', opacity: 0.2 }}
        />
        <div
          className="h-7 rounded-full"
          style={{ width: '110px', backgroundColor: 'var(--text-muted)', opacity: 0.2 }}
        />
      </div>
      <div
        className="flex-1 rounded-lg"
        style={{ backgroundColor: 'var(--text-muted)', opacity: 0.1 }}
      />
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
function ConsumptionEmpty({ timeframe, onTimeframe }: { timeframe: Timeframe; onTimeframe: (t: Timeframe) => void }) {
  return (
    <div
      className="apple-glass-card rounded-[20px] p-5 h-full flex flex-col"
      style={{ minHeight: '300px' }}
    >
      <div className="flex justify-between items-center mb-6">
        <span
          className="text-[14px] font-[800] uppercase tracking-tight text-[var(--dashboard-heading)]"
        >
          Consumption Trend
        </span>
        <TimeframeTabs timeframe={timeframe} onTimeframe={onTimeframe} />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.4 }}
        >
          <path d="M3 3v18h18" />
          <path d="M18 9l-5-5-4 4-3 3" />
        </svg>
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          No consumption data for {timeframe}
        </p>
      </div>
    </div>
  );
}

// ── Tabs Row ─────────────────────────────────────────────────────────────────
function TimeframeTabs({
  timeframe,
  onTimeframe,
}: {
  timeframe: Timeframe;
  onTimeframe: (t: Timeframe) => void;
}) {
  return (
    <div
      className="flex p-1 rounded-full"
      style={{
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {(['24H', '7D', '30D'] as Timeframe[]).map((tf) => (
        <TabButton key={tf} label={tf} active={timeframe === tf} onClick={() => onTimeframe(tf)} />
      ))}
    </div>
  );
}

// ── Main Chart ────────────────────────────────────────────────────────────────
export default function ConsumptionTrendChart({ data, isLoading }: ConsumptionTrendChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('7D');
  const hasRealData = data && data.length > 0;

  const chartData = useMemo<DataPoint[]>(() => {
    if (hasRealData) return data!;
    
    // Generate organic-looking mock data if real data is missing
    const counts: Record<Timeframe, number> = { '24H': 24, '7D': 7, '30D': 30 };
    const n = counts[timeframe];
    const baseValue = 450;
    
    return Array.from({ length: n }, (_, i) => {
      let label = '';
      if (timeframe === '24H') label = `${String(i).padStart(2, '0')}:00`;
      else if (timeframe === '7D') label = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i];
      else label = `Day ${i + 1}`;
      
      // Add some deterministic variance
      const variance = Math.sin(i * 0.5) * 150 + (Math.random() * 50);
      return {
        name: label,
        value: Math.round(baseValue + variance)
      };
    });
  }, [data, hasRealData, timeframe]);

  if (isLoading) return <ConsumptionSkeleton />;

  return (
    <div
      className="apple-glass-card rounded-[20px] p-5 h-full flex flex-col relative overflow-hidden"
      style={{ minHeight: '300px' }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-5 relative z-10">
        <div className="flex items-center gap-3">
          <span
            className="text-[14px] font-[800] uppercase tracking-tight text-[var(--dashboard-heading)]"
          >
            Consumption Trend
          </span>
          {!hasRealData && (
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20 tracking-widest uppercase">
              Sample View
            </span>
          )}
        </div>
        <TimeframeTabs timeframe={timeframe} onTimeframe={setTimeframe} />
      </div>

      {/* Chart */}
      <div className="flex-1" style={{ minHeight: '200px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 8, left: -28, bottom: 0 }}
          >
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-evara-blue)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--color-evara-blue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--card-border)"
              opacity={0.5}
            />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-evara-blue)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#trendFill)"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--color-evara-blue)', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
