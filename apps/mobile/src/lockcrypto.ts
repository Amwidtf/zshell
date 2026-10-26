import {NativeModules} from 'react-native';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  constantTimeEqual,
  hexToBytes,
  LockConfig,
  LockVerifier,
  LOCK_ITERATIONS,
  pbkdf2Sha256,
  SecretKind,
  utf8Encode,
} from '@zshell/core-shell';

/**
 * App-lock hashing. The pure-TS pbkdf2Sha256 in core-shell is portable but
 * synchronous — at 20k iterations it freezes the JS thread for seconds
 * (enough to trip the Android ANR watchdog), so every lock set/verify goes
 * through the native ZShellCrypto implementation when present and only falls
 * back to the pure version in environments without the module (tests).
 * Both produce byte-identical hashes, so verifiers are interchangeable.
 */
type ZShellCryptoNative = {
  secureRandomBase64(count: number): Promise<string>;
  pbkdf2Sha256Base64(
    passwordB64: string,
    saltB64: string,
    iterations: number,
    dkLen: number,
  ): Promise<string>;
};

function nativePbkdf2(): ZShellCryptoNative | null {
  const m = NativeModules.ZShellCrypto as ZShellCryptoNative | undefined;
  return m != null && typeof m.pbkdf2Sha256Base64 === 'function' ? m : null;
}

export async function deriveLockHash(
  secret: string,
  salt: Uint8Array,
  iterations: number = LOCK_ITERATIONS,
): Promise<Uint8Array> {
  const native = nativePbkdf2();
  if (native != null) {
    return base64ToBytes(
      await native.pbkdf2Sha256Base64(
        bytesToBase64(utf8Encode(secret)),
        bytesToBase64(salt),
        iterations,
        32,
      ),
    );
  }
  return pbkdf2Sha256(utf8Encode(secret), salt, iterations, 32);
}

export async function buildLockVerifier(
  secret: string,
  salt: Uint8Array,
): Promise<LockVerifier> {
  const hash = await deriveLockHash(secret, salt);
  return {saltHex: bytesToHex(salt), hashHex: bytesToHex(hash), iterations: LOCK_ITERATIONS};
}

export async function verifySecretAsync(
  secret: string,
  kind: SecretKind,
  config: LockConfig,
): Promise<boolean> {
  const verifier =
    kind === 'pattern' ? config.methods.pattern : config.methods.password;
  if (verifier == null) {
    return false;
  }
  const hash = await deriveLockHash(
    secret,
    hexToBytes(verifier.saltHex),
    verifier.iterations,
  );
  return constantTimeEqual(bytesToHex(hash), verifier.hashHex);
}
