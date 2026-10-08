import {
  bytesToHex,
  constantTimeEqual,
  hexToBytes,
  pbkdf2Sha256,
  utf8Encode,
} from './crypto';

/**
 * App-lock model. The lock protects the machine registry screen on app open:
 * the chosen method is either a device biometric prompt (fingerprint / face)
 * or a local secret (drawn pattern / typed password). Biometric always pairs
 * with a secret fallback so the app is still lockable when the sensor is
 * unavailable (emulators, revoked enrollment).
 */

export type LockMethod = 'biometric' | 'pattern' | 'password';
export type SecretKind = 'pattern' | 'password';

export interface LockVerifier {
  /** Random salt, hex. */
  saltHex: string;
  /** PBKDF2-HMAC-SHA256(secret, salt, iterations), hex. */
  hashHex: string;
  iterations: number;
}

export interface LockConfig {
  enabled: boolean;
  /** Primary unlock method chosen at setup. */
  method: LockMethod;
  /**
   * Secret-based verifier. Required for pattern/password methods; for
   * biometric it backs the fallback path.
   */
  secretKind: SecretKind;
  verifier: LockVerifier | null;
  createdAt: number;
}

export const LOCK_ITERATIONS = 20000;

/** Pattern dots are 0..8; the secret is their draw order, e.g. "0136". */
export function patternToString(dots: number[]): string {
  return dots.join('');
}

export function makeVerifier(
  secret: string,
  rng: (n: number) => Uint8Array,
  iterations: number = LOCK_ITERATIONS,
): LockVerifier {
  const salt = rng(16);
  const hash = pbkdf2Sha256(utf8Encode(secret), salt, iterations, 32);
  return {saltHex: bytesToHex(salt), hashHex: bytesToHex(hash), iterations};
}

export function createLockConfig(
  method: LockMethod,
  secret: string,
  rng: (n: number) => Uint8Array,
  now: number = Date.now(),
): LockConfig {
  const secretKind: SecretKind = method === 'biometric' ? 'pattern' : method;
  return {
    enabled: true,
    method,
    secretKind,
    verifier: makeVerifier(secret, rng),
    createdAt: now,
  };
}

export function verifySecret(secret: string, config: LockConfig): boolean {
  if (!config.enabled || config.verifier == null) {
    return false;
  }
  const v = config.verifier;
  const hash = pbkdf2Sha256(
    utf8Encode(secret),
    hexToBytes(v.saltHex),
    v.iterations,
    32,
  );
  return constantTimeEqual(bytesToHex(hash), v.hashHex);
}

export function serializeLockConfig(config: LockConfig): string {
  return JSON.stringify(config);
}

export function deserializeLockConfig(raw: string | null): LockConfig | null {
  if (raw == null || raw.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as LockConfig;
    if (
      typeof parsed.enabled !== 'boolean' ||
      !['biometric', 'pattern', 'password'].includes(parsed.method)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Disabled sentinel (kept as a config so unlock logic stays uniform). */
export function disabledConfig(): LockConfig {
  return {
    enabled: false,
    method: 'pattern',
    secretKind: 'pattern',
    verifier: null,
    createdAt: 0,
  };
}
