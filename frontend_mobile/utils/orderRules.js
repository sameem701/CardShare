export const REQUEST_STATUS_LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  proof_submitted: 'Proof sent',
};

export const TXN_STATUS_LABELS = {
  unpaid: 'Awaiting payment',
  paid: 'Paid',
  cancelled_by_requester: 'Cancelled by the person who asked',
  cancelled_by_holder: 'Cancelled by the card holder',
};

export function txnStatusLabel(status, role) {
  if (status === 'cancelled_by_requester') {
    return role === 'requester' ? 'You cancelled' : 'Requester cancelled';
  }
  if (status === 'cancelled_by_holder') {
    return role === 'holder' ? 'You cancelled' : 'Card holder cancelled';
  }
  return TXN_STATUS_LABELS[status] || status;
}

export function requestStatusVariant(status) {
  if (status === 'accepted') return 'green';
  if (status === 'proof_submitted') return 'blue';
  if (status === 'pending') return 'amber';
  return 'gray';
}

export function txnStatusVariant(status) {
  if (status === 'paid') return 'green';
  if (status === 'unpaid') return 'amber';
  if (String(status || '').startsWith('cancelled')) return 'red';
  return 'gray';
}

export function canChatSendOnRequest(rqStatus) {
  return rqStatus === 'accepted' || rqStatus === 'proof_submitted';
}

export function requesterCanCancel(rqStatus) {
  return rqStatus === 'pending' || rqStatus === 'accepted';
}

export function requesterCancelNeedsReason(rqStatus) {
  return rqStatus === 'accepted';
}

export function holderCanAcceptDecline(rqStatus) {
  return rqStatus === 'pending';
}

export function holderCanCancel(rqStatus) {
  return rqStatus === 'accepted';
}

export function holderCanSubmitProof(rqStatus) {
  return rqStatus === 'accepted';
}

export function requesterCanReviewProof(rqStatus) {
  return rqStatus === 'proof_submitted';
}

export function holderCanConfirmPaid(txnStatus) {
  return txnStatus === 'unpaid';
}
