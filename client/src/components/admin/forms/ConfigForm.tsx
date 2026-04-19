import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { Save, Loader2, Smartphone, Shield, Zap, RefreshCcw, Clock, Save as SaveIcon } from 'lucide-react';
import { z } from 'zod';

import { adminService } from '../../../services/admin';
import { useToast } from '../../ToastProvider';
import { FormField } from '../../forms/FormField';

const configSchema = z.object({
    samplingIntervals: z.object({
        evaraTank: z.coerce.number().min(1).max(3600),
        evaraDeep: z.coerce.number().min(1).max(3600),
        evaraFlow: z.coerce.number().min(1).max(3600),
        evaraTDS: z.coerce.number().min(1).max(3600),
    }),
    batterySaverMode: z.boolean(),
    firmwarePolicies: z.object({
        autoUpdate: z.boolean(),
        targetFirmware: z.string(),
        updateWindow: z.object({
            start: z.string(),
            end: z.string(),
        })
    }),
});

type ConfigInput = z.infer<typeof configSchema>;

interface Props {
    onSubmit: (data: any) => void;
    onCancel: () => void;
}

export const ConfigForm = ({ onSubmit, onCancel }: Props) => {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'sampling' | 'firmware' | 'status'>('sampling');
    const [nodes, setNodes] = useState<any[]>([]);
    const [loadingNodes, setLoadingNodes] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { isSubmitting },
    } = useForm<ConfigInput>({
        resolver: zodResolver(configSchema) as any,
        defaultValues: {
            samplingIntervals: {
                evaraTank: 60,
                evaraDeep: 300,
                evaraFlow: 30,
                evaraTDS: 120
            },
            batterySaverMode: false,
            firmwarePolicies: {
                autoUpdate: false,
                targetFirmware: 'v2.1.0',
                updateWindow: { start: "02:00", end: "04:00" }
            }
        }
    });

    const isBatterySaver = watch('batterySaverMode');

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const config = await adminService.getSystemConfig();
                reset(config);
                
                setLoadingNodes(true);
                const fetchedNodes = await adminService.getNodes();
                setNodes(fetchedNodes);
            } catch (err) {
                console.error("Failed to fetch initial config:", err);
            } finally {
                setLoadingNodes(false);
            }
        };
        fetchInitialData();
    }, [reset]);

    const onFormSubmit = async (data: ConfigInput) => {
        try {
            const result = await adminService.updateSystemConfig(data);
            showToast('System Configuration Broadcasted', 'success');
            onSubmit(result);
        } catch (err: any) {
            showToast(err.message || 'Failed to update config', 'error');
        }
    };

    const inputClass = (error?: any) => `
        w-full px-4 py-2.5 rounded-xl border transition-all duration-300 outline-none text-sm text-[var(--text-primary)]
        ${error
            ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800/50 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
            : 'border-slate-200 apple-glass-inner dark:border-slate-700/50 dark:bg-slate-800/20 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 focus:apple-glass-card'}
    `;

    const tabClass = (tab: string) => `
        flex-1 py-2 text-xs font-bold rounded-lg transition-all
        ${activeTab === tab 
            ? 'bg-amber-500 text-white shadow-lg shadow-amber-200 dark:shadow-amber-900/40' 
            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-300/50 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10'}
    `;

    return (
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
            {/* Tab Navigation */}
            <div className="flex p-1 bg-slate-200/80 dark:bg-slate-800/60 rounded-xl gap-1">
                <button type="button" onClick={() => setActiveTab('sampling')} className={tabClass('sampling')}>
                    Sampling
                </button>
                <button type="button" onClick={() => setActiveTab('firmware')} className={tabClass('firmware')}>
                    Firmware
                </button>
                <button type="button" onClick={() => setActiveTab('status')} className={tabClass('status')}>
                    Device Status
                </button>
            </div>

            <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-5"
            >
                {activeTab === 'sampling' && (
                    <div className="space-y-4">
                        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-bold text-[var(--modal-text-color)] flex items-center gap-2">
                                    <Zap size={16} className="text-amber-600 dark:text-amber-400" /> Battery Saver Mode
                                </h4>
                                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Overrides all intervals to conserve node battery (x2 interval)</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" {...register('batterySaverMode')} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                            </label>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="EvaraTank (Min)" icon={Smartphone as any}>
                                <input type="number" {...register('samplingIntervals.evaraTank')} className={inputClass()} disabled={isBatterySaver} />
                            </FormField>
                            <FormField label="EvaraDeep (Min)" icon={Smartphone as any}>
                                <input type="number" {...register('samplingIntervals.evaraDeep')} className={inputClass()} disabled={isBatterySaver} />
                            </FormField>
                            <FormField label="EvaraFlow (Sec)" icon={Smartphone as any}>
                                <input type="number" {...register('samplingIntervals.evaraFlow')} className={inputClass()} disabled={isBatterySaver} />
                            </FormField>
                            <FormField label="EvaraTDS (Min)" icon={Smartphone as any}>
                                <input type="number" {...register('samplingIntervals.evaraTDS')} className={inputClass()} disabled={isBatterySaver} />
                            </FormField>
                        </div>
                    </div>
                )}

                {activeTab === 'firmware' && (
                    <div className="space-y-4">
                        <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-bold text-[var(--modal-text-color)] flex items-center gap-2">
                                    <Shield size={16} className="text-blue-600 dark:text-blue-400" /> Auto-Update
                                </h4>
                                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Automatically roll out new firmware within window</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" {...register('firmwarePolicies.autoUpdate')} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                            </label>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Update Window Start" icon={Clock}>
                                <input type="time" {...register('firmwarePolicies.updateWindow.start')} className={inputClass()} />
                            </FormField>
                            <FormField label="Update Window End" icon={Clock}>
                                <input type="time" {...register('firmwarePolicies.updateWindow.end')} className={inputClass()} />
                            </FormField>
                        </div>

                        <FormField label="Target Firmware Version" icon={SaveIcon}>
                            <select {...register('firmwarePolicies.targetFirmware')} className={inputClass()}>
                                <option value="v2.1.0">v2.1.0 (Current Stable)</option>
                                <option value="v1.9.8-LTS">v1.9.8-LTS (Legacy)</option>
                                <option value="v2.2.0-beta">v2.2.0-beta (Beta)</option>
                            </select>
                        </FormField>

                        <button
                            type="button"
                            className="w-full py-3 mt-2 flex items-center justify-center gap-2 bg-slate-800 dark:bg-slate-700 text-white rounded-xl text-xs font-bold hover:bg-black dark:hover:bg-slate-600 transition-all shadow-sm"
                        >
                            <RefreshCcw size={16} /> Force Update All Devices
                        </button>
                    </div>
                )}

                {activeTab === 'status' && (
                    <div className="max-h-[300px] overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-800">
                        <table className="w-full text-left text-xs bg-white dark:bg-slate-900/20 transition-colors">
                            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700/50 backdrop-blur-sm">
                                <tr>
                                    <th className="px-4 py-2 font-black text-[var(--text-primary)] uppercase tracking-wider">Device ID</th>
                                    <th className="px-4 py-2 font-black text-[var(--text-primary)] uppercase tracking-wider">Type</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loadingNodes ? (
                                    <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-400 italic">Loading device data...</td></tr>
                                ) : nodes.length === 0 ? (
                                    <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-400 italic">No devices found</td></tr>
                                ) : nodes.map(node => (
                                    <tr key={node.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/40 border-b border-slate-100 dark:border-slate-800/50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-[var(--text-primary)]">{node.name || node.id}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-gray-800 dark:text-gray-100 text-[10px] font-black uppercase transition-colors">
                                                {node.device_type}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </motion.div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isSubmitting}
                    className="px-6 py-2.5 text-sm font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                >
                    Cancel
                </button>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-8 py-2.5 bg-amber-600 text-white text-sm font-black rounded-xl hover:bg-amber-700 transition-all"
                >
                    {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    {isSubmitting ? 'Syncing...' : 'Broadcast Config'}
                </motion.button>
            </div>
        </form>
    );
};
