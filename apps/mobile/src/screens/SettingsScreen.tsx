import React, {useEffect, useState} from 'react';
import {
  Clipboard,
  Linking,
  Modal,
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
  formatBytes,
  formatPercent,
  isNewer as isNewerVersion,
  LockConfig,
  patternToString,
  ReleaseInfo,
  setPassword,
  setPattern,
  setBiometric,
  verifySecret,
} from '@zshell/core-shell';
import {biometricAuth} from '../biometric';
import {LegalDocModal} from '../components/LegalDocModal';
import {MarkdownText} from '../components/MarkdownText';
import {OSS_LICENSES, PRIVACY_POLICY, USER_AGREEMENT, LegalDoc} from '../legal';
import {AppPrefs, loadPrefs, savePrefs} from '../notifications';
import {PatternPad} from '../PatternPad';
import {
  openDownloadedFile,
  openInBrowser,
  queryDownloads,
  startUpdateDownload,
} from '../downloads';
import {fetchLatestRelease, PROJECT_PAGE} from '../updater';
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
  onOpenPermissions: () => void;
  onOpenDownloads: () => void;
}

type Step =
  | {kind: 'idle'}
  | {kind: 'patternSet'; confirmOf: string | null}
  | {kind: 'passwordSet'; first: string | null}
  | {kind: 'verify'; title: string; action: () => void};

type UpdateState =
  | {kind: 'idle'}
  | {kind: 'checking'}
  | {kind: 'failed'}
  | {kind: 'latest'; release: ReleaseInfo}
  | {kind: 'available'; release: ReleaseInfo}
  | {kind: 'downloading'; release: ReleaseInfo; id: number}
  | {kind: 'downloaded'; release: ReleaseInfo; id: number}
  | {kind: 'downloadFailed'; release: ReleaseInfo; reason: string};

