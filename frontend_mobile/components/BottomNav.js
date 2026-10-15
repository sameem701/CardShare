import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { useBottomInset } from '../hooks/useTopInset';
import { NavIcon } from './NavIcons';

const TABS = [
  ['home', 'Home'],
  ['circle', 'Circle'],
  ['request', 'Request'],
];

export default function BottomNav({ activeTab, onTabPress }) {
  const bottomInset = useBottomInset();
  return (
    <View style={[styles.nav, { paddingBottom: bottomInset }]}>
      {TABS.map(([name, label]) => {
        const active = name === activeTab;
        const color = active ? theme.colors.green : theme.colors.text3;
        return (
          <Pressable
            key={name}
            style={styles.item}
            onPress={() => onTabPress(name)}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <NavIcon name={name} color={color} />
            <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bg,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  label: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.caption,
    color: theme.colors.text3,
  },
  labelActive: {
    color: theme.colors.green,
  },
});
