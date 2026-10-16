import {hostLabel, PairingCredentials, parsePairingUrl, ParseFailureReason} from './pairing-url';

/**
 * A saved remote machine (paired desktop endpoint). The whole registry is
 * persisted as one JSON blob inside encrypted storage — credentials never
 * touch plain preferences.
 */
/**
 * Observed web-login state for a machine (Kimi Code account pages only;
 * absent = unknown / not applicable, e.g. ZCode hash pairing).
 */
export type MachineLoginState = 'logged-in' | 'logged-out';

export interface MachineRecord {
  id: string;
  /** User-defined display name (defaults to the QR's device name or origin host). */
  name: string;
  credentials: PairingCredentials;
  favorite: boolean;
  /** Manual order within its group (favorites / non-favorites). Smaller first. */
  sortOrder: number;
  createdAt: number;
  lastUsedAt: number | null;
  /** Per-machine notification mute (older backups may lack this field). */
  muted?: boolean;
  /** Last observed console login state (see MachineLoginState). */
  loginState?: MachineLoginState;
  /** When loginState was last observed (ms). */
  loginAt?: number | null;
}

export interface MachineRegistryData {
  version: 1;
  machines: MachineRecord[];
  nextSortOrder: number;
  nextId: number;
}

export type AddResult =
  | {ok: true; record: MachineRecord; updatedExisting: boolean}
  | {ok: false; reason: ParseFailureReason};

export interface MachineRegistryOptions {
  now?: () => number;
}

function defaultName(creds: PairingCredentials): string {
  if (creds.kind === 'kimi') {
    // Kimi links carry no device name — label the product source plus an
    // id prefix so multiple devices of one account stay distinguishable.
    return `${hostLabel(creds)} ${creds.sid.slice(0, 8)}`;
  }
  if (creds.deviceName != null && creds.deviceName.length > 0) {
    return creds.deviceName;
  }
  try {
    return new URL(creds.origin).host;
  } catch {
    return creds.origin;
  }
}

export class MachineRegistry {
  private data: MachineRegistryData;
  private readonly now: () => number;

  constructor(data?: MachineRegistryData | null, opts: MachineRegistryOptions = {}) {
    this.data = data ?? {version: 1, machines: [], nextSortOrder: 1, nextId: 1};
    this.now = opts.now ?? Date.now;
  }

  toJSON(): MachineRegistryData {
    return {
      version: 1,
      machines: this.data.machines.map(m => ({...m})),
      nextSortOrder: this.data.nextSortOrder,
      nextId: this.data.nextId,
    };
  }

  static fromJSON(raw: string | null): MachineRegistry | null {
    if (raw == null || raw.length === 0) {
      return new MachineRegistry();
    }
    try {
      const parsed = JSON.parse(raw) as MachineRegistryData;
      if (parsed.version !== 1 || !Array.isArray(parsed.machines)) {
        return null;
      }
      return new MachineRegistry(parsed);
    } catch {
      return null;
    }
  }

  /**
   * Add (or refresh) a machine from a pairing URL. Dedupe key is sid+origin:
   * re-pairing the same desktop keeps name/favorite/order and only rotates
   * the credential material (desktop `rotate()` changes the hash).
   */
  addFromUrl(url: string): AddResult {
    const parsed = parsePairingUrl(url);
    if (!parsed.ok) {
      return {ok: false, reason: parsed.reason};
    }
    const creds = parsed.credentials;
    const existing = this.data.machines.find(
      m =>
        m.credentials.sid === creds.sid &&
        m.credentials.origin === creds.origin,
    );
    if (existing != null) {
      existing.credentials = creds;
      existing.lastUsedAt = this.now();
      return {ok: true, record: {...existing}, updatedExisting: true};
    }
    const record: MachineRecord = {
      id: `m${this.data.nextId}`,
      name: defaultName(creds),
      credentials: creds,
      favorite: false,
      sortOrder: this.data.nextSortOrder++,
      createdAt: this.now(),
      lastUsedAt: this.now(),
    };
    this.data.nextId++;
    this.data.machines.push(record);
    return {ok: true, record: {...record}, updatedExisting: false};
  }

  get(id: string): MachineRecord | null {
    const m = this.data.machines.find(x => x.id === id);
    return m == null ? null : {...m};
  }

