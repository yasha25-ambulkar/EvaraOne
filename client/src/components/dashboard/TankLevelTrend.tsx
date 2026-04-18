import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

interface Props {
    data: { time: string; level: number }[];
}

const TankLevelTrend = ({ data }: Props) => {
    return (
        <div style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.1}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid-color)" />
                    <XAxis dataKey="time" />
                    <YAxis domain={[0, 100]} />
                    <RechartsTooltip />
                    <Area type="monotone" dataKey="level" stroke="#3B82F6" fillOpacity={1} fill="url(#colorLevel)" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default TankLevelTrend;
