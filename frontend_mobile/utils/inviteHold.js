import { useSyncExternalStore } from 'react';

let code = null;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getPendingInviteCode() {
  return code;
}

export function setPendingInviteCode(next) {
  const value = next ? String(next).trim() : '';
  const resolved = value || null;
  if (resolved === code) return;
  code = resolved;
  emit();
}

export function clearPendingInviteCode() {
  setPendingInviteCode(null);
}

export function usePendingInviteCode() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getPendingInviteCode,
    getPendingInviteCode
  );
}
