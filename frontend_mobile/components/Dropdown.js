import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import theme from '../constants/theme';

const ROW_HEIGHT = 48;
const VISIBLE_ROWS = 5;
const THUMB_MIN = 28;

function optionId(item) {
  return typeof item === 'string' ? item : item.id;
}

function optionLabel(item) {
  return typeof item === 'string' ? item : item.label;
}

function Chevron({ up }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}
        stroke={theme.colors.text2}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function MenuFrame({ onClose, children }) {
  const body = (
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
      {children}
    </Pressable>
  );
  if (Platform.OS === 'web') {
    return <View style={styles.webHost}>{body}</View>;
  }
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {body}
    </Modal>
  );
}

export default function Dropdown({ label, placeholder, options, value, onChange }) {
  const window = useWindowDimensions();
  const fieldRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [offset, setOffset] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);

  const selected = options.find((item) => optionId(item) === value);
  const shown = selected ? optionLabel(selected) : '';
  const rows = Math.min(options.length, VISIBLE_ROWS);
  const menuHeight = rows * ROW_HEIGHT;
  const canScroll = content > viewport + 1;
  const thumbHeight = canScroll ? Math.max(THUMB_MIN, (viewport / content) * viewport) : 0;
  const maxOffset = Math.max(content - viewport, 1);
  const thumbTop = canScroll ? (offset / maxOffset) * (viewport - thumbHeight) : 0;

  const close = () => setOpen(false);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    fieldRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOffset(0);
      setOpen(true);
    });
  };

  let menuTop = 0;
  if (anchor) {
    const spaceBelow = window.height - (anchor.y + anchor.height);
    const spaceAbove = anchor.y;
    const openUp = spaceBelow < menuHeight + theme.spacing.sm && spaceAbove > spaceBelow;
    menuTop = openUp
      ? Math.max(theme.spacing.sm, anchor.y - menuHeight - theme.spacing.xs)
      : anchor.y + anchor.height + theme.spacing.xs;
  }

  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        ref={fieldRef}
        style={styles.closed}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={label || placeholder}
      >
        <Text style={shown ? styles.closedValue : styles.closedPlaceholder} numberOfLines={1}>
          {shown || placeholder}
        </Text>
        <Chevron up={open} />
      </Pressable>
      {open && anchor ? (
        <MenuFrame onClose={close}>
          <Pressable
            style={[styles.menu, { top: menuTop, left: anchor.x, width: anchor.width, height: menuHeight }]}
            onPress={(event) => event.stopPropagation()}
          >
            <ScrollView
              style={styles.scroller}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
              onContentSizeChange={(_, height) => setContent(height)}
              onScroll={(event) => setOffset(event.nativeEvent.contentOffset.y)}
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
                      close();
                    }}
                  >
                    <Text style={[styles.optionText, isSelected && styles.optionTextOn]} numberOfLines={1}>
                      {text}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {canScroll ? (
              <View style={styles.track} pointerEvents="none">
                <View style={[styles.thumb, { height: thumbHeight, transform: [{ translateY: thumbTop }] }]} />
              </View>
            ) : null}
          </Pressable>
        </MenuFrame>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: theme.spacing.xl,
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
    gap: theme.spacing.sm,
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
  webHost: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 120,
  },
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
  },
  menu: {
    position: 'absolute',
    zIndex: 2,
    backgroundColor: theme.colors.bg2,
    borderWidth: 1,
    borderColor: theme.colors.border2,
    borderRadius: theme.radius.control,
    overflow: 'hidden',
  },
  scroller: {
    flex: 1,
  },
  option: {
    height: ROW_HEIGHT,
    justifyContent: 'center',
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.xl,
  },
  optionOn: {
    backgroundColor: theme.colors.greenDim,
  },
  optionText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.input,
    lineHeight: 22,
    color: theme.colors.text,
  },
  optionTextOn: {
    fontFamily: theme.fonts.bodyMedium,
    color: theme.colors.green,
  },
  track: {
    position: 'absolute',
    top: theme.spacing.sm,
    bottom: theme.spacing.sm,
    right: theme.spacing.sm,
    width: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.bg4,
  },
  thumb: {
    width: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.green,
  },
});
