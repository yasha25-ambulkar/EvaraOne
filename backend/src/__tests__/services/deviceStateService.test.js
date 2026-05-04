/**
 * deviceStateService.test.js
 * Unit tests for deviceStateService, specifically calculateDeviceStatus()
 */

const { calculateDeviceStatus } = require('../../services/deviceStateService');

describe('deviceStateService - calculateDeviceStatus', () => {

  describe('Valid timestamps - within threshold', () => {
    test('Should return ONLINE for data from 5 minutes ago', () => {
      const fiveMinutesAgo = new Date(Date.now() - (5 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(fiveMinutesAgo)).toBe('ONLINE');
    });

    test('Should return ONLINE for data from 10 minutes ago', () => {
      const tenMinutesAgo = new Date(Date.now() - (10 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(tenMinutesAgo)).toBe('ONLINE');
    });

    test('Should return ONLINE for data from exactly 20 minutes ago (boundary)', () => {
      const twentyMinutesAgo = new Date(Date.now() - (20 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(twentyMinutesAgo)).toBe('ONLINE');
    });

    test('Should return ONLINE for data from now', () => {
      const now = new Date().toISOString();
      expect(calculateDeviceStatus(now)).toBe('ONLINE');
    });
  });

  describe('Valid timestamps - beyond threshold', () => {
    test('Should return OFFLINE for data from 21 minutes ago', () => {
      const twentyOneMinutesAgo = new Date(Date.now() - (21 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(twentyOneMinutesAgo)).toBe('OFFLINE');
    });

    test('Should return OFFLINE for data from 25 minutes ago', () => {
      const twentyFiveMinutesAgo = new Date(Date.now() - (25 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(twentyFiveMinutesAgo)).toBe('OFFLINE');
    });

    test('Should return OFFLINE for data from 1 hour ago', () => {
      const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(oneHourAgo)).toBe('OFFLINE');
    });

    test('Should return OFFLINE for data from 1 day ago', () => {
      const oneDayAgo = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(oneDayAgo)).toBe('OFFLINE');
    });
  });

  describe('Invalid or missing timestamps', () => {
    test('Should return UNKNOWN for null', () => {
      expect(calculateDeviceStatus(null)).toBe('UNKNOWN');
    });

    test('Should return UNKNOWN for undefined', () => {
      expect(calculateDeviceStatus(undefined)).toBe('UNKNOWN');
    });

    test('Should return UNKNOWN for empty string', () => {
      expect(calculateDeviceStatus('')).toBe('UNKNOWN');
    });

    test('Should return UNKNOWN for invalid date string', () => {
      expect(calculateDeviceStatus('not-a-date')).toBe('UNKNOWN');
    });

    test('Should return UNKNOWN for invalid date object', () => {
      expect(calculateDeviceStatus(new Date('invalid'))).toBe('UNKNOWN');
    });

    test('Should return UNKNOWN for future timestamp', () => {
      const future = new Date(Date.now() + (60 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(future)).toBe('UNKNOWN');
    });
  });

  describe('Different input formats', () => {
    test('Should accept ISO string format', () => {
      const iso = new Date(Date.now() - (10 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(iso)).toBe('ONLINE');
    });

    test('Should accept Date object', () => {
      const date = new Date(Date.now() - (10 * 60 * 1000));
      expect(calculateDeviceStatus(date)).toBe('ONLINE');
    });

    test('Should accept numeric timestamp (milliseconds)', () => {
      const timestamp = Date.now() - (10 * 60 * 1000);
      expect(calculateDeviceStatus(timestamp)).toBe('ONLINE');
    });

    test('Should accept numeric string timestamp', () => {
      const timestamp = String(Date.now() - (10 * 60 * 1000));
      expect(calculateDeviceStatus(timestamp)).toBe('ONLINE');
    });
  });

  describe('Boundary conditions', () => {
    test('Should handle timestamp exactly at boundary (20 min)', () => {
      const exactlyTwentyMin = Date.now() - (20 * 60 * 1000);
      expect(calculateDeviceStatus(exactlyTwentyMin)).toBe('ONLINE');
    });

    test('Should handle timestamp just beyond boundary (20m + 1s)', () => {
      const justBeyond = Date.now() - (20 * 60 * 1000) - 1000;
      expect(calculateDeviceStatus(justBeyond)).toBe('OFFLINE');
    });

    test('Should handle very old timestamps gracefully', () => {
      const veryOld = new Date('1970-01-01').toISOString();
      expect(calculateDeviceStatus(veryOld)).toBe('OFFLINE');
    });
  });
});
