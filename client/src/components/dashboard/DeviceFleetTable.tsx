/**
 * DeviceFleetTable — the scrollable device fleet table panel from Dashboard.
 * Extracted from Dashboard.tsx (~60 lines of JSX).
 */
import { useNavigate } from 'react-router-dom';
import { Server } from 'lucide-react';

interface FleetDevice {
    id: string;
    name: string | null;
    type: string | null;
    status: string;
    lastComm: string;
    health: number;
}

interface Props {
    devices: FleetDevice[];
}

const statusColor = (status: string) => {
    if (status === 'Online') return { text: 'text-green-600', dot: 'bg-green-500' };
    if (status === 'Alert') return { text: 'text-red-600', dot: 'bg-red-500' };
    if (status === 'Maintenance') return { text: 'text-amber-600', dot: 'bg-amber-500' };
    return { text: 'text-slate-500', dot: 'bg-slate-400' };
};

const healthColor = (health: number) => {
    if (health > 90) return { text: 'text-green-600', bar: 'bg-green-500' };
    if (health > 50) return { text: 'text-amber-600', bar: 'bg-amber-500' };
    return { text: 'text-red-600', bar: 'bg-red-500' };
};

export const DeviceFleetTable = ({ devices }: Props) => {
    const navigate = useNavigate();

    return (
        <div className="apple-glass-card rounded-2xl border border-slate-100 shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow">
            <div className="px-5 py-4 border-b border-slate-50 flex justify-between items-center flex-none">
                <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                    <Server size={24} className="text-blue-500" /> Device Fleet
                </h2>
                <button className="text-blue-500 hover:text-blue-600 transition-colors font-bold text-2xl" onClick={() => navigate('/home')}>+</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left">
                    <thead className="sticky top-0 apple-glass-card z-10">
                        <tr className="border-b border-slate-50 text-xs font-extrabold text-slate-400 uppercase tracking-widest">
                            <th className="px-5 py-3">Device</th>
                            <th className="px-5 py-3">Status</th>
                            <th className="px-5 py-3 text-right">Health</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-base">
                        {devices.map(dev => {
                            const sc = statusColor(dev.status);
                            const hc = healthColor(dev.health);
                            return (
                                <tr key={dev.id} className="hover:bg-white/30/60 transition-colors cursor-pointer" style={{ cursor: 'pointer' }} onClick={() => navigate(`/devices/${dev.id}`)}>
                                    <td className="px-5 py-4">
                                        <div className="font-bold text-slate-700 text-base">{dev.name}</div>
                                        <div className="text-xs text-blue-400 font-mono">{dev.type}</div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className={`flex items-center gap-2 font-bold text-sm ${sc.text}`}>
                                            <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
                                            {dev.status}
                                        </div>
                                        <div className="text-xs text-slate-400 mt-1">{dev.lastComm}</div>
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        <div className={`font-bold text-sm ${hc.text}`}>{dev.health}%</div>
                                        <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                                            <div className={`h-full rounded-full ${hc.bar}`} style={{ width: `${dev.health}%` }} />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DeviceFleetTable;
