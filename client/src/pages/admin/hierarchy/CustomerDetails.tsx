import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminService } from "../../../services/admin";
import {
  ChevronRight,
  Activity,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Box,
  Trash2,
  Plus,
  Settings,
  Loader2,
} from "lucide-react";
import { Modal } from "../../../components/ui/Modal";
import { AddDeviceForm } from "../../../components/admin/forms/AddDeviceForm";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../components/ToastProvider";
import { deviceService } from "../../../services/DeviceService";

const CustomerDetails = () => {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState<any | null>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<any | null>(null);
  const [deletingDeviceId, setDeletingDeviceId] = useState<string | null>(null);

  // KEY CHANGE: deviceToggles now tracks isVisibleToCustomer from Firestore
  const [deviceToggles, setDeviceToggles] = useState<Record<string, boolean>>({});
  // Track which toggles are currently saving to show loading state
  const [togglingDeviceId, setTogglingDeviceId] = useState<string | null>(null);

  const { user } = useAuth();
  const { showToast } = useToast();

  // Fetch Profile Metadata
  const fetchProfile = async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const expandedData = await adminService.getCustomer(customerId);
      setClient(expandedData);
    } catch (error) {
      console.error("Failed to fetch client details:", error);
      showToast("Error loading customer profile", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [customerId]);

  // Real-Time Sync for Nodes via API polling
  useEffect(() => {
    if (!customerId) return;

    const unsub = deviceService.subscribeToNodeUpdates(
      (nodesData) => setNodes([nodesData]),
      { community_id: "ignore_we_are_fetching_all" }
    );

    const fetchNodes = async () => {
      const allNodes = await deviceService.getMapNodes(undefined, customerId);
      setNodes(allNodes);

      // KEY CHANGE: Initialize toggle state from isVisibleToCustomer field
      // Falls back to true if field doesn't exist yet (safe default)
      const toggleMap: Record<string, boolean> = {};
      allNodes.forEach((n: any) => {
        toggleMap[n.id] = n.isVisibleToCustomer !== false; // default true if not set
      });
      setDeviceToggles(toggleMap);
    };
    fetchNodes();

    return () => unsub();
  }, [customerId]);

  // KEY CHANGE: Device visibility toggle now calls the backend API
  const handleDeviceToggle = async (deviceId: string) => {
    const newValue = !deviceToggles[deviceId];

    // Optimistic UI update — toggle immediately in UI
    setDeviceToggles(prev => ({ ...prev, [deviceId]: newValue }));
    setTogglingDeviceId(deviceId);

    try {
      await adminService.updateDeviceVisibility(deviceId, newValue);
      showToast(
        newValue ? "Device is now visible to customer" : "Device hidden from customer",
        "success"
      );
    } catch (err: any) {
      // Revert toggle on failure
      setDeviceToggles(prev => ({ ...prev, [deviceId]: !newValue }));
      console.error("Failed to update device visibility:", err);
      showToast("Failed to update device visibility", "error");
    } finally {
      setTogglingDeviceId(null);
    }
  };

  // Node Delete Logic
  const handleDeleteDevice = async () => {
    if (!deletingDeviceId) return;

    try {
      await adminService.deleteNode(deletingDeviceId);
      showToast("Device deleted successfully", "success");
      setNodes(prev => prev.filter(n => n.id !== deletingDeviceId));
      setDeletingDeviceId(null);
    } catch (err: any) {
      console.error("Delete failed", err);
      showToast(err.message || "Failed to delete device", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-slate-500 font-medium tracking-tight">
          Loading customer profile...
        </p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="apple-glass-card p-12 text-center rounded-3xl border border-slate-200 shadow-sm">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Activity className="text-slate-400" size={32} />
        </div>
        <h3 className="text-xl font-bold text-slate-800">Customer Not Found</h3>
        <p className="text-slate-500 mb-6">
          The requested customer profile could not be located in the Evara
          infrastructure.
        </p>
        <button
          onClick={() => navigate("/superadmin/customers")}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-blue-200"
        >
          Return to Directory
        </button>
      </div>
    );
  }

  const shadowCommunity = client?.communities;
  const zone = shadowCommunity?.zones;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-4 overflow-hidden">
        <span
          onClick={() => navigate("/superadmin/zones")}
          className="hover:text-blue-600 cursor-pointer shrink-0"
        >
          Zones
        </span>
        <ChevronRight size={14} className="shrink-0" />
        <span
          onClick={() => navigate(`/superadmin/zones/${zone?.id}/customers`)}
          className="hover:text-blue-600 cursor-pointer truncate max-w-[150px]"
        >
          {zone?.name || zone?.zoneName || "Zone"}
        </span>
        <ChevronRight size={14} className="shrink-0" />
        <span className="font-bold text-slate-800 truncate">
          {client?.display_name || client?.full_name || "..."}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            {client?.display_name || client?.full_name || "..."}
          </h2>
          <p className="text-slate-500">Customer Profile & Device Management</p>
        </div>
        <button
          onClick={() => navigate(`/superadmin/zones/${zone?.id}/customers`)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-white/30 text-sm font-medium"
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="apple-glass-card p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
              Contact Details
            </h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 mt-1">
                  <Mail size={16} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase">
                    Email Address
                  </p>
                  <p className="text-slate-800 font-medium">
                    {client?.email || "N/A"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-green-50 text-green-600 mt-1">
                  <Phone size={16} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase">
                    Phone Number
                  </p>
                  <p className="text-slate-800 font-medium">
                    {client?.phone || "N/A"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-50 text-purple-600 mt-1">
                  <MapPin size={16} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase">
                    Location
                  </p>
                  <p className="text-slate-800 font-medium">
                    {client?.address || zone?.name || "N/A"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Assigned Devices */}
        <div className="lg:col-span-2">
          <div className="apple-glass-card p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                Assigned Devices
              </h3>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
              >
                <Plus size={13} /> Add Device
              </button>
            </div>

            {nodes.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <Box size={32} className="mx-auto mb-2 opacity-30" />
                <p className="font-medium">No devices assigned yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {nodes.map((device: any) => (
                  <div
                    key={device.id}
                    onClick={() => navigate(`/node/${device.id}`)}
                    className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all apple-glass-inner cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${device.analytics_template === "EvaraTank"
                              ? "bg-indigo-100 text-indigo-600"
                              : device.analytics_template === "EvaraFlow"
                                ? "bg-cyan-100 text-cyan-600"
                                : "bg-sky-100 text-sky-600"
                            }`}
                        >
                          <Box size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800">
                            {device.displayName ||
                              device.label ||
                              device.node_key ||
                              device.name}
                          </h4>
                          <p className="text-xs text-slate-400">
                            {device.assetType || device.analytics_template}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${device.status === "active" || device.status === "Online"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : "bg-slate-200 text-slate-600 border-slate-300"
                          }`}
                      >
                        {device.status || "Offline"}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 mt-4 pt-4 border-t border-slate-200/60">
                      <span className="flex items-center gap-1">
                        <Activity size={12} /> Last Seen
                      </span>
                      <span className="font-medium text-slate-700">Recently</span>
                    </div>

                    <div className="flex items-center justify-between mt-3 w-full">
                      {/* Configure Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const isFlow =
                            (device.analytics_template || '').toLowerCase().includes('flow') ||
                            (device.device_type || '').toLowerCase().includes('flow') ||
                            (device.assetType || '').toLowerCase().includes('flow');
                          navigate(isFlow ? `/configure-flow/${device.id}` : `/configure/${device.id}`);
                        }}
                        className="px-4 py-2.5 rounded-xl apple-glass-card border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                      >
                        <Settings size={14} /> Configure
                      </button>

                      {/* KEY CHANGE: Toggle Switch now calls handleDeviceToggle → backend API */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!deviceToggles[device.id]}
                        disabled={togglingDeviceId === device.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeviceToggle(device.id);
                        }}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none
                          ${deviceToggles[device.id] ? 'bg-[#0077ff]' : 'bg-[#e2e8f0]'}
                          ${togglingDeviceId === device.id ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                            ${deviceToggles[device.id] ? 'translate-x-5' : 'translate-x-0'}
                          `}
                        />
                      </button>

                      {/* Delete Icon */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingDeviceId(device.id);
                        }}
                        className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors border border-red-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Deletion Confirmation Modal */}
      <Modal
        isOpen={!!deletingDeviceId}
        onClose={() => setDeletingDeviceId(null)}
        title="Confirm Asset Decommission"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-red-50 rounded-2xl border border-red-100">
            <div className="p-3 bg-red-100 text-red-600 rounded-xl">
              <Trash2 size={24} />
            </div>
            <div>
              <h4 className="font-bold text-red-900">
                Permanent Destructive Action
              </h4>
              <p className="text-xs text-red-700">
                This will permanently remove the asset from Evara infrastructure.
              </p>
            </div>
          </div>

          <p className="text-slate-600 text-sm">
            Are you sure you want to delete this device? This action cannot be
            undone and will stop all telemetry ingestion.
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setDeletingDeviceId(null)}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteDevice}
              className="flex-1 py-3 px-4 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-200"
            >
              Delete Device
            </button>
          </div>
        </div>
      </Modal>

      {/* Create/Edit Device Modal */}
      <Modal
        isOpen={showCreateModal || !!editingDevice}
        onClose={() => {
          setShowCreateModal(false);
          setEditingDevice(null);
        }}
        title={
          editingDevice
            ? `Configure Device: ${editingDevice.displayName || editingDevice.label || "Settings"}`
            : "Commission New Hardware"
        }
      >
        <AddDeviceForm
          onSubmit={() => {
            setShowCreateModal(false);
            setEditingDevice(null);
          }}
          onCancel={() => {
            setShowCreateModal(false);
            setEditingDevice(null);
          }}
          initialData={
            editingDevice
              ? {
                ...editingDevice,
                name: editingDevice.label || editingDevice.displayName,
                customer_id: client?.id,
                regionFilter: zone?.id,
                ...(editingDevice.metadata?.thingspeak || {}),
                ...(editingDevice.metadata?.config_tank || {}),
                ...(editingDevice.metadata?.config_deep || {}),
                ...(editingDevice.metadata?.config_flow || {}),
              }
              : {
                customer_id: client?.id,
                community_id: shadowCommunity?.id,
                regionFilter: zone?.id,
              }
          }
        />
      </Modal>
    </div>
  );
};

export default CustomerDetails;
