import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {
  formatBytes,
  LockConfig,
  MachineRecord,
  serializeLockConfig,
  STORAGE_KEYS,
} from '@zshell/core-shell';
import {DonutChart, DonutSegment} from '../components/DonutChart';
import {cleanupInstalledApks, clearWebSession, queryDownloads, removeDownload} from '../downloads';
import {clearDiag, diagSize} from '../diagnostics';
import {secureStore} from '../storage';
import {colors, font} from '../theme';

interface DataManageScreenProps {
  machines: MachineRecord[];
  lock: LockConfig;
  onBack: () => void;
}

interface Category {
  key: string;
  name: string;
  color: string;
  bytes: number;
  protectedData: boolean;
  desc: string;
}

/**
 * Second-level page: what this app stores on the device, as a donut +
 * percentage breakdown. Cache-type data (logs, downloads, web login) has
 * explicit clear actions; security-bearing data (pairings, app lock, legal
 * consent, preferences) is listed as protected with no clear button, so a
 * stray tap can never lock the user out or orphan their machines.
 */
export function DataManageScreen({machines, lock, onBack}: DataManageScreenProps) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [downloadsBytes, setDownloadsBytes] = useState(0);
  // Two-tap armed clears, mirroring 网页登录状态 in settings.
  const [armClearDownloads, setArmClearDownloads] = useState(false);
  const [armClearWeb, setArmClearWeb] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    let downloadsTotal = 0;
    try {
      const items = await queryDownloads();
      downloadsTotal = items.reduce((sum, i) => sum + i.bytesSoFar, 0);
    } catch {
      // downloads unavailable — still show the rest
    }
    const machinesBytes = JSON.stringify(machines).length;
    const lockBytes = serializeLockConfig(lock).length;
    const prefsBytes =
      (secureStore.getString(STORAGE_KEYS.prefs) ?? '').length +
      (secureStore.getString(STORAGE_KEYS.legal) ?? '').length;
    setDownloadsBytes(downloadsTotal);
    setCategories([
      {
        key: 'machines',
        name: '配对机器数据',
        color: colors.accent,
        bytes: machinesBytes,
        protectedData: true,
        desc: '机器列表与配对凭据（加密存储），清理后将无法连接桌面端',
      },
      {
        key: 'lock',
        name: '应用锁配置',
        color: colors.danger,
        bytes: lockBytes,
        protectedData: true,
        desc: '解锁方式的校验数据，清理后需要重新设置图案 / 密码',
      },
      {
        key: 'prefs',
        name: '设置与同意记录',
        color: colors.star,
        bytes: prefsBytes,
        protectedData: true,
        desc: '应用偏好与法律同意状态',
      },
      {
        key: 'diag',
        name: '连接诊断日志',
        color: colors.success,
        bytes: diagSize(),
        protectedData: false,
        desc: '最近连接事件时间线，仅存本机',
      },
      {
        key: 'downloads',
        name: '下载文件',
        color: colors.textFaint,
        bytes: downloadsTotal,
        protectedData: false,
        desc: '更新安装包与控制台下载的文件',
      },
    ]);
  }, [machines, lock]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clearDiagLog = () => {
    try {
      clearDiag();
      setNote('诊断日志已清空');
      refresh();
    } catch {
      setError('清空日志失败，请重试');
    }
  };

  const clearAllDownloads = async () => {
    setError(null);
    try {
      const items = await queryDownloads();
      for (const item of items) {
        await removeDownload(item.id);
      }
      await cleanupInstalledApks();
      setNote(`已删除 ${items.length} 条下载记录与文件`);
      setArmClearDownloads(false);
      refresh();
    } catch {
      setError('清理下载失败，请重试');
    }
  };

  const clearWeb = async () => {
    setError(null);
    try {
      await clearWebSession();
      setNote('已清除全部网页登录数据');
      setArmClearWeb(false);
    } catch {
      setError('清除失败，可稍后重试');
    }
  };

  const total = (categories ?? []).reduce((sum, c) => sum + c.bytes, 0);
  const donutSegments: DonutSegment[] = (categories ?? []).map(c => ({
    key: c.key,
    value: c.bytes,
    color: c.color,
  }));
  const percent = (bytes: number): string =>
    total > 0 ? `${((bytes / total) * 100).toFixed(1)}%` : '—';

  const protectedRows = (categories ?? []).filter(c => c.protectedData);
  const clearableRows = (categories ?? []).filter(c => !c.protectedData);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{padding: 16, gap: 14}}>
      <TouchableOpacity onPress={onBack} style={{paddingVertical: 4}}>
        <Text style={{color: colors.accent, fontSize: 16}}>‹ 返回设置</Text>
      </TouchableOpacity>
      <Text style={styles.pageTitle}>数据管理</Text>
      <Text style={font.faint}>
        本机数据占用一览。缓存类数据可在这里清理；安全配置受保护，不提供
        清理入口
      </Text>

      {error != null ? <Text style={styles.errorText}>{error}</Text> : null}
      {note != null ? <Text style={styles.noteText}>{note}</Text> : null}

      {/* ================= 占用总览（环形图） ================= */}
      <View style={[styles.card, {alignItems: 'center', paddingVertical: 20}]}>
        <DonutChart
          segments={donutSegments}
          centerValue={formatBytes(total)}
          centerLabel="本机数据总占用"
        />
        <View style={{width: '100%', gap: 10, marginTop: 18}}>
          {(categories ?? []).map(c => (
            <View key={c.key} style={styles.legendRow}>
              <View style={[styles.dot, {backgroundColor: c.color}]} />
              <Text style={[font.dim, {flex: 1}]}>{c.name}</Text>
              <Text style={font.faint}>{formatBytes(c.bytes)}</Text>
              <Text style={[font.faint, {width: 52, textAlign: 'right'}]}>
                {percent(c.bytes)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* ================= 可清理数据 ================= */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>可清理数据</Text>
        {clearableRows.map(c => (
          <View key={c.key} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={font.body}>{c.name}</Text>
              <Text style={font.faint}>
                {c.desc} · 当前 {formatBytes(c.bytes)}
              </Text>
            </View>
            {c.key === 'diag' ? (
              <TouchableOpacity style={styles.rowButton} onPress={clearDiagLog}>
                <Text style={styles.rowButtonText}>清空</Text>
              </TouchableOpacity>
            ) : null}
            {c.key === 'downloads' ? (
              <TouchableOpacity
                style={[styles.rowButton, armClearDownloads && styles.rowButtonArmed]}
                onPress={() => {
                  if (!armClearDownloads) {
                    setArmClearDownloads(true);
                    return;
                  }
                  clearAllDownloads();
                }}>
                <Text style={styles.rowButtonText}>
                  {armClearDownloads ? '确认删除全部' : '清理'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={font.body}>网页登录数据</Text>
            <Text style={font.faint}>
              控制台网页的 Cookie 与缓存；清除后需重新登录官方账号
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.rowButton, armClearWeb && styles.rowButtonArmed]}
            onPress={() => {
              if (!armClearWeb) {
                setArmClearWeb(true);
                return;
              }
              clearWeb();
            }}>
            <Text style={styles.rowButtonText}>
              {armClearWeb ? '确认清除' : '清除'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ================= 受保护数据 ================= */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>受保护数据 🔒</Text>
        <Text style={font.faint}>
          与安全和连接相关的数据不提供清理入口，防止误清导致应用锁死或
          机器失联；如需重置，请在设置里逐项移除
        </Text>
        {protectedRows.map(c => (
          <View key={c.key} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={font.body}>{c.name}</Text>
              <Text style={font.faint}>{c.desc}</Text>
            </View>
            <Text style={font.dim}>{formatBytes(c.bytes)}</Text>
          </View>
        ))}
      </View>

      <Text style={[font.faint, {textAlign: 'center', marginTop: 4}]}>
        ZShell 零数据收集：以上数据全部只存在本机，不上传任何服务器
      </Text>
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
    gap: 10,
  },
  cardTitle: {
    color: colors.textFaint,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 2,
  },
  legendRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  dot: {width: 10, height: 10, borderRadius: 5},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  rowMain: {flex: 1, gap: 2},
  rowButton: {
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rowButtonArmed: {backgroundColor: colors.dangerSoft},
  rowButtonText: {color: colors.textDim, fontSize: 13},
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  errorText: {color: colors.danger, fontSize: 13},
  noteText: {color: colors.success, fontSize: 13},
});
