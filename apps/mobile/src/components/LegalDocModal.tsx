import React from 'react';
import {
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {LegalDoc} from '../legal';
import {colors, font} from '../theme';

interface LegalDocModalProps {
  doc: LegalDoc | null;
  onClose: () => void;
}

/** Full-screen modal viewer for legal documents (settings entries + consent gate). */
export function LegalDocModal({doc, onClose}: LegalDocModalProps) {
  return (
    <Modal
      visible={doc != null}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={false}>
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backText}>‹ 返回</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {doc?.title ?? ''}
          </Text>
          <View style={{width: 64}} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.body}>{doc?.body ?? ''}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  topBar: {
    height: 52,
    backgroundColor: colors.bgElevated,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {paddingHorizontal: 10, paddingVertical: 8},
  backText: {color: colors.accent, fontSize: 16},
  title: {...font.body, flex: 1, textAlign: 'center'},
  content: {padding: 20, paddingBottom: 40},
  body: {color: colors.textDim, fontSize: 14, lineHeight: 24},
});
