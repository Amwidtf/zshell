import {NativeModules} from 'react-native';

interface ZShellPrivacyWindowModule {
  getRecentsMaskEnabled(): Promise<boolean>;
  setRecentsMaskEnabled(enabled: boolean): void;
}

/**
 * Native bridge for the recents/task-switcher mask (registered in
 * ApkInstallerPackage; the mechanism lives in MainActivity.applyWindowPrivacy).
 * The value is owned by native SharedPreferences so it applies from the very
 * first frame of a cold start, before JS loads.
 */
export const privacyWindow =
  NativeModules.ZShellPrivacyWindow as ZShellPrivacyWindowModule | undefined;
