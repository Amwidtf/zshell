import {NativeModules} from 'react-native';
import {parseLatestRelease, ReleaseInfo} from '@zshell/core-shell';

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
  downloadAndInstall(url: string): Promise<void>;
}

/**
 * Download the release APK with the system DownloadManager (progress shows
 * in the system notification) and hand it to the system installer when done.
 */
export async function downloadAndInstallApk(release: ReleaseInfo): Promise<void> {
  const installer = NativeModules.ApkInstaller as
    | ApkInstallerNativeModule
    | undefined;
  if (installer == null) {
    throw new Error('更新模块不可用');
  }
  await installer.downloadAndInstall(release.apkUrl);
}
