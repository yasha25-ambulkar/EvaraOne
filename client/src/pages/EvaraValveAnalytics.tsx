import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import api from '../services/api';
import clsx from 'clsx';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
    ComposedChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer
} from 'recharts';
import { Play, Square, Settings2, RotateCcw } from 'lucide-react';
import { useDeviceAnalytics } from '../hooks/useDeviceAnalytics';
import { useRealtimeTelemetry } from '../hooks/useRealtimeTelemetry';
import useThingSpeakReader from '../hooks/useThingSpeakReader';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_SHUTOFF_LIMIT_L = 25;
const MAX_SNAPSHOT_RETRIES = 3;
const MAX_POLL_FAILURES = 3;
const LS_KEY = (id: string) => `evara_valve_session_${id}`;

// ─── Session persistence helpers ─────────────────────────────────────────────
interface ValveSession {
    startVolume: number;
    shutoffLimit: number;
    deliveredVolume: number;
    valveOpen: boolean;
    savedAt: number;
}

const saveSession = (hardwareId: string, session: ValveSession) => {
    try {
        localStorage.setItem(LS_KEY(hardwareId), JSON.stringify(session));
    } catch { /* ignore */ }
};

const loadSession = (hardwareId: string): ValveSession | null => {
    try {
        const raw = localStorage.getItem(LS_KEY(hardwareId));
        if (!raw) return null;
        const parsed: ValveSession = JSON.parse(raw);
        // Discard sessions older than 24 hours
        if (Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
            localStorage.removeItem(LS_KEY(hardwareId));
            return null;
        }
        return parsed;
    } catch { return null; }
};

const clearSession = (hardwareId: string) => {
    try { localStorage.removeItem(LS_KEY(hardwareId)); } catch { /* ignore */ }
};

