import React, {useState} from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  hostKindOf,
  MachineRecord,
  relativeTime,
  sourceShortLabel,
} from '@zshell/core-shell';
import {colors, font, radius} from '../theme';

interface MachineListScreenProps {
  machines: MachineRecord[];
  onConnect: (id: string) => void;
  onScan: () => void;
  onManual: () => void;
  onSettings: () => void;
  onRename: (id: string, name: string) => void;
  onToggleFavorite: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onSetMuted: (id: string, muted: boolean) => void;
  onDelete: (id: string) => void;
  /**
   * Sign out of the web account (Kimi Code). Login data is account-level and
   * shared by every Kimi machine, so this affects all of them at once.
   */
  onSignOutWebLogin: () => void;
}

function hostOf(record: MachineRecord): string {
  try {
    return new URL(record.credentials.origin).host;
  } catch {
    return record.credentials.origin;
  }
}

type Row =
  | {type: 'host'; label: string}
  | {type: 'sub'; favorite: boolean}
  | {type: 'machine'; m: MachineRecord};

/** Group by host product (ZCode / Kimi Code), favorites-first inside each. */
function buildRows(machines: MachineRecord[]): Row[] {
  const groups: Array<[string, MachineRecord[]]> = [
    ['ZCode', machines.filter(m => hostKindOf(m.credentials) === 'zcode')],
    ['Kimi Code', machines.filter(m => hostKindOf(m.credentials) === 'kimi')],
  ];
  const rows: Row[] = [];
  for (const [label, group] of groups) {
    if (group.length === 0) {
      continue;
    }
    rows.push({type: 'host', label: `${label} · ${group.length} 台`});
    const hasFavorites = group.some(m => m.favorite);
    let prevFav: boolean | null = null;
    for (const m of group) {
      if (hasFavorites && m.favorite !== prevFav) {
        rows.push({type: 'sub', favorite: m.favorite});
        prevFav = m.favorite;
      }
      rows.push({type: 'machine', m});
    }
  }
  return rows;
}

/** Login pill for the card corner: text-first, color as support. */
function loginPillOf(m: MachineRecord): {label: string; color: string; bg: string} {
  if (hostKindOf(m.credentials) === 'kimi') {
    switch (m.loginState) {
      case 'logged-in':
        return {label: '已登录', color: colors.success, bg: colors.successSoft};
      case 'logged-out':
        return {label: '未登录', color: colors.danger, bg: colors.dangerSoft};
      default:
        return {label: '未确认', color: colors.textFaint, bg: 'transparent'};
    }
  }
  return {label: '就绪', color: colors.textDim, bg: colors.neutralSoft};
}

function machineMeta(m: MachineRecord, now: number): string {
  return [
    sourceShortLabel(m.credentials),
    hostOf(m),
    relativeTime(m.lastUsedAt, now),
  ]
    .filter(s => s.length > 0)
    .join(' · ');
}

