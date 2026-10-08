import React, {useEffect, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  activeSecrets,
  clearMethod,
  LockConfig,
  patternToString,
  setPassword,
  setPattern,
  setBiometric,
  verifySecret,
} from '@zshell/core-shell';
import {biometricAuth} from '../biometric';
import {LegalDocModal} from '../components/LegalDocModal';
import {OSS_LICENSES, PRIVACY_POLICY, USER_AGREEMENT, LegalDoc} from '../legal';
import {PatternPad} from '../PatternPad';
import {biometricLabel} from './LockScreen';
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

type Step =
  | {kind: 'idle'}
  | {kind: 'patternSet'; confirmOf: string | null}
  | {kind: 'passwordSet'; first: string | null}
  | {kind: 'verify'; title: string; action: () => void};

/** Multi-method lock management: each method is set/cleared independently. */
export function SettingsScreen({lock, onSaveLock, onBack}: SettingsScreenProps) {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string | undefined>();
  const [step, setStep] = useState<Step>({kind: 'idle'});
  const [password, setPasswordValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<LegalDoc | null>(null);

  useEffect(() => {
    biometricAuth.isAvailable().then(r => {
      setBiometricAvailable(r.available);
      setBiometricType(r.type);
    });
  }, []);

  const secrets = activeSecrets(lock);
  const onlyBiometric = lock.methods.biometric && secrets.length === 0;
  const enabledNames = [
    lock.methods.biometric ? biometricLabel(biometricType) : null,
    lock.methods.pattern != null ? '图案' : null,
    lock.methods.password != null ? '密码' : null,
  ].filter(n => n != null);

  /** Clearing a secret method requires proving identity first. */
  const requestVerify = (title: string, action: () => void) => {
    setPasswordValue('');
    setError(null);
    setStep({kind: 'verify', title, action});
  };

  const runBiometricVerify = async (action: () => void) => {
    const ok = await biometricAuth.prompt(titleFor('verify-biometric'));
    if (ok) {
      action();
      setStep({kind: 'idle'});
    } else {
      setError('验证未通过');
    }
  };

  const titleFor = (kind: string) =>
    kind === 'verify-biometric' ? '验证以继续' : '验证身份';

  const verifyBySecret = (kind: 'pattern' | 'password', secret: string, action: () => void) => {
    if (verifySecret(secret, kind, lock)) {
      action();
      setStep({kind: 'idle'});
      setError(null);
    } else {
      setError('验证失败');
    }
  };

  const finishPatternSet = (secret: string) => {
    onSaveLock(setPattern(lock, secret, rng()));
    setStep({kind: 'idle'});
    setError(null);
  };

  const finishPasswordSet = (secret: string) => {
    onSaveLock(setPassword(lock, secret, rng()));
    setStep({kind: 'idle'});
    setError(null);
    setPasswordValue('');
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
            ? `已启用：${enabledNames.join(' + ')}（任一方式均可解锁）`
            : '未启用 —— 可同时开启多种解锁方式，防止单一方式不可用时被锁在外'}
        </Text>
        {onlyBiometric ? (
          <Text style={styles.hintWarn}>
            当前仅启用生物识别，建议再设置图案或密码作为备用
          </Text>
        ) : null}

        {/* ---- biometric toggle ---- */}
        <View style={styles.methodRow}>
          <View style={{flex: 1}}>
            <Text style={font.body}>{biometricLabel(biometricType)}</Text>
            <Text style={font.faint}>
              {biometricAvailable
                ? '使用系统指纹 / 人脸验证'
                : '本机暂无可用生物识别（容器/模拟器通常不支持，需实体设备已录入）'}
            </Text>
          </View>
          <Switch
            value={lock.methods.biometric}
            disabled={!biometricAvailable && !lock.methods.biometric}
            onValueChange={on => {
              setError(null);
              onSaveLock(setBiometric(lock, on));
            }}
            trackColor={{true: colors.accent}}
            thumbColor="#ffffff"
          />
        </View>

        {/* ---- pattern row ---- */}
        <View style={styles.methodRow}>
          <View style={{flex: 1}}>
            <Text style={font.body}>图案</Text>
            <Text style={font.faint}>
              {lock.methods.pattern != null ? '已设置' : '未设置'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.smallButton}
            onPress={() => {
              setError(null);
              setStep({kind: 'patternSet', confirmOf: null});
            }}>
            <Text style={styles.smallButtonText}>
              {lock.methods.pattern != null ? '更换' : '设置'}
            </Text>
          </TouchableOpacity>
          {lock.methods.pattern != null ? (
            <TouchableOpacity
              style={styles.smallButton}
              onPress={() =>
                requestVerify('清除图案', () =>
                  onSaveLock(clearMethod(lock, 'pattern')),
                )
              }>
              <Text style={[styles.smallButtonText, {color: colors.danger}]}>
                清除
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ---- password row ---- */}
        <View style={styles.methodRow}>
          <View style={{flex: 1}}>
            <Text style={font.body}>密码</Text>
            <Text style={font.faint}>
              {lock.methods.password != null ? '已设置' : '未设置'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.smallButton}
            onPress={() => {
              setError(null);
              setPasswordValue('');
              setStep({kind: 'passwordSet', first: null});
            }}>
            <Text style={styles.smallButtonText}>
              {lock.methods.password != null ? '更换' : '设置'}
            </Text>
          </TouchableOpacity>
          {lock.methods.password != null ? (
            <TouchableOpacity
              style={styles.smallButton}
              onPress={() =>
                requestVerify('清除密码', () =>
                  onSaveLock(clearMethod(lock, 'password')),
                )
              }>
              <Text style={[styles.smallButtonText, {color: colors.danger}]}>
                清除
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ---- flows ---- */}
        {step.kind === 'patternSet' ? (
          <View style={{alignItems: 'center', marginTop: 10}}>
            <Text style={font.dim}>
              {step.confirmOf == null ? '设置解锁图案' : '请再画一次确认'}
            </Text>
            <View style={{marginTop: 30, marginBottom: 40}}>
              <PatternPad
                hint={error ?? '至少连接 4 个点'}
                onComplete={dots => {
                  const secret = patternToString(dots);
                  if (step.confirmOf == null) {
                    setStep({...step, confirmOf: secret});
                  } else if (step.confirmOf === secret) {
                    finishPatternSet(secret);
                  } else {
                    setError('两次图案不一致，请重新设置');
                    setStep({...step, confirmOf: null});
                  }
                }}
              />
            </View>
          </View>
        ) : null}

        {step.kind === 'passwordSet' ? (
          <View style={{gap: 10}}>
            <Text style={font.dim}>
              {step.first == null ? '设置解锁密码（至少 4 位）' : '请再输入一次确认'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={step.first == null ? '输入密码' : '再次输入密码'}
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              value={password}
              onChangeText={setPasswordValue}
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
                  setPasswordValue('');
                  setError(null);
                } else if (step.first === password) {
                  finishPasswordSet(password);
                } else {
                  setError('两次密码不一致');
                  setStep({...step, first: null});
                  setPasswordValue('');
                }
              }}>
              <Text style={{color: '#fff', fontWeight: '600'}}>下一步</Text>
            </TouchableOpacity>
            {error != null ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        ) : null}

        {step.kind === 'verify' ? (
          <View style={{gap: 10}}>
            <Text style={font.dim}>{step.title}（可用任意已启用的方式）</Text>
            {lock.methods.biometric && biometricAvailable ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => runBiometricVerify(step.action)}>
                <Text style={{color: '#fff', fontWeight: '600'}}>
                  使用{biometricLabel(biometricType)}
                </Text>
              </TouchableOpacity>
            ) : null}
            {lock.methods.pattern != null ? (
              <View style={{alignItems: 'center', marginVertical: 10}}>
                <PatternPad
                  hint={error ?? '绘制当前图案'}
                  onComplete={dots =>
                    verifyBySecret(
                      'pattern',
                      patternToString(dots),
                      step.action,
                    )
                  }
                />
              </View>
            ) : null}
            {lock.methods.password != null ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="当前密码"
                  placeholderTextColor={colors.textFaint}
                  secureTextEntry
                  value={password}
                  onChangeText={setPasswordValue}
                />
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => verifyBySecret('password', password, step.action)}>
                  <Text style={{color: '#fff', fontWeight: '600'}}>验证</Text>
                </TouchableOpacity>
              </>
            ) : null}
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
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  smallButton: {
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallButtonText: {color: colors.textDim, fontSize: 13},
  hintWarn: {color: colors.star, fontSize: 12},
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
  errorText: {color: colors.danger, fontSize: 13},
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
});
