import {describe, expect, it} from 'vitest';
import {buildConsoleUrl, consolePathFor, parsePairingUrl} from '../src/pairing-url';

const SAMPLE_QR =
  'https://zcode.z.ai/remote/v4?sid=dev-sid-123&hash=aGVsbG8lM0Q%3D&t=1727827200000&mid=machine-1&name=My%20PC&app_version=3.14.4';

describe('parsePairingUrl', () => {
  it('parses a realistic desktop QR URL', () => {
    const r = parsePairingUrl(SAMPLE_QR);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.credentials.sid).toBe('dev-sid-123');
    expect(r.credentials.hash).toBe('aGVsbG8lM0Q=');
    expect(r.credentials.origin).toBe('https://zcode.z.ai');
    expect(r.credentials.mid).toBe('machine-1');
    expect(r.credentials.deviceName).toBe('My PC');
    expect(r.credentials.appVersion).toBe('3.14.4');
    expect(r.credentials.issuedAt).toBe(1727827200000);
  });

  it('accepts the china mirror origin', () => {
    const r = parsePairingUrl('https://zcode.chatglm.site/remote/v4?sid=a&hash=b');
    expect(r.ok).toBe(true);
  });

  it('rejects empty input', () => {
    expect(parsePairingUrl('')).toEqual({ok: false, reason: 'empty'});
    expect(parsePairingUrl('   ')).toEqual({ok: false, reason: 'empty'});
  });

  it('rejects non-URL garbage', () => {
    expect(parsePairingUrl('not a url')).toEqual({ok: false, reason: 'invalid-url'});
  });

  it('rejects http (credentials must not travel in cleartext)', () => {
    const r = parsePairingUrl('http://zcode.z.ai/remote/v4?sid=a&hash=b');
    expect(r).toEqual({ok: false, reason: 'not-https'});
  });

  it('rejects missing sid', () => {
    const r = parsePairingUrl('https://zcode.z.ai/remote/v4?hash=b');
    expect(r).toEqual({ok: false, reason: 'missing-sid'});
  });

  it('rejects missing hash', () => {
    const r = parsePairingUrl('https://zcode.z.ai/remote/v4?sid=a');
    expect(r).toEqual({ok: false, reason: 'missing-hash'});
  });

  it('tolerates non-numeric t (treated as null, not an error)', () => {
    const r = parsePairingUrl('https://zcode.z.ai/remote/v4?sid=a&hash=b&t=abc');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.credentials.issuedAt).toBeNull();
  });
});

describe('consolePathFor', () => {
  it.each([
    ['3.14.4', 'v4'],
    ['3.4.0', 'v4'],
    ['4.0.0', 'v4'],
    ['3.3.9', 'v3'],
    ['2.9.1', 'v3'],
    [null, 'v4'],
    ['garbage', 'v4'],
  ])('appVersion %s -> %s', (version, expected) => {
    expect(consolePathFor(version)).toBe(expected);
  });
});

describe('buildConsoleUrl', () => {
  const creds = parsePairingUrl(SAMPLE_QR);
  if (!creds.ok) throw new Error('fixture must parse');

  it('rebuilds a console URL with fresh t', () => {
    const url = buildConsoleUrl(creds.credentials, {now: 123456});
    expect(url.startsWith('https://zcode.z.ai/remote/v4?')).toBe(true);
    expect(url).toContain('sid=dev-sid-123');
    expect(url).toContain('t=123456');
  });

  it('uses v3 path for old desktop versions', () => {
    const old = parsePairingUrl(
      'https://zcode.z.ai/remote/v3?sid=a&hash=b&app_version=3.3.9',
    );
    if (!old.ok) throw new Error('fixture must parse');
    expect(buildConsoleUrl(old.credentials, {now: 1})).toContain('/remote/v3?');
  });

  it('round-trips through parsePairingUrl', () => {
    const url = buildConsoleUrl(creds.credentials, {now: 999});
    const again = parsePairingUrl(url);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.credentials.sid).toBe(creds.credentials.sid);
    expect(again.credentials.hash).toBe(creds.credentials.hash);
    expect(again.credentials.issuedAt).toBe(999);
  });
});
