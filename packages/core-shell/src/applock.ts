import {
  bytesToHex,
  constantTimeEqual,
  hexToBytes,
  pbkdf2Sha256,
  utf8Encode,
} from './crypto';

/**
 * App-lock model (v2): multiple methods can be active at the same time so the
 * user is never permanently locked out — e.g. biometric + pattern + password
 * all enabled, any one of them unlocks. Android's biometric API reports
 * strength classes rather than finger/face modality, so biometric is a single
 * method whose display name is resolved by the app layer.
 */

export type SecretKind = 'pattern' | 'password';

export interface LockVerifier {
  /** Random salt, hex. */
  saltHex: string;
  /** PBKDF2-HMAC-SHA256(secret, salt, iterations), hex. */
  hashHex: string;
  iterations: number;
}

export interface LockMethods {
  biometric: boolean;
  pattern: LockVerifier | null;
  password: LockVerifier | null;
}

export interface LockConfig {
  /** True when at least one method is active (derived on every mutation). */
  enabled: boolean;
  methods: LockMethods;
  createdAt: number;
}

export const LOCK_ITERATIONS = 20000;

/** Pattern dots are 0..8; the secret is their draw order, e.g. "0136". */
export function patternToString(dots: number[]): string {
  return dots.join('');
}

export function emptyLockConfig(): LockConfig {
  return {
    enabled: false,
    methods: {biometric: false, pattern: null, password: null},
    createdAt: 0,
  };
}

/** Kept for API continuity with the app layer. */
export function disabledConfig(): LockConfig {
  return emptyLockConfig();
}

export function hasActiveMethod(config: LockConfig): boolean {
  return (
    config.methods.biometric ||
    config.methods.pattern != null ||
    config.methods.password != null
  );
}

export function activeSecrets(config: LockConfig): SecretKind[] {
  const kinds: SecretKind[] = [];
  if (config.methods.pattern != null) {
    kinds.push('pattern');
  }
  if (config.methods.password != null) {
    kinds.push('password');
  }
  return kinds;
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

function withMethods(
  config: LockConfig,
  methods: LockMethods,
): LockConfig {
  return {
    enabled: methods.biometric || methods.pattern != null || methods.password != null,
    methods,
    createdAt: config.createdAt || Date.now(),
  };
}

export function setBiometric(config: LockConfig, on: boolean): LockConfig {
  return withMethods(config, {...config.methods, biometric: on});
}

export function setPattern(
  config: LockConfig,
  secret: string,
  rng: (n: number) => Uint8Array,
): LockConfig {
  return withMethods(config, {
    ...config.methods,
    pattern: makeVerifier(secret, rng),
  });
}

export function setPassword(
  config: LockConfig,
  secret: string,
  rng: (n: number) => Uint8Array,
): LockConfig {
  return withMethods(config, {
    ...config.methods,
    password: makeVerifier(secret, rng),
  });
}

export function clearMethod(config: LockConfig, kind: SecretKind): LockConfig {
  return withMethods(config, {...config.methods, [kind]: null});
}

export function verifySecret(
  secret: string,
  kind: SecretKind,
  config: LockConfig,
): boolean {
  const verifier =
    kind === 'pattern' ? config.methods.pattern : config.methods.password;
  if (verifier == null) {
    return false;
  }
  const hash = pbkdf2Sha256(
    utf8Encode(secret),
    hexToBytes(verifier.saltHex),
    verifier.iterations,
    32,
  );
  return constantTimeEqual(bytesToHex(hash), verifier.hashHex);
}

export function serializeLockConfig(config: LockConfig): string {
  return JSON.stringify(config);
}

/** Migrate a v1 (single-method) config into the multi-method shape. */
function migrateV1(parsed: Record<string, unknown>): LockConfig | null {
  const method = parsed.method as string | undefined;
  const secretKind = parsed.secretKind as SecretKind | undefined;
  const verifier = parsed.verifier as LockVerifier | null | undefined;
  if (method !== 'biometric' && secretKind == null) {
    return null;
  }
  const methods: LockMethods = {
    biometric: method === 'biometric',
    pattern: null,
    password: null,
  };
  if (secretKind === 'pattern' || secretKind === 'password') {
    methods[secretKind] = verifier ?? null;
  }
  return {
    enabled: hasActiveMethod({enabled: false, methods, createdAt: 0}),
    methods,
    createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : 0,
  };
}

export function deserializeLockConfig(raw: string | null): LockConfig | null {
  if (raw == null || raw.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.methods == null) {
      // v1 single-method config (<= 0.0.1-alpha.2 storage format)
      return migrateV1(parsed);
    }
    const methods = parsed.methods as LockMethods;
    if (
      typeof methods.biometric !== 'boolean' ||
      (methods.pattern != null && typeof methods.pattern.hashHex !== 'string') ||
      (methods.password != null && typeof methods.password.hashHex !== 'string')
    ) {
      return null;
    }
    return {
      enabled: hasActiveMethod({enabled: false, methods, createdAt: 0}),
      methods,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : 0,
    };
  } catch {
    return null;
  }
}
