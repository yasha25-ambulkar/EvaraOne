/**
 * TankDimensionsCalculator
 *
 * Production-grade tank configuration component with:
 *  - Shape selector (rectangular / cylindrical / square)
 *  - Unit selector (m / cm / in / ft)
 *  - Dynamic dimension inputs per shape
 *  - Radius ↔ Diameter toggle for cylindrical tanks
 *  - Live volume preview with animation
 *  - Inline zod validation errors
 *  - onCalculated callback to sync values to parent react-hook-form
 *
 * Styling: Tailwind CSS only. No external UI library deps.
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ruler, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTankCalculation, type DimKey } from '../../hooks/useTankCalculation';
import { SHAPE_LABELS, type TankShape, type TankUnit } from '../../utils/tankCalculation';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TankFormValues {
  lengthM: number;
  breadthM: number;
  heightM: number;
  capacityL: number;
}

export interface TankDimensionsCalculatorProps {
  /**
   * Called whenever the volume result changes.
   * Receives null when inputs are invalid / incomplete.
   */
  onCalculated: (values: TankFormValues | null) => void;

  /** Class string for text inputs (pass the project's standard inp() output). */
  inputClassName: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SHAPES: TankShape[] = ['rectangular', 'cylindrical', 'square'];

const UNITS: { value: TankUnit; label: string }[] = [
  { value: 'm',  label: 'metres (m)' },
  { value: 'cm', label: 'centimetres (cm)' },
  { value: 'in', label: 'inches (in)' },
  { value: 'ft', label: 'feet (ft)' },
];

const UNIT_SHORT: Record<TankUnit, string> = {
  m: 'm', cm: 'cm', in: 'in', ft: 'ft',
};

// ── Sub-component: DimInput ───────────────────────────────────────────────────

interface DimInputProps {
  dimKey: DimKey;
  label: string;
  placeholder: string;
  tooltip: string;
  value: string;
  error?: string;
  unitLabel: string;
  onChange: (key: DimKey, value: string) => void;
  inputClassName: string;
}

const DimInput = ({
  dimKey, label, placeholder, tooltip, value, error, unitLabel, onChange, inputClassName,
}: DimInputProps) => (
  <div className="flex flex-col gap-1">
    <label
      htmlFor={`tank-dim-${dimKey}`}
      className="flex items-center gap-1.5 text-[11px] font-[700] text-gray-600 dark:text-slate-400 uppercase tracking-wide"
      title={tooltip}
    >
      <Ruler size={10} className="text-indigo-400" />
      {label}
      <span className="text-[9px] text-slate-400 dark:text-slate-500 lowercase font-normal normal-case tracking-normal">
        ({unitLabel})
      </span>
    </label>
    <input
      id={`tank-dim-${dimKey}`}
      type="number"
      min="0.001"
      step="0.001"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(dimKey, e.target.value)}
      className={`${inputClassName} ${error ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100 dark:bg-red-950/30 dark:border-red-500/50' : ''}`}
      aria-invalid={!!error}
      aria-describedby={error ? `tank-dim-${dimKey}-err` : undefined}
    />
    {error && (
      <p id={`tank-dim-${dimKey}-err`} className="flex items-center gap-1 text-[10px] text-red-500 dark:text-red-400 font-[500]">
        <AlertCircle size={9} /> {error}
      </p>
    )}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

export const TankDimensionsCalculator = ({
  onCalculated,
  inputClassName,
}: TankDimensionsCalculatorProps) => {
  const {
    shape, setShape,
    unit, setUnit,
    dims, setDim,
    useDiameter, toggleDiameter,
    visibleFields,
    errors,
    result,
    formValues,
  } = useTankCalculation();

  // ── Stable callback ref pattern (prevents infinite loop) ─────────────────
  const onCalculatedRef = useRef(onCalculated);
  useEffect(() => { onCalculatedRef.current = onCalculated; });

  useEffect(() => {
    onCalculatedRef.current(formValues);
  }, [formValues]);

  return (
    <div className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-[var(--bg-secondary)] border border-indigo-100 dark:border-white/10 space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-[800] text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
          <Ruler size={13} /> Tank Dimensions
        </div>
        {result && (
          <span className="flex items-center gap-1 text-[10px] font-[700] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full border border-emerald-100 dark:border-emerald-500/20">
            <CheckCircle2 size={10} /> Calculated
          </span>
        )}
      </div>

      {/* ── Shape + Unit selectors ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-[700] text-gray-600 dark:text-slate-400 uppercase tracking-wide mb-1">
            Tank Shape
          </label>
          <select
            value={shape}
            onChange={(e) => setShape(e.target.value as TankShape)}
            className={inputClassName}
          >
            {SHAPES.map((s) => (
              <option key={s} value={s}>{SHAPE_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-[700] text-gray-600 dark:text-slate-400 uppercase tracking-wide mb-1">
            Unit of Measurement
          </label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as TankUnit)}
            className={inputClassName}
          >
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Cylindrical: radius / diameter toggle ── */}
      {shape === 'cylindrical' && (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-500 dark:text-slate-400 font-[600]">Input as:</span>
          <button
            type="button"
            onClick={toggleDiameter}
            className={`px-3 py-1 rounded-full text-[10px] font-[700] transition-all ${
              !useDiameter
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Radius
          </button>
          <button
            type="button"
            onClick={toggleDiameter}
            className={`px-3 py-1 rounded-full text-[10px] font-[700] transition-all ${
              useDiameter
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Diameter
          </button>
          <span className="text-[9px] text-slate-400">
            {useDiameter ? 'Diameter will be halved to get radius' : 'Enter radius from centre to wall'}
          </span>
        </div>
      )}

      {/* ── Dimension inputs — animate on shape change ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={shape}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className={`grid gap-3 ${visibleFields.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
        >
          {visibleFields.map((f) => (
            <DimInput
              key={f.key}
              dimKey={f.key}
              label={f.label}
              placeholder={f.placeholder}
              tooltip={f.tooltip}
              value={dims[f.key] ?? ''}
              error={errors[f.key]}
              unitLabel={UNIT_SHORT[unit]}
              onChange={setDim}
              inputClassName={inputClassName}
            />
          ))}
        </motion.div>
      </AnimatePresence>

      {/* ── Live result panel ── */}
      <AnimatePresence>
        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.97, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-500/30"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-[700] text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                Calculated Capacity
              </p>
              <p className="text-[14px] font-[800] text-emerald-800 dark:text-emerald-100 tracking-tight mt-0.5">
                {result.display}
              </p>
            </div>
            <div className="ml-auto">
              <RefreshCw size={11} className="text-emerald-400 animate-spin [animation-duration:3s]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Helper note */}
      <p className="text-[9px] text-indigo-400 font-[500] leading-relaxed">
        All values stored internally in metres. Volume auto-updates as you type.
      </p>
    </div>
  );
};

export default TankDimensionsCalculator;
