import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import theme from '../constants/theme';

const ROW_HEIGHT = 48;
const VISIBLE_ROWS = 5;
const THUMB_MIN = 28;

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

function MenuFrame({ onClose, frameRef, onFrame, children }) {
  const body = (
    <Pressable
      ref={frameRef}
      style={styles.backdrop}
      onPress={onClose}
      onLayout={onFrame}
      accessibilityRole="button"
      accessibilityLabel="Close"
    >
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

export default function HolderPicker({
  label,
  placeholder,
  summary,
  people,
  selectedIds,
  onToggle,
  onUnselectAll,
  disabled,
}) {
  const window = useWindowDimensions();
  const fieldRef = useRef(null);
  const frameRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [frameOrigin, setFrameOrigin] = useState(null);
  const [offset, setOffset] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);

  const list = people.length ? people : [{ id: '__none__', label: 'No options', empty: true }];
  const personRows = Math.min(list.length, VISIBLE_ROWS);
  const footer = people.length > 0;
  const menuHeight = personRows * ROW_HEIGHT + (footer ? ROW_HEIGHT : 0);
  const canScroll = content > viewport + 1;
  const thumbHeight = canScroll ? Math.max(THUMB_MIN, (viewport / content) * viewport) : 0;
  const maxOffset = Math.max(content - viewport, 1);
  const thumbTop = canScroll ? (offset / maxOffset) * (viewport - thumbHeight) : 0;
  const selected = new Set(selectedIds);

  const close = () => {
    setOpen(false);
    setFrameOrigin(null);
  };

  const toggle = () => {
    if (disabled) return;
    if (open) {
      close();
      return;
    }
    fieldRef.current?.measureInWindow((x, y, width, height) => {
      if (!width || !height) return;
      setAnchor({ x, y, width, height });
      setOffset(0);
      setOpen(true);
    });
  };

  const readFrame = () => {
    requestAnimationFrame(() => {
      frameRef.current?.measureInWindow((x, y) => {
        setFrameOrigin({ x, y });
      });
    });
  };

  let menuTop = 0;
  let menuLeft = 0;
  if (anchor && frameOrigin) {
    const gap = theme.spacing.sm;
    const shift = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
    const localTop = anchor.y - frameOrigin.y + shift;
    const spaceBelow = window.height - (anchor.y + anchor.height);
    const spaceAbove = anchor.y;
    const openUp = spaceBelow < menuHeight + gap && spaceAbove > spaceBelow;
    menuLeft = anchor.x - frameOrigin.x;
    menuTop = openUp
      ? Math.max(gap, localTop - menuHeight - gap)
      : localTop + anchor.height + gap;
  }

  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View ref={fieldRef} collapsable={false}>
        <Pressable
          style={[styles.closed, disabled && styles.closedDisabled]}
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={label || placeholder}
          accessibilityState={{ disabled: Boolean(disabled), expanded: open }}
        >
          <Text style={summary ? styles.closedValue : styles.closedPlaceholder} numberOfLines={1}>
            {summary || placeholder}
          </Text>
          <Chevron up={open} />
        </Pressable>
      </View>
      {open && anchor ? (
        <MenuFrame onClose={close} frameRef={frameRef} onFrame={readFrame}>
          {frameOrigin ? (
            <Pressable
              style={[styles.menu, { top: menuTop, left: menuLeft, width: anchor.width, height: menuHeight }]}
              onPress={(event) => event.stopPropagation?.()}
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
                {list.map((person) => {
                  const on = !person.empty && selected.has(person.id);
                  return (
                    <Pressable
                      key={person.id}
                      style={[styles.option, on && styles.optionOn]}
                      disabled={Boolean(person.empty)}
                      accessibilityRole="button"
                      accessibilityLabel={person.empty ? person.label : `${person.label}, ${on ? 'selected' : 'not selected'}`}
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        if (person.empty) return;
                        onToggle(person.id);
                      }}
                    >
                      <Text
                        style={[styles.optionText, person.empty && styles.optionEmpty, on && styles.optionTextOn]}
                        numberOfLines={1}
                      >
                        {person.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {canScroll ? (
                <View style={[styles.track, footer && styles.trackAboveFooter]} pointerEvents="none">
                  <View style={[styles.thumb, { height: thumbHeight, transform: [{ translateY: thumbTop }] }]} />
                </View>
              ) : null}
              {footer ? (
                <Pressable
                  style={styles.footer}
                  onPress={onUnselectAll}
                  accessibilityRole="button"
                  accessibilityLabel="Unselect all"
                >
                  <Text style={styles.footerText}>Unselect all</Text>
                </Pressable>
              ) : null}
            </Pressable>
          ) : null}
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
  closedDisabled: {
    opacity: 0.6,
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
  optionEmpty: {
    color: theme.colors.text3,
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
  trackAboveFooter: {
    bottom: ROW_HEIGHT + theme.spacing.sm,
  },
  thumb: {
    width: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.green,
  },
  footer: {
    height: ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border2,
  },
  footerText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.green,
  },
});
