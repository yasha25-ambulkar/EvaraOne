/**
 * integration.test.js
 * Integration tests for complete workflows
 */

describe('Integration Tests - Full Workflows', () => {
  describe('Device Polling Workflow', () => {
    test('should successfully poll device and update state', async () => {
      // Mock device data
      const device = {
        id: 'device-001',
        asset_type: 'EvaraTank',
        thingspeakChannelId: 'ch-123',
        thingspeakReadKey: 'key-123'
      };

      // Expected telemetry from ThingSpeak
      const thingspeakData = {
        field1: 45.2, // water level
        field2: 28.5, // temperature
        field3: 7.2,  // pH
        field4: 1200   // TDS
      };

      // Integration: Map ThingSpeak → Internal format
      const fieldMapping = require('../../services/fieldMappingService');
      const mapped = fieldMapping.mapThingspeakFields(thingspeakData, device);

      expect(mapped.water_level).toBe(45.2);
      expect(mapped.temperature).toBe(28.5);
      expect(Object.keys(mapped)).toHaveLength(4); // All 4 fields mapped
    });
  });

  describe('Status Update Workflow', () => {
    test('should calculate status based on last update timestamp', () => {
      const calculateDeviceStatus = (lastUpdatedAt) => {
        const OFFLINE_THRESHOLD_MS = 20 * 60 * 1000;
        if (!lastUpdatedAt) return 'UNKNOWN';
        try {
          const now = Date.now();
          const lastUpdate = new Date(lastUpdatedAt).getTime();
          if (isNaN(lastUpdate)) return 'UNKNOWN';
          const inactivityMs = now - lastUpdate;
          if (inactivityMs < 0) return 'UNKNOWN';
          if (inactivityMs <= OFFLINE_THRESHOLD_MS) return 'ONLINE';
          return 'OFFLINE';
        } catch (err) {
          return 'UNKNOWN';
        }
      };

      // Scenario 1: Device just updated (5 min ago)
      const recentUpdate = Date.now() - (5 * 60 * 1000);
      expect(calculateDeviceStatus(recentUpdate)).toBe('ONLINE');

      // Scenario 2: Device inactive (30 min ago)
      const oldUpdate = Date.now() - (30 * 60 * 1000);
      expect(calculateDeviceStatus(oldUpdate)).toBe('OFFLINE');
    });
  });

  describe('Device Type Resolution Workflow', () => {
    test('should correctly identify and handle different device types', () => {
      const constants = require('../../constants/deviceConstants');

      const devices = [
        { id: 'd1', asset_type: 'EvaraTank' },
        { id: 'd2', asset_type: 'EvaraFlow' },
        { id: 'd3', asset_type: 'EvaraDeep' },
        { id: 'd4', asset_type: 'EvaraTDS' }
      ];

      devices.forEach(device => {
        // Should validate device type
        expect(constants.isValidDeviceType(device.asset_type)).toBe(true);

        // Should get config for device type
        const config = constants.getDeviceConfig(device.asset_type);
        expect(config).toBeDefined();
        expect(config.pollingEnabled).toBe(true);

        // Should get analytics template
        const template = constants.getAnalyticsTemplate(device.asset_type);
        expect(template).toBeDefined();
      });
    });
  });

  describe('Field Resolution Workflow', () => {
    test('should resolve fields with custom mapping, then aliases, then defaults', () => {
      const fieldMapping = require('../../services/fieldMappingService');

      // Case 1: Custom sensor field mapping
      const dataWithCustom = { custom_water_field: 45.2 };
      const customValue = fieldMapping.getFieldByAliases(dataWithCustom, 'water_level');
      // Note: This would use custom mapping from device config in real scenario
      expect(customValue).toBeUndefined(); // Since custom_water_field isn't an alias

      // Case 2: Using field alias
      const dataWithAlias = { Level: 45.2 };
      const aliasValue = fieldMapping.getFieldByAliases(dataWithAlias, 'water_level');
      expect(aliasValue).toBe(45.2);

      // Case 3: Using default field name
      const dataWithDefault = { water_level: 45.2 };
      const defaultValue = fieldMapping.getFieldByAliases(dataWithDefault, 'water_level');
      expect(defaultValue).toBe(45.2);
    });
  });

  describe('Data Validation Workflow', () => {
    test('should validate all required fields present for device', () => {
      const fieldMapping = require('../../services/fieldMappingService');
      const constants = require('../../constants/deviceConstants');

      // Get expected fields for EvaraTank
      const expectedFields = constants.DEVICE_CONFIG.EvaraTank.defaultFields;

      // Valid data
      const validData = {
        water_level: 45.2,
        temperature: 28.5,
        ph: 7.2,
        tds: 1200
      };

      const validResult = fieldMapping.extractFields(validData, expectedFields);
      expect(validResult.isValid).toBe(true);
      expect(validResult.missing).toHaveLength(0);

      // Invalid data (missing field)
      const invalidData = {
        water_level: 45.2,
        temperature: 28.5
        // missing ph and tds
      };

      const invalidResult = fieldMapping.extractFields(invalidData, expectedFields);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.missing.length).toBeGreaterThan(0);
    });
  });

  describe('Multiple Device Type Polling', () => {
    test('should handle all 4 device types in polling cycle', () => {
      const constants = require('../../constants/deviceConstants');
      const allTypes = constants.getAllDeviceTypes();

      expect(allTypes).toHaveLength(4);

      allTypes.forEach(deviceType => {
        // Each type should have valid config
        const config = constants.getDeviceConfig(deviceType);
        expect(config.pollingEnabled).toBe(true);
        expect(config.statusThresholdMs).toBe(60 * 60 * 1000);

        // Each type should have field mappings
        const fieldMap = constants.getThingspeakFieldMapping(deviceType);
        expect(Object.keys(fieldMap).length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle invalid device type gracefully', () => {
      const constants = require('../../constants/deviceConstants');

      expect(constants.isValidDeviceType('InvalidType')).toBe(false);
      expect(() => constants.getDeviceConfig('InvalidType')).toThrow();
    });

    test('should handle missing telemetry data', () => {
      const fieldMapping = require('../../services/fieldMappingService');

      const emptyData = {};
      const result = fieldMapping.extractFields(emptyData, ['water_level', 'temperature']);

      expect(result.isValid).toBe(false);
      expect(result.missing).toContain('water_level');
    });

    test('should handle malformed timestamps', () => {
      const calculateDeviceStatus = (lastUpdatedAt) => {
        const OFFLINE_THRESHOLD_MS = 20 * 60 * 1000;
        if (!lastUpdatedAt) return 'UNKNOWN';
        try {
          const now = Date.now();
          const lastUpdate = new Date(lastUpdatedAt).getTime();
          if (isNaN(lastUpdate)) return 'UNKNOWN';
          const inactivityMs = now - lastUpdate;
          if (inactivityMs < 0) return 'UNKNOWN';
          if (inactivityMs <= OFFLINE_THRESHOLD_MS) return 'ONLINE';
          return 'OFFLINE';
        } catch (err) {
          return 'UNKNOWN';
        }
      };

      expect(calculateDeviceStatus('invalid-date')).toBe('UNKNOWN');
      expect(calculateDeviceStatus(null)).toBe('UNKNOWN');
      expect(calculateDeviceStatus(undefined)).toBe('UNKNOWN');
    });
  });
});
