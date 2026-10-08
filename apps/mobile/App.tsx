/**
 * ZShell — ZCode remote-control mobile shell.
 * @format
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, StatusBar, View} from 'react-native';
import {
  disabledConfig,
  LockConfig,
  MachineRecord,
  MachineRegistry,
} from '@zshell/core-shell';
import {ConsoleScreen} from './src/screens/ConsoleScreen';
import {LockScreen} from './src/screens/LockScreen';
import {MachineListScreen} from './src/screens/MachineListScreen';
import {ManualInputScreen} from './src/screens/ManualInputScreen';
import {ScanScreen} from './src/screens/ScanScreen';
import {SettingsScreen} from './src/screens/SettingsScreen';
import {loadLockConfig, loadRegistry, saveLockConfig, saveRegistry} from './src/storage';

type Screen =
  | {name: 'list'}
  | {name: 'scan'}
  | {name: 'manual'}
  | {name: 'settings'}
  | {name: 'console'; machineId: string};

function App(): React.JSX.Element {
  const [booting, setBooting] = useState(true);
  const [lock, setLock] = useState(disabledConfig());
  const [unlocked, setUnlocked] = useState(true);
  const [stack, setStack] = useState<Screen[]>([{name: 'list'}]);
  const [machines, setMachines] = useState<MachineRecord[]>([]);
  const registryRef = useRef<MachineRegistry | null>(null);

  useEffect(() => {
    registryRef.current = loadRegistry();
    const cfg = loadLockConfig();
    setLock(cfg);
    setUnlocked(!cfg.enabled);
    setMachines(registryRef.current.sorted());
    setBooting(false);
  }, []);

  // Relock whenever the app leaves the foreground while the lock is enabled.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background' && lock.enabled) {
        setUnlocked(false);
      }
    });
    return () => sub.remove();
  }, [lock.enabled]);

  const persist = useCallback(() => {
    if (registryRef.current != null) {
      saveRegistry(registryRef.current);
      setMachines(registryRef.current.sorted());
    }
  }, []);

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

  if (!unlocked) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#161616" />
        <LockScreen config={lock} onUnlock={() => setUnlocked(true)} />
      </>
    );
  }

  const top = stack[stack.length - 1];
  const push = (s: Screen) => setStack(st => [...st, s]);
  const pop = () => setStack(st => (st.length > 1 ? st.slice(0, -1) : st));
  const connectTo = (machineId: string) => {
    registryRef.current?.touch(machineId);
    persist();
    setStack([{name: 'list'}, {name: 'console', machineId}]);
  };

  let screen: React.JSX.Element;
  switch (top.name) {
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
          onBack={pop}
        />
      );
      break;
    case 'console': {
      const machine = registryRef.current?.get(top.machineId) ?? null;
      screen = machine ? (
        <ConsoleScreen machine={machine} onBack={pop} />
      ) : (
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
          onDelete={id => {
            registryRef.current?.remove(id);
            persist();
          }}
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
          onDelete={id => {
            registryRef.current?.remove(id);
            persist();
          }}
        />
      );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#161616" />
      {screen}
    </>
  );
}

export default App;
