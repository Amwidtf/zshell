import React, {useEffect, useState} from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {activeSecrets, LockConfig, patternToString} from '@zshell/core-shell';
import {biometricAuth} from '../biometric';
import {verifySecretAsync} from '../lockcrypto';
import {PatternPad} from '../PatternPad';
import {colors, font} from '../theme';

type SecretKind = 'pattern' | 'password';
type Mode = 'biometric' | SecretKind;

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
 * Unlock screen. With biometric enabled the screen opens in a biometric-only
 * state: the prompt fires by itself (only while the app is foreground —
 * firing from the background pops a system dialog over the launcher) and the
 * pattern/password inputs stay hidden until it fails or is cancelled, so the
 * entry view isn't a pile of every method at once. Every enabled method
 * remains one tap away — one unavailable method never locks the user out.
 */
export function LockScreen({config, onUnlock}: LockScreenProps) {
  const secrets = activeSecrets(config);
  const [mode, setMode] = useState<Mode>(
    config.methods.biometric ? 'biometric' : (secrets[0] ?? 'password'),
  );
  const [secretInput, setSecretInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [bioType, setBioType] = useState<string | undefined>(undefined);

  // Auto biometric prompt. Deferred until the app is actually in the
  // foreground: this screen mounts as soon as the app relocks on
  // backgrounding, and prompting from there would flash the system dialog
  // over the launcher (or straight-up fail).
  useEffect(() => {
    if (!config.methods.biometric) {
      return;
    }
    let cancelled = false;
    let prompted = false;
    const promptOnce = async () => {
      if (prompted || cancelled) {
        return;
      }
      const r = await biometricAuth.isAvailable();
      if (cancelled) {
        return;
      }
      setBioType(r.type);
      if (!r.available) {
        setError(`${biometricLabel(r.type)}不可用，请使用备用方式解锁`);
        if (secrets.length > 0) {
          setMode(secrets[0]);
        }
        return;
      }
      prompted = true;
      const ok = await biometricAuth.prompt('验证身份以打开 ZShell');
      if (cancelled) {
        return;
      }
      if (ok) {
        onUnlock();
      } else {
        setError(`${biometricLabel(r.type)}验证未通过`);
        if (secrets.length > 0) {
          setMode(secrets[0]);
        }
      }
    };
    if (AppState.currentState === 'active') {
      promptOnce();
    }
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        promptOnce();
      }
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trySecret = (kind: SecretKind, secret: string) => {
    verifySecretAsync(secret, kind, config).then(ok => {
      if (ok) {
        onUnlock();
      } else {
        setError('验证失败，请重试');
        setAttempts(a => a + 1);
      }
    });
  };

  const switchTo = (kind: Mode) => {
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
        {mode === 'biometric'
          ? '使用生物识别解锁'
          : mode === 'pattern'
            ? '绘制图案解锁'
            : '输入密码解锁'}
      </Text>

      {mode === 'biometric' ? (
        <View style={{marginTop: 40, width: '100%', gap: 14, alignItems: 'center'}}>
          <TouchableOpacity
            style={styles.button}
            onPress={async () => {
              setError(null);
              const ok = await biometricAuth.prompt('验证身份以打开 ZShell');
              if (ok) {
                onUnlock();
              } else {
                setError(`${biometricLabel(bioType)}验证未通过`);
                if (secrets.length > 0) {
                  setMode(secrets[0]);
                }
              }
            }}>
            <Text style={styles.buttonText}>
              使用{biometricLabel(bioType)}解锁
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

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

      {/* Method switcher: any other enabled method is one tap away. */}
      <View style={styles.switchRow}>
        {config.methods.biometric && mode !== 'biometric' ? (
          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => switchTo('biometric')}>
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

      {error != null ? (
        <Text style={styles.error}>{error}</Text>
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
    paddingHorizontal: 40,
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
