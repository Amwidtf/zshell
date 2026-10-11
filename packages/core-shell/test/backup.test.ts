import {describe, expect, it} from 'vitest';
import {decryptBackup, encryptBackup} from '../src/backup';
import {DiagnosticsLog} from '../src/diagnostics';
import {MachineRegistry} from '../src/machine';
import {isPrerelease} from '../src/update';

const SALT = new Uint8Array(16).map((_, i) => i + 1);

function registryJson(): string {
  const reg = new MachineRegistry();
  reg.addFromUrl(
    'https://zcode.z.ai/remote/v4?sid=abc123&hash=deadbeef&name=My%20Desktop',
  );
  reg.rename('m1', '工作机');
  reg.toggleFavorite('m1');
  return JSON.stringify(reg.toJSON());
}

describe('backup encryption', () => {
  it('round-trips a registry payload', () => {
    const payload = registryJson();
    const blob = encryptBackup(payload, 'correct horse battery', SALT);
    expect(blob.startsWith('ZSBK1.')).toBe(true);
    expect(blob).not.toContain('deadbeef');
    expect(blob).not.toContain('My%20Desktop');
    expect(decryptBackup(blob, 'correct horse battery')).toBe(payload);
  });

  it('round-trips unicode content', () => {
    const payload = JSON.stringify({machines: [{name: '华为手机-🧪-Ωμέγα'}]});
    const blob = encryptBackup(payload, '口令', SALT);
    expect(decryptBackup(blob, '口令')).toBe(payload);
  });

  it('rejects a wrong passphrase', () => {
    const blob = encryptBackup(registryJson(), 'right', SALT);
    expect(decryptBackup(blob, 'wrong')).toBeNull();
  });

  it('rejects tampered ciphertext and tag', () => {
    const blob = encryptBackup(registryJson(), 'pw', SALT);
    const parts = blob.split('.');
    const tamperedCt = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}AA.${parts[3]}`;
    expect(decryptBackup(tamperedCt, 'pw')).toBeNull();
    const tamperedTag = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3].slice(0, -2)}AA`;
    expect(decryptBackup(tamperedTag, 'pw')).toBeNull();
  });

  it('rejects malformed blobs', () => {
    expect(decryptBackup('', 'pw')).toBeNull();
    expect(decryptBackup('not-a-backup', 'pw')).toBeNull();
    expect(decryptBackup('ZSBK1.YQ.YQ.YQ', 'pw')).toBeNull();
  });

  it('produces different blobs for different salts', () => {
    const payload = registryJson();
    const a = encryptBackup(payload, 'pw', SALT);
    const b = encryptBackup(payload, 'pw', new Uint8Array(16).fill(9));
    expect(a).not.toBe(b);
    expect(decryptBackup(b, 'pw')).toBe(payload);
  });
});

describe('DiagnosticsLog', () => {
  it('keeps newest events within the cap', () => {
    const log = new DiagnosticsLog(5);
    for (let i = 0; i < 8; i++) {
      log.push('ws-closed', `code=${i}`, 1000 + i);
    }
    const recent = log.recent();
    expect(recent).toHaveLength(5);
    expect(recent[0].detail).toBe('code=7');
    expect(recent[4].detail).toBe('code=3');
  });

  it('persists and restores via JSON', () => {
    const log = new DiagnosticsLog();
    log.push('ws-connected', undefined, 42);
    log.push('kicked');
    const restored = DiagnosticsLog.fromJSON(log.toJSON());
    expect(restored.size).toBe(2);
    expect(restored.recent()[0].type).toBe('kicked');
    expect(restored.recent()[1].t).toBe(42);
  });

  it('tolerates corrupt persisted JSON', () => {
    expect(DiagnosticsLog.fromJSON('!!!').size).toBe(0);
    expect(DiagnosticsLog.fromJSON(null).size).toBe(0);
  });
});

describe('machine mute', () => {
  it('toggles and persists through toJSON', () => {
    const reg = new MachineRegistry();
    reg.addFromUrl(
      'https://zcode.z.ai/remote/v4?sid=s&hash=h',
    );
    expect(reg.setMuted('m1', true)).toBe(true);
    expect(reg.get('m1')?.muted).toBe(true);
    const revived = MachineRegistry.fromJSON(JSON.stringify(reg.toJSON()));
    expect(revived.get('m1')?.muted).toBe(true);
    expect(reg.setMuted('nope', true)).toBe(false);
  });
});

describe('importMachines', () => {
  const backupMachine = {
    id: 'm9',
    name: '备份机',
    credentials: {sid: 'sid-x', hash: 'hash-x', origin: 'https://zcode.z.ai'},
    favorite: true,
    sortOrder: 1,
    createdAt: 1,
    lastUsedAt: null,
  };

  it('appends unknown machines and refreshes known credentials', () => {
    const reg = new MachineRegistry();
    reg.addFromUrl('https://zcode.z.ai/remote/v4?sid=sid-x&hash=old-hash');
    const r = reg.importMachines([backupMachine]);
    expect(r).toEqual({added: 0, updated: 1});
    expect(reg.size).toBe(1);
    expect(reg.get('m1')?.credentials.hash).toBe('hash-x');
    // Local name/order survive the credential refresh.
    expect(reg.get('m1')?.favorite).toBe(false);

    const r2 = reg.importMachines([
      {...backupMachine, credentials: {sid: 'sid-y', hash: 'h', origin: 'https://zcode.z.ai'}},
    ]);
    expect(r2).toEqual({added: 1, updated: 0});
    expect(reg.size).toBe(2);
  });

  it('skips malformed entries', () => {
    const reg = new MachineRegistry();
    expect(reg.importMachines('nope')).toEqual({added: 0, updated: 0});
    expect(reg.importMachines([{name: 1}, null, {}])).toEqual({added: 0, updated: 0});
    expect(reg.size).toBe(0);
  });
});

describe('isPrerelease', () => {
  it('classifies version suffixes', () => {
    expect(isPrerelease('0.0.1-alpha.9')).toBe(true);
    expect(isPrerelease('0.1.0-beta.1')).toBe(true);
    expect(isPrerelease('1.0.0-rc.2')).toBe(true);
    expect(isPrerelease('0.1.0')).toBe(false);
    expect(isPrerelease('v1.2.3')).toBe(false);
  });
});
