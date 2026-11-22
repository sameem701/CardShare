import { formatPkr } from './format';
import { isYourTurn } from './requestInbox';

export function itemsForMode(items, mode) {
  const role = mode === 'holder' ? 'holding' : 'asked';
  return items.filter((item) => item.role === role);
}

export function sortBannerItems(items) {
  return [...items].sort((a, b) => {
    const turn = Number(isYourTurn(b)) - Number(isYourTurn(a));
    if (turn) return turn;
    return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
  });
}

function headFor(item) {
  const name = item.firstName || 'Someone';
  const store = item.title || 'Order';
  if (item.role === 'asked') {
    if (item.status === 'pending') {
      if (item.groupSize > 1 && item.availableCount > 0) return 'Choose who places this order';
      if (item.groupSize > 1) return 'Waiting for people to reply';
      return `Waiting for ${name} to accept`;
    }
    if (item.status === 'accepted') return `${name} is buying it`;
    if (item.status === 'proof_submitted') return `Check ${name}\u2019s proof`;
    if (item.status === 'unpaid') return `Pay ${name}`;
  } else {
    if (item.status === 'pending') {
      if (item.groupSize > 1 && item.holderReply === 'available') return `Waiting for ${name} to choose`;
      if (item.groupSize > 1) return `${name} asked a few people for ${store}`;
      return `${name} wants ${store} on your ${item.bankName || 'card'}`.trim();
    }
    if (item.status === 'accepted') return `Buy it and send proof for ${name}`;
    if (item.status === 'proof_submitted') return `Waiting for ${name} to check`;
    if (item.status === 'unpaid') return `${name} owes you`;
  }
  return store;
}

function detailFor(item) {
  const card = [item.bankName, item.cardTier].filter(Boolean).join(' ');
  const hasMoney = item.owed != null && (item.status === 'proof_submitted' || item.status === 'unpaid');
  let money = formatPkr(item.amount);
  if (hasMoney) {
    money = item.role === 'asked' ? `you pay ${formatPkr(item.owed)}` : `you receive ${formatPkr(item.owed)}`;
  }
  return [item.title, card, money].filter(Boolean).join(' · ');
}

// Two lines for the Home banner: what to do, then the store, card and amount.
export function bannerParts(item) {
  return { head: headFor(item), detail: detailFor(item) };
}

export function bannerText(item) {
  const { head, detail } = bannerParts(item);
  return `${head}. ${detail}`;
}
