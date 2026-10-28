/**
 * ZShell — remote-control mobile shell for ZCode / Kimi Code desktops.
 * @format
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AppState, BackHandler, StyleSheet, StatusBar, View} from 'react-native';
import {
  disabledConfig,
  isNewer,
  LockConfig,
  MachineRecord,
  MachineRegistry,
} from '@zshell/core-shell';
import {ConsoleScreen} from './src/screens/ConsoleScreen';
import {ConsentGate} from './src/screens/ConsentGate';
import {DataManageScreen} from './src/screens/DataManageScreen';
import {DiagnosticsScreen} from './src/screens/DiagnosticsScreen';
import {DownloadsScreen} from './src/screens/DownloadsScreen';
import {LockScreen} from './src/screens/LockScreen';
import {MachineListScreen} from './src/screens/MachineListScreen';
import {ManualInputScreen} from './src/screens/ManualInputScreen';
import {PermissionsScreen} from './src/screens/PermissionsScreen';
import {ScanScreen} from './src/screens/ScanScreen';
import {SettingsScreen} from './src/screens/SettingsScreen';
import {loadLegalConsent, loadLockConfig, loadRegistry, saveLegalConsent, saveLockConfig, saveRegistry} from './src/storage';
import {LEGAL_DOC_VERSION} from './src/legal';
import {loadPrefs, notifications} from './src/notifications';
import {cleanupInstalledApks, clearWebSession} from './src/downloads';
import {fetchLatestRelease} from './src/updater';
import {APP_VERSION} from './src/version';

type Screen =
  | {name: 'list'}
  | {name: 'scan'}
  | {name: 'manual'}
  | {name: 'settings'}
  | {name: 'permissions'}
  | {name: 'downloads'}
  | {name: 'datamanage'}
  | {name: 'diagnostics'}
  | {name: 'console'; machineId: string};

function App(): React.JSX.Element {
  const [booting, setBooting] = useState(true);
  const [consented, setConsented] = useState(true);
  const [lock, setLock] = useState(disabledConfig());
  const [unlocked, setUnlocked] = useState(true);
  const [stack, setStack] = useState<Screen[]>([{name: 'list'}]);
  const [machines, setMachines] = useState<MachineRecord[]>([]);
  const registryRef = useRef<MachineRegistry | null>(null);
  // Set by the console screen: prefers the web page's own history on back.
  const webBackRef = useRef<(() => boolean) | null>(null);
  const registerConsoleBack = useCallback((fn: (() => boolean) | null) => {
    webBackRef.current = fn;
  }, []);
  // Console keep-alive: consoles stay mounted per machine (LRU, capped) while
  // the user moves around the app; only process death, machine deletion or a
  // web-login sign-out tears a session down. Back-from-console hides it;
  // re-entering shows the same live WebView — no reload, no re-handshake.
  const MAX_CONSOLE_SESSIONS = 3;
  const [consoleSessions, setConsoleSessions] = useState<string[]>([]);
  const removeConsoleSession = useCallback(
    (id: string) => setConsoleSessions(ss => ss.filter(s => s !== id)),
    [],
  );
  const clearConsoleSessions = useCallback(() => setConsoleSessions([]), []);
  // Hidden consoles must not touch the shared back-handler slot.
  const noopRegister = useCallback((_fn: (() => boolean) | null) => {}, []);
  // Records handed to the mounted consoles. Memoized so registry.get's
  // per-call copy does not churn props (and the WebView source) on every
  // unrelated re-render; refreshes only when the registry itself changes.
  const sessionRecords = useMemo(() => {
    const out: Record<string, MachineRecord> = {};
    const registry = registryRef.current;
    if (registry != null) {
      for (const id of consoleSessions) {
        const m = registry.get(id);
        if (m != null) {
          out[id] = m;
        }
      }
    }
    return out;
  }, [consoleSessions, machines]);

  useEffect(() => {
    registryRef.current = loadRegistry();
    const cfg = loadLockConfig();
    setLock(cfg);
    setUnlocked(!cfg.enabled);
    setMachines(registryRef.current.sorted());
    const consent = loadLegalConsent();
    setConsented(consent != null && consent.version >= LEGAL_DOC_VERSION);
    setBooting(false);
    // 不缓存网页登录：冷启动即清除登录 Cookie，本次会话需重新登录
    if (!loadPrefs().cacheWebLogin) {
      clearWebSession().catch(() => {});
    }
  }, []);

  // Relock whenever the app leaves the foreground while the lock is enabled
  // ('inactive' covers the recents screen / system dialogs on Android).
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if ((state === 'background' || state === 'inactive') && lock.enabled) {
        setUnlocked(false);
      }
    });
    return () => sub.remove();
  }, [lock.enabled]);

  // Silent update check on launch (toggle in Settings → 更新). Best-effort:
  // a local notification when a newer release exists; failures are ignored.
  useEffect(() => {
    if (!consented || !unlocked || booting) {
      return;
    }
    cleanupInstalledApks();
    const prefs = loadPrefs();
    if (!prefs.autoCheckUpdates || notifications == null) {
      return;
    }
    let cancelled = false;
    fetchLatestRelease(loadPrefs().updateChannel)
      .then(release => {
        if (!cancelled && release != null && isNewer(APP_VERSION, release)) {
          notifications.notify(
            5,
            'ZShell 发现新版本',
            `v${release.version} 已发布，到 设置 → 更新 安装`,
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [consented, unlocked, booting]);

  // System back button: inside the console, prefer the page's own history
  // (web back), then pop our screen stack; at the root screen fall through
  // to the default (exit) behavior.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 0 && stack[stack.length - 1].name === 'console') {
        if (webBackRef.current != null && webBackRef.current()) {
          return true;
        }
      }
      if (stack.length > 1) {
        setStack(st => st.slice(0, -1));
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack]);

  const persist = useCallback(() => {
    if (registryRef.current != null) {
      saveRegistry(registryRef.current);
      setMachines(registryRef.current.sorted());
    }
  }, []);

  // 退出 Kimi 账号（网页登录数据是账号级、所有 Kimi 机器共享）：
  // 清空 WebView 登录数据并把每台 Kimi 机器的观测状态置为未登录。
  // 必须声明在下面的早退 return 之前（hook 不得条件执行）。
  const signOutWebLogin = useCallback(() => {
    // 登录数据即将清空，在线控制台全部失效——卸载会话避免僵尸页面
    clearConsoleSessions();
    clearWebSession()
      .then(() => {
        const registry = registryRef.current;
        if (registry == null) {
          return;
        }
        for (const m of registry.sorted()) {
          if (m.credentials.kind === 'kimi') {
            registry.setLoginState(m.id, 'logged-out');
          }
        }
        persist();
      })
      .catch(() => {});
  }, [persist, clearConsoleSessions]);

  const addFromUrl = useCallback(
    (url: string, customName?: string) => {
      const registry = registryRef.current!;
      const result = registry.addFromUrl(url);
      if (result.ok && customName != null && customName.length > 0) {
        registry.rename(result.record.id, customName);
      }
      if (result.ok) {
        persist();
      }
      return result;
    },
    [persist],
  );

  if (booting) {
    return <View style={{flex: 1, backgroundColor: '#161616'}} />;
  }

  // CN app-store compliance: agreement + privacy consent must come first.
  // Consent gate and the app lock render as opaque OVERLAYS (not early
  // returns) so the app tree — including keep-alive console sessions —
  // stays mounted underneath and survives relocking.

  const top = stack[stack.length - 1];
  // Downloads pushed from the console renders as an overlay so the WebView
  // (and its relay session) stays mounted underneath.
  const fromConsole =
    stack.length >= 2 &&
    top.name === 'downloads' &&
    stack[stack.length - 2].name === 'console';
  const base = fromConsole ? stack[stack.length - 2] : top;
  const push = (s: Screen) => setStack(st => [...st, s]);
  const pop = () => setStack(st => (st.length > 1 ? st.slice(0, -1) : st));
  const connectTo = (machineId: string) => {
    registryRef.current?.touch(machineId);
    persist();
    // Move-to-end LRU: the activated console becomes the most recent; the
    // oldest session beyond the cap is evicted (its WebView unmounts = a real
    // disconnect, same as before keep-alive).
    setConsoleSessions(ss => {
      const next = ss.filter(s => s !== machineId);
      next.push(machineId);
      return next.length > MAX_CONSOLE_SESSIONS
        ? next.slice(next.length - MAX_CONSOLE_SESSIONS)
        : next;
    });
    setStack([{name: 'list'}, {name: 'console', machineId}]);
  };

  let screen: React.JSX.Element | null;
  switch (base.name) {
    case 'scan':
      screen = (
        <ScanScreen
          onResult={url => {
            const r = addFromUrl(url);
            return {
              ok: r.ok,
              machineId: r.ok ? r.record.id : undefined,
              reason: r.ok ? undefined : r.reason,
            };
          }}
          onDone={outcome => {
            if (outcome.ok && outcome.machineId != null) {
              connectTo(outcome.machineId);
            }
          }}
        />
      );
      break;
    case 'manual':
      screen = (
        <ManualInputScreen
          onSubmit={(url, name) => {
            const r = addFromUrl(url, name);
            return {
              ok: r.ok,
              machineId: r.ok ? r.record.id : undefined,
              reason: r.ok ? undefined : r.reason,
            };
          }}
          onDone={outcome => {
            if (outcome.ok && outcome.machineId != null) {
              connectTo(outcome.machineId);
            }
          }}
        />
      );
      break;
    case 'settings':
      screen = (
        <SettingsScreen
          lock={lock}
          onSaveLock={(cfg: LockConfig) => {
            saveLockConfig(cfg);
            setLock(cfg);
          }}
          machines={machines}
          onImportMachines={records => {
            const registry = registryRef.current!;
            const result = registry.importMachines(records);
            persist();
            return result;
          }}
          onBack={pop}
          onOpenPermissions={() => push({name: 'permissions'})}
          onOpenDownloads={() => push({name: 'downloads'})}
          onOpenDataManage={() => push({name: 'datamanage'})}
          onOpenDiagnostics={() => push({name: 'diagnostics'})}
        />
      );
      break;
    case 'permissions':
      screen = <PermissionsScreen onBack={pop} />;
      break;
    case 'downloads':
      screen = <DownloadsScreen onBack={pop} />;
      break;
    case 'datamanage':
      screen = <DataManageScreen machines={machines} lock={lock} onBack={pop} />;
      break;
    case 'diagnostics':
      screen = <DiagnosticsScreen onBack={pop} />;
      break;
    case 'console': {
      // The console itself renders from the keep-alive session layer below;
      // this case only guards against a stale stack entry whose machine has
      // vanished (e.g. restored backup) by falling back to the list.
      const machine = registryRef.current?.get(base.machineId) ?? null;
      screen = machine ? null : (
        <MachineListScreen
          machines={machines}
          onConnect={connectTo}
          onScan={() => push({name: 'scan'})}
          onManual={() => push({name: 'manual'})}
          onSettings={() => push({name: 'settings'})}
          onRename={(id, name) => {
            registryRef.current?.rename(id, name);
            persist();
          }}
          onToggleFavorite={id => {
            registryRef.current?.toggleFavorite(id);
            persist();
          }}
          onMove={(id, dir) => {
            registryRef.current?.move(id, dir);
            persist();
          }}
          onSetMuted={(id, muted) => {
            registryRef.current?.setMuted(id, muted);
            persist();
          }}
          onSetTrustSsl={(id, trust) => {
            registryRef.current?.setTrustSelfSigned(id, trust);
            persist();
          }}
          onSetBasicAuth={(id, username, password) => {
            registryRef.current?.setBasicAuth(id, username, password);
            persist();
          }}
          onDelete={id => {
            registryRef.current?.remove(id);
            persist();
            removeConsoleSession(id);
          }}
          onSignOutWebLogin={signOutWebLogin}
        />
      );
      break;
    }
    default:
      screen = (
        <MachineListScreen
          machines={machines}
          onConnect={connectTo}
          onScan={() => push({name: 'scan'})}
          onManual={() => push({name: 'manual'})}
          onSettings={() => push({name: 'settings'})}
          onRename={(id, name) => {
            registryRef.current?.rename(id, name);
            persist();
          }}
          onToggleFavorite={id => {
            registryRef.current?.toggleFavorite(id);
            persist();
          }}
          onMove={(id, dir) => {
            registryRef.current?.move(id, dir);
            persist();
          }}
          onSetMuted={(id, muted) => {
            registryRef.current?.setMuted(id, muted);
            persist();
          }}
          onSetTrustSsl={(id, trust) => {
            registryRef.current?.setTrustSelfSigned(id, trust);
            persist();
          }}
          onSetBasicAuth={(id, username, password) => {
            registryRef.current?.setBasicAuth(id, username, password);
            persist();
          }}
          onDelete={id => {
            registryRef.current?.remove(id);
            persist();
            removeConsoleSession(id);
          }}
          onSignOutWebLogin={signOutWebLogin}
        />
      );
  }

  // The console shown on top of the stack — or the one sitting under the
  // downloads overlay. Only that session's WebView is visible; the others
  // stay mounted but hidden (display:none keeps the native view alive).
  const consoleOnTop =
    top.name === 'console'
      ? top.machineId
      : fromConsole && base.name === 'console'
        ? base.machineId
        : null;

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#161616" />
      <View style={{flex: 1}}>
        {consoleSessions.map(id => {
          const m = sessionRecords[id];
          if (m == null) {
            return null;
          }
          return (
            <View
              key={id}
              style={[
                styles.sessionLayer,
                consoleOnTop === id ? null : styles.sessionHidden,
              ]}>
              <ConsoleScreen
                machine={m}
                onBack={pop}
                registerBackHandler={
                  consoleOnTop === id ? registerConsoleBack : noopRegister
                }
                onOpenDownloads={() => push({name: 'downloads'})}
                onLoginState={state => {
                  if (registryRef.current?.setLoginState(id, state)) {
                    persist();
                  }
                }}
                onSetTrustSsl={trust => {
                  if (registryRef.current?.setTrustSelfSigned(id, trust)) {
                    persist();
                  }
                }}
                onSetBasicAuth={(username, password) => {
                  if (registryRef.current?.setBasicAuth(id, username, password)) {
                    persist();
                  }
                }}
              />
            </View>
          );
        })}
        {screen}
        {fromConsole ? (
          <View style={styles.overlay}>
            <DownloadsScreen onBack={pop} />
          </View>
        ) : null}
      </View>
      {!consented ? (
        <View style={styles.gateOverlay}>
          <ConsentGate
            onAgree={() => {
              saveLegalConsent({version: LEGAL_DOC_VERSION, agreedAt: Date.now()});
              setConsented(true);
            }}
          />
        </View>
      ) : null}
      {!unlocked ? (
        <View style={styles.gateOverlay}>
          <LockScreen config={lock} onUnlock={() => setUnlocked(true)} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#161616',
    elevation: 8,
  },
  sessionLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#161616',
  },
  sessionHidden: {
    display: 'none',
  },
  gateOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#161616',
    elevation: 10,
  },
});

export default App;
