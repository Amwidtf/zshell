import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AppState,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  WebView,
  WebViewErrorEvent,
  WebViewNavigation,
  WebViewMessageEvent,
} from 'react-native-webview';
import {
  buildConsoleUrl,
  ConsoleEvent,
  ConsoleStatus,
  deriveConsoleStatus,
  hostLabel,
  MachineRecord,
  parseClock,
  parseConsoleEvent,
  withinQuietHours,
} from '@zshell/core-shell';
import {buildPatchSource} from '@zshell/patch-bundle';
import {logDiag} from '../diagnostics';
import {loadPrefs, notifications} from '../notifications';
import {colors, font} from '../theme';

const STATUS_META: Record<ConsoleStatus, {label: string; color: string}> = {
  connecting: {label: '连接中…', color: colors.star},
  connected: {label: '已连接', color: colors.success},
  waiting: {label: '等待桌面端上线', color: colors.star},
  disconnected: {label: '连接已断开', color: colors.danger},
  kicked: {label: '已在其他设备连接', color: colors.danger},
};

interface ConsoleScreenProps {
  machine: MachineRecord;
  onBack: () => void;
  /**
   * Registers a web-history back handler. The system back button prefers
   * the page's own history (e.g. navigating inside the console); when there
   * is none it falls through to the app-level back (return to machine list).
   */
  registerBackHandler: (fn: (() => boolean) | null) => void;
  /** Opens the download manager (console-triggered downloads land there). */
  onOpenDownloads: () => void;
}

/**
 * The official remote console in a WebView. The document-start patch bundle
 * (matchMedia fix etc.) is injected before any page script runs; everything
 * else — relay WSS, pairing handshake — is done by the official page itself.
 */
