import { useEffect, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
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
      if (stack.length === 0) return false;
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [stack.length]);

  if (route) {
    switch (route.screen) {
      case 'add-card':
        return <AddCardScreen onBack={goBack} onSaved={goBack} />;
      case 'card-detail':
        return <CardDetailScreen cardId={route.params.cardId} onBack={goBack} />;
      case 'add-circle':
        return <AddCircleScreen onBack={goBack} />;
      case 'create-request':
        return (
          <CreateRequestScreen
            onBack={goBack}
            onNavigate={navigate}
            onOpenCircle={() => {
              setTab('circle');
              goBack();
            }}
          />
        );
      case 'history-list':
        return (
          <HistoryListScreen
            role={route.params.role}
            onBack={goBack}
            onNavigate={navigate}
          />
        );
      case 'order-detail':
        return (
          <OrderDetailHolderScreen
            orderId={route.params.orderId}
            onBack={goBack}
            onNavigate={navigate}
          />
        );
      case 'request-detail':
        return (
          <RequestDetailRequesterScreen
            requestId={route.params.requestId}
            onBack={goBack}
            onNavigate={navigate}
          />
        );
      case 'transaction-detail':
        return (
          <TransactionDetailScreen
            txnId={route.params.txnId}
            role={route.params.role}
            snapshot={route.params.snapshot}
            onBack={goBack}
            onNavigate={navigate}
          />
        );
      case 'chat':
        return (
          <ChatScreen
            threadId={route.params.threadId}
            canSend={route.params.canSend}
            onBack={goBack}
          />
        );
      case 'profile':
        return <ProfileScreen onBack={goBack} onLoggedOut={onLoggedOut} />;
      default:
        return null;
    }
  }

  switch (tab) {
    case 'circle':
      return <CircleScreen activeTab={tab} onTabPress={setTab} onNavigate={navigate} />;
    case 'request':
      return <RequestsScreen activeTab={tab} onTabPress={setTab} onNavigate={navigate} />;
    case 'history':
      return <HistoryScreen activeTab={tab} onTabPress={setTab} onNavigate={navigate} />;
    default:
      return <HomeScreen activeTab={tab} onTabPress={setTab} onNavigate={navigate} />;
  }
}
