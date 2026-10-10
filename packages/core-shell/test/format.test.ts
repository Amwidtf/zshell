import {describe, expect, it} from 'vitest';
import {formatBytes, formatPercent} from '../src/format';

describe('formatBytes', () => {
  it('formats byte-level values without decimals', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('scales up through the units', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(9 * 1024 * 1024)).toBe('9 MB');
    expect(formatBytes(21.1 * 1024 * 1024)).toBe('21.1 MB');
    expect(formatBytes(1.2 * 1024 * 1024 * 1024)).toBe('1.2 GB');
  });

  it('caps at GB and keeps one decimal under 100', () => {
    expect(formatBytes(512 * 1024 ** 3)).toBe('512 GB');
    expect(formatBytes(99.9 * 1024)).toBe('99.9 KB');
    expect(formatBytes(99.99 * 1024)).toBe('100 KB');
  });

  it('returns empty string for unknown sizes', () => {
    expect(formatBytes(-1)).toBe('');
  });
});

describe('formatPercent', () => {
  it('computes floor percentage', () => {
    expect(formatPercent(0, 100)).toBe('0%');
    expect(formatPercent(55, 100)).toBe('55%');
    expect(formatPercent(33, 90)).toBe('36%');
  });

  it('caps at 100', () => {
    expect(formatPercent(110, 100)).toBe('100%');
  });

  it('returns empty string when total is unknown', () => {
    expect(formatPercent(500, 0)).toBe('');
    expect(formatPercent(500, -1)).toBe('');
  });
});