// ─── Valve Limit Left Panel ───────────────────────────────────────────────────
const ValveLimitPanel = ({
    hardwareId,
    initialShutoffLimit = null,
    onLimitSaved,
    tsChannel,
    tsReadKey,
    totalVolumeField,
    currentTotalVolume,
    currentFlowRate,
}: {
    hardwareId?: string;
    initialShutoffLimit?: number | null;
    onLimitSaved?: (limit: number) => void;
    tsChannel?: string;
    tsReadKey?: string;
    totalVolumeField?: string;
    currentTotalVolume?: number | null;
    currentFlowRate?: number | null;
}) => {
    const radius = 80;
    const strokeWidth = 16;
    const circumference = 2 * Math.PI * radius;
    const totalAngle = 270;
    const arcLength = (totalAngle / 360) * circumference;

    // Valve state
    const [status, setStatus] = useState<'OPEN' | 'CLOSED' | 'TRANSITIONING'>('CLOSED');
    const [valveError, setValveError] = useState<string | null>(null);

    // Shutoff limit state
    const [shutoffInput, setShutoffInput] = useState<string>(() =>
        initialShutoffLimit != null && initialShutoffLimit > 0
            ? String(initialShutoffLimit)
            : String(DEFAULT_SHUTOFF_LIMIT_L)
    );
    const [shutoffLimit, setShutoffLimit] = useState<number | null>(() =>
        initialShutoffLimit != null && initialShutoffLimit > 0 ? initialShutoffLimit : null
    );
    const [limitError, setLimitError] = useState<string | null>(null);
    const [isSavingLimit, setIsSavingLimit] = useState(false);

    // Snapshot-based volume tracking
    const startVolumeRef = useRef<number | null>(null);
    const [deliveredVolume, setDeliveredVolume] = useState<number>(0);
    const [displayDeliveredVolume, setDisplayDeliveredVolume] = useState<number>(0);
    const autoCloseFiredRef = useRef(false);
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollFailCountRef = useRef<number>(0);          // S8: consecutive poll failures
    const sessionActiveRef = useRef<boolean>(false);     // tracks if session is running
    const deliveredVolumeRef = useRef<number>(0);
    const lastSnapshotAtRef = useRef<number>(Date.now());
    const liveEstimateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const flowRateRef = useRef<number>(0);

    useEffect(() => {
        const rate = Number(currentFlowRate);
        flowRateRef.current = Number.isFinite(rate) && rate > 0 ? rate : 0;
    }, [currentFlowRate]);

    useEffect(() => {
        deliveredVolumeRef.current = deliveredVolume;
        setDisplayDeliveredVolume((prev) => Math.max(prev, deliveredVolume));
    }, [deliveredVolume]);

    // ── S9: Restore session from localStorage on mount ───────────────────────
    useEffect(() => {
        if (!hardwareId) return;
        const session = loadSession(hardwareId);
        if (!session) return;

        // Restore state
        startVolumeRef.current = session.startVolume;
        setDeliveredVolume(session.deliveredVolume);
        setDisplayDeliveredVolume(session.deliveredVolume);
        deliveredVolumeRef.current = session.deliveredVolume;
        lastSnapshotAtRef.current = Date.now();
        setShutoffLimit(session.shutoffLimit);
        setShutoffInput(String(session.shutoffLimit));

        if (session.valveOpen) {
            // Valve was open when page was refreshed — resume polling
            setStatus('OPEN');
            sessionActiveRef.current = true;
            startPolling(session.startVolume, session.shutoffLimit, session.deliveredVolume);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hardwareId]);

    useEffect(() => {
        if (initialShutoffLimit != null && initialShutoffLimit > 0) {
            setShutoffLimit(initialShutoffLimit);
            setShutoffInput(String(initialShutoffLimit));
        }
    }, [initialShutoffLimit]);

    // ── Cleanup on unmount ───────────────────────────────────────────────────
    useEffect(() => () => stopPolling(), []);

    // ── Fetch latest field1 from ThingSpeak ──────────────────────────────────
    const fetchCurrentTotalVolume = async (): Promise<number | null> => {
        if (typeof currentTotalVolume === 'number' && Number.isFinite(currentTotalVolume)) {
            return currentTotalVolume;
        }

        if (!tsChannel) return null;
        try {
            const url = `https://api.thingspeak.com/channels/${encodeURIComponent(tsChannel)}/feeds/last.json`;
            const params: Record<string, string> = {};
            if (tsReadKey) params.api_key = tsReadKey;
            const res = await axios.get(url, { params, timeout: 8000 });
            const field = totalVolumeField || 'field1';
            const raw = res.data?.[field];
            if (raw == null || String(raw).trim() === '') return null;
            const n = parseFloat(String(raw));
            return Number.isFinite(n) ? n : null;
        } catch {
            return null;
        }
    };

    // ── S7: Fetch with retries ────────────────────────────────────────────────
    const fetchWithRetry = async (retries = MAX_SNAPSHOT_RETRIES): Promise<number | null> => {
        for (let i = 0; i < retries; i++) {
            const result = await fetchCurrentTotalVolume();
            if (result !== null) return result;
            if (i < retries - 1) await new Promise(r => setTimeout(r, 2000));
        }
        return null;
    };

    // ── Write CLOSED to Firebase with retry (S15) ────────────────────────────
    const writeClosedToFirebase = async (retries = 3): Promise<boolean> => {
        for (let i = 0; i < retries; i++) {
            try {
                if (!hardwareId || !db) return false;
                const valveRef = doc(db, 'devices', hardwareId);
                await updateDoc(valveRef, { valve_status: 'CLOSED' });
                return true;
            } catch {
                if (i < retries - 1) await new Promise(r => setTimeout(r, 1500));
            }
        }
        return false;
    };

    // ── Polling ───────────────────────────────────────────────────────────────
    const startPolling = (startVolume: number, limit: number, resumeFrom = 0) => {
        stopPolling();
        pollFailCountRef.current = 0;
        sessionActiveRef.current = true;
        lastSnapshotAtRef.current = Date.now();

        pollIntervalRef.current = setInterval(async () => {
            const current = await fetchCurrentTotalVolume();

            // S8: count consecutive failures
            if (current === null) {
                pollFailCountRef.current += 1;
                if (pollFailCountRef.current >= MAX_POLL_FAILURES) {
                    // ThingSpeak down too long — close valve for safety
                    stopPolling();
                    sessionActiveRef.current = false;
                    const closed = await writeClosedToFirebase();
                    if (closed) {
                        setStatus('CLOSED');
                        setValveError(`ThingSpeak unreachable after ${MAX_POLL_FAILURES} attempts. Valve closed for safety.`);
                        if (hardwareId) clearSession(hardwareId);
                    } else {
                        // S15: Firebase write also failed — keep retrying auto-close
                        autoCloseFiredRef.current = false;
                        setValveError('ThingSpeak AND Firebase unreachable. Check connections immediately.');
                    }
                }
                return;
            }

            // Reset failure counter on success
            pollFailCountRef.current = 0;

            const delivered = Math.max(resumeFrom, Math.max(0, current - startVolume));
            setDeliveredVolume(delivered);
            setDisplayDeliveredVolume(delivered);
            deliveredVolumeRef.current = delivered;
            lastSnapshotAtRef.current = Date.now();

            // S9: persist session to localStorage
            if (hardwareId) {
                saveSession(hardwareId, {
                    startVolume,
                    shutoffLimit: limit,
                    deliveredVolume: delivered,
                    valveOpen: true,
                    savedAt: Date.now(),
                });
            }

            if (delivered >= limit) {
                void closeValveAtLimit(startVolume, limit, delivered);
            }
        }, 15000);
    };

    const closeValveAtLimit = async (startVolume: number, limit: number, deliveredAtClose: number) => {
        if (autoCloseFiredRef.current) return;
        autoCloseFiredRef.current = true;
        stopPolling();
        sessionActiveRef.current = false;
        setStatus('TRANSITIONING');

        const closed = await writeClosedToFirebase();
        if (closed) {
            setStatus('CLOSED');
            setDeliveredVolume(deliveredAtClose);
            setDisplayDeliveredVolume(deliveredAtClose);
            if (hardwareId) clearSession(hardwareId);
            return;
        }

        autoCloseFiredRef.current = false;
        setValveError('Auto-close failed. Retrying...');
        setStatus('OPEN');
        startPolling(startVolume, limit, deliveredAtClose);
    };

    const stopPolling = () => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
        if (liveEstimateTimerRef.current) {
            clearInterval(liveEstimateTimerRef.current);
            liveEstimateTimerRef.current = null;
        }
        sessionActiveRef.current = false;
    };

    // Gauge calculation
    const gaugeMax = shutoffLimit != null && shutoffLimit > 0 ? shutoffLimit : DEFAULT_SHUTOFF_LIMIT_L;
    useEffect(() => {
        if (!sessionActiveRef.current || status !== 'OPEN') {
            setDisplayDeliveredVolume(deliveredVolume);
            return;
        }

        const tick = () => {
            const actual = deliveredVolumeRef.current;
            const rate = flowRateRef.current;
            if (!rate || rate <= 0) {
                setDisplayDeliveredVolume(actual);
                return;
            }

            const elapsedMinutes = Math.max(0, (Date.now() - lastSnapshotAtRef.current) / 60000);
            const estimated = actual + elapsedMinutes * rate;
            setDisplayDeliveredVolume(Math.min(gaugeMax, Math.max(actual, estimated)));
        };

        tick();
        if (liveEstimateTimerRef.current) {
            clearInterval(liveEstimateTimerRef.current);
        }
        liveEstimateTimerRef.current = setInterval(tick, 1000);

        return () => {
            if (liveEstimateTimerRef.current) {
                clearInterval(liveEstimateTimerRef.current);
                liveEstimateTimerRef.current = null;
            }
        };
    }, [deliveredVolume, gaugeMax, status]);

    const liveDeliveredVolume = Math.min(gaugeMax, displayDeliveredVolume);
    const remainingLitres = Math.max(0, gaugeMax - liveDeliveredVolume);
    const percentage = gaugeMax > 0 ? Math.min(100, (liveDeliveredVolume / gaugeMax) * 100) : 0;
    const offset = arcLength - (percentage / 100) * arcLength;

    useEffect(() => {
        if (status !== 'OPEN') return;
        if (autoCloseFiredRef.current) return;
        if (startVolumeRef.current === null) return;
        if (liveDeliveredVolume < gaugeMax) return;

        void closeValveAtLimit(startVolumeRef.current, gaugeMax, liveDeliveredVolume);
    }, [gaugeMax, liveDeliveredVolume, status]);

    // ── Persist limit to Firebase ─────────────────────────────────────────────
    const persistShutoffLimit = async (limit: number): Promise<boolean> => {
        if (!hardwareId) { setLimitError('Device ID not available'); return false; }
        if (!db) { setLimitError('Firebase not initialized'); return false; }
        setIsSavingLimit(true);
        setLimitError(null);
        try {
            const valveRef = doc(db, 'devices', hardwareId);
            await updateDoc(valveRef, { auto_shutoff_limit: limit });
            onLimitSaved?.(limit);
            return true;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to save limit';
            setLimitError(msg);
            return false;
        } finally {
            setIsSavingLimit(false);
        }
    };

    // ── SET & OPEN button ─────────────────────────────────────────────────────
    const handleSetLimit = async () => {
        const parsed = parseInt(shutoffInput, 10);
        if (isNaN(parsed) || parsed <= 0) {
            setLimitError('Enter a valid limit greater than 0');
            return;
        }

        // S6: if valve already OPEN, warn and block
        if (status === 'OPEN') {
            setLimitError('Valve is already open. Close it first before setting a new limit.');
            return;
        }

        // S11: warn if limit seems very low (optional UX guard)
        setLimitError(null);
        setShutoffLimit(parsed);

        const saved = await persistShutoffLimit(parsed);
        if (!saved) return;

        // S7: snapshot with retry
        setLimitError(null);
        const snapshotVolume = await fetchWithRetry();
        if (snapshotVolume === null) {
            setLimitError('Could not read ThingSpeak after 3 attempts. Check channel ID and read key.');
            return;
        }

        startVolumeRef.current = snapshotVolume;
        setDeliveredVolume(0);
        setDisplayDeliveredVolume(0);
        deliveredVolumeRef.current = 0;
        autoCloseFiredRef.current = false;
        pollFailCountRef.current = 0;

        await openValveInternal(parsed, snapshotVolume);
    };

    // ── RESET button ──────────────────────────────────────────────────────────
    const handleResetLimit = async () => {
        stopPolling();

        // S4: if valve is OPEN, close it first
        if (status === 'OPEN' && hardwareId && db) {
            setStatus('TRANSITIONING');
            const closed = await writeClosedToFirebase();
            if (closed) {
                setStatus('CLOSED');
            } else {
                setValveError('Failed to close valve on reset. Close manually.');
                setStatus('CLOSED'); // optimistic
            }
        }

        setShutoffInput(String(DEFAULT_SHUTOFF_LIMIT_L));
        setShutoffLimit(DEFAULT_SHUTOFF_LIMIT_L);
        setDeliveredVolume(0);
        setDisplayDeliveredVolume(0);
        startVolumeRef.current = null;
        deliveredVolumeRef.current = 0;
        autoCloseFiredRef.current = false;
        pollFailCountRef.current = 0;
        setLimitError(null);
        setValveError(null);

        if (hardwareId) clearSession(hardwareId);
        await persistShutoffLimit(DEFAULT_SHUTOFF_LIMIT_L);
    };

    // ── Internal open valve helper ────────────────────────────────────────────
    const openValveInternal = async (limit: number, snapshotVolume: number) => {
        if (!hardwareId || !db) { setValveError('Device ID or Firebase not available'); return; }
        setStatus('TRANSITIONING');
        setValveError(null);
        try {
            const valveRef = doc(db, 'devices', hardwareId);
            await updateDoc(valveRef, { valve_status: 'OPEN' });

            // Save session immediately so page refresh can recover
            saveSession(hardwareId, {
                startVolume: snapshotVolume,
                shutoffLimit: limit,
                deliveredVolume: 0,
                valveOpen: true,
                savedAt: Date.now(),
            });

            setTimeout(() => {
                setStatus('OPEN');
                startPolling(snapshotVolume, limit);
            }, 1500);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to open valve';
            setValveError(msg);
            setStatus('CLOSED');
        }
    };

    // ── Manual OPEN/CLOSE buttons ─────────────────────────────────────────────
    const handleValveControl = async (newStatus: 'OPEN' | 'CLOSED') => {
        if (!hardwareId || !db) { setValveError('Device ID or Firebase not available'); return; }
        setValveError(null);

        if (newStatus === 'CLOSED') {
            // Manual close — stop everything
            stopPolling();
            setStatus('TRANSITIONING');
            try {
                const valveRef = doc(db, 'devices', hardwareId);
                await updateDoc(valveRef, { valve_status: 'CLOSED' });
                setTimeout(() => setStatus('CLOSED'), 1500);
                // Update localStorage: mark valve as closed but preserve delivered volume
                if (hardwareId && startVolumeRef.current !== null) {
                    saveSession(hardwareId, {
                        startVolume: startVolumeRef.current,
                        shutoffLimit: shutoffLimit ?? DEFAULT_SHUTOFF_LIMIT_L,
                        deliveredVolume,
                        valveOpen: false,
                        savedAt: Date.now(),
                    });
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to close valve';
                setValveError(msg);
                setStatus('OPEN');
            }
            return;
        }

        // Manual OPEN — S6: block if already open
        if (status === 'OPEN') return;

        // S7: snapshot with retry
        setStatus('TRANSITIONING');
        const snapshotVolume = await fetchWithRetry();
        if (snapshotVolume === null) {
            setValveError('Could not read ThingSpeak. Check connection.');
            setStatus('CLOSED');
            return;
        }

        startVolumeRef.current = snapshotVolume;
        setDeliveredVolume(0);
        setDisplayDeliveredVolume(0);
        deliveredVolumeRef.current = 0;
        autoCloseFiredRef.current = false;
        pollFailCountRef.current = 0;

        const limit = shutoffLimit ?? DEFAULT_SHUTOFF_LIMIT_L;
        await openValveInternal(limit, snapshotVolume);
    };

    return (
        <div className="apple-glass-card rounded-[2rem] p-6 flex flex-col gap-5 h-full">
            <h3 className="text-[13px] font-black uppercase tracking-widest m-0" style={{ color: 'var(--text-muted)' }}>
                Valve Limit
            </h3>

            {/* Gauge */}
            <div className="flex flex-col items-center justify-center">
                <div className="relative w-48 h-48 flex items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full transform rotate-[135deg]" viewBox="0 0 200 200">
                        <defs>
                            <linearGradient id="gaugeGradPanelBlue" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#00d2ff" />
                                <stop offset="100%" stopColor="#0066ff" />
                            </linearGradient>
                        </defs>
                        <circle
                            cx="100" cy="100" r={radius}
                            stroke="currentColor" strokeWidth={strokeWidth} fill="transparent"
                            strokeDasharray={`${arcLength} ${circumference}`}
                            strokeLinecap="round"
                            className="text-slate-200 dark:text-slate-800/50"
                        />
                        <circle
                            cx="100" cy="100" r={radius}
                            stroke={percentage >= 100 ? '#ef4444' : 'url(#gaugeGradPanelBlue)'}
                            strokeWidth={strokeWidth} fill="transparent"
                            strokeDasharray={`${arcLength} ${circumference}`}
                            strokeDashoffset={offset}
                            strokeLinecap="round"
                            className="transition-all duration-1000 ease-out"
                        />
                    </svg>
                    <div className="flex flex-col items-center justify-center z-10">
                        <span className="text-[26px] font-black tracking-tighter leading-none" style={{ color: 'var(--text-primary)' }}>
                            {liveDeliveredVolume.toFixed(1)}
                        </span>
                        <span className="text-[12px] font-bold text-slate-400 mt-0.5">L</span>
                    </div>
                </div>
                <p className="text-[11px] font-black uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>
                    Delivered This Session
                </p>
                <p className="text-[10px] font-bold mt-0.5">
                    <span style={{ color: 'var(--text-muted)' }}>
                        {liveDeliveredVolume.toFixed(1)} / {gaugeMax.toLocaleString()} L &nbsp;
                    </span>
                    <span className="text-blue-600 dark:text-blue-400 font-black">
                        ({Math.round(percentage)}%)
                    </span>
                </p>
                <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Remaining: {remainingLitres.toFixed(1)} L
                </p>
                {/* Poll failure warning */}
                {pollFailCountRef.current > 0 && pollFailCountRef.current < MAX_POLL_FAILURES && (
                    <p className="text-[9px] font-bold text-amber-500 mt-1">
                        ThingSpeak fetch failed ({pollFailCountRef.current}/{MAX_POLL_FAILURES})...
                    </p>
                )}
                {/* Session resumed indicator */}
                {startVolumeRef.current !== null && (
                    <p className="text-[9px] text-slate-400 mt-1">
                        Snapshot: {startVolumeRef.current.toLocaleString()} L
                    </p>
                )}
            </div>

            <div className="h-px w-full" style={{ background: 'var(--card-border)' }} />

            {/* Limit input */}
            <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    Auto-Shutoff Limit (L)
                </span>
                <input
                    type="number"
                    value={shutoffInput}
                    onChange={e => { setShutoffInput(e.target.value); setLimitError(null); }}
                    className="w-full rounded-xl px-3 py-2 text-sm font-bold border outline-none focus:ring-2 focus:ring-blue-500/30"
                    style={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--card-border)',
                        color: 'var(--text-primary)',
                    }}
                    placeholder="Enter litres..."
                />
                <div className="flex gap-2">
                    <button
                        onClick={handleSetLimit}
                        disabled={isSavingLimit || status === 'TRANSITIONING' || status === 'OPEN'}
                        className="flex-1 px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-sm shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSavingLimit ? 'Setting…' : status === 'OPEN' ? 'Valve Open' : 'Set & Open'}
                    </button>
                    <button
                        onClick={handleResetLimit}
                        disabled={status === 'TRANSITIONING'}
                        className="flex-1 px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-sm shadow-red-500/20 flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                        <RotateCcw size={10} />
                        Reset
                    </button>
                </div>
                {limitError && (
                    <p className="text-[10px] font-bold text-red-500">{limitError}</p>
                )}
                {!limitError && shutoffLimit !== null && (
                    <p className="text-[10px] font-bold text-green-600 dark:text-green-400">
                        Auto-shutoff set at {shutoffLimit.toLocaleString()} L
                    </p>
                )}
                <p className="text-[9px] text-slate-400 leading-relaxed">
                    Enter limit → click Set & Open. Valve auto-closes when delivered litres reach the limit.
                </p>
            </div>

            <div className="h-px w-full" style={{ background: 'var(--card-border)' }} />

            {/* Manual valve control */}
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                        Valve Control
                    </span>
                    <div className={clsx(
                        "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter transition-all duration-500",
                        status === 'OPEN'
                            ? "bg-green-100 text-green-600 shadow-[0_0_10px_rgba(34,197,94,0.25)]"
                            : status === 'CLOSED'
                                ? "bg-red-100 text-red-600 shadow-[0_0_10px_rgba(239,68,68,0.25)]"
                                : "bg-blue-100 text-blue-600"
                    )}>
                        {status}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => handleValveControl('OPEN')}
                        disabled={status === 'OPEN' || status === 'TRANSITIONING'}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-black text-[10px] uppercase tracking-widest transition-all duration-300 shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 hover:-translate-y-0.5 relative overflow-hidden group"
                    >
                        <Play size={11} className="fill-current group-hover:scale-125 transition-transform duration-300" />
                        Open
                        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
                    </button>
                    <button
                        onClick={() => handleValveControl('CLOSED')}
                        disabled={status === 'CLOSED' || status === 'TRANSITIONING'}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-[10px] uppercase tracking-widest transition-all duration-300 shadow-lg shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 hover:-translate-y-0.5 relative overflow-hidden group"
                    >
                        <Square size={10} className="fill-current group-hover:scale-125 transition-transform duration-300" />
                        Close
                        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
                    </button>
                </div>
                {valveError && (
                    <p className="text-[10px] font-bold text-center text-red-500">{valveError}</p>
                )}
            </div>
        </div>
    );
};

