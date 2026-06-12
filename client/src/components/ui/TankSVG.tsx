import { useId } from 'react';
import type { TankShape } from '../../utils/tankCalculations';

interface TankSVGProps {
  percentage: number;        // 0 – 100
  isOffline?: boolean;
  tankShape?: TankShape;
  className?: string;
}

/**
 * TankSVG — animated water-level visualisation.
 *
 * viewBox: 0 0 130 300
 *   Tank body occupies  x=15, y=20, w=100, h=240
 *   rx: 14 (rectangular/sump) or 50 (cylindrical)
 *
 * Water fill is CSS-transitioned:  transition: y 1.4s cubic-bezier(0.4,0,0.2,1)
 * Unique gradient/clip IDs via React's useId() to avoid DOM collisions.
 */
export default function TankSVG({
  percentage,
  isOffline = false,
  tankShape = 'rectangular',
  className = '',
}: TankSVGProps) {
  const uid = useId().replace(/:/g, '_');
  const gradId   = `wg_${uid}`;
  const clipId   = `wc_${uid}`;
  const reflId   = `rf_${uid}`;
  const offGrId  = `og_${uid}`;

  const TANK_X = 15;
  const TANK_Y = 20;
  const TANK_W = 100;
  const TANK_H = 240;
  const rx = tankShape === 'cylindrical' ? 50 : 14;

  // pct clamped 0–100
  const pct = Math.max(0, Math.min(100, isOffline ? 0 : percentage));

  // y-coordinate of the water top edge (grows upward from bottom)
  const waterH = (pct / 100) * TANK_H;
  const waterY = TANK_Y + TANK_H - waterH;

  // tick lines at 25 / 50 / 75 %
  const ticks = [25, 50, 75] as const;

  // level colour
  const levelColor =
    isOffline ? '#64748b'
    : pct >= 75 ? '#22c55e'
    : pct >= 40 ? '#3b82f6'
    : pct >= 20 ? '#f59e0b'
    : '#ef4444';

  const waterDark  = isOffline ? '#475569' : '#1d4ed8';
  const waterLight = isOffline ? '#64748b' : '#60a5fa';

  return (
    <svg
      viewBox="0 0 130 300"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: '100%', height: '100%' }}
      aria-label={`Tank level ${pct.toFixed(0)}%`}
    >
      <defs>
        {/* Water vertical gradient */}
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={waterLight} stopOpacity="0.95" />
          <stop offset="100%" stopColor={waterDark}  stopOpacity="1" />
        </linearGradient>

        {/* Offline overlay gradient */}
        <linearGradient id={offGrId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#94a3b8" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#475569" stopOpacity="0.9" />
        </linearGradient>

        {/* Clip to tank body */}
        <clipPath id={clipId}>
          <rect x={TANK_X} y={TANK_Y} width={TANK_W} height={TANK_H} rx={rx} ry={rx} />
        </clipPath>

        {/* Glass reflection gradient */}
        <linearGradient id={reflId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="white" stopOpacity="0.22" />
          <stop offset="40%"  stopColor="white" stopOpacity="0.06" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ── Tank shell (glass look) ── */}
      <rect
        x={TANK_X} y={TANK_Y}
        width={TANK_W} height={TANK_H}
        rx={rx} ry={rx}
        fill="rgba(255,255,255,0.06)"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="2"
      />

      {/* ── Tick marks (25 / 50 / 75 %) ── */}
      {ticks.map((t) => {
        const ty = TANK_Y + TANK_H - (t / 100) * TANK_H;
        return (
          <g key={t}>
            <line
              x1={TANK_X + 2} y1={ty}
              x2={TANK_X + 18} y2={ty}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1"
              strokeDasharray="3 2"
            />
            <text
              x={TANK_X + 22} y={ty + 4}
              fontSize="9"
              fill="rgba(255,255,255,0.5)"
              fontFamily="system-ui, sans-serif"
            >
              {t}%
            </text>
            <line
              x1={TANK_X + TANK_W - 18} y1={ty}
              x2={TANK_X + TANK_W - 2}  y2={ty}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1"
              strokeDasharray="3 2"
            />
          </g>
        );
      })}

      {/* ── Water fill (clipped to tank body) ── */}
      <g clipPath={`url(#${clipId})`}>
        <rect
          x={TANK_X}
          y={waterY}
          width={TANK_W}
          height={waterH}
          fill={`url(#${gradId})`}
          style={{ transition: 'y 1.4s cubic-bezier(0.4,0,0.2,1), height 1.4s cubic-bezier(0.4,0,0.2,1)' }}
        />

        {/* Wave at surface */}
        {pct > 1 && !isOffline && (
          <path
            d={`
              M ${TANK_X} ${waterY}
              q 12.5 -6 25 0
              q 12.5  6 25 0
              q 12.5 -6 25 0
              q 12.5  6 25 0
              V ${waterY + 8} H ${TANK_X} Z
            `}
            fill={waterLight}
            opacity="0.45"
            style={{ transition: 'transform 1.4s cubic-bezier(0.4,0,0.2,1)' }}
          />
        )}

        {/* Glass reflection overlay */}
        <rect
          x={TANK_X} y={TANK_Y}
          width={TANK_W * 0.4} height={TANK_H}
          fill={`url(#${reflId})`}
          rx={rx} ry={rx}
        />
      </g>

      {/* ── Outer border / rim highlight ── */}
      <rect
        x={TANK_X} y={TANK_Y}
        width={TANK_W} height={TANK_H}
        rx={rx} ry={rx}
        fill="none"
        stroke={levelColor}
        strokeWidth="2.5"
        strokeOpacity="0.75"
      />

      {/* ── Pipe connectors (top fill + bottom drain) ── */}
      <rect x="57" y="6" width="16" height="14" rx="4" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
      <rect x="57" y="266" width="16" height="14" rx="4" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />

      {/* ── Centre text ── */}
      {isOffline ? (
        <>
          <text x="65" y="150" textAnchor="middle" fontSize="14" fontWeight="700"
            fill="#94a3b8" fontFamily="system-ui, sans-serif">
            OFFLINE
          </text>
          <text x="65" y="167" textAnchor="middle" fontSize="10"
            fill="#64748b" fontFamily="system-ui, sans-serif">
            No recent data
          </text>
        </>
      ) : (
        <>
          <text x="65" y="148" textAnchor="middle"
            fontSize={pct >= 100 ? 22 : pct >= 10 ? 26 : 28}
            fontWeight="800"
            fill="white"
            style={{
              fontFamily: 'system-ui, sans-serif',
              textShadow: '0 1px 6px rgba(0,0,0,0.5)',
              filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))',
            }}
          >
            {pct.toFixed(1)}%
          </text>
          <text x="65" y="165" textAnchor="middle" fontSize="10"
            fill="rgba(255,255,255,0.65)" fontFamily="system-ui, sans-serif"
            letterSpacing="2">
            LEVEL
          </text>
        </>
      )}
    </svg>
  );
}
