import {describe, expect, it} from 'vitest';
import {
  buildConsoleUrl,
  consolePathFor,
  hostKindOf,
  hostLabel,
  parsePairingUrl,
  sourceShortLabel,
} from '../src/pairing-url';

const SAMPLE_QR =
  'https://zcode.z.ai/remote/v4?sid=dev-sid-123&hash=aGVsbG8lM0Q%3D&t=1727827200000&mid=machine-1&name=My%20PC&app_version=3.14.4';

/** Relay v2 desktop QR: no hash, no t — account login happens on the page. */
const SAMPLE_QR_V2 =
  'https://zcode.z.ai/remote/v4?sid=dev-sid-456&mid=machine-2&name=Desk&app_version=3.15.1';

const SAMPLE_KIMI =
  'https://code-rc.kimi.com/devices/888b349b-d6c4-4d41-8278-4cdf8fee9cf8/?rc=1&from=kimi_code_desktop';

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

  it('parses a relay-v2 QR URL (no hash, no t)', () => {
    const r = parsePairingUrl(SAMPLE_QR_V2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.credentials.sid).toBe('dev-sid-456');
    expect(r.credentials.hash).toBe('');
    expect(r.credentials.origin).toBe('https://zcode.z.ai');
    expect(r.credentials.mid).toBe('machine-2');
    expect(r.credentials.deviceName).toBe('Desk');
    expect(r.credentials.appVersion).toBe('3.15.1');
    expect(r.credentials.issuedAt).toBeNull();
  });

  it('tolerates non-numeric t (treated as null, not an error)', () => {
    const r = parsePairingUrl('https://zcode.z.ai/remote/v4?sid=a&hash=b&t=abc');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.credentials.issuedAt).toBeNull();
  });

  it('parses a Kimi Code desktop link with mode flags', () => {
    const r = parsePairingUrl(SAMPLE_KIMI);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.credentials.kind).toBe('kimi');
    expect(r.credentials.sid).toBe('888b349b-d6c4-4d41-8278-4cdf8fee9cf8');
    expect(r.credentials.hash).toBe('');
    expect(r.credentials.origin).toBe('https://code-rc.kimi.com');
    expect(r.credentials.source).toBe('kimi_code_desktop');
    expect(r.credentials.extraQuery).toBe('rc=1&from=kimi_code_desktop');
  });

  it('accepts the global Kimi relay host without query params', () => {
    const r = parsePairingUrl('https://code-rc.kimi.ai/devices/abc123');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.credentials.origin).toBe('https://code-rc.kimi.ai');
    expect(r.credentials.sid).toBe('abc123');
    expect(r.credentials.source).toBeNull();
    expect(r.credentials.extraQuery).toBeNull();
  });

  it('matches Kimi relay hosts case-insensitively', () => {
    expect(parsePairingUrl('https://CODE-RC.KIMI.COM/devices/abc123').ok).toBe(true);
  });

  it('rejects a Kimi relay host with a malformed device path', () => {
    expect(parsePairingUrl('https://code-rc.kimi.com/devices/')).toEqual({
      ok: false,
      reason: 'invalid-device-path',
    });
    expect(parsePairingUrl('https://code-rc.kimi.com/other/path')).toEqual({
      ok: false,
      reason: 'invalid-device-path',
    });
  });

  it('rejects http Kimi links (login page must be reached over https)', () => {
    expect(parsePairingUrl('http://code-rc.kimi.com/devices/abc123')).toEqual({
      ok: false,
      reason: 'not-https',
    });
  });

  it('rejects unsupported schemes', () => {
    expect(parsePairingUrl('ftp://example.com/')).toEqual({
      ok: false,
      reason: 'not-https',
    });
  });
});

