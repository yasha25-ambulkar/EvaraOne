import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { useTelemetry } from '../../hooks/useTelemetry';

interface Props {
    nodeId?: string;
    title?: string;
}

const SystemPerformanceChart: React.FC<Props> = ({ nodeId, title = "System Performance" }) => {
    const { data: telemetry, loading } = useTelemetry(nodeId);

    if (loading) return <div className="h-[300px] w-full apple-glass-inner animate-pulse rounded-2xl" />;

    const chartData = telemetry?.timestamp ? [ { time: new Date(telemetry.timestamp).toLocaleTimeString(), ...telemetry.values } ] : [];
    const keys = Object.keys(telemetry?.values || {});

    // Use a fixed set of colors for dynamic keys
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

    return (
        <div className="apple-glass-card p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-lg font-bold mb-4">{title}</h3>
            <div style={{ height: '300px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid-color)" />
                        <XAxis dataKey="time" />
                        <YAxis />
                        <RechartsTooltip />
                        {keys.map((key, i) => (
                            <Area key={key} type="monotone" dataKey={key} stackId="1" stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.6}/>
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default SystemPerformanceChart;
