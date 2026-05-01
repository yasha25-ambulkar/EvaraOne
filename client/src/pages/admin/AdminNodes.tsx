import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Server,
  MapPin,
  Radio,
  Activity,
  Database,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  Edit,
  User,
  Building2,
} from "lucide-react";
import { adminService } from "../../services/admin";
import type { NodeCategory, AnalyticsType } from "../../types/database";
import { useToast } from "../../components/ToastProvider";
import { deviceService } from "../../services/DeviceService";

const AdminNodes = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<any[]>([]);
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const [formData, setFormData] = useState({
    label: "",
    node_key: "",
    category: "OHT" as NodeCategory,
    zone_id: "",
    customer_id: "",
    location_name: "",
    lat: "",
    lng: "",
    capacity: "",
    thingspeak_channel_id: "",
    thingspeak_read_api_key: "",
  });

  const categories: NodeCategory[] = [
    "OHT",
    "Sump",
    "Borewell",
    "GovtBorewell",
    "PumpHouse",
    "FlowMeter",
  ];

  // Fetch Metadata (Zones/Comms/Custs) once
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const h = await adminService.getHierarchy();
        setHierarchy(h);
      } catch (err) {
        console.error("Failed to fetch hierarchy metadata:", err);
      } finally {
        setLoadingMetadata(false);
      }
    };
    fetchMetadata();
  }, []);

  // Subscribe to Nodes Real-time via API polling
  useEffect(() => {
    const unsub = deviceService.subscribeToMapNodes(
      (nodesData) => {
        // Enforce descending sort on front-end if 'created_at' exists
        const sorted = nodesData.sort((a: any, b: any) => {
             const t1 = new Date(b.created_at || Date.now()).getTime();
             const t2 = new Date(a.created_at || Date.now()).getTime();
             return t1 - t2;
        });
        setNodes(sorted);
      }
    );

    return () => unsub();
  }, []);

  // Derived nodes with resolved names from hierarchy metadata
  const enrichedNodes = useMemo(() => {
    return nodes.map((node) => {
      let zoneName = "Loading...";
      let communityName = "Loading...";
      let customerName = "Loading...";

      // Find hierarchy data
      const zone = hierarchy.find((z) => z.id === node.zoneId);
      if (zone) {
        zoneName = zone.zoneName;
        // Search all customers in the zone
        const cust = (zone.customers || []).find((cu: any) => cu.id === node.customerId);
        if (cust) {
          customerName = cust.display_name || cust.full_name;
        }
      }

      return {
        ...node,
        zoneName,
        communityName,
        customerName,
      };
    });
  }, [nodes, hierarchy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus("idle");

    // Auto-assign assetType based on category
    let assetType: AnalyticsType = "EvaraTank";
    if (
      formData.category === "Borewell" ||
      formData.category === "GovtBorewell"
    )
      assetType = "EvaraDeep";
    if (formData.category === "PumpHouse" || formData.category === "FlowMeter")
      assetType = "EvaraFlow";

    try {
      const nodeData = {
        hardwareId: formData.node_key,
        displayName: formData.label,
        assetType,
        assetSubType: formData.category,
        zoneId: formData.zone_id,
        customerId: formData.customer_id,
        latitude: parseFloat(formData.lat) || 0,
        longitude: parseFloat(formData.lng) || 0,
        thingspeakChannelId: formData.thingspeak_channel_id,
        thingspeakReadKey: formData.thingspeak_read_api_key,
        capacity: parseFloat(formData.capacity) || 0,
        status: "active",
        created_at: new Date().toISOString(),
      };

      await adminService.createNode(nodeData);
      showToast("Asset successfully registered", "success");
      setStatus("success");
      setFormData({
        label: "",
        node_key: "",
        category: "OHT",
        zone_id: "",
        customer_id: "",
        location_name: "",
        lat: "",
        lng: "",
        capacity: "",
        thingspeak_channel_id: "",
        thingspeak_read_api_key: "",
      });
      // Removed fetchData() as onSnapshot will auto-pick the new node
    } catch (err: any) {
      setStatus("error");
      const msg =
        err.response?.data?.message || err.message || "Failed to add node.";
      setErrorMsg(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this asset?")) return;
    try {
      await adminService.deleteNode(id);
      showToast("Asset deleted", "success");
      // Removed fetchData() as onSnapshot will auto-pick the deletion
    } catch (err) {
      showToast("Failed to delete asset", "error");
    }
  };

  // Memoized selection options
  const zonesList = useMemo(() => hierarchy, [hierarchy]);
  const customersList = useMemo(() => {
    const zone = zonesList.find((z) => z.id === formData.zone_id);
    return zone ? zone.customers : [];
  }, [zonesList, formData.zone_id]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[var(--text-primary)]">
            Infrastructure Asset Registry
          </h2>
          <p className="text-[#4B5563] mt-1 font-medium opacity-80">
            Provision and manage nodes, tanks, and telemetry sources.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-sm font-semibold border border-emerald-100 shadow-sm">
          <Database className="w-4 h-4" />
          Firestore Nodes System
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          <form
            onSubmit={handleSubmit}
            className="bg-white/10 backdrop-blur-2xl rounded-3xl shadow-xl border border-white/20 overflow-hidden"
          >
            <div className="px-8 py-4 bg-white/10 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                New Asset Provisioning
              </span>
              <Server className="w-4 h-4 text-[#1F2937] opacity-40" />
            </div>

            <div className="p-8 space-y-6">
              {status === "error" && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="font-medium text-sm">{errorMsg}</span>
                </div>
              )}

              {/* Basic Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pump House 1"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-300 text-slate-700"
                    value={formData.label}
                    onChange={(e) =>
                      setFormData({ ...formData, label: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Node Key (ID)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EV-NODE-001"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-300 font-mono text-sm"
                    value={formData.node_key}
                    onChange={(e) =>
                      setFormData({ ...formData, node_key: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-indigo-600">
                    Category (Asset Type)
                  </label>
                  <select
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all appearance-none cursor-pointer bg-white"
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        category: e.target.value as NodeCategory,
                      })
                    }
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                       Zone
                    </label>
                    <select
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                      value={formData.zone_id}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          zone_id: e.target.value,
                          customer_id: "",
                        })
                      }
                    >
                      <option value="">Select Zone</option>
                      {zonesList.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.zoneName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                       Customer
                    </label>
                    <select
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white disabled:bg-slate-50"
                      value={formData.customer_id}
                      disabled={!formData.zone_id}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          customer_id: e.target.value,
                        })
                      }
                    >
                      <option value="">Select Customer</option>
                      {customersList?.map((c: any) => (
                        <option key={c.uid || c.id} value={c.uid || c.id}>
                          {c.display_name || c.full_name || c.email || "Unnamed"}
                        </option>
                      ))}
                    </select>
                  </div>
              </div>

              {/* GPS & Capacity */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-emerald-600">
                    Latitude
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                    <input
                      type="text"
                      placeholder="17.4456"
                      className="w-full pl-10 pr-4 py-3 border border-emerald-100 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-mono text-sm bg-emerald-50/20"
                      value={formData.lat}
                      onChange={(e) =>
                        setFormData({ ...formData, lat: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-emerald-600">
                    Longitude
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                    <input
                      type="text"
                      placeholder="78.3516"
                      className="w-full pl-10 pr-4 py-3 border border-emerald-100 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-mono text-sm bg-emerald-50/20"
                      value={formData.lng}
                      onChange={(e) =>
                        setFormData({ ...formData, lng: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Capacity (L) / Height (m)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all text-slate-700"
                    value={formData.capacity}
                    onChange={(e) =>
                      setFormData({ ...formData, capacity: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* ThingSpeak Integration */}
              <div className="pt-4 border-t border-slate-100 mt-4 bg-blue-50/30 p-6 rounded-2xl border-dashed border-blue-100">
                <div className="flex items-center gap-2 mb-6 text-blue-700">
                  <Radio className="w-5 h-5" />
                  <h4 className="text-sm font-bold uppercase tracking-wider">
                    ThingSpeak Hook
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-blue-500 uppercase mb-2">
                      Channel ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2481920"
                      className="w-full px-4 py-3 border border-blue-100 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-400 outline-none transition-all font-mono text-sm bg-white"
                      value={formData.thingspeak_channel_id}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          thingspeak_channel_id: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-blue-500 uppercase mb-2">
                      Read API Key
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. UXORK5..."
                      className="w-full px-4 py-3 border border-blue-100 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-400 outline-none transition-all font-mono text-sm bg-white"
                      value={formData.thingspeak_read_api_key}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          thingspeak_read_api_key: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 rounded-2xl bg-[#3A7AFE] text-white font-bold text-sm shadow-xl shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    Provision Hardware Node
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Info Card */}
        <div className="bg-gradient-to-br from-[#1E3A8A] to-[#1D4ED8] rounded-3xl p-8 text-white shadow-xl flex flex-col justify-between overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl animate-pulse" />
          <div>
            <Activity className="w-12 h-12 text-emerald-400 mb-6" />
            <h3 className="text-2xl font-bold mb-4">Node Provisions</h3>
            <p className="text-emerald-100 text-sm leading-relaxed mb-8">
              Nodes registered here are synced to the active map and category
              lists. Hardware identifiers are verified against the ThingSpeak
              ingestion pipe.
            </p>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-xs font-bold text-emerald-300 bg-white/10 p-3 rounded-xl border border-white/10">
                <Database size={16} /> Collection: nodes
              </div>
              <div className="flex items-center gap-3 text-xs font-bold text-emerald-300 bg-white/10 p-3 rounded-xl border border-white/10">
                <Radio size={16} /> ThingSpeak Data Hook
              </div>
              <div className="flex items-center gap-3 text-xs font-bold text-emerald-300 bg-white/10 p-3 rounded-xl border border-white/10">
                <CheckCircle size={16} /> Real-Time Health Status
              </div>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-white/10">
            <p className="text-[10px] text-emerald-300/60 uppercase font-black tracking-widest leading-loose">
              Design System v2.0 <br /> Evara IoT Infrastructure
            </p>
          </div>
        </div>
      </div>

      {/* Nodes Table - Task 3 */}
      <div className="bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/20 overflow-hidden shadow-xl">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
          <div>
            <h3 className="font-extrabold text-slate-800 text-lg">
              Active Node Inventory
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time status of all provisioned IoT hardware
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Global Status
              </span>
              <span className="text-sm font-bold text-emerald-600">
                {nodes.length} Assets Online
              </span>
            </div>
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse border-4 border-emerald-50" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Node Name
                </th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Asset Type
                </th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Zone Membership
                </th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Customer
                </th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingMetadata && nodes.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-8 py-20 text-center text-slate-400"
                  >
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-emerald-500" />
                    <p className="font-bold text-sm">
                      Synchronizing node collection...
                    </p>
                  </td>
                </tr>
              ) : nodes.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-8 py-20 text-center text-slate-400 italic font-medium"
                  >
                    No nodes provisioned in the system yet.
                  </td>
                </tr>
              ) : (
                enrichedNodes.map((node) => (
                  <tr
                    key={node.id}
                    onClick={() => navigate(`/node/${node.id}`)}
                    className="hover:bg-slate-50/80 transition-all group cursor-pointer"
                  >
                    <td className="px-8 py-5">
                      <div className="font-extrabold text-slate-800 flex items-center gap-2">
                        {node.displayName}
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5 tracking-tighter">
                        {node.id}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                          node.assetType === "EvaraTank"
                            ? "bg-blue-50 text-blue-600 border border-blue-100"
                            : node.assetType === "EvaraDeep"
                              ? "bg-indigo-50 text-indigo-600 border border-indigo-100"
                              : "bg-cyan-50 text-cyan-600 border border-cyan-100"
                        }`}
                      >
                        {node.assetType}
                      </span>
                      <div className="text-[10px] text-slate-500 mt-1.5 font-bold flex items-center gap-1.5">
                        <Building2 size={10} className="text-slate-300" />
                        {node.assetSubType}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="text-xs font-black text-slate-700 uppercase tracking-tight">
                        {node.zoneName}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="text-xs font-bold text-slate-600 flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center">
                          <User size={10} className="text-slate-400" />
                        </div>
                        {node.customerName}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-all active:scale-95 shadow-sm">
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(node.id)}
                          className="p-2.5 bg-red-50 hover:bg-red-100 rounded-xl text-red-500 transition-all active:scale-95 shadow-sm"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminNodes;
