/**
 * Known official endpoint origins. Custom origins are allowed — the desktop
 * endpoint is configurable by design.
 */
export const KNOWN_ORIGINS = {
  international: 'https://zcode.z.ai',
  china: 'https://zcode.chatglm.site',
} as const;

export type KnownOrigin = (typeof KNOWN_ORIGINS)[keyof typeof KNOWN_ORIGINS];

export function isKnownOrigin(origin: string): boolean {
  return origin === KNOWN_ORIGINS.international || origin === KNOWN_ORIGINS.china;
}

/**
 * Pairing credentials carried by the desktop QR code.
 * SECURITY: `hash` is a long-lived shared secret (base64(SHA-256(password))).
 * It must only live in secure storage (Keystore/Keychain/Asset Store Kit) —
 * never in plain preferences, logs, clipboard or cloud backups.
 */
export interface PairingCredentials {
  /** Relay-assigned device session id. Stable across desktop restarts. */
  sid: string;
  /** Pairing secret material. See security note above. */
  hash: string;
  /** Endpoint origin that issued the QR (decides which relay WSS URL to use). */
  origin: string;
  /** Desktop machine id (informational). */
  mid: string | null;
  /** Desktop device name, URL-decoded (informational). */
  deviceName: string | null;
  /** Desktop app version, e.g. "3.14.4" (informational + decides v3/v4 path). */
  appVersion: string | null;
  /** QR `t` param — issue timestamp in ms from the desktop clock. */
  issuedAt: number | null;
  /**
   * Product family this machine belongs to; absent means 'zcode' (records
   * stored before multi-host support). 'kimi' = Kimi Code remote control.
   */
  kind?: HostKind;
  /**
   * Kimi Code only: `from` query param of the pairing link
   * (e.g. 'kimi_code_desktop' — distinguishes Desktop from CLI source).
   */
  source?: string | null;
  /**
   * Kimi Code only: raw query string of the pairing link (e.g.
   * 'rc=1&from=...'), reused verbatim when opening the console so no
   * mode flags from the QR are lost.
   */
  extraQuery?: string | null;
}

/** Which desktop product a pairing belongs to. */
export type HostKind = 'zcode' | 'kimi';
