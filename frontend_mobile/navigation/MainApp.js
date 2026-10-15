import { useEffect, useState } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import SideMenu from '../components/SideMenu';
import AddCardScreen from '../screens/AddCardScreen';
import AddCircleScreen from '../screens/AddCircleScreen';
import CardDetailScreen from '../screens/CardDetailScreen';
import ChatScreen from '../screens/ChatScreen';
import CircleScreen from '../screens/CircleScreen';
import CreateRequestScreen from '../screens/CreateRequestScreen';
import HistoryListScreen from '../screens/HistoryListScreen';
import HistoryScreen from '../screens/HistoryScreen';
import RequestsScreen from '../screens/RequestsScreen';
import HomeScreen from '../screens/HomeScreen';
import OrderDetailHolderScreen from '../screens/OrderDetailHolderScreen';
import ProfileScreen from '../screens/ProfileScreen';
import RequestDetailRequesterScreen from '../screens/RequestDetailRequesterScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';

export default function MainApp({ onLoggedOut }) {
  const [tab, setTab] = useState('home');
  const [stack, setStack] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = (screen, params = {}, options = {}) => {
    setStack((current) => {
      const next = { screen, params };
      if (options.replace && current.length > 0) {
        return [...current.slice(0, -1), next];
      }
      return [...current, next];
    });
  };
  const goBack = () => setStack((current) => current.slice(0, -1));
  const route = stack[stack.length - 1];

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuOpen) {
        setMenuOpen(false);
        return true;
      }
      if (stack.length === 0) return false;
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [stack.length, menuOpen]);

  const openHistory = () => {
    setMenuOpen(false);
    navigate('history');
  };

  const openMenu = () => setMenuOpen(true);

  let screen = null;
  if (route) {
    switch (route.screen) {
      case 'add-card':
        screen = <AddCardScreen onBack={goBack} onSaved={goBack} />;
        break;
      case 'card-detail':
        screen = <CardDetailScreen cardId={route.params.cardId} onBack={goBack} />;
        break;
      case 'add-circle':
        screen = <AddCircleScreen onBack={goBack} />;
        break;
      case 'create-request':
        screen = (
          <CreateRequestScreen
            onBack={goBack}
            onNavigate={navigate}
            onOpenCircle={() => {
              setTab('circle');
              goBack();
            }}
          />
        );
        break;
      case 'history':
        screen = <HistoryScreen onBack={goBack} onNavigate={navigate} />;
        break;
      case 'history-list':
        screen = (
          <HistoryListScreen
            role={route.params.role}
            onBack={goBack}
            onNavigate={navigate}
          />
        );
        break;
      case 'order-detail':
        screen = (
          <OrderDetailHolderScreen
            orderId={route.params.orderId}
            onBack={goBack}
            onNavigate={navigate}
          />
        );
        break;
      case 'request-detail':
        screen = (
          <RequestDetailRequesterScreen
            requestId={route.params.requestId}
            onBack={goBack}
            onNavigate={navigate}
          />
        );
        break;
      case 'transaction-detail':
        screen = (
          <TransactionDetailScreen
            txnId={route.params.txnId}
            role={route.params.role}
            snapshot={route.params.snapshot}
            onBack={goBack}
            onNavigate={navigate}
          />
        );
        break;
      case 'chat':
        screen = (
          <ChatScreen
            threadId={route.params.threadId}
            canSend={route.params.canSend}
            onBack={goBack}
          />
        );
        break;
      case 'profile':
        screen = <ProfileScreen onBack={goBack} onLoggedOut={onLoggedOut} />;
        break;
      default:
        screen = null;
    }
  } else if (tab === 'circle') {
    screen = <CircleScreen activeTab={tab} onTabPress={setTab} onNavigate={navigate} onMenu={openMenu} />;
  } else if (tab === 'request') {
    screen = <RequestsScreen activeTab={tab} onTabPress={setTab} onNavigate={navigate} onMenu={openMenu} />;
  } else {
    screen = <HomeScreen activeTab={tab} onTabPress={setTab} onNavigate={navigate} onMenu={openMenu} />;
  }

  return (
    <View style={{ flex: 1 }}>
      {screen}
      <SideMenu
        visible={menuOpen && !route}
        onClose={() => setMenuOpen(false)}
        onHistory={openHistory}
        onLoggedOut={onLoggedOut}
      />
    </View>
  );
}
