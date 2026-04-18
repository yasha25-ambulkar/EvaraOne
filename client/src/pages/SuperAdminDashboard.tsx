import { useMemo, useState, useEffect } from 'react';
import { useNodes } from '../hooks/useNodes';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../services/admin';
import { socket } from '../services/api';
import { computeDeviceStatus } from '../services/DeviceService';
import ErrorBoundary from '../components/ErrorBoundary';
import SharedMap from '../components/map/SharedMap';
import ProductPieChart from '../components/dashboard/ProductPieChart';
import SuperAdminStatCard from '../components/dashboard/SuperAdminStatCard';
import LevelTrendChart from '../components/dashboard/LevelTrendChart';
import UsagePeakChart from '../components/dashboard/UsagePeakChart';
import CustomerDeviceTable from '../components/dashboard/CustomerDeviceTable';

const DeviceIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
const CustomerIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
const AlertIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /></svg>;
const HeartbeatIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;

export default function SuperAdminDashboard() {
    const { nodes } = useNodes() as { nodes: any[] };
    const [realtimeStatuses, setRealtimeStatuses] = useState<Record<string, 'Online' | 'Offline'>>({});

    useEffect(() => {
        const handle = (data: any) => {
            const id = data.device_id || data.node_id;
            if (!id) return;
            const status = computeDeviceStatus(data.timestamp || data.created_at || data.last_seen);
            setRealtimeStatuses(prev => ({ ...prev, [id]: status }));
        };
        socket.on('telemetry_update', handle);
        return () => { socket.off('telemetry_update', handle); };
    }, []);

    const { totalDevices, onlineDevices, offlineDevices, tankNodes, flowNodes, deepNodes, tdsNodes } = useMemo(() => {
        const total = nodes.length;
        const online = nodes.filter(n => (realtimeStatuses[n.id] || n.status) === 'Online').length;
        return {
            totalDevices: total, onlineDevices: online, offlineDevices: total - online,
            tankNodes: nodes.filter(n => ['evaratank', 'EvaraTank', 'tank', 'sump'].includes(n.asset_type)).length,
            flowNodes: nodes.filter(n => ['evaraflow', 'EvaraFlow', 'flow', 'flow_meter'].includes(n.asset_type)).length,
            deepNodes: nodes.filter(n => ['evaradeep', 'EvaraDeep', 'bore', 'govt'].includes(n.asset_type)).length,
            tdsNodes: nodes.filter(n => ['evaratds', 'EvaraTDS', 'tds', 'tds_meter'].includes(n.asset_type)).length,
        };
    }, [nodes, realtimeStatuses]);

    const { data: customers = [], isLoading: customersLoading } = useQuery({ 
        queryKey: ['superadmin_customers'], 
        queryFn: () => adminService.getCustomers(), 
        staleTime: 1000 * 60 * 10 
    });

    const { data: auditLogs = [], isLoading: logsLoading } = useQuery({
        queryKey: ['superadmin_audit_logs'],
        queryFn: () => adminService.getAuditLogs(),
        staleTime: 1000 * 60 * 5,
    });

    const mapDevices = useMemo(() => nodes.map(n => ({
        id: n.hardwareId || n.id, firestore_id: n.firestore_id || n.id,
        name: n.displayName || n.name || n.id || 'Unknown', status: (realtimeStatuses[n.id] || n.status) as 'Online' | 'Offline',
        latitude: n.latitude, longitude: n.longitude,
        asset_type: n.assetType || n.asset_type, analytics_template: n.analytics_template || n.analyticsTemplate,
        device_type: n.device_type || n.category,
    })), [nodes, realtimeStatuses]);

    const totalCustomers = customers.filter((c: any) => c.role === 'customer').length;
    
    // Fallback logic for logs mapping just in case
    const realLogsCount = auditLogs.length > 0 ? auditLogs : [];
    const criticalAlerts = realLogsCount.filter((l: any) => l.action_type?.toLowerCase().includes('critical')).length;
    const warningAlerts = realLogsCount.filter((l: any) => l.action_type?.toLowerCase().includes('warn')).length;
    
    const systemStatus = typeof offlineDevices === 'number' && offlineDevices > totalDevices * 0.2 ? 'Attention' : 'Optimal';
    const healthPct = systemStatus === 'Optimal' ? 92 : 78;

    return (
        <div className="w-full min-h-screen flex flex-col bg-transparent relative pt-[85px] lg:pt-[95px] pb-6">
            <div className="px-4 lg:px-6 pt-3 pb-2 relative z-10">
                <h1 className="text-[28px] font-[800] tracking-tight leading-none mb-1.5" style={{ color: 'var(--dashboard-heading)' }}>
                    System Dashboard
                </h1>
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] opacity-80" style={{ color: 'var(--text-muted)' }}>
                    Real-Time Network Intelligence
                </p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 lg:px-6 mb-4 relative z-10">
                <SuperAdminStatCard 
                    title="Total Devices" 
                    value={totalDevices} 
                    sub1={`${onlineDevices} Online`} 
                    sub2={`${offlineDevices} Offline`} 
                    icon={<DeviceIcon />}
                    accentRgb="34, 197, 94"
                />
                <SuperAdminStatCard 
                    title="Total Customers" 
                    value={customersLoading ? '...' : totalCustomers} 
                    icon={<CustomerIcon />}
                    accentRgb="20, 184, 166"
                />
                <SuperAdminStatCard 
                    title="Alerts & Activity" 
                    value={logsLoading ? '...' : criticalAlerts + warningAlerts} 
                    sub1={`${criticalAlerts} Critical`} 
                    sub2={`${warningAlerts} Warnings`} 
                    icon={<AlertIcon />}
                    accentRgb="239, 68, 68"
                />
                <SuperAdminStatCard 
                    title="System Health" 
                    value={`${healthPct}%`} 
                    sub1={systemStatus} 
                    icon={<HeartbeatIcon />}
                    accentRgb="99, 102, 241"
                />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 lg:px-6 mb-4 relative z-10 min-h-[260px]">
                <div className="max-h-[40vh]">
                    <ErrorBoundary>
                        <LevelTrendChart nodes={nodes} />
                    </ErrorBoundary>
                </div>
                <div className="max-h-[40vh]">
                    <ErrorBoundary>
                        <UsagePeakChart nodes={nodes} />
                    </ErrorBoundary>
                </div>
                <div className="max-h-[40vh]">
                    <ErrorBoundary>
                        <ProductPieChart tank={tankNodes} flow={flowNodes} deep={deepNodes} tds={tdsNodes} className="h-full" />
                    </ErrorBoundary>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-4 lg:px-6 mb-4 relative z-10">
                <div className="lg:col-span-2">
                    <ErrorBoundary>
                        <CustomerDeviceTable />
                    </ErrorBoundary>
                </div>
                <div className="lg:col-span-1 apple-glass-card rounded-[20px] overflow-hidden relative" style={{ minHeight: '300px' }}>
                    <ErrorBoundary>
                        <SharedMap devices={mapDevices as any} pipelines={[]} height="100%" showZoom={false} className="h-full absolute inset-0" />
                    </ErrorBoundary>
                </div>
            </div>
        </div>
    );
}
