import {NativeModules} from 'react-native';
import {
  compareVersions,
  parseLatestRelease,
  ReleaseInfo,
} from '@zshell/core-shell';
import {APP_VERSION} from './version';

const RELEASES_LATEST =
  'https://api.github.com/repos/Amwidtf/zshell/releases/latest';

export const PROJECT_PAGE = 'https://github.com/Amwidtf/zshell';

/** Fetch the latest release from GitHub; null on any failure. */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(RELEASES_LATEST, {
      headers: {Accept: 'application/vnd.github+json'},
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return null;
    }
    return parseLatestRelease(await res.json());
  } catch {
    return null;
  }
}

interface ApkInstallerNativeModule {
  downloadAndInstall(url: string, version: string): Promise<void>;
  listUpdateApks(): Promise<string[]>;
  deleteUpdateApk(name: string): void;
}

function installer(): ApkInstallerNativeModule {
  const module = NativeModules.ApkInstaller as
    | ApkInstallerNativeModule
    | undefined;
  if (module == null) {
    throw new Error('更新模块不可用');
  }
  return module;
}

/**
 * Download the release APK with the system DownloadManager (progress shows
 * in the system notification) and hand it to the system installer when done.
 */
export async function downloadAndInstallApk(release: ReleaseInfo): Promise<void> {
  await installer().downloadAndInstall(release.apkUrl, release.version);
}

/**
 * Remove update APKs left on disk once they are no longer newer than the
 * running version (i.e. the update was installed). Anything newer is kept —
 * it may be a pending install the user has not confirmed yet.
 */
export async function cleanupInstalledApks(): Promise<void> {
  try {
    const names = await installer().listUpdateApks();
    for (const name of names) {
      const version = name.replace(/^zshell-update-/, '').replace(/\.apk$/, '');
      if (compareVersions(version, APP_VERSION) <= 0) {
        installer().deleteUpdateApk(name);
      }
    }
  } catch {
    // best-effort cleanup
  }
}
