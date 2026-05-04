/**
 * fieldMappingService.test.js
 * Unit tests for field mapping and resolution functions
 */

const fieldMapping = require('../../services/fieldMappingService');

describe('fieldMappingService', () => {
  describe('getFieldByAliases()', () => {
    test('should find field by exact alias', () => {
      const data = { water_level: 45.2 };
      expect(fieldMapping.getFieldByAliases(data, 'water_level')).toBe(45.2);
    });

    test('should find field by alternate alias (capitalized)', () => {
      const data = { Level: 45.2 };
      expect(fieldMapping.getFieldByAliases(data, 'water_level')).toBe(45.2);
    });

    test('should find field by alternate alias (level_percentage)', () => {
      const data = { level_percentage: 45.2 };
      expect(fieldMapping.getFieldByAliases(data, 'water_level')).toBe(45.2);
    });

    test('should return undefined if field not found', () => {
      const data = { some_other_field: 45.2 };
      expect(fieldMapping.getFieldByAliases(data, 'water_level')).toBeUndefined();
    });

    test('should handle temperature aliases', () => {
      const data = { Temp: 28.5 };
      expect(fieldMapping.getFieldByAliases(data, 'temperature')).toBe(28.5);
    });

    test('should handle multiple fields and find correct one', () => {
      const data = {
        level_percentage: 45,
        temperature: 28,
        some_field: 100
      };
      expect(fieldMapping.getFieldByAliases(data, 'water_level')).toBe(45);
      expect(fieldMapping.getFieldByAliases(data, 'temperature')).toBe(28);
    });
  });

  describe('mapThingspeakFields()', () => {
    test('should map EvaraTank ThingSpeak fields correctly', () => {
      const raw = { field1: 45.2, field2: 28.5, field3: 7.2, field4: 1200 };
      const device = { asset_type: 'EvaraTank' };
      const mapped = fieldMapping.mapThingspeakFields(raw, device);

      expect(mapped.water_level).toBe(45.2);
      expect(mapped.temperature).toBe(28.5);
      expect(mapped.ph).toBe(7.2);
      expect(mapped.tds).toBe(1200);
    });

    test('should map EvaraFlow ThingSpeak fields correctly', () => {
      const raw = { field1: 120.5, field2: 25.0 };
      const device = { asset_type: 'EvaraFlow' };
      const mapped = fieldMapping.mapThingspeakFields(raw, device);

      expect(mapped.flow_rate).toBe(120.5);
      expect(mapped.temperature).toBe(25.0);
    });

    test('should handle missing fields gracefully', () => {
      const raw = { field1: 45.2 }; // field2 missing
      const device = { asset_type: 'EvaraTank' };
      const mapped = fieldMapping.mapThingspeakFields(raw, device);

      expect(mapped.water_level).toBe(45.2);
      expect(mapped.temperature).toBeUndefined();
    });

    test('should skip null/undefined values', () => {
      const raw = { field1: 45.2, field2: null, field3: undefined };
      const device = { asset_type: 'EvaraTank' };
      const mapped = fieldMapping.mapThingspeakFields(raw, device);

      expect(mapped.water_level).toBe(45.2);
      expect(mapped.temperature).toBeUndefined();
    });
  });

  describe('getExpectedFields()', () => {
    test('should return expected fields for EvaraTank', () => {
      const fields = fieldMapping.getExpectedFields('EvaraTank');
      expect(fields).toContain('water_level');
      expect(fields).toContain('temperature');
      expect(fields).toContain('ph');
      expect(fields).toContain('tds');
    });

    test('should return expected fields for EvaraFlow', () => {
      const fields = fieldMapping.getExpectedFields('EvaraFlow');
      expect(fields).toContain('flow_rate');
      expect(fields).toContain('temperature');
    });

    test('should return empty array for unknown device type', () => {
      const fields = fieldMapping.getExpectedFields('UnknownType');
      expect(Array.isArray(fields)).toBe(true);
    });
  });

  describe('hasAllExpectedFields()', () => {
    test('should return true when all fields present', () => {
      const data = {
        water_level: 45,
        temperature: 28,
        ph: 7.2,
        tds: 1200
      };
      expect(fieldMapping.hasAllExpectedFields(data, 'EvaraTank')).toBe(true);
    });

    test('should return false when field missing', () => {
      const data = {
        water_level: 45,
        temperature: 28,
        // ph missing
        tds: 1200
      };
      expect(fieldMapping.hasAllExpectedFields(data, 'EvaraTank')).toBe(false);
    });
  });

  describe('extractFields()', () => {
    test('should extract all required fields', () => {
      const data = {
        water_level: 45,
        temperature: 28,
        other_field: 100
      };
      const result = fieldMapping.extractFields(data, ['water_level', 'temperature']);

      expect(result.fields.water_level).toBe(45);
      expect(result.fields.temperature).toBe(28);
      expect(result.missing).toHaveLength(0);
      expect(result.isValid).toBe(true);
    });

    test('should track missing fields', () => {
      const data = { water_level: 45 };
      const result = fieldMapping.extractFields(data, ['water_level', 'temperature', 'ph']);

      expect(result.fields.water_level).toBe(45);
      expect(result.missing).toContain('temperature');
      expect(result.missing).toContain('ph');
      expect(result.isValid).toBe(false);
    });

    test('should return empty extracted when no fields found', () => {
      const data = {};
      const result = fieldMapping.extractFields(data, ['water_level']);

      expect(Object.keys(result.fields)).toHaveLength(0);
      expect(result.missing).toContain('water_level');
    });
  });

  describe('getFieldAliases()', () => {
    test('should return aliases for water_level', () => {
      const aliases = fieldMapping.getFieldAliases('water_level');
      expect(aliases).toContain('water_level');
      expect(aliases).toContain('Level');
      expect(aliases).toContain('level_percentage');
    });

    test('should return aliases for temperature', () => {
      const aliases = fieldMapping.getFieldAliases('temperature');
      expect(aliases).toContain('temperature');
      expect(aliases).toContain('temp');
      expect(aliases).toContain('Temperature');
    });

    test('should return field name for unknown field', () => {
      const aliases = fieldMapping.getFieldAliases('unknown_field');
      expect(aliases).toContain('unknown_field');
    });
  });

  describe('resolveFieldMapping()', () => {
    test('should resolve field via custom sensor mapping (highest priority)', () => {
      const device = {
        asset_type: 'EvaraTank',
        sensor_field_mapping: { water_level: 'custom_level_field' }
      };
      expect(fieldMapping.resolveFieldMapping(device, 'water_level')).toBe('custom_level_field');
    });

    test('should fall back to default field name if no custom mapping', () => {
      const device = { asset_type: 'EvaraTank' };
      expect(fieldMapping.resolveFieldMapping(device, 'water_level')).toBe('water_level');
    });

    test('should handle missing sensor_field_mapping gracefully', () => {
      const device = { asset_type: 'EvaraTank' };
      // Should not throw error
      expect(() => fieldMapping.resolveFieldMapping(device, 'water_level')).not.toThrow();
    });
  });
});
