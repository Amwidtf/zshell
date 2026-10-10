import React, {useCallback, useEffect, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {formatBytes, formatPercent} from '@zshell/core-shell';
import {
  DownloadItem,
  isActive,
  openDownloadedFile,
  queryDownloads,
  removeDownload,
  retryDownload,
} from '../downloads';
import {colors, font} from '../theme';

/** Second-level page: every download this app uid owns — update APKs and
 * files downloaded from console pages — with live progress from the system
 * download manager. */
export function DownloadsScreen({onBack}: {onBack: () => void}) {
  const [items, setItems] = useState<DownloadItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await queryDownloads());
      setError(null);
    } catch {
      setError('无法读取下载列表，请稍后重试');
    }
  }, []);

  useEffect(() => {
    refresh();
    // Fixed cadence: a cursor query is cheap and this keeps the timer simple.
    const timer = setInterval(refresh, 1500);
    return () => clearInterval(timer);
  }, [refresh]);

  const act = (fn: () => Promise<unknown>) => {
    setActionError(null);
    fn()
      .then(refresh)
      .catch(e => {
        setActionError(e instanceof Error && e.message ? e.message : '操作失败');
      });
  };

  const statusText = (item: DownloadItem): string => {
    switch (item.status) {
      case 'pending':
        return '等待中…';
      case 'running':
        return item.totalBytes > 0
          ? `下载中 ${formatPercent(item.bytesSoFar, item.totalBytes)} · ` +
              `${formatBytes(item.bytesSoFar)} / ${formatBytes(item.totalBytes)}`
          : `下载中 · ${formatBytes(item.bytesSoFar)}`;
      case 'paused':
        return '已暂停';
      case 'successful':
        return '已完成';
      case 'failed':
        return `失败：${item.reason ?? '未知原因'}`;
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{padding: 16, gap: 14}}>
      <TouchableOpacity onPress={onBack} style={{paddingVertical: 4}}>
        <Text style={{color: colors.accent, fontSize: 16}}>‹ 返回设置</Text>
      </TouchableOpacity>
      <Text style={styles.pageTitle}>下载管理</Text>
      <Text style={font.faint}>
        应用更新与控制台页面里触发的下载都会出现在这里（控制台文件保存在系统公共下载目录）
      </Text>

      {error != null ? <Text style={styles.errorText}>{error}</Text> : null}
      {actionError != null ? <Text style={styles.errorText}>{actionError}</Text> : null}

      {items != null && items.length === 0 ? (
        <View style={styles.card}>
          <Text style={font.dim}>暂无下载记录</Text>
        </View>
      ) : null}

      {items?.map(item => {
        const pct =
          item.totalBytes > 0
            ? Math.min(100, (item.bytesSoFar / item.totalBytes) * 100)
            : 0;
        return (
          <View key={item.id} style={styles.card}>
            <View style={styles.headRow}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.kindBadge}>
                {item.kind === 'update' ? '更新包' : '文件'}
              </Text>
            </View>
            {isActive(item.status) && item.totalBytes > 0 ? (
              <View style={styles.track}>
                <View style={[styles.fill, {width: `${pct}%`}]} />
              </View>
            ) : null}
            <Text
              style={
                item.status === 'failed'
                  ? styles.errorText
                  : item.status === 'successful'
                    ? styles.doneText
                    : font.faint
              }>
              {statusText(item)}
            </Text>
            <View style={styles.actions}>
              {isActive(item.status) ? (
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => act(() => removeDownload(item.id))}>
                  <Text style={styles.buttonDanger}>取消</Text>
                </TouchableOpacity>
              ) : null}
              {item.status === 'successful' ? (
                <>
                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => act(() => openDownloadedFile(item.id))}>
                    <Text style={styles.buttonText}>打开</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => act(() => removeDownload(item.id))}>
                    <Text style={styles.buttonDanger}>删除</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              {item.status === 'failed' ? (
                <>
                  {item.url.length > 0 ? (
                    <TouchableOpacity
                      style={styles.button}
                      onPress={() => act(() => retryDownload(item))}>
                      <Text style={styles.buttonText}>重试</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => act(() => removeDownload(item.id))}>
                    <Text style={styles.buttonDanger}>删除</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          </View>
        );
      })}
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
  headRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  name: {...font.body, flex: 1},
  kindBadge: {
    color: colors.textFaint,
    fontSize: 11,
    backgroundColor: colors.bgInput,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgInput,
    overflow: 'hidden',
  },
  fill: {height: 4, borderRadius: 2, backgroundColor: colors.accent},
  doneText: {color: colors.success, fontSize: 13},
  actions: {flexDirection: 'row', gap: 10, marginTop: 2},
  button: {
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  buttonText: {color: colors.textDim, fontSize: 13},
  buttonDanger: {color: colors.danger, fontSize: 13},
  errorText: {color: colors.danger, fontSize: 13},
});
