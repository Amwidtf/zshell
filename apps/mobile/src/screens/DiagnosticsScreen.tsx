import React, {useEffect, useState} from 'react';
import {
  Clipboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {DiagEvent} from '@zshell/core-shell';
import {clearDiag, diag} from '../diagnostics';
import {colors, font} from '../theme';

/** Human labels for diagnostic event types (raw type shown when unmapped). */
const LABELS: Record<string, string> = {
  'console-open': '打开控制台',
  'page-load-start': '页面开始加载',
  'page-reload': '手动重连',
  'auto-reload': '自动重连（回前台）',
  'app-active': '回到前台',
  'ws-open': '建立中继连接',
  'ws-connected': '中继已连接',
  'ws-closed': '中继连接关闭',
  'ws-error': '中继连接出错',
  'pair-status': '配对状态',
  kicked: '被顶下线',
  'approval-waiting': '等待批准',
  'network-online': '网络恢复',
  'network-offline': '网络断开',
  'load-error': '页面加载失败',
  'ssl-trust-reload': '信任证书后重连',
  'window-open': '打开授权页',
  'login-observed': '登录状态观测',
};

function timeText(t: number): string {
  const d = new Date(t);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/** Local-only connection timeline — the page to look at (and export) when
 * something feels off; nothing here ever leaves the device on its own. */
export function DiagnosticsScreen({onBack}: {onBack: () => void}) {
  const [events, setEvents] = useState<DiagEvent[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEvents(diag().recent());
  }, []);

  const copyAll = () => {
    Clipboard.setString(JSON.stringify(events));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{padding: 16, gap: 14}}>
      <TouchableOpacity onPress={onBack} style={{paddingVertical: 4}}>
        <Text style={{color: colors.accent, fontSize: 16}}>‹ 返回设置</Text>
      </TouchableOpacity>
      <Text style={styles.pageTitle}>连接诊断</Text>
      <Text style={font.faint}>
        最近 200 条连接相关事件，只存在本机。反馈问题时可复制，里面没有配对凭据
      </Text>

      <View style={{flexDirection: 'row', gap: 10}}>
        <TouchableOpacity style={styles.button} onPress={copyAll}>
          <Text style={styles.buttonText}>{copied ? '已复制' : '复制全部'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            clearDiag();
            setEvents([]);
          }}>
          <Text style={styles.buttonDanger}>清空</Text>
        </TouchableOpacity>
      </View>

      {events.length === 0 ? (
        <View style={styles.card}>
          <Text style={font.dim}>还没有记录。连接一台桌面端后这里会出现事件。</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {events.map((e, i) => (
            <View key={`${e.t}-${i}`} style={styles.row}>
              <Text style={styles.time}>{timeText(e.t)}</Text>
              <Text style={styles.type}>{LABELS[e.type] ?? e.type}</Text>
              {e.detail != null ? (
                <Text style={styles.detail} numberOfLines={1}>
                  {e.detail}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  pageTitle: {...font.title, marginBottom: 2},
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  row: {gap: 1},
  time: {color: colors.textFaint, fontSize: 11},
  type: {...font.body, fontSize: 14},
  detail: {color: colors.textDim, fontSize: 12},
  button: {
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  buttonText: {color: colors.textDim, fontSize: 13},
  buttonDanger: {color: colors.danger, fontSize: 13},
});
