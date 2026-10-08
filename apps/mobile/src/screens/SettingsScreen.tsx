import React, {useEffect, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  createLockConfig,
  disabledConfig,
  LockConfig,
  LockMethod,
  patternToString,
  verifySecret,
} from '@zshell/core-shell';
import {biometricAuth} from '../biometric';
import {LegalDocModal} from '../components/LegalDocModal';
import {OSS_LICENSES, PRIVACY_POLICY, USER_AGREEMENT, LegalDoc} from '../legal';
import {PatternPad} from '../PatternPad';
import {colors, font} from '../theme';
import {APP_VERSION} from '../version';

/** Salt RNG. Math.random is fine for salts (not key material). */
function rng(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

interface SettingsScreenProps {
  lock: LockConfig;
  onSaveLock: (config: LockConfig) => void;
  onBack: () => void;
}

type SetupStep =
  | {kind: 'choose'}
  | {kind: 'pattern'; confirmOf: string | null; method: LockMethod}
  | {kind: 'password'; first: string | null; method: LockMethod}
  | {kind: 'disableVerify'};

export function SettingsScreen({lock, onSaveLock, onBack}: SettingsScreenProps) {
  const [biometricType, setBiometricType] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [step, setStep] = useState<SetupStep>({kind: 'choose'});
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<LegalDoc | null>(null);

  useEffect(() => {
    biometricAuth.isAvailable().then(r => {
      setBiometricAvailable(r.available);
      setBiometricType(r.type ?? null);
    });
  }, []);

  const finishSetup = (method: LockMethod, secret: string) => {
    onSaveLock(createLockConfig(method, secret, rng()));
    setStep({kind: 'choose'});
    setError(null);
  };

  const tryDisable = async (secret: string) => {
    if (verifySecret(secret, lock)) {
      onSaveLock(disabledConfig());
      setStep({kind: 'choose'});
      setError(null);
      return;
    }
    if (lock.method === 'biometric' && (await biometricAuth.prompt('验证以关闭应用锁'))) {
      onSaveLock(disabledConfig());
      setStep({kind: 'choose'});
      setError(null);
      return;
    }
    setError('验证失败');
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{padding: 20, gap: 14}}>
      <TouchableOpacity onPress={onBack}>
        <Text style={{color: colors.accent, fontSize: 16}}>‹ 返回</Text>
      </TouchableOpacity>
      <Text style={font.title}>设置</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>应用锁</Text>
        <Text style={font.dim}>
          {lock.enabled
            ? `已启用 · ${
                lock.method === 'biometric'
                  ? `生物识别${biometricType ? `（${biometricType === 'TouchID' ? '指纹' : biometricType === 'FaceID' ? '人脸' : biometricType}）` : ''} + 图案备用`
                  : lock.method === 'pattern'
                    ? '图案解锁'
                    : '密码解锁'
              }`
            : '未启用 —— 打开应用时验证指纹、人脸、图案或密码，保护已保存的配对凭据'}
        </Text>

        {step.kind === 'choose' ? (
          <View style={{gap: 10, marginTop: 6}}>
            {lock.enabled ? (
              <TouchableOpacity
                style={styles.dangerOutline}
                onPress={() => {
                  setStep({kind: 'disableVerify'});
                  setError(null);
                }}>
                <Text style={{color: colors.danger, fontSize: 14}}>关闭应用锁</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.option}
                  disabled={!biometricAvailable}
                  onPress={() => setStep({kind: 'pattern', confirmOf: null, method: 'biometric'})}>
                  <Text style={styles.optionText}>
                    指纹 / 人脸{biometricAvailable ? '' : '（本机不可用）'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => setStep({kind: 'pattern', confirmOf: null, method: 'pattern'})}>
                  <Text style={styles.optionText}>图案</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => setStep({kind: 'password', first: null, method: 'password'})}>
                  <Text style={styles.optionText}>密码</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : null}

        {step.kind === 'pattern' ? (
          <View style={{alignItems: 'center', marginTop: 10}}>
            <Text style={font.dim}>
              {step.method === 'biometric' ? '设置备用图案（生物识别不可用时使用）' : '设置解锁图案'}
              {step.confirmOf != null ? ' · 请再画一次确认' : ''}
            </Text>
            <View style={{marginTop: 30, marginBottom: 40}}>
              <PatternPad
                hint={error ?? '至少连接 4 个点'}
                onComplete={dots => {
                  const secret = patternToString(dots);
                  if (step.confirmOf == null) {
                    setStep({...step, confirmOf: secret});
                  } else if (step.confirmOf === secret) {
                    finishSetup(step.method, secret);
                  } else {
                    setError('两次图案不一致，请重新设置');
                    setStep({...step, confirmOf: null});
                  }
                }}
              />
            </View>
          </View>
        ) : null}

        {step.kind === 'password' ? (
          <View style={{gap: 10}}>
            <Text style={font.dim}>
              {step.first == null ? '设置解锁密码' : '请再输入一次确认'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={step.first == null ? '输入密码' : '再次输入密码'}
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                if (password.length < 4) {
                  setError('密码至少 4 位');
                  return;
                }
                if (step.first == null) {
                  setStep({...step, first: password});
                  setPassword('');
                  setError(null);
                } else if (step.first === password) {
                  finishSetup('password', password);
                } else {
                  setError('两次密码不一致');
                  setStep({...step, first: null});
                  setPassword('');
                }
              }}>
              <Text style={{color: '#fff', fontWeight: '600'}}>下一步</Text>
            </TouchableOpacity>
            {error != null ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        ) : null}

        {step.kind === 'disableVerify' ? (
          <View style={{gap: 10}}>
            <Text style={font.dim}>验证当前锁以关闭：</Text>
            {lock.secretKind === 'pattern' ? (
              <View style={{alignItems: 'center', marginVertical: 10}}>
                <PatternPad
                  hint={error ?? '绘制当前图案'}
                  onComplete={dots => tryDisable(patternToString(dots))}
                />
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="当前密码"
                  placeholderTextColor={colors.textFaint}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => tryDisable(password)}>
                  <Text style={{color: '#fff', fontWeight: '600'}}>验证并关闭</Text>
                </TouchableOpacity>
              </>
            )}
            {error != null ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>法律与关于</Text>
        <Text style={font.faint}>
          ZShell v{APP_VERSION} · 非官方第三方客户端 · 零数据收集
        </Text>
        {(
          [
            USER_AGREEMENT,
            PRIVACY_POLICY,
            OSS_LICENSES,
          ] as LegalDoc[]
        ).map(doc => (
          <TouchableOpacity
            key={doc.title}
            style={styles.legalRow}
            onPress={() => setOpenDoc(doc)}>
            <Text style={styles.legalRowText}>{doc.title}</Text>
            <Text style={{color: colors.textFaint, fontSize: 18}}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <LegalDocModal doc={openDoc} onClose={() => setOpenDoc(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  section: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  sectionTitle: {color: colors.text, fontSize: 16, fontWeight: '600'},
  option: {
    backgroundColor: colors.bgInput,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  optionText: {color: colors.accent, fontSize: 15},
  dangerOutline: {
    borderWidth: 1,
    borderColor: 'rgba(229,83,75,0.5)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  input: {
    backgroundColor: colors.bgInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 4,
  },
  legalRowText: {color: colors.accent, fontSize: 15},
  errorText: {color: colors.danger, fontSize: 13},
});