describe('parsePairingUrl · DSH', () => {
  it('parses a bare LAN origin (mobile-remote plugin QR shape)', () => {
    const r = parsePairingUrl('http://192.168.1.5:3080');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.credentials.kind).toBe('dsh');
    expect(r.credentials.sid).toBe('192.168.1.5:3080');
    expect(r.credentials.origin).toBe('http://192.168.1.5:3080');
    expect(r.credentials.hash).toBe('');
    expect(r.credentials.extraQuery).toBeNull();
  });

  it('parses a bare https tunnel origin, preserving the query', () => {
    const r = parsePairingUrl('https://dsh.example.top/?src=qr');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.credentials.kind).toBe('dsh');
    expect(r.credentials.origin).toBe('https://dsh.example.top');
    expect(r.credentials.extraQuery).toBe('src=qr');
  });

  it('treats an explicit trailing slash root as the same machine', () => {
    const a = parsePairingUrl('http://10.66.66.1:3080');
    const b = parsePairingUrl('http://10.66.66.1:3080/');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.credentials.sid).toBe(b.credentials.sid);
    expect(a.credentials.origin).toBe(b.credentials.origin);
  });

  it('rejects http URLs with a path (not a DSH address; cleartext risk)', () => {
    expect(parsePairingUrl('http://example.com/some/path')).toEqual({
      ok: false,
      reason: 'not-https',
    });
  });

  it('rejects a bare known ZCode origin as a truncated ZCode link', () => {
    expect(parsePairingUrl('https://zcode.z.ai/')).toEqual({
      ok: false,
      reason: 'missing-sid',
    });
    expect(parsePairingUrl('https://zcode.chatglm.site')).toEqual({
      ok: false,
      reason: 'missing-sid',
    });
    expect(parsePairingUrl('http://zcode.z.ai')).toEqual({
      ok: false,
      reason: 'missing-sid',
    });
  });
});

