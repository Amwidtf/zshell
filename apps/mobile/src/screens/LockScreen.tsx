import React, {useEffect, useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  LockConfig,
  patternToString,
  verifySecret,
} from '@zshell/core-shell';
import {biometricAuth} from '../biometric';
import {PatternPad} from '../PatternPad';
import {colors, font} from '../theme';

interface LockScreenProps {
  config: LockConfig;
  onUnlock: () => void;
}

export function LockScreen({config, onUnlock}: LockScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [secretInput, setSecretInput] = useState('');
  const [showFallback, setShowFallback] = useState(config.method !== 'biometric');

  useEffect(() => {
    if (config.method !== 'biometric') {
      return;
    }
    let cancelled = false;
    biometricAuth.prompt('验证身份以打开 ZShell').then(ok => {
      if (!cancelled && ok) {
        onUnlock();
      } else if (!cancelled) {
        setShowFallback(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = (msg: string) => {
    setError(msg);
    setAttempts(a => a + 1);
  };

  const trySecret = (secret: string) => {
    if (verifySecret(secret, config)) {
      onUnlock();
    } else {
      fail('验证失败，请重试');
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>ZShell 已锁定</Text>
      <Text style={font.dim}>
        {config.method === 'biometric'
          ? '生物识别不可用或已取消'
          : config.secretKind === 'pattern'
            ? '绘制图案解锁'
            : '输入密码解锁'}
      </Text>

      {config.secretKind === 'pattern' && showFallback ? (
        <View style={{marginTop: 40, alignItems: 'center'}}>
          <PatternPad
            hint={error ?? '至少连接 4 个点'}
            onComplete={dots => trySecret(patternToString(dots))}
          />
        </View>
      ) : showFallback ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{width: '100%', marginTop: 40}}>
          <TextInput
            style={styles.input}
            placeholder="密码"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            value={secretInput}
            onChangeText={setSecretInput}
            onSubmitEditing={() => trySecret(secretInput)}
          />
          <TouchableOpacity
            style={styles.button}
            onPress={() => trySecret(secretInput)}>
            <Text style={styles.buttonText}>解锁</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      ) : null}

      {config.method === 'biometric' ? (
        <TouchableOpacity
          style={styles.secondary}
          onPress={async () => {
            const ok = await biometricAuth.prompt('验证身份以打开 ZShell');
            if (ok) {
              onUnlock();
            } else {
              setShowFallback(true);
            }
          }}>
          <Text style={styles.secondaryText}>重试指纹 / 人脸</Text>
        </TouchableOpacity>
      ) : null}

      {attempts > 0 ? (
        <Text style={styles.error}>已尝试 {attempts} 次</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  content: {flexGrow: 1, alignItems: 'center', padding: 24, paddingTop: 80},
  title: {...font.title, marginBottom: 8},
  input: {
    width: '100%',
    backgroundColor: colors.bgInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginTop: 16,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  secondary: {marginTop: 32},
  secondaryText: {color: colors.accent, fontSize: 14},
  error: {color: colors.danger, marginTop: 16, fontSize: 13},
});
