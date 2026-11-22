import { asList, formatPkr } from './format';
import { amountOwed } from './settlement';

function groupSizeOf(item) {
  return Number(item.group_size ?? item.groupSize) || 1;
}

function availableCountOf(item) {
  return Number(item.available_count ?? item.availableCount) || 0;
}

// Whose move it is. These rows sit under "Needs you" and light the nav dot.
export function isYourTurn(item) {
  if (item.role === 'holding') {
    if (item.status === 'pending') {
      if (groupSizeOf(item) > 1 && (item.holderReply || item.holder_reply) === 'available') return false;
      return true;
    }
    return item.status === 'accepted' || item.status === 'unpaid';
  }
  if (item.role === 'asked') {
    if (item.status === 'pending') return groupSizeOf(item) > 1 && availableCountOf(item) > 0;
    return item.status === 'proof_submitted' || item.status === 'unpaid';
  }
  return false;
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

// Row badge: text and colour for each step, from the point of view of the viewer.
function badgeFor(role, status, first, extra = {}) {
  if (role === 'asked') {
    if (status === 'pending') {
      if (extra.groupSize > 1) {
        return extra.availableCount > 0
          ? { label: 'Choose', variant: 'amber' }
          : { label: 'Waiting', variant: 'blue' };
      }
      return { label: 'Awaiting accept', variant: 'blue' };
    }
    if (status === 'accepted') return { label: 'Buying it', variant: 'blue' };
    if (status === 'proof_submitted') return { label: 'Review proof', variant: 'amber' };
    if (status === 'unpaid') return { label: first ? `Pay ${first}` : 'Pay', variant: 'amber' };
  } else {
    if (status === 'pending') {
      if (extra.groupSize > 1) {
        return extra.holderReply === 'available'
          ? { label: 'Waiting', variant: 'blue' }
          : { label: 'Available?', variant: 'amber' };
      }
      return { label: 'Accept?', variant: 'amber' };
    }
    if (status === 'accepted') return { label: 'Upload proof', variant: 'amber' };
    if (status === 'proof_submitted') return { label: 'Under review', variant: 'blue' };
    if (status === 'unpaid') return { label: 'Mark received', variant: 'amber' };
  }
  return { label: '', variant: 'gray' };
}

function subtitleFor(role, status, first, amount, owed) {
  const money = owed != null && (status === 'proof_submitted' || status === 'unpaid');
  if (money) {
    return role === 'asked'
      ? `${first} · you pay ${formatPkr(owed)}`
      : `${first} · you receive ${formatPkr(owed)}`;
  }
  return `${first} · ${formatPkr(amount)}`;
}

function askedNav(item, extra) {
  if (extra.groupSize > 1 && extra.orderGroupId && item.rq_status === 'pending') {
    return { screen: 'broadcast', params: { groupId: extra.orderGroupId } };
  }
  return { screen: 'order', params: { requestId: item.id } };
}

function build(item, { role, status, personName, kind }) {
  const extra = {
    groupSize: groupSizeOf(item),
    availableCount: availableCountOf(item),
    holderReply: item.holder_reply || item.holderReply || 'sent',
    orderGroupId: item.order_group_id || item.orderGroupId || '',
  };
  const first = firstName(personName) || (role === 'asked' ? 'them' : 'Someone');
  const owed = amountOwed(item);
  const badge = badgeFor(role, status, first, extra);
  const racing = extra.groupSize > 1 && status === 'pending';
  const peopleLabel = extra.groupSize > 1 && role === 'asked'
    ? `${extra.groupSize} people`
    : first;
  return {
    key: racing && extra.orderGroupId ? `${kind}-group-${extra.orderGroupId}` : `${kind}-${item.id}`,
    role,
    status,
    updatedAt: item.updated_at || item.created_at,
    title: item.merchant,
    personName: personName || first,
    firstName: first,
    amount: item.order_amount,
    owed,
    bankName: item.bank_name || '',
    cardTier: item.card_tier || '',
    subtitle: racing && role === 'asked'
      ? `${peopleLabel} · ${formatPkr(item.order_amount)}`
      : subtitleFor(role, status, first, item.order_amount, owed),
    badge: badge.label,
    badgeVariant: badge.variant,
    id: item.id,
    unreadCount: Number(item.unread_count) || 0,
    groupSize: extra.groupSize,
    availableCount: extra.availableCount,
    holderReply: extra.holderReply,
    orderGroupId: extra.orderGroupId,
    nav: kind === 'txn-asked'
      ? { screen: 'order', params: { txnId: item.id, role: 'requester' } }
      : kind === 'txn-hold'
        ? { screen: 'order', params: { txnId: item.id, role: 'holder' } }
        : kind === 'asked'
          ? askedNav(item, extra)
          : { screen: 'order', params: { orderId: item.id } },
  };
}

function collapseSent(list) {
  const grouped = new Map();
  const rest = [];
  for (const item of list) {
    const size = groupSizeOf(item);
    const gid = item.order_group_id;
    if (item.rq_status === 'pending' && size > 1 && gid) {
      const rows = grouped.get(gid) || [];
      rows.push(item);
      grouped.set(gid, rows);
    } else {
      rest.push(item);
    }
  }
  const collapsed = [...grouped.values()].map((rows) => {
    const newest = [...rows].sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0))[0];
    const names = rows.map((row) => firstName(row.card_holder_name) || 'Someone');
    return {
      ...newest,
      group_size: rows.length,
      available_count: rows.filter((row) => row.holder_reply === 'available').length,
      unread_count: rows.reduce((sum, row) => sum + (Number(row.unread_count) || 0), 0),
      card_holder_name: names.length <= 2 ? names.join(', ') : `${names.length} people`,
      updated_at: Math.max(...rows.map((row) => Number(row.updated_at || row.created_at || 0))),
    };
  });
  return [...rest, ...collapsed];
}

function askedItem(item) {
  return build(item, {
    role: 'asked',
    status: item.rq_status,
    personName: item.card_holder_name,
    kind: 'asked',
  });
}

function holdingItem(item, status) {
  return build(item, {
    role: 'holding',
    status,
    personName: item.requester_name,
    kind: 'hold',
  });
}

function unpaidAskedItem(item) {
  return build(item, {
    role: 'asked',
    status: 'unpaid',
    personName: item.card_holder_name,
    kind: 'txn-asked',
  });
}

function unpaidHoldingItem(item) {
  return build(item, {
    role: 'holding',
    status: 'unpaid',
    personName: item.requester_name,
    kind: 'txn-hold',
  });
}

export function buildRequestItems(sent, incoming, holding, unpaidAsked, unpaidHolding) {
  const items = [];
  if (sent.status === 'fulfilled') {
    items.push(...collapseSent(asList(sent.value)).map(askedItem));
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