describe('hostLabel / hostKindOf', () => {
  it('labels zcode (including legacy records without kind)', () => {
    const r = parsePairingUrl(SAMPLE_QR);
    if (!r.ok) throw new Error('fixture must parse');
    expect(hostLabel(r.credentials)).toBe('ZCode');
    expect(hostKindOf(r.credentials)).toBe('zcode');
    expect(hostLabel({sid: 'a', hash: 'b', origin: 'https://x', mid: null, deviceName: null, appVersion: null, issuedAt: null})).toBe('ZCode');
    expect(hostKindOf({sid: 'a', hash: 'b', origin: 'https://x', mid: null, deviceName: null, appVersion: null, issuedAt: null})).toBe('zcode');
  });

  it('labels kimi by QR source, with generic fallback', () => {
    const desktop = parsePairingUrl(SAMPLE_KIMI);
    if (!desktop.ok) throw new Error('fixture must parse');
    expect(hostLabel(desktop.credentials)).toBe('Kimi Code Desktop');

    const cli = parsePairingUrl('https://code-rc.kimi.com/devices/abc123?from=kimi_code_cli');
    if (!cli.ok) throw new Error('fixture must parse');
    expect(hostLabel(cli.credentials)).toBe('Kimi Code CLI');

    const unknown = parsePairingUrl('https://code-rc.kimi.ai/devices/abc123?from=whatever');
    if (!unknown.ok) throw new Error('fixture must parse');
    expect(hostLabel(unknown.credentials)).toBe('Kimi Code');

    const noSource = parsePairingUrl('https://code-rc.kimi.ai/devices/abc123');
    if (!noSource.ok) throw new Error('fixture must parse');
    expect(hostLabel(noSource.credentials)).toBe('Kimi Code');
    expect(hostKindOf(noSource.credentials)).toBe('kimi');
  });

  it('labels dsh', () => {
    const dsh = parsePairingUrl('http://192.168.1.5:3080');
    if (!dsh.ok) throw new Error('fixture must parse');
    expect(hostLabel(dsh.credentials)).toBe('DSH');
    expect(hostKindOf(dsh.credentials)).toBe('dsh');
    expect(sourceShortLabel(dsh.credentials)).toBe('');
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

  it('rebuilds a legacy console URL with hash and a refreshed numeric t', () => {
    const url = buildConsoleUrl(creds.credentials, {now: 123456});
    expect(url.startsWith('https://zcode.z.ai/remote/v4?')).toBe(true);
    expect(url).toContain('sid=dev-sid-123');
    expect(url).toContain('hash=aGVsbG8lM0Q%3D');
    // The v1 page in production validates sid + hash + numeric t together.
    expect(url).toContain('t=123456');
  });

  it('rebuilds a relay-v2 console URL with only sid/mid/name/app_version', () => {
    const v2 = parsePairingUrl(SAMPLE_QR_V2);
    if (!v2.ok) throw new Error('fixture must parse');
    const url = buildConsoleUrl(v2.credentials);
    expect(url.startsWith('https://zcode.z.ai/remote/v4?')).toBe(true);
    expect(url).toContain('sid=dev-sid-456');
    expect(url).toContain('mid=machine-2');
    expect(url).toContain('name=Desk');
    expect(url).toContain('app_version=3.15.1');
    // The v2 page rejects any URL carrying hash or t — neither may appear,
    // not even as an empty param.
    expect(url).not.toContain('hash');
    expect(url).not.toContain('t=');
  });

  it('uses v3 path for old desktop versions', () => {
    const old = parsePairingUrl(
      'https://zcode.z.ai/remote/v3?sid=a&hash=b&app_version=3.3.9',
    );
    if (!old.ok) throw new Error('fixture must parse');
    expect(buildConsoleUrl(old.credentials)).toContain('/remote/v3?');
  });

  it('round-trips through parsePairingUrl', () => {
    const url = buildConsoleUrl(creds.credentials, {now: 999});
    const again = parsePairingUrl(url);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.credentials.sid).toBe(creds.credentials.sid);
    expect(again.credentials.hash).toBe(creds.credentials.hash);
    // Legacy links keep carrying a refreshed t, so issuedAt survives.
    expect(again.credentials.issuedAt).toBe(999);
  });

  it('rebuilds a Kimi console URL verbatim, preserving QR query flags', () => {
    const kimi = parsePairingUrl(SAMPLE_KIMI);
    if (!kimi.ok) throw new Error('fixture must parse');
    expect(buildConsoleUrl(kimi.credentials)).toBe(SAMPLE_KIMI);

    const again = parsePairingUrl(buildConsoleUrl(kimi.credentials));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.credentials.sid).toBe(kimi.credentials.sid);
    expect(again.credentials.source).toBe('kimi_code_desktop');
  });

  it('rebuilds a Kimi console URL without query when the QR had none', () => {
    const kimi = parsePairingUrl('https://code-rc.kimi.ai/devices/abc123');
    if (!kimi.ok) throw new Error('fixture must parse');
    expect(buildConsoleUrl(kimi.credentials)).toBe('https://code-rc.kimi.ai/devices/abc123/');
  });

  it('rebuilds a DSH console URL at the origin root and round-trips', () => {
    const dsh = parsePairingUrl('http://192.168.1.5:3080');
    if (!dsh.ok) throw new Error('fixture must parse');
    expect(buildConsoleUrl(dsh.credentials)).toBe('http://192.168.1.5:3080/');

    const again = parsePairingUrl(buildConsoleUrl(dsh.credentials));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.credentials.kind).toBe('dsh');
    expect(again.credentials.sid).toBe(dsh.credentials.sid);

    const tunnel = parsePairingUrl('https://dsh.example.top/?src=qr');
    if (!tunnel.ok) throw new Error('fixture must parse');
    expect(buildConsoleUrl(tunnel.credentials)).toBe('https://dsh.example.top/?src=qr');
  });
});

describe('sourceShortLabel', () => {
  it('maps Kimi QR source to compact labels, empty otherwise', () => {
    const desktop = parsePairingUrl(SAMPLE_KIMI);
    if (!desktop.ok) throw new Error('fixture must parse');
    expect(sourceShortLabel(desktop.credentials)).toBe('Desktop');

    const cli = parsePairingUrl('https://code-rc.kimi.com/devices/abc123?from=kimi_code_cli');
    if (!cli.ok) throw new Error('fixture must parse');
    expect(sourceShortLabel(cli.credentials)).toBe('CLI');

    const unknown = parsePairingUrl('https://code-rc.kimi.ai/devices/abc123?from=whatever');
    if (!unknown.ok) throw new Error('fixture must parse');
    expect(sourceShortLabel(unknown.credentials)).toBe('');

    const zcode = parsePairingUrl(SAMPLE_QR);
    if (!zcode.ok) throw new Error('fixture must parse');
    expect(sourceShortLabel(zcode.credentials)).toBe('');
  });
});
