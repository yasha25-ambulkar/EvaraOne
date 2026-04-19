
// Enhanced Device type with computed properties
export interface Device {
  id: string;
  node_key: string;
  label: string;
  asset_type: string;
  status: 'Online' | 'Offline';
  latitude?: number;
  longitude?: number;
  is_active: boolean;
  community_id?: string;
  analytics_template?: 'EvaraTank' | 'EvaraFlow' | 'EvaraDeep' | 'EvaraTDS';
  last_seen?: string | null;
  telemetry_snapshot?: TelemetrySnapshot | null;
  created_at?: string;
  updated_at?: string;

  displayName?: string;
  category?: 'tank' | 'flow' | 'deep' | 'tds' | 'unknown';
  thingspeakChannelId?: string;
  thingspeakReadKey?: string;
  channelId?: string | number;
  readApiKey?: string;
  height?: number;
  tankHeight?: number;
  pump_depth?: number;
}

export interface DeviceCreate {
  node_key: string;
  label: string;
  analytics_template: 'EvaraTank' | 'EvaraFlow' | 'EvaraDeep' | 'EvaraTDS';
  asset_type?: string;
  latitude?: number;
  longitude?: number;
  community_id?: string;
  client_id?: string;
  thingspeak_channel_id?: string;
  thingspeak_read_key?: string;
  thingspeak_write_key?: string;
}

export interface DeviceUpdate extends Partial<DeviceCreate> {
  id: string;
}

// Enhanced Customer type
export interface Customer {
  id: string;
  email: string;
  display_name: string;
  full_name?: string;
  phone_number?: string;
  role: 'customer' | 'admin' | 'superadmin' | 'distributor' | 'operator' | 'viewer';
  community_id?: string;
  zone_id?: string;
  regionFilter?: string;
  created_at?: string;
  updated_at?: string;

  // Computed properties
  deviceCount?: number;
  communityName?: string;
  zoneName?: string;
  isActive?: boolean;
}

export interface CustomerCreate {
  email: string;
  display_name: string;
  password?: string;
  full_name?: string;
  phone_number?: string;
  role?: 'customer' | 'admin' | 'superadmin';
  community_id?: string;
  zone_id?: string;
  regionFilter?: string;
}

export interface CustomerUpdate extends Partial<CustomerCreate> {
  id: string;
}

// Hierarchy types
export interface Zone {
  id: string;
  zoneName: string;
  zone_code?: string;
  description?: string;
  state: string;
  country: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;

  // Optional counts for UI
  community_count?: number;
  customer_count?: number;
  device_count?: number;
}

export interface Community {
  id: string;
  name: string;
  zone_id: string;
  is_active: boolean;
  address?: string;
  pincode?: string;
  created_at?: string;
  updated_at?: string;

  // Optional for UI
  zone_name?: string;
  customer_count?: number;
  device_count?: number;
  node_count?: number;
}

// Telemetry types
export interface TelemetrySnapshot {
  id: string;
  device_id: string;
  last_timestamp: string | null;
  level_percentage: number | null;
  depth_value: number | null;
  flow_rate: number | null;
  total_liters: number | null;
  temperature_value: number | null;

  // Normalized Fields
  temperature?: number | null;
  humidity?: number | null;
  battery_level?: number | null;
  signal_strength?: number | null;

  created_at: string;
  updated_at: string;
}

export interface TelemetryHistory {
  id: string;
  device_id: string;
  timestamp: string;
  field1?: number;
  field2?: number;
  field3?: number;
  field4?: number;

  // Normalized Fields
  temperature?: number | null;
  humidity?: number | null;
  battery_level?: number | null;
  signal_strength?: number | null;

  entry_id: number;
  created_at: string;
}

// API Response types
export interface ApiResponse<T = any> {
  status: 'success' | 'error';
  data: T;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
  hint?: string;
}

// Mutation result types
export interface MutationResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
}

// Analytics types
export interface AnalyticsData {
  device: Device | null;
  telemetry: TelemetrySnapshot | null;
  history: TelemetryHistory[];
  isLoading: boolean;
  error: string | null;
}

export interface TelemetryHistory {
  timestamp: string;
  values: Record<string, number>;
  entry_id: number;
}

// Form types
export interface DeviceFormData {
  node_key: string;
  label: string;
  analytics_template: 'EvaraTank' | 'EvaraFlow' | 'EvaraDeep' | 'EvaraTDS';
  asset_type?: string;
  latitude?: string;
  longitude?: string;
  community_id?: string;
  client_id?: string;
}

export interface CustomerFormData {
  email: string;
  display_name: string;
  full_name?: string;
  phone_number?: string;
  community_id?: string;
  notes?: string;
}

// Query options types
export interface QueryOptions {
  staleTime?: number;
  cacheTime?: number;
  retry?: number;
  refetchOnWindowFocus?: boolean;
  enabled?: boolean;
}

// Error boundary types
export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: {
    componentStack: string | null;
    error: Error | null;
    boundary: string | null;
  } | null;
}

// Component prop types
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export interface LoadingProps extends BaseComponentProps {
  isLoading: boolean;
  fallback?: React.ReactNode;
}

export interface ErrorProps extends BaseComponentProps {
  error: Error | string | null;
  onRetry?: () => void;
}

// Utility types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredBy<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Type guards
export const isDevice = (value: any): value is Device => {
  return value && typeof value === 'object' && 'id' in value && 'node_key' in value;
};

export const isCustomer = (value: any): value is Customer => {
  return value && typeof value === 'object' && 'id' in value && 'email' in value;
};

export const isTelemetrySnapshot = (value: any): value is TelemetrySnapshot => {
  return value && typeof value === 'object' && 'device_id' in value && 'last_timestamp' in value;
};
