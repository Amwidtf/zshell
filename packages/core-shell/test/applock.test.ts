import {describe, expect, it} from 'vitest';
import {
  activeSecrets,
  clearMethod,
  deserializeLockConfig,
  emptyLockConfig,
  hasActiveMethod,
  patternToString,
  serializeLockConfig,
  setBiometric,
  setPassword,
  setPattern,
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

describe('applock multi-method model', () => {
  it('starts empty and disabled', () => {
    const cfg = emptyLockConfig();
    expect(cfg.enabled).toBe(false);
    expect(hasActiveMethod(cfg)).toBe(false);
    expect(activeSecrets(cfg)).toEqual([]);
  });

  it('pattern and password can coexist and each verifies independently', () => {
    let cfg = setPattern(emptyLockConfig(), '0158', fakeRng(1));
    cfg = setPassword(cfg, 'hunter2', fakeRng(2));
    expect(cfg.enabled).toBe(true);
    expect(activeSecrets(cfg)).toEqual(['pattern', 'password']);
    expect(verifySecret('0158', 'pattern', cfg)).toBe(true);
    expect(verifySecret('hunter2', 'password', cfg)).toBe(true);
    expect(verifySecret('wrong', 'pattern', cfg)).toBe(false);
    // A password attempt must not pass as a pattern and vice versa.
    expect(verifySecret('hunter2', 'pattern', cfg)).toBe(false);
    expect(verifySecret('0158', 'password', cfg)).toBe(false);
  });

  it('biometric flag coexists with secrets', () => {
    let cfg = setBiometric(emptyLockConfig(), true);
    expect(cfg.enabled).toBe(true);
    cfg = setPattern(cfg, '0158', fakeRng(3));
    expect(cfg.methods.biometric).toBe(true);
    expect(activeSecrets(cfg)).toEqual(['pattern']);
  });

  it('clearing methods recomputes enabled', () => {
    let cfg = setPattern(emptyLockConfig(), '0158', fakeRng(4));
    cfg = setPassword(cfg, 'pw', fakeRng(5));
    expect(clearMethod(cfg, 'pattern').enabled).toBe(true);
    const afterBoth = clearMethod(clearMethod(cfg, 'pattern'), 'password');
    expect(afterBoth.enabled).toBe(false);
    expect(afterBoth.methods.pattern).toBeNull();
  });

  it('same secret set twice gets different salts', () => {
    const a = setPattern(emptyLockConfig(), '0158', fakeRng(6));
    const b = setPattern(emptyLockConfig(), '0158', fakeRng(7));
    expect(a.methods.pattern!.hashHex).not.toBe(b.methods.pattern!.hashHex);
  });

  it('serializes / deserializes round-trip', () => {
    let cfg = setBiometric(emptyLockConfig(), true);
    cfg = setPattern(cfg, '0158', fakeRng(8));
    cfg = setPassword(cfg, 'pw', fakeRng(9));
    const restored = deserializeLockConfig(serializeLockConfig(cfg))!;
    expect(restored).toEqual(cfg);
    expect(verifySecret('0158', 'pattern', restored)).toBe(true);
  });

  it('migrates v1 single-method configs', () => {
    // Storage format used by <= 0.0.1-alpha.2.
    const v1Pattern = JSON.stringify({
      enabled: true,
      method: 'pattern',
      secretKind: 'pattern',
      verifier: {
        saltHex: '000102030405060708090a0b0c0d0e0f',
        hashHex: 'deadbeef',
        iterations: 20000,
      },
      createdAt: 42,
    });
    const migrated = deserializeLockConfig(v1Pattern)!;
    expect(migrated.methods.pattern!.hashHex).toBe('deadbeef');
    expect(migrated.methods.biometric).toBe(false);
    expect(migrated.enabled).toBe(true);

    const v1Biometric = JSON.stringify({
      enabled: true,
      method: 'biometric',
      secretKind: 'pattern',
      verifier: {
        saltHex: '000102030405060708090a0b0c0d0e0f',
        hashHex: 'cafe',
        iterations: 20000,
      },
      createdAt: 1,
    });
    const migratedBio = deserializeLockConfig(v1Biometric)!;
    expect(migratedBio.methods.biometric).toBe(true);
    expect(migratedBio.methods.pattern!.hashHex).toBe('cafe');
  });

  it('rejects malformed persisted configs', () => {
    expect(deserializeLockConfig(null)).toBeNull();
    expect(deserializeLockConfig('garbage')).toBeNull();
    expect(
      deserializeLockConfig('{"enabled":true,"methods":{"biometric":"yes"}}'),
    ).toBeNull();
  });

  it('patternToString joins dot order', () => {
    expect(patternToString([0, 1, 5, 8])).toBe('0158');
  });
});
