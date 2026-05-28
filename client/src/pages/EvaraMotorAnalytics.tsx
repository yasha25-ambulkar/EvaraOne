import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Play, Square, Settings, Activity, Zap, Droplets, Clock, AlertCircle, CheckCircle2, Info, Loader2
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useDeviceAnalytics } from '../hooks/useDeviceAnalytics';
import { useRealtimeTelemetry } from '../hooks/useRealtimeTelemetry';
import { useStaleDataAge } from '../hooks/useStaleDataAge';

const EvaraMotorAnalytics = () => {
  const { hardwareId } = useParams<{ hardwareId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [currentTime, setCurrentTime] = useState(new Date());

  // Dynamic modals state
  const [showParams, setShowParams] = useState(false);
  const [showNodeInfo, setShowNodeInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Field mappings state
  const [fieldVoltage, setFieldVoltage] = useState('field1');
  const [fieldCurrent, setFieldCurrent] = useState('field2');
  const [fieldPower, setFieldPower] = useState('field3');
  const [fieldFrequency, setFieldFrequency] = useState('field4');
  const [fieldWaterLevel, setFieldWaterLevel] = useState('');
  
  // Electrical limits
  const [voltMax, setVoltMax] = useState('500');
  const [currMax, setCurrMax] = useState('100');

  // Interactive motor simulation command state
  const [simRunning, setSimRunning] = useState<boolean | null>(null);

  // Fetch device metadata and history
  const {
    data: unifiedData,
    isLoading: analyticsLoading,
    isFetching: analyticsFetching,
    refetch,
    error: analyticsError,
  } = useDeviceAnalytics(hardwareId, { refetchInterval: 30000 });
  
  // Realtime Socket subscription
  useRealtimeTelemetry(hardwareId);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const deviceConfig = useMemo(() => {
    return ('config' in (unifiedData?.config ?? {})
      ? (unifiedData!.config as any).config
      : undefined);
  }, [unifiedData]);

  const telemetryData = useMemo(() => {
    return (unifiedData?.latest && !('error' in unifiedData.latest)
      ? unifiedData.latest
      : undefined);
  }, [unifiedData]);

  const deviceInfo = useMemo(() => {
    return (unifiedData?.info && 'data' in (unifiedData.info as any)
      ? (unifiedData.info as any).data
      : undefined);
  }, [unifiedData]);

  // Sync field mappings on load
  useEffect(() => {
    if (deviceConfig) {
      const configFields = (deviceConfig as any).fields || {};
      setFieldVoltage(configFields.voltage || deviceConfig.voltage_field || 'field1');
      setFieldCurrent(configFields.current || deviceConfig.current_field || 'field2');
      setFieldPower(configFields.power || deviceConfig.power_field || 'field3');
      setFieldFrequency(configFields.frequency || deviceConfig.frequency_field || 'field4');
      setFieldWaterLevel(configFields.water_level || deviceConfig.water_level_field || '');
      
      const conf = deviceConfig.configuration || {};
      setVoltMax(String(conf.voltage_max || '500'));
      setCurrMax(String(conf.current_max || '100'));
    }
  }, [deviceConfig]);

  const deviceName = deviceInfo?.name ?? 'Motor Monitor';
  const zoneName = deviceInfo?.zone_name ?? deviceInfo?.community_name ?? '';
  const resolvedTimestamp = telemetryData?.timestamp || deviceInfo?.last_seen;
  
  // Stale age calculation
  const { label: staleLabel } = useStaleDataAge(resolvedTimestamp ?? null);

  // Resolved electrical telemetry values
  const voltageValue = telemetryData?.voltageValue ?? telemetryData?.data?.voltageValue ?? 0;
  const currentValue = telemetryData?.currentValue ?? telemetryData?.data?.currentValue ?? 0;
  const powerValue = telemetryData?.powerValue ?? telemetryData?.data?.powerValue ?? 0;
  const frequencyValue = telemetryData?.frequencyValue ?? telemetryData?.data?.frequencyValue ?? 50.0;
  const levelValue = telemetryData?.level_percentage ?? telemetryData?.data?.level_percentage ?? 0;

  // Derive running state: running if current > 0.5A, or fallback to simulated running command state
  const isRunning = useMemo(() => {
    if (simRunning !== null) return simRunning;
    return currentValue > 0.5;
  }, [currentValue, simRunning]);

  const totalCapacity = deviceConfig?.total_capacity || deviceConfig?.capacity || 50000;
  const volumeLitres = Math.round((levelValue / 100) * totalCapacity);

  // Map history feeds
  const historyFeeds = (unifiedData?.history as any)?.feeds || [];
  const trendData = useMemo(() => {
    if (historyFeeds.length > 0) {
      return historyFeeds.map((f: any) => {
        const d = new Date(f.timestamp || f.created_at);
        const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return {
          time: timeStr,
          level: f.level ?? f.level_percentage ?? 0,
          current: f.current ?? f.currentValue ?? 0
        };
      });
    }
    // Fallback Mock Data if no history is present yet
    return [
      { time: '00:00', level: 30, current: isRunning ? 5.8 : 0 },
      { time: '04:00', level: 35, current: isRunning ? 6.0 : 0 },
      { time: '08:00', level: 50, current: isRunning ? 6.2 : 0 },
      { time: '12:00', level: 75, current: isRunning ? 6.5 : 0 },
      { time: '16:00', level: 60, current: isRunning ? 5.8 : 0 },
      { time: '20:00', level: 45, current: isRunning ? 6.0 : 0 },
      { time: '24:00', level: 40, current: isRunning ? 5.5 : 0 },
    ];
  }, [historyFeeds, isRunning]);

  // Online connection status
  const isOnline = deviceInfo?.online_status || telemetryData !== undefined;

  const handleDelete = async () => {
    if (!hardwareId) return;
    setIsDeleting(true);
    try {
      await api.delete(`/api/v1/admin/nodes/${hardwareId}`);
      navigate('/nodes');
    } catch (err) {
      console.error("Failed to delete node:", err);
      alert("Failed to delete node. Please try again.");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.put(`/admin/nodes/${hardwareId}`, {
        voltageField: fieldVoltage,
        currentField: fieldCurrent,
        powerField: fieldPower,
        frequencyField: fieldFrequency,
        waterLevelField: fieldWaterLevel,
        voltageMax: parseFloat(voltMax) || 500,
        currentMax: parseFloat(currMax) || 100
      });
      await queryClient.invalidateQueries({ queryKey: ['device_config', hardwareId] });
      setShowParams(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save configuration';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }, [hardwareId, fieldVoltage, fieldCurrent, fieldPower, fieldFrequency, fieldWaterLevel, voltMax, currMax, queryClient]);

  if (!hardwareId) return <Navigate to="/nodes" replace />;

  if (analyticsLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-blue-500" size={40} />
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Loading Telemetry...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] font-sans relative overflow-x-hidden" style={{ color: 'var(--text-primary)' }}>
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-emerald-50/40 via-blue-50/40 to-indigo-50/40 pointer-events-none" />
      <main className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8 flex flex-col">
        
        {/* Breadcrumb + Page Heading row */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
            <div className="flex flex-col gap-2">
                <nav className="flex items-center gap-1 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                    <button onClick={() => window.location.href = '/'} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0">
                        Home
                    </button>
                    <span className="material-icons" style={{ fontSize: '16px', color: 'var(--text-muted)' }}>chevron_right</span>
                    <button onClick={() => window.location.href = '/nodes'} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0 font-normal" style={{ color: 'var(--text-muted)' }}>
                        All Nodes
                    </button>
                    <span className="material-icons" style={{ fontSize: '16px', color: 'var(--text-muted)' }}>chevron_right</span>
                    <span className="font-bold" style={{ color: 'var(--text-primary)', fontWeight: '700' }}>{deviceName}</span>
                </nav>

                <h2 style={{ fontSize: '22px', fontWeight: '700', marginTop: '6px', color: "var(--text-primary)" }}>
                    {deviceName} Analytics
                </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap pb-1">
                {/* Status Pill */}
                <div className={clsx(
                    "flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest transition-all duration-200 shadow-sm border",
                    !isOnline
                        ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20"
                        : "bg-[#ecfdf5] dark:bg-emerald-500/10 text-[#059669] dark:text-emerald-400 border border-[#10b981]/50 dark:border-emerald-500/40"
                )}>
                    <div className={clsx(
                        "w-1.5 h-1.5 rounded-full",
                        !isOnline ? "bg-red-500" : "bg-[#10b981] animate-pulse"
                    )} />
                    {isOnline ? 'Online' : 'Offline'}
                </div>

                {/* Refresh Data Button */}
                <button
                    onClick={() => refetch()}
                    disabled={analyticsFetching}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95 bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] border border-[#1e40af]/30 dark:bg-transparent dark:text-[#3B82F6] dark:border dark:border-[#3B82F6] dark:hover:bg-[#3B82F6]/10"
                >
                    <span className={clsx("material-icons", analyticsFetching && "animate-spin")} style={{ fontSize: '14px' }}>refresh</span>
                    {analyticsFetching ? 'Refreshing...' : 'Refresh Data'}
                </button>

                {/* Node Info Button */}
                <button 
                  onClick={() => setShowNodeInfo(true)}
                  className="flex items-center gap-2 px-4 py-1.5 bg-[#f3e8ff] hover:bg-[#e9d5ff] text-[#6b21a8] border border-[#6b21a8]/30 dark:bg-transparent dark:text-[#AF52DE] dark:border dark:border-[#AF52DE] dark:hover:bg-[#AF52DE]/10 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                >
                    <span className="material-icons" style={{ fontSize: '14px' }}>info</span> Node Info
                </button>

                {/* Parameters Button */}
                <button 
                  onClick={() => setShowParams(true)}
                  className="flex items-center gap-2 px-4 py-1.5 bg-[#fef3c7] hover:bg-[#fde68a] text-[#92400e] border border-[#92400e]/30 dark:bg-transparent dark:text-[#FFB340] dark:border dark:border-[#FFB340] dark:hover:bg-[#FFB340]/10 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                >
                    <span className="material-icons" style={{ fontSize: '14px' }}>settings</span> Parameters
                </button>

                {/* Delete Button */}
                <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 px-4 py-1.5 bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b] border border-[#991b1b]/30 dark:bg-transparent dark:text-[#FF3B30] dark:border dark:border-[#FF3B30] dark:hover:bg-[#FF3B30]/10 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                >
                    <span className="material-icons" style={{ fontSize: '14px' }}>delete_forever</span>
                    Delete Node
                </button>
            </div>
        </div>

        {/* ── Parameters Modal ── */}
        {showParams && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                onClick={() => setShowParams(false)}>
                <div className="rounded-2xl p-6 flex flex-col w-full max-w-lg"
                    style={{
                        background: "var(--bg-secondary)",
                        border: '1px solid var(--card-border)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)'
                    }}
                    onClick={e => e.stopPropagation()}>

                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-[17px] font-bold m-0" style={{ color: "var(--text-primary)" }}>Motor Monitor Config</h3>
                        <button onClick={() => setShowParams(false)}
                            className="flex items-center justify-center rounded-full bg-white border-none cursor-pointer p-0 transition-all hover:scale-110"
                            style={{
                                width: 24, height: 24, background: '#f5f5f5', color: '#3c3c43', fontSize: '18px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                            }}>
                            &times;
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="rounded-xl p-3 bg-[var(--bg-secondary)] border border-[var(--card-border)]">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Voltage Field</p>
                            <input type="text" value={fieldVoltage} onChange={e => setFieldVoltage(e.target.value)}
                                className="w-full font-bold text-sm bg-transparent border-none outline-none p-0 mt-1 text-[var(--text-primary)]" />
                        </div>
                        <div className="rounded-xl p-3 bg-[var(--bg-secondary)] border border-[var(--card-border)]">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Current Field</p>
                            <input type="text" value={fieldCurrent} onChange={e => setFieldCurrent(e.target.value)}
                                className="w-full font-bold text-sm bg-transparent border-none outline-none p-0 mt-1 text-[var(--text-primary)]" />
                        </div>
                        <div className="rounded-xl p-3 bg-[var(--bg-secondary)] border border-[var(--card-border)]">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Power Field</p>
                            <input type="text" value={fieldPower} onChange={e => setFieldPower(e.target.value)}
                                className="w-full font-bold text-sm bg-transparent border-none outline-none p-0 mt-1 text-[var(--text-primary)]" />
                        </div>
                        <div className="rounded-xl p-3 bg-[var(--bg-secondary)] border border-[var(--card-border)]">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Frequency Field</p>
                            <input type="text" value={fieldFrequency} onChange={e => setFieldFrequency(e.target.value)}
                                className="w-full font-bold text-sm bg-transparent border-none outline-none p-0 mt-1 text-[var(--text-primary)]" />
                        </div>
                        <div className="rounded-xl p-3 bg-[var(--bg-secondary)] border border-[var(--card-border)] col-span-2">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Water Level Sensor Field (Optional)</p>
                            <input type="text" value={fieldWaterLevel} onChange={e => setFieldWaterLevel(e.target.value)}
                                placeholder="e.g. field5"
                                className="w-full font-bold text-sm bg-transparent border-none outline-none p-0 mt-1 text-[var(--text-primary)]" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-5">
                        <div className="rounded-xl p-3 bg-[var(--bg-secondary)] border border-[var(--card-border)]">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Max Voltage Alert Limit (V)</p>
                            <input type="text" value={voltMax} onChange={e => setVoltMax(e.target.value)}
                                className="w-full font-bold text-sm bg-transparent border-none outline-none p-0 mt-1 text-[var(--text-primary)]" />
                        </div>
                        <div className="rounded-xl p-3 bg-[var(--bg-secondary)] border border-[var(--card-border)]">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Max Current Alert Limit (A)</p>
                            <input type="text" value={currMax} onChange={e => setCurrMax(e.target.value)}
                                className="w-full font-bold text-sm bg-transparent border-none outline-none p-0 mt-1 text-[var(--text-primary)]" />
                        </div>
                    </div>

                    {saveError && (
                        <p className="text-[11px] font-bold text-center mt-0 mb-3" style={{ color: '#FF3B30' }}>{saveError}</p>
                    )}

                    <div className="flex gap-3">
                        {user?.role === "superadmin" && (
                            <button onClick={handleSave} disabled={saving}
                                className="flex-1 font-semibold py-3 rounded-2xl text-white border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                                style={{
                                    background: '#3A7AFE',
                                    opacity: saving ? 0.5 : 1,
                                    fontSize: '14px',
                                }}>
                                {saving ? 'Saving…' : 'Save Changes'}
                            </button>
                        )}
                        <button
                            className="flex-1 font-semibold py-3 rounded-2xl border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{ background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: '14px' }}
                            onClick={() => setShowParams(false)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* ── Node Info Modal ── */}
        {showNodeInfo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                onClick={() => setShowNodeInfo(false)}>
                <div className="rounded-2xl p-6 flex flex-col w-full max-w-2xl"
                    style={{
                        background: "var(--bg-secondary)",
                        border: '1px solid var(--card-border)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)'
                    }}
                    onClick={e => e.stopPropagation()}>

                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-[17px] font-bold m-0" style={{ color: 'var(--text-primary)' }}>Node Information</h3>
                        <button onClick={() => setShowNodeInfo(false)}
                            className="flex items-center justify-center rounded-full bg-white border-none cursor-pointer p-0 transition-all hover:scale-110"
                            style={{
                                width: 24, height: 24, background: '#f5f5f5', color: '#3c3c43', fontSize: '18px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                            }}>
                            &times;
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-xl p-4 bg-[var(--bg-secondary)] border border-[var(--card-border)]">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Device Name</p>
                            <p className="text-sm font-bold mt-1 text-[var(--text-primary)]">{deviceName}</p>
                        </div>

                        <div className="rounded-xl p-4 bg-[var(--bg-secondary)] border border-[var(--card-border)]">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hardware ID</p>
                            <p className="text-sm font-bold mt-1 text-[var(--text-primary)]">{hardwareId}</p>
                        </div>

                        <div className="rounded-xl p-4 bg-[var(--bg-secondary)] border border-[var(--card-border)]">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Device Type</p>
                            <p className="text-sm font-bold mt-1 text-[var(--text-primary)]">3-Phase Motor Monitor</p>
                        </div>

                        <div className="rounded-xl p-4 bg-[var(--bg-secondary)] border border-[var(--card-border)]">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Location</p>
                            <p className="text-sm font-bold mt-1 text-[var(--text-primary)]">{zoneName || 'Not specified'}</p>
                        </div>

                        <div className="rounded-xl p-4 bg-[var(--bg-secondary)] border border-[var(--card-border)]">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Subscription</p>
                            <p className="text-sm font-bold mt-1 text-[var(--text-primary)]">PRO</p>
                        </div>

                        <div className="rounded-xl p-4 bg-[var(--bg-secondary)] border border-[var(--card-border)]">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned To</p>
                            <p className="text-sm font-bold mt-1 text-[var(--text-primary)]">{deviceInfo?.customer_name || 'Unassigned'}</p>
                        </div>
                    </div>

                    <div className="mt-6 flex gap-3">
                        <button
                            className="flex-1 font-semibold py-3 rounded-2xl text-white border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{ background: '#3A7AFE', fontSize: '14px' }}
                            onClick={() => {
                                const info = `Device Name: ${deviceName}\nHardware ID: ${hardwareId}\nDevice Type: 3-Phase Motor Monitor\nLocation: ${zoneName || 'Not specified'}\nSubscription: PRO\nAssigned To: ${deviceInfo?.customer_name || 'Unassigned'}`;
                                navigator.clipboard.writeText(info);
                                alert('Node information copied to clipboard!');
                            }}
                        >
                            Copy Info
                        </button>
                        <button
                            className="flex-1 font-semibold py-3 rounded-2xl border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{ background: '#f5f5f5', color: '#1c1c1e', fontSize: '14px' }}
                            onClick={() => setShowNodeInfo(false)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* ── Delete Confirmation Modal ── */}
        {showDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}
                onClick={() => !isDeleting && setShowDeleteConfirm(false)}>
                <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative" onClick={e => e.stopPropagation()}>
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                        <span className="material-icons text-red-500" style={{ fontSize: '32px' }}>delete_outline</span>
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-gray-900">Delete this Node?</h3>
                    <p className="text-xs text-gray-500 mb-6 leading-relaxed">
                        Are you sure you want to permanently commission-out <strong>{deviceName}</strong>? This action cannot be undone.
                    </p>
                    <div className="flex gap-3">
                        <button 
                            disabled={isDeleting}
                            onClick={handleDelete}
                            className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
                        >
                            {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                        </button>
                        <button 
                            disabled={isDeleting}
                            onClick={() => setShowDeleteConfirm(false)}
                            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )}

      {/* ── Main Dashboard Grid ── */}
      <div className="grid grid-cols-12 gap-6 mt-6">
        
        {/* Left Column: Motor Status & Volume */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          <div className="apple-glass-card rounded-3xl p-6 flex-1 flex flex-col items-center">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-8 w-full text-center">Motor Status</h2>
            
            <div className="mb-10">
              <span className={clsx(
                "px-8 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg transition-all",
                isRunning ? "bg-green-500/20 text-green-600 border border-green-500/30" : "bg-red-500/20 text-red-600 border border-red-500/30"
              )}>
                {isRunning ? "Running" : "Stopped"}
              </span>
            </div>
            <div className="w-full space-y-8">

              <div className="flex justify-between items-center group">
                <span className="text-slate-500 font-bold group-hover:text-blue-600 transition-colors">Voltage (L-L)</span>
                <span className="text-xl font-black text-slate-800">{voltageValue ? Math.round(voltageValue) : '—'} <span className="text-sm font-bold text-slate-400 ml-1">V</span></span>
              </div>
              <div className="flex justify-between items-center group">
                <span className="text-slate-500 font-bold group-hover:text-blue-600 transition-colors">Current (Avg)</span>
                <span className="text-xl font-black text-blue-600">{currentValue ? currentValue.toFixed(1) : '—'} <span className="text-sm font-bold text-blue-400 ml-1">A</span></span>
              </div>
              <div className="flex justify-between items-center group">
                <span className="text-slate-500 font-bold group-hover:text-blue-600 transition-colors">Power (kW)</span>
                <span className="text-xl font-black text-slate-800">{powerValue ? powerValue.toFixed(1) : '—'} <span className="text-sm font-bold text-slate-400 ml-1">kW</span></span>
              </div>
              <div className="flex justify-between items-center group">
                <span className="text-slate-500 font-bold group-hover:text-blue-600 transition-colors">Frequency</span>
                <span className="text-xl font-black text-slate-800">{frequencyValue ? frequencyValue.toFixed(1) : '—'} <span className="text-sm font-bold text-slate-400 ml-1">Hz</span></span>
              </div>
            </div>
            
            <div className="mt-auto pt-8 w-full">
              <button 
                onClick={() => setShowParams(true)}
                className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-xl transition-all flex items-center justify-center gap-2 border border-dashed border-slate-200"
              >
                <Settings size={16} />
                <span className="text-[10px] font-black uppercase tracking-wider">Configure Limits</span>
              </button>
            </div>
          </div>

          {/* Water Level & Volume Card */}
          <div className="apple-glass-card rounded-3xl p-6 text-center">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6">Water Level & Volume</h2>
            {fieldWaterLevel ? (
              <>
                <div className="mb-6">
                  <p className="text-4xl font-black text-blue-600 leading-none">{levelValue}%</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Water Level</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-800 leading-none">{volumeLitres.toLocaleString()} <span className="text-sm text-slate-400 ml-1">L</span></p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Volume</p>
                </div>
              </>
            ) : (
              <p className="text-xs font-bold text-slate-400 py-6 uppercase tracking-widest leading-relaxed">
                Water level monitoring<br />not configured
              </p>
            )}
          </div>
        </div>

        {/* Middle Column: Building Visualization */}
        <div className="col-span-12 lg:col-span-6">
          <div className="apple-glass-card rounded-3xl p-6 h-full min-h-[600px] relative overflow-hidden flex flex-col items-center justify-center">
            {/* ── Realistic System Visualization ── */}
            <div className="relative w-full h-full min-h-[550px] flex items-center justify-center">
              <svg width="100%" height="100%" viewBox="0 0 500 600" className="max-w-[500px] drop-shadow-2xl">
                <g transform="translate(30, 0)">
                  {/* Building Base/Foundation */}
                  <rect x="120" y="520" width="300" height="20" fill="#718096" />
                  <rect x="130" y="515" width="280" height="5" fill="#A0AEC0" />

                  {/* Multi-story Building Body */}
                  <rect x="130" y="240" width="280" height="275" fill="#F7FAFC" stroke="#CBD5E0" strokeWidth="2" />
                  
                  {/* Floor Dividers */}
                  {[0, 1, 2, 3].map(i => (
                    <rect key={`floor-${i}`} x="130" y={305 + i * 68} width="280" height="4" fill="#E2E8F0" />
                  ))}

                  {/* Windows */}
                  {[0, 1, 2, 3].map(row => (
                    <React.Fragment key={`win-row-${row}`}>
                      {[0, 1, 2].map(col => {
                        if (row === 3 && col === 2) return null;
                        
                        return (
                          <g key={`win-${row}-${col}`} transform={`translate(${165 + col * 90}, ${265 + row * 68})`}>
                            <rect width="40" height="35" fill="#BEE3F8" stroke="#4A5568" strokeWidth="1.5" />
                            <rect x="1" y="1" width="38" height="33" fill="url(#windowGlass)" />
                            <line x1="20" y1="0" x2="20" y2="35" stroke="#4A5568" strokeWidth="1" />
                          </g>
                        );
                      })}
                    </React.Fragment>
                  ))}

                  {/* Double Door Entrance */}
                  <g transform="translate(340, 445)">
                    <rect width="50" height="70" fill="#4A2C2A" stroke="#2D3748" strokeWidth="1" />
                    <rect width="24" height="70" fill="#3D2321" />
                    <circle cx="20" cy="35" r="2" fill="#ECC94B" />
                    <circle cx="30" cy="35" r="2" fill="#ECC94B" />
                  </g>

                  {/* Overhead Tank System */}
                  <g transform="translate(165, 115)">
                    <defs>
                      <clipPath id="tankInner">
                        <rect x="2" y="2" width="206" height="121" rx="3" />
                      </clipPath>
                    </defs>

                    {/* Main Tank Body */}
                    <rect width="210" height="125" rx="4" fill="white" stroke="#4A5568" strokeWidth="2" />
                    
                    {/* Water Level Indicator */}
                    <g clipPath="url(#tankInner)">
                      {/* Scale height of water based on levelValue */}
                      <rect x="4" y={121 - (levelValue * 1.15)} width="202" height={levelValue * 1.15} fill="url(#tankWater)" rx="2" opacity="0.4" />
                      
                      {/* Wave Surface Layer 1 */}
                      <path 
                        d={`M -50 ${121 - (levelValue * 1.15)} Q -25 ${111 - (levelValue * 1.15)} 0 ${121 - (levelValue * 1.15)} T 50 ${121 - (levelValue * 1.15)} T 100 ${121 - (levelValue * 1.15)} T 150 ${121 - (levelValue * 1.15)} T 200 ${121 - (levelValue * 1.15)} T 250 ${121 - (levelValue * 1.15)} V 121 H -50 Z`} 
                        fill="url(#tankWater)" 
                        className={clsx(isRunning && "animate-wave")}
                        style={{ opacity: 0.8 }}
                      />
                      
                      {/* Wave Surface Layer 2 */}
                      <path 
                        d={`M -50 ${126 - (levelValue * 1.15)} Q -25 ${116 - (levelValue * 1.15)} 0 ${126 - (levelValue * 1.15)} T 50 ${126 - (levelValue * 1.15)} T 100 ${126 - (levelValue * 1.15)} T 150 ${126 - (levelValue * 1.15)} T 200 ${126 - (levelValue * 1.15)} T 250 ${126 - (levelValue * 1.15)} V 121 H -50 Z`} 
                        fill="#3182CE" 
                        className={clsx(isRunning && "animate-wave-reverse")}
                        style={{ opacity: 0.3 }}
                      />

                      {/* Bubbles - Only when running */}
                      {isRunning && (
                        <g>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <circle 
                              key={i}
                              cx={40 + i * 30}
                              cy={100}
                              r={1.5 + Math.random() * 2}
                              fill="white"
                              fillOpacity="0.6"
                              className="animate-bubble"
                              style={{ animationDelay: `${i * 0.4}s` }}
                            />
                          ))}
                        </g>
                      )}
                    </g>
                    {/* Tank Rim */}
                    <rect width="210" height="8" fill="#CBD5E0" stroke="#4A5568" strokeWidth="1" rx="2" />
                  </g>

                  {/* Water Level Sensor */}
                  <g transform="translate(250, 40)">
                    <rect x="-12" y="0" width="24" height="15" rx="2" fill="#4A5568" stroke="#1A202C" strokeWidth="1" />
                    <rect x="-8" y="15" width="16" height="8" fill="#2D3748" stroke="#1A202C" strokeWidth="1" />
                    <rect x="-4" y="23" width="8" height="5" fill="#1A202C" />
                    <text x="25" y="18" className="text-[10px] font-black fill-slate-500 uppercase tracking-widest">Water Level Sensor</text>
                    <line x1="-2" y1="30" x2="-2" y2={121 - (levelValue * 1.15) + 115} stroke="#48BB78" strokeWidth="2" strokeDasharray="6 4" />
                  </g>

                  {/* Main Pumping Pipe */}
                  <path 
                    d="M 30 490 L 30 100 Q 30 80 50 80 L 170 80 Q 190 80 190 100" 
                    fill="none" 
                    stroke="#2D3748" 
                    strokeWidth="15" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                  />
                  <path 
                    d="M 30 490 L 30 100 Q 30 80 50 80 L 170 80 Q 190 80 190 100" 
                    fill="none" 
                    stroke="url(#pipeGradient)" 
                    strokeWidth="11" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                  />
  
                  {/* Flow Animation (Dotted Line) */}
                  {isRunning && (
                    <path 
                      d="M 33 490 L 33 100 Q 33 80 53 80 L 173 80 Q 193 80 193 110" 
                      fill="none" 
                      stroke="white" 
                      strokeWidth="4" 
                      strokeDasharray="10 20" 
                      strokeLinecap="round"
                      className="animate-flow-path"
                      opacity="0.6"
                    />
                  )}

                  {/* Pipe Rings */}
                  <rect x="22" y="105" width="16" height="4" rx="1" fill="#4A5568" />
                  <rect x="55" y="77" width="4" height="6" rx="1" fill="#4A5568" />
                  <rect x="165" y="77" width="4" height="6" rx="1" fill="#4A5568" />
                </g>

                <defs>
                  <linearGradient id="windowGlass" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#EBF8FF" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#3182CE" stopOpacity="0.4" />
                  </linearGradient>
                  <linearGradient id="tankWater" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#63B3ED" />
                    <stop offset="100%" stopColor="#3182CE" />
                  </linearGradient>
                  <linearGradient id="pipeGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#A0AEC0" />
                    <stop offset="50%" stopColor="#CBD5E0" />
                    <stop offset="100%" stopColor="#718096" />
                  </linearGradient>
                </defs>
              </svg>

              {/* High-Fidelity 3D Industrial Motor */}
              <div className={clsx(
                "absolute left-[15px] bottom-[50px] z-30 scale-[0.9] origin-bottom transition-all duration-500",
                isRunning && "animate-motor-shake"
              )}>
                <img 
                  src="/ops.png" 
                  alt="Motor Monitor" 
                  className="w-[160px] drop-shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
                />
              </div>
            </div>

            <style>{`
              @keyframes flow-path {
                from { stroke-dashoffset: 60; }
                to { stroke-dashoffset: 0; }
              }
              .animate-flow-path {
                animation: flow-path 1.5s linear infinite;
              }
              @keyframes motor-shake {
                0% { transform: translate(0, 0) rotate(0deg); }
                25% { transform: translate(0.5px, -0.5px) rotate(0.05deg); }
                50% { transform: translate(-0.5px, 0.5px) rotate(-0.05deg); }
                75% { transform: translate(0.5px, 0.5px) rotate(0.05deg); }
                100% { transform: translate(0, 0) rotate(0deg); }
              }
              .animate-motor-shake {
                animation: motor-shake 0.1s linear infinite;
              }
              @keyframes wave-move {
                0% { transform: translateX(0); }
                50% { transform: translateX(-15px); }
                100% { transform: translateX(0); }
              }
              .animate-wave {
                animation: wave-move 3s ease-in-out infinite;
              }
              @keyframes wave-move-reverse {
                0% { transform: translateX(-15px); }
                50% { transform: translateX(0); }
                100% { transform: translateX(-15px); }
              }
              .animate-wave-reverse {
                animation: wave-move-reverse 4s ease-in-out infinite;
              }
              @keyframes bubble-rise {
                0% { transform: translateY(0) scale(0); opacity: 0; }
                20% { opacity: 0.8; }
                100% { transform: translateY(-40px) scale(1.5); opacity: 0; }
              }
              .animate-bubble {
                animation: bubble-rise 2s ease-out infinite;
              }
            `}</style>
          </div>
        </div>

        {/* Right Column: Control & Stats */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          
          {/* Motor Control */}
          <div className="apple-glass-card rounded-3xl p-6">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6 text-center">Motor Monitor</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button 
                onClick={() => setSimRunning(true)}
                className={clsx(
                  "flex flex-col items-center justify-center gap-2 p-4 rounded-xl shadow-lg transition-all active:scale-95 group",
                  isRunning ? "bg-[#28A745] text-white cursor-default" : "bg-slate-100 hover:bg-[#28A745] text-slate-400 hover:text-white"
                )}
              >
                <Play size={20} className={clsx("transition-transform group-hover:scale-110", isRunning ? "fill-white" : "fill-slate-400 group-hover:fill-white")} />
                <span className="text-[10px] font-black uppercase tracking-widest">Start</span>
              </button>
              <button 
                onClick={() => setSimRunning(false)}
                className={clsx(
                  "flex flex-col items-center justify-center gap-2 p-4 rounded-xl shadow-lg transition-all active:scale-95 group",
                  !isRunning ? "bg-[#DC3545] text-white cursor-default" : "bg-slate-100 hover:bg-[#DC3545] text-slate-400 hover:text-white"
                )}
              >
                <Square size={20} className={clsx("transition-transform group-hover:scale-110", !isRunning ? "fill-white" : "fill-slate-400 group-hover:fill-white")} />
                <span className="text-[10px] font-black uppercase tracking-widest">Stop</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Mode</span>
                <span className="text-sm font-black text-green-600">Manual</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
                <span className={clsx(
                  "text-sm font-black uppercase transition-colors",
                  isRunning ? "text-green-600" : "text-red-600"
                )}>
                  {isRunning ? "Running" : "Stopped"}
                </span>
              </div>
            </div>
          </div>

          {/* Water Level Trend */}
          <div className="apple-glass-card rounded-3xl p-4 flex-1 flex flex-col">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 px-2">Water Level Trend (Today)</h2>
            <div className="flex-1 min-h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3182CE" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3182CE" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="level" 
                    stroke="#3182CE" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorLevel)" 
                  />
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '12px', 
                      border: 'none', 
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}
                    labelStyle={{ color: '#718096' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between px-2 mt-2">
              <span className="text-[8px] font-bold text-slate-400">00:00</span>
              <span className="text-[8px] font-bold text-slate-400">12:00</span>
              <span className="text-[8px] font-bold text-slate-400">24:00</span>
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="col-span-12 lg:col-span-6 grid grid-cols-1 md:grid-cols-1 gap-6">
           {/* Current Consumption Chart */}
           <div className="apple-glass-card rounded-3xl p-8">
             <div className="flex justify-between items-end mb-6">
               <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Current Consumption (Today)</h2>
               <div className="text-right">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Average Current</p>
                 <p className="text-xl font-black text-blue-600">{currentValue ? currentValue.toFixed(1) : '—'} <span className="text-sm font-bold text-blue-400">A</span></p>
               </div>
             </div>
             <div className="h-[200px]">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4A90E2" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#4A90E2" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF2F7" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#A0AEC0', fontWeight: 'bold' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#A0AEC0', fontWeight: 'bold' }} />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="current" 
                      stroke="#4A90E2" 
                      strokeWidth={4}
                      fillOpacity={1} 
                      fill="url(#colorCurrent)" 
                      dot={{ r: 4, fill: '#4A90E2', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </AreaChart>
               </ResponsiveContainer>
             </div>
           </div>
        </div>

        <div className="col-span-12 lg:col-span-3">
          <div className="apple-glass-card rounded-3xl p-8 h-full">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-8 text-center">Today's Summary</h2>
            <div className="grid grid-cols-1 gap-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500">
                  <Clock size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">System Run Time</p>
                  <p className="text-xl font-black text-slate-800">{isRunning ? "02:35:20" : "00:00:00"}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-500">
                  <Play size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">Cycle Count</p>
                  <p className="text-xl font-black text-slate-800">{isRunning ? "8" : "0"}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
                  <Zap size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">Energy (kWh)</p>
                  <p className="text-xl font-black text-slate-800">{powerValue ? (powerValue * 2.5).toFixed(2) : "0.00"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-3">
          <div className="apple-glass-card rounded-3xl p-8 h-full flex flex-col items-center justify-center relative overflow-hidden">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-8 absolute top-6">Recent Alarms</h2>
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-4 border-4 border-white shadow-sm">
                <CheckCircle2 size={40} className="text-green-500" />
              </div>
              <p className="text-lg font-black text-green-600">No Active Alarms</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">System healthy</p>
            </div>
            <button className="mt-8 text-[10px] font-black uppercase tracking-widest text-blue-500 hover:underline">
              View History
            </button>
          </div>
        </div>

      </div>
      </main>
    </div>
  );
};

export default EvaraMotorAnalytics;
