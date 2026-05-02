import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  Tooltip,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  type MapDevice,
} from "../../services/DeviceService";
import type { MapPipeline } from "../../hooks/useMapPipelines";
import { computeDeviceStatus } from "../../services/DeviceService";
import { getTankLevel } from "../../utils/telemetryPipeline";
import { socket } from "../../services/api";
import { getDeviceAnalyticsRoute } from "../../utils/deviceRouting";
import { useTelemetry } from "../../hooks/useTelemetry";
import { type TelemetryData } from "../../services/TelemetryService";
import { useFirestoreFlowData } from "../../hooks/useFirestoreFlowData";
import { getDeviceIcon } from "../../utils/mapIcons";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

// Fix leaflet default icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// ─── Types ──────────────────────────────────────────────────────────────────

interface SharedMapProps {
  devices: MapDevice[];
  pipelines: MapPipeline[];
  height?: string;
  showZoom?: boolean;
  className?: string;
  activeFilter?: string | null;
  activePipeline?: string | null;
  isRightPanelOpen?: boolean;
}

interface HoverPanel {
  device: MapDevice;
  x: number;
  y: number;
}

// ─── Local constants removed in favor of utils/mapIcons.ts ───

// ─── Mini Telemetry Visualizer ────────────────────────────────────────────────
const MiniTelemetryViz = ({ device, snap, firestoreFlow }: { device: MapDevice; snap: any; firestoreFlow?: any }) => {
  const t =
    ((device as any).analytics_template || device.asset_type || "Sensor Node").toLowerCase();

  const findValue = (keys: string[], snapshot?: any, device?: any) => {
    for (const key of keys) {
      if (snapshot?.[key] !== undefined && snapshot?.[key] !== null) {
        return snapshot[key];
      }
      if (snapshot?.[key as keyof TelemetryData] !== undefined && snapshot?.[key as keyof TelemetryData] !== null) {
        return snapshot[key as keyof TelemetryData];
      }
      if (snapshot?.values?.[key] !== undefined && snapshot?.values?.[key] !== null) {
        return snapshot.values[key];
      }
      if (device?.last_telemetry?.[key] !== undefined && device?.last_telemetry?.[key] !== null) {
        return device.last_telemetry[key];
      }
      if (device?.telemetry_snapshot?.[key] !== undefined && device?.telemetry_snapshot?.[key] !== null) {
        return device.telemetry_snapshot[key];
      }
    }
    return null;
  };

  // If it's a tank but no telemetry, show a "Syncing" liquid bar at 0% or placeholder
  if (t === "evaratank" || t === "oht" || t === "sump" || device.asset_type === "tank" || device.asset_type === "sump") {
    const pct = getTankLevel(device, snap);

    const isSyncing = !snap;
    const barColor = pct > 60 ? "#22c55e" : pct > 30 ? "#f59e0b" : "#ef4444";
    const glowColor = pct > 60 ? "rgba(34,197,94,0.5)" : pct > 30 ? "rgba(245,158,11,0.5)" : "rgba(239,68,68,0.5)";

    return (
      <div style={{ marginTop: "12px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "6px",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              fontWeight: 800,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {isSyncing ? "Syncing Level..." : "Water Level"}
          </span>
          <span style={{ fontSize: "14px", fontWeight: 900, color: "var(--text-primary)", fontFamily: "Outfit, sans-serif" }}>
            {pct.toFixed(1)}%
          </span>
        </div>
        <div className="liquid-glass-progress-container">
          <div
            className="liquid-glass-progress-fill"
            style={{
              width: `${Math.min(100, Math.max(5, pct))}%`,
              background: barColor,
              "--glow-color": glowColor,
            } as any}
          >
            <div className="liquid-glass-progress-waves" />
          </div>
        </div>
      </div>
    );
  }

  if (!snap && !firestoreFlow)
    return (
      <div
        style={{
          fontSize: "11px",
          color: "#94a3b8",
          fontStyle: "italic",
          marginTop: "8px",
          textAlign: "center",
          padding: "10px 0",
          background: "rgba(0,0,0,0.03)",
          borderRadius: "12px",
        }}
      >
        Waiting for telemetry...
      </div>
    );

  if (t === "evaradeep") {
    const depth = snap?.depth_value ?? 0;
    const pct = Math.min(100, (depth / 100) * 100);
    return (
      <div style={{ marginTop: "10px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "4px",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Depth
          </span>
          <span style={{ fontSize: "13px", fontWeight: 800, color: "var(--text-primary)" }}>
            {depth.toFixed(1)} m
          </span>
        </div>
        <div
          style={{
            height: "8px",
            background: "rgba(0,0,0,0.07)",
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: "linear-gradient(90deg, #0ea5e9, #38bdf8)",
              borderRadius: "6px",
            }}
          />
        </div>
      </div>
    );
  }

  if (t === "evaratds") {
    const tds = findValue(['tdsValue', 'tds_value', 'field4'], snap, device) ?? 0;
    const temp = findValue(['temperature', 'temp', 'temperature_value', 'field5'], snap, device) ?? 0;
    return (
      <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <div style={{ background: "rgba(16,185,129,0.08)", borderRadius: "10px", padding: "7px 9px", border: "1px solid rgba(16,185,129,0.1)" }}>
          <div style={{ fontSize: "9px", fontWeight: 900, color: "#064e3b", textTransform: "uppercase", marginBottom: "3px" }}>TDS</div>
          <div style={{ fontSize: "15px", fontWeight: 900, color: "#059669" }}>{tds}</div>
          <div style={{ fontSize: "9px", color: "#6b7280", fontWeight: 600 }}>ppm</div>
        </div>
        <div style={{ background: "rgba(249,115,22,0.08)", borderRadius: "10px", padding: "7px 9px", border: "1px solid rgba(249,115,22,0.1)" }}>
          <div style={{ fontSize: "9px", fontWeight: 900, color: "#9a3412", textTransform: "uppercase", marginBottom: "3px" }}>Temp</div>
          <div style={{ fontSize: "15px", fontWeight: 900, color: "#f97316" }}>{temp}°C</div>
        </div>
      </div>
    );
  }

  if (t === "evaraflow") {
    const rate = Number(findValue(['flow_rate', 'flowRate', 'flow_rate_field', 'field3'], snap, device) ?? firestoreFlow?.flowRate ?? 0);
    const total = Number(findValue(['total_liters', 'volume', 'meter_reading_field', 'field1'], snap, device) ?? firestoreFlow?.volume ?? 0);
    return (
      <div
        style={{
          marginTop: "10px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
        }}
      >
        <div
          style={{
            background: "rgba(6,182,212,0.08)",
            borderRadius: "10px",
            padding: "7px 9px",
            border: "1px solid rgba(6,182,212,0.1)",
          }}
        >
          <div
            style={{
              fontSize: "9px",
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: "3px",
            }}
          >
            Flow Rate
          </div>
          <div style={{ fontSize: "15px", fontWeight: 800, color: "#0891b2" }}>
            {rate.toFixed(2)}
          </div>
          <div style={{ fontSize: "9px", color: "#94a3b8", fontWeight: 600 }}>
            L/min
          </div>
        </div>
        <div
          style={{
            background: "rgba(6,182,212,0.08)",
            borderRadius: "10px",
            padding: "7px 9px",
            border: "1px solid rgba(6,182,212,0.1)",
          }}
        >
          <div
            style={{
              fontSize: "9px",
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: "3px",
            }}
          >
            Meter Reading
          </div>
          <div style={{ fontSize: "15px", fontWeight: 800, color: "#0891b2" }}>
            {total >= 1000 ? (total / 1000).toFixed(1) + "k" : total.toFixed(0)}
          </div>
          <div style={{ fontSize: "9px", color: "#94a3b8", fontWeight: 600 }}>
            L
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// ─── Glassmorphism Hover Panel (portal) ─────────────────────────────────────

const DeviceHoverPanel = ({
  device,
  x,
  y,
  onNavigate,
  isRightPanelOpen,
}: {
  device: MapDevice;
  x: number;
  y: number;
  onNavigate: (r: string) => void;
  isRightPanelOpen?: boolean;
}) => {
  const { data: snap } = useTelemetry(device.id);

  const t =
    ((device as any).analytics_template || device.asset_type || "Sensor Node").toLowerCase();

  const firestoreFlow = useFirestoreFlowData(
    device.id,
    t === "evaraflow" ? "flow_meter" : undefined
  );

  // Real-time status detection based on active WebSocket snap or fallback to device API status
  const computedStatus = snap
    ? computeDeviceStatus(snap.timestamp)
    : device.status;
  const isOnline = computedStatus === "Online";

  const deviceHardwareId = (device as any).hardwareId || device.id;
  const route = getDeviceAnalyticsRoute({
    id: device.id,
    hardwareId: deviceHardwareId,
    analytics_template: (device as any).analytics_template,
    asset_type: device.asset_type,
  });
  const accent =
    t === "evaratank"
      ? "#4f46e5"
      : t === "evaradeep"
        ? "#0ea5e9"
        : t === "evaratds"
          ? "#10b981"
          : "#06b6d4";

  const panelW = 240;
  const panelH = 180;
  // Center horizontally over icon
  // If right panel is open, we offset the right constraint by panel width (320px) + margin
  const rightConstraint = isRightPanelOpen ? window.innerWidth - 320 - 32 : window.innerWidth - 8;
  const cx = Math.min(
    Math.max(x - panelW / 2, 8),
    rightConstraint - panelW,
  );

  // Vertical positioning: Default to above the marker.
  // If space at top is limited (cy < 8), flip to appear below marker.
  let cy = y - panelH - 24;
  if (cy < 8) {
    cy = y + 24; // Appear below marker
  }
  // Ultimate constraint: don't go off bottom
  cy = Math.min(cy, window.innerHeight - panelH - 8);

  const displayName = (device as any).displayName || device.label || device.name || (device as any).node_key || deviceHardwareId;

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: cx,
        top: cy,
        width: panelW,
        zIndex: 9999,
        background: "var(--card-bg)",
        backdropFilter: "var(--card-blur) saturate(200%)",
        WebkitBackdropFilter: "var(--card-blur) saturate(200%)",
        border: "1px solid var(--card-border)",
        borderRadius: "28px",
        boxShadow: "0 20px 50px rgba(0,0,0,0.15), inset 0 1px 0 0 rgba(255,255,255,0.05)",
        padding: "18px 20px",
        pointerEvents: "none",
        animation: "hoverFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <style>{`@keyframes hoverFadeIn{from{opacity:0;transform:translateY(8px) scale(0.95)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "12px",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 900,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </h3>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "11px",
              color: "var(--text-muted)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {t}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            background: isOnline
              ? "rgba(34,197,94,0.12)"
              : "rgba(148,163,184,0.15)",
            borderRadius: "999px",
            padding: "4px 10px",
            flexShrink: 0,
            border: `1px solid ${isOnline ? "rgba(34,197,94,0.2)" : "rgba(148,163,184,0.2)"}`,
          }}
        >
          <div
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: isOnline ? "#22c55e" : "#94a3b8",
              boxShadow: isOnline ? "0 0 8px rgba(34,197,94,0.5)" : "none",
            }}
          />
          <span
            style={{
              fontSize: "9px",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: isOnline ? "#16a34a" : "var(--text-muted)",
            }}
          >
            {computedStatus.toUpperCase()}
          </span>
        </div>
      </div>

      <div
        style={{
          height: "1px",
          background: "linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0) 100%)",
          marginBottom: "12px",
        }}
      />

      <MiniTelemetryViz device={device} snap={snap} firestoreFlow={firestoreFlow} />

      <div style={{ marginTop: "18px", pointerEvents: "auto" }}>
        <button
          onClick={() => onNavigate(route)}
          style={{
            width: "100%",
            padding: "10px 0",
            background: accent,
            color: "#fff",
            borderRadius: "14px",
            fontSize: "12px",
            fontWeight: 800,
            border: "none",
            cursor: "pointer",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            boxShadow: `0 8px 16px -4px ${accent}40`,
            transition: "all 0.2s ease",
          }}
          onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
          onMouseOut={(e) => (e.currentTarget.style.transform = "translateY(0)")}
        >
          View Full Analytics
        </button>
      </div>
    </div>,
    document.body,
  );
};

// ─── SharedMap ──────────────────────────────────────────────────────────────

const SharedMap = ({
  devices,
  pipelines,
  height = "400px",
  showZoom = true,
  className,
  activeFilter = null,
  activePipeline = null,
  isRightPanelOpen = false,
}: SharedMapProps) => {
  const [mapBounds, setMapBounds] = useState<L.LatLngBoundsExpression | null>(
    null,
  );
  const [hoverPanel, setHoverPanel] = useState<HoverPanel | null>(null);
  const [realtimeStatuses, setRealtimeStatuses] = useState<Record<string, any>>({});
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  // SaaS Architecture: Persistent Theme Observer
  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains('dark') ||
        document.documentElement.getAttribute('data-theme') === 'dark';
      setTheme(isDark ? 'dark' : 'light');
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, []);

  // SaaS Architecture: Real-time Marker Status Sync
  // Listen to BOTH room-based and global broadcast events
  useEffect(() => {
    const handleUpdate = (data: any) => {
      const id = data.device_id || data.node_id;
      if (!id) return;
      setRealtimeStatuses(prev => ({ ...prev, [id]: data }));
    };
    socket.on("telemetry_update", handleUpdate);
    socket.on("telemetry_broadcast", handleUpdate);
    return () => {
      socket.off("telemetry_update", handleUpdate);
      socket.off("telemetry_broadcast", handleUpdate);
    };
  }, []);

  const filteredDevices = useMemo(
    () =>
      activeFilter
        ? devices.filter(
          (d) =>
            (d as any).analytics_template === activeFilter ||
            d.asset_type === activeFilter,
        )
        : devices,
    [devices, activeFilter],
  );

  const filteredPipelines = useMemo(
    () =>
      activePipeline
        ? pipelines.filter((p) => p.id === activePipeline)
        : pipelines,
    [pipelines, activePipeline],
  );

  // Pre-build icons keyed by composite key (template_status)
  const iconMap = useMemo(() => {
    const m = new Map<string, L.Icon | L.DivIcon>();
    for (const d of filteredDevices) {
      const t = (d as any).analytics_template || d.asset_type || "";

      // FIX: Use computeDeviceStatus on the latest available timestamp to ensure the marker dot
      // matches the real-time status seen in the hover panel.
      const snap = realtimeStatuses[d.id];
      const base = snap || d.last_telemetry || {};
      const latestTs = base.timestamp || base.lastUpdatedAt || base.last_updated_at || base.created_at || base.last_seen || d.last_seen || d.last_online_at || null;
      // OPTIMIZATION: Trust the passed status if it's already normalized, 
      // otherwise fallback to computing it from the latest timestamp.
      const s = (d.status === 'Online' || d.status === 'Offline')
        ? d.status
        : computeDeviceStatus(latestTs);

      const key = `${t}_${s}`;
      if (!m.has(key)) m.set(key, getDeviceIcon(t, s));
    }
    return m;
  }, [filteredDevices, realtimeStatuses]);

  useEffect(() => {
    const points = filteredDevices
      .filter((d) => d.latitude && d.longitude)
      .map((d) => [Number(d.latitude), Number(d.longitude)] as L.LatLngExpression);
    if (points.length > 0) setMapBounds(L.latLngBounds(points).pad(0.05));
  }, [devices.length, filteredDevices]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  return (
    <>
      <div
        style={{ height }}
        className={twMerge(
          clsx(
            "w-full rounded-[24px] overflow-hidden border border-white/20 shadow-inner z-[1]",
            className,
          ),
        )}
      >
        <MapContainer
          bounds={
            mapBounds || [
              [17.44, 78.34],
              [17.45, 78.35],
            ]
          }
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          zoomControl={showZoom}
          scrollWheelZoom={true}
        >
          <TileLayer
            key={theme}
            attribution={theme === 'dark' ? '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors' : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
            url={theme === 'dark'
              ? 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'
              : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            }
          />

          {/* Map theme filters now handled in global index.css for better control */}

          {filteredDevices.map((device) => {
            if (!device.latitude || !device.longitude) return null;
            const t =
              (device as any).analytics_template || device.asset_type || "";

            // FIX: Ensure marker status is computed correctly here too
            const snap = realtimeStatuses[device.id];
            const base = snap || device.last_telemetry || {};
            const latestTs = base.timestamp || base.lastUpdatedAt || base.last_updated_at || base.created_at || base.last_seen || device.last_seen || device.last_online_at || null;
            // OPTIMIZATION: Trust the passed status if it's already normalized
            const s = (device.status === 'Online' || device.status === 'Offline')
              ? device.status
              : computeDeviceStatus(latestTs);

            const key = `${t}_${s}`;
            const icon =
              iconMap.get(key) ??
              getDeviceIcon(t, s);
            return (
              <Marker
                key={device.id}
                position={[Number(device.latitude), Number(device.longitude)]}
                icon={icon}
                eventHandlers={{
                  mouseover: (e) => {
                    if (closeTimer.current) clearTimeout(closeTimer.current);
                    const marker = e.target as any;
                    const map = marker._map;
                    const cp = map.latLngToContainerPoint(marker.getLatLng());
                    const rect = (
                      map.getContainer() as HTMLElement
                    ).getBoundingClientRect();
                    setHoverPanel({
                      device,
                      x: rect.left + cp.x,
                      y: rect.top + cp.y,
                    });
                    closeTimer.current = setTimeout(
                      () => setHoverPanel(null),
                      1500,
                    );
                  },
                  mouseout: () => {
                    // Do NOT close immediately — let the 5s timer close it
                  },
                }}
              >
                <Tooltip
                  className="custom-map-tooltip"
                  permanent
                  direction="bottom"
                  offset={[0, 15]}
                  opacity={1}
                >
                  {(device as any).displayName || device.label || device.name || (device as any).node_key}
                </Tooltip>
              </Marker>
            );
          })}

          {filteredPipelines.map((pipeline) => (
            <Polyline
              key={pipeline.id}
              positions={pipeline.positions as L.LatLngExpression[]}
              pathOptions={{
                color: pipeline.status === "Active" ? "#3b82f6" : "#94a3b8",
                weight: 3,
                opacity: 0.6,
                dashArray: pipeline.status === "Active" ? undefined : "10, 10",
              }}
            >
              <Popup>
                <div className="p-1">
                  <h3 className="font-bold text-sm">{pipeline.name}</h3>
                  <p className="text-xs text-gray-400">
                    Status: {pipeline.status}
                  </p>
                </div>
              </Popup>
            </Polyline>
          ))}
        </MapContainer>
      </div>

      {hoverPanel && (
        <DeviceHoverPanel
          device={hoverPanel.device}
          x={hoverPanel.x}
          y={hoverPanel.y}
          isRightPanelOpen={isRightPanelOpen}
          onNavigate={(route) => {
            cancelClose();
            setHoverPanel(null);
            navigate(route);
          }}
        />
      )}
    </>
  );
};

export default SharedMap;
