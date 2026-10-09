/**
 * Platform ports. core-shell stays framework-free; the app supplies these
 * adapters (Android/iOS via RN libraries today, HarmonyOS via ArkTS APIs or
 * RNOH adapters later).
 */

/** Encrypted key-value strings (MMKV with encryption, Keystore-backed key). */
export interface SecureKvStore {
  getString(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Device biometric prompt (fingerprint / face). */
export interface BiometricAuth {
  isAvailable(): Promise<{available: boolean; type?: string}>;
  /** Resolves true when the user passed the system prompt. */
  prompt(message: string): Promise<boolean>;
}

export const STORAGE_KEYS = {
  machines: 'zshell.machines.v1',
  lock: 'zshell.lock.v1',
  legal: 'zshell.legal.v1',
  prefs: 'zshell.prefs.v1',
} as const;

/** First-launch legal consent record (privacy policy / user agreement). */
export interface LegalConsent {
  version: number;
  agreedAt: number;
}
