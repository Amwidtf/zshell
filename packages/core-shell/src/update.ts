/**
 * Update checking against GitHub Releases (public repo, no server needed).
 * Pure logic: version comparison + release JSON parsing. The app layer does
 * the network fetch and hands the parsed JSON here.
 */

export interface ReleaseInfo {
  /** Version without the leading "v", e.g. "0.0.1-alpha.3". */
  version: string;
  tag: string;
  notes: string;
  apkUrl: string;
  apkSize: number | null;
  publishedAt: string | null;
}

interface AssetLike {
  name?: unknown;
  browser_download_url?: unknown;
  size?: unknown;
}

interface ReleaseLike {
  tag_name?: unknown;
  body?: unknown;
  published_at?: unknown;
  assets?: unknown;
}

/**
 * Compare dotted versions with an optional pre-release suffix
 * ("-alpha.N" / "-beta.N" / "-rc.N"). Returns >0 when a is newer,
 * <0 when b is newer, 0 when equal.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const clean = v.trim().replace(/^v/i, '');
    const [coreRaw, preRaw] = clean.split('-');
    const core = coreRaw.split('.').map(p => {
      const n = /^\d+$/.test(p) ? Number(p) : 0;
      return n;
    });
    while (core.length < 3) {
      core.push(0);
    }
    const preMatch = preRaw != null ? /^([a-z]+)\.(\d+)$/i.exec(preRaw) : null;
    const pre = preMatch
      ? {name: preMatch[1].toLowerCase(), num: Number(preMatch[2])}
      : null;
    return {core, pre};
  };
  const va = parse(a);
  const vb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (va.core[i] !== vb.core[i]) {
      return va.core[i] - vb.core[i];
    }
  }
  // No pre-release beats any pre-release.
  if (va.pre == null && vb.pre == null) {
    return 0;
  }
  if (va.pre == null) {
    return 1;
  }
  if (vb.pre == null) {
    return -1;
  }
  const rank = (name: string) => (name === 'alpha' ? 0 : name === 'beta' ? 1 : 2);
  if (rank(va.pre.name) !== rank(vb.pre.name)) {
    return rank(va.pre.name) - rank(vb.pre.name);
  }
  return va.pre.num - vb.pre.num;
}

export function isNewer(current: string, release: ReleaseInfo): boolean {
  return compareVersions(release.version, current) > 0;
}

/**
 * Pick the best APK asset for a phone: arm64-v8a build when present, else the
 * universal APK, else any APK (ABI split releases upload several files).
 */
function pickApkAsset(assets: AssetLike[]): AssetLike | null {
  const apks = assets.filter(
    a =>
      typeof a.name === 'string' &&
      (a.name as string).endsWith('.apk') &&
      typeof a.browser_download_url === 'string',
  );
  if (apks.length === 0) {
    return null;
  }
  return (
    apks.find(a => (a.name as string).includes('arm64-v8a')) ??
    apks.find(a => (a.name as string).includes('universal')) ??
    apks[0]
  );
}

/** Extract update info from a GitHub `releases/latest` response; null when unusable. */
export function parseLatestRelease(json: unknown): ReleaseInfo | null {
  if (json == null || typeof json !== 'object') {
    return null;
  }
  const rel = json as ReleaseLike;
  if (typeof rel.tag_name !== 'string' || rel.tag_name.length === 0) {
    return null;
  }
  const assets = Array.isArray(rel.assets) ? (rel.assets as AssetLike[]) : [];
  const apk = pickApkAsset(assets);
  if (apk == null) {
    return null;
  }
  return {
    version: rel.tag_name.replace(/^v/i, ''),
    tag: rel.tag_name,
    notes: typeof rel.body === 'string' ? rel.body : '',
    apkUrl: apk.browser_download_url,
    apkSize: typeof apk.size === 'number' ? apk.size : null,
    publishedAt: typeof rel.published_at === 'string' ? rel.published_at : null,
  };
}

/**
 * Pick the newest usable release from a GitHub `GET /releases` list.
 * Needed because pre-release-marked versions are excluded from
 * `releases/latest` — the list endpoint includes them.
 */
export function pickLatestRelease(json: unknown): ReleaseInfo | null {
  if (!Array.isArray(json)) {
    return null;
  }
  let best: ReleaseInfo | null = null;
  for (const item of json) {
    const info = parseLatestRelease(item);
    if (info == null) {
      continue;
    }
    if (best == null || compareVersions(info.version, best.version) > 0) {
      best = info;
    }
  }
  return best;
}
