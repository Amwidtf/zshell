import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {WebView, WebViewNavigation} from 'react-native-webview';
import {buildConsoleUrl, MachineRecord} from '@zshell/core-shell';
import {buildPatchSource} from '@zshell/patch-bundle';
import {colors, font} from '../theme';

interface ConsoleScreenProps {
  machine: MachineRecord;
  onBack: () => void;
  /**
   * Registers a web-history back handler. The system back button prefers
   * the page's own history (e.g. navigating inside the console); when there
   * is none it falls through to the app-level back (return to machine list).
   */
  registerBackHandler: (fn: (() => boolean) | null) => void;
}

/**
 * The official remote console in a WebView. The document-start patch bundle
 * (matchMedia fix etc.) is injected before any page script runs; everything
 * else — relay WSS, pairing handshake — is done by the official page itself.
 */
export function ConsoleScreen({machine, onBack, registerBackHandler}: ConsoleScreenProps) {
  const webviewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);
  const url = useMemo(() => buildConsoleUrl(machine.credentials), [machine]);

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
        <TouchableOpacity
          onPress={() => setReloadKey(k => k + 1)}
          style={styles.reloadButton}>
          <Text style={styles.reloadText}>重连</Text>
        </TouchableOpacity>
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
        onNavigationStateChange={(nav: WebViewNavigation) => {
          canGoBackRef.current = nav.canGoBack;
        }}
        renderError={code => (
          <View style={styles.errorBox}>
            <Text style={font.dim}>页面加载失败（{code}）</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => setReloadKey(k => k + 1)}>
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
  webview: {flex: 1, backgroundColor: colors.bg},
  errorBox: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16},
  retryButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
});
