/**
 * Shared Leaflet map icon factories.
 *
 * Used by Home.tsx (full-size) and Dashboard.tsx (mini).
 * Uses the exact custom SVG templates provided by the user.
 */
import L from "leaflet";

// ── Factory for PNG Icons with Status Dot ──────────────────────────────

const FALLBACK_ICON = L.icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  shadowSize: [41, 41],
});

// ── Status helpers ──────────────────────────────────────────────────────
const ONLINE_STATUSES = [
  "Online",
  "Working",
  "Running",
  "Normal",
  "Flowing",
  "Active",
] as const;
const OFFLINE_STATUSES = [
  "Offline",
  "Not Working",
  "Alert",
  "Critical",
  "Maintenance",
] as const;

export const isOnline = (status: string) =>
  (ONLINE_STATUSES as readonly string[]).includes(status);

export const isOffline = (status: string) =>
  (OFFLINE_STATUSES as readonly string[]).includes(status);

export const getDeviceIcon = (
  assetType: string | null,
  status: string,
  iconSet?: any
): L.Icon | L.DivIcon => {
  if (!assetType) return FALLBACK_ICON;
  const t = assetType.toLowerCase();
  
  let iconUrl = "";
  if (t.includes("tank") || t.includes("sump") || t === "oht" || t === "evaratank") {
    iconUrl = "/tank.png";
  } else if (t.includes("deep") || t.includes("bore") || t.includes("govt") || t === "evaradeep") {
    iconUrl = "/borewell.png";
  } else if (t.includes("flow") || t.includes("meter") || t.includes("pump") || t === "evaraflow") {
    iconUrl = "/meter.png";
  }
  
  if (!iconUrl) return FALLBACK_ICON;

  const online = isOnline(status);
  const dotColor = online ? "#22c55e" : "#ef4444";
  const dotShadow = online ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)";

  // Standardize the icon wrapper size. 'full' size vs 'mini' depends on parameter if we wanted to support it, 
  // but for consistency we use 44px
  return L.divIcon({
    className: "custom-device-marker",
    html: `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        <img src="${iconUrl}" style="width: 28px; height: 28px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));" />
        <div style="
          position: absolute;
          bottom: 1px;
          right: 1px;
          width: 8px;
          height: 8px;
          background-color: ${dotColor};
          border: 1.5px solid white;
          border-radius: 50%;
          box-shadow: 0 0 6px ${dotShadow};
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

/** Color string from asset_type (for inline styles, badges, etc.) */
export const getAssetColor = (assetType: string | null): string => {
  switch (assetType) {
    case "pump":
      return "#9333ea";
    case "sump":
      return "#16a34a";
    case "tank":
      return "#2563eb";
    case "bore":
      return "#eab308";
    case "govt":
      return "#1e293b";
    default:
      return "#2563eb";
  }
};

/** Tailwind button bg class from asset_type */
export const getAssetButtonClass = (assetType: string | null): string => {
  switch (assetType) {
    case "pump":
      return "bg-purple-600 hover:bg-purple-700";
    case "sump":
      return "bg-green-600 hover:bg-green-700";
    case "tank":
      return "bg-blue-600 hover:bg-blue-700";
    case "bore":
      return "bg-yellow-600 hover:bg-yellow-700";
    case "govt":
      return "bg-slate-700 hover:bg-slate-800";
    default:
      return "bg-blue-600 hover:bg-blue-700";
  }
};
