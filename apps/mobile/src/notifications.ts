import {NativeModules} from 'react-native';
import {isPrerelease, STORAGE_KEYS} from '@zshell/core-shell';
import {secureStore} from './storage';
import {APP_VERSION} from './version';

interface ZShellNotificationsModule {
  areEnabled(): Promise<boolean>;
  notify(id: number, title: string, body: string): void;
}

/** Native local-notification module (registered in ApkInstallerPackage). */
export const notifications =
  NativeModules.ZShellNotifications as ZShellNotificationsModule | undefined;

export type UpdateChannel = 'stable' | 'beta';

export interface QuietHours {
  enabled: boolean;
  /** "HH:MM" local time. */
  start: string;
  end: string;
}

export interface AppPrefs {
  /** Status notifications (disconnect / kicked / approval waiting). */
  notificationsEnabled: boolean;
  /** Silent update check on app launch. */
  autoCheckUpdates: boolean;
  /** Update channel: stable follows releases/latest, beta also sees pre-releases. */
  updateChannel: UpdateChannel;
  /** Quiet hours: informational notifications are muted inside the window. */
  quietHours: QuietHours;
  /**
   * Keep web login state (console cookies) across restarts. When off, web
   * session data is wiped when leaving the console and on app start, so every
   * session requires signing in again.
   */
  cacheWebLogin: boolean;
}

const DEFAULT_QUIET: QuietHours = {enabled: false, start: '22:00', end: '08:00'};

/**
 * Pre-release builds default to the beta channel so testers keep receiving
 * updates; stable installs stay on stable until the user opts in.
 */
function defaultChannel(): UpdateChannel {
  return isPrerelease(APP_VERSION) ? 'beta' : 'stable';
}

function defaults(): AppPrefs {
  return {
    notificationsEnabled: true,
    autoCheckUpdates: true,
    updateChannel: defaultChannel(),
    quietHours: {...DEFAULT_QUIET},
    cacheWebLogin: true,
  };
}

function parseQuietHours(raw: unknown): QuietHours {
  if (raw == null || typeof raw !== 'object') {
    return {...DEFAULT_QUIET};
  }
  const q = raw as Partial<QuietHours>;
  return {
    enabled: q.enabled === true,
    start: typeof q.start === 'string' ? q.start : DEFAULT_QUIET.start,
    end: typeof q.end === 'string' ? q.end : DEFAULT_QUIET.end,
  };
}

export function loadPrefs(): AppPrefs {
  const raw = secureStore.getString(STORAGE_KEYS.prefs);
  if (raw == null) {
    return defaults();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AppPrefs>;
    const base = defaults();
    return {
      notificationsEnabled:
        typeof parsed.notificationsEnabled === 'boolean'
          ? parsed.notificationsEnabled
          : base.notificationsEnabled,
      autoCheckUpdates:
        typeof parsed.autoCheckUpdates === 'boolean'
          ? parsed.autoCheckUpdates
          : base.autoCheckUpdates,
      updateChannel:
        parsed.updateChannel === 'stable' || parsed.updateChannel === 'beta'
          ? parsed.updateChannel
          : base.updateChannel,
      quietHours: parseQuietHours(parsed.quietHours),
      cacheWebLogin:
        typeof parsed.cacheWebLogin === 'boolean'
          ? parsed.cacheWebLogin
          : base.cacheWebLogin,
    };
  } catch {
    return defaults();
  }
}

export function savePrefs(prefs: AppPrefs): void {
  secureStore.set(STORAGE_KEYS.prefs, JSON.stringify(prefs));
}
