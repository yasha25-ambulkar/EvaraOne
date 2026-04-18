import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';

interface WeekDataPoint {
  name: string;
  'This Week': number;
  'Last Week': number;
}

interface WeekComparisonChartProps {
  data?: WeekDataPoint[];
  isLoading?: boolean;
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
        minWidth: '120px',
      }}
    >
      <p
        style={{
          color: 'var(--text-muted)',
          fontSize: '10px',
          marginBottom: '6px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex justify-between gap-4 mb-1">
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{entry.dataKey}</span>
          <span style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: 700 }}>
            {entry.value} L
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
function WeekSkeleton() {
  return (
    <div
      className="apple-glass-card rounded-[20px] p-5 h-full flex flex-col animate-pulse"
      style={{ minHeight: '300px' }}
    >
      <div className="flex justify-between items-center mb-6">
        <div
          className="h-4 rounded"
          style={{ width: '38%', backgroundColor: 'var(--text-muted)', opacity: 0.2 }}
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
function WeekEmpty() {
  return (
    <div
      className="apple-glass-card rounded-[20px] p-5 h-full flex flex-col"
      style={{ minHeight: '300px' }}
    >
      <span
        className="text-[14px] font-[800] uppercase tracking-tight mb-6 block text-[var(--dashboard-heading)]"
      >
        Week over Week
      </span>
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
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          No comparison data available
        </p>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function WeekComparisonChart({ data, isLoading }: WeekComparisonChartProps) {
  const hasRealData = data && data.length > 0;

  const chartData = useMemo<WeekDataPoint[]>(() => {
    if (hasRealData) return data!;

    // Mock data for 7 days
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map(day => ({
      name: day,
      'This Week': Math.round(400 + Math.random() * 300),
      'Last Week': Math.round(350 + Math.random() * 400),
    }));
  }, [data, hasRealData]);

  if (isLoading) return <WeekSkeleton />;

  return (
    <div
      className="apple-glass-card rounded-[20px] p-5 h-full flex flex-col relative overflow-hidden"
      style={{ minHeight: '300px' }}
    >
      <div className="flex items-center gap-3 mb-5">
        <span
          className="text-[14px] font-[800] uppercase tracking-tight block text-[var(--dashboard-heading)]"
        >
          Week over Week
        </span>
        {!hasRealData && (
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 tracking-widest uppercase">
            Sample View
          </span>
        )}
      </div>

      <div className="flex-1" style={{ minHeight: '200px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 8, left: -28, bottom: 0 }}
            barGap={3}
          >
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
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--card-border)', opacity: 0.3 }} />
            <Legend
              wrapperStyle={{
                fontSize: '11px',
                paddingTop: '12px',
                color: 'var(--text-muted)',
              }}
              iconType="circle"
              iconSize={7}
            />
            <Bar
              dataKey="This Week"
              fill="var(--color-evara-blue)"
              radius={[4, 4, 0, 0]}
              barSize={11}
            />
            <Bar
              dataKey="Last Week"
              fill="var(--text-muted)"
              fillOpacity={0.35}
              radius={[4, 4, 0, 0]}
              barSize={11}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
