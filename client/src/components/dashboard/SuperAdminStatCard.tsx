import React from 'react';

interface SuperAdminStatCardProps {
    title: string;
    value: string | number;
    sub1?: React.ReactNode;
    sub2?: React.ReactNode;
    icon: React.ReactNode;
    iconBg?: string;
    accentRgb?: string;
}

export default function SuperAdminStatCard({ title, value, sub1, sub2, icon, iconBg, accentRgb }: SuperAdminStatCardProps) {
    const valueColor = accentRgb ? `rgba(${accentRgb}, 1)` : 'var(--text-primary)';
    const subColor = accentRgb ? `rgba(${accentRgb}, 1)` : 'var(--text-muted)';
    const iconContainerBg = accentRgb ? `rgba(${accentRgb}, 0.15)` : (iconBg || 'var(--glass-accent)');
    const iconColor = accentRgb ? `rgba(${accentRgb}, 1)` : 'inherit';

    return (
        <div className="apple-glass-card p-4 rounded-[18px] flex flex-col justify-between h-full min-h-[105px] relative overflow-hidden transition-all group hover:scale-[1.02] hover:shadow-lg">
            <div className="flex justify-between items-start mb-2 relative z-10">
                <span className="text-[14px] font-[800] uppercase tracking-tight text-[var(--text-primary)] opacity-80">{title}</span>
                <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all group-hover:scale-110"
                    style={{
                        background: iconContainerBg,
                        color: iconColor,
                        border: accentRgb ? 'none' : '1px solid var(--card-border)'
                    }}
                >
                    <div className="scale-75 origin-center">{icon}</div>
                </div>
            </div>
            <div className="relative z-10">
                <h2 className="text-[32px] font-[800] leading-none tracking-tight mb-2" style={{ color: valueColor }}>{value}</h2>
                {(sub1 || sub2) && (
                    <div className="flex flex-col gap-0.5">
                        {sub1 && <span className="text-[10px] font-[800] uppercase tracking-wide opacity-90" style={{ color: subColor }}>{sub1}</span>}
                        {sub2 && <span className="text-[10px] font-[800] uppercase tracking-wide opacity-90" style={{ color: subColor }}>{sub2}</span>}
                    </div>
                )}
            </div>
        </div>
    );
}
