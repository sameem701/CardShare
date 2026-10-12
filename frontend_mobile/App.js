import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Syne_700Bold } from '@expo-google-fonts/syne';
import { DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import theme from './constants/theme';
import StartScreen from './screens/StartScreen';
import PhoneScreen from './screens/PhoneScreen';
import VerifyScreen from './screens/VerifyScreen';

export default function App() {
  const [screen, setScreen] = useState('start');
  const [phone, setPhone] = useState('');
  const [session, setSession] = useState(null);
  const [fontsLoaded] = useFonts({
    Syne: Syne_700Bold,
    'DM Sans': DMSans_400Regular,
    'DM Sans Medium': DMSans_500Medium,
  });

  if (!fontsLoaded) {
    return <View style={styles.page} />;
  }

  let current = <StartScreen onContinue={() => setScreen('phone')} />;

  if (screen === 'phone') {
    current = (
      <PhoneScreen
        onBack={() => setScreen('start')}
        onSent={(value) => {
          setPhone(value);
          setScreen('verify');
        }}
      />
    );
  }

  if (screen === 'verify') {
    current = (
      <VerifyScreen
        phone={phone}
        onBack={() => setScreen('phone')}
        onVerified={(result) => {
          setSession(result);
          setScreen('verified');
        }}
      />
    );
  }

  if (screen === 'verified') {
    current = (
      <View style={styles.verified}>
        <Text style={styles.verifiedTitle}>Phone verified.</Text>
        <Text style={styles.verifiedBody}>{session?.user?.phone}</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.phone}>{current}</View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    minHeight: Platform.OS === 'web' ? '100vh' : undefined,
  },
  phone: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? theme.layout.phoneWidth : undefined,
    backgroundColor: theme.colors.bg,
  },
  verified: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  verifiedTitle: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    color: theme.colors.text,
    marginBottom: 8,
  },
  verifiedBody: {
    fontFamily: theme.fonts.body,
    fontSize: 15,
    color: theme.colors.text2,
  },
});
