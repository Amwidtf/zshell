import React, {useState} from 'react';
import {BackHandler, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {
  LEGAL_DOC_VERSION,
  PRIVACY_POLICY,
  USER_AGREEMENT,
  LegalDoc,
} from '../legal';
import {LegalDocModal} from '../components/LegalDocModal';
import {colors, font} from '../theme';

interface ConsentGateProps {
  onAgree: () => void;
}

/**
 * First-launch consent gate (CN app-store compliance pattern): the user must
 * accept the user agreement and privacy policy before entering the app.
 * Declining exits — nothing is collected or initialized before consent.
 */
export function ConsentGate({onAgree}: ConsentGateProps) {
  const [openDoc, setOpenDoc] = useState<LegalDoc | null>(null);

  const decline = () => {
    BackHandler.exitApp();
  };

  return (
    <View style={styles.root}>
      <Text style={styles.logo}>Z_</Text>
      <Text style={styles.title}>欢迎使用 ZShell</Text>
      <Text style={styles.intro}>
        ZShell 是非官方开源的 ZCode 远程控制手机客户端。继续使用前，请阅读并同意：
      </Text>
      <TouchableOpacity onPress={() => setOpenDoc(USER_AGREEMENT)}>
        <Text style={styles.link}>《用户协议与免责声明》</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setOpenDoc(PRIVACY_POLICY)}>
        <Text style={styles.link}>《隐私政策》</Text>
      </TouchableOpacity>
      <Text style={styles.promise}>
        本应用零数据收集：无账号、无遥测、无第三方上报，全部数据仅存于本机加密存储。
      </Text>
      <TouchableOpacity style={styles.agreeButton} onPress={onAgree}>
        <Text style={styles.agreeButtonText}>同意并继续（v{LEGAL_DOC_VERSION}）</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.declineButton} onPress={decline}>
        <Text style={styles.declineButtonText}>不同意并退出</Text>
      </TouchableOpacity>
      <LegalDocModal doc={openDoc} onClose={() => setOpenDoc(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  logo: {fontSize: 44, fontWeight: '700', color: '#eeeeee', marginBottom: 4},
  title: {...font.title},
  intro: {...font.dim, textAlign: 'center', marginTop: 8},
  link: {color: colors.accent, fontSize: 15, paddingVertical: 6},
  promise: {...font.faint, textAlign: 'center', marginTop: 12, marginBottom: 16},
  agreeButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    width: '100%',
    alignItems: 'center',
  },
  agreeButtonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  declineButton: {
    borderRadius: 12,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  declineButtonText: {color: colors.textFaint, fontSize: 14},
});
