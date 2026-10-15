import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('');
  const timer = useRef(null);

  const showToast = useCallback((text) => {
    if (!text) return;
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 2600);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {message ? (
        <View pointerEvents="none" style={styles.wrap}>
          <Text style={styles.text}>{message}</Text>
        </View>
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
    bottom: theme.layout.navHeight,
    zIndex: 80,
    backgroundColor: theme.colors.bg4,
    borderRadius: theme.radius.control,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  text: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
    textAlign: 'center',
  },
});
