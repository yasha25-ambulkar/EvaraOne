/**
 * tankCalculation.ts — Math utility module for tank volume calculations.
 *
 * Responsibilities:
 *  - Unit conversion (all values normalized to metres internally)
 *  - Volume formulas per shape (rectangular, cylindrical, square)
 *  - Safe output formatting (m³ and litres)
 *
 * No React dependencies — pure functions, easily testable.
 */

// ── Unit conversion ───────────────────────────────────────────────────────────

export type TankUnit = 'm' | 'cm' | 'in' | 'ft';

const TO_METRES: Record<TankUnit, number> = {
  m: 1,
  cm: 0.01,
  in: 0.0254,
  ft: 0.3048,
};

/** Convert a measurement in the given unit to metres. */
export function toMetres(value: number, unit: TankUnit): number {
  return value * TO_METRES[unit];
}

/** Convert a value in metres back to the given unit (for display). */
export function fromMetres(valueInMetres: number, unit: TankUnit): number {
  return valueInMetres / TO_METRES[unit];
}

// ── Shape types ───────────────────────────────────────────────────────────────

export type TankShape = 'rectangular' | 'cylindrical' | 'square' | 'sump';

/** Human-readable label for each shape. */
export const SHAPE_LABELS: Record<TankShape, string> = {
  rectangular: 'Rectangular Tank',
  cylindrical: 'Cylindrical Tank',
  square: 'Square Tank',
  sump: 'Sump Tank',
};

/** Which dimension keys are required for each shape. */
export const SHAPE_FIELDS: Record<TankShape, string[]> = {
  rectangular: ['length', 'breadth', 'height'],
  cylindrical: ['radius', 'height'],
  square: ['side', 'height'],
  sump: ['length', 'breadth', 'height'],
};

// ── Dimension types ───────────────────────────────────────────────────────────

export interface TankDimensions {
  length?: number;
  breadth?: number;
  height?: number;
  radius?: number;
  diameter?: number;  // convenience — converted to radius automatically
  side?: number;
}

// ── Volume calculation ────────────────────────────────────────────────────────

export interface VolumeResult {
  /** Volume in cubic metres (m³), rounded to 4 decimal places. */
  cubicMetres: number;
  /** Volume in litres (L), rounded to 2 decimal places. */
  litres: number;
  /** Formatted display string, e.g. "2.5 m³ (2,500.00 L)" */
  display: string;
}

/**
 * Calculate tank volume.
 * All dimension values must already be in METRES.
 *
 * Returns null if any required dimension is missing, zero, or negative.
 */
export function calculateVolume(
  shape: TankShape,
  dims: TankDimensions
): VolumeResult | null {
  let volumeM3: number;

  switch (shape) {
    case 'rectangular':
    case 'sump': {
      // sump uses same formula as rectangular
      const { length, breadth, height } = dims;
      if (!length || !breadth || !height) return null;
      if (length <= 0 || breadth <= 0 || height <= 0) return null;
      // Guard against unrealistic inputs (> 1000m in any dimension)
      if (length > 1000 || breadth > 1000 || height > 1000) return null;
      volumeM3 = length * breadth * height;
      break;
    }
    case 'cylindrical': {
      const { height } = dims;
      // radius might come directly, or be derived from diameter
      const r = dims.radius ?? (dims.diameter != null ? dims.diameter / 2 : undefined);
      if (!r || !height) return null;
      if (r <= 0 || height <= 0) return null;
      if (r > 500 || height > 1000) return null;
      volumeM3 = Math.PI * r * r * height;
      break;
    }
    case 'square': {
      const { side, height } = dims;
      if (!side || !height) return null;
      if (side <= 0 || height <= 0) return null;
      if (side > 1000 || height > 1000) return null;
      volumeM3 = side * side * height;
      break;
    }
    default:
      return null;
  }

  // Prevent floating-point blowout
  if (!isFinite(volumeM3) || volumeM3 > 1_000_000) return null;

  const rounded = Math.round(volumeM3 * 10000) / 10000;
  const litres = Math.round(rounded * 1000 * 100) / 100;

  return {
    cubicMetres: rounded,
    litres,
    display: `${rounded.toLocaleString()} m³  (${litres.toLocaleString()} L)`,
  };
}

/**
 * Given raw dimension strings (from form inputs) and a unit,
 * parse + convert + calculate in one step.
 */
export function calculateFromRawDims(
  shape: TankShape,
  rawDims: Record<string, string>,
  unit: TankUnit
): VolumeResult | null {
  const parsed: TankDimensions = {};

  for (const [key, raw] of Object.entries(rawDims)) {
    const n = parseFloat(raw);
    if (isNaN(n)) continue;
    // Convert to metres
    (parsed as any)[key] = toMetres(n, unit);
  }

  return calculateVolume(shape, parsed);
}
