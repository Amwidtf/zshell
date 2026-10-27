import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
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
  WebViewOpenWindowEvent,
} from 'react-native-webview';
import {
  buildConsoleUrl,
  ConsoleEvent,
  ConsoleStatus,
  deriveConsoleStatus,
  hostLabel,
  MachineLoginState,
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

function authHostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

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
  /**
   * Observed web-login state for Kimi Code machines (page landing on /login
   * means signed out, staying on /devices/ means signed in).
   */
  onLoginState?: (state: MachineLoginState) => void;
  /**
   * DSH only: accept (true) or revoke (false) the machine's untrusted TLS
   * certificate. Accepting reloads the console with certificate errors
   * bypassed for this origin.
   */
  onSetTrustSsl?: (trust: boolean) => void;
}

/**
 * The official remote console in a WebView. The document-start patch bundle
 * (matchMedia fix etc.) is injected before any page script runs; everything
 * else — relay WSS, pairing handshake — is done by the official page itself.
 */
export function ConsoleScreen({machine, onBack, registerBackHandler, onOpenDownloads, onLoginState, onSetTrustSsl}: ConsoleScreenProps) {
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
  // DSH remotes have no relay WebSocket for the observer patch to watch —
  // status is derived from page loads instead (connecting / connected /
  // disconnected), tracked via a synchronous ref to dodge event-order races.
  const isDsh = machine.credentials.kind === 'dsh';
  const dshLoadFailedRef = useRef(false);
  // One SSL trust prompt per console session (auto-reload must not re-ask).
  const sslPromptShownRef = useRef(false);

  // Trust granted mid-session → retry immediately with the bypass enabled.
  const trustedRef = useRef(machine.trustSelfSigned === true);
  useEffect(() => {
    const trusted = machine.trustSelfSigned === true;
    const justTrusted = trusted && !trustedRef.current;
    trustedRef.current = trusted;
    if (justTrusted) {
      logDiag('ssl-trust-reload');
      reload();
    }
  }, [machine.trustSelfSigned]);

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

  // Kimi Code 登录态观测：页面最终落在 /login = 未登录，留在 /devices/ = 已登录。
  // 注：必须用 onNavigationStateChange——本版本 onLoadEnd 事件在 Android
  // 上不带 url（undefined）。诊断只记布尔，不记 URL 内容（路径含设备标识）。
  const observeLoginState = useCallback(
    (url: string) => {
      if (machine.credentials.kind !== 'kimi' || url.length === 0) {
        return;
      }
      logDiag(
        'login-observed',
        `l:${url.includes('/login')} d:${url.includes('/devices/')}`,
      );
      if (url.includes('/login')) {
        onLoginState?.('logged-out');
      } else if (url.includes('/devices/')) {
        onLoginState?.('logged-in');
      }
    },
    [machine.credentials.kind, onLoginState],
  );

  const handleWebBack = useCallback(() => {
    if (canGoBackRef.current && webviewRef.current != null) {
      webviewRef.current.goBack();
      return true;
    }
    return false;
  }, []);

  // Kimi Code 登录用 window.open 新开 auth.kimi.com 授权页，授权完成后
  // 原（登录）页面轮询拿到 token 并跳回设备页。壳用覆盖层模拟这个弹窗：
  // 主窗口保留登录页继续轮询，授权页叠在上层；主窗口离开 /login 时覆盖
  // 层自动收起。不能丢给系统浏览器——登录态会落进浏览器的 Cookie 存储，
  // 壳里永远未登录。
  const [authWindowUrl, setAuthWindowUrl] = useState<string | null>(null);

  const handleOpenWindow = useCallback((event: WebViewOpenWindowEvent) => {
    const target = event.nativeEvent.targetUrl;
    if (typeof target !== 'string' || !target.startsWith('https://')) {
      return;
    }
    // 诊断只记主机名——事件不得携带 URL / 凭据
    try {
      logDiag('window-open', new URL(target).host);
    } catch {
      logDiag('window-open');
    }
    setAuthWindowUrl(target);
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
        // DSH self-hosted origins: user-trusted untrusted certificates and
        // an optional reverse-proxy HTTP Basic credential (patched webview
        // prop; both only ever set for dsh machines).
        proceedOnSslError={isDsh && machine.trustSelfSigned === true}
        basicAuthCredential={
          isDsh && machine.basicAuth != null
            ? {
                username: machine.basicAuth.username,
                password: machine.basicAuth.password,
              }
            : undefined
        }
        // Kimi Code 登录（auth.kimi.com）经 window.open 发起，必须放行
        // 多窗口事件；onOpenWindow 把目标页导航回同一个 WebView。
        setSupportMultipleWindows
        javaScriptCanOpenWindowsAutomatically
        onOpenWindow={handleOpenWindow}
        // File downloads inside the console are handled by the webview's own
        // system-DownloadManager path; they land in 下载管理 (uid query).
        downloadingMessage="已开始下载，可在 设置 → 下载管理 查看"
        onNavigationStateChange={(nav: WebViewNavigation) => {
          canGoBackRef.current = nav.canGoBack;
          const url = typeof nav.url === 'string' ? nav.url : '';
          // 登录完成后原页面跳回设备页——授权覆盖层随之收起
          if (url.includes('/devices/')) {
            setAuthWindowUrl(null);
          }
          observeLoginState(url);
        }}
        onLoadStart={() => {
          setLoadFailed(false);
          dshLoadFailedRef.current = false;
          // DSH: do NOT reset status to 'connecting' here — after a failed
          // load Android fires another onPageStarted for its built-in error
          // page, which would erase the 'disconnected' the error just set.
          // ('connecting' comes from mount/reload instead.)
          logDiag('page-load-start');
        }}
        onLoadEnd={() => {
          if (!isDsh) {
            return;
          }
          setStatus(dshLoadFailedRef.current ? 'disconnected' : 'connected');
        }}
        onError={(e: WebViewErrorEvent) => {
          setLoadFailed(true);
          dshLoadFailedRef.current = true;
          if (isDsh) {
            setStatus('disconnected');
          }
          const desc = e.nativeEvent.description ?? '';
          logDiag('load-error', desc.slice(0, 60));
          // DSH self-hosted origins often carry a private-CA / self-signed
          // certificate the system rejects. Offer an explicit, per-machine
          // trust decision (kept in the encrypted registry) once.
          if (
            isDsh &&
            !sslPromptShownRef.current &&
            machine.trustSelfSigned !== true &&
            desc.startsWith('SSL error:')
          ) {
            sslPromptShownRef.current = true;
            let host = machine.credentials.sid;
            try {
              host = new URL(machine.credentials.origin).host;
            } catch {}
            Alert.alert(
              '证书不受信任',
              `${host} 的证书不受系统信任（自签名或私有 CA 签发，自建 DSH 常见）。\n\n信任后，本应用连接该地址时将跳过证书校验。请确认地址属于你自己的设备——在不安全的网络上继续连接可能被窃听或篡改。`,
              [
                {text: '取消', style: 'cancel'},
                {
                  text: '信任并继续',
                  style: 'destructive',
                  onPress: () => onSetTrustSsl?.(true),
                },
              ],
            );
          }
        }}
        // The OS may kill the WebView renderer while backgrounded; rebuild
        // the page instead of leaving a dead surface.
        onRenderProcessGone={() => reload()}
        onMessage={handleBridgeMessage}
        renderError={() => (
          <View style={styles.errorBox}>
            <Text style={font.dim}>控制台加载失败，多半是网络未就绪或连接中断</Text>
            <Text style={font.faint}>回到前台会自动重试，也可以现在手动重试</Text>
            {isDsh && machine.basicAuth == null ? (
              <Text style={font.faint}>
                若该地址有 HTTP Basic 访问保护（401），{'\n'}
                请返回列表长按卡片填写「访问口令」
              </Text>
            ) : null}
            <TouchableOpacity style={styles.retryButton} onPress={reload}>
              <Text style={{color: '#fff'}}>重试</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {authWindowUrl != null && (
        <View style={styles.authOverlay}>
          <View style={styles.authBar}>
            <Text style={styles.authTitle} numberOfLines={1}>
              {authHostOf(authWindowUrl)} · 授权登录
            </Text>
            <TouchableOpacity
              style={styles.authClose}
              onPress={() => setAuthWindowUrl(null)}>
              <Text style={styles.authCloseText}>✕ 关闭</Text>
            </TouchableOpacity>
          </View>
          <WebView
            source={{uri: authWindowUrl}}
            injectedJavaScriptBeforeContentLoaded={buildPatchSource()}
            javaScriptEnabled
            domStorageEnabled
            cacheEnabled={false}
            originWhitelist={['*']}
            style={styles.webview}
            setSupportMultipleWindows
            javaScriptCanOpenWindowsAutomatically
            onOpenWindow={handleOpenWindow}
          />
        </View>
      )}
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
  authOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    elevation: 10,
  },
  authBar: {
    height: 52,
    backgroundColor: colors.bgElevated,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  authTitle: {...font.body, flex: 1, textAlign: 'center'},
  authClose: {paddingHorizontal: 12, paddingVertical: 8},
  authCloseText: {color: colors.accent, fontSize: 14},
});
