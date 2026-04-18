import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin';

const getRelTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (isNaN(diff)) return 'unknown';
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

const severityClass = {
    critical: 'bg-[var(--chart-bar-red)]',
    warning: 'bg-[var(--chart-bar-amber)]',
    info: 'bg-[var(--chart-bar-green)]'
};

export default function ActivityFeed() {
    const { data: logs = [], isLoading, error } = useQuery({
        queryKey: ['superadmin_audit_logs'],
        queryFn: async () => {
            try {
                const fetched = await adminService.getAuditLogs();
                if (fetched && fetched.length > 0) {
                    return fetched.map((l: any) => ({
                        id: l.id, 
                        device_id: l.resource_id || 'SYSTEM', 
                        event_type: l.action_type || 'System Event', 
                        timestamp: l.created_at || new Date().toISOString(),
                        severity: l.action_type?.toLowerCase().includes('critical') 
                                    ? 'critical' 
                                    : l.action_type?.toLowerCase().includes('warn') 
                                        ? 'warning' 
                                        : 'info',
                    }));
                }
            } catch (err) {
                // Ignore error, fallback to mock data
            }
            return [
                { id: '1', device_id: 'DEV-A1', event_type: '[MOCK] Parameter Update Failed (Critical)', timestamp: new Date(Date.now() - 300000).toISOString(), severity: 'critical' },
                { id: '2', device_id: 'DEV-B2', event_type: '[MOCK] Sensor Offline Warning', timestamp: new Date(Date.now() - 3600000).toISOString(), severity: 'warning' },
                { id: '3', device_id: 'SYSTEM', event_type: '[MOCK] Admin Login Successful', timestamp: new Date(Date.now() - 86400000).toISOString(), severity: 'info' }
            ];
        },
        staleTime: 1000 * 60 * 5,
    });

    return (
        <div className="apple-glass-card p-[20px] rounded-[20px] h-full flex flex-col">
            <span className="text-[12px] font-[800] text-[var(--text-primary)] opacity-80 uppercase tracking-[0.1em] mb-4 shrink-0">Recent Activity</span>
            
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                {isLoading && (
                    <p className="text-[11px] text-[var(--text-muted)] italic text-center mt-8">Loading activities...</p>
                )}
                {!isLoading && logs.length === 0 && (
                    <p className="text-[11px] text-[var(--text-muted)] italic text-center mt-8">No recent activity</p>
                )}
                {!isLoading && logs.map((log: any, i: number) => (
                    <div key={log.id ?? i} className="flex items-start gap-3">
                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${severityClass[log.severity as keyof typeof severityClass] || severityClass.info}`} />
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-[700] text-[var(--text-primary)] leading-snug truncate">
                                {log.event_type?.replace(/_/g, ' ')}
                            </p>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                                {log.device_id && <span className="font-[800] mr-1">{log.device_id}</span>}
                                {getRelTime(log.timestamp)}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
