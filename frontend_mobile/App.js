import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Syne_700Bold } from '@expo-google-fonts/syne';
import { DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import { QueryClientProvider } from '@tanstack/react-query';
import theme from './constants/theme';
import { ChatProvider } from './context/ChatCache';
import { SessionProvider, useSession } from './context/SessionContext';
import { ToastProvider } from './context/ToastContext';
import { RoleModeProvider } from './context/RoleMode';
import MainApp from './navigation/MainApp';
import OnboardingTour from './screens/onboarding/OnboardingTour';
import { queryClient } from './queries/client';
import './queries/focus';
import LoadingState from './components/LoadingState';
import StartScreen from './screens/StartScreen';
import HowItWorksScreen from './screens/HowItWorksScreen';
import PhoneScreen from './screens/PhoneScreen';
import VerifyScreen from './screens/VerifyScreen';
import NameScreen from './screens/NameScreen';
import InviteLandingScreen from './screens/InviteLandingScreen';
import InviteAttachScreen from './screens/InviteAttachScreen';
import { installWebChrome } from './utils/webChrome';
import { clearPendingInviteCode, usePendingInviteCode } from './utils/inviteHold';
import { listenForInviteLinks } from './utils/inviteLink';
import { readOnboardingTour } from './utils/onboardingTour';

const hasFinishedSetup = (user) =>
  Boolean(
    user?.display_name &&
      String(user.display_name).trim() &&
      user?.city &&
      String(user.city).trim()
  );

function AuthGate() {
  const { session, booting, signIn, signOut } = useSession();
  const [authScreen, setAuthScreen] = useState('start');
  const [phoneBack, setPhoneBack] = useState('start');
  const [phone, setPhone] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [awaitingAttach, setAwaitingAttach] = useState(false);
  const [inviteHandoff, setInviteHandoff] = useState(null);
  const pendingInvite = usePendingInviteCode();
  const startedWithoutName = useRef(false);
  const [tourPending, setTourPending] = useState(null);

  useEffect(() => {
    let stop;
    listenForInviteLinks().then((unsub) => {
      stop = unsub;
    });
    return () => stop?.();
  }, []);

  useEffect(() => {
    if (session || !pendingInvite) return;
    if (authScreen === 'start') setAuthScreen('invitee');
  }, [authScreen, pendingInvite, session]);

  useEffect(() => {
    if (!session?.user?.id || !hasFinishedSetup(session.user)) {
      setTourPending(null);
      return undefined;
    }
    let live = true;
    readOnboardingTour(session.user.id).then((status) => {
      if (live) setTourPending(status === 'pending');
    });
    return () => {
      live = false;
    };
  }, [session]);

  const onHandoffInvite = useCallback((result) => {
    setAwaitingAttach(false);
    setInviteHandoff(result);
  }, []);

  const onAttachFinished = useCallback(() => {
    setAwaitingAttach(false);
  }, []);

  if (booting) {
    return <LoadingState message="Starting…" />;
  }

  if (session && hasFinishedSetup(session.user)) {
    if (awaitingAttach && pendingInvite) {
      return (
        <InviteAttachScreen
          code={pendingInvite}
          onResolved={onHandoffInvite}
          onFinished={onAttachFinished}
        />
      );
    }
    if (tourPending === null) {
      return <LoadingState message="Starting…" />;
    }
    if (tourPending) {
      return (
        <OnboardingTour
          inviteCode={pendingInvite}
          onDone={() => {
            clearPendingInviteCode();
            setTourPending(false);
          }}
        />
      );
    }
    return (
      <MainApp
        onLoggedOut={() => {
          setAwaitingAttach(false);
          startedWithoutName.current = false;
          setTourPending(null);
          setAuthScreen('start');
        }}
        inviteHandoff={inviteHandoff}
        onInviteHandoffDone={() => setInviteHandoff(null)}
      />
    );
  }

  if (session && !hasFinishedSetup(session.user)) {
    if (!startedWithoutName.current) {
      startedWithoutName.current = !String(session.user?.display_name || '').trim();
    }
    return (
      <NameScreen
        onBack={() => {
          setAuthScreen('start');
          signOut();
        }}
        onSaved={() => {}}
      />
    );
  }

  if (authScreen === 'how') {
    return (
      <HowItWorksScreen
        onBack={() => setAuthScreen(phoneBack === 'invitee' ? 'invitee' : 'start')}
        onContinue={() => {
          setPhoneBack('how');
          setAuthScreen('phone');
        }}
      />
    );
  }

  if (authScreen === 'phone') {
    return (
      <PhoneScreen
        onBack={() => setAuthScreen(phoneBack || 'start')}
        onSent={(value, otp) => {
          setPhone(value);
          setDevOtp(otp || '');
          setAuthScreen('verify');
        }}
      />
    );
  }

  if (authScreen === 'verify') {
    return (
      <VerifyScreen
        phone={phone}
        devOtp={devOtp}
        onBack={() => setAuthScreen('phone')}
        onVerified={(result) => {
          signIn(result);
        }}
      />
    );
  }

  if (authScreen === 'invitee' && pendingInvite) {
    return (
      <InviteLandingScreen
        code={pendingInvite}
        onGetStarted={() => {
          setPhoneBack('invitee');
          setAuthScreen('how');
        }}
        onExistingAccount={() => {
          setPhoneBack('invitee');
          setAuthScreen('phone');
        }}
        onNotNow={() => {
          clearPendingInviteCode();
          setAuthScreen('start');
        }}
      />
    );
  }

  return (
    <StartScreen
      onGetStarted={() => {
        setAuthScreen('how');
      }}
      onExistingAccount={() => {
        setPhoneBack('start');
        setAuthScreen('phone');
      }}
    />
  );
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
          <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <SessionProvider onRequireLogin={() => setLoginKey((k) => k + 1)} key={loginKey}>
              <RoleModeProvider>
                <ChatProvider>
                  <AuthGate />
                </ChatProvider>
              </RoleModeProvider>
            </SessionProvider>
          </ToastProvider>
        </QueryClientProvider>
        </View>
        <StatusBar style="light" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: theme.colors.page,
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
