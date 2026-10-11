import {
  base64ToBytes,
  bytesToBase64,
  hmacSha256,
  pbkdf2Sha256,
  utf8Encode,
} from './crypto';

/**
 * Encrypted backup of the machine registry (and other plain settings).
 *
 * Construction from primitives we already ship (no new cipher code):
 *   master   = PBKDF2-HMAC-SHA256(passphrase, salt, 20000, 64)
 *   encKey   = HMAC(master, "zshell-backup/enc")
 *   macKey   = HMAC(master, "zshell-backup/mac")
 *   keystream = HMAC(encKey, "zshell-backup/stream" || counter)  (CTR mode)
 *   ciphertext = payload XOR keystream        (encrypt)
 *   tag      = HMAC(macKey, header || ciphertext)  (encrypt-then-MAC)
 *
 * A wrong passphrase or a tampered blob fails the tag check and returns null.
 * Wire format (single line, easy to copy): ZSBK1.<salt>.<ciphertext>.<tag>
 */

const ITERATIONS = 20000;
const PREFIX = 'ZSBK1';
const SALT_LEN = 16;

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function deriveKeys(passphrase: string, salt: Uint8Array) {
  const master = pbkdf2Sha256(utf8Encode(passphrase), salt, ITERATIONS, 64);
  return {
    encKey: hmacSha256(master, utf8Encode('zshell-backup/enc')),
    macKey: hmacSha256(master, utf8Encode('zshell-backup/mac')),
  };
}

function keystream(key: Uint8Array, length: number): Uint8Array {
  const blocks = Math.ceil(length / 32);
  const out = new Uint8Array(blocks * 32);
  const domain = utf8Encode('zshell-backup/stream');
  for (let i = 0; i < blocks; i++) {
    const counter = new Uint8Array(4);
    counter[0] = (i >>> 24) & 0xff;
    counter[1] = (i >>> 16) & 0xff;
    counter[2] = (i >>> 8) & 0xff;
    counter[3] = i & 0xff;
    const block = hmacSha256(key, concat(domain, counter));
    out.set(block, i * 32);
  }
  return out.subarray(0, length);
}

/** Constant-time equality (same length inputs). */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/** Encrypt a JSON payload into a single-line portable backup string. */
export function encryptBackup(
  payloadJson: string,
  passphrase: string,
  randomSalt: Uint8Array,
): string {
  if (randomSalt.length < SALT_LEN) {
    throw new Error('salt too short');
  }
  const salt = randomSalt.slice(0, SALT_LEN);
  const {encKey, macKey} = deriveKeys(passphrase, salt);
  const plain = utf8Encode(payloadJson);
  const ks = keystream(encKey, plain.length);
  const ct = new Uint8Array(plain.length);
  for (let i = 0; i < plain.length; i++) {
    ct[i] = plain[i] ^ ks[i];
  }
  const header = `${PREFIX}.${bytesToBase64(salt)}`;
  const tag = hmacSha256(macKey, concat(utf8Encode(header), ct));
  return `${header}.${bytesToBase64(ct)}.${bytesToBase64(tag)}`;
}

/**
 * Decrypt a backup string. Returns the original JSON payload, or null when
 * the passphrase is wrong / the blob is damaged or tampered with.
 */
export function decryptBackup(blob: string, passphrase: string): string | null {
  const parts = blob.trim().split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    return null;
  }
  try {
    const salt = base64ToBytes(parts[1]);
    const ct = base64ToBytes(parts[2]);
    const tag = base64ToBytes(parts[3]);
    if (salt.length !== SALT_LEN || tag.length !== 32 || ct.length === 0) {
      return null;
    }
    const {encKey, macKey} = deriveKeys(passphrase, salt);
    const expect = hmacSha256(macKey, concat(utf8Encode(`${PREFIX}.${parts[1]}`), ct));
    if (!timingSafeEqual(expect, tag)) {
      return null;
    }
    const ks = keystream(encKey, ct.length);
    const plain = new Uint8Array(ct.length);
    for (let i = 0; i < ct.length; i++) {
      plain[i] = ct[i] ^ ks[i];
    }
    return utf8Decode(plain);
  } catch {
    return null;
  }
}

function utf8Decode(bytes: Uint8Array): string {
  // TextDecoder is not in our strict subset; decode UTF-8 manually.
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i += 1;
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b < 0xf0) {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f),
      );
      i += 3;
    } else {
      const cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      const offset = cp - 0x10000;
      out += String.fromCharCode(
        0xd800 + (offset >> 10),
        0xdc00 + (offset & 0x3ff),
      );
      i += 4;
    }
  }
  return out;
}
