import {PairingCredentials} from './types';

/**
 * QR / pairing URL format emitted by the official desktop client:
 *   https://<origin>/remote/v4?sid=<deviceSid>&hash=<passHash>&t=<ms>&mid=<mid>&name=<name>&app_version=<ver>
 * Described here for interoperability with the user's own paired desktop.
 */
export type ParseFailureReason =
  | 'empty'
  | 'invalid-url'
  | 'not-https'
  | 'missing-sid'
  | 'missing-hash';

export type ParseResult =
  | {ok: true; credentials: PairingCredentials}
  | {ok: false; reason: ParseFailureReason};

function fail(reason: ParseFailureReason): ParseResult {
  return {ok: false, reason};
}

export function parsePairingUrl(raw: string): ParseResult {
  const trimmed = raw == null ? '' : raw.trim();
  if (trimmed.length === 0) {
    return fail('empty');
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return fail('invalid-url');
  }
  if (url.protocol !== 'https:') {
    return fail('not-https');
  }
  const sid = (url.searchParams.get('sid') ?? '').trim();
  const hash = (url.searchParams.get('hash') ?? '').trim();
  if (sid.length === 0) {
    return fail('missing-sid');
  }
  if (hash.length === 0) {
    return fail('missing-hash');
  }
  const tParam = url.searchParams.get('t');
  const issuedAt = tParam != null && /^\d+$/.test(tParam) ? Number(tParam) : null;
  return {
    ok: true,
    credentials: {
      sid,
      hash,
      origin: url.origin,
      mid: url.searchParams.get('mid'),
      deviceName: url.searchParams.get('name'),
      appVersion: url.searchParams.get('app_version'),
      issuedAt,
    },
  };
}

/**
 * Desktop app_version >= 3.4.0 serves /remote/v4, older serves /remote/v3
 * (observed version boundary used by the official client).
 */
export function consolePathFor(appVersion: string | null): 'v3' | 'v4' {
  const fallback: 'v3' | 'v4' = 'v4';
  if (appVersion == null) {
    return fallback;
  }
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(appVersion.trim());
  if (m == null) {
    return fallback;
  }
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major > 3 || (major === 3 && minor >= 4)) {
    return 'v4';
  }
  return 'v3';
}

export interface ConsoleUrlOptions {
  pathVersion?: 'v3' | 'v4';
  /** Override timestamp (ms). Defaults to Date.now(); injectable for tests. */
  now?: number;
}

/**
 * Build the remote console URL from stored credentials.
 * On reconnection only sid/hash are semantically required; `t` is refreshed to
 * the current time (the page uses it for freshness checks at most optionally).
 */
export function buildConsoleUrl(c: PairingCredentials, opts: ConsoleUrlOptions = {}): string {
  const pathVersion = opts.pathVersion ?? consolePathFor(c.appVersion);
  const u = new URL(`/remote/${pathVersion}`, c.origin);
  u.searchParams.set('sid', c.sid);
  u.searchParams.set('hash', c.hash);
  u.searchParams.set('t', String(opts.now ?? Date.now()));
  if (c.mid != null) {
    u.searchParams.set('mid', c.mid);
  }
  if (c.deviceName != null) {
    u.searchParams.set('name', c.deviceName);
  }
  if (c.appVersion != null) {
    u.searchParams.set('app_version', c.appVersion);
  }
  return u.toString();
}
