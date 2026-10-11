import {describe, expect, it} from 'vitest';
import {parseClock, withinQuietHours} from '../src/quiet';

describe('parseClock', () => {
  it('parses valid times', () => {
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('9:30')).toBe(570);
    expect(parseClock('23:59')).toBe(1439);
  });

  it('rejects malformed values', () => {
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('12:60')).toBeNull();
    expect(parseClock('12')).toBeNull();
    expect(parseClock('ab:cd')).toBeNull();
  });
});

describe('withinQuietHours', () => {
  it('handles same-day windows', () => {
    expect(withinQuietHours(300, 0, 480)).toBe(true); // 05:00 in 00:00–08:00
    expect(withinQuietHours(600, 0, 480)).toBe(false);
  });

  it('handles windows crossing midnight', () => {
    expect(withinQuietHours(23 * 60, 22 * 60, 8 * 60)).toBe(true); // 23:00
    expect(withinQuietHours(3 * 60, 22 * 60, 8 * 60)).toBe(true); // 03:00
    expect(withinQuietHours(12 * 60, 22 * 60, 8 * 60)).toBe(false); // noon
    expect(withinQuietHours(9 * 60, 22 * 60, 8 * 60)).toBe(false); // 09:00
  });

  it('treats equal start/end as disabled', () => {
    expect(withinQuietHours(0, 480, 480)).toBe(false);
    expect(withinQuietHours(600, 480, 480)).toBe(false);
  });
});
