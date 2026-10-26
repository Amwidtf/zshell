import {NativeModules} from 'react-native';
import {
  BACKUP_ITERATIONS,
  backupKeysFromMaster,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  constantTimeEqual,
  decryptBackupWithKeys,
  encryptBackupWithKeys,
  hexToBytes,
  LockConfig,
  LockVerifier,
  LOCK_ITERATIONS,
  parseBackupBlob,
  pbkdf2Sha256,
  SecretKind,
  utf8Encode,
} from '@zshell/core-shell';

/**
 * PBKDF2 bridge to the native crypto module. The pure-TS pbkdf2Sha256 in
 * core-shell is portable but synchronous — at 20k iterations it freezes the
 * JS thread for seconds (enough to trip the Android ANR watchdog), so every
 * expensive derivation (app-lock set/verify, backup export/restore) runs
 * natively when the module is present and only falls back to the pure
 * version in environments without it (tests). Both produce byte-identical
 * hashes, so verifiers and blobs are interchangeable across the two paths.
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

async function derive(
  secret: string,
  salt: Uint8Array,
  iterations: number,
  dkLen: number,
): Promise<Uint8Array> {
  const native = nativePbkdf2();
  if (native != null) {
    return base64ToBytes(
      await native.pbkdf2Sha256Base64(
        bytesToBase64(utf8Encode(secret)),
        bytesToBase64(salt),
        iterations,
        dkLen,
      ),
    );
  }
  return pbkdf2Sha256(utf8Encode(secret), salt, iterations, dkLen);
}

// ---------- app lock ----------

export async function deriveLockHash(
  secret: string,
  salt: Uint8Array,
  iterations: number = LOCK_ITERATIONS,
): Promise<Uint8Array> {
  return derive(secret, salt, iterations, 32);
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

// ---------- machine backup ----------

/** Encrypt a registry payload; the PBKDF2 pass runs natively (no UI freeze). */
export async function encryptBackupAsync(
  payloadJson: string,
  passphrase: string,
  randomSalt: Uint8Array,
): Promise<string> {
  const salt = randomSalt.slice(0, 16);
  const master = await derive(passphrase, salt, BACKUP_ITERATIONS, 64);
  return encryptBackupWithKeys(payloadJson, backupKeysFromMaster(master), salt);
}

/** Decrypt a backup blob; null on wrong passphrase / damaged or tampered data. */
export async function decryptBackupAsync(
  blob: string,
  passphrase: string,
): Promise<string | null> {
  const parsed = parseBackupBlob(blob);
  if (parsed == null) {
    return null;
  }
  const master = await derive(passphrase, parsed.salt, BACKUP_ITERATIONS, 64);
  return decryptBackupWithKeys(blob, backupKeysFromMaster(master));
}
