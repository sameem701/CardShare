import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { hiddenScrollProps } from '../utils/webChrome';

function optionId(item) {
  return typeof item === 'string' ? item : item.id;
}

function optionLabel(item) {
  return typeof item === 'string' ? item : item.label;
}

export default function Dropdown({ label, placeholder, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => optionId(item) === value);
  const shown = selected ? optionLabel(selected) : '';

  return (
    <View style={[styles.field, open && styles.fieldOpen]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={styles.closed}
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={label || placeholder}
      >
        <Text style={shown ? styles.closedValue : styles.closedPlaceholder}>
          {shown || placeholder}
        </Text>
        <Text style={styles.chevron}>{open ? '⌃' : '⌄'}</Text>
      </Pressable>
      {open ? (
        <>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <ScrollView
            {...hiddenScrollProps}
            style={styles.menu}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {options.map((item) => {
              const id = optionId(item);
              const text = optionLabel(item);
              const isSelected = id === value;
              return (
                <Pressable
                  key={id}
                  style={[styles.option, isSelected && styles.optionOn]}
                  accessibilityRole="button"
                  accessibilityLabel={text}
                  onPress={() => {
                    onChange(id);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, isSelected && styles.optionTextOn]}>{text}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: theme.spacing.xl,
    position: 'relative',
    zIndex: 1,
  },
  fieldOpen: {
    zIndex: 20,
  },
  label: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
  },
  closed: {
    backgroundColor: theme.colors.bg3,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closedValue: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.input,
    color: theme.colors.text,
    flex: 1,
  },
  closedPlaceholder: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.input,
    color: theme.colors.text3,
    flex: 1,
  },
  chevron: {
    fontSize: theme.fontSize.input,
    color: theme.colors.text2,
  },
  backdrop: {
    position: 'absolute',
    top: -800,
    left: -400,
    width: 1200,
    height: 2000,
    zIndex: 4,
  },
  menu: {
    position: 'absolute',
    top: 72,
    left: 0,
    right: 0,
    maxHeight: 220,
    zIndex: 6,
    backgroundColor: theme.colors.bg2,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
  },
  option: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  optionOn: {
    backgroundColor: theme.colors.greenDim,
  },
  optionText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.input,
    color: theme.colors.text,
  },
  optionTextOn: {
    fontFamily: theme.fonts.bodyMedium,
    color: theme.colors.green,
  },
});
