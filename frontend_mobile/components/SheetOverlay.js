import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import theme from '../constants/theme';

export default function SheetOverlay({ visible, onClose, children }) {
  if (!visible) return null;

  const body = (
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
      <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
        {children}
      </Pressable>
    </Pressable>
  );

  if (Platform.OS === 'web') {
    return <View style={styles.webHost}>{body}</View>;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  webHost: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    alignItems: 'center',
  },
  backdrop: {
    flex: 1,
    width: '100%',
    maxWidth: theme.layout.phoneWidth,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.bg2,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    padding: theme.layout.screenPadding,
    paddingBottom: theme.spacing.xxl,
  },
});
