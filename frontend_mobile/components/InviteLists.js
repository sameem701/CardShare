import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import SharingSwitch from './SharingSwitch';

// The switch at the top of the Pending tab.
export function ContactCheckRow({
  enabled,
  blocked,
  unavailable,
  onPress,
  title = 'Check invites against my contacts',
  note,
  accessibilityLabel,
}) {
  let detail = note;
  if (!detail) {
    detail = 'Off. New invites stay unchecked.';
    if (enabled) detail = 'On. New invites are checked when this page opens.';
    else if (unavailable) detail = 'Not available on this device.';
    else if (blocked) detail = 'Off. Allow Contacts in your phone Settings to turn this on.';
  }

  return (
    <Pressable
      style={styles.check}
      onPress={onPress}
      disabled={unavailable}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled, disabled: unavailable }}
      accessibilityLabel={accessibilityLabel || title}
    >
      <View style={styles.checkText}>
        <Text style={styles.checkTitle}>{title}</Text>
        <Text style={styles.checkNote}>{detail}</Text>
      </View>
      <SharingSwitch on={enabled} />
    </Pressable>
  );
}

// A heading with its count, its rows or "None", then a line that closes the group.
export function InviteGroup({ title, count, children }) {
  return (
    <View>
      <Text style={styles.heading}>{title} ({count})</Text>
      {count === 0 ? <Text style={styles.none}>None</Text> : children}
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginHorizontal: theme.layout.screenPadding,
    marginBottom: 14,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 14,
    backgroundColor: theme.colors.bg2,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    borderRadius: theme.radius.card,
  },
  checkText: { flex: 1, minWidth: 0, gap: 3 },
  checkTitle: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 14,
    color: theme.colors.text,
  },
  checkNote: {
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.text3,
  },
  heading: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: theme.colors.text3,
  },
  none: {
    marginHorizontal: theme.layout.screenPadding,
    marginBottom: 12,
    paddingHorizontal: 2,
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.text3,
  },
  divider: {
    marginHorizontal: theme.layout.screenPadding,
    marginTop: 6,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border2,
  },
});
