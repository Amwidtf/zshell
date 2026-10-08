import React, {useEffect, useRef, useState} from 'react';
import {
  PermissionsAndroid,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Camera} from 'react-native-camera-kit';
import {colors, font} from '../theme';
import {pickAndDecodeQr} from '../qrFromFile';

export interface ScanOutcome {
  ok: boolean;
  machineId?: string;
  updatedExisting?: boolean;
  reason?: string;
}

interface ScanScreenProps {
  onResult: (url: string) => ScanOutcome;
  onDone: (outcome: ScanOutcome) => void;
}

const REASON_TEXT: Record<string, string> = {
  empty: '内容为空',
  'invalid-url': '不是有效的 URL',
  'not-https': '仅支持 https 配对地址',
  'missing-sid': '缺少 sid 参数（不是配对二维码）',
  'missing-hash': '缺少 hash 参数（不是配对二维码）',
};

export function ScanScreen({onResult, onDone}: ScanScreenProps) {
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>(
    'unknown',
  );
  const [status, setStatus] = useState<string | null>(null);
  const handling = useRef(false);

  useEffect(() => {
    PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA).then(
      result => {
        setPermission(result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied');
      },
    );
  }, []);

  const handleUrl = (url: string) => {
    if (handling.current) {
      return;
    }
    handling.current = true;
    const outcome = onResult(url);
    if (outcome.ok) {
      onDone(outcome);
    } else {
      setStatus(REASON_TEXT[outcome.reason ?? ''] ?? '无法识别的二维码');
      setTimeout(() => {
        handling.current = false;
      }, 1500);
    }
  };

  const pickFile = async () => {
    setStatus('正在识别图片…');
    try {
      const url = await pickAndDecodeQr();
      if (url == null) {
        setStatus('未在图片中找到二维码');
        handling.current = false;
        return;
      }
      handling.current = false;
      handleUrl(url);
    } catch {
      setStatus('读取图片失败');
      handling.current = false;
    }
  };

  return (
    <View style={styles.root}>
      {permission === 'granted' ? (
        <Camera
          style={StyleSheet.absoluteFill}
          scanBarcode
          onReadCode={event => {
            const value = event.nativeEvent.codeStringValue;
            if (typeof value === 'string' && value.length > 0) {
              handleUrl(value);
            }
          }}
        />
      ) : (
        <View style={styles.noCamera}>
          <Text style={font.dim}>
            {permission === 'denied'
              ? '相机权限被拒绝，可从相册选择二维码图片'
              : '正在请求相机权限…'}
          </Text>
        </View>
      )}

      <View style={styles.bottom}>
        {status != null ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        ) : (
          <Text style={styles.tip}>
            对准桌面端「Web 远程控制」二维码，或从相册选择二维码截图
          </Text>
        )}
        <TouchableOpacity style={styles.albumButton} onPress={pickFile}>
          <Text style={styles.albumButtonText}>从相册选择二维码图片</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  noCamera: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32},
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingBottom: 34,
    alignItems: 'center',
    gap: 12,
  },
  tip: {color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center'},
  statusBox: {
    backgroundColor: 'rgba(229,83,75,0.9)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  statusText: {color: '#fff', fontSize: 13},
  albumButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 24,
  },
  albumButtonText: {color: '#fff', fontSize: 15, fontWeight: '600'},
});
