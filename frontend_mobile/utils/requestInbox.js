import { asList, formatPkr } from './format';
import { REQUEST_STATUS_LABELS, TXN_STATUS_LABELS, requestStatusVariant, txnStatusVariant } from './orderRules';

export function isYourTurn(item) {
  if (item.role === 'holding') {
    return item.status === 'pending' || item.status === 'accepted' || item.status === 'unpaid';
  }
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

function unpaidAskedItem(item) {
  return {
    key: `unpaid-asked-${item.id}`,
    role: 'asked',
    status: 'unpaid',
    updatedAt: item.updated_at || item.created_at,
    title: item.merchant,
    subtitle: `You asked ${item.card_holder_name || 'them'} · ${formatPkr(item.order_amount)}`,
    badge: TXN_STATUS_LABELS.unpaid,
    badgeVariant: txnStatusVariant('unpaid'),
    id: item.id,
    unreadCount: 0,
    nav: { screen: 'transaction-detail', params: { txnId: item.id, role: 'requester' } },
  };
}

function unpaidHoldingItem(item) {
  return {
    key: `unpaid-hold-${item.id}`,
    role: 'holding',
    status: 'unpaid',
    updatedAt: item.updated_at || item.created_at,
    title: item.merchant,
    subtitle: `${item.requester_name || 'Someone'} · ${formatPkr(item.order_amount)}`,
    badge: TXN_STATUS_LABELS.unpaid,
    badgeVariant: txnStatusVariant('unpaid'),
    id: item.id,
    unreadCount: 0,
    nav: { screen: 'transaction-detail', params: { txnId: item.id, role: 'holder' } },
  };
}

export function buildRequestItems(sent, incoming, holding, unpaidAsked, unpaidHolding) {
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
  if (unpaidAsked?.status === 'fulfilled') {
    items.push(...asList(unpaidAsked.value).map(unpaidAskedItem));
  }
  if (unpaidHolding?.status === 'fulfilled') {
    items.push(...asList(unpaidHolding.value).map(unpaidHoldingItem));
  }
  items.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

  const core = [sent, incoming, holding];
  const failed = [...core, unpaidAsked, unpaidHolding].filter((result) => result?.status === 'rejected');
  const coreFailed = core.filter((result) => result.status === 'rejected');
  let error = '';
  if (coreFailed.length === 3) {
    error = coreFailed[0].reason?.message || 'Could not load requests.';
  } else if (failed.length) {
    error = 'Some requests could not be loaded.';
  }
  return { items, error, failedAll: coreFailed.length === 3 };
}

export function unreadTotal(items) {
  return items.reduce((sum, item) => sum + (Number(item.unreadCount) || 0), 0);
}
