import { useMemo } from 'react';
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export default function UsagePeakChart({ nodes = [] }: { nodes: any[] }) {
    const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
    const tankNodes = nodes.filter(n => n.category === 'tank' || n.category === 'sump');

    const { data: historyData = {} } = useQuery({
        queryKey: ['weekly_usage', tankNodes.map(n => n.id).join(',')],
        queryFn: async () => {
            const results: Record<string, any[]> = {};
            await Promise.all(tankNodes.map(async (node) => {
                try {
                    const res = await api.get(`/nodes/${node.hardwareId || node.id}/analytics?range=1W`);
                    results[node.id] = res.data?.history || res.data?.data || [];
                } catch { results[node.id] = []; }
            }));
            return results;
        },
        enabled: tankNodes.length > 0,
        staleTime: 1000 * 60 * 5,
    });

    const data = useMemo(() => {
        const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

        return days.map((day, i) => {
            // Target date for this day slot (last 7 days)
            const targetDate = new Date();
            const dayDiff = (todayIdx - i + 7) % 7;
            targetDate.setDate(targetDate.getDate() - dayDiff);
            targetDate.setHours(0, 0, 0, 0);
            const nextDate = new Date(targetDate);
            nextDate.setDate(nextDate.getDate() + 1);

            let totalConsumption = 0;
            let totalWeight = 0;

            tankNodes.forEach(node => {
                const weight = node.capacity || 1;
                const nodeHistory = historyData[node.id] || [];
                
                if (nodeHistory.length > 0) {
                    // Get readings for this specific day
                    const dayReadings = nodeHistory.filter((entry: any) => {
                        const t = new Date(entry.created_at || entry.timestamp || entry.raw?.created_at);
                        return t >= targetDate && t < nextDate;
                    });

                    if (dayReadings.length >= 2) {
                        // Consumption = sum of all drops in level (ignoring refills)
                        const levels = dayReadings
                            .map((e: any) => e.level_percentage ?? null)
                            .filter((l: any) => l !== null && !isNaN(l));
                        
                        if (levels.length >= 2) {
                            let consumption = 0;
                            for (let j = 1; j < levels.length; j++) {
                                const drop = levels[j - 1] - levels[j];
                                if (drop > 1) consumption += drop; // ignore drops under 1% (sensor noise)
                            }
                            consumption = Math.min(consumption, 100); // cap at 100% per tank
                            totalConsumption += consumption * weight;
                            totalWeight += weight;
                        }
                    }
                }

                // Fallback — use current level as proxy for today
                if (totalWeight === 0 && i === todayIdx) {
                    const currentLevel = node.last_telemetry?.level_percentage ?? node.level_percentage ?? null;
                    if (currentLevel !== null) {
                        totalConsumption += (100 - currentLevel) * weight;
                        totalWeight += weight;
                    }
                }
            });

            return {
                day,
                usage: totalWeight > 0 ? Math.round(totalConsumption / totalWeight) : 0,
                isToday: i === todayIdx
            };
        });
    }, [nodes, todayIdx, historyData]);

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
