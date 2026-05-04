/**
 * useTankCalculation — React hook for the Tank Configuration System.
 *
 * Manages:
 *  - Shape selection with field reset on shape change
 *  - Unit selection with automatic recalculation
 *  - Raw dimension string inputs (avoids controlled-number-input UX pitfalls)
 *  - Radius ↔ Diameter toggle for cylindrical tanks
 *  - Live volume calculation (recalculates on every dim / unit / shape change)
 *  - Zod validation per shape
 *
 * The component layer has zero calculation logic — it only renders from this hook.
 */

import { useState, useMemo, useCallback } from 'react';
import { z } from 'zod';
import {
  type TankShape,
  type TankUnit,
  type VolumeResult,
  toMetres,
  calculateFromRawDims,
} from '../utils/tankCalculation';

// ── Zod validation ────────────────────────────────────────────────────────────

const positiveNum = z
  .string()
  .min(1, 'Required')
  .refine((v) => !isNaN(parseFloat(v)), 'Must be a number')
  .refine((v) => parseFloat(v) > 0, 'Must be > 0')
  .refine((v) => parseFloat(v) <= 9_999, 'Value too large');

// ── Dimension meta ────────────────────────────────────────────────────────────

export type DimKey = 'length' | 'breadth' | 'height' | 'radius' | 'diameter' | 'side';

export interface DimField {
  key: DimKey;
  label: string;
  placeholder: string;
  tooltip: string;
}

const FIELD_META: Record<DimKey, Omit<DimField, 'key'>> = {
  length:   { label: 'Length',   placeholder: 'e.g. 3.0',  tooltip: 'Horizontal length of the tank' },
  breadth:  { label: 'Breadth',  placeholder: 'e.g. 2.0',  tooltip: 'Horizontal width of the tank' },
  height:   { label: 'Height',   placeholder: 'e.g. 1.5',  tooltip: 'Vertical fill height' },
  radius:   { label: 'Radius',   placeholder: 'e.g. 0.75', tooltip: 'Radius from centre to wall' },
  diameter: { label: 'Diameter', placeholder: 'e.g. 1.5',  tooltip: 'Full width (outer diameter)' },
  side:     { label: 'Side',     placeholder: 'e.g. 2.0',  tooltip: 'Length of one side of the square base' },
};

// Which keys each shape needs (before diameter toggle).
const SHAPE_KEYS: Record<TankShape, DimKey[]> = {
  rectangular: ['length', 'breadth', 'height'],
  cylindrical: ['radius', 'height'],
  square:      ['side', 'height'],
  sump:        ['length', 'breadth', 'height'],
};

// ── Public API types ──────────────────────────────────────────────────────────

export interface TankFormValues {
  /** All in metres as stored in Firestore. */
  lengthM: number;
  breadthM: number;
  heightM: number;
  capacityL: number;
}

export interface UseTankCalculationReturn {
  shape: TankShape;
  setShape: (s: TankShape) => void;

  unit: TankUnit;
  setUnit: (u: TankUnit) => void;

  dims: Partial<Record<DimKey, string>>;
  setDim: (key: DimKey, value: string) => void;

  useDiameter: boolean;
  toggleDiameter: () => void;

  /** Fields to render for current shape + diameter toggle. */
  visibleFields: DimField[];

  errors: Partial<Record<DimKey, string>>;
  isValid: boolean;

  /** Live result — null until all required fields pass validation. */
  result: VolumeResult | null;

