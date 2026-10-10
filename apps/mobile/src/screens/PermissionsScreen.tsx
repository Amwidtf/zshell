import React, {useEffect, useState} from 'react';
import {
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {notifications, AppPrefs, loadPrefs, savePrefs} from '../notifications';
import {biometricLabel} from './LockScreen';
import {colors, font} from '../theme';

interface PermissionsScreenProps {
  onBack: () => void;
}

/**
 * Permission center: check / request / jump-to-settings for each runtime
 * permission the app uses, plus the status-notification toggle. Kept as its
 * own screen so the settings page stays short as permissions grow.
 */
export function PermissionsScreen({onBack}: PermissionsScreenProps) {
  const [prefs, setPrefs] = useState<AppPrefs>({notificationsEnabled: true});
  // null = still checking, true/false = granted or not.
  const [camGranted, setCamGranted] = useState<boolean | null>(null);
  const [camBlocked, setCamBlocked] = useState(false);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [notifBlocked, setNotifBlocked] = useState(false);

  const refreshPermissions = async () => {
    try {
      setCamGranted(
        await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA),
      );
    } catch {
      setCamGranted(null);
    }
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        setNotifGranted(
          await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          ),
        );
      } catch {
        setNotifGranted(null);
      }
    } else if (notifications != null) {
      try {
        setNotifGranted(await notifications.areEnabled());
      } catch {
        setNotifGranted(null);
      }
    } else {
      setNotifGranted(true);
    }
  };

  useEffect(() => {
    setPrefs(loadPrefs());
    refreshPermissions();
  }, []);

  const requestPermission = async (
    permission: string,
    setGranted: (v: boolean) => void,
    setBlocked: (v: boolean) => void,
  ) => {
    try {
      const result = await PermissionsAndroid.request(permission);
      setGranted(result === PermissionsAndroid.RESULTS.GRANTED);
      setBlocked(result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    } catch {
      setGranted(false);
    }
  };

  const statusText = (granted: boolean | null, blocked: boolean) =>
    granted == null ? '检查中…' : granted ? '已授权' : blocked ? '已拒绝，需到系统设置开启' : '未授权';

  return (
    <ScrollView style={styles.root} contentContainerStyle={{padding: 16, gap: 14}}>
      <TouchableOpacity onPress={onBack} style={{paddingVertical: 4}}>
        <Text style={{color: colors.accent, fontSize: 16}}>‹ 返回设置</Text>
      </TouchableOpacity>
      <Text style={styles.pageTitle}>权限与通知</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>通知</Text>
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={font.body}>状态通知</Text>
            <Text style={font.faint}>连接断开、被顶下线、等待批准、发现新版本时提醒</Text>
          </View>
          <Switch
            value={prefs.notificationsEnabled}
            onValueChange={on => {
              const next = {...prefs, notificationsEnabled: on};
              setPrefs(next);
              savePrefs(next);
            }}
            trackColor={{true: colors.accent}}
            thumbColor="#ffffff"
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={font.body}>系统通知权限</Text>
            <Text style={font.faint}>{statusText(notifGranted, notifBlocked)}</Text>
          </View>
          {notifGranted !== true ? (
            notifBlocked ? (
              <TouchableOpacity
                style={styles.rowButton}
                onPress={() => Linking.openSettings()}>
                <Text style={styles.rowButtonText}>去系统设置</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.rowButton}
                onPress={() =>
                  requestPermission(
                    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
                    v => setNotifGranted(v),
                    v => setNotifBlocked(v),
                  )
                }>
                <Text style={styles.rowButtonText}>申请权限</Text>
              </TouchableOpacity>
            )
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>运行时权限</Text>
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={font.body}>相机（扫码配对）</Text>
            <Text style={font.faint}>{statusText(camGranted, camBlocked)}</Text>
          </View>
          {camGranted !== true ? (
            camBlocked ? (
              <TouchableOpacity
                style={styles.rowButton}
                onPress={() => Linking.openSettings()}>
                <Text style={styles.rowButtonText}>去系统设置</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.rowButton}
                onPress={() =>
                  requestPermission(
                    PermissionsAndroid.PERMISSIONS.CAMERA,
                    v => setCamGranted(v),
                    v => setCamBlocked(v),
                  )
                }>
                <Text style={styles.rowButtonText}>申请权限</Text>
              </TouchableOpacity>
            )
          ) : null}
        </View>
        <Text style={[font.faint, {marginTop: 6}]}>
          生物识别（{biometricLabel()}）由系统在验证时临时调用，不申请常驻权限；
          相册选图由系统选择器完成，无需相册权限。
        </Text>
      </View>
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
});
