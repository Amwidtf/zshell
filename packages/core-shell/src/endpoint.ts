import {KNOWN_ORIGINS} from './types';

export type EndpointId = keyof typeof KNOWN_ORIGINS;

export interface EndpointSelectorOptions {
  /** Preference order. Default: china first (国内可达性优先), international fallback. */
  order?: EndpointId[];
  /** User-pinned custom origin — always wins while set. */
  lockedOrigin?: string | null;
  /** Consecutive failures before an endpoint is quarantined. Default 2. */
  maxConsecutiveFailures?: number;
  /** Quarantine duration in ms. Default 60_000. */
  quarantineMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

/**
 * Pure endpoint (origin) selection with failure quarantine.
 * Both roles dial OUT to the relay, so the only choice is which origin's
 * web console + WSS relay we load — china line is preferred for reachability,
 * international line is the fallback.
 */
export class EndpointSelector {
  private readonly order: EndpointId[];
  private readonly lockedOrigin: string | null;
  private readonly maxConsecutiveFailures: number;
  private readonly quarantineMs: number;
  private readonly now: () => number;
  private readonly consecutiveFailures: Map<EndpointId, number> = new Map();
  private readonly quarantinedUntil: Map<EndpointId, number> = new Map();

  constructor(opts: EndpointSelectorOptions = {}) {
    this.order = opts.order ?? ['china', 'international'];
    this.lockedOrigin = opts.lockedOrigin ?? null;
    this.maxConsecutiveFailures = opts.maxConsecutiveFailures ?? 2;
    this.quarantineMs = opts.quarantineMs ?? 60_000;
    this.now = opts.now ?? Date.now;
  }

  current(): string {
    if (this.lockedOrigin != null && this.lockedOrigin.length > 0) {
      return this.lockedOrigin;
    }
    const t = this.now();
    for (const id of this.order) {
      const until = this.quarantinedUntil.get(id) ?? 0;
      if (t >= until) {
        return KNOWN_ORIGINS[id];
      }
    }
    // Everything quarantined: still prefer the first choice over giving up.
    return KNOWN_ORIGINS[this.order[0]];
  }

  reportFailure(origin: string): void {
    const id = this.idFor(origin);
    if (id == null) {
      return; // custom/locked origin — caller decides retry policy
    }
    const count = (this.consecutiveFailures.get(id) ?? 0) + 1;
    if (count >= this.maxConsecutiveFailures) {
      this.consecutiveFailures.set(id, 0);
      this.quarantinedUntil.set(id, this.now() + this.quarantineMs);
    } else {
      this.consecutiveFailures.set(id, count);
    }
  }

  reportSuccess(origin: string): void {
    const id = this.idFor(origin);
    if (id == null) {
      return;
    }
    this.consecutiveFailures.set(id, 0);
    this.quarantinedUntil.set(id, 0);
  }

  private idFor(origin: string): EndpointId | null {
    if (origin === KNOWN_ORIGINS.china) {
      return 'china';
    }
    if (origin === KNOWN_ORIGINS.international) {
      return 'international';
    }
    return null;
  }
}
