import { asList, formatPkr } from './format';
import { amountKept, amountOwed, recordedShare } from './settlement';

// The single order screen shows live requests, live orders and closed
// transactions the same way. This turns any of the three into one shape.

export const STEP_LABELS = ['Asked', 'Accepted', 'Proof', 'Paid'];
// How many steps have happened in each state.
const STEP_FILLED = { pending: 1, accepted: 2, proof: 3, unpaid: 3, paid: 4 };

export function stepsFilled(state) {
  return STEP_FILLED[state] || 0;
}

function first(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

// source: 'request' (the requester's live request), 'order' (the holder's live
// order) or 'txn' (a transaction). role is 'requester' or 'holder' for txn.
export function buildOrder(source, data, role) {
  if (!data) return null;
  const asked = source === 'request' || (source === 'txn' && role === 'requester');
  let state;
  let by;
  if (source === 'txn') {
    const status = data.txn_status;
    if (status === 'unpaid') state = 'unpaid';
    else if (status === 'paid') state = 'paid';
    else {
      state = 'cancelled';
      const mine = asked ? 'cancelled_by_requester' : 'cancelled_by_holder';
      by = status === mine ? 'me' : 'them';
    }
  } else {
    state = data.rq_status === 'proof_submitted' ? 'proof' : data.rq_status;
  }

  const person = asked ? data.card_holder_name : data.requester_name;
  const price = data.order_amount != null ? Number(data.order_amount) : null;
  const paid = data.actual_amount_paid != null ? Number(data.actual_amount_paid) : null;
  const share = paid != null ? recordedShare(data) : null;
  const owed = paid != null ? amountOwed(data) : null;
  const keep = paid != null ? amountKept(data) : null;

  return {
    source,
    role: asked ? 'asked' : 'holding',
    state,
    by,
    id: data.id,
    store: data.merchant,
    person: person || (asked ? 'Card holder' : 'Someone'),
    first: first(person) || (asked ? 'Card holder' : 'Someone'),
    card: [data.bank_name, data.card_tier].filter(Boolean).join(' \u00b7 '),
    price,
    paid,
    share,
    owed,
    keep,
    url: data.product_url || '',
    note: data.note || '',
    addr: data.delivery_address || '',
    reason: data.cancel_reason || '',
    screenshot: data.screenshot_signed_url || data.screenshot_url || '',
    unread: Number(data.unread_count) || 0,
    live: source !== 'txn',
    promo: data.promo_code || '',
    discountPercent: data.discount_percent != null ? Number(data.discount_percent) : null,
    discountFlat: data.discount_flat_pkr != null ? Number(data.discount_flat_pkr) : null,
    cap: data.cap_pkr != null ? Number(data.cap_pkr) : null,
    min: data.min_order_pkr != null ? Number(data.min_order_pkr) : null,
    estimatedSave: data.estimated_save_pkr != null ? Number(data.estimated_save_pkr) : null,
    groupSize: Number(data.group_size) || 1,
    holderReply: data.holder_reply || 'sent',
    orderGroupId: data.order_group_id || '',
    products: asList(data.products),
  };
}

// The line, the big amount and the small line under it.
export function orderHero(o) {
  const name = o.first;
  const hasMoney = o.owed != null;
  const saved = hasMoney ? formatPkr(o.keep) : '';
  const earned = hasMoney ? formatPkr(o.share) : '';

  if (o.state === 'cancelled') {
    return {
      line: o.by === 'me' ? 'You cancelled this' : `${name} cancelled this`,
      bad: true,
      amount: null,
      sub: o.reason ? `Reason: ${o.reason}` : '',
      reason: true,
    };
  }

  if (o.role === 'asked') {
    switch (o.state) {
      case 'pending': return {
        line: o.groupSize > 1 ? 'Waiting for people to reply' : `Waiting for ${name} to accept`,
        amount: o.price,
        sub: '',
      };
      case 'accepted': return { line: `${name} is buying it`, amount: o.price, sub: '' };
      case 'proof': return { line: `Check ${name}\u2019s proof`, amount: o.owed, sub: hasMoney ? `You save ${saved}` : '' };
      case 'unpaid': return { line: `Pay ${name} outside the app`, amount: o.owed, sub: hasMoney ? `You save ${saved}` : '' };
      default: return { line: 'Paid', amount: o.owed, sub: hasMoney ? `You saved ${saved}` : '' };
    }
  }
  switch (o.state) {
    case 'pending': return {
      line: o.groupSize > 1 && o.holderReply === 'available'
        ? `Waiting for ${name} to choose`
        : o.groupSize > 1
          ? `${name} asked a few people`
          : `${name} wants this on your card`,
      amount: o.price,
      sub: '',
    };
    case 'accepted': return { line: 'Buy it, then send proof', amount: o.price, sub: '' };
    case 'proof': return { line: `Waiting for ${name} to check`, amount: o.owed, sub: hasMoney ? `Includes your ${earned} incentive` : '' };
    case 'unpaid': return { line: `${name} owes you`, amount: o.owed, sub: hasMoney ? `Includes your ${earned} incentive` : '' };
    default: return { line: 'Received', amount: o.owed, sub: hasMoney ? `Includes your ${earned} incentive` : '' };
  }
}

// Icon rows under the hero. Cancelled orders show only who and which card.
export function orderFacts(o) {
  const facts = [{ icon: 'person', text: `${o.person} \u00b7 ${o.card}` }];
  if (o.state === 'cancelled') return facts;
  if (o.role === 'holding') {
    if (o.state === 'pending' && !o.addr) {
      facts.push({ icon: 'lock', text: 'Address shown after you accept', kind: 'locked' });
    } else if (o.addr) {
      facts.push({ icon: 'pin', text: o.addr });
    }
  }
  if (o.url && !o.products?.length) {
    facts.push({ icon: 'link', text: o.url.replace(/^https?:\/\//, ''), kind: 'link', url: o.url });
  }
  if (o.promo) facts.push({ icon: 'info', text: `Promo ${o.promo}` });
  if (o.note) facts.push({ icon: 'info', text: `\u201c${o.note}\u201d`, kind: 'note' });
  return facts;
}

export function orderProductFacts(o) {
  if (!o?.products?.length) return [];
  return o.products.map((item) => {
    const qty = Number(item.qty) || 1;
    const title = String(item.title || '').trim() || String(item.product_url || '').replace(/^https?:\/\//, '') || 'Product';
    const qtyBit = qty > 1 ? ` \u00d7${qty}` : '';
    const extra = item.note ? ` \u2014 ${item.note}` : '';
    const url = item.product_url || '';
    return {
      icon: 'bag',
      text: `${title}${qtyBit}${extra}`,
      kind: url ? 'link' : '',
      url,
    };
  });
}

export function orderOfferRows(o) {
  if (!o || o.state === 'cancelled') return [];
  const rows = [];
  if (o.discountPercent != null) rows.push({ label: 'Discount', value: `${o.discountPercent}% off` });
  else if (o.discountFlat != null) rows.push({ label: 'Discount', value: `${formatPkr(o.discountFlat)} off` });
  if (o.cap != null) rows.push({ label: 'Max cap', value: formatPkr(o.cap) });
  if (o.min != null) rows.push({ label: 'Min order', value: formatPkr(o.min) });
  if (o.promo) rows.push({ label: 'Promo code', value: o.promo });
  if (o.estimatedSave != null) rows.push({ label: 'Estimated save', value: formatPkr(o.estimatedSave) });
  return rows;
}

// The collapsed Details receipt. Only once the card price is known.
export function orderReceipt(o) {
  if (o.owed == null) return null;
  const asked = o.role === 'asked';
  return {
    rows: [
      { label: 'Original price', value: formatPkr(o.price), tone: 'dim' },
      { label: asked ? 'Discounted price' : 'Discounted price (your card)', value: formatPkr(o.paid) },
      { label: `+ ${asked ? 'Their' : 'Your'} incentive (20%)`, value: formatPkr(o.share), tone: asked ? '' : 'earn' },
    ],
    totalLabel: asked ? 'You pay' : 'You receive',
    total: formatPkr(o.owed),
  };
}
