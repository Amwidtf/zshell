import {describe, expect, it} from 'vitest';
import {compareVersions, isNewer, parseLatestRelease} from '../src/update';

describe('compareVersions', () => {
  it.each([
    ['0.0.1-alpha.3', '0.0.1-alpha.2', 1],
    ['0.0.1-alpha.10', '0.0.1-alpha.9', 1],
    ['0.0.1', '0.0.1-alpha.9', 1],
    ['0.0.1-alpha.3', '0.0.1', -1],
    ['0.1.0', '0.0.9', 1],
    ['1.2.3', '1.2.3', 0],
    ['v0.2.0', '0.1.9', 1],
    ['0.0.1-beta.1', '0.0.1-alpha.5', 1],
    ['0.0.1-rc.1', '0.0.1-beta.1', 1],
    ['0.0.1', '0.0.1', 0],
  ])('%s vs %s -> %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});

describe('parseLatestRelease', () => {
  const sample = {
    tag_name: 'v0.0.1-alpha.4',
    body: '### 修复\n- 图案设置',
    published_at: '2026-10-09T10:00:00Z',
    assets: [
      {name: 'release_notes.md', browser_download_url: 'https://x/n.md', size: 100},
      {name: 'app-release.apk', browser_download_url: 'https://x/a.apk', size: 74000000},
    ],
  };

  it('picks the APK asset and strips the v prefix', () => {
    const r = parseLatestRelease(sample)!;
    expect(r.version).toBe('0.0.1-alpha.4');
    expect(r.apkUrl).toBe('https://x/a.apk');
    expect(r.apkSize).toBe(74000000);
    expect(r.notes).toContain('图案设置');
  });

  it('isNewer compares against current version', () => {
    const r = parseLatestRelease(sample)!;
    expect(isNewer('0.0.1-alpha.3', r)).toBe(true);
    expect(isNewer('0.0.1-alpha.4', r)).toBe(false);
    expect(isNewer('0.0.1', r)).toBe(false);
  });

  it('rejects unusable payloads', () => {
    expect(parseLatestRelease(null)).toBeNull();
    expect(parseLatestRelease({})).toBeNull();
    expect(parseLatestRelease({tag_name: 'v1.0.0', assets: []})).toBeNull();
    expect(
      parseLatestRelease({tag_name: 'v1.0.0', assets: [{name: 'x.txt'}]}),
    ).toBeNull();
  });
});
