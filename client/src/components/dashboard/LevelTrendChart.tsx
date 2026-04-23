import { useMemo } from 'react';
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts';

export default function LevelTrendChart({ nodes = [] }: { nodes: any[] }) {
    const data = useMemo(() => {
        const tankNodes = nodes.filter(n => n.category === 'tank' || n.category === 'sump');
        
        const now = new Date();
        const slots = [0, 4, 8, 12, 16, 20].map(h => {
            const slotTime = new Date(now);
            slotTime.setHours(h, 0, 0, 0);
            return { label: `${String(h).padStart(2, '0')}:00`, target: slotTime };
        });
        slots.push({ label: 'NOW', target: now });

        return slots.map(slot => {
            let weightedSum = 0;
            let totalWeight = 0;

            tankNodes.forEach(node => {
                const weight = node.capacity || 1;
                let level = null;

                // Try telemetryHistory first
                if (node.telemetryHistory && node.telemetryHistory.length > 0) {
                    const closest = node.telemetryHistory.reduce((best: any, entry: any) => {
                        const entryTime = new Date(entry.created_at || entry.timestamp || entry.raw?.created_at);
                        const bestTime = new Date(best.created_at || best.timestamp || best.raw?.created_at);
                        const entryDiff = Math.abs(entryTime.getTime() - slot.target.getTime());
                        const bestDiff = Math.abs(bestTime.getTime() - slot.target.getTime());
                        return entryDiff < bestDiff ? entry : best;
                    });
                    level = closest?.level_percentage ?? closest?.raw?.field2 ?? null;
                }

                // Fallback to current level
                if (level === null) {
                    level = node.last_telemetry?.level_percentage ?? node.level_percentage ?? null;
                }

                if (level !== null && !isNaN(level)) {
                    weightedSum += level * weight;
                    totalWeight += weight;
                }
            });

            return {
                time: slot.label,
                level: totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
            };
        });
    }, [nodes]);

    return (
        <div className="apple-glass-card p-[20px] rounded-[20px] h-full flex flex-col">
            <span className="text-[12px] font-[800] text-[var(--text-primary)] opacity-80 uppercase tracking-[0.1em] mb-4 shrink-0">Level Trend (24H)</span>
            {nodes.length === 0 ? (
                <div className="flex-1 min-h-0 flex items-center justify-center">
                    <p className="text-[11px] text-[var(--text-muted)] italic">No devices found</p>
                </div>
            ) : (
                <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="10%">
                            <defs>
                                <linearGradient id="levelGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--chart-bar-blue)" stopOpacity={1} />
                                    <stop offset="100%" stopColor="var(--chart-bar-blue)" stopOpacity={0.6} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: 'var(--text-muted)' }} interval="preserveStartEnd" />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid var(--card-border)', background: 'var(--card-bg)', fontSize: 11, color: 'var(--text-primary)' }} formatter={(v: any) => [`${Math.round(v)}%`, 'Level']} />
                            <Bar dataKey="level" radius={[6, 6, 0, 0]} fill="url(#levelGradient)" maxBarSize={48} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