export function ConsoleScreen({machine, onBack, registerBackHandler, onOpenDownloads}: ConsoleScreenProps) {
  const webviewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<ConsoleStatus>('connecting');
  // True while the WebView's own load has failed (error page visible).
  const [loadFailed, setLoadFailed] = useState(false);
  const prefsRef = useRef(loadPrefs());
  const url = useMemo(() => buildConsoleUrl(machine.credentials), [machine]);

  useEffect(() => {
    prefsRef.current = loadPrefs();
  }, []);

  const notify = useCallback(
    (
      id: number,
      kind: 'approval' | 'security' | 'info',
      title: string,
      body: string,
    ) => {
      const prefs = prefsRef.current;
      if (!prefs.notificationsEnabled || machine.muted || notifications == null) {
        return;
      }
      if (kind === 'info' && prefs.quietHours.enabled) {
        const now = new Date();
        const start = parseClock(prefs.quietHours.start);
        const end = parseClock(prefs.quietHours.end);
        if (
          start != null &&
          end != null &&
          withinQuietHours(now.getHours() * 60 + now.getMinutes(), start, end)
        ) {
          return; // quiet hours mute informational pings only
        }
      }
      notifications.notify(id, title, body);
    },
    [machine.muted],
  );

  const diagDetail = (event: ConsoleEvent): string | undefined => {
    const d = event.detail;
    if (d == null || typeof d !== 'object') {
      return undefined;
    }
    const text = JSON.stringify(d);
    return text.length > 60 ? text.slice(0, 60) + '…' : text;
  };

  const brand = hostLabel(machine.credentials);

  const handleBridgeMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const bridgeEvent = parseConsoleEvent(event.nativeEvent.data);
      if (bridgeEvent == null) {
        return;
      }
      logDiag(bridgeEvent.type, diagDetail(bridgeEvent));
      if (bridgeEvent.type === 'approval-waiting') {
        notify(2, 'approval', `${brand} · 等待你的批准`, 'Agent 请求执行操作，点开应用处理');
        return;
      }
      setStatus(prev => {
        const next = deriveConsoleStatus(prev, bridgeEvent);
        if (next !== prev) {
          if (next === 'kicked') {
            notify(3, 'security', '会话已在其他设备连接', '如需夺回请点开应用重连');
          } else if (next === 'disconnected' && prev === 'connected') {
            notify(4, 'info', '连接已断开', '正在自动重连，可点开应用查看');
          }
        }
        return next;
      });
    },
    [notify, brand],
  );

  const reload = useCallback(() => {
    logDiag('page-reload');
    setStatus('connecting');
    setLoadFailed(false);
    setReloadKey(k => k + 1);
  }, []);

  const statusRef = useRef<ConsoleStatus>('connecting');
  statusRef.current = status;
  const loadFailedRef = useRef(false);
  loadFailedRef.current = loadFailed;

  useEffect(() => {
    logDiag('console-open', machine.name);
  }, [machine.name]);

  // Returning to the foreground with a dead connection or a failed page load
  // reloads right away — the OS often kills the WebView renderer in the
  // background, and the resume-time reload can hit a network that is not
  // ready yet (error -1). Retrying automatically once the app is actually
  // visible fixes both instead of leaving a dead error page.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        return;
      }
      logDiag('app-active', statusRef.current);
      if (statusRef.current === 'disconnected' || loadFailedRef.current) {
        logDiag('auto-reload');
        reload();
      }
    });
    return () => sub.remove();
  }, [reload]);

  const handleWebBack = useCallback(() => {
    if (canGoBackRef.current && webviewRef.current != null) {
      webviewRef.current.goBack();
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    registerBackHandler(handleWebBack);
    return () => registerBackHandler(null);
  }, [handleWebBack, registerBackHandler]);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ 返回列表</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {machine.name}
        </Text>
        <TouchableOpacity onPress={onOpenDownloads} style={styles.reloadButton}>
          <Text style={styles.reloadText}>下载</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={reload} style={styles.reloadButton}>
          <Text style={styles.reloadText}>重连</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.statusStrip}>
        <View style={[styles.statusDot, {backgroundColor: STATUS_META[status].color}]} />
        <Text style={styles.statusText}>{STATUS_META[status].label}</Text>
      </View>
      <WebView
        key={reloadKey}
        ref={webviewRef}
        source={{uri: url}}
        injectedJavaScriptBeforeContentLoaded={buildPatchSource()}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        originWhitelist={['*']}
        style={styles.webview}
        containerStyle={styles.webview}
        setSupportMultipleWindows={false}
        // File downloads inside the console are handled by the webview's own
        // system-DownloadManager path; they land in 下载管理 (uid query).
        downloadingMessage="已开始下载，可在 设置 → 下载管理 查看"
        onNavigationStateChange={(nav: WebViewNavigation) => {
          canGoBackRef.current = nav.canGoBack;
        }}
        onLoadStart={() => {
          setLoadFailed(false);
          logDiag('page-load-start');
        }}
        onError={(e: WebViewErrorEvent) => {
          setLoadFailed(true);
          logDiag('load-error', e.nativeEvent.description?.slice(0, 60));
        }}
        // The OS may kill the WebView renderer while backgrounded; rebuild
        // the page instead of leaving a dead surface.
        onRenderProcessGone={() => reload()}
        onMessage={handleBridgeMessage}
        renderError={() => (
          <View style={styles.errorBox}>
            <Text style={font.dim}>控制台加载失败，多半是网络未就绪或连接中断</Text>
            <Text style={font.faint}>回到前台会自动重试，也可以现在手动重试</Text>
            <TouchableOpacity style={styles.retryButton} onPress={reload}>
              <Text style={{color: '#fff'}}>重试</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  topBar: {
    height: 52,
    backgroundColor: colors.bgElevated,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {paddingHorizontal: 10, paddingVertical: 8},
  backText: {color: colors.accent, fontSize: 15},
  title: {...font.body, flex: 1, textAlign: 'center'},
  reloadButton: {paddingHorizontal: 12, paddingVertical: 8},
  reloadText: {color: colors.accent, fontSize: 14},
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  statusDot: {width: 8, height: 8, borderRadius: 4},
  statusText: {color: colors.textDim, fontSize: 12},
  webview: {flex: 1, backgroundColor: colors.bg},
  errorBox: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16},
  retryButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
});
