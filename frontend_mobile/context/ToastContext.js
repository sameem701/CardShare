import { createContext, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../constants/theme';

const ToastContext = createContext(() => {});
const HIDDEN_OFFSET = 480;

function ToastBanner({ text, onHidden, ref }) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(HIDDEN_OFFSET)).current;
  const closing = useRef(false);

  const dismiss = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(translateX, {
      toValue: HIDDEN_OFFSET,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onHidden();
    });
  }, [onHidden, translateX]);

  useImperativeHandle(ref, () => ({ dismiss }), [dismiss]);

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  return (
    <Animated.View
      style={[styles.wrap, { top: insets.top + theme.spacing.sm, transform: [{ translateX }] }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.accent} />
      <Text style={styles.text}>{text}</Text>
      <Pressable
        onPress={dismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={styles.close}
      >
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </Animated.View>
  );
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const banner = useRef(null);

  const hide = useCallback((id) => {
    setToast((current) => (current && current.id === id ? null : current));
  }, []);

  const showToast = useCallback((text) => {
    if (!text) return;
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, text });
    timer.current = setTimeout(() => banner.current?.dismiss(), 2600);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast ? (
        <ToastBanner
          key={toast.id}
          ref={banner}
          text={toast.text}
          onHidden={() => hide(toast.id)}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: theme.layout.screenPadding,
    right: theme.layout.screenPadding,
    zIndex: 80,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg4,
    borderRadius: theme.radius.card,
    borderWidth: 1.5,
    borderColor: theme.colors.green,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  accent: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: theme.colors.green,
  },
  text: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    lineHeight: theme.lineHeight.body,
    color: theme.colors.text,
    paddingVertical: theme.spacing.md,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.sm,
  },
  close: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  closeText: {
    fontFamily: theme.fonts.body,
    fontSize: 20,
    lineHeight: 22,
    color: theme.colors.text2,
  },
});
