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
}
