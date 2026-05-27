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

    test('Should return ONLINE for data from exactly 60 minutes ago (boundary)', () => {
      const sixtyMinutesAgo = new Date(Date.now() - (60 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(sixtyMinutesAgo)).toBe('ONLINE');
    });

    test('Should return ONLINE for data from now', () => {
      const now = new Date().toISOString();
      expect(calculateDeviceStatus(now)).toBe('ONLINE');
    });
  });

  describe('Valid timestamps - beyond threshold', () => {
    test('Should return OFFLINE for data from 61 minutes ago', () => {
      const sixtyOneMinutesAgo = new Date(Date.now() - (61 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(sixtyOneMinutesAgo)).toBe('OFFLINE');
    });

    test('Should return OFFLINE for data from 75 minutes ago', () => {
      const seventyFiveMinutesAgo = new Date(Date.now() - (75 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(seventyFiveMinutesAgo)).toBe('OFFLINE');
    });

    test('Should return OFFLINE for data from 90 minutes ago', () => {
      const ninetyMinutesAgo = new Date(Date.now() - (90 * 60 * 1000)).toISOString();
      expect(calculateDeviceStatus(ninetyMinutesAgo)).toBe('OFFLINE');
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
    test('Should handle timestamp exactly at boundary (60 min)', () => {
      const exactlySixtyMin = Date.now() - (60 * 60 * 1000);
      expect(calculateDeviceStatus(exactlySixtyMin)).toBe('ONLINE');
    });

    test('Should handle timestamp just beyond boundary (60m + 1s)', () => {
      const justBeyond = Date.now() - (60 * 60 * 1000) - 1000;
      expect(calculateDeviceStatus(justBeyond)).toBe('OFFLINE');
    });

    test('Should handle very old timestamps gracefully', () => {
      const veryOld = new Date('1970-01-01').toISOString();
      expect(calculateDeviceStatus(veryOld)).toBe('OFFLINE');
    });
  });
});
