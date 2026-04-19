import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';

interface ProductPieChartProps {
    tank: number;
    flow: number;
    deep: number;
    tds: number;
    className?: string;
}

export const ProductPieChart = ({
    tank,
    flow,
    deep,
    tds,
    className
}: ProductPieChartProps) => {
    const data = [
        { name: 'EvaraTank', value: Math.max(tank, 0.01), color: '#6EB5FF' },
        { name: 'EvaraFlow', value: Math.max(flow, 0.01), color: '#0891B2' },
        { name: 'EvaraDeep', value: Math.max(deep, 0.01), color: '#2B5FA3' },
        { name: 'EvaraTDS',  value: Math.max(tds,  0.01), color: '#8B72E0' }
    ];

    return (
        <div className={clsx("apple-glass-card px-[20px] py-[16px] rounded-[20px] flex flex-col h-full", className)}>
            <div className="flex justify-between items-start mb-2 shrink-0">
                <span className="text-[12px] font-[800] text-[var(--text-primary)] uppercase tracking-[0.1em]">Product Distribution</span>
                <div className="w-8 h-8 rounded-full bg-blue-500/10 dark:bg-blue-400/15 flex items-center justify-center border border-blue-500/20 dark:border-blue-400/20">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="icon-product-adaptive">
                        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                        <path d="M22 12A10 10 0 0 0 12 2v10z" />
                    </svg>
                </div>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-1 min-h-0 pt-2">
                {/* Pie */}
                <div className="flex-1 w-full" style={{ minHeight: '80px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Tooltip
                                contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 11 }}
                            />
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={0}
                                outerRadius="98%"
                                dataKey="value"
                                stroke="rgba(255,255,255,0.5)"
                                strokeWidth={2}
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                {/* Legend at bottom */}
                <div className="flex flex-row flex-wrap justify-center gap-x-6 gap-y-1">
                    {data.map((item) => (
                        <div key={item.name} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <span className="text-[10px] font-[800] text-gray-500 uppercase tracking-tight">{item.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ProductPieChart;
