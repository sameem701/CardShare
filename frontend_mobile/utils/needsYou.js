import { firstName, isYourTurn } from './requestInbox';

const GROUP_META = {
  holder: { label: 'As cardholder', colorKey: 'green' },
  asker: { label: 'As requester', colorKey: 'blue' },
  circle: { label: 'Circle', colorKey: 'lavender' },
};

export function needsYouVerb(item) {
  if (item.role === 'holding') {
    if (item.status === 'pending') return item.groupSize > 1 ? 'Available' : 'Accept';
    if (item.status === 'accepted') return 'Upload';
    if (item.status === 'unpaid') return 'Receive';
  }
  if (item.role === 'asked') {
    if (item.status === 'pending') return 'Choose';
    if (item.status === 'proof_submitted') return 'Review';
    if (item.status === 'unpaid') return 'Pay';
  }
  return 'Open';
}

export function needsYouOrderRows(items) {
  return items.filter(isYourTurn).map((item) => ({
    key: item.key,
    group: item.role === 'holding' ? 'holder' : 'asker',
    title: item.title,
    sub: item.subtitle,
    verb: needsYouVerb(item),
    mode: item.role === 'holding' ? 'holder' : 'requester',
    nav: item.nav,
  }));
}

export function needsYouCircleRow(received) {
  if (!received.length) return null;
  const one = received.length === 1;
  const names = received.map((member) => firstName(member.contact_name || member.display_name) || 'Someone');
  const viaLink = one && received[0].invite_via === 'link';
  return {
    key: 'join',
    group: 'circle',
    title: one ? '1 pending invite' : `${received.length} pending invites`,
    sub: viaLink ? 'Asked through your invite link' : names.join(', '),
    verb: 'Review',
    nav: { screen: 'circle', params: { filter: 'pending' } },
  };
}

export function needsYouRows(items, received) {
  const rows = needsYouOrderRows(items);
  const circle = needsYouCircleRow(received);
  if (circle) rows.push(circle);
  return rows;
}

export function needsYouGroupOrder(mode) {
  const cur = mode === 'holder' ? 'holder' : 'asker';
  return [cur, cur === 'holder' ? 'asker' : 'holder', 'circle'];
}

export function needsYouGroups(mode, rows, frozen) {
  const order = frozen || needsYouGroupOrder(mode);
  return order
    .map((key) => ({
      key,
      label: GROUP_META[key].label,
      colorKey: GROUP_META[key].colorKey,
      rows: rows.filter((row) => row.group === key),
    }))
    .filter((group) => group.rows.length);
}

export function needsYouCountLabel(count) {
  if (count > 9) return '9+';
  return String(count);
}
