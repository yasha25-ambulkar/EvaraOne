import api from "./api";
import type { Zone, Community, Customer } from "../types/entities";

export interface AdminStats {
  total_nodes: number;
  online_nodes: number;
  alerts_active: number;
  total_customers: number;
  total_zones: number;
  system_health: number;
}

export interface AlertRule {
  id: string;
  name: string;
  node_id: string;
  metric: string;
  condition: ">" | "<" | "==";
  threshold: number;
  enabled: boolean;
}

export interface AlertHistory {
  id: string;
  rule_id: string;
  value_at_time: number;
  triggered_at: string;
  rule: AlertRule;
}

export interface Profile extends Customer {
  id: string;
}

class AdminService {
  private static instance: AdminService;

  private constructor() {}

  public static getInstance(): AdminService {
    if (!AdminService.instance) {
      AdminService.instance = new AdminService();
    }
    return AdminService.instance;
  }

  /**
   * Get hierarchy of zones, communities, and their members.
   */
  async getHierarchy(): Promise<any[]> {
    const response = await api.get("/admin/hierarchy");
    return response.data;
  }

  /**
   * Get all zones.
   */
  async getRegions(): Promise<Zone[]> {
    const response = await api.get("/admin/zones");
    return response.data;
  }

  async getRegion(id: string): Promise<Zone> {
    const response = await api.get(`/admin/zones/${id}`);
    return response.data;
  }

  /**
   * Get statistics for all regions.
   */
  async getRegionStats(): Promise<any[]> {
    const response = await api.get("/stats/zones");
    return response.data;
  }

  /**
   * Get all communities.
   */
  async getCommunities(zoneId?: string): Promise<Community[]> {
    const response = await api.get("/admin/communities", {
      params: { zone_id: zoneId },
    });
    return response.data;
  }

  /**
   * Create a new zone.
   */
  async createRegion(zone: Partial<Zone>): Promise<Zone> {
    const response = await api.post("/admin/zones", zone);
    return response.data;
  }

  async updateRegion(id: string, zone: Partial<Zone>): Promise<any> {
    const response = await api.put(`/admin/zones/${id}`, zone);
    return response.data;
  }

  async deleteRegion(id: string): Promise<any> {
    const response = await api.delete(`/admin/zones/${id}`);
    return response.data;
  }

  /**
   * Create a new community.
   */
  async createCommunity(community: Partial<Community>): Promise<Community> {
    const response = await api.post("/admin/communities", community);
    return response.data;
  }

  async updateCommunity(
    id: string,
    community: Partial<Community>,
  ): Promise<any> {
    const response = await api.put(`/admin/communities/${id}`, community);
    return response.data;
  }

  async deleteCommunity(id: string): Promise<any> {
    const response = await api.delete(`/admin/communities/${id}`);
    return response.data;
  }

  /**
   * Create a new node.
   */
  async createNode(node: any): Promise<any> {
    const response = await api.post("/admin/nodes", node);
    return response.data;
  }

  async updateNode(id: string, node: any): Promise<any> {
    const response = await api.put(`/admin/nodes/${id}`, node);
    return response.data;
  }

  async deleteNode(id: string): Promise<any> {
    const response = await api.delete(`/admin/nodes/${id}`);
    return response.data;
  }

  async getNodes(): Promise<any[]> {
    const response = await api.get("/admin/nodes");
    return response.data;
  }

  /**
   * Get dashboard summary metrics.
   */
  async getDashboardSummary(): Promise<AdminStats> {
    const response = await api.get("/stats/dashboard/summary");
    return response.data;
  }

  async getStats(): Promise<AdminStats> {
    return this.getDashboardSummary();
  }

  /**
   * Alert Management
   */
  async getAlertRules(): Promise<AlertRule[]> {
    const response = await api.get("/admin/alerts/rules");
    return response.data;
  }

  async getActiveAlerts(): Promise<AlertHistory[]> {
    const response = await api.get("/admin/alerts/active");
    return response.data;
  }

  async createAlertRule(rule: Omit<AlertRule, "id">): Promise<AlertRule> {
    const response = await api.post("/admin/alerts/rules", rule);
    return response.data;
  }

  async deleteAlertRule(id: string): Promise<any> {
    const response = await api.delete(`/admin/alerts/rules/${id}`);
    return response.data;
  }

  /**
   * Get customers.
   */
  async getCustomers(communityId?: string, zoneId?: string): Promise<Customer[]> {
    const params: any = {};
    if (communityId && communityId.trim() !== '') params.community_id = communityId;
    if (zoneId && zoneId.trim() !== '') params.zone_id = zoneId;

    const response = await api.get("/admin/customers", { params });
    return response.data;
  }

  async getCustomer(id: string): Promise<Customer> {
    const response = await api.get(`/admin/customers/${id}`);
    return response.data;
  }

  /**
   * Create a new customer.
   */
  async createCustomer(customerData: any): Promise<Customer> {
    const response = await api.post("/admin/customers", customerData);
    return response.data;
  }

  /**
   * Update Profile/User Role
   */
  async updateProfileRole(id: string, role: string): Promise<any> {
    const response = await api.patch(`/admin/profiles/${id}/role`, { role });
    return response.data;
  }

  async updateCustomer(id: string, customerData: any): Promise<any> {
    const response = await api.put(`/admin/customers/${id}`, customerData);
    return response.data;
  }

  async deleteCustomer(id: string): Promise<any> {
    const response = await api.delete(`/admin/customers/${id}`);
    return response.data;
  }

  async getCommunity(id: string): Promise<Community> {
    const response = await api.get(`/admin/communities/${id}`);
    return response.data;
  }

  /**
   * Get clients of a community OR zone.
   */
  async getClients(communityId?: string, zoneId?: string): Promise<Customer[]> {
    const params: any = {};
    if (communityId && communityId.trim() !== '') params.community_id = communityId;
    if (zoneId && zoneId.trim() !== '') params.zone_id = zoneId;

    const response = await api.get("/admin/customers", { params });
    return response.data;
  }

  /**
   * Get recent audit logs. (Backend placeholder for now)
   */
  async getAuditLogs(): Promise<any[]> {
    const response = await api.get("/admin/audit-logs");
    return response.data;
  }

  /**
   * Toggle visibility of a device for the customer.
   */
  async updateDeviceVisibility(id: string, isVisible: boolean): Promise<any> {
    const response = await api.patch(`/admin/devices/${id}/visibility`, {
      isVisibleToCustomer: isVisible
    });
    return response.data;
  }

  /**
   * Update granular parameter visibility for a device.
   */
  async updateDeviceParameters(id: string, config: Record<string, boolean>): Promise<any> {
    const response = await api.patch(`/admin/devices/${id}/parameters`, {
      customer_config: config
    });
    return response.data;
  }

  /**
   * System Configuration
   */
  async getSystemConfig(): Promise<any> {
    const response = await api.get("/admin/config/system");
    return response.data;
  }

  async updateSystemConfig(config: any): Promise<any> {
    const response = await api.put("/admin/config/system", config);
    return response.data;
  }
}


export const adminService = AdminService.getInstance();
