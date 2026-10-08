import {describe, expect, it} from 'vitest';
import {
  createLockConfig,
  deserializeLockConfig,
  disabledConfig,
  patternToString,
  serializeLockConfig,
  verifySecret,
} from '../src/applock';

// Deterministic RNG for tests.
function fakeRng(seed: number) {
  return (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = (seed + i * 37) & 0xff;
    }
    return out;
  };
}

describe('applock', () => {
  it('creates and verifies a pattern lock', () => {
    const secret = patternToString([0, 1, 5, 8]);
    const cfg = createLockConfig('pattern', secret, fakeRng(1), 12345);
    expect(cfg.enabled).toBe(true);
    expect(cfg.secretKind).toBe('pattern');
    expect(verifySecret('0158', cfg)).toBe(true);
    expect(verifySecret('0159', cfg)).toBe(false);
    expect(verifySecret('', cfg)).toBe(false);
  });

  it('creates a biometric lock with a pattern fallback verifier', () => {
    const cfg = createLockConfig('biometric', '0158', fakeRng(2), 1);
    expect(cfg.method).toBe('biometric');
    expect(cfg.secretKind).toBe('pattern'); // fallback secret kind
    expect(verifySecret('0158', cfg)).toBe(true);
  });

  it('salts are random per config (same secret -> different hashes)', () => {
    const a = createLockConfig('password', 'hunter2', fakeRng(3));
    const b = createLockConfig('password', 'hunter2', fakeRng(4));
    expect(a.verifier!.hashHex).not.toBe(b.verifier!.hashHex);
  });

  it('serializes / deserializes round-trip', () => {
    const cfg = createLockConfig('pattern', '0158', fakeRng(5), 42);
    const restored = deserializeLockConfig(serializeLockConfig(cfg))!;
    expect(restored).toEqual(cfg);
    expect(verifySecret('0158', restored)).toBe(true);
  });

  it('disabled config never verifies', () => {
    expect(verifySecret('anything', disabledConfig())).toBe(false);
  });

  it('rejects malformed persisted configs', () => {
    expect(deserializeLockConfig(null)).toBeNull();
    expect(deserializeLockConfig('garbage')).toBeNull();
    expect(deserializeLockConfig('{"enabled":true,"method":"weird"}')).toBeNull();
  });
});
