import { Alert, Linking } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { ContactCheckRow } from '../components/InviteLists';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { useContactCheck } from '../hooks/useContactCheck';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const focused = useIsFocused();
  const { user } = useSession();
  const showToast = useToast();
  const contacts = useContactCheck(user?.id, null, focused);

  const toggle = async () => {
    const outcome = await contacts.toggle();
    if (outcome === 'blocked') {
      Alert.alert(
        'Contacts access is off',
        'Your phone will not ask again. Allow Contacts for CardShare in Settings.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
        ]
      );
    } else if (outcome === 'denied') {
      showToast('Contacts check stays off');
    } else if (outcome === 'unavailable') {
      showToast('Contacts are not available on this device');
    }
  };

  return (
    <ScreenShell>
      <TopBar title="Settings" onBack={() => navigation.goBack()} />
      <ContactCheckRow
        title="Check contacts"
        note="Put people you already know first on Pending. Names stay on your phone."
        accessibilityLabel="Check contacts"
        enabled={contacts.enabled}
        blocked={contacts.permission === 'blocked'}
        unavailable={contacts.permission === 'unavailable'}
        onPress={toggle}
      />
    </ScreenShell>
  );
}