  /** Ready-to-sync values for the parent react-hook-form instance. */
  formValues: TankFormValues | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTankCalculation(): UseTankCalculationReturn {
  const [shape, setShapeRaw] = useState<TankShape>('rectangular');
  const [unit, setUnit] = useState<TankUnit>('m');
  const [dims, setDimsRaw] = useState<Partial<Record<DimKey, string>>>({});
  const [useDiameter, setUseDiameter] = useState(false);

  // Shape change: keep only fields that exist in the new shape.
  const setShape = useCallback((s: TankShape) => {
    setShapeRaw(s);
    const keep = new Set(SHAPE_KEYS[s]);
    setDimsRaw((prev) => {
      const next: Partial<Record<DimKey, string>> = {};
      for (const k of keep) {
        if (prev[k]) next[k] = prev[k];
      }
      return next;
    });
  }, []);

  const setDim = useCallback((key: DimKey, value: string) => {
    setDimsRaw((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleDiameter = useCallback(() => {
    // Clear both radius & diameter to avoid stale values crossing the toggle.
    setDimsRaw((d) => {
      const next = { ...d };
      delete next.radius;
      delete next.diameter;
      return next;
    });
    setUseDiameter((prev) => !prev);
  }, []);

  // ── Visible fields ───────────────────────────────────────────────────────
  const visibleFields: DimField[] = useMemo(() => {
    const keys: DimKey[] = [...SHAPE_KEYS[shape]];
    if (shape === 'cylindrical' && useDiameter) {
      const idx = keys.indexOf('radius');
      if (idx !== -1) keys[idx] = 'diameter';
    }
    return keys.map((k) => ({ key: k, ...FIELD_META[k] }));
  }, [shape, useDiameter]);

  // ── Validation ───────────────────────────────────────────────────────────
  const { errors, isValid } = useMemo(() => {
    const keys = visibleFields.map((f) => f.key);
    const schema = z.object(
      Object.fromEntries(keys.map((k) => [k, positiveNum])) as z.ZodRawShape
    );
    const parsed = schema.safeParse(
      Object.fromEntries(keys.map((k) => [k, dims[k] ?? '']))
    );
    if (parsed.success) return { errors: {} as Partial<Record<DimKey, string>>, isValid: true };
    const errs: Partial<Record<DimKey, string>> = {};
    for (const issue of parsed.error.issues) {
      const f = issue.path[0] as DimKey;
      if (!errs[f]) errs[f] = issue.message;
    }
    return { errors: errs, isValid: false };
  }, [dims, visibleFields]);

  // ── Live volume result ───────────────────────────────────────────────────
  const result: VolumeResult | null = useMemo(() => {
    if (!isValid) return null;

    // Build raw dims map for the calculator, resolving diameter → radius.
    const raw: Record<string, string> = {};
    for (const f of visibleFields) {
      raw[f.key] = dims[f.key] ?? '';
    }
    if (shape === 'cylindrical' && useDiameter && dims.diameter) {
      delete raw.diameter;
      raw.radius = String(parseFloat(dims.diameter) / 2);
    }

    return calculateFromRawDims(shape, raw, unit);
  }, [isValid, dims, shape, unit, visibleFields, useDiameter]);

  // ── Form values for parent sync ──────────────────────────────────────────
  const formValues: TankFormValues | null = useMemo(() => {
    if (!result) return null;

    const m = (k: DimKey) => {
      const v = parseFloat(dims[k] ?? '');
      return isNaN(v) ? 0 : toMetres(v, unit);
    };

    if (shape === 'rectangular' || shape === 'sump') {
      return { lengthM: m('length'), breadthM: m('breadth'), heightM: m('height'), capacityL: result.litres };
    }
    if (shape === 'cylindrical') {
      const raw = useDiameter ? parseFloat(dims.diameter ?? '0') / 2 : parseFloat(dims.radius ?? '0');
      const rM = isNaN(raw) ? 0 : toMetres(raw, unit);
      return { lengthM: rM, breadthM: 0, heightM: m('height'), capacityL: result.litres };
    }
    // square
    return { lengthM: m('side'), breadthM: m('side'), heightM: m('height'), capacityL: result.litres };
  }, [result, dims, shape, unit, useDiameter]);

  return {
    shape, setShape,
    unit, setUnit,
    dims, setDim,
    useDiameter, toggleDiameter,
    visibleFields,
    errors, isValid,
    result,
    formValues,
  };
}
