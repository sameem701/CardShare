import { Linking, Share } from 'react-native';
import { lookupInviteLink, resolveInviteLink, sendCircleInvite } from '../api/circle';
import { formatDisplayName } from './initials';
import { clearPendingInviteCode, setPendingInviteCode } from './inviteHold';

export const INVITE_SHARE_BLURB =
  'Friends and family request a bank-card discount on online orders. Whoever has the card places the order and earns a share. Whoever doesn’t, saves.';

export function inviteUrl(code) {
  return `cardshare://invite/${encodeURIComponent(String(code || '').trim())}`;
}

export function firstNameOf(displayName) {
  const formatted = formatDisplayName(displayName);
  return formatted.split(/\s+/)[0] || 'Someone';
}

export function possessiveName(displayName) {
  const first = firstNameOf(displayName);
  return /s$/i.test(first) ? `${first}'` : `${first}'s`;
}

export function parseInviteUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  const pathMatch = raw.match(/^cardshare:\/\/invite\/([^/?#]+)/i);
  if (pathMatch) {
    try {
      return decodeURIComponent(pathMatch[1]);
    } catch {
      return pathMatch[1];
    }
  }
  try {
    const parsed = new URL(raw);
    const fromQuery = parsed.searchParams.get('invite') || parsed.searchParams.get('code');
    if (fromQuery && fromQuery.trim()) return fromQuery.trim();
    if (parsed.protocol === 'cardshare:' && parsed.hostname === 'invite') {
      const part = parsed.pathname.replace(/^\//, '').trim();
      return part || null;
    }
    const path = parsed.pathname.match(/\/invite\/([^/]+)/);
    if (path) return decodeURIComponent(path[1]);
  } catch {
    return null;
  }
  return null;
}

export function captureInviteUrl(url) {
  const found = parseInviteUrl(url);
  if (found) setPendingInviteCode(found);
  return found;
}

export async function listenForInviteLinks() {
  const apply = (event) => {
    captureInviteUrl(typeof event === 'string' ? event : event?.url);
  };
  try {
    const initial = await Linking.getInitialURL();
    if (initial) captureInviteUrl(initial);
  } catch {
    // No initial URL.
  }
  if (typeof window !== 'undefined' && window.location?.href) {
    captureInviteUrl(window.location.href);
  }
  const sub = Linking.addEventListener('url', apply);
  return () => sub.remove();
}

export function inviteShareMessage(displayName, code) {
  const link = inviteUrl(code);
  return `Join ${possessiveName(displayName)} circle on CardShare ${link}\n\n${INVITE_SHARE_BLURB}`;
}

export async function shareInviteLink(displayName, code) {
  const message = inviteShareMessage(displayName, code);
  await Share.share({ message });
}

export async function lookupInvite(code) {
  return lookupInviteLink(code);
}

export async function sendLinkInvite(sessionId, userId, inviterId, contactName) {
  await sendCircleInvite(sessionId, userId, inviterId, contactName, 'link');
}

export function applyInviteResolution(navigation, showToast, result) {
  const name = result?.display_name || 'them';
  const status = result?.status;
  const go = (screen, params) => navigation.navigate(screen, params);
  if (status === 'can_send' && result.inviter_id) {
    go('add-circle', {
      inviterId: result.inviter_id,
      inviterName: name,
      inviteVia: 'link',
    });
  } else if (status === 'already_sent') {
    go('circle', { filter: 'sent', at: Date.now() });
    showToast('That invite was already sent.');
  } else if (status === 'already_member') {
    go('circle', { filter: 'circle', at: Date.now() });
    showToast(`${firstNameOf(name)} is already in your circle.`);
  } else if (status === 'already_received') {
    go('circle', { filter: 'pending', at: Date.now() });
    showToast('A request from them is already waiting.');
  } else if (status === 'self') {
    showToast('That is your own invite link.');
  } else if (status === 'invalid') {
    showToast('Invite not found.');
  }
  clearPendingInviteCode();
}

export async function resolveAndApply(sessionId, userId, code, navigation, showToast) {
  const result = await resolveInviteLink(sessionId, userId, code);
  applyInviteResolution(navigation, showToast, result);
  return result;
}
