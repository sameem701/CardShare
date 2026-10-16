import { asList } from './format';
import { amountKept, amountOwed } from './settlement';

export const CHAT_PAGE_SIZE = 30;

export function isThisMonth(ms) {
  if (ms == null || ms === '') return false;
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export function dashboardStats({ holderHistory, requesterHistory, circle }) {
  const held = asList(holderHistory);
  const asked = asList(requesterHistory);
  const paidHeld = held.filter((txn) => txn.txn_status === 'paid');
  const paidHeldThisMonth = paidHeld.filter((txn) => isThisMonth(txn.updated_at || txn.created_at));
  const paidAskedThisMonth = asked.filter(
    (txn) => txn.txn_status === 'paid' && isThisMonth(txn.updated_at || txn.created_at)
  );

  const earnedByCard = {};
  paidHeld.forEach((txn) => {
    if (!txn.card_id) return;
    earnedByCard[txn.card_id] = (earnedByCard[txn.card_id] || 0) + (amountOwed(txn) || 0);
  });

  return {
    earnedAll: paidHeld.reduce((sum, txn) => sum + (amountOwed(txn) || 0), 0),
    earnedMonth: paidHeldThisMonth.reduce((sum, txn) => sum + (amountOwed(txn) || 0), 0),
    savedMonth: paidHeldThisMonth.reduce((sum, txn) => sum + (amountKept(txn) || 0), 0),
    paidCountMonth: paidHeldThisMonth.length + paidAskedThisMonth.length,
    circleCount: asList(circle).filter((member) => member.c_status === 'accepted').length,
    earnedByCard,
  };
}
