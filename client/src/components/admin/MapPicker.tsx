/**
 * MapPicker â€” Interactive OpenStreetMap for picking device location.
 * Supports: manual lat/lng entry with fly-to, click-to-place, drag-to-reposition.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Check, Navigation, Search } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default icon broken in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

interface Props {
    initialLat?: number;
    initialLng?: number;
    onConfirm: (lat: number, lng: number) => void;
    onCancel: () => void;
}

// Flies map to target coordinates when they change
function FlyToView({ target }: { target: [number, number] | null }) {
    const map = useMap();
    const prevTarget = useRef<[number, number] | null>(null);
    useEffect(() => {
        if (target && (prevTarget.current?.[0] !== target[0] || prevTarget.current?.[1] !== target[1])) {
            map.flyTo(target, 17, { duration: 1.0 });
            prevTarget.current = target;
        }
    }, [target, map]);
    return null;
}

// Handles click on map to move marker
function ClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
    useMapEvents({
        click(e) { onMapClick(e.latlng.lat, e.latlng.lng); }
    });
    return null;
}

export const MapPicker = ({ initialLat = 17.385, initialLng = 78.487, onConfirm, onCancel }: Props) => {
    const [position, setPosition] = useState<[number, number]>([initialLat, initialLng]);
    const [manualLat, setManualLat] = useState('');
    const [manualLng, setManualLng] = useState('');
    const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
    const [coordError, setCoordError] = useState('');
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

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

    const handleDragEnd = useCallback((e: L.DragEndEvent) => {
        const loc = (e.target as L.Marker).getLatLng();
        setPosition([loc.lat, loc.lng]);
    }, []);

    const handleMapClick = useCallback((lat: number, lng: number) => {
        setPosition([lat, lng]);
    }, []);

    const handleGoToCoords = () => {
        const lat = parseFloat(manualLat);
        const lng = parseFloat(manualLng);
        if (isNaN(lat) || lat < -90 || lat > 90) {
            setCoordError('Latitude must be between -90 and 90');
            return;
        }
        if (isNaN(lng) || lng < -180 || lng > 180) {
            setCoordError('Longitude must be between -180 and 180');
            return;
        }
        setCoordError('');
        const coords: [number, number] = [lat, lng];
        setPosition(coords);
        setFlyTarget(coords);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); handleGoToCoords(); }
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Manual coordinate entry */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-[800] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <Search size={11} /> Enter Coordinates to Navigate
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={manualLat}
                        onChange={e => setManualLat(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Latitude (e.g. 17)"
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all"
                    />
                    <input
                        type="text"
                        value={manualLng}
                        onChange={e => setManualLng(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Longitude (e.g. 78)"
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all"
                    />
                    <button
                        type="button"
                        onClick={handleGoToCoords}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-[12px] font-[700] hover:bg-emerald-700 transition-all shrink-0 shadow-sm"
                    >
                        <Navigation size={12} /> Go
                    </button>
                </div>
                {coordError && <p className="text-[10px] text-red-500 font-[500]">{coordError}</p>}
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Click the map or drag the pin to fine-tune the position.</p>
            </div>

            {/* Map */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-md" style={{ height: '380px' }}>
                <MapContainer
                    center={position}
                    zoom={16}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={true}
                >
                    <TileLayer
                        key={theme}
                        attribution={theme === 'dark' ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
                        url={theme === 'dark' 
                          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                        }
                    />
                    <FlyToView target={flyTarget} />
                    <ClickHandler onMapClick={handleMapClick} />
                    <Marker
                        position={position}
                        icon={redIcon}
                        draggable={true}
                        eventHandlers={{ dragend: handleDragEnd }}
                    />
                </MapContainer>
            </div>

            {/* Live coordinates */}
            <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-0.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 shadow-sm">
                    <span className="text-[9px] font-[800] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Latitude</span>
                    <span className="text-[15px] font-[700] text-slate-800 dark:text-white font-mono">{position[0].toFixed(6)}</span>
                </div>
                <div className="flex flex-col gap-0.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 shadow-sm">
                    <span className="text-[9px] font-[800] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Longitude</span>
                    <span className="text-[15px] font-[700] text-slate-800 dark:text-white font-mono">{position[1].toFixed(6)}</span>
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2.5">
                <button type="button" onClick={onCancel}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-[13px] font-[600] hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                    Cancel
                </button>
                <button type="button" onClick={() => onConfirm(position[0], position[1])}
                    className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[13px] font-[800] hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md shadow-emerald-200 active:scale-[0.98]">
                    <Check size={16} /> Place Device Here
                </button>
            </div>
        </div>
    );
};

export default MapPicker;
