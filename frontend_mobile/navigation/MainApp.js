import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import { DefaultTheme, NavigationContainer, useNavigation, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import BottomNav from '../components/BottomNav';
import SideMenu from '../components/SideMenu';
import AddCardScreen from '../screens/AddCardScreen';
import AddCircleScreen from '../screens/AddCircleScreen';
import ChatScreen from '../screens/ChatScreen';
import CircleScreen from '../screens/CircleScreen';
import CreateRequestScreen from '../screens/CreateRequestScreen';
import MyCardsScreen from '../screens/MyCardsScreen';
import HistoryListScreen from '../screens/HistoryListScreen';
import HistoryScreen from '../screens/HistoryScreen';
import HomeScreen from '../screens/HomeScreen';
import HowItWorksScreen from '../screens/HowItWorksScreen';
import OrderScreen from '../screens/OrderScreen';
import RequestsScreen from '../screens/RequestsScreen';
import SendProofScreen from '../screens/SendProofScreen';
import theme from '../constants/theme';
import { RoleModeProvider } from '../context/RoleMode';
import { AppActionsProvider } from './AppActions';
import { screenId } from './openScreen';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { clearPendingInviteCode, usePendingInviteCode } from '../utils/inviteHold';
import { applyInviteResolution, resolveAndApply } from '../utils/inviteLink';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.bg,
    card: theme.colors.bg,
  },
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const stackOptions = {
  headerShown: false,
  freezeOnBlur: true,
  contentStyle: { backgroundColor: theme.colors.bg },
};

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <BottomNav {...props} />}
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        lazy: false,
        detachInactiveScreens: false,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Request" component={RequestsScreen} />
    </Tab.Navigator>
  );
}

function GuideScreen() {
  const navigation = useNavigation();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (step === 0) return;
      event.preventDefault();
      setStep((current) => (current > 0 ? current - 1 : 0));
    });
    return unsubscribe;
  }, [navigation, step]);

  return (
    <HowItWorksScreen
      step={step}
      onStep={setStep}
      finishLabel="Done"
      onBack={() => navigation.goBack()}
      onContinue={() => navigation.goBack()}
    />
  );
}

function InviteFollowThrough({ navigationRef, ready, handoff, onHandoffDone }) {
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const pending = usePendingInviteCode();
  const usedHandoff = useRef(false);
  const usedCode = useRef(null);

  useEffect(() => {
    if (!ready) return;
    if (!sessionId || !user?.id) return;

    if (handoff && !usedHandoff.current) {
      usedHandoff.current = true;
      applyInviteResolution(navigationRef, showToast, handoff);
      onHandoffDone?.();
      return;
    }

    if (!pending || usedCode.current === pending) return;
    usedCode.current = pending;
    resolveAndApply(sessionId, user.id, pending, navigationRef, showToast).catch((err) => {
      showToast(err.message);
      clearPendingInviteCode();
    });
  }, [handoff, navigationRef, onHandoffDone, pending, ready, sessionId, showToast, user?.id]);

  return null;
}

function MainAppShell({ onLoggedOut, inviteHandoff, onInviteHandoffDone }) {
  const navigationRef = useNavigationContainerRef();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tabsFocused, setTabsFocused] = useState(true);
  const [navReady, setNavReady] = useState(false);

  const syncTabs = () => {
    const name = navigationRef.getCurrentRoute()?.name;
    setTabsFocused(name === 'Home' || name === 'Request');
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!menuOpen) return false;
      setMenuOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [menuOpen]);

  return (
    <RoleModeProvider>
    <AppActionsProvider value={{ openMenu: () => setMenuOpen(true), onLoggedOut }}>
      <View style={{ flex: 1 }}>
        <NavigationContainer
          ref={navigationRef}
          theme={navigationTheme}
          onReady={() => {
            syncTabs();
            setNavReady(true);
          }}
          onStateChange={syncTabs}
        >
          <Stack.Navigator screenOptions={stackOptions}>
            <Stack.Screen name="Tabs" component={MainTabs} />
            <Stack.Screen name="add-card" component={AddCardScreen} getId={screenId} />
            <Stack.Screen name="add-circle" component={AddCircleScreen} getId={screenId} />
            <Stack.Screen name="circle" component={CircleScreen} getId={screenId} />
            <Stack.Screen name="my-cards" component={MyCardsScreen} getId={screenId} />
            <Stack.Screen name="create-request" component={CreateRequestScreen} getId={screenId} />
            <Stack.Screen name="history" component={HistoryScreen} getId={screenId} />
            <Stack.Screen name="history-list" component={HistoryListScreen} getId={screenId} />
            <Stack.Screen name="order" component={OrderScreen} getId={screenId} />
            <Stack.Screen name="send-proof" component={SendProofScreen} getId={screenId} />
            <Stack.Screen name="chat" component={ChatScreen} getId={screenId} />
            <Stack.Screen name="guide" component={GuideScreen} getId={screenId} />
          </Stack.Navigator>
        </NavigationContainer>
        <InviteFollowThrough
          navigationRef={navigationRef}
          ready={navReady}
          handoff={inviteHandoff}
          onHandoffDone={onInviteHandoffDone}
        />
        <SideMenu
          visible={menuOpen && tabsFocused}
          onClose={() => setMenuOpen(false)}
          onCircle={() => {
            setMenuOpen(false);
            navigationRef.navigate('circle', { filter: 'circle', at: Date.now() });
          }}
          onCards={() => {
            setMenuOpen(false);
            navigationRef.navigate('my-cards');
          }}
          onHistory={() => {
            setMenuOpen(false);
            navigationRef.navigate('history');
          }}
          onHowItWorks={() => {
            setMenuOpen(false);
            navigationRef.navigate('guide');
          }}
          onLoggedOut={onLoggedOut}
        />
      </View>
    </AppActionsProvider>
    </RoleModeProvider>
  );
}

export default function MainApp({ onLoggedOut, inviteHandoff, onInviteHandoffDone }) {
  return (
    <MainAppShell
      onLoggedOut={onLoggedOut}
      inviteHandoff={inviteHandoff}
      onInviteHandoffDone={onInviteHandoffDone}
    />
  );
}
