import { useId } from "react";
import type { TankShape } from "../../utils/tankCalculations";

interface RealisticTankProps {
  percentage: number; // 0 - 100
  isOffline?: boolean;
  tankShape?: TankShape;
  loading?: boolean;
}

export default function RealisticTank({
  percentage,
  isOffline = false,
  tankShape = "rectangular",
  loading = false,
}: RealisticTankProps) {
  const uid = useId().replace(/:/g, "_");
  const fillPct = loading ? 0 : Math.max(0, Math.min(100, percentage));

  // Dynamic colors based on level
  const isCritical = fillPct < 20;
  const isWarning = fillPct < 40;
  const waterColor = isOffline
    ? { top: "#94a3b8", bottom: "#475569", wave: "#cbd5e1" }
    : isCritical
      ? { top: "#f87171", bottom: "#991b1b", wave: "#fca5a5" }
      : isWarning
        ? { top: "#fbbf24", bottom: "#92400e", wave: "#fcd34d" }
        : { top: "#38bdf8", bottom: "#075985", wave: "#7dd3fc" };

  const rx = tankShape === "cylindrical" ? 40 : 16;
  const TANK_WIDTH = 100;
  const TANK_HEIGHT = 240;
  const TANK_X = 15;
  const TANK_Y = 20;

  const waterHeight = (fillPct / 100) * TANK_HEIGHT;
  const waterY = TANK_Y + TANK_HEIGHT - waterHeight;
  const bubbleConfigs = [1, 2, 3, 4, 5].map((i) => ({
    key: i,
    radius: 1.5 + i * 0.35,
    fromX: TANK_X + 14 + i * 12,
    toX: TANK_X + 22 + i * 11,
    riseDuration: `${4 + i * 0.6}s`,
    opacityDuration: `${4.5 + i * 0.55}s`,
    horizontalDuration: `${3 + i * 0.35}s`,
    begin: `${i * 0.8}s`,
  }));

  return (
    <div
      style={{
        position: "relative",
        width: 130,
        height: 280,
        filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.15))",
      }}
    >
      <svg
        viewBox="0 0 130 280"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "100%", overflow: "visible" }}
      >
        <defs>
          {/* Main Water Gradient */}
          <linearGradient id={`waterGrad_${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={waterColor.top} />
            <stop offset="100%" stopColor={waterColor.bottom} />
          </linearGradient>

          {/* Glass Shell Gradient */}
          <linearGradient id={`glassGrad_${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0.1" />
            <stop offset="20%" stopColor="white" stopOpacity="0.2" />
            <stop offset="50%" stopColor="white" stopOpacity="0.05" />
            <stop offset="80%" stopColor="white" stopOpacity="0.15" />
            <stop offset="100%" stopColor="white" stopOpacity="0.05" />
          </linearGradient>

          {/* Clipping for Tank Body */}
          <clipPath id={`tankClip_${uid}`}>
            <rect
              x={TANK_X}
              y={TANK_Y}
              width={TANK_WIDTH}
              height={TANK_HEIGHT}
              rx={rx}
              ry={rx}
            />
          </clipPath>

          {/* Wave Animation */}
          <pattern
            id={`wavePattern_${uid}`}
            x="0"
            y="0"
            width="200"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 0 10 Q 25 0 50 10 T 100 10 T 150 10 T 200 10 V 20 H 0 Z"
              fill={waterColor.wave}
              opacity="0.4"
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                from="0 0"
                to="-100 0"
                dur="3s"
                repeatCount="indefinite"
              />
            </path>
            <path
              d="M 0 12 Q 25 2 50 12 T 100 12 T 150 12 T 200 12 V 22 H 0 Z"
              fill={waterColor.wave}
              opacity="0.2"
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                from="-50 0"
                to="50 0"
                dur="4s"
                repeatCount="indefinite"
              />
            </path>
          </pattern>
        </defs>

        {/* ── Metal Caps ── */}
        <rect
          x={TANK_X + 25}
          y={10}
          width={50}
          height={12}
          rx={4}
          fill="#94a3b8"
        />
        <rect
          x={TANK_X + 20}
          y={TANK_Y + TANK_HEIGHT - 2}
          width={60}
          height={12}
          rx={4}
          fill="#475569"
        />

        {/* ── Tank Background (Frosted) ── */}
        <rect
          x={TANK_X}
          y={TANK_Y}
          width={TANK_WIDTH}
          height={TANK_HEIGHT}
          rx={rx}
          ry={rx}
          fill="rgba(255,255,255,0.05)"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1"
        />

        {/* ── Internal Shading (3D effect) ── */}
        <rect
          x={TANK_X}
          y={TANK_Y}
          width={TANK_WIDTH}
          height={TANK_HEIGHT}
          rx={rx}
          ry={rx}
          fill={`url(#glassGrad_${uid})`}
          pointerEvents="none"
        />

        {/* ── Water Body (Clipped) ── */}
        <g clipPath={`url(#tankClip_${uid})`}>
          {/* Main Fill */}
          <rect
            x={TANK_X}
            y={waterY}
            width={TANK_WIDTH}
            height={waterHeight}
            fill={`url(#waterGrad_${uid})`}
            style={{ transition: "all 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          />

          {/* Surface Wave Pattern */}
          {!isOffline && fillPct > 0 && fillPct < 100 && (
            <rect
              x={TANK_X - 50}
              y={waterY - 10}
              width={TANK_WIDTH + 100}
              height={20}
              fill={`url(#wavePattern_${uid})`}
              style={{ transition: "y 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
            />
          )}

          {/* Bubbles */}
          {!isOffline && fillPct > 10 && (
            <g opacity="0.3">
              {bubbleConfigs.map((bubble) => (
                <circle key={bubble.key} r={bubble.radius} fill="white">
                  <animate
                    attributeName="cx"
                    from={bubble.fromX}
                    to={bubble.toX}
                    dur={bubble.horizontalDuration}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    from={TANK_Y + TANK_HEIGHT}
                    to={waterY}
                    dur={bubble.riseDuration}
                    begin={bubble.begin}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;0.5;0"
                    dur={bubble.opacityDuration}
                    begin={bubble.begin}
                    repeatCount="indefinite"
                  />
                </circle>
              ))}
            </g>
          )}
        </g>

        {/* ── Glass Reflection (Outer) ── */}
        <rect
          x={TANK_X + 5}
          y={TANK_Y + 5}
          width={15}
          height={TANK_HEIGHT - 10}
          rx={rx - 5}
          fill="rgba(255,255,255,0.15)"
          pointerEvents="none"
        />

        {/* ── Measurements / Ticks ── */}
        {[20, 40, 60, 80].map((t) => (
          <line
            key={t}
            x1={TANK_X + TANK_WIDTH - 10}
            y1={TANK_Y + TANK_HEIGHT - (t / 100) * TANK_HEIGHT}
            x2={TANK_X + TANK_WIDTH}
            y2={TANK_Y + TANK_HEIGHT - (t / 100) * TANK_HEIGHT}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1"
          />
        ))}

        {/* ── Level Text (Centred) ── */}
        {!loading && (
          <g>
            <text
              x="65"
              y="145"
              textAnchor="middle"
              fontSize="24"
              fontWeight="900"
              fill={fillPct > 50 ? "rgba(255,255,255,0.95)" : "#334155"}
              style={{
                fontFamily: "Inter, sans-serif",
                textShadow: fillPct > 50 ? "0 2px 4px rgba(0,0,0,0.3)" : "none",
              }}
            >
              {isOffline ? "--" : `${Math.round(fillPct)}%`}
            </text>
            <text
              x="65"
              y="162"
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill={fillPct > 50 ? "rgba(255,255,255,0.7)" : "#64748b"}
              style={{ letterSpacing: "2px" }}
            >
              LEVEL
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
