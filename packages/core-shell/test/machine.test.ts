import {describe, expect, it} from 'vitest';
import {MachineRegistry} from '../src/machine';

const QR_A =
  'https://zcode.z.ai/remote/v4?sid=sid-alpha&hash=aGFzaA%3D%3D&t=1000&name=Office%20PC&app_version=3.14.4';
const QR_B =
  'https://zcode.chatglm.site/remote/v4?sid=sid-beta&hash=aGFzaGI%3D&t=1000&name=Home%20Mac&app_version=3.14.4';

function fakeRegistry(): {reg: MachineRegistry; now: () => number; t: {v: number}} {
  const clock = {v: 1000};
  const now = () => clock.v;
  return {reg: new MachineRegistry(null, {now}), now, t: clock};
}

describe('MachineRegistry', () => {
  it('adds from a QR URL and defaults the name from the device name', () => {
    const {reg} = fakeRegistry();
    const r = reg.addFromUrl(QR_A);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.updatedExisting).toBe(false);
    expect(r.record.name).toBe('Office PC');
    expect(reg.size).toBe(1);
  });

  it('dedupes on sid+origin and rotates credentials only', () => {
    const {reg} = fakeRegistry();
    reg.addFromUrl(QR_A);
    reg.rename('m1', 'My Custom Name');
    reg.toggleFavorite('m1');
    const rotated =
      'https://zcode.z.ai/remote/v4?sid=sid-alpha&hash=bmV3aGFzaA%3D%3D&t=2000&name=Office%20PC';
    const r = reg.addFromUrl(rotated);
    expect(r.ok && r.updatedExisting).toBe(true);
    expect(reg.size).toBe(1);
    const m = reg.get('m1')!;
    expect(m.name).toBe('My Custom Name');
    expect(m.favorite).toBe(true);
    expect(m.credentials.hash).toBe('bmV3aGFzaA==');
  });

  it('treats the same sid on a different origin as a separate machine', () => {
    const {reg} = fakeRegistry();
    reg.addFromUrl(QR_A);
    const other =
      'https://zcode.chatglm.site/remote/v4?sid=sid-alpha&hash=aGFzaA%3D%3D';
    const r = reg.addFromUrl(other);
    expect(r.ok && !r.updatedExisting).toBe(true);
    expect(reg.size).toBe(2);
  });

  it('propagates parse failures', () => {
    const {reg} = fakeRegistry();
    expect(reg.addFromUrl('http://insecure.example/?sid=a&hash=b')).toEqual({
      ok: false,
      reason: 'not-https',
    });
    expect(reg.addFromUrl('https://zcode.z.ai/remote/v4?sid=a')).toEqual({
      ok: false,
      reason: 'missing-hash',
    });
  });

  it('sorts favorites first, then manual order', () => {
    const {reg} = fakeRegistry();
    reg.addFromUrl(QR_A); // m1
    reg.addFromUrl(QR_B); // m2
    const third =
      'https://zcode.z.ai/remote/v4?sid=sid-gamma&hash=eHg%3D&name=Gamma';
    reg.addFromUrl(third); // m3
    reg.toggleFavorite('m2');
    const names = () => reg.sorted().map(m => m.name);
    expect(names()).toEqual(['Home Mac', 'Office PC', 'Gamma']);
    reg.move('m1', 1); // swap Office PC past Gamma in the non-favorite group
    expect(names()).toEqual(['Home Mac', 'Gamma', 'Office PC']);
    reg.move('m1', 1); // already last -> no-op
    expect(names()).toEqual(['Home Mac', 'Gamma', 'Office PC']);
  });

  it('rename ignores blank names', () => {
    const {reg} = fakeRegistry();
    reg.addFromUrl(QR_A);
    expect(reg.rename('m1', '   ')).toBe(true);
    expect(reg.get('m1')!.name).toBe('Office PC');
    expect(reg.rename('nope', 'x')).toBe(false);
  });

  it('touch updates lastUsedAt', () => {
    const {reg, t} = fakeRegistry();
    reg.addFromUrl(QR_A);
    t.v = 5000;
    reg.touch('m1');
    expect(reg.get('m1')!.lastUsedAt).toBe(5000);
  });

  it('removes records', () => {
    const {reg} = fakeRegistry();
    reg.addFromUrl(QR_A);
    expect(reg.remove('m1')).toBe(true);
    expect(reg.remove('m1')).toBe(false);
    expect(reg.size).toBe(0);
  });

  it('round-trips through JSON', () => {
    const {reg} = fakeRegistry();
    reg.addFromUrl(QR_A);
    reg.addFromUrl(QR_B);
    reg.toggleFavorite('m2');
    reg.rename('m1', 'Renamed');
    const json = JSON.stringify(reg.toJSON());
    const restored = MachineRegistry.fromJSON(json)!;
    expect(restored.sorted().map(m => [m.name, m.favorite])).toEqual([
      ['Home Mac', true],
      ['Renamed', false],
    ]);
    // New adds after restore continue id/order sequences.
    const again = restored.addFromUrl(
      'https://zcode.z.ai/remote/v4?sid=sid-new&hash=eHg%3D',
    );
    expect(again.ok && again.record.id).toBe('m3');
  });

  it('rejects corrupt JSON', () => {
    expect(MachineRegistry.fromJSON('not json')).toBeNull();
    expect(MachineRegistry.fromJSON('{"version":99,"machines":[]}')).toBeNull();
    expect(MachineRegistry.fromJSON(null)).not.toBeNull(); // empty -> fresh
  });
});
