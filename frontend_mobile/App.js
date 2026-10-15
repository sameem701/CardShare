import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Syne_700Bold } from '@expo-google-fonts/syne';
import { DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import theme from './constants/theme';
import { ChatProvider } from './context/ChatCache';
import { SessionProvider, useSession } from './context/SessionContext';
import { ToastProvider } from './context/ToastContext';
import MainApp from './navigation/MainApp';
import LoadingState from './components/LoadingState';
import StartScreen from './screens/StartScreen';
import PhoneScreen from './screens/PhoneScreen';
import VerifyScreen from './screens/VerifyScreen';
import NameScreen from './screens/NameScreen';
import { installWebChrome } from './utils/webChrome';

const hasDisplayName = (user) => Boolean(user?.display_name && String(user.display_name).trim());

function AuthGate() {
  const { session, booting, signIn, signOut } = useSession();
  const [authScreen, setAuthScreen] = useState('start');
  const [phone, setPhone] = useState('');

  const onRequireLogin = useCallback(() => {
    setAuthScreen('start');
  }, []);

  if (booting) {
    return <LoadingState message="Starting…" />;
  }

  if (session && hasDisplayName(session.user)) {
    return <MainApp onLoggedOut={() => setAuthScreen('start')} />;
  }

  if (session && !hasDisplayName(session.user)) {
    return (
      <NameScreen
        onBack={() => {
          setAuthScreen('start');
          signOut();
        }}
      />
    );
  }

  if (authScreen === 'phone') {
    return (
      <PhoneScreen
        onBack={() => setAuthScreen('start')}
        onSent={(value) => {
          setPhone(value);
          setAuthScreen('verify');
        }}
      />
    );
  }

  if (authScreen === 'verify') {
    return (
      <VerifyScreen
        phone={phone}
        onBack={() => setAuthScreen('phone')}
        onVerified={(result) => {
          signIn(result);
        }}
      />
    );
  }

  return <StartScreen onContinue={() => setAuthScreen('phone')} />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Syne: Syne_700Bold,
    'DM Sans': DMSans_400Regular,
    'DM Sans Medium': DMSans_500Medium,
  });
  const [loginKey, setLoginKey] = useState(0);

  useEffect(() => {
    installWebChrome();
  }, []);

  if (!fontsLoaded && !fontError) {
    return <View style={styles.page} />;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.page}>
        <View style={styles.phone}>
          <ToastProvider>
            <SessionProvider onRequireLogin={() => setLoginKey((k) => k + 1)} key={loginKey}>
              <ChatProvider>
                <AuthGate />
              </ChatProvider>
            </SessionProvider>
          </ToastProvider>
        </View>
        <StatusBar style="light" />
      </View>
    </SafeAreaProvider>
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
});
