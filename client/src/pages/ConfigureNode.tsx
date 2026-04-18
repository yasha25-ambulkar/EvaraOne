import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Settings, Loader2 } from 'lucide-react';
import tankIcon from '../../public/tank.png';
import tdsIcon from '../../public/tds.png';
import { adminService } from '../services/admin';
import { deviceService } from '../services/DeviceService';
import { useToast } from '../components/ToastProvider';


const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onChange}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none 
                ${checked ? 'bg-[#0077ff]' : 'bg-[#e2e8f0]'}`}
        >
            <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                    ${checked ? 'translate-x-5' : 'translate-x-0'}`}
            />
        </button>
    );
};

const GreenTextToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onChange}
            className={`relative inline-flex h-[28px] w-[54px] flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none overflow-hidden items-center shadow-sm
                ${checked ? 'bg-[#34C759]' : 'bg-[#cbd5e1]'}`}
        >
            <span
                className={`absolute text-[10px] font-[900] tracking-wider text-white transition-opacity duration-200 ease-in-out left-1.5`}
                style={{ opacity: checked ? 1 : 0 }}
            >
                ON
            </span>
            <span
                className={`absolute text-[10px] font-[900] tracking-wider text-slate-500 transition-opacity duration-200 ease-in-out right-1.5`}
                style={{ opacity: checked ? 0 : 1 }}
            >
                OFF
            </span>
            <span
                className={`pointer-events-none inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out z-10
                    ${checked ? 'translate-x-[26px]' : 'translate-x-0'}`}
            />
        </button>
    );
};

// Maps UI parameter keys → Firestore customer_config keys
const PARAM_CONFIG = [
    { key: 'showMap', label: 'Map View', description: 'Show or hide this node on the global map' },
    { key: 'showTankLevel', label: 'Tank Water Level', description: 'Track real-time tank level' },
    { key: 'showEstimations', label: 'Estimations', description: 'Predictive usage and time-to-fill' },
    { key: 'showFillRate', label: 'Fill Rate', description: 'Monitor incoming water flow' },
    { key: 'showConsumption', label: 'Consumption', description: 'Track water usage over time' },
    { key: 'showAlerts', label: 'Active Alerts', description: 'System warnings and notifications' },
    { key: 'showDeviceHealth', label: 'Device Health', description: 'Monitor sensor and connection status' },
    { key: 'showVolume', label: 'Tank Water Volume', description: 'Total capacity and current volume' },
];

// Default state: all parameters ON
const DEFAULT_CONFIG: Record<string, boolean> = {
    showMap: true,
    showTankLevel: true,
    showEstimations: true,
    showFillRate: true,
    showConsumption: true,
    showAlerts: true,
    showDeviceHealth: true,
    showVolume: true,
};

