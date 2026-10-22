function targetKey(params = {}) {
  if (params.orderId) return `order:${params.orderId}`;
  if (params.requestId) return `request:${params.requestId}`;
  if (params.threadId) return `chat:${params.threadId}`;
  if (params.cardId) return `card:${params.cardId}`;
  if (params.txnId) return `txn:${params.txnId}:${params.role || ''}`;
  if (params.role) return `role:${params.role}`;
  return 'one';
}

export function screenId({ params }) {
  return targetKey(params);
}

function findStack(navigation) {
  let current = navigation;
  while (current) {
    const names = current.getState?.()?.routeNames;
    if (names?.includes('order-detail')) return current;
    current = current.getParent?.();
  }
  return navigation;
}

export function openScreen(navigation, name, params, options = {}) {
  const stack = findStack(navigation);
  const routes = stack.getState()?.routes ?? [];
  const key = targetKey(params);
  const index = routes.findIndex((route) => route.name === name && targetKey(route.params) === key);
  if (index >= 0) {
    const distance = routes.length - 1 - index;
    if (distance > 0) stack.pop(distance);
    return;
  }
  if (options.replace) {
    stack.replace(name, params);
    return;
  }
  stack.navigate(name, params);
}

export function openRequests(navigation) {
  const stack = findStack(navigation);
  const routes = stack.getState()?.routes ?? [];
  const index = routes.findIndex((route) => route.name === 'Tabs');
  if (index >= 0) {
    const distance = routes.length - 1 - index;
    if (distance > 0) stack.pop(distance);
  }
  stack.navigate('Tabs', { screen: 'Request' });
}

export function openCircle(navigation, options = {}) {
  const stack = findStack(navigation);
  const routes = stack.getState()?.routes ?? [];
  const index = routes.findIndex((route) => route.name === 'Tabs');
  if (index >= 0) {
    const distance = routes.length - 1 - index;
    if (distance > 0) stack.pop(distance);
  }
  stack.navigate('Tabs', {
    screen: 'Circle',
    params: { filter: options.pending ? 'pending' : 'circle', at: Date.now() },
  });
}
