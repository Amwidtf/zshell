import {NativeModules} from 'react-native';
import {compareVersions, ReleaseInfo} from '@zshell/core-shell';
import {APP_VERSION} from './version';

export type DownloadStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'successful'
  | 'failed';

export interface DownloadItem {
  id: number;
  /** File name (our downloads) or download title (console downloads). */
  name: string;
  kind: 'update' | 'file';
  /** Original URL — only known for downloads we enqueued ourselves. */
  url: string;
  status: DownloadStatus;
  bytesSoFar: number;
  totalBytes: number;
  /** Translated failure reason, present only when status is 'failed'. */
  reason?: string;
}

interface DownloadsNativeModule {
  download(url: string, fileName: string, kind: string): Promise<number>;
  queryDownloads(): Promise<DownloadItem[]>;
  removeDownload(id: number): Promise<void>;
  openDownloadedFile(id: number): Promise<void>;
  listUpdateApks(): Promise<string[]>;
  deleteUpdateApk(name: string): void;
  openUrlInBrowser(url: string): Promise<void>;
}

function module(): DownloadsNativeModule {
  const m = NativeModules.ApkInstaller as DownloadsNativeModule | undefined;
  if (m == null) {
    throw new Error('下载模块不可用');
  }
  return m;
}

/** Enqueue an update APK download; resolves the system download id. */
export async function startUpdateDownload(release: ReleaseInfo): Promise<number> {
  return module().download(
    release.apkUrl,
    `zshell-update-${release.version}.apk`,
    'update',
  );
}

/** Re-enqueue a failed download we still know the URL of. */
export function retryDownload(item: DownloadItem): Promise<number> {
  return module().download(item.url, item.name, item.kind);
}

export function queryDownloads(): Promise<DownloadItem[]> {
  return module().queryDownloads();
}

export function removeDownload(id: number): Promise<void> {
  return module().removeDownload(id);
}

export function openDownloadedFile(id: number): Promise<void> {
  return module().openDownloadedFile(id);
}

export function isActive(status: DownloadStatus): boolean {
  return status === 'pending' || status === 'running' || status === 'paused';
}

/**
 * Open a URL in a real browser (native BROWSABLE intent). Avoids the
 * "open with GitHub app" chooser that plain Linking can show.
 */
export async function openInBrowser(url: string): Promise<void> {
  await module().openUrlInBrowser(url);
}

/**
 * Remove update APKs left on disk once they are no longer newer than the
 * running version (i.e. the update was installed). Anything newer is kept —
 * it may be a pending install the user has not confirmed yet.
 */
export async function cleanupInstalledApks(): Promise<void> {
  try {
    const names = await module().listUpdateApks();
    for (const name of names) {
      const version = name.replace(/^zshell-update-/, '').replace(/\.apk$/, '');
      if (compareVersions(version, APP_VERSION) <= 0) {
        module().deleteUpdateApk(name);
      }
    }
  } catch {
    // best-effort cleanup
  }
}
