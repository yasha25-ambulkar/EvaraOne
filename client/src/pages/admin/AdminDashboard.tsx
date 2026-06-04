import { useState } from "react"; // HMR Re-trigger
import { Users, Network, MapPin, Settings, Activity } from "lucide-react";
import { useToast } from "../../components/ToastProvider";
import { ActionCard } from "../../components/admin/ActionCard";
import { Modal } from "../../components/ui/Modal";
import { useAuth } from "../../context/AuthContext";

import { AddCustomerForm } from "../../components/admin/forms/AddCustomerForm";
import { AddDeviceForm } from "../../components/admin/forms/AddDeviceForm";
import { AddZoneForm } from "../../components/admin/forms/AddZoneForm";
import { ConfigForm } from "../../components/admin/forms/ConfigForm";
import { AdminStatItem } from "../../components/admin/AdminStatItem";
import { useDashboardSummary } from "../../hooks/useDashboardSummary";

type ModalType = "zone" | "customer" | "device" | "config" | null;

const AdminDashboard = () => {
  const { showToast } = useToast();
  const { loading: authLoading, user } = useAuth();
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const { data: statsData, isLoading, refetch } = useDashboardSummary();
  const stats = (statsData as any) || {};

  // Mapping backend response to frontend expectations
  const totalDevices = stats?.total_nodes || 0;
  const activeAlerts = stats?.alerts_active || 0;
  const totalCustomers = stats?.total_customers || 0;
  const totalZones = stats?.total_zones || 0;

  const healthPercentage = stats?.system_health || 100;

  const handleAction = (type: ModalType) => {
    setActiveModal(type);
  };

  const handleClose = () => setActiveModal(null);

  const handleFormSuccess = async (result?: any) => {
    try {
      if (activeModal === "zone") {
        showToast("Zone created successfully!", "success");
      }

      if (activeModal === "customer") {
        showToast("Customer registered and credentials synced!", "success");
      }
      if (activeModal === "device") {
        showToast("Node commissioned and telemetry verified!", "success");
      }

      handleClose();
      // Refresh data
      await refetch();
    } catch (error) {
      console.error("Submission failed:", error);
      showToast("Action failed. Please try again.", "error");
    }
  };

  // Show loading state while authenticating or fetching dashboard data
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-sm text-slate-500">Verifying authorization...</p>
        </div>
      </div>
    );
  }

  // Show loading for initial data fetch (but allow interaction after first load)
  if (isLoading && !stats?.total_nodes) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-sm text-slate-500">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  // Safety check: ensure user is authenticated and is superadmin
  if (!user?.role || user.role !== 'superadmin') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-lg font-bold text-red-600">Access Denied</h2>
          <p className="text-sm text-slate-500 mt-2">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── HEADER ─── */}
      <div>
        <h2 className="text-2xl font-bold overview-heading tracking-tight">
          System Overview
        </h2>
        <p className="overview-subheading text-sm">
          Real-time infrastructure monitoring and management.
        </p>
      </div>

      {/* ─── STATS ROW ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <AdminStatItem
          label="Total Nodes"
          value={totalDevices.toString()}
          trend="+2% this week"
          trendUp
        />
        <AdminStatItem
          label="Total Zones"
          value={totalZones.toString()}
          trend={totalZones > 0 ? "Geographic" : "No zones"}
          trendUp
        />
        <AdminStatItem
          label="Active Alerts"
          value={activeAlerts.toString()}
          trend={activeAlerts > 0 ? "Needs Attention" : "All Clear"}
          trendUp={activeAlerts === 0}
        />
        <AdminStatItem
          label="Total Customers"
          value={totalCustomers.toString()}
          trend="+1 new"
          trendUp
        />
        <AdminStatItem
          label="System Health"
          value={`${healthPercentage}%`}
          trend="Stable"
          trendUp
        />
      </div>

      {/* ─── ACTION GRID ─── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold section-heading flex items-center gap-2">
            <Activity size={18} className="section-heading-icon" />
            Quick Actions
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ActionCard
            title="Create Zone"
            description="Define new geographic zones and operational zones."
            icon={MapPin}
            color="indigo"
            stats={`${totalZones} Zones`}
            onClick={() => handleAction("zone")}
          />
          <ActionCard
            title="Add Customer"
            description="Register new clients and assign them to existing communities."
            icon={Users}
            color="purple"
            stats={`${totalCustomers} Active`}
            onClick={() => handleAction("customer")}
          />
          <ActionCard
            title="Add Device"
            description="Provision new hardware nodes and link them to customers."
            icon={Network}
            color="green"
            stats="PROVISION"
            onClick={() => handleAction("device")}
          />
          <ActionCard
            title="System Config"
            description="Update firmware versions and configure global data rates."
            icon={Settings}
            color="amber"
            stats="v2.1.0"
            onClick={() => handleAction("config")}
          />
        </div>
      </div>

      {/* ─── MODALS ─── */}
      <Modal
        isOpen={activeModal === "zone"}
        onClose={handleClose}
        title="Create New Zone / Zone"
        animation="slide-up"
      >
        <AddZoneForm onSubmit={handleFormSuccess} onCancel={handleClose} />
      </Modal>



      <Modal
        isOpen={activeModal === "customer"}
        onClose={handleClose}
        title="Register New Customer"
        animation="flip"
      >
        <AddCustomerForm onSubmit={handleFormSuccess} onCancel={handleClose} />
      </Modal>

      <Modal
        isOpen={activeModal === "device"}
        onClose={handleClose}
        title="Provision New Node"
        size="xl"
        animation="scale"
      >
        <AddDeviceForm onSubmit={handleFormSuccess} onCancel={handleClose} />
      </Modal>

      <Modal
        isOpen={activeModal === "config"}
        onClose={handleClose}
        title="System Configuration"
      >
        <ConfigForm onSubmit={handleFormSuccess} onCancel={handleClose} />
      </Modal>
    </div>
  );
};

export default AdminDashboard;