  rename(id: string, name: string): boolean {
    const m = this.data.machines.find(x => x.id === id);
    if (m == null) {
      return false;
    }
    const trimmed = name.trim();
    m.name = trimmed.length > 0 ? trimmed : m.name;
    return true;
  }

  toggleFavorite(id: string): boolean {
    const m = this.data.machines.find(x => x.id === id);
    if (m == null) {
      return false;
    }
    m.favorite = !m.favorite;
    return true;
  }

  /** Mute/unmute status notifications for one machine. */
  setMuted(id: string, muted: boolean): boolean {
    const m = this.data.machines.find(x => x.id === id);
    if (m == null) {
      return false;
    }
    m.muted = muted;
    return true;
  }

  /** Record the last observed web-login state (Kimi Code machines). */
  setLoginState(id: string, state: MachineLoginState): boolean {
    const m = this.data.machines.find(x => x.id === id);
    if (m == null) {
      return false;
    }
    m.loginState = state;
    m.loginAt = this.now();
    return true;
  }

  /** Move a machine up (-1) or down (+1) within its favorite group. */
  move(id: string, direction: -1 | 1): boolean {
    const target = this.data.machines.find(x => x.id === id);
    if (target == null) {
      return false;
    }
    const group = this.sorted().filter(m => m.favorite === target.favorite);
    const idx = group.findIndex(m => m.id === id);
    const swapWith = group[idx + direction];
    if (swapWith == null) {
      return false;
    }
    const a = this.data.machines.find(x => x.id === id)!;
    const b = this.data.machines.find(x => x.id === swapWith.id)!;
    const tmp = a.sortOrder;
    a.sortOrder = b.sortOrder;
    b.sortOrder = tmp;
    return true;
  }

  touch(id: string): void {
    const m = this.data.machines.find(x => x.id === id);
    if (m != null) {
      m.lastUsedAt = this.now();
    }
  }

  remove(id: string): boolean {
    const before = this.data.machines.length;
    this.data.machines = this.data.machines.filter(m => m.id !== id);
    return this.data.machines.length < before;
  }

  /**
   * Merge machines from a decrypted backup. Match key is sid+origin: an
   * existing machine keeps its local name/favorite/order and only gets its
   * credentials refreshed; unknown machines are appended with fresh ids.
   */
  importMachines(records: unknown): {added: number; updated: number} {
    const result = {added: 0, updated: 0};
    if (!Array.isArray(records)) {
      return result;
    }
    for (const r of records) {
      if (r == null || typeof r !== 'object') {
        continue;
      }
      const rec = r as Partial<MachineRecord>;
      const creds = rec.credentials;
      if (
        typeof rec.name !== 'string' ||
        creds == null ||
        typeof creds.sid !== 'string' ||
        typeof creds.hash !== 'string' ||
        typeof creds.origin !== 'string' ||
        (creds.kind !== undefined && creds.kind !== 'zcode' && creds.kind !== 'kimi')
      ) {
        continue;
      }
      const sanitized: PairingCredentials = {
        ...creds,
        source: typeof creds.source === 'string' ? creds.source : null,
        extraQuery: typeof creds.extraQuery === 'string' ? creds.extraQuery : null,
      };
      const loginState: MachineLoginState | undefined =
        rec.loginState === 'logged-in' || rec.loginState === 'logged-out'
          ? rec.loginState
          : undefined;
      const existing = this.data.machines.find(
        m => m.credentials.sid === creds.sid && m.credentials.origin === creds.origin,
      );
      if (existing != null) {
        existing.credentials = sanitized;
        result.updated++;
        continue;
      }
      this.data.machines.push({
        id: `m${this.data.nextId++}`,
        name: rec.name,
        credentials: sanitized,
        favorite: rec.favorite === true,
        sortOrder: this.data.nextSortOrder++,
        createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : this.now(),
        lastUsedAt: null,
        muted: rec.muted === true,
        ...(loginState != null
          ? {loginState, loginAt: typeof rec.loginAt === 'number' ? rec.loginAt : null}
          : {}),
      });
      result.added++;
    }
    return result;
  }

  /** Display order: favorites first, then manual sortOrder ascending. */
  sorted(): MachineRecord[] {
    return [...this.data.machines]
      .sort((a, b) => {
        if (a.favorite !== b.favorite) {
          return a.favorite ? -1 : 1;
        }
        return a.sortOrder - b.sortOrder;
      })
      .map(m => ({...m}));
  }

  get size(): number {
    return this.data.machines.length;
  }
}
