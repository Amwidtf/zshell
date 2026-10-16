import {Platform} from 'react-native';
import {
  parseLatestRelease,
  pickLatestRelease,
  preferredAbiTags,
  ReleaseInfo,
} from '@zshell/core-shell';

const RELEASES_LATEST =
  'https://api.github.com/repos/Amwidtf/zshell/releases/latest';
const RELEASES_LIST =
  'https://api.github.com/repos/Amwidtf/zshell/releases?per_page=15';

export const PROJECT_PAGE = 'https://github.com/Amwidtf/zshell';

export type UpdateChannel = 'stable' | 'beta';

/**
 * APK asset preference for THIS device, from its real ABI list. Translation
 * environments (emulators/containers listing arm64 + x86) must take the
 * universal APK — a split-ABI pick there can mismatch the installed primary
 * ABI and crash the app at startup.
 */
const androidConstants = Platform.constants as {SupportedAbis?: string[]} | undefined;
const UPDATE_ABI_TAGS = preferredAbiTags(androidConstants?.SupportedAbis ?? []);

async function getJson(url: string): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: {Accept: 'application/vnd.github+json'},
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Latest usable release for a channel. Stable reads `releases/latest`
 * (GitHub excludes pre-releases there); beta reads the release list, which
 * includes them, and picks the highest version.
 */
export async function fetchLatestRelease(
  channel: UpdateChannel = 'stable',
): Promise<ReleaseInfo | null> {
  if (channel === 'beta') {
    return pickLatestRelease(await getJson(RELEASES_LIST), UPDATE_ABI_TAGS);
  }
  return parseLatestRelease(await getJson(RELEASES_LATEST), UPDATE_ABI_TAGS);
}
