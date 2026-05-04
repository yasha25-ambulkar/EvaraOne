/**
 * deviceConstants.test.js
 * Unit tests for device type constants and helpers
 */

const constants = require('../../constants/deviceConstants');

describe('deviceConstants', () => {
  describe('DEVICE_TYPES enum', () => {
    test('should have all 4 device types defined', () => {
      expect(constants.DEVICE_TYPES.TANK).toBe('EvaraTank');
      expect(constants.DEVICE_TYPES.FLOW).toBe('EvaraFlow');
      expect(constants.DEVICE_TYPES.DEEP).toBe('EvaraDeep');
      expect(constants.DEVICE_TYPES.TDS).toBe('EvaraTDS');
    });

    test('should have exactly 4 device types', () => {
      expect(Object.keys(constants.DEVICE_TYPES)).toHaveLength(4);
    });
  });

  describe('DEVICE_STATUS enum', () => {
    test('should have all required statuses', () => {
      expect(constants.DEVICE_STATUS.ONLINE).toBe('ONLINE');
      expect(constants.DEVICE_STATUS.OFFLINE).toBe('OFFLINE');
      expect(constants.DEVICE_STATUS.UNKNOWN).toBe('UNKNOWN');
      expect(constants.DEVICE_STATUS.DECOMMISSIONED).toBe('DECOMMISSIONED');
      expect(constants.DEVICE_STATUS.ARCHIVED).toBe('ARCHIVED');
    });
  });

  describe('ANALYTICS_TEMPLATES mapping', () => {
    test('should map all device types to templates', () => {
      expect(constants.ANALYTICS_TEMPLATES.EvaraTank).toBe('EvaraTank');
      expect(constants.ANALYTICS_TEMPLATES.EvaraFlow).toBe('EvaraFlow');
      expect(constants.ANALYTICS_TEMPLATES.EvaraDeep).toBe('EvaraDeep');
      expect(constants.ANALYTICS_TEMPLATES.EvaraTDS).toBe('EvaraTDS');
    });

    test('should have 4 templates', () => {
      expect(Object.keys(constants.ANALYTICS_TEMPLATES)).toHaveLength(4);
    });
  });

  describe('DEVICE_CONFIG', () => {
    test('should have config for all device types', () => {
      expect(constants.DEVICE_CONFIG.EvaraTank).toBeDefined();
      expect(constants.DEVICE_CONFIG.EvaraFlow).toBeDefined();
      expect(constants.DEVICE_CONFIG.EvaraDeep).toBeDefined();
      expect(constants.DEVICE_CONFIG.EvaraTDS).toBeDefined();
    });

    test('EvaraTank config should have correct settings', () => {
      const config = constants.DEVICE_CONFIG.EvaraTank;
      expect(config.pollingEnabled).toBe(true);
      expect(config.statusThresholdMs).toBe(30 * 60 * 1000);
      expect(config.defaultFields).toContain('water_level');
      expect(config.defaultFields).toContain('temperature');
    });

    test('EvaraFlow config should have correct settings', () => {
      const config = constants.DEVICE_CONFIG.EvaraFlow;
      expect(config.pollingEnabled).toBe(true);
      expect(config.defaultFields).toContain('flow_rate');
    });

    test('each config should have required fields list', () => {
      Object.values(constants.DEVICE_CONFIG).forEach(config => {
        expect(config.requiredFields).toBeDefined();
        expect(Array.isArray(config.requiredFields)).toBe(true);
      });
    });

    test('each config should have ThingSpeak field mapping', () => {
      Object.values(constants.DEVICE_CONFIG).forEach(config => {
        expect(config.thingspeakFields).toBeDefined();
        expect(typeof config.thingspeakFields).toBe('object');
      });
    });
  });

  describe('isValidDeviceType()', () => {
    test('should accept all valid device types', () => {
      expect(constants.isValidDeviceType('EvaraTank')).toBe(true);
      expect(constants.isValidDeviceType('EvaraFlow')).toBe(true);
      expect(constants.isValidDeviceType('EvaraDeep')).toBe(true);
      expect(constants.isValidDeviceType('EvaraTDS')).toBe(true);
    });

    test('should reject invalid device types', () => {
      expect(constants.isValidDeviceType('InvalidType')).toBe(false);
      expect(constants.isValidDeviceType('evaratank')).toBe(false);
      expect(constants.isValidDeviceType('')).toBe(false);
      expect(constants.isValidDeviceType(null)).toBe(false);
    });
  });

  describe('isValidStatus()', () => {
    test('should accept all valid statuses', () => {
      expect(constants.isValidStatus('ONLINE')).toBe(true);
      expect(constants.isValidStatus('OFFLINE')).toBe(true);
      expect(constants.isValidStatus('UNKNOWN')).toBe(true);
      expect(constants.isValidStatus('DECOMMISSIONED')).toBe(true);
      expect(constants.isValidStatus('ARCHIVED')).toBe(true);
    });

    test('should reject invalid statuses', () => {
      expect(constants.isValidStatus('InvalidStatus')).toBe(false);
      expect(constants.isValidStatus('online')).toBe(false);
      expect(constants.isValidStatus('')).toBe(false);
    });
  });

  describe('getAnalyticsTemplate()', () => {
    test('should return correct template for each device type', () => {
      expect(constants.getAnalyticsTemplate('EvaraTank')).toBe('EvaraTank');
      expect(constants.getAnalyticsTemplate('EvaraFlow')).toBe('EvaraFlow');
    });

    test('should throw error for invalid device type', () => {
      expect(() => constants.getAnalyticsTemplate('InvalidType')).toThrow();
    });
  });

  describe('getDeviceConfig()', () => {
    test('should return config for valid device types', () => {
      const config = constants.getDeviceConfig('EvaraTank');
      expect(config).toBeDefined();
      expect(config.pollingEnabled).toBe(true);
    });

    test('should throw error for invalid device type', () => {
      expect(() => constants.getDeviceConfig('InvalidType')).toThrow();
    });
  });

  describe('getAllDeviceTypes()', () => {
    test('should return array of all device types', () => {
      const allTypes = constants.getAllDeviceTypes();
      expect(Array.isArray(allTypes)).toBe(true);
      expect(allTypes).toHaveLength(4);
      expect(allTypes).toContain('EvaraTank');
      expect(allTypes).toContain('EvaraFlow');
      expect(allTypes).toContain('EvaraDeep');
      expect(allTypes).toContain('EvaraTDS');
    });
  });

  describe('getThingspeakFieldMapping()', () => {
    test('should return field mapping for each device type', () => {
      const mapping = constants.getThingspeakFieldMapping('EvaraTank');
      expect(mapping).toBeDefined();
      expect(mapping['1']).toBe('water_level');
      expect(mapping['2']).toBe('temperature');
    });

    test('EvaraFlow mapping should map flow_rate to field1', () => {
      const mapping = constants.getThingspeakFieldMapping('EvaraFlow');
      expect(mapping['1']).toBe('flow_rate');
    });

    test('should throw error for invalid device type', () => {
      expect(() => constants.getThingspeakFieldMapping('InvalidType')).toThrow();
    });
  });
});
