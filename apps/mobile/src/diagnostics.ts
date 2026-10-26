import {DiagnosticsLog} from '@zshell/core-shell';
import {MMKVLoader} from 'react-native-mmkv-storage';

/**
 * Local-only diagnostics timeline. Plain (non-credential) MMKV instance is
 * enough: events carry no secrets, and the log is user-exportable by design.
 */
const store = new MMKVLoader()
  .withInstanceID('zshellDiag')
  .initialize();

const KEY = 'timeline';

let log: DiagnosticsLog | null = null;

export function diag(): DiagnosticsLog {
  if (log == null) {
    log = DiagnosticsLog.fromJSON(store.getString(KEY) as string | null);
  }
  return log;
}

export function logDiag(type: string, detail?: string): void {
  diag().push(type, detail);
  store.setString(KEY, diag().toJSON());
}

export function clearDiag(): void {
  diag().clear();
  store.setString(KEY, diag().toJSON());
}

/** Serialized size of the persisted timeline, in bytes (for 数据管理). */
export function diagSize(): number {
  return (store.getString(KEY) as string | null)?.length ?? 0;
}