export function MachineListScreen(props: MachineListScreenProps) {
  const {machines} = props;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteArmId, setDeleteArmId] = useState<string | null>(null);
  const [signOutArm, setSignOutArm] = useState(false);
  const rows = buildRows(machines);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={font.title}>我的机器</Text>
        <TouchableOpacity onPress={props.onSettings} style={styles.settingsButton}>
          <Text style={{color: colors.textDim, fontSize: 20}}>⚙</Text>
        </TouchableOpacity>
      </View>

      {machines.length === 0 ? (
        <ScrollView contentContainerStyle={styles.empty}>
          <View style={styles.emptyBadge}>
            <Text style={styles.emptyEmoji}>📱➜🖥</Text>
          </View>
          <Text style={font.body}>还没有配对的桌面端</Text>
          <Text style={[font.faint, {marginTop: 8, textAlign: 'center'}]}>
            先在 ZCode 或 Kimi Code 桌面端打开「远程控制」，{'\n'}
            用下方扫码；或者直接粘贴配对链接。
          </Text>
        </ScrollView>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row, index) =>
            row.type === 'machine' ? row.m.id : `${row.type}-${index}`
          }
          contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 120}}
          ListFooterComponent={
            <Text style={[font.faint, {marginTop: 18, textAlign: 'center'}]}>
              长按卡片可管理：重命名、收藏排序、静音、退出账号、删除
            </Text>
          }
          renderItem={({item: row, index}) => {
            if (row.type === 'host') {
              return (
                <Text style={[styles.hostHeader, index === 0 && styles.hostHeaderFirst]}>
                  {row.label}
                </Text>
              );
            }
            if (row.type === 'sub') {
              return (
                <Text style={styles.groupHeader}>
                  {row.favorite ? '★ 收藏' : '全部'}
                </Text>
              );
            }
            const item = row.m;
            const expanded = expandedId === item.id;
            const pill = loginPillOf(item);
            const meta = machineMeta(item, Date.now());
            return (
              <View>
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.85}
                  onPress={() => props.onConnect(item.id)}
                  onLongPress={() => {
                    setExpandedId(expanded ? null : item.id);
                    setRenameValue(item.name);
                    setDeleteArmId(null);
                    setSignOutArm(false);
                  }}>
                  <View style={styles.cardRow}>
                    <TouchableOpacity
                      style={styles.star}
                      onPress={() => props.onToggleFavorite(item.id)}>
                      <Text style={{fontSize: 18, color: item.favorite ? colors.star : colors.textFaint}}>
                        {item.favorite ? '★' : '☆'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {item.name}
                      {item.muted ? ' 🔇' : ''}
                    </Text>
                    <View
                      style={[styles.pill, {borderColor: pill.color, backgroundColor: pill.bg}]}
                      accessibilityLabel={`登录状态：${pill.label}`}
                      accessibilityRole="text">
                      <Text style={[font.pill, {color: pill.color}]}>{pill.label}</Text>
                    </View>
                  </View>
                  {meta.length > 0 ? (
                    <Text style={[font.faint, {marginTop: 6}]} numberOfLines={1}>
                      {meta}
                    </Text>
                  ) : null}
                </TouchableOpacity>

                {expanded ? (
                  <View style={styles.actions}>
                    <View style={styles.renameRow}>
                      <TextInput
                        style={styles.renameInput}
                        value={renameValue}
                        onChangeText={setRenameValue}
                        placeholder="重命名"
                        placeholderTextColor={colors.textFaint}
                      />
                      <TouchableOpacity
                        style={styles.smallButton}
                        onPress={() => {
                          props.onRename(item.id, renameValue);
                          setExpandedId(null);
                        }}>
                        <Text style={styles.smallButtonText}>保存</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[font.faint, {marginTop: 2}]}>
                      sid …{item.credentials.sid.slice(-6)}
                    </Text>
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.smallButton}
                        onPress={() => props.onMove(item.id, -1)}>
                        <Text style={styles.smallButtonText}>↑ 上移</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.smallButton}
                        onPress={() => props.onMove(item.id, 1)}>
                        <Text style={styles.smallButtonText}>↓ 下移</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.smallButton}
                        onPress={() => props.onSetMuted(item.id, !item.muted)}>
                        <Text style={styles.smallButtonText}>
                          {item.muted ? '🔕 取消静音' : '🔕 静音通知'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.smallButton,
                          deleteArmId === item.id && styles.dangerButton,
                        ]}
                        onPress={() => {
                          if (deleteArmId === item.id) {
                            props.onDelete(item.id);
                            setExpandedId(null);
                            setDeleteArmId(null);
                          } else {
                            setDeleteArmId(item.id);
                          }
                        }}>
                        <Text style={[styles.smallButtonText, {color: colors.danger}]}>
                          {deleteArmId === item.id ? '再点一次确认删除' : '删除'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {hostKindOf(item.credentials) === 'kimi' ? (
                      <View style={styles.signOutRow}>
                        <Text style={[font.faint, {flex: 1}]}>
                          退出 Kimi 账号（全部 Kimi 机器均需重新登录，配对记录不受影响）
                        </Text>
                        <TouchableOpacity
                          style={[styles.smallButton, signOutArm && styles.dangerButton]}
                          onPress={() => {
                            if (signOutArm) {
                              props.onSignOutWebLogin();
                              setExpandedId(null);
                              setSignOutArm(false);
                            } else {
                              setSignOutArm(true);
                            }
                          }}>
                          <Text style={[styles.smallButtonText, {color: colors.danger}]}>
                            {signOutArm ? '确认退出' : '退出 Kimi 账号'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    <Text style={[font.faint, {marginTop: 6}]}>
                      长按条目展开管理，再长按收起
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.primaryButton} onPress={props.onScan}>
          <Text style={styles.primaryButtonText}>扫码配对</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={props.onManual}>
          <Text style={{color: colors.accent, fontSize: 15}}>手动输入链接</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  settingsButton: {padding: 8},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 6},
  emptyBadge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  emptyEmoji: {fontSize: 36},
  hostHeader: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 22,
    marginBottom: 2,
    letterSpacing: 1,
  },
  hostHeaderFirst: {marginTop: 8},
  groupHeader: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 12,
    marginBottom: 6,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.l,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 8,
  },
  cardRow: {flexDirection: 'row', alignItems: 'center'},
  star: {paddingRight: 10},
  cardName: {...font.body, fontWeight: '600', flex: 1},
  pill: {
    borderRadius: radius.s,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginLeft: 10,
  },
  actions: {
    backgroundColor: '#1c1c1c',
    borderRadius: radius.m,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    marginTop: 6,
    marginBottom: 8,
    gap: 10,
  },
  renameRow: {flexDirection: 'row', gap: 8, alignItems: 'center'},
  renameInput: {
    flex: 1,
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
    fontSize: 14,
  },
  actionRow: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  signOutRow: {flexDirection: 'row', gap: 10, alignItems: 'center'},
  smallButton: {
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dangerButton: {backgroundColor: 'rgba(229,83,75,0.2)'},
  smallButtonText: {color: colors.textDim, fontSize: 13},
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: 'rgba(22,22,22,0.94)',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.m,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.m,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
});
