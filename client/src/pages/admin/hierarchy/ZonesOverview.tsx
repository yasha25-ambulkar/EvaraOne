import { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { adminService } from "../../../services/admin";
import { Modal } from "../../../components/ui/Modal";
import { AddZoneForm } from "../../../components/admin/forms/AddZoneForm";
import {
  MapPin,
  Users,

  AlertTriangle,
  ArrowRight,
  Plus,
  Globe,
  Edit2,
  Trash2,
} from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { useToast } from "../../../components/ToastProvider";
import { useConfirm } from '../../../components/ui/ConfirmProvider';
import type { Zone as RegionRow } from "../../../types/entities";

interface RegionStat {
  zone_id: string;
  region_name: string;
  state?: string;

  customer_count: number;
  device_count: number;
  online_devices: number;
  offline_devices: number;
}

const RegionsOverview = () => {
  const { user, role, loading: authLoading } = useAuth();
  const [zones, setRegions] = useState<RegionRow[]>([]);
  const [stats, setStats] = useState<RegionStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingZone, setEditingZone] = useState<RegionRow | null>(null);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const fetchData = async () => {
    try {
      const [regionsData, statsData] = await Promise.all([
        adminService.getRegions(),
        adminService.getRegionStats().catch(() => {
          // Silently handle stats failure - regions can still be displayed
          return [];
        }),
      ]);

      setRegions(regionsData as RegionRow[]);
      setStats(statsData as RegionStat[]);
    } catch (error) {
      // Use toast for user-facing error notification
      showToast("Failed to load regions data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading]);

  const getStatsForRegion = (regionId: string) => {
    const s = stats.find((st) => st.zone_id === regionId);
    return {

      customers: s?.customer_count || 0,
      devices: s?.device_count || 0,
      online: s?.online_devices || 0,
      offline: s?.offline_devices || 0,
    };
  };

  const handleRegionCreated = () => {
    setShowCreateModal(false);
    setEditingZone(null);
    setLoading(true);
    fetchData();
  };

  const handleDeleteZone = async (e: React.MouseEvent, zoneId: string) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete this Zone?',
      description: 'Are you sure you want to delete this zone? All communities within it will lose their geographic assignment.',
      confirmText: 'Yes, Delete Zone',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return;

    try {
      await adminService.deleteRegion(zoneId);
      showToast("Zone deleted successfully", "success");
      fetchData();
    } catch (err: any) {
      showToast(err.message || "Failed to delete zone", "error");
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3A7AFE]"></div>
      </div>
    );
  }

  return (
    <div className="glass-dashboard min-h-screen p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-[32px]">
        <div>
          <h2 className="text-[28px] font-[600] tracking-[-0.5px] zone-page-heading leading-tight">
            Operational Zones
          </h2>
          <p className="zone-page-subheading mt-1">
            {zones.length} zone{zones.length !== 1 ? "s" : ""} configured across
            the network.
          </p>
        </div>
        {role === "superadmin" && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-[12px] bg-[#3A7AFE] text-white font-[700] text-[13px] shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus size={16} />
            Create New Zone
          </button>
        )}
      </div>

      {/* Zone Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
        {(zones || []).map((zone) => {
          const rs = getStatsForRegion(zone?.id);
          const healthPercent =
            rs.devices > 0 ? Math.round((rs.online / rs.devices) * 100) : 100;

          return (
            <div
              key={zone?.id}
              className="apple-glass-card group"
            >
              <div className="apple-glass-content relative flex flex-col h-full p-[24px]">
                {/* Background Icon */}
                <div className="absolute top-0 right-0 p-4 transition-opacity pointer-events-none z-0">
                  <MapPin size={80} className="text-[#3A7AFE] opacity-[0.08] pointer-events-none blur-[0.5px]" />
                </div>

                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-5 relative z-10">
                  <div className="flex items-center gap-[12px]">
                    <div className="w-[48px] h-[48px] rounded-[16px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex items-center justify-center text-[var(--text-primary)] opacity-80 font-[700] text-[15px] shadow-sm group-hover:scale-105 transition-transform duration-300">
                      {(zone?.zoneName || "")
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .substring(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-[16px] font-[600] zone-name group-hover:text-[#3A7AFE] dark:group-hover:text-blue-400 transition-colors">
                        {zone?.zoneName}
                      </h3>
                      {zone?.state && (
                        <p className="text-[12px] zone-location flex items-center gap-[4px] mt-1 font-[500]">
                          <Globe size={11} className="opacity-70" />{" "}
                          {zone?.state}, {zone?.country || "India"}
                        </p>
                      )}
                    </div>
                  </div>
                  {zone?.zone_code && (
                    <span className="flex items-center gap-1.5 px-[10px] py-[4px] zone-badge text-[11px] rounded-[8px] uppercase shadow-sm">
                      <MapPin size={12} className="zone-badge-icon" />
                      {zone?.zone_code}
                    </span>
                  )}
                </div>

                {/* Description */}
                {zone?.description && (
                  <p className="text-[13px] zone-desc mb-[20px] line-clamp-2 leading-relaxed">
                    {zone?.description}
                  </p>
                )}

                {/* Stats */}
                <div className="apple-glass-inner p-[16px] space-y-[12px] relative z-10 mb-[20px] flex-1">

                  <div className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-[8px] zone-stat-label font-[500]">
                      <Users size={14} className="opacity-50" /> Customers
                    </span>
                    <span className="font-[600] zone-stat-number">
                      {rs.customers}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-[8px] zone-stat-label font-[500]">
                      Devices
                    </span>
                    <span className="font-[600] zone-stat-number flex items-center gap-[6px]">
                      {rs.devices}
                      {rs.devices > 0 && (
                        <span className="text-[10px] font-[700] text-[#1F2937] dark:text-white opacity-60 dark:opacity-80 bg-[rgba(255,255,255,0.4)] dark:bg-[rgba(255,255,255,0.1)] px-[6px] py-[2px] rounded-[4px] border border-[rgba(255,255,255,0.5)] dark:border-[rgba(255,255,255,0.2)]">
                          {rs.online}↑ {rs.offline}↓
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Health Bar */}
                <div className="mt-auto">
                  <div className="w-full h-[6px] bg-[rgba(255,255,255,0.3)] rounded-full overflow-hidden shadow-inner mb-[16px]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        healthPercent >= 80
                          ? "bg-[#16A34A]"
                          : healthPercent >= 50
                            ? "bg-[#F59E0B]"
                            : "bg-[#EF4444]"
                      }`}
                      style={{ width: `${healthPercent}%` }}
                    />
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center justify-between border-t border-[rgba(255,255,255,0.1)] pt-[16px]">
                    {rs.offline > 0 ? (
                      <div className="flex items-center gap-[6px] text-[12px] font-[600] text-[#EF4444] bg-[rgba(239,68,68,0.1)] px-[12px] py-[6px] rounded-[8px] border border-[rgba(239,68,68,0.2)]">
                        <AlertTriangle size={14} />
                        {rs.offline} Offline
                      </div>
                    ) : (
                      <div className="flex items-center gap-[6px] text-[12px] font-[600] text-[#16A34A] bg-[rgba(22,163,74,0.1)] px-[12px] py-[6px] rounded-[8px] border border-[rgba(22,163,74,0.2)]">
                        <div className="w-[6px] h-[6px] rounded-full bg-[#16A34A]" />
                        All Systems OK
                      </div>
                    )}

                    <div className="flex items-center gap-[6px] text-[11px] font-[700] zone-manage uppercase tracking-wider opacity-80 group-hover:opacity-100 transition-opacity">
                      {user?.role === "superadmin" && (
                        <div className="flex items-center gap-1 mr-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingZone(zone);
                            }}
                            className="px-3 py-1 rounded-lg text-[13px] font-[700] bg-[#3A7AFE] text-white hover:bg-[#2563EB] transition-all shadow-sm"
                            title="Edit Zone"
                            aria-label={`Edit ${zone?.zoneName || 'zone'}`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => handleDeleteZone(e, zone.id)}
                            className="px-3 py-1 rounded-lg text-[13px] font-[700] text-[#EF4444] bg-[rgba(239,68,68,0.06)] hover:bg-[rgba(239,68,68,0.12)] transition-all"
                            title="Delete Zone"
                            aria-label={`Delete ${zone?.zoneName || 'zone'}`}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(`/superadmin/zones/${zone.id}/customers`)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#3A7AFE] text-white text-[12px] font-[800] shadow-sm border border-[rgba(58,122,254,0.25)] hover:bg-[#2563EB] hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
                        aria-label={`Manage ${zone?.zoneName || 'zone'}`}
                      >
                        <span>Manage</span>
                        <ArrowRight
                          size={14}
                          className="transform transition-transform group-hover:translate-x-1"
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Empty State */}
        {zones.length === 0 && (
          <div className="col-span-full py-[100px] text-center bg-transparent">
            <div className="bg-white/30 backdrop-blur-xl rounded-[32px] border border-white/40 p-12 max-w-lg mx-auto shadow-sm">
              <MapPin
                className="mx-auto text-[#1F2937] opacity-20 mb-6"
                size={56}
              />
              <h3 className="text-[20px] font-[600] text-[#1F2937] mb-2">
                No operational zones found.
              </h3>
              <p className="text-[14px] text-[#4B5563] mb-8 font-[500]">
                Deploy and configure geographic zones to start managing your
                network infrastructure.
              </p>
              {user?.role === "superadmin" && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-8 py-[14px] bg-[#3A7AFE] text-white text-[14px] font-[600] rounded-[16px] hover:bg-[#2563EB] shadow-[0_8px_16px_rgba(58,122,254,0.15)] transition-all transform hover:-translate-y-[1px]"
                >
                  Create First Zone
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Zone Modal */}
      <Modal
        isOpen={showCreateModal || !!editingZone}
        onClose={() => {
          setShowCreateModal(false);
          setEditingZone(null);
        }}
        title={
          editingZone
            ? `Edit Zone: ${editingZone.zoneName}`
            : "Create New Zone / Zone"
        }
      >
        <AddZoneForm
          onSubmit={handleRegionCreated}
          onCancel={() => {
            setShowCreateModal(false);
            setEditingZone(null);
          }}
          initialData={editingZone}
        />
      </Modal>
    </div>
  );
};

export default RegionsOverview;
