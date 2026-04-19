import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin';
import { Link } from 'react-router-dom';

export default function CustomerDeviceTable() {
    const [search, setSearch] = useState('');
    
    const { data: customers = [], isLoading } = useQuery({ 
        queryKey: ['superadmin_customers'], 
        queryFn: () => adminService.getCustomers(), 
        staleTime: 1000 * 60 * 10 
    });

    const rows = useMemo(() => customers.filter((c: any) => 
        !search || (c.full_name ?? c.display_name ?? c.email ?? '').toLowerCase().includes(search.toLowerCase())
    ), [customers, search]);

    return (
        <div className="apple-glass-card rounded-[20px] overflow-hidden h-full flex flex-col">
            <div className="px-5 py-4 flex items-center justify-between border-b border-[var(--card-border)]">
                <span className="text-[12px] font-[800] text-[var(--text-primary)] opacity-80 uppercase tracking-[0.1em]">All Customers & Devices</span>
                <input 
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                    placeholder="Search…"
                    className="text-[11px] px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--glass-accent)] transition-colors w-44" 
                />
            </div>
            
            <div className="overflow-x-auto flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[var(--card-bg)] backdrop-blur-sm border-b border-[var(--card-border)] z-10">
                        <tr>
                            {['Customer', 'Location', 'Devices', 'Status', 'Last Seen', 'Actions'].map(h =>
                                <th key={h} className="px-4 py-3 font-[800] text-[var(--text-primary)] opacity-80 uppercase tracking-wider whitespace-nowrap">{h}</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)] italic text-[11px]">Loading customers...</td></tr>
                        )}
                        {!isLoading && rows.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)] italic text-[11px]">No customers found</td></tr>
                        )}
                        {!isLoading && rows.map((row: any, i: number) => (
                            <tr key={row.id ?? i} className="border-b border-[var(--card-border)] hover:bg-[var(--glass-accent-subtle)] transition-colors">
                                <td className="px-4 py-3 font-[700] text-[var(--text-primary)] whitespace-nowrap">{row.full_name ?? row.display_name ?? row.email ?? '—'}</td>
                                <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">{row.communityName ?? row.zoneName ?? '—'}</td>
                                <td className="px-4 py-3 font-[800] text-[var(--text-primary)]">{row.deviceCount ?? 0}</td>
                                <td className="px-4 py-3">
                                    {(row.deviceCount ?? 0) === 0 ? (
                                        <span className="text-[var(--text-muted)] text-[10px]">—</span>
                                    ) : row.isActive !== false ? (
                                        <span className="flex items-center gap-1.5">
                                            <span 
                                                className="w-2 h-2 rounded-full bg-[var(--chart-bar-green)]" 
                                                style={{ boxShadow: '0 0 6px var(--chart-bar-green)' }} 
                                            />
                                            <span className="text-[10px] font-[800] text-[var(--text-muted)]">Active</span>
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5">
                                            <span 
                                                className="w-2 h-2 rounded-full bg-[var(--chart-bar-red)]" 
                                                style={{ boxShadow: '0 0 6px var(--chart-bar-red)' }} 
                                            />
                                            <span className="text-[10px] font-[800] text-[var(--text-muted)]">Inactive</span>
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-[var(--text-muted)] text-[10px] whitespace-nowrap">
                                    {row.updated_at ? new Date(row.updated_at).toLocaleDateString() !== 'Invalid Date' 
                                      ? new Date(row.updated_at).toLocaleDateString() 
                                      : 'Never' 
                                      : 'Never'}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex gap-2">
                                        <Link to={`/superadmin/customers/${row.id}`} className="px-2.5 py-1 rounded-lg text-[10px] font-[800] text-[var(--text-primary)] border border-[var(--card-border)] hover:bg-[var(--glass-accent)] transition-all">
                                            View
                                        </Link>
                                        <button className="px-2.5 py-1 rounded-lg text-[10px] font-[800] text-[var(--chart-bar-red)] border border-[var(--card-border)] hover:bg-[var(--glass-accent)] transition-all">
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
