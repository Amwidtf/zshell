import React, {useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {colors, font} from '../theme';

export interface ManualSubmitOutcome {
  ok: boolean;
  machineId?: string;
  reason?: string;
}

interface ManualInputScreenProps {
  onSubmit: (url: string, customName: string) => ManualSubmitOutcome;
  onDone: (outcome: ManualSubmitOutcome) => void;
}

const REASON_TEXT: Record<string, string> = {
  empty: '请粘贴配对 URL',
  'invalid-url': '不是有效的 URL，请完整复制桌面端二维码对应的链接',
  'not-https': '仅支持 https 配对地址',
  'missing-sid': 'URL 中缺少 sid 参数',
  'missing-hash': 'URL 中缺少 hash 参数',
};

export function ManualInputScreen({onSubmit, onDone}: ManualInputScreenProps) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const outcome = onSubmit(url.trim(), name.trim());
    if (outcome.ok) {
      onDone(outcome);
    } else {
      setError(REASON_TEXT[outcome.reason ?? ''] ?? '无法识别的配对地址');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={font.dim}>
          粘贴桌面端「Web 远程控制」生成的配对链接（与二维码内容相同）：
        </Text>
        <TextInput
          style={styles.urlInput}
          placeholder="https://zcode.z.ai/remote/v4?sid=…&hash=…"
          placeholderTextColor={colors.textFaint}
          value={url}
          onChangeText={setUrl}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TextInput
          style={styles.nameInput}
          placeholder="自定义名称（可选，如：公司电脑）"
          placeholderTextColor={colors.textFaint}
          value={name}
          onChangeText={setName}
          autoCapitalize="none"
        />
        {error != null ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.button, (!url.trim() || undefined) && styles.buttonDisabled]}
          onPress={submit}
          disabled={!url.trim()}>
          <Text style={styles.buttonText}>保存并连接</Text>
        </TouchableOpacity>
        <Text style={[font.faint, {marginTop: 16}]}>
          格式：https://&lt;origin&gt;/remote/v4?sid=…&hash=…&t=…（桌面端二维码弹窗可复制）
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  content: {padding: 20, gap: 12},
  urlInput: {
    backgroundColor: colors.bgInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  nameInput: {
    backgroundColor: colors.bgInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  error: {color: colors.danger, fontSize: 13},
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {backgroundColor: colors.accentDim},
  buttonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
});