// ─── Flow Trend Card ──────────────────────────────────────────────────────────
const FlowTrendCard = ({ data }: { data: Array<{ ts: number; value: number | null; time: string; fullTime: string }> }) => {
    return (
        <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between mb-4">
                <div className="flex gap-3 items-center">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shadow-sm">
                        <svg className="text-blue-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-[15px] font-bold uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>Flow Trend</h2>
                        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Real-time consumption (L/min)</p>
                    </div>
                </div>
            </div>
            <div className="flex-1 w-full" style={{ minHeight: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data}>
                        <defs>
                            <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                        <XAxis
                            dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']}
                            axisLine={false} tickLine={false}
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            minTickGap={30}
                            tickFormatter={(ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        />
                        <YAxis
                            axisLine={false} tickLine={false}
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            tickFormatter={(v) => `${Number(v).toFixed(1)} L/min`}
                        />
                        <Tooltip
                            cursor={{ stroke: 'rgba(37,99,235,0.35)', strokeWidth: 1 }}
                            labelFormatter={(label) => new Date(Number(label)).toLocaleString()}
                            formatter={(value: any) => [`${Number(value).toFixed(2)} L/min`, 'Flow']}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        />
                        <Area
                            type="linear" dataKey="value"
                            stroke="#2563eb" strokeWidth={2}
                            fillOpacity={1} fill="url(#colorFlow)"
                            isAnimationActive={false} dot={false}
                            activeDot={{ r: 4, stroke: '#2563eb', strokeWidth: 2, fill: '#ffffff' }}
                            connectNulls={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

// ─── Smart Limit Card ─────────────────────────────────────────────────────────
const SetLimitCard = () => {
    const [limit, setLimit] = useState(7000);
    return (
        <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-1">
                <h3 className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Smart Limit</h3>
                <Settings2 size={12} className="text-blue-500" />
            </div>
            <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[20px] font-black tracking-tighter" style={{ color: 'var(--text-primary)' }}>{limit}</span>
                <span className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Liters</span>
            </div>
            <input
                type="range" min="1000" max="50000" step="1000" value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
        </div>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const EvaraValveAnalytics = () => {
    const { hardwareId } = useParams<{ hardwareId: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [showParams, setShowParams] = useState(false);
    const [showNodeInfo, setShowNodeInfo] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const [localTsChannel, setLocalTsChannel] = useState('');
    const [localTsReadKey, setLocalTsReadKey] = useState('');
    const [localFlowField, setLocalFlowField] = useState('');
    const [localFlowFieldName, setLocalFlowFieldName] = useState('');
    const [localTotalField, setLocalTotalField] = useState('');
    const [localTotalFieldName, setLocalTotalFieldName] = useState('');

    const { data: unifiedData, isLoading } = useDeviceAnalytics(hardwareId);
    useRealtimeTelemetry(hardwareId);

    const deviceInfo = (unifiedData?.info as any)?.data;
    const deviceConfig = (unifiedData?.config as any)?.config || {};

    const tsChannel = deviceConfig?.thingspeak_channel_id || deviceConfig?.thingspeakChannelId || '';
    const positionField = deviceConfig?.position_field || deviceConfig?.positionField || '';
    const statusField = deviceConfig?.status_field || deviceConfig?.statusField || '';
    const flowField = deviceConfig?.flow_field || deviceConfig?.flowField || deviceConfig?.fields?.flow || 'field2';
    const totalVolumeField = deviceConfig?.total_volume_field || deviceConfig?.totalVolumeField || deviceConfig?.fields?.total_volume || deviceConfig?.fields?.totalVolume || 'field1';
    const flowFieldName = deviceConfig?.flow_field_name || deviceConfig?.flowFieldName || deviceConfig?.fields?.flow_name || deviceConfig?.fields?.flowName || '';
    const totalVolumeFieldName = deviceConfig?.total_volume_field_name || deviceConfig?.totalVolumeFieldName || deviceConfig?.fields?.total_volume_name || '';

    const selectedFlowField = useMemo(() => {
        const normalized = String(flowField || '').trim().toLowerCase();
        return /^field[1-8]$/.test(normalized) ? normalized : 'field2';
    }, [flowField]);

    const totalVolumeFieldCandidates = useMemo(() => {
        const normalized = String(totalVolumeField || '').trim().toLowerCase();
        return /^field[1-8]$/.test(normalized) ? [normalized] : ['field1'];
    }, [totalVolumeField]);

    const tsFields = useMemo(
        () => Array.from(new Set([positionField, statusField, selectedFlowField, ...totalVolumeFieldCandidates].filter(Boolean))),
        [positionField, statusField, selectedFlowField, totalVolumeFieldCandidates]
    );

    const pickFieldValue = (values: Record<string, string | null> | undefined, candidates: string[]) => {
        for (const candidate of candidates) {
            const value = values?.[candidate];
            if (value !== null && value !== undefined && String(value).trim() !== '') return value;
        }
        return null;
    };

    const tsReadKey = deviceConfig?.thingspeak_read_api_key || deviceConfig?.thingspeakReadKey || undefined;

    const { readings: tsReadings, latest: tsLatest } = useThingSpeakReader(
        tsChannel || undefined,
        tsReadKey,
        tsFields,
        { pollIntervalMs: 15000, windowSeconds: 3600, results: 150 } as any
    );

    useEffect(() => {
        setLocalTsChannel(tsChannel);
        setLocalTsReadKey(tsReadKey || '');
        setLocalFlowField(flowField);
        setLocalFlowFieldName(flowFieldName);
        setLocalTotalField(totalVolumeField);
        setLocalTotalFieldName(totalVolumeFieldName);
    }, [tsChannel, tsReadKey, flowField, flowFieldName, totalVolumeField, totalVolumeFieldName]);

    const latestTelemetry = useMemo(() => {
        if (!tsLatest?.values) return { flow: null, totalVolume: null, status: null };
        return {
            flow: tsLatest.values[selectedFlowField] ?? null,
            totalVolume: pickFieldValue(tsLatest.values, totalVolumeFieldCandidates),
            status: tsLatest.values[statusField] ?? null,
        };
    }, [tsLatest, selectedFlowField, totalVolumeFieldCandidates, statusField]);

    const [backfilledReadings, setBackfilledReadings] = useState<any[] | null>(null);

    useEffect(() => {
        const valid = (tsReadings || []).map(r => {
            const raw = r.values?.[selectedFlowField];
            return raw === null || raw === undefined || String(raw).trim() === '' ? null : parseFloat(String(raw));
        }).filter(v => v !== null);

        if (valid.length >= 15 || !tsChannel) { setBackfilledReadings(null); return; }

        (async () => {
            try {
                const url = `https://api.thingspeak.com/channels/${encodeURIComponent(tsChannel)}/feeds.json`;
                const params: any = { results: 800 };
                if (tsReadKey) params.api_key = tsReadKey;
                const res = await axios.get(url, { params, timeout: 10000 });
                const feeds = Array.isArray(res.data?.feeds) ? res.data.feeds : [];
                const mapped = feeds
                    .filter((f: any) => f && f.created_at)
                    .map((f: any) => ({
                        timestamp: new Date((/Z|\+|\-/.test(f.created_at) ? f.created_at : f.created_at + 'Z')).toISOString(),
                        entry_id: f.entry_id,
                        values: tsFields.reduce((acc: any, fk: string) => { acc[fk] = f[fk] ?? null; return acc; }, {}),
                    }));
                setBackfilledReadings(mapped);
            } catch { setBackfilledReadings(null); }
        })();
    }, [tsReadings, tsChannel, tsReadKey, selectedFlowField, tsFields]);

    const flowHistory = useMemo(() => {
        const source = (backfilledReadings && Array.isArray(backfilledReadings) ? backfilledReadings : tsReadings) || [];
        const mapped = source.map((reading: any) => {
            const raw = reading.values?.[selectedFlowField];
            const parsed = raw === null || raw === undefined || String(raw).trim() === '' ? null : parseFloat(String(raw));
            const value = Number.isFinite(parsed as number) ? parsed : null;
            const time = new Date(reading.timestamp);
            return { ts: time.getTime(), time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), fullTime: time.toISOString(), value };
        }).filter((r: any) => r.value !== null).sort((a: any, b: any) => a.ts - b.ts);

        const deduped = mapped.filter((point: any, idx: number, arr: any[]) => idx === 0 || point.ts !== arr[idx - 1].ts);
        const take = Math.min(150, Math.max(15, deduped.length));
        return deduped.slice(-take);
    }, [tsReadings, backfilledReadings, selectedFlowField]);

    const isOnline = deviceInfo?.online_status ?? true;

    const totalVolumeValue = (() => {
        const v = latestTelemetry.totalVolume ?? unifiedData?.latest?.total_liters ?? unifiedData?.latest?.volume ?? null;
        const n = v == null || v === '' ? 0 : Number(v);
        return Number.isFinite(n) ? n : 0;
    })();

    const savedShutoffLimit = useMemo(() => {
        const raw = deviceConfig?.auto_shutoff_limit ?? deviceConfig?.autoShutoffLimit;
        if (raw == null || raw === '') return null;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
    }, [deviceConfig]);

    const currentFlowRateNumber = useMemo(() => {
        const v = latestTelemetry.flow ?? unifiedData?.latest?.flow_rate ?? null;
        if (v == null || v === '') return 0;
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }, [latestTelemetry.flow, unifiedData?.latest?.flow_rate]);

    const handleSave = useCallback(async () => {
        if (!hardwareId) return;
        setSaving(true); setSaveError(null);
        try {
            await api.put(`/admin/nodes/${hardwareId}`, {
                thingspeak_channel_id: localTsChannel,
                thingspeak_read_api_key: localTsReadKey,
                flow_field: localFlowField,
                flow_field_name: localFlowFieldName,
                total_volume_field: localTotalField,
                total_volume_field_name: localTotalFieldName,
            });
            await queryClient.invalidateQueries({ queryKey: ['device_config', hardwareId] });
            await queryClient.invalidateQueries({ queryKey: ['telemetry_backend', hardwareId] });
            setShowParams(false);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Failed to save parameters');
        } finally { setSaving(false); }
    }, [hardwareId, localFlowField, localFlowFieldName, localTotalField, localTotalFieldName, localTsChannel, localTsReadKey, queryClient]);

    const handleDelete = useCallback(async () => {
        if (!hardwareId) return;
        setIsDeleting(true);
        try {
            await api.delete(`/admin/nodes/${hardwareId}`);
            setShowDeleteConfirm(false);
            navigate('/nodes');
        } catch {
            alert('Failed to delete node. Please try again.');
            setIsDeleting(false);
        }
    }, [hardwareId, navigate]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-transparent font-sans relative overflow-x-hidden" style={{ color: 'var(--text-primary)' }}>
            <main className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8" style={{ zIndex: 1 }}>
                <div className="max-w-[1400px] mx-auto w-full relative z-10 flex-1 flex flex-col">

                    {/* Header */}
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-4">
                        <div className="flex flex-col gap-2">
                            <nav className="flex items-center gap-1 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                                <button onClick={() => navigate('/')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0">Home</button>
                                <span className="material-icons" style={{ fontSize: '16px', color: 'var(--text-muted)' }}>chevron_right</span>
                                <button onClick={() => navigate('/nodes')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0 font-normal" style={{ color: 'var(--text-muted)' }}>All Nodes</button>
                                <span className="material-icons" style={{ fontSize: '16px', color: 'var(--text-muted)' }}>chevron_right</span>
                                <span className="font-bold" style={{ color: 'var(--text-primary)', fontWeight: '700' }}>{deviceInfo?.label || hardwareId}</span>
                            </nav>
                            <h2 style={{ fontSize: '22px', fontWeight: '700', marginTop: '6px', color: 'var(--text-primary)' }}>
                                {deviceInfo?.label || hardwareId} Analytics
                            </h2>
                            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400 m-0 mt-1">
                                Smart Water Control System
                            </p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap pb-1 md:self-end lg:self-auto">
                            <div className={isOnline ? 'pill-button green' : 'pill-button red'}>
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isOnline ? 'var(--online-dot)' : 'var(--offline-dot)' }} />
                                {isOnline ? 'ONLINE' : 'OFFLINE'}
                            </div>
                            <button onClick={() => window.location.reload()} className="pill-button blue active:scale-95">
                                <span className="material-icons" style={{ fontSize: '14px' }}>refresh</span>
                                Refresh Data
                            </button>
                            <button onClick={() => setShowNodeInfo(true)} className="pill-button purple active:scale-95">
                                <span className="material-icons" style={{ fontSize: '14px' }}>info</span> Node Info
                            </button>
                            <button onClick={() => setShowParams(true)} className="pill-button amber active:scale-95">
                                <span className="material-icons" style={{ fontSize: '14px' }}>settings</span> Parameters
                            </button>
                            <button onClick={() => setShowDeleteConfirm(true)} className="pill-button red active:scale-95">
                                <span className="material-icons" style={{ fontSize: '14px' }}>delete_forever</span>
                                Delete Node
                            </button>
                        </div>
                    </div>

                    {/* Main layout */}
                    <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
                        <div className="w-full lg:w-[340px] xl:w-[370px] shrink-0">
                            <ValveLimitPanel
                                hardwareId={hardwareId}
                                initialShutoffLimit={savedShutoffLimit}
                                tsChannel={tsChannel}
                                tsReadKey={tsReadKey}
                                totalVolumeField={totalVolumeField}
                                currentTotalVolume={totalVolumeValue}
                                currentFlowRate={currentFlowRateNumber}
                                onLimitSaved={() => {
                                    queryClient.invalidateQueries({ queryKey: ['device_config', hardwareId] });
                                }}
                            />
                        </div>

                        <div className="flex-1 flex flex-col gap-4 min-h-0 min-w-0">
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 shrink-0">
                                <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col justify-center items-start">
                                    <span className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Flow Rate</span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[28px] font-black tracking-tighter" style={{ color: 'var(--text-primary)' }}>
                                            {currentFlowRateNumber > 0 ? currentFlowRateNumber.toFixed(1) : '—'}
                                        </span>
                                        <span className="text-[14px] font-bold" style={{ color: 'var(--text-muted)' }}>L/min</span>
                                    </div>
                                </div>

                                <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col justify-center items-start">
                                    <span className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Total Litres</span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[28px] font-black tracking-tighter" style={{ color: 'var(--text-primary)' }}>
                                            {totalVolumeValue.toLocaleString()}
                                        </span>
                                        <span className="text-[14px] font-bold" style={{ color: 'var(--text-muted)' }}>Litres</span>
                                    </div>
                                </div>

                                <div className="apple-glass-card rounded-[1.5rem] p-5 flex flex-col justify-center overflow-hidden">
                                    <span className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Activity</span>
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="font-bold truncate pr-2 text-red-500">Valve Closed</span>
                                            <span className="text-slate-400 shrink-0">10:45 AM</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="font-bold truncate pr-2 text-green-500">Valve Opened</span>
                                            <span className="text-slate-400 shrink-0">09:30 AM</span>
                                        </div>
                                    </div>
                                </div>

                                <SetLimitCard />
                            </div>

                            <FlowTrendCard data={flowHistory} />
                        </div>
                    </div>
                </div>

                {/* Node Info Modal */}
                {showNodeInfo && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20"
                        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                        onClick={() => setShowNodeInfo(false)}>
                        <div className="rounded-2xl p-6 flex flex-col w-full max-w-2xl"
                            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--card-border)', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}
                            onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-[17px] font-bold m-0" style={{ color: 'var(--text-primary)' }}>Node Information</h3>
                                <button onClick={() => setShowNodeInfo(false)}
                                    className="flex items-center justify-center rounded-full border-none cursor-pointer p-0 transition-all hover:scale-110"
                                    style={{ width: 24, height: 24, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '18px', fontWeight: 'bold' }}>
                                    &times;
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { label: 'Device Name', value: deviceInfo?.label || 'N/A' },
                                    { label: 'Hardware ID', value: hardwareId },
                                    { label: 'ThingSpeak Channel', value: tsChannel || 'Not set' },
                                    { label: 'Device Type', value: deviceInfo?.type || 'N/A' },
                                ].map(({ label, value }) => (
                                    <div key={label} className="rounded-xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                                        <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
                                        <span className="block text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{value}</span>
                                    </div>
                                ))}
                                {[
                                    { label: 'ESP32 Email', value: deviceConfig?.esp32_email || 'N/A' },
                                    { label: 'ESP32 Password', value: deviceConfig?.esp32_password || 'N/A' },
                                ].map(({ label, value }) => (
                                    <div key={label} className="rounded-xl p-4 flex items-center justify-between" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                                        <div>
                                            <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
                                            <span className="block text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{value}</span>
                                        </div>
                                        <button onClick={() => navigator.clipboard.writeText(value)} title="Copy"
                                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 transition-all"
                                            style={{ background: 'transparent', border: 'none' }}>
                                            <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-primary)' }}>content_copy</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => setShowNodeInfo(false)}
                                className="mt-6 w-full py-3 rounded-2xl font-semibold border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                                style={{ background: '#3A7AFE', color: '#FFFFFF', fontSize: '14px' }}>
                                Close
                            </button>
                        </div>
                    </div>
                )}

                {/* Parameters Modal */}
                {showParams && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-20"
                        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
                        onClick={() => !saving && setShowParams(false)}>
                        <div className="rounded-2xl w-full max-w-md mx-4"
                            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--card-border)' }}
                            onClick={e => e.stopPropagation()}>
                            <div className="px-5 py-6">
                                <div className="relative">
                                    <h3 className="text-lg md:text-xl font-semibold m-0" style={{ color: 'var(--text-primary)' }}>Parameters & ThingSpeak Fields</h3>
                                    <button onClick={() => setShowParams(false)} aria-label="Close"
                                        className="absolute right-0 top-0 w-8 h-8 flex items-center justify-center rounded-full transition-transform hover:scale-105"
                                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '16px', fontWeight: '600' }}>
                                        &times;
                                    </button>
                                </div>
                                <div className="mt-4 flex flex-col gap-3">
                                    {[
                                        { label: 'ThingSpeak Channel ID', value: localTsChannel, setter: setLocalTsChannel, placeholder: 'Channel ID' },
                                        { label: 'Read API Key', value: localTsReadKey, setter: setLocalTsReadKey, placeholder: 'Read API Key' },
                                        { label: 'Total Field Number', value: localTotalField, setter: setLocalTotalField, placeholder: 'field1, field2...' },
                                        { label: 'Total Field Name', value: localTotalFieldName, setter: setLocalTotalFieldName, placeholder: 'e.g. Reading_7' },
                                        { label: 'Flow Field Number', value: localFlowField, setter: setLocalFlowField, placeholder: 'field1, field2...' },
                                        { label: 'Flow Field Name', value: localFlowFieldName, setter: setLocalFlowFieldName, placeholder: 'e.g. flow rate after filtering' },
                                    ].map(({ label, value, setter, placeholder }) => (
                                        <div key={label} className="flex items-center justify-between bg-[var(--card-bg)] border rounded-md px-4 py-3 shadow-sm" style={{ borderColor: 'var(--card-border)' }}>
                                            <div className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{label}</div>
                                            <input type="text" value={value} onChange={e => setter(e.target.value)}
                                                placeholder={placeholder}
                                                className="w-36 text-right font-mono text-sm font-semibold bg-transparent border-none outline-none"
                                                style={{ color: 'var(--text-primary)' }} />
                                        </div>
                                    ))}
                                </div>
                                {[
                                    { label: 'ESP32 Email', value: deviceConfig?.esp32_email || 'N/A' },
                                    { label: 'ESP32 Password', value: deviceConfig?.esp32_password || 'N/A' },
                                ].map(({ label, value }) => (
                                    <div key={label} className="flex items-center justify-between bg-[var(--card-bg)] border rounded-md px-4 py-3 shadow-sm mt-3" style={{ borderColor: 'var(--card-border)' }}>
                                        <div className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{label}</div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</div>
                                            <button onClick={() => navigator.clipboard.writeText(value)} title="Copy"
                                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 transition-all"
                                                style={{ background: 'transparent', border: 'none' }}>
                                                <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-primary)' }}>content_copy</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {saveError && <p className="text-[11px] font-bold text-center mt-3 mb-0" style={{ color: '#FF3B30' }}>{saveError}</p>}
                            <div className="flex items-center justify-end gap-3 px-5 pb-6">
                                <button onClick={() => setShowParams(false)}
                                    className="px-4 py-2 text-sm rounded-lg font-medium"
                                    style={{ background: 'transparent', color: 'var(--text-primary)' }}>
                                    Close
                                </button>
                                <button onClick={handleSave} disabled={saving}
                                    className="px-5 py-2 text-sm rounded-lg font-semibold text-white shadow-sm disabled:opacity-60"
                                    style={{ background: '#3A7AFE' }}>
                                    {saving ? 'Saving…' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Confirm Modal */}
                {showDeleteConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-20"
                        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
                        onClick={() => !isDeleting && setShowDeleteConfirm(false)}>
                        <div className="rounded-3xl p-8 flex flex-col w-full max-w-sm text-center"
                            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--card-border)' }}
                            onClick={e => e.stopPropagation()}>
                            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="material-icons" style={{ fontSize: '32px' }}>delete_outline</span>
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">Delete this Node?</h3>
                            <p className="text-sm text-[var(--text-muted)] mb-8">
                                This will permanently remove <strong>{deviceInfo?.label || hardwareId}</strong> and all its historical telemetry data. This action cannot be undone.
                            </p>
                            <div className="flex flex-col gap-3">
                                <button onClick={handleDelete} disabled={isDeleting}
                                    className={`w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all ${isDeleting ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white active:scale-95'}`}>
                                    {isDeleting ? 'Deleting...' : 'Yes, Delete Node'}
                                </button>
                                <button onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}
                                    className="w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] hover:bg-gray-800 transition-all active:scale-95">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default EvaraValveAnalytics;