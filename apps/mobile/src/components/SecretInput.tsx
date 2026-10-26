import React, {useState} from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputSubmitEditingEventData,
  TouchableOpacity,
  View,
} from 'react-native';
import {colors} from '../theme';

interface SecretInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
}

/**
 * Password-style input with a 显示/隐藏 toggle — long passwords are hard to
 * type blind, especially on the unlock screen where a typo costs a retry.
 */
export function SecretInput({
  value,
  onChangeText,
  placeholder,
  onSubmitEditing,
  autoFocus,
}: SecretInputProps) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={
          onSubmitEditing != null
            ? (e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) =>
                onSubmitEditing()
            : undefined
        }
      />
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setShow(s => !s)}
        activeOpacity={0.7}>
        <Text style={styles.toggleText}>{show ? '隐藏' : '显示'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.bgInput,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  toggle: {paddingHorizontal: 12, paddingVertical: 12},
  toggleText: {color: colors.accent, fontSize: 13},
});
