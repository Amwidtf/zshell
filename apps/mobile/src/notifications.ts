import {NativeModules} from 'react-native';
import {STORAGE_KEYS} from '@zshell/core-shell';
import {secureStore} from './storage';

interface ZShellNotificationsModule {
  areEnabled(): Promise<boolean>;
  notify(id: number, title: string, body: string): void;
}

/** Native local-notification module (registered in ApkInstallerPackage). */
export const notifications =
  NativeModules.ZShellNotifications as ZShellNotificationsModule | undefined;

export interface AppPrefs {
  /** Status notifications (disconnect / kicked / approval waiting). */
  notificationsEnabled: boolean;
  /** Silent update check on app launch. */
  autoCheckUpdates: boolean;
}

const DEFAULT_PREFS: AppPrefs = {
  notificationsEnabled: true,
  autoCheckUpdates: true,
};

export function loadPrefs(): AppPrefs {
  const raw = secureStore.getString(STORAGE_KEYS.prefs);
  if (raw == null) {
    return {...DEFAULT_PREFS};
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AppPrefs>;
    return {
      notificationsEnabled:
        typeof parsed.notificationsEnabled === 'boolean'
          ? parsed.notificationsEnabled
          : DEFAULT_PREFS.notificationsEnabled,
      autoCheckUpdates:
        typeof parsed.autoCheckUpdates === 'boolean'
          ? parsed.autoCheckUpdates
          : DEFAULT_PREFS.autoCheckUpdates,
    };
  } catch {
    return {...DEFAULT_PREFS};
  }
}

export function savePrefs(prefs: AppPrefs): void {
  secureStore.set(STORAGE_KEYS.prefs, JSON.stringify(prefs));
}
