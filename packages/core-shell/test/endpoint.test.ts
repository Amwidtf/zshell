import {describe, expect, it} from 'vitest';
import {EndpointSelector} from '../src/endpoint';
import {KNOWN_ORIGINS} from '../src/types';

function fakeClock() {
  let t = 1_000_000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('EndpointSelector', () => {
  it('defaults to the china line (reachability first)', () => {
    expect(new EndpointSelector().current()).toBe(KNOWN_ORIGINS.china);
  });

  it('switches to international after repeated china failures', () => {
    const clock = fakeClock();
    const s = new EndpointSelector({now: clock.now});
    s.reportFailure(KNOWN_ORIGINS.china);
    expect(s.current()).toBe(KNOWN_ORIGINS.china); // 1 failure is not enough
    s.reportFailure(KNOWN_ORIGINS.china);
    expect(s.current()).toBe(KNOWN_ORIGINS.international);
  });

  it('returns to the preferred endpoint after quarantine expires', () => {
    const clock = fakeClock();
    const s = new EndpointSelector({now: clock.now, quarantineMs: 60_000});
    s.reportFailure(KNOWN_ORIGINS.china);
    s.reportFailure(KNOWN_ORIGINS.china);
    expect(s.current()).toBe(KNOWN_ORIGINS.international);
    clock.advance(61_000);
    expect(s.current()).toBe(KNOWN_ORIGINS.china);
  });

  it('success resets the failure counter', () => {
    const clock = fakeClock();
    const s = new EndpointSelector({now: clock.now});
    s.reportFailure(KNOWN_ORIGINS.china);
    s.reportSuccess(KNOWN_ORIGINS.china);
    s.reportFailure(KNOWN_ORIGINS.china); // counter restarted, not second strike
    expect(s.current()).toBe(KNOWN_ORIGINS.china);
  });

  it('locked custom origin always wins', () => {
    const s = new EndpointSelector({lockedOrigin: 'https://relay.example.com'});
    s.reportFailure('https://relay.example.com'); // custom origins are caller-managed
    expect(s.current()).toBe('https://relay.example.com');
  });

  it('falls back to the first preference when everything is quarantined', () => {
    const clock = fakeClock();
    const s = new EndpointSelector({now: clock.now});
    for (const origin of [KNOWN_ORIGINS.china, KNOWN_ORIGINS.international]) {
      s.reportFailure(origin);
      s.reportFailure(origin);
    }
    expect(s.current()).toBe(KNOWN_ORIGINS.china);
  });
});
