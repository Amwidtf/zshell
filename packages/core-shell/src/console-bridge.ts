/**
 * Bridge events from the injected WS-observer patch (patch-bundle P-2)
 * into a shell-level connection status. The official page owns the relay
 * WebSocket; we only passively observe it.
 */

export type ConsoleEventType =
  | 'ws-open'
  | 'ws-connected'
  | 'ws-closed'
  | 'ws-error'
  | 'pair-status'
  | 'kicked'
  | 'approval-waiting'
  | 'network-online'
  | 'network-offline';

export interface ConsoleEvent {
  source: 'zshell';
  type: ConsoleEventType;
  detail: Record<string, unknown> | null;
}

/** Console connection status shown in the app's status strip. */
export type ConsoleStatus =
  | 'connecting'
  | 'connected'
  | 'waiting'
  | 'disconnected'
  | 'kicked';

const EVENT_TYPES: ReadonlySet<string> = new Set<ConsoleEventType>([
  'ws-open',
  'ws-connected',
  'ws-closed',
  'ws-error',
  'pair-status',
  'kicked',
  'approval-waiting',
  'network-online',
  'network-offline',
]);

/** Parse a WebView postMessage payload; null for anything not ours. */
export function parseConsoleEvent(raw: string): ConsoleEvent | null {
  if (raw == null || raw.length === 0 || raw.length > 512 * 1024) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ConsoleEvent>;
    if (
      parsed == null ||
      parsed.source !== 'zshell' ||
      typeof parsed.type !== 'string' ||
      !EVENT_TYPES.has(parsed.type)
    ) {
      return null;
    }
    const detail =
      parsed.detail != null && typeof parsed.detail === 'object'
        ? (parsed.detail as Record<string, unknown>)
        : null;
    return {source: 'zshell', type: parsed.type as ConsoleEventType, detail};
  } catch {
    return null;
  }
}

/**
 * Derive the next status from an event. Terminal failure (`kicked`) sticks
 * until the user reconnects; everything else follows the observed lifecycle.
 */
export function deriveConsoleStatus(
  current: ConsoleStatus,
  event: ConsoleEvent,
): ConsoleStatus {
  switch (event.type) {
    case 'ws-connected':
      return 'connected';
    case 'pair-status': {
      const status = event.detail?.status;
      if (status === 'matched') {
        return 'connected';
      }
      if (status === 'waiting') {
        return 'waiting';
      }
      return current;
    }
    case 'kicked':
      return 'kicked';
    case 'ws-closed':
      return current === 'kicked' ? 'kicked' : 'disconnected';
    case 'ws-error':
    case 'ws-open':
      return current === 'kicked' ? 'kicked' : 'connecting';
    case 'network-offline':
      return current === 'kicked' ? 'kicked' : 'disconnected';
    case 'network-online':
      return current === 'kicked' ? 'kicked' : 'connecting';
    default:
      // approval-waiting carries no status change
      return current;
  }
}
