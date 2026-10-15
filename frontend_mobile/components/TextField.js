import { useState } from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';
import theme from '../constants/theme';

export default function TextField({
  style,
  multiline,
  onFocus,
  onBlur,
  ...props
}) {
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      {...props}
      accessibilityLabel={props.accessibilityLabel || props.placeholder}
      multiline={multiline}
      placeholderTextColor={theme.colors.text3}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        styles.input,
        multiline && styles.multiline,
        style,
        focused && styles.focused,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: theme.colors.bg3,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    borderRadius: theme.radius.control,
    color: theme.colors.text,
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.input,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  focused: {
    borderColor: theme.colors.green,
  },
});
