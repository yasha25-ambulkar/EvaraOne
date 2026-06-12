/**
 * Unified Field Mapping Service
 * Standardizes ThingSpeak field mapping across all device types
 */

export interface DeviceFieldMapping {
  water_level_field?: string;
  flow_rate_field?: string;
  totalizer_field?: string;
  temperature_field?: string;
  depth_field?: string;
  pressure_field?: string;
  battery_field?: string;
  signal_field?: string;
}

export interface FieldMappingResult {
  waterLevel: string;
  flowRate?: string;
  totalizer?: string;
  temperature?: string;
  depth?: string;
  pressure?: string;
  battery?: string;
  signal?: string;
}

class FieldMappingService {
  private static instance: FieldMappingService;

  private constructor() {}

  public static getInstance(): FieldMappingService {
    if (!FieldMappingService.instance) {
      FieldMappingService.instance = new FieldMappingService();
    }
    return FieldMappingService.instance;
  }

  /**
   * Get standardized field mapping for any device type
   */
  public getFieldMapping(deviceType: string, config?: any): FieldMappingResult {
    const baseMapping = this.getBaseMapping(deviceType, config);
    
    return {
      waterLevel: this.resolveField(baseMapping.water_level_field, config, 'field2'),
      flowRate: this.resolveField(baseMapping.flow_rate_field, config, 'field1'),
      totalizer: this.resolveField(baseMapping.totalizer_field, config, 'field2'),
      temperature: this.resolveField(baseMapping.temperature_field, config, 'field3'),
      depth: this.resolveField(baseMapping.depth_field, config, 'field2'),
      pressure: this.resolveField(baseMapping.pressure_field, config, 'field4'),
      battery: this.resolveField(baseMapping.battery_field, config, 'field5'),
      signal: this.resolveField(baseMapping.signal_field, config, 'field6')
    };
  }

  /**
   * Get base mapping for device type
   */
  private getBaseMapping(deviceType: string, config?: any): DeviceFieldMapping {
    const type = deviceType.toLowerCase();
    
    // Priority: Config > Type defaults > Fallback
    if (config?.configuration) {
      return {
        water_level_field: config.configuration.water_level_field || config.configuration.field_key,
        flow_rate_field: config.configuration.flow_rate_field,
        totalizer_field: config.configuration.totalizer_field,
        temperature_field: config.configuration.temperature_field,
        depth_field: config.configuration.depth_field,
        pressure_field: config.configuration.pressure_field,
        battery_field: config.configuration.battery_field,
        signal_field: config.configuration.signal_field
      };
    }

    // Device type specific defaults
    switch (type) {
      case 'evaratank':
      case 'tank':
        return {
          water_level_field: 'field2',
          temperature_field: 'field1'
        };
      
      case 'evaraflow':
      case 'flow':
        return {
          flow_rate_field: 'field1',
          totalizer_field: 'field2'
        };
      
      case 'evaradeep':
      case 'deep':
        return {
          depth_field: 'field1',
          temperature_field: 'field2'
        };
      
      default:
        return {
          water_level_field: 'field2',
          flow_rate_field: 'field1'
        };
    }
  }

  /**
   * Resolve field with fallback logic
   */
  private resolveField(
    configuredField: string | undefined,
    config: any,
    fallbackField: string
  ): string {
    if (configuredField && configuredField.trim()) {
      return configuredField.trim();
    }
    
    // Legacy field key support
    if (config?.field_key && config.field_key.trim()) {
      return config.field_key.trim();
    }
    
    return fallbackField;
  }

  /**
   * Extract value from ThingSpeak data using field mapping
   */
  public extractFieldValue(
    data: any,
    fieldName: string,
    fallbackValue?: number
  ): number | null {
    if (!data || !fieldName) return fallbackValue || null;

    // Check multiple levels of data nesting
    const value = 
      data?.[fieldName] ??
      data?.data?.[fieldName] ??
      data?.raw_data?.[fieldName] ??
      data?.values?.[fieldName];

    if (value === null || value === undefined) return fallbackValue || null;
    
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? fallbackValue || null : parsed;
  }

  /**
   * Get all numeric values from ThingSpeak data
   */
  public extractAllFields(data: any, mapping: FieldMappingResult): Record<string, number | null> {
    const result: Record<string, number | null> = {};
    
    Object.entries(mapping).forEach(([key, fieldName]) => {
      if (fieldName) {
        result[key] = this.extractFieldValue(data, fieldName);
      }
    });

    return result;
  }
}

export const fieldMappingService = FieldMappingService.getInstance();
