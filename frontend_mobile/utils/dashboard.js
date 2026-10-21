import { asList } from './format';
import { amountKept, recordedShare } from './settlement';

export const CHAT_PAGE_SIZE = 30;

export function isThisMonth(ms) {
  if (ms == null || ms === '') return false;
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function paidRows(rows) {
  return asList(rows).filter((txn) => txn.txn_status === 'paid');
}

function inThisMonth(txn) {
  return isThisMonth(txn.updated_at || txn.created_at);
}

function sum(rows, pick) {
  return rows.reduce((total, txn) => total + (pick(txn) || 0), 0);
}

export function dashboardStats({ holderHistory, requesterHistory }) {
  const paidHeld = paidRows(holderHistory);
  const paidAsked = paidRows(requesterHistory);
  const heldMonth = paidHeld.filter(inThisMonth);
  const askedMonth = paidAsked.filter(inThisMonth);

  const earnedByCard = {};
  paidHeld.forEach((txn) => {
    if (!txn.card_id) return;
    earnedByCard[txn.card_id] = (earnedByCard[txn.card_id] || 0) + (recordedShare(txn) || 0);
  });

  return {
    earnedAll: sum(paidHeld, recordedShare),
    earnedMonth: sum(heldMonth, recordedShare),
    holderOrders: paidHeld.length,
    holderOrdersMonth: heldMonth.length,
    savedAll: sum(paidAsked, amountKept),
    savedMonth: sum(askedMonth, amountKept),
    requesterOrders: paidAsked.length,
    requesterOrdersMonth: askedMonth.length,
    earnedByCard,
  };
}
