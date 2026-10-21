import { asList, formatPkr } from './format';
import { REQUEST_STATUS_LABELS, requestStatusVariant } from './orderRules';

export function isYourTurn(item) {
  if (item.role === 'holding') return item.status === 'pending' || item.status === 'accepted';
  if (item.role === 'asked') return item.status === 'proof_submitted';
  return false;
}

function askedItem(item) {
  return {
    key: `asked-${item.id}`,
    role: 'asked',
    status: item.rq_status,
    updatedAt: item.updated_at || item.created_at,
    title: item.merchant,
    subtitle: `You asked ${item.card_holder_name || 'them'} · ${formatPkr(item.order_amount)}`,
    badge: REQUEST_STATUS_LABELS[item.rq_status] || item.rq_status,
    badgeVariant: requestStatusVariant(item.rq_status),
    id: item.id,
    unreadCount: Number(item.unread_count) || 0,
    nav: { screen: 'request-detail', params: { requestId: item.id } },
  };
}

function holdingItem(item, status) {
  return {
    key: `hold-${item.id}`,
    role: 'holding',
    status,
    updatedAt: item.updated_at || item.created_at,
    title: item.merchant,
    subtitle: `${item.requester_name || 'Someone'} · ${formatPkr(item.order_amount)}`,
    badge: REQUEST_STATUS_LABELS[status] || status,
    badgeVariant: requestStatusVariant(status),
    id: item.id,
    unreadCount: Number(item.unread_count) || 0,
    nav: { screen: 'order-detail', params: { orderId: item.id } },
  };
}

export function buildRequestItems(sent, incoming, holding) {
  const items = [];
  if (sent.status === 'fulfilled') {
    items.push(...asList(sent.value).map(askedItem));
  }
  if (incoming.status === 'fulfilled') {
    items.push(...asList(incoming.value).map((item) => holdingItem(item, 'pending')));
  }
  if (holding.status === 'fulfilled') {
    items.push(...asList(holding.value).map((item) => holdingItem(item, item.rq_status)));
  }
  items.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

  const failed = [sent, incoming, holding].filter((result) => result.status === 'rejected');
  let error = '';
  if (failed.length === 3) {
    error = failed[0].reason?.message || 'Could not load requests.';
  } else if (failed.length) {
    error = 'Some requests could not be loaded.';
  }
  return { items, error, failedAll: failed.length === 3 };
}

export function unreadTotal(items) {
  return items.reduce((sum, item) => sum + (Number(item.unreadCount) || 0), 0);
}
