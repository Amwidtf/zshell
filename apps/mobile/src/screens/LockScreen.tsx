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
  activeSecrets,
  LockConfig,
  patternToString,
  verifySecret,
} from '@zshell/core-shell';
import {biometricAuth} from '../biometric';
import {PatternPad} from '../PatternPad';
import {colors, font} from '../theme';

type SecretKind = 'pattern' | 'password';
type Mode = SecretKind | 'biometric-failed';

interface LockScreenProps {
  config: LockConfig;
  onUnlock: () => void;
}

/** Resolve a user-facing biometric name from the platform-reported type. */
export function biometricLabel(type?: string): string {
  if (type === 'FaceID') {
    return '人脸';
  }
  if (type === 'TouchID') {
    return '指纹';
  }
  return '生物识别';
}

/**
 * Unlock screen. Every enabled method is offered — biometric prompt plus
 * pattern/password inputs with switching — so one unavailable method never
 * locks the user out.
 */
export function LockScreen({config, onUnlock}: LockScreenProps) {
  const secrets = activeSecrets(config);
  const [mode, setMode] = useState<Mode>(
    secrets[0] ?? 'biometric-failed',
  );
  const [secretInput, setSecretInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [bioType, setBioType] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!config.methods.biometric) {
      return;
    }
    let cancelled = false;
    biometricAuth.isAvailable().then(r => {
      if (cancelled) {
        return;
      }
      setBioType(r.type);
      if (!r.available) {
        setError(
          `${biometricLabel(r.type)}不可用，请使用备用方式解锁`,
        );
        return;
      }
      biometricAuth.prompt('验证身份以打开 ZShell').then(ok => {
        if (!cancelled && ok) {
          onUnlock();
        } else if (!cancelled) {
          setError(`${biometricLabel(r.type)}验证未通过，请使用备用方式`);
        }
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trySecret = (kind: SecretKind, secret: string) => {
    if (verifySecret(secret, kind, config)) {
      onUnlock();
    } else {
      setError('验证失败，请重试');
      setAttempts(a => a + 1);
    }
  };

  const switchTo = (kind: SecretKind) => {
    setMode(kind);
    setError(null);
    setSecretInput('');
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>ZShell 已锁定</Text>
      <Text style={font.dim}>
        {mode === 'biometric-failed'
          ? '请选择解锁方式'
          : mode === 'pattern'
            ? '绘制图案解锁'
            : '输入密码解锁'}
      </Text>

      {mode === 'pattern' ? (
        <View style={{marginTop: 40, alignItems: 'center'}}>
          <PatternPad
            hint={error ?? '至少连接 4 个点'}
            onComplete={dots => trySecret('pattern', patternToString(dots))}
          />
        </View>
      ) : null}

      {mode === 'password' ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{width: '100%', marginTop: 40}}>
          <TextInput
            style={styles.input}
            placeholder="密码"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            autoFocus
            value={secretInput}
            onChangeText={setSecretInput}
            onSubmitEditing={() => trySecret('password', secretInput)}
          />
          <TouchableOpacity
            style={styles.button}
            onPress={() => trySecret('password', secretInput)}>
            <Text style={styles.buttonText}>解锁</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      ) : null}

      {mode === 'biometric-failed' ? (
        <View style={{marginTop: 40, gap: 16, alignItems: 'center'}}>
          {secrets.length === 0 ? (
            <Text style={styles.error}>
              未设置备用解锁方式。请重启应用并重试
              {config.methods.biometric ? biometricLabel(bioType) : ''}验证。
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Method switcher: any other enabled method is one tap away. */}
      <View style={styles.switchRow}>
        {config.methods.biometric ? (
          <TouchableOpacity
            style={styles.switchButton}
            onPress={async () => {
              setError(null);
              const ok = await biometricAuth.prompt('验证身份以打开 ZShell');
              if (ok) {
                onUnlock();
              } else {
                setError(`${biometricLabel(bioType)}验证未通过`);
              }
            }}>
            <Text style={styles.switchText}>
              使用{biometricLabel(bioType)}
            </Text>
          </TouchableOpacity>
        ) : null}
        {secrets.includes('pattern') && mode !== 'pattern' ? (
          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => switchTo('pattern')}>
            <Text style={styles.switchText}>使用图案</Text>
          </TouchableOpacity>
        ) : null}
        {secrets.includes('password') && mode !== 'password' ? (
          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => switchTo('password')}>
            <Text style={styles.switchText}>使用密码</Text>
          </TouchableOpacity>
        ) : null}
      </View>

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
  switchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 36,
  },
  switchButton: {padding: 6},
  switchText: {color: colors.accent, fontSize: 14},
  error: {color: colors.danger, marginTop: 16, fontSize: 13, textAlign: 'center'},
});
