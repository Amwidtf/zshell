import {describe, expect, it} from 'vitest';
import {deriveConsoleStatus, parseConsoleEvent} from '../src/console-bridge';

describe('parseConsoleEvent', () => {
  it('parses a valid bridge message', () => {
    const ev = parseConsoleEvent(
      JSON.stringify({source: 'zshell', type: 'pair-status', detail: {status: 'waiting'}}),
    );
    expect(ev).toEqual({source: 'zshell', type: 'pair-status', detail: {status: 'waiting'}});
  });

  it('accepts events without detail', () => {
    expect(parseConsoleEvent('{"source":"zshell","type":"kicked"}')).toEqual({
      source: 'zshell',
      type: 'kicked',
      detail: null,
    });
  });

  it('rejects foreign and malformed payloads', () => {
    expect(parseConsoleEvent('random page message')).toBeNull();
    expect(parseConsoleEvent('{"source":"other","type":"kicked"}')).toBeNull();
    expect(parseConsoleEvent('{"source":"zshell","type":"nope"}')).toBeNull();
    expect(parseConsoleEvent('')).toBeNull();
    expect(parseConsoleEvent('not json')).toBeNull();
  });
});

describe('deriveConsoleStatus', () => {
  const ev = (type: string, detail?: object) =>
    parseConsoleEvent(JSON.stringify({source: 'zshell', type, detail}))!;

  it('follows the connection lifecycle', () => {
    let s = 'connecting' as const;
    s = deriveConsoleStatus(s, ev('ws-open'));
    expect(s).toBe('connecting');
    s = deriveConsoleStatus(s, ev('ws-connected'));
    expect(s).toBe('connected');
    s = deriveConsoleStatus(s, ev('ws-closed', {code: 1006}));
    expect(s).toBe('disconnected');
    s = deriveConsoleStatus(s, ev('ws-connected'));
    expect(s).toBe('connected');
  });

  it('maps pair_status payloads', () => {
    expect(deriveConsoleStatus('connecting', ev('pair-status', {status: 'waiting'}))).toBe(
      'waiting',
    );
    expect(deriveConsoleStatus('waiting', ev('pair-status', {status: 'matched'}))).toBe(
      'connected',
    );
    expect(deriveConsoleStatus('connected', ev('pair-status', {status: 'unknown'}))).toBe(
      'connected',
    );
  });

  it('kicked is terminal until an explicit reconnect', () => {
    let s = deriveConsoleStatus('connected', ev('kicked'));
    expect(s).toBe('kicked');
    s = deriveConsoleStatus(s, ev('ws-closed', {code: 1000}));
    expect(s).toBe('kicked');
    s = deriveConsoleStatus(s, ev('ws-error'));
    expect(s).toBe('kicked');
    // A fresh socket connection clears it (user pressed reconnect).
    s = deriveConsoleStatus(s, ev('ws-connected'));
    expect(s).toBe('connected');
  });

  it('network transitions', () => {
    expect(deriveConsoleStatus('connected', ev('network-offline'))).toBe('disconnected');
    expect(deriveConsoleStatus('disconnected', ev('network-online'))).toBe('connecting');
  });

  it('approval-waiting does not change status', () => {
    expect(deriveConsoleStatus('connected', ev('approval-waiting'))).toBe('connected');
  });
});
