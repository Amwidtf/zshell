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
import {MachineRecord} from '@zshell/core-shell';
import {colors, font} from '../theme';

interface MachineListScreenProps {
  machines: MachineRecord[];
  onConnect: (id: string) => void;
  onScan: () => void;
  onManual: () => void;
  onSettings: () => void;
  onRename: (id: string, name: string) => void;
  onToggleFavorite: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDelete: (id: string) => void;
}

function hostOf(record: MachineRecord): string {
  try {
    return new URL(record.credentials.origin).host;
  } catch {
    return record.credentials.origin;
  }
}

export function MachineListScreen(props: MachineListScreenProps) {
  const {machines} = props;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteArmId, setDeleteArmId] = useState<string | null>(null);

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
          <Text style={styles.emptyEmoji}>📱➜🖥</Text>
          <Text style={font.body}>还没有配对的桌面端</Text>
          <Text style={[font.faint, {marginTop: 8, textAlign: 'center'}]}>
            在 ZCode 桌面端打开「Web 远程控制」生成二维码，{'\n'}
            用下方扫码配对；也可以直接粘贴配对链接。
          </Text>
        </ScrollView>
      ) : (
        <FlatList
          data={machines}
          keyExtractor={m => m.id}
          contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 120}}
          renderItem={({item, index}) => {
            const isFavoriteGroup = item.favorite;
            const showGroupHeader =
              index === 0
                ? isFavoriteGroup
                : isFavoriteGroup !== machines[index - 1].favorite;
            const expanded = expandedId === item.id;
            return (
              <View>
                {showGroupHeader ? (
                  <Text style={styles.groupHeader}>
                    {isFavoriteGroup ? '★ 收藏' : '全部'}
                  </Text>
                ) : null}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => props.onConnect(item.id)}
                  onLongPress={() => {
                    setExpandedId(expanded ? null : item.id);
                    setRenameValue(item.name);
                    setDeleteArmId(null);
                  }}>
                  <TouchableOpacity
                    style={styles.star}
                    onPress={() => props.onToggleFavorite(item.id)}>
                    <Text style={{fontSize: 18, color: item.favorite ? colors.star : colors.textFaint}}>
                      {item.favorite ? '★' : '☆'}
                    </Text>
                  </TouchableOpacity>
                  <View style={{flex: 1}}>
                    <Text style={font.body} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={font.faint} numberOfLines={1}>
                      {hostOf(item)} · sid …{item.credentials.sid.slice(-6)}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
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
                    <Text style={[font.faint, {marginTop: 6}]}>
                      长按行可再次展开/收起管理操作
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
  emptyEmoji: {fontSize: 40, marginBottom: 8},
  groupHeader: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 18,
    marginBottom: 6,
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  star: {paddingRight: 12},
  chevron: {color: colors.textFaint, fontSize: 20, paddingLeft: 8},
  actions: {
    backgroundColor: '#1c1c1c',
    borderRadius: 12,
    padding: 12,
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
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
});
