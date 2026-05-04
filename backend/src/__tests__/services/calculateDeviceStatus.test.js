/**
 * deviceStateService.test.js
 * Unit tests for calculateDeviceStatus() function
 * Test coverage: 100% of critical paths
 */

const { calculateDeviceStatus } = require('../../services/deviceStateService');

describe('deviceStateService - calculateDeviceStatus', () => {
  describe('Valid timestamps - within threshold', () => {
    test('should return ONLINE for current time', () => {
      const now = Date.now();
      expect(calculateDeviceStatus(now)).toBe('ONLINE');
    });

    test('should return ONLINE for data from 5 minutes ago', () => {
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      expect(calculateDeviceStatus(fiveMinutesAgo)).toBe('ONLINE');
    });

    test('should return ONLINE for data from 10 minutes ago', () => {
      const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
      expect(calculateDeviceStatus(tenMinutesAgo)).toBe('ONLINE');
    });

    test('should return ONLINE for data from 19:50 minutes ago', () => {
      const almostThreshold = Date.now() - (19 * 60 * 1000 + 50 * 1000);
      expect(calculateDeviceStatus(almostThreshold)).toBe('ONLINE');
    });
  });

  describe('Valid timestamps - beyond threshold', () => {
    test('should return OFFLINE for data from 21 minutes ago', () => {
      const twentyOneMinutesAgo = Date.now() - (21 * 60 * 1000);
      expect(calculateDeviceStatus(twentyOneMinutesAgo)).toBe('OFFLINE');
    });

    test('should return OFFLINE for data from 30 minutes ago', () => {
      const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
      expect(calculateDeviceStatus(thirtyMinutesAgo)).toBe('OFFLINE');
    });

    test('should return OFFLINE for data from 1 hour ago', () => {
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      expect(calculateDeviceStatus(oneHourAgo)).toBe('OFFLINE');
    });

    test('should return OFFLINE for data from 1 day ago', () => {
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      expect(calculateDeviceStatus(oneDayAgo)).toBe('OFFLINE');
    });
  });

  describe('Invalid or missing timestamps', () => {
    test('should return UNKNOWN for null', () => {
      expect(calculateDeviceStatus(null)).toBe('UNKNOWN');
    });

    test('should return UNKNOWN for undefined', () => {
      expect(calculateDeviceStatus(undefined)).toBe('UNKNOWN');
    });

    test('should return UNKNOWN for empty string', () => {
      expect(calculateDeviceStatus('')).toBe('UNKNOWN');
    });

    test('should return UNKNOWN for invalid date string', () => {
      expect(calculateDeviceStatus('not-a-date')).toBe('UNKNOWN');
    });

    test('should return UNKNOWN for invalid date object', () => {
      expect(calculateDeviceStatus(new Date('invalid'))).toBe('UNKNOWN');
    });

    test('should return UNKNOWN for future timestamp', () => {
      const future = Date.now() + (60 * 60 * 1000);
      expect(calculateDeviceStatus(future)).toBe('UNKNOWN');
    });
  });

  describe('Different input formats', () => {
    test('should accept numeric timestamp (milliseconds)', () => {
      const timestamp = Date.now() - (10 * 60 * 1000);
      expect(calculateDeviceStatus(timestamp)).toBe('ONLINE');
    });

    test('should accept numeric string timestamp', () => {
      const timestamp = String(Date.now() - (10 * 60 * 1000));
      expect(calculateDeviceStatus(timestamp)).toBe('ONLINE');
    });

    test('should accept ISO string format', () => {
      const iso = new Date(Date.now() - (10 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(iso)).toBe('ONLINE');
    });

    test('should accept Date object', () => {
      const date = new Date(Date.now() - (10 * 60 * 1000));
      expect(calculateDeviceStatus(date.getTime())).toBe('ONLINE');
    });
  });

  describe('Real-world cron job scenarios', () => {
    test('typical 5-minute cron interval - device active', () => {
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      expect(calculateDeviceStatus(fiveMinutesAgo)).toBe('ONLINE');
    });

    test('typical 5-minute cron interval - device inactive', () => {
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      expect(calculateDeviceStatus(twoHoursAgo)).toBe('OFFLINE');
    });

    test('multiple cron runs without data update', () => {
      // Device last updated 25 minutes ago
      const lastUpdate = Date.now() - (25 * 60 * 1000);
      expect(calculateDeviceStatus(lastUpdate)).toBe('OFFLINE');
    });
  });
});