/** Settings: multi-method lock management + update check + legal center. */
export function SettingsScreen({lock, onSaveLock, onBack, onOpenPermissions, onOpenDownloads}: SettingsScreenProps) {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string | undefined>();
  const [step, setStep] = useState<Step>({kind: 'idle'});
  const [password, setPasswordValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<LegalDoc | null>(null);
  const [update, setUpdate] = useState<UpdateState>({kind: 'idle'});
  const [progress, setProgress] = useState<{bytes: number; total: number} | null>(null);
  const [openApkError, setOpenApkError] = useState<string | null>(null);
  const [notesRelease, setNotesRelease] = useState<ReleaseInfo | null>(null);
  const [prefs, setPrefs] = useState<AppPrefs>({
    notificationsEnabled: true,
    autoCheckUpdates: true,
  });

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

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

  // ---------- lock management ----------

  const requestVerify = (title: string, action: () => void) => {
    setPasswordValue('');
    setError(null);
    setStep({kind: 'verify', title, action});
  };

  const verifyBySecret = (
    kind: 'pattern' | 'password',
    secret: string,
    action: () => void,
  ) => {
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

  const submitPasswordSet = () => {
    if (step.kind !== 'passwordSet') {
      return;
    }
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
  };

  // ---------- update flow ----------

  const checkUpdate = async () => {
    setUpdate({kind: 'checking'});
    const release = await fetchLatestRelease();
    if (release == null) {
      setUpdate({kind: 'failed'});
      return;
    }
    setUpdate(
      isNewerVersion(APP_VERSION, release)
        ? {kind: 'available', release}
        : {kind: 'latest', release},
    );
  };

  const startDownload = async (release: ReleaseInfo) => {
    setOpenApkError(null);
    setProgress(null);
    try {
      const id = await startUpdateDownload(release);
      setUpdate({kind: 'downloading', release, id});
    } catch (e) {
      const reason = e instanceof Error && e.message ? e.message : '未知原因';
      setUpdate({kind: 'downloadFailed', release, reason});
    }
  };

  // Poll the system download manager for the running update download; the
  // installer itself launches natively when the file completes.
  useEffect(() => {
    if (update.kind !== 'downloading') {
      return;
    }
    const {release, id} = update;
    const poll = async () => {
      try {
        const items = await queryDownloads();
        const item = items.find(i => i.id === id);
        if (item == null) {
          // Removed elsewhere (e.g. cancelled in 下载管理).
          setUpdate({kind: 'available', release});
          setProgress(null);
          return;
        }
        if (item.status === 'successful') {
          setUpdate({kind: 'downloaded', release, id});
          setProgress(null);
          return;
        }
        if (item.status === 'failed') {
          setUpdate({kind: 'downloadFailed', release, reason: item.reason ?? '未知原因'});
          setProgress(null);
          return;
        }
        setProgress({bytes: item.bytesSoFar, total: item.totalBytes});
      } catch {
        // transient query failure — keep waiting
      }
    };
    poll();
    const timer = setInterval(poll, 1000);
    return () => clearInterval(timer);
  }, [update]);

  const sizeText = (bytes: number | null) =>
    bytes == null ? '' : `${Math.round(bytes / 1048576)} MB`;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{padding: 16, gap: 14}}>
      <TouchableOpacity onPress={onBack} style={{paddingVertical: 4}}>
        <Text style={{color: colors.accent, fontSize: 16}}>‹ 返回列表</Text>
      </TouchableOpacity>
      <Text style={styles.pageTitle}>设置</Text>

      {/* ================= 应用锁 ================= */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>应用锁</Text>
        <Text style={font.dim}>
          {lock.enabled
            ? `已启用：${enabledNames.join(' + ')}，任选一种即可解锁`
            : '未启用。可以同时开启多种解锁方式，避免单一方式失灵时被锁在外面'}
        </Text>
        {onlyBiometric ? (
          <Text style={styles.hintWarn}>
            当前仅启用生物识别，建议再设置图案或密码作为备用
          </Text>
        ) : null}

        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={font.body}>{biometricLabel(biometricType)}</Text>
            <Text style={font.faint}>
              {biometricAvailable
                ? '验证通过后开启；使用系统指纹 / 人脸'
                : '本机暂无可用生物识别（容器/模拟器通常不支持）'}
            </Text>
          </View>
          <Switch
            value={lock.methods.biometric}
            disabled={!biometricAvailable && !lock.methods.biometric}
            onValueChange={async on => {
              setError(null);
              if (!on) {
                onSaveLock(setBiometric(lock, false));
                return;
              }
              const ok = await biometricAuth.prompt('验证通过后开启生物识别');
              if (ok) {
                onSaveLock(setBiometric(lock, true));
              } else {
                setError('验证未通过，未开启生物识别');
              }
            }}
            trackColor={{true: colors.accent}}
            thumbColor="#ffffff"
          />
        </View>
        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={font.body}>图案</Text>
            <Text style={font.faint}>
              {lock.methods.pattern != null ? '已设置' : '未设置'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.rowButton}
            onPress={() => {
              setError(null);
              setStep({kind: 'patternSet', confirmOf: null});
            }}>
            <Text style={styles.rowButtonText}>
              {lock.methods.pattern != null ? '更换' : '设置'}
            </Text>
          </TouchableOpacity>
          {lock.methods.pattern != null ? (
            <TouchableOpacity
              style={styles.rowButton}
              onPress={() =>
                requestVerify('清除图案', () =>
                  onSaveLock(clearMethod(lock, 'pattern')),
                )
              }>
              <Text style={[styles.rowButtonText, {color: colors.danger}]}>
                清除
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={font.body}>密码</Text>
            <Text style={font.faint}>
              {lock.methods.password != null ? '已设置' : '未设置'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.rowButton}
            onPress={() => {
              setError(null);
              setPasswordValue('');
              setStep({kind: 'passwordSet', first: null});
            }}>
            <Text style={styles.rowButtonText}>
              {lock.methods.password != null ? '更换' : '设置'}
            </Text>
          </TouchableOpacity>
          {lock.methods.password != null ? (
            <TouchableOpacity
              style={styles.rowButton}
              onPress={() =>
                requestVerify('清除密码', () =>
                  onSaveLock(clearMethod(lock, 'password')),
                )
              }>
              <Text style={[styles.rowButtonText, {color: colors.danger}]}>
                清除
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {step.kind === 'patternSet' ? (
          <View style={{alignItems: 'center', marginTop: 14}}>
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
          <View style={{gap: 10, marginTop: 10}}>
            <Text style={font.dim}>
              {step.first == null ? '设置解锁密码（至少 4 位）' : '请再输入一次确认'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={step.first == null ? '输入密码' : '再次输入密码'}
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              returnKeyType="done"
              value={password}
              onChangeText={setPasswordValue}
              onSubmitEditing={submitPasswordSet}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={submitPasswordSet}>
              <Text style={{color: '#fff', fontWeight: '600'}}>下一步</Text>
            </TouchableOpacity>
            {error != null ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        ) : null}

        {step.kind === 'verify' ? (
          <View style={{gap: 10, marginTop: 10}}>
            <Text style={font.dim}>{step.title}（可用任意已启用的方式）</Text>
            {lock.methods.biometric && biometricAvailable ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={async () => {
                  const ok = await biometricAuth.prompt('验证以继续');
                  if (ok) {
                    step.action();
                    setStep({kind: 'idle'});
                  } else {
                    setError('验证未通过');
                  }
                }}>
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
                    verifyBySecret('pattern', patternToString(dots), step.action)
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
                  returnKeyType="done"
                  value={password}
                  onChangeText={setPasswordValue}
                  onSubmitEditing={() =>
                    verifyBySecret('password', password, step.action)
                  }
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

      {/* ================= 更新 ================= */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>更新</Text>
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={font.body}>当前版本 v{APP_VERSION}</Text>
            <Text style={font.faint}>从 GitHub Releases 检查新版本</Text>
          </View>
          <TouchableOpacity
            style={styles.rowButton}
            disabled={update.kind === 'checking' || update.kind === 'downloading'}
            onPress={checkUpdate}>
            <Text style={styles.rowButtonText}>
              {update.kind === 'checking' ? '检查中…' : '检查更新'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={font.body}>启动时自动检查</Text>
            <Text style={font.faint}>发现新版本时本地通知提醒（不自动安装）</Text>
          </View>
          <Switch
            value={prefs.autoCheckUpdates}
            onValueChange={on => {
              const next = {...prefs, autoCheckUpdates: on};
              setPrefs(next);
              savePrefs(next);
            }}
            trackColor={{true: colors.accent}}
            thumbColor="#ffffff"
          />
        </View>

        {update.kind === 'failed' ? (
          <Text style={styles.errorText}>
            检查失败：无法访问 GitHub（国内网络可能需要代理）
          </Text>
        ) : null}
        {update.kind === 'latest' ? (
          <View style={{gap: 8, marginTop: 4}}>
            <Text style={font.faint}>已是最新版本（v{update.release.version}）。</Text>
            {/* Same-version re-download: covers republished releases. */}
            <TouchableOpacity
              style={styles.rowButton}
              onPress={() => startDownload(update.release)}>
              <Text style={styles.rowButtonText}>重新下载安装当前版本</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {update.kind === 'available' || update.kind === 'downloading' || update.kind === 'downloaded' || update.kind === 'downloadFailed' ? (
          <View style={{gap: 10, marginTop: 10}}>
            <Text style={font.body}>
              新版本 v{update.release.version}
              {update.release.apkSize != null
                ? ` · ${sizeText(update.release.apkSize)}`
                : ''}
            </Text>
            {update.release.notes.length > 0 ? (
              <TouchableOpacity
                onPress={() => setNotesRelease(update.release)}
                activeOpacity={0.7}>
                <Text style={font.faint} numberOfLines={4}>
                  {update.release.notes}
                </Text>
                <Text style={{color: colors.accent, fontSize: 13, marginTop: 4}}>
                  查看完整说明 ›
                </Text>
              </TouchableOpacity>
            ) : null}
            {update.kind === 'downloading' ? (
              <View style={{gap: 6}}>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${
                          progress != null && progress.total > 0
                            ? Math.min(100, (progress.bytes / progress.total) * 100)
                            : 0
                        }%`,
                      },
                    ]}
                  />
                </View>
                <Text style={font.faint}>
                  {progress != null && progress.total > 0
                    ? `下载中 ${formatPercent(progress.bytes, progress.total)} · ` +
                      `${formatBytes(progress.bytes)} / ${formatBytes(progress.total)}`
                    : progress != null && progress.bytes > 0
                      ? `下载中 · ${formatBytes(progress.bytes)}`
                      : '等待开始下载…'}
                  （进度也可在 下载管理 查看，完成后自动弹出安装）
                </Text>
              </View>
            ) : null}
            {update.kind === 'downloaded' ? (
              <View style={{gap: 8}}>
                <Text style={{color: colors.success, fontSize: 13}}>
                  安装包已下载完成，安装器应已自动弹出
                </Text>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    setOpenApkError(null);
                    openDownloadedFile(update.id).catch(e => {
                      setOpenApkError(
                        e instanceof Error && e.message ? e.message : '无法打开安装包',
                      );
                    });
                  }}>
                  <Text style={{color: '#fff', fontWeight: '600'}}>打开安装包</Text>
                </TouchableOpacity>
                {openApkError != null ? (
                  <Text style={styles.errorText}>{openApkError}</Text>
                ) : null}
              </View>
            ) : null}
            {update.kind === 'available' ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => startDownload(update.release)}>
                <Text style={{color: '#fff', fontWeight: '600'}}>
                  下载并安装
                </Text>
              </TouchableOpacity>
            ) : null}
            {update.kind === 'downloadFailed' ? (
              <View style={{gap: 8}}>
                <Text style={styles.errorText}>{update.reason}</Text>
                <View style={{flexDirection: 'row', gap: 12, alignItems: 'center'}}>
                  <TouchableOpacity
                    style={styles.rowButton}
                    onPress={() => openInBrowser(update.release.apkUrl)}>
                    <Text style={styles.rowButtonText}>浏览器下载</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rowButton}
                    onPress={() => {
                      Clipboard.setString(update.release.apkUrl);
                    }}>
                    <Text style={styles.rowButtonText}>复制链接</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* ================= 下载管理（二级页面） ================= */}
      <TouchableOpacity style={styles.card} onPress={onOpenDownloads}>
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={font.body}>下载管理</Text>
            <Text style={font.faint}>应用更新与控制台文件的下载进度、取消与打开</Text>
          </View>
          <Text style={{color: colors.textFaint, fontSize: 18}}>›</Text>
        </View>
      </TouchableOpacity>

      {/* ================= 权限与通知（二级页面） ================= */}
      <TouchableOpacity style={styles.card} onPress={onOpenPermissions}>
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={font.body}>权限与通知</Text>
            <Text style={font.faint}>相机 / 系统通知权限的检查与申请，状态通知开关</Text>
          </View>
          <Text style={{color: colors.textFaint, fontSize: 18}}>›</Text>
        </View>
      </TouchableOpacity>

      {/* ================= 法律与关于 ================= */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>法律与关于</Text>
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
        <TouchableOpacity
          style={styles.legalRow}
          onPress={() => Linking.openURL(PROJECT_PAGE)}>
          <Text style={styles.legalRowText}>项目主页（GitHub）</Text>
          <Text style={{color: colors.textFaint, fontSize: 18}}>›</Text>
        </TouchableOpacity>
        <Text style={[font.faint, {marginTop: 8, textAlign: 'center'}]}>
          ZShell · 非官方第三方客户端 · 零数据收集
        </Text>
      </View>

      <LegalDocModal doc={openDoc} onClose={() => setOpenDoc(null)} />

      {/* Full update-notes viewer (markdown-rendered CHANGELOG section). */}
      <Modal
        visible={notesRelease != null}
        animationType="slide"
        onRequestClose={() => setNotesRelease(null)}>
        <View style={styles.notesRoot}>
          <View style={styles.notesTopBar}>
            <TouchableOpacity
              onPress={() => setNotesRelease(null)}
              style={styles.backButton}>
              <Text style={{color: colors.accent, fontSize: 16}}>‹ 返回</Text>
            </TouchableOpacity>
            <Text style={font.body}>v{notesRelease?.version} 更新说明</Text>
            <View style={{width: 64}} />
          </View>
          <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 40}}>
            <MarkdownText text={notesRelease?.notes ?? ''} />
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  pageTitle: {...font.title, marginBottom: 2},
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    color: colors.textFaint,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 2,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  rowMain: {flex: 1, gap: 2},
  rowButton: {
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rowButtonText: {color: colors.textDim, fontSize: 13},
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
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
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgInput,
    overflow: 'hidden',
  },
  fill: {height: 4, borderRadius: 2, backgroundColor: colors.accent},
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
  notesRoot: {flex: 1, backgroundColor: colors.bg},
  backButton: {paddingHorizontal: 10, paddingVertical: 8},
  notesTopBar: {
    height: 52,
    backgroundColor: colors.bgElevated,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
