import {describe, expect, it} from 'vitest';
import {initialState, transition} from '../src/shell-state';

describe('shell-state machine', () => {
  it('happy path: unpaired -> pairing -> paired', () => {
    let s = initialState();
    expect(s).toBe('unpaired');
    s = transition(s, 'SCAN_STARTED')!;
    expect(s).toBe('pairing');
    s = transition(s, 'PAIRED')!;
    expect(s).toBe('paired');
  });

  it('paired -> waiting on desktop offline, and back', () => {
    let s: string = 'paired';
    s = transition(s as never, 'DESKTOP_OFFLINE')!;
    expect(s).toBe('waiting');
    s = transition(s as never, 'DESKTOP_BACK')!;
    expect(s).toBe('paired');
  });

  it('KICKED from paired and waiting', () => {
    expect(transition('paired', 'KICKED')).toBe('kicked');
    expect(transition('waiting', 'KICKED')).toBe('kicked');
  });

  it('auth failure is terminal until rescan', () => {
    expect(transition('paired', 'AUTH_FAILED')).toBe('auth-failed');
    expect(transition('auth-failed', 'RESCAN')).toBe('pairing');
    expect(transition('auth-failed', 'DESKTOP_BACK')).toBeNull();
  });

  it('UNPAIRED works from any live state', () => {
    for (const s of ['pairing', 'paired', 'waiting', 'kicked', 'auth-failed'] as const) {
      expect(transition(s, 'UNPAIRED')).toBe('unpaired');
    }
  });

  it('invalid transitions return null (signals may arrive out of order)', () => {
    expect(transition('unpaired', 'PAIRED')).toBeNull();
    expect(transition('unpaired', 'KICKED')).toBeNull();
    expect(transition('kicked', 'DESKTOP_BACK')).toBeNull();
  });
});
