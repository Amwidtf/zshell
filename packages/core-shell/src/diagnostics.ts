/**
 * Rolling local timeline of connection-related events, used by the in-app
 * diagnostics page. Pure data structure — persistence lives at the app layer.
 * Events never contain credentials, URLs or message content, only event
 * types and short status words.
 */

export interface DiagEvent {
  /** Wall-clock ms. */
  t: number;
  type: string;
  detail?: string;
}

export class DiagnosticsLog {
  private events: DiagEvent[] = [];

  constructor(private readonly cap: number = 200) {}

  push(type: string, detail?: string, now: number = Date.now()): void {
    this.events.push({t: now, type, detail});
    if (this.events.length > this.cap) {
      this.events.splice(0, this.events.length - this.cap);
    }
  }

  /** Newest first. */
  recent(count: number = this.cap): DiagEvent[] {
    return this.events.slice(-count).reverse();
  }

  clear(): void {
    this.events = [];
  }

  get size(): number {
    return this.events.length;
  }

  toJSON(): string {
    return JSON.stringify({v: 1, events: this.events});
  }

  static fromJSON(raw: string | null, cap: number = 200): DiagnosticsLog {
    const log = new DiagnosticsLog(cap);
    if (raw == null || raw.length === 0) {
      return log;
    }
    try {
      const parsed = JSON.parse(raw) as {v?: unknown; events?: unknown};
      if (parsed.v !== 1 || !Array.isArray(parsed.events)) {
        return log;
      }
      for (const e of parsed.events) {
        if (
          e != null &&
          typeof (e as DiagEvent).t === 'number' &&
          typeof (e as DiagEvent).type === 'string'
        ) {
          log.events.push({
            t: (e as DiagEvent).t,
            type: (e as DiagEvent).type,
            detail:
              typeof (e as DiagEvent).detail === 'string'
                ? (e as DiagEvent).detail
                : undefined,
          });
        }
      }
      if (log.events.length > cap) {
        log.events.splice(0, log.events.length - cap);
      }
    } catch {
      // corrupt log starts empty
    }
    return log;
  }
}