const ConfigureNode = () => {
    const navigate = useNavigate();
    // KEY CHANGE: Get device id from URL params
    const { id: deviceId } = useParams<{ id: string }>();
    const { showToast } = useToast();

    const [globalStatus, setGlobalStatus] = useState(true);
    const [config, setConfig] = useState<Record<string, boolean>>(DEFAULT_CONFIG);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [deviceName, setDeviceName] = useState<string>('');

    // KEY CHANGE: Load existing config from backend on mount
    useEffect(() => {
        if (!deviceId) {
            setIsLoading(false);
            return;
        }

        const loadConfig = async () => {
            try {
                // Priority 1: Navigation State (Fastest)
                const stateData = (window.history.state as any)?.usr?.device;
                
                // Priority 2: API Fetch (Reliable on Refresh)
                const deviceData = stateData || await deviceService.getNodeDetails(deviceId);
                
                if (deviceData?.customer_config) {
                    setConfig({ ...DEFAULT_CONFIG, ...deviceData.customer_config });
                }
                if (deviceData?.isVisibleToCustomer !== undefined) {
                    setGlobalStatus(deviceData.isVisibleToCustomer);
                }
                const name = deviceData?.label || deviceData?.device_name || deviceData?.name || '';
                if (name) setDeviceName(name);
            } catch (err) {
                console.error("Failed to load device config:", err);
                showToast("Failed to load device configuration", "error");
            } finally {
                setIsLoading(false);
            }
        };

        loadConfig();
    }, [deviceId, showToast]);

    // Toggle a single parameter
    const toggleParam = (key: string) => {
        setConfig(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // KEY CHANGE: Save Changes now updates both visibility and parameters
    const handleSaveChanges = async () => {
        if (!deviceId) {
            showToast("No device selected", "error");
            return;
        }

        setIsSaving(true);
        try {
            // Save both Global Visibility and Parameter Config
            await Promise.all([
                adminService.updateDeviceVisibility(deviceId, globalStatus),
                adminService.updateDeviceParameters(deviceId, config)
            ]);
            
            showToast("Configuration saved successfully", "success");
        } catch (err: any) {
            console.error("Failed to save configuration:", err);
            showToast("Failed to save configuration", "error");
        } finally {
            setIsSaving(false);
        }
    };


    // Restore all parameters to ON
    const handleRestoreDefaults = () => {
        setConfig(DEFAULT_CONFIG);
        showToast("Defaults restored — click Save to apply", "success");
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen font-sans relative overflow-x-hidden bg-transparent">
            <main className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8" style={{ zIndex: 1 }}>

                <div className="max-w-[1000px] mx-auto flex flex-col gap-4">
                    {/* Page Header */}
                    <div className="flex flex-col gap-0 mb-0">
                        <button
                            onClick={() => navigate(-1)}
                            className="w-fit flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#0077ff] bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors border-none cursor-pointer mb-2"
                        >
                            <ArrowLeft size={14} /> Back
                        </button>

                        <div className="flex justify-between items-center w-full">
                            <div>
                                <div className="flex items-center gap-3">
                                    <Settings size={22} style={{ color: '#64748b' }} />
                                    <h2 className="text-[28px] font-bold m-0" style={{ letterSpacing: '-0.5px', color: 'var(--configure-heading-color)' }}>
                                        Configuration
                                    </h2>
                                </div>
                                <p className="text-[15px] font-medium m-0 mt-0.5" style={{ color: 'var(--configure-subtext-color)' }}>
                                    Manage system parameters and controls
                                </p>
                            </div>

                            <div className="flex items-center justify-center">
                                <GreenTextToggleSwitch checked={globalStatus} onChange={() => setGlobalStatus(!globalStatus)} />
                            </div>
                        </div>
                    </div>

                    {/* Main Content Card */}
                    <div className="apple-glass-card rounded-[2rem] p-8 md:p-10" style={{
                        background: 'var(--configure-card-bg)',
                        backdropFilter: 'blur(24px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                        border: '1px solid var(--configure-card-border)',
                        boxShadow: 'var(--configure-card-shadow)'
                    }}>
                        <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200/50">
                            <div className="flex items-center gap-3">
                                <img src={deviceName?.toLowerCase().includes('tds') ? tdsIcon : tankIcon} alt="Icon" className="w-8 h-8 object-contain" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }} />
                                <h3 className="text-xl font-bold m-0" style={{ color: 'var(--configure-heading-color)' }}>{deviceName ? `${deviceName} Parameters` : 'EvaraTank Parameters'}</h3>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-[#34C759]/10 text-[#28a745] border border-[#34C759]/20 shadow-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse"></span>
                                LIVE SYNC
                            </div>
                        </div>

                        {/* KEY CHANGE: Toggles rendered dynamically from PARAM_CONFIG */}
                        <div className="flex flex-col gap-7">
                            {PARAM_CONFIG.map((param, index) => (
                                <div key={param.key} className={`flex justify-between items-center group ${index === PARAM_CONFIG.length - 1 ? 'pb-2' : ''}`}>
                                    <div className="flex flex-col">
                                        <h4 className="text-[15px] font-bold m-0" style={{ color: 'var(--configure-heading-color)' }}>{param.label}</h4>
                                        <p className="text-[13px] font-medium m-0 mt-1.5" style={{ color: 'var(--configure-subtext-color)' }}>{param.description}</p>
                                    </div>
                                    <ToggleSwitch
                                        checked={config[param.key] ?? true}
                                        onChange={() => toggleParam(param.key)}
                                    />
                                </div>
                            ))}

                            {/* Divider */}
                            <div className="w-full h-px bg-slate-200/60 mt-2 mb-2"></div>

                            {/* Bottom Actions */}
                            <div className="flex justify-between items-center mt-2">
                                <button
                                    onClick={handleRestoreDefaults}
                                    className="text-[14px] font-bold text-[#64748b] hover:text-[#1c2b4f] transition-colors bg-transparent border-none cursor-pointer p-0"
                                >
                                    Restore Defaults
                                </button>
                                <button
                                    onClick={handleSaveChanges}
                                    disabled={isSaving}
                                    className="px-8 flex items-center justify-center gap-2 rounded-full font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] border-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                                    style={{
                                        height: '46px',
                                        background: 'linear-gradient(180deg, #4da4ff 0%, #0077ff 100%)',
                                        boxShadow: '0 8px 16px rgba(0, 119, 255, 0.25), inset 0 1px 1px rgba(255,255,255,0.3)',
                                        fontSize: '14.5px',
                                        letterSpacing: '0.2px'
                                    }}
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Save Changes'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ConfigureNode;
