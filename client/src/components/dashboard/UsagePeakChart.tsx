import { useMemo } from 'react';
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts';

export default function UsagePeakChart({ nodes = [] }: { nodes: any[] }) {
    const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
    const data = useMemo(() => ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d, i) => ({
        day: d, usage: Math.max(30, Math.min(100, 50 + Math.sin(i * 0.8 + 1) * 30 + (nodes.length > 0 ? 10 : 0))), isToday: i === todayIdx,
    })), [nodes.length, todayIdx]);

    return (
        <div className="apple-glass-card p-[20px] rounded-[20px] h-full flex flex-col">
            <span className="text-[12px] font-[800] text-[var(--text-primary)] opacity-80 uppercase tracking-[0.1em] mb-4 shrink-0">Usage Peak (Weekly)</span>
            {nodes.length === 0 ? (
                <div className="flex-1 min-h-0 flex items-center justify-center">
                    <p className="text-[11px] text-[var(--text-muted)] italic">No devices found</p>
                </div>
            ) : (
                <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="10%">
                            <defs>
                                <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--chart-bar-cyan)" stopOpacity={1} />
                                    <stop offset="100%" stopColor="var(--chart-bar-cyan)" stopOpacity={0.6} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: 'var(--text-muted)' }} interval="preserveStartEnd" />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid var(--card-border)', background: 'var(--card-bg)', fontSize: 11, color: 'var(--text-primary)' }} formatter={(v: any) => [`${Math.round(v)}%`, 'Usage']} />
                            <Bar dataKey="usage" radius={[6, 6, 0, 0]} fill="url(#usageGradient)" maxBarSize={48} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
