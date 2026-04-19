/**
 * Device routing utility
 * Maps devices to their correct analytics pages based on device_type or analytics_template
 */

export interface Device {
  id: string;
  hardwareId?: string;
  hardware_id?: string;
  device_type?: string;
  analytics_template?: string;
  asset_type?: string;
  assetType?: string;
}

/**
 * Get the analytics page route for a device
 * Priority: analytics_template > device_type > asset_type > default
 */
export function getDeviceAnalyticsRoute(device: Device): string {
  const hId = device.hardwareId || device.hardware_id;
  if (!hId) {
    console.warn("[deviceRouting] Missing hardwareId for device navigation:", device);
    return '/nodes';
  }

  // 1. Use analytics_template if available (most explicit)
  const template = (device.analytics_template || '').toLowerCase();
  if (template) {
    if (template.includes('tank')) return `/evaratank/${hId}`;
    if (template.includes('deep')) return `/evaradeep/${hId}`;
    if (template.includes('flow')) return `/evaraflow/${hId}`;
    if (template.includes('tds')) return `/evaratds/${hId}`;
  }

  // 2. Fall back to device_type
  const type = (device.device_type || '').toLowerCase();
  if (type) {
    if (type.includes('tank') || type.includes('sump') || type.includes('oht'))
      return `/evaratank/${hId}`;
    if (type.includes('deep') || type.includes('bore') || type.includes('well'))
      return `/evaradeep/${hId}`;
    if (type.includes('flow') || type.includes('pump') || type.includes('meter'))
      return `/evaraflow/${hId}`;
  }

  // 3. Fall back to asset_type (legacy/common field)
  const asset = (device.asset_type || device.assetType || '').toLowerCase();
  if (asset) {
    if (asset.includes('tank') || asset.includes('sump') || asset.includes('oht'))
      return `/evaratank/${hId}`;
    if (asset.includes('deep') || asset.includes('bore') || asset.includes('well') || asset.includes('govt'))
      return `/evaradeep/${hId}`;
    if (asset.includes('flow') || asset.includes('pump') || asset.includes('meter'))
      return `/evaraflow/${hId}`;
  }

  // Default fallback to node details page (uses Firestore original ID)
  return `/node/${device.id}`;
}

/**
 * Get display label for device type
 */
export function getDeviceTypeLabel(device: Device): string {
  if (device.analytics_template) {
    return device.analytics_template;
  }
  if (device.device_type) {
    return device.device_type.charAt(0).toUpperCase() + device.device_type.slice(1);
  }
  if (device.asset_type) {
    return device.asset_type.charAt(0).toUpperCase() + device.asset_type.slice(1);
  }
  return 'Device';
}
