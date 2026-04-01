/**
 * Home — Full-screen map page with device markers, pipeline overlays,
 * status panel, and system dashboard.
 */
import { useState } from "react";
import SharedMap from "../components/map/SharedMap";
import { useMapDevices } from "../hooks/useMapDevices";
import { useMapPipelines } from "../hooks/useMapPipelines";

// Extracted sub-components
import MapLegend from "../components/map/MapLegend";

export const Home = () => {
  const [showIndex, setShowIndex] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [activePipeline, setActivePipeline] = useState<string | null>(null);

  const { data: devices = [], isLoading: devicesLoading } = useMapDevices();
  const { pipelines, loading: pipelinesLoading } = useMapPipelines();

  const handleFilterClick = (filter: string) =>
    setActiveFilter((prev) => (prev === filter ? null : filter));
  const handlePipelineClick = (pipeline: string) =>
    setActivePipeline((prev) => (prev === pipeline ? null : pipeline));


  return (
    <div className="relative w-full h-screen flex flex-col">
      <div className="flex-1 relative z-0">
        <SharedMap
          devices={devices}
          pipelines={pipelines}
          activeFilter={activeFilter}
          activePipeline={activePipeline}
          height="100%"
          className="rounded-none border-none shadow-none"
          isRightPanelOpen={false}
        />


        {/* Subtle Loading Indicators */}
        {(devicesLoading || pipelinesLoading) && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[400] apple-glass-card backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-slate-200 flex items-center gap-3 animate-pulse">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Syncing Live Data...
            </span>
          </div>
        )}
      </div>

      {/* Extracted Map Legend */}
      <MapLegend
        showIndex={showIndex}
        setShowIndex={setShowIndex}
        activeFilter={activeFilter}
        onFilterClick={handleFilterClick}
        activePipeline={activePipeline}
        onPipelineClick={handlePipelineClick}
      />
    </div>
  );
};

export default Home;
