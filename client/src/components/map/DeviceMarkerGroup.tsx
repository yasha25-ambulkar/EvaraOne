/**
 * DeviceMarkerGroup — renders filtered Leaflet markers with popups for a
 * single asset category.  Replaces 5 near-identical marker blocks that were
 * duplicated in Home.tsx.
 */
import { Marker, Popup } from "react-leaflet";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  isOnline,
  getAssetButtonClass,
  getDeviceIcon,
} from "../../utils/mapIcons";
import { getDeviceAnalyticsRoute } from "../../utils/deviceRouting";
import type { MapDevice } from "../../hooks/useMapDevices";

interface Props {
  devices: MapDevice[];
  activeFilter: string | null;
  /** Filter key(s) that should make this group visible. The group is also visible when activeFilter is null. */
  filterKeys: string[];
}

export const DeviceMarkerGroup = ({
  devices,
  activeFilter,
  filterKeys,
}: Props) => {
  // Visibility check
  if (activeFilter !== null && !filterKeys.includes(activeFilter)) return null;

  return (
    <>
      {devices.map((device) => {
        const icon = getDeviceIcon(device.asset_type, device.status);

        return (
          <Marker
            key={device.id}
            position={[device.latitude!, device.longitude!]}
            icon={icon}
          >
            <Popup>
              <div className="p-2 min-w-[160px]">
                <h3 className="font-bold text-slate-800 text-sm mb-0.5">
                  {device.name}
                </h3>
                <p className="text-[10px] font-mono text-slate-400 mb-2">
                  {device.hardwareId || device.id}
                </p>
                {device.capacity && (
                  <p className="text-xs text-slate-600 mb-1">
                    Capacity: {device.capacity}
                  </p>
                )}
                <div className="mb-3">
                  <span
                    className={clsx(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full inline-block",
                      isOnline(device.status)
                        ? "text-green-600 bg-green-50"
                        : "text-slate-600 bg-slate-100",
                    )}
                  >
                    {device.status}
                  </span>
                </div>
                <Link
                  to={getDeviceAnalyticsRoute({
                    id: device.id,
                    hardwareId: device.hardwareId || device.id,
                    analytics_template: device.analytics_template,
                    asset_type: device.asset_type ?? null,
                    device_type: device.device_type,
                  })}
                  className={clsx(
                    "block w-full text-center text-white text-xs font-bold py-1.5 px-3 rounded transition-colors",
                    getAssetButtonClass(device.asset_type ?? null),
                  )}
                >
                  View Details →
                </Link>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
};

export default DeviceMarkerGroup;
