import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { adminService } from "../../../services/admin";
import {
  ChevronRight,
  User,
  MapPin,
  ArrowLeft,
  AlertCircle,
  Edit2,
  Trash2,
  Plus,
} from "lucide-react";
import { Modal } from "../../../components/ui/Modal";
import { AddCustomerForm } from "../../../components/admin/forms/AddCustomerForm";
import { useToast } from "../../../components/ToastProvider";
import { useConfirm } from '../../../components/ui/ConfirmProvider';
import type {
  Zone as RegionRow,

  Customer as UserProfileRow,
  Device as DeviceRow,
} from "../../../types/entities";

type CustomerWithDevices = UserProfileRow & {
  devices?: Pick<
    DeviceRow,
    "id" | "status" | "analytics_template" | "node_key"
  >[];
  distributor_id?: string;
};

const RegionCustomers = () => {
  const { regionId } = useParams(); // regionId is the zone name
  const navigate = useNavigate();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [customers, setCustomers] = useState<CustomerWithDevices[]>([]);
  const [regionData, setRegionData] = useState<RegionRow | null>(null);
  const [_loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [custData, regData] = await Promise.all([
          adminService.getCustomers(),
          adminService.getRegions(),
        ]);
        setCustomers(custData as CustomerWithDevices[]);
        setRegionData(
          (regData as RegionRow[]).find((r) => r.id === regionId) || null,
        );
      } catch (error) {
        console.error("Failed to fetch zone customers data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [regionId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [custData, regData] = await Promise.all([
        adminService.getCustomers(),
        adminService.getRegions(),
      ]);
      setCustomers(custData as CustomerWithDevices[]);
      const foundRegion = (regData as RegionRow[]).find(
        (r) => r.id === regionId,
      );
      setRegionData(foundRegion || null);
    } catch (error) {
      console.error("Failed to fetch zone customers data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCustomer = async (
    e: React.MouseEvent,
    customerId: string,
  ) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete this Customer?',
      description: 'Are you sure you want to delete this customer? This will remove their access and all assigned devices.',
      confirmText: 'Yes, Delete Customer',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return;

    try {
      await adminService.deleteCustomer(customerId);
      showToast("Customer deleted successfully", "success");
      fetchData();
    } catch (err: any) {
      showToast(err.message || "Failed to delete customer", "error");
    }
  };

  // Filter Logic: Important bugfix -> use zone_id
  // Filter Logic: Show customers assigned to this zone (checking new zone_id and legacy regionFilter)
  const regionCustomers = customers.filter(
    (cust) => cust.zone_id === regionId || cust.regionFilter === regionId
  );

  return (
    <div className="glass-dashboard min-h-screen p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-[8px] text-[13px] text-[#1F2937] opacity-60 mb-[16px] font-[500] tracking-wide">
        <span
          onClick={() => navigate("/superadmin/zones")}
          className="hover:opacity-100 cursor-pointer transition-opacity"
        >
          Zones
        </span>
        <ChevronRight size={14} className="opacity-50" />
        <span className="font-[600] text-[#1F2937] opacity-100">
          {regionData?.zoneName || "Loading Zone..."}
        </span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-[24px]">
        <div>
          <h2 className="text-[28px] font-[600] tracking-[-0.5px] text-[#1F2937] leading-tight">
            {regionData?.zoneName || "Unknown Zone"} Customers
          </h2>
          <p className="glass-secondary mt-1">
            Managing all subscribers in the {regionData?.zoneName || "selected"}{" "}
            operational area.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user?.role === "superadmin" && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-[12px] bg-[#3A7AFE] text-white font-[700] text-[13px] shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Plus size={16} />
              Add Customer
            </button>
          )}
          <button
            onClick={() => navigate("/superadmin/zones")}
            className="flex items-center gap-[8px] px-4 py-2 rounded-[12px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] text-[var(--text-primary)] opacity-80 hover:bg-[rgba(255,255,255,0.1)] text-[13px] font-[600] shadow-sm transition-all"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      <div className="apple-glass-card">
        <div className="apple-glass-content">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.1)] text-[11px] font-[600] text-[#1F2937] opacity-70 uppercase tracking-wider">
                <th className="px-6 py-5">Customer Profile</th>
                <th className="px-6 py-5">Zone Alignment</th>
                <th className="px-6 py-5">Platform Status</th>
                <th className="px-6 py-5">Provisioned Devices</th>
                <th className="px-6 py-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.1)]">
              {regionCustomers.map((customer) => {
                const hasAlert = customer.devices?.some(
                  (d) => d.status !== "Online"
                );

                return (
                  <tr
                    key={customer.id}
                    onClick={() =>
                      navigate(`/superadmin/customers/${customer.id}`)
                    }
                    className="group hover:bg-[rgba(255,255,255,0.2)] transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-[12px] bg-[rgba(255,255,255,0.3)] flex items-center justify-center text-[#1F2937] opacity-80 border border-[rgba(255,255,255,0.4)] shadow-sm group-hover:scale-105 transition-transform">
                          <User size={20} className="opacity-70" />
                        </div>
                        <div>
                          <p className="font-[600] text-slate-800 text-[14px] group-hover:text-[#3A7AFE] transition-colors block">
                            {customer.full_name ||
                              customer.display_name ||
                              "Unnamed Client"}
                          </p>
                          <p className="text-[11px] text-[#1F2937] opacity-50 font-mono tracking-tighter uppercase mt-0.5">
                            {customer.email || "No email provided"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-[8px] bg-[rgba(255,255,255,0.3)] border border-[rgba(255,255,255,0.4)] flex items-center justify-center opacity-80 shadow-sm">
                          <MapPin size={14} className="text-[#1F2937]" />
                        </div>
                        <div>
                          <p className="text-[13px] font-[500] text-[#1F2937] opacity-90">
                            {regionData?.zoneName || "Assigned Zone"}
                          </p>
                          <p className="text-[10px] text-[#1F2937] opacity-50 font-mono uppercase tracking-widest">
                            {regionData?.state || "Geographic Context"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {hasAlert ? (
                        <span className="inline-flex items-center gap-[6px] px-2.5 py-1 rounded-[8px] bg-[rgba(239,68,68,0.1)] text-[#EF4444] text-[11px] font-[600] border border-[rgba(239,68,68,0.2)] shadow-sm">
                          <AlertCircle size={12} /> CRITICAL
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-[6px] px-2.5 py-1 rounded-[8px] bg-[rgba(22,163,74,0.1)] text-[#16A34A] text-[11px] font-[600] border border-[rgba(22,163,74,0.2)] shadow-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />{" "}
                          STABLE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {(customer.devices || []).map((dev) => (
                            <div
                              key={dev.id}
                              className={`w-7 h-7 rounded-[8px] border border-[rgba(255,255,255,0.4)] shadow-sm flex items-center justify-center text-[10px] text-white font-[600] ${
                                dev.analytics_template === "EvaraTank"
                                  ? "bg-[#3A7AFE]"
                                  : dev.analytics_template === "EvaraFlow"
                                    ? "bg-[#06B6D4]"
                                    : "bg-[#6366F1]"
                              }`}
                              title={dev.analytics_template || undefined}
                            >
                              {dev.analytics_template?.[5] || "D"}
                            </div>
                          ))}
                        </div>
                        <span className="text-[12px] font-[500] text-[#1F2937] opacity-60 ml-1">
                          {customer.devices?.length || 0} Nodes
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {user?.role === "superadmin" && (
                          <div className="flex items-center gap-2 mr-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCustomer(customer);
                                }}
                                className="px-3 py-1 rounded-lg text-[12px] font-[700] bg-[#3A7AFE] text-white hover:bg-[#2563EB] transition-all shadow-sm"
                                aria-label={`Edit ${customer.full_name || 'customer'}`}
                              >
                                Edit
                              </button>
                              <button
                                onClick={(e) =>
                                  handleDeleteCustomer(e, customer.id)
                                }
                                className="px-3 py-1 rounded-lg text-[12px] font-[700] text-[#EF4444] bg-[rgba(239,68,68,0.06)] hover:bg-[rgba(239,68,68,0.12)] transition-all"
                                aria-label={`Delete ${customer.full_name || 'customer'}`}
                              >
                                Delete
                              </button>
                            </div>
                        )}
                        <ChevronRight
                          size={18}
                          className="text-[#1F2937] opacity-30 group-hover:text-[#3A7AFE] group-hover:opacity-100 transition-colors inline-block"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {regionCustomers.length === 0 && (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-[rgba(255,255,255,0.3)] border border-[rgba(255,255,255,0.4)] shadow-sm rounded-[16px] flex items-center justify-center mx-auto mb-4">
                <User size={32} className="text-[#1F2937] opacity-50" />
              </div>
              <h4 className="text-[18px] font-[600] text-[#1F2937]">
                No Customers Found
              </h4>
              <p className="glass-secondary max-w-xs mx-auto mt-1">
                There are no customers registered in this zone yet.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Customer Modal */}
      <Modal
        isOpen={showCreateModal || !!editingCustomer}
        onClose={() => {
          setShowCreateModal(false);
          setEditingCustomer(null);
        }}
        title={
          editingCustomer
            ? `Edit Customer: ${editingCustomer.full_name || editingCustomer.display_name}`
            : "Create New Customer"
        }
      >
        <AddCustomerForm
          onSubmit={() => {
            setShowCreateModal(false);
            setEditingCustomer(null);
            fetchData();
          }}
          onCancel={() => {
            setShowCreateModal(false);
            setEditingCustomer(null);
          }}
          initialData={editingCustomer}
        />
      </Modal>
    </div>
  );
};

export default RegionCustomers;
