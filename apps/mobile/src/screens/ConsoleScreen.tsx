import React, {useMemo, useRef, useState} from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {WebView} from 'react-native-webview';
import {buildConsoleUrl, MachineRecord} from '@zshell/core-shell';
import {buildPatchSource} from '@zshell/patch-bundle';
import {colors, font} from '../theme';

interface ConsoleScreenProps {
  machine: MachineRecord;
  onBack: () => void;
}

/**
 * The official remote console in a WebView. The document-start patch bundle
 * (matchMedia fix etc.) is injected before any page script runs; everything
 * else — relay WSS, pairing handshake — is done by the official page itself.
 */
export function ConsoleScreen({machine, onBack}: ConsoleScreenProps) {
  const webviewRef = useRef<WebView>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const url = useMemo(() => buildConsoleUrl(machine.credentials), [machine]);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ 返回</Text>
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
  backText: {color: colors.accent, fontSize: 16},
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
