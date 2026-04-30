/**
 * MapLegend — the bottom-left filter/index panel on the Home map.
 * Extracted from Home.tsx to reduce component size.
 */
import clsx from "clsx";
import { } from "lucide-react";

interface FilterItem {
  key: string;
  label: string;
  iconUrl: string;
  activeBg: string;
  activeRing: string;
}

const ASSET_FILTERS: FilterItem[] = [
  {
    key: "EvaraTank",
    label: "EvaraTank",
    iconUrl: "/tank.png",
    activeBg: "bg-indigo-100",
    activeRing: "ring-indigo-400",
  },
  {
    key: "EvaraDeep",
    label: "EvaraDeep",
    iconUrl: "/borewell.png",
    activeBg: "bg-sky-100",
    activeRing: "ring-sky-400",
  },
  {
    key: "EvaraFlow",
    label: "EvaraFlow",
    iconUrl: "/meter.png",
    activeBg: "bg-cyan-100",
    activeRing: "ring-cyan-400",
  },
  {
    key: "EvaraTDS",
    label: "EvaraTDS",
    iconUrl: "/tds.png",
    activeBg: "bg-blue-100 dark:bg-blue-900/30",
    activeRing: "ring-blue-400 text-blue-600 dark:text-blue-400",
  },
];



interface Props {
  showIndex: boolean;
  setShowIndex: (v: boolean) => void;
  activeFilter: string | null;
  onFilterClick: (filter: string) => void;
  activePipeline: string | null;
  onPipelineClick: (pipeline: string) => void;
}

export const MapLegend = ({
  showIndex,
  setShowIndex,
  activeFilter,
  onFilterClick,
  activePipeline,
  onPipelineClick,
}: Props) => {

  return (
    <div className="absolute bottom-6 left-6 z-[1000] flex flex-col items-start pointer-events-none">
      {/* Toggle Button */}
      <button
        data-tour="map-legend"
        onClick={() => setShowIndex(!showIndex)}
        className="p-2.5 mb-2 pointer-events-auto transition-all hover:scale-105 active:scale-95 group rounded-2xl border"
        style={{ 
          background: 'var(--map-control-bg)',
          borderColor: 'var(--map-control-border)',
          boxShadow: 'var(--map-control-shadow)'
        }}
        title={showIndex ? "Hide Index" : "Show Index"}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="light-svg">
          {/* Light mode SVG - Foundation Layer (Bottom-most) - Dark Gray */}
          <path d="M22 13L12 18L2 13" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="light-mode" />
          {/* Third Layer - Gray */}
          <path d="M22 10.5L12 15.5L2 10.5" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="light-mode" />
          {/* Second Layer - Red */}
          <path d="M22 8L12 13L2 8" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="light-mode" />
          {/* Top Layer - Cyan border with Orange center */}
          <path d="M12 3L2 8L12 13L22 8L12 3Z" fill="#22d3ee" stroke="#0891b2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="light-mode" />
          <path d="M12 5.5L7 8L12 10.5L17 8L12 5.5Z" fill="#fbbf24" stroke="#d97706" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="light-mode" />
          
          {/* Dark mode SVG */}
          <defs className="dark-mode">
            <linearGradient id="layer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4de1b8" />
              <stop offset="50%" stopColor="#ffb347" />
              <stop offset="100%" stopColor="#ff7b8a" />
            </linearGradient>
          </defs>
          <path d="M2.5 16.5L12 21L21.5 16.5" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" className="dark-mode" />
          <path d="M2.5 12.5L12 17L21.5 12.5" stroke="#94a3b8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" className="dark-mode" />
          <path d="M2.5 8.5L12 13L21.5 8.5" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="dark-mode" />
          <path d="M12 2.5L2.5 7L12 11.5L21.5 7L12 2.5Z" fill="url(#layer-gradient)" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="dark-mode" />
        </svg>
      </button>

    {/* Index Card */}
    <div
      className={clsx(
        "rounded-[32px] w-[360px] flex flex-col transition-all duration-300 origin-bottom-left overflow-hidden pointer-events-auto",
        "map-legend-panel",
        showIndex
          ? "opacity-100 scale-100 max-h-[500px]"
          : "opacity-0 scale-95 max-h-0",
      )}
    >
      <div className="p-8">
        <h2
          className="text-[13px] uppercase tracking-tight mb-6 cursor-pointer flex items-center gap-1.5 legend-heading"
          onClick={() => onFilterClick("")}
        >
          ASSETS{" "}
          <span className="font-semibold normal-case legend-text">
            — Tanks &amp; Borewells &amp; Flow Meters
          </span>
        </h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
          {ASSET_FILTERS.map((f) => (
            <div
              key={f.key}
              className={clsx(
                "flex items-center gap-3 cursor-pointer rounded-2xl transition-all p-1",
                activeFilter === f.key
                  ? "bg-slate-100 dark:bg-white/10 shadow-sm dark:shadow-none ring-1 ring-slate-200 dark:ring-white/30"
                  : "hover:bg-slate-50 dark:hover:bg-white/5",
              )}
              onClick={() => onFilterClick(f.key)}
            >
              <div
                className={clsx(
                  "w-12 h-12 shrink-0 transition-transform legend-icon-bg",
                  activeFilter === f.key && "scale-105",
                )}
              >
                <img 
                  src={f.iconUrl} 
                  alt={f.label} 
                  className="w-7 h-7 object-contain transition-all brightness-[0.6] saturate-[1.8] contrast-[1.2] dark:brightness-100 dark:saturate-100 dark:contrast-100 dark:opacity-95" 
                />
              </div>
              <span className="text-[15px] font-bold leading-tight legend-text">
                {f.label}
              </span>
            </div>
          ))}
        </div>

        <div className="my-8 border-t legend-divider" />

        <h2 className="text-[13px] uppercase tracking-tight mb-6 legend-heading">
          PIPELINES
        </h2>

        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
          <div
            className={clsx(
              "flex items-center gap-3 cursor-pointer rounded-2xl transition-all p-1",
              activePipeline === "watersupply"
                ? "bg-cyan-100/50 dark:bg-cyan-400/20 shadow-sm dark:shadow-none ring-1 ring-cyan-200 dark:ring-cyan-400/40"
                : "hover:bg-slate-50 dark:hover:bg-white/5",
            )}
            onClick={() => onPipelineClick("watersupply")}
          >
            <div
              className={clsx(
                "w-12 h-12 shrink-0 transition-transform legend-icon-bg",
                activePipeline === "watersupply" && "scale-105",
              )}
            >
              <div className="w-7 h-[6px] bg-[#00b4d8] rounded-full" />
            </div>
            <span className="text-[15px] font-bold leading-tight legend-text">
              Water Supply
            </span>
          </div>

          <div
            className={clsx(
              "flex items-center gap-3 cursor-pointer rounded-2xl transition-all p-1",
              activePipeline === "borewellwater"
                ? "bg-indigo-100/50 dark:bg-indigo-400/20 shadow-sm dark:shadow-none ring-1 ring-indigo-200 dark:ring-indigo-400/40"
                : "hover:bg-slate-50 dark:hover:bg-white/5",
            )}
            onClick={() => onPipelineClick("borewellwater")}
          >
            <div
              className={clsx(
                "w-12 h-12 shrink-0 transition-transform legend-icon-bg",
                activePipeline === "borewellwater" && "scale-105",
              )}
            >
              <div className="w-7 h-[6px] bg-[#000080] rounded-full" />
            </div>
            <span className="text-[15px] font-bold leading-tight legend-text">
              Borewell Water
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
    );
};

export default MapLegend;
