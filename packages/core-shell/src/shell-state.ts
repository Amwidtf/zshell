/**
 * Shell-level connection state machine.
 *
 * In the shell route the relay connection lives INSIDE the official web page;
 * the shell only observes page-level signals and maps them to these states.
 * Terminal-side error semantics: KICKED (another terminal took over),
 * AUTH_FAILED/WRONG_PARAM (credentials rotated or invalid), DEVICE_OFFLINE
 * (desktop heartbeats lost).
 */
export type ShellState =
  | 'unpaired'
  | 'pairing'
  | 'paired'
  | 'waiting'
  | 'kicked'
  | 'auth-failed';

export type ShellEvent =
  | 'SCAN_STARTED'
  | 'SCAN_CANCELLED'
  | 'PAIRED'
  | 'DESKTOP_OFFLINE'
  | 'DESKTOP_BACK'
  | 'KICKED'
  | 'AUTH_FAILED'
  | 'UNPAIRED'
  | 'RESCAN';

const TRANSITIONS: Record<ShellState, Partial<Record<ShellEvent, ShellState>>> = {
  unpaired: {SCAN_STARTED: 'pairing'},
  pairing: {
    PAIRED: 'paired',
    AUTH_FAILED: 'auth-failed',
    SCAN_CANCELLED: 'unpaired',
    UNPAIRED: 'unpaired',
  },
  paired: {
    DESKTOP_OFFLINE: 'waiting',
    KICKED: 'kicked',
    AUTH_FAILED: 'auth-failed',
    UNPAIRED: 'unpaired',
  },
  waiting: {
    DESKTOP_BACK: 'paired',
    PAIRED: 'paired',
    KICKED: 'kicked',
    AUTH_FAILED: 'auth-failed',
    UNPAIRED: 'unpaired',
  },
  kicked: {
    RESCAN: 'pairing',
    UNPAIRED: 'unpaired',
  },
  'auth-failed': {
    RESCAN: 'pairing',
    UNPAIRED: 'unpaired',
  },
};

/**
 * Apply an event. Returns the next state, or null when the event is not valid
 * in the current state (callers should ignore-and-count rather than crash —
 * page-derived signals can arrive out of order).
 */
export function transition(state: ShellState, event: ShellEvent): ShellState | null {
  const next = TRANSITIONS[state][event];
  return next ?? null;
}

export function initialState(): ShellState {
  return 'unpaired';
}
