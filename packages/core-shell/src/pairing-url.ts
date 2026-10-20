import {HostKind, PairingCredentials} from './types';

/**
 * QR / pairing URL formats emitted by the official desktop clients:
 * - ZCode (relay v2, desktop 3.14+):
 *   https://<origin>/remote/v4?sid=<deviceSid>&mid=<mid>&name=<name>&app_version=<ver>
 *   The link carries no secret material — the mobile page requires an
 *   account login (same account as the desktop) and rejects URLs that still
 *   contain `hash` or `t` (observed in the open-source web client).
 * - ZCode (legacy relay v1):
 *   https://<origin>/remote/v4?sid=<deviceSid>&hash=<passHash>&t=<ms>…
 *   Still parsed for older desktops; such links no longer pair against
 *   relay-v2 desktops (the official page reports an invalid connection).
 * - Kimi Code remote control:
 *   https://code-rc.kimi.com/devices/<deviceId>/?rc=1&from=kimi_code_desktop
 *     (global region serves from code-rc.kimi.ai; account login happens on
 *     the official page itself — the link carries no secret material)
 * Described here for interoperability with the user's own paired desktop.
 */
export type ParseFailureReason =
  | 'empty'
  | 'invalid-url'
  | 'not-https'
  | 'missing-sid'
  | 'invalid-device-path';

export type ParseResult =
  | {ok: true; credentials: PairingCredentials}
  | {ok: false; reason: ParseFailureReason};

/** Kimi Code remote-control relay hosts (domestic / global region). */
const KIMI_RC_HOSTS = new Set(['code-rc.kimi.com', 'code-rc.kimi.ai']);

/** Device id charset observed in Kimi Code links (UUID-style). */
const KIMI_DEVICE_PATH_RE = /^\/devices\/([A-Za-z0-9][A-Za-z0-9_-]*)\/?$/;

function fail(reason: ParseFailureReason): ParseResult {
  return {ok: false, reason};
}

function parseKimiUrl(url: URL): ParseResult {
  const m = KIMI_DEVICE_PATH_RE.exec(url.pathname);
  if (m == null) {
    return fail('invalid-device-path');
  }
  return {
    ok: true,
    credentials: {
      kind: 'kimi',
      sid: m[1],
      hash: '',
      origin: url.origin,
      mid: null,
      deviceName: null,
      appVersion: null,
      issuedAt: null,
      source: url.searchParams.get('from'),
      extraQuery: url.search.length > 1 ? url.search.slice(1) : null,
    },
  };
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
  if (KIMI_RC_HOSTS.has(url.hostname.toLowerCase())) {
    return parseKimiUrl(url);
  }
  const sid = (url.searchParams.get('sid') ?? '').trim();
  if (sid.length === 0) {
    return fail('missing-sid');
  }
  // Relay-v2 links carry no hash; legacy v1 links keep sid+hash. Accept both —
  // whether a legacy link can still pair is decided by the official page.
  const hash = (url.searchParams.get('hash') ?? '').trim();
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

const KIMI_SOURCE_LABELS: Record<string, string> = {
  kimi_code_desktop: 'Kimi Code Desktop',
  kimi_code_cli: 'Kimi Code CLI',
  kimi_code: 'Kimi Code CLI',
};

/**
 * Human label for the host product of a pairing: 'ZCode',
 * 'Kimi Code Desktop' / 'Kimi Code CLI' (from the QR `from` param),
 * or 'Kimi Code' when the source is unknown.
 */
export function hostLabel(c: PairingCredentials): string {
  if (c.kind !== 'kimi') {
    return 'ZCode';
  }
  const source = c.source == null ? '' : c.source;
  return KIMI_SOURCE_LABELS[source] ?? 'Kimi Code';
}

/** Host kind of a pairing; absent field (legacy records) means 'zcode'. */
export function hostKindOf(c: PairingCredentials): HostKind {
  return c.kind ?? 'zcode';
}

/**
 * Compact source label for card meta lines: 'Desktop' / 'CLI' for Kimi Code
 * (from the QR `from` param), '' otherwise.
 */
export function sourceShortLabel(c: PairingCredentials): string {
  if (c.kind !== 'kimi') {
    return '';
  }
  const source = c.source == null ? '' : c.source;
  if (source === 'kimi_code_desktop') {
    return 'Desktop';
  }
  if (source === 'kimi_code_cli' || source === 'kimi_code') {
    return 'CLI';
  }
  return '';
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
  /** Override timestamp (ms) for legacy links. Defaults to Date.now(). */
  now?: number;
}

/**
 * Build the remote console URL from stored credentials.
 * Kimi Code: the pairing link is stable and secret-free — rebuild
 * /devices/<id>/ verbatim (reusing the QR's query so mode flags such as
 * `rc=1` are preserved) and let the page handle its own account login.
 * ZCode: two generations coexist, keyed by hash presence.
 * - Legacy (sid+hash): the page in production today validates
 *   sid + hash + numeric `t` together, so `t` is refreshed on every open.
 * - Relay v2 (no hash): the page requires an account login and rejects any
 *   URL carrying `hash` or `t` — emit only sid/mid/name/app_version.
 */
export function buildConsoleUrl(c: PairingCredentials, opts: ConsoleUrlOptions = {}): string {
  if (c.kind === 'kimi') {
    const u = new URL(`/devices/${encodeURIComponent(c.sid)}/`, c.origin);
    if (c.extraQuery != null && c.extraQuery.length > 0) {
      u.search = c.extraQuery;
    }
    return u.toString();
  }
  const pathVersion = opts.pathVersion ?? consolePathFor(c.appVersion);
  const u = new URL(`/remote/${pathVersion}`, c.origin);
  u.searchParams.set('sid', c.sid);
  if (c.hash.length > 0) {
    u.searchParams.set('hash', c.hash);
    u.searchParams.set('t', String(opts.now ?? Date.now()));
  }
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
