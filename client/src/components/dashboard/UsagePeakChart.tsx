import { useMemo } from 'react';
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export default function UsagePeakChart({ nodes = [] }: { nodes: any[] }) {
    const tankNodes = nodes.filter(n => n.category === 'tank' || n.category === 'sump');

    const { data: historyData = {} } = useQuery({
        queryKey: ['weekly_usage', tankNodes.map(n => n.id).join(',')],
        queryFn: async () => {
            const results: Record<string, any[]> = {};
            await Promise.all(tankNodes.map(async (node) => {
                try {
                    // FIX (Bug 2): always store by node.id, fetch by hardwareId if available
                    const fetchId = node.hardwareId || node.id;
                    const res = await api.get(`/nodes/${fetchId}/analytics?range=1W`);
                    results[node.id] = res.data?.history || res.data?.data || [];
                } catch {
                    results[node.id] = [];
                }
            }));

            if (import.meta.env.DEV) {
                console.log('=== USAGE PEAK DEBUG ===');
                Object.entries(results).forEach(([id, history]) => {
                    console.log(`Node ${id}: ${history.length} entries`);
                    if (history.length > 0) {
                        console.log('First entry:', JSON.stringify(history[0]));
                        console.log('Last entry:', JSON.stringify(history[history.length - 1]));
                    }
                });
            }

            return results;
        },
        enabled: tankNodes.length > 0,
        staleTime: 1000 * 60 * 5,
    });

    const data = useMemo(() => {
        const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

        // FIX (Bug 1): Build the correct calendar date for each MON–SUN slot.
        // Find this week's Monday (regardless of what today is).
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // getDay(): 0=Sun,1=Mon,...,6=Sat → convert to Mon-based index (0=Mon...6=Sun)
        const todayDow = today.getDay() === 0 ? 6 : today.getDay() - 1;

        // Monday of the current week
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - todayDow);

        return days.map((day, i) => {
            // i=0 → Monday, i=1 → Tuesday ... i=6 → Sunday — always correct calendar dates
            const targetDate = new Date(weekStart);
            targetDate.setDate(weekStart.getDate() + i);

            const nextDate = new Date(targetDate);
            nextDate.setDate(targetDate.getDate() + 1);

            const isFuture = targetDate > today; // don't compute future days

            let totalConsumption = 0;
            let totalWeight = 0;

            if (!isFuture) {
                tankNodes.forEach(node => {
                    const weight = node.capacity || 1;
                    const nodeHistory: any[] = historyData[node.id] || [];

                    const dayReadings = nodeHistory.filter((entry: any) => {
                        const t = new Date(entry.created_at || entry.timestamp || entry.raw?.created_at);
                        return t >= targetDate && t < nextDate;
                    });

                    if (dayReadings.length >= 2) {
                        const levels = dayReadings
                            .map((e: any) => e.level_percentage ?? e.level ?? null)
                            .filter((l: any) => l !== null && !isNaN(l));

                        if (levels.length >= 2) {
                            let consumption = 0;
                            for (let j = 1; j < levels.length; j++) {
                                const drop = levels[j - 1] - levels[j];
                                if (drop > 1) consumption += drop;
                            }
                            consumption = Math.min(consumption, 100);
                            totalConsumption += consumption * weight;
                            totalWeight += weight;
                        }
                    }

                    // FIX (Bug 3): fallback ONLY for today AND only when history truly
                    // has no readings for today (not just "data not loaded yet")
                    const isToday = i === todayDow;
                    const historyLoaded = nodeHistory.length > 0;
                    if (totalWeight === 0 && isToday && historyLoaded) {
                        const currentLevel = node.last_telemetry?.level_percentage
                            ?? node.last_telemetry?.level
                            ?? node.level_percentage
                            ?? node.level
                            ?? null;
                        if (currentLevel !== null) {
                            totalConsumption += (100 - currentLevel) * weight;
                            totalWeight += weight;
                        }
                    }
                });
            }

            return {
                day,
                usage: totalWeight > 0 ? Math.round(totalConsumption / totalWeight) : 0,
                isToday: i === todayDow,
                isFuture,
            };
        });
    }, [nodes, historyData]);

    return (
        <div className="apple-glass-card p-[20px] rounded-[20px] h-full flex flex-col">
            <span className="text-[12px] font-[800] text-[var(--text-primary)] opacity-80 uppercase tracking-[0.1em] mb-4 shrink-0">
                Usage Peak (Weekly)
            </span>
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
                            <XAxis
                                dataKey="day"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 9, fontWeight: 700, fill: 'var(--text-muted)' }}
                                interval="preserveStartEnd"
                            />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: '1px solid var(--card-border)',
                                    background: 'var(--card-bg)',
                                    fontSize: 11,
                                    color: 'var(--text-primary)',
                                }}
                                formatter={(v: any, _: any, props: any) => {
                                    if (props?.payload?.isFuture) return ['—', 'Usage'];
                                    return [`${Math.round(v)}%`, 'Usage'];
                                }}
                            />
                            <Bar dataKey="usage" radius={[6, 6, 0, 0]} fill="url(#usageGradient)" maxBarSize={48} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
