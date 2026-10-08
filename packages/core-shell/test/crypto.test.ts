import {createHash, createHmac, pbkdf2Sync} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  constantTimeEqual,
  hexToBytes,
  hmacSha256,
  pbkdf2Sha256,
  sha256,
  utf8Encode,
} from '../src/crypto';

describe('sha256', () => {
  it('matches the canonical "abc" vector', () => {
    expect(bytesToHex(sha256(utf8Encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches the empty-string vector', () => {
    expect(bytesToHex(sha256(new Uint8Array(0)))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('cross-checks against node:crypto on random inputs', () => {
    for (const len of [0, 1, 55, 56, 63, 64, 65, 127, 128, 1000]) {
      const msg = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        msg[i] = (i * 31 + 7) & 0xff;
      }
      const expected = createHash('sha256').update(msg).digest('hex');
      expect(bytesToHex(sha256(msg))).toBe(expected);
    }
  });

  it('handles multi-byte UTF-8 (Chinese device name)', () => {
    const s = '华为手机-测试';
    const expected = createHash('sha256').update(s, 'utf8').digest('hex');
    expect(bytesToHex(sha256(utf8Encode(s)))).toBe(expected);
  });
});

describe('hmacSha256', () => {
  it('matches RFC 4231 test case 2', () => {
    const key = utf8Encode('Jefe');
    const data = utf8Encode('what do ya want for nothing?');
    expect(bytesToHex(hmacSha256(key, data))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('cross-checks against node:crypto including long keys', () => {
    for (const keyLen of [0, 16, 64, 65, 200]) {
      const key = new Uint8Array(keyLen);
      const data = new Uint8Array(37);
      for (let i = 0; i < keyLen; i++) {
        key[i] = (i * 7) & 0xff;
      }
      for (let i = 0; i < 37; i++) {
        data[i] = (i * 13) & 0xff;
      }
      const expected = createHmac('sha256', Buffer.from(key))
        .update(Buffer.from(data))
        .digest('hex');
      expect(bytesToHex(hmacSha256(key, data))).toBe(expected);
    }
  });
});

describe('pbkdf2Sha256', () => {
  it('matches RFC 7914 PBKDF2-HMAC-SHA-256 vector (c=1)', () => {
    const dk = pbkdf2Sha256(utf8Encode('passwd'), utf8Encode('salt'), 1, 64);
    expect(bytesToHex(dk)).toBe(
      '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc' +
        '49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783',
    );
  });

  it('cross-checks against node:crypto at realistic iteration counts', () => {
    const expected = pbkdf2Sync('我的密码', '随机盐值', 20000, 32, 'sha256').toString('hex');
    const got = pbkdf2Sha256(utf8Encode('我的密码'), utf8Encode('随机盐值'), 20000, 32);
    expect(bytesToHex(got)).toBe(expected);
  });
});

describe('encodings', () => {
  it('base64 round-trips against Buffer', () => {
    for (const len of [0, 1, 2, 3, 4, 255]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = (i * 67 + 13) & 0xff;
      }
      const b64 = bytesToBase64(bytes);
      expect(b64).toBe(Buffer.from(bytes).toString('base64'));
      expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(bytes));
    }
  });

  it('hex round-trips', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 254, 255]);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it('constantTimeEqual', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});
