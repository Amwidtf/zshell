import {MMKVLoader} from 'react-native-mmkv-storage';
import {
  deserializeLockConfig,
  disabledConfig,
  LockConfig,
  MachineRegistry,
  SecureKvStore,
  serializeLockConfig,
  STORAGE_KEYS,
} from '@zshell/core-shell';

/**
 * Encrypted MMKV instance. `.withEncryption()` makes MMKV generate a random
 * AES key and store it in the Android Keystore (API 23+) / iOS Keychain —
 * machine credentials and lock verifiers never exist in plaintext at rest.
 */
const mmkv = new MMKVLoader()
  .withInstanceID('zshellSecure')
  .withEncryption()
  .initialize();

export const secureStore: SecureKvStore = {
  getString: (key: string): string | null =>
    (mmkv.getString(key) as string | null) ?? null,
  set: (key: string, value: string): void => {
    mmkv.setString(key, value);
  },
  remove: (key: string): void => {
    mmkv.remove(key);
  },
};

export function loadRegistry(): MachineRegistry {
  return (
    MachineRegistry.fromJSON(secureStore.getString(STORAGE_KEYS.machines)) ??
    new MachineRegistry()
  );
}

export function saveRegistry(registry: MachineRegistry): void {
  secureStore.set(STORAGE_KEYS.machines, JSON.stringify(registry.toJSON()));
}

export function loadLockConfig(): LockConfig {
  return (
    deserializeLockConfig(secureStore.getString(STORAGE_KEYS.lock)) ??
    disabledConfig()
  );
}

export function saveLockConfig(config: LockConfig): void {
  secureStore.set(STORAGE_KEYS.lock, serializeLockConfig(config));
}
