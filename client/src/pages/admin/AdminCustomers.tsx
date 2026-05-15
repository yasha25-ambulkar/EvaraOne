import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { adminService } from "../../services/admin";
import { User, Search, MapPin, Filter, Plus, PencilLine, Trash2 } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { AddCustomerForm } from "../../components/admin/forms/AddCustomerForm";
import { useToast } from "../../components/ToastProvider";
import { useConfirm } from "../../components/ui/ConfirmProvider";

const AdminCustomers = () => {
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<any[]>([]);

  const [zones, setZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<any | null>(null);

  const fetchClients = async () => {
    try {
      const [custData, zoneData] = await Promise.all([
        adminService.getCustomers(),
        adminService.getRegions(),
      ]);
      setClients(Array.isArray(custData) ? custData : []);
      setZones(Array.isArray(zoneData) ? zoneData : []);
    } catch (error) {
      console.error("Failed to fetch clients or hierarchy:", error);
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);



  const zoneMap = useMemo(
    () => Object.fromEntries((zones || []).map((z) => [z.id, z])),
    [zones],
  );

  const filteredClients = (clients || []).filter((c) => {
    const name = (c.display_name || c.full_name || "").toLowerCase();
    const email = (c.email || "").toLowerCase();
    return (
      name.includes(search.toLowerCase()) ||
      email.includes(search.toLowerCase())
    );
  });

  const handleDeleteCustomer = async (customer: any) => {
    const ok = await confirm({
      title: "Delete this Customer?",
      description: `Are you sure you want to delete ${customer?.display_name || customer?.full_name || "this customer"}? This action will remove their profile and access permanently.`,
      confirmText: "Yes, Delete Customer",
      cancelText: "Cancel",
      danger: true,
    });

    if (!ok) return;

    try {
      await adminService.deleteCustomer(customer.id);
      showToast("Customer deleted successfully", "success");
      fetchClients();
    } catch (error: any) {
      showToast(error?.message || "Failed to delete customer", "error");
    }
  };


  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-[24px]">
        <div>
          <h2 className="text-[28px] font-[600] tracking-[-0.5px] text-[var(--text-primary)] leading-tight">
            Customer Management
          </h2>
          <p className="glass-secondary mt-1">
            Global list of registered customers across all zones.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1F2937] opacity-40"
              size={18}
            />
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl text-sm focus:ring-2 focus:ring-[rgba(38,122,254,0.3)] focus:border-[#3A7AFE] outline-none w-64 shadow-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all"
            />
          </div>
          <button className="p-2 bg-[rgba(255,255,255,0.3)] border border-[rgba(255,255,255,0.4)] rounded-xl text-[#1F2937] opacity-80 hover:bg-[rgba(255,255,255,0.5)] shadow-sm transition-all">
            <Filter size={18} />
          </button>
          {role === "superadmin" && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-[12px] bg-[#3A7AFE] text-white font-[700] text-[13px] shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Plus size={16} /> Add Customer
            </button>
          )}
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/20 overflow-hidden shadow-xl">
        <div className="p-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.05)] text-[11px] font-[600] text-[var(--text-muted)] uppercase tracking-wider">
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Location Context</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Devices</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.1)]">
              {(filteredClients || []).map((client) => (
                <tr
                  key={client?.id}
                  onClick={() => navigate(`/superadmin/customers/${client?.id}`)}
                  className="group hover:bg-[rgba(255,255,255,0.2)] transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[rgba(255,255,255,0.3)] flex items-center justify-center text-[#1F2937] border border-[rgba(255,255,255,0.4)] shadow-sm">
                        <User size={18} className="opacity-70" />
                      </div>
                      <div>
                        <p className="text-[14px] font-[600] customer-name group-hover:text-[#3A7AFE] dark:group-hover:text-blue-400 transition-colors">
                          {client?.display_name ||
                            client?.full_name ||
                            "Unnamed Customer"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-[13px]">
                      <MapPin size={14} className="customer-location opacity-50" />
                      <div>
                        <span className="customer-location font-[500]">
                          {zoneMap[client?.zone_id || client?.regionFilter]?.zoneName || "No Zone Assigned"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[13px] customer-email">
                      <p className="font-[500] opacity-90">
                        {client?.email || "—"}
                      </p>
                      <p className="customer-secondary">{client?.phone || "N/A"}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[13px] font-[600] customer-badge bg-[rgba(255,255,255,0.4)] dark:bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.5)] dark:border-[rgba(255,255,255,0.2)] px-2.5 py-1 rounded-[8px] shadow-sm">
                      {typeof client?.deviceCount === 'number' ? client.deviceCount : (client?.devices?.length || 0)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {role === "superadmin" ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingClient(client);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3A7AFE] text-white text-[12px] font-[700] shadow-sm hover:bg-[#2563EB] transition-all"
                          >
                            <PencilLine size={14} /> Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCustomer(client);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[#EF4444] bg-[rgba(239,68,68,0.06)] text-[12px] font-[700] hover:bg-[rgba(239,68,68,0.12)] transition-all"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/superadmin/customers/${client?.id}`);
                          }}
                          className="text-[12px] font-[600] customer-btn border border-current/20 bg-[rgba(58,122,254,0.1)] px-3 py-1.5 rounded-[8px] hover:bg-[rgba(58,122,254,0.15)] hover:shadow-md transition-all shadow-sm"
                        >
                          View
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredClients.length === 0 && (
          <div className="p-12 text-center">
            <User className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-500 font-medium">
              {loading
                ? "Loading..."
                : "No customers yet. Add your first customer."}
            </p>
          </div>
        )}
      </div>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Customer"
      >
        <AddCustomerForm
          onSubmit={() => {
            setShowAddModal(false);
            fetchClients();
          }}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>

      <Modal
        isOpen={!!editingClient}
        onClose={() => setEditingClient(null)}
        title={`Edit Customer${editingClient ? `: ${editingClient.display_name || editingClient.full_name || ''}` : ''}`}
      >
        <AddCustomerForm
          initialData={editingClient}
          onSubmit={() => {
            setEditingClient(null);
            fetchClients();
          }}
          onCancel={() => setEditingClient(null)}
        />
      </Modal>
    </div>
  );
};

export default AdminCustomers;
