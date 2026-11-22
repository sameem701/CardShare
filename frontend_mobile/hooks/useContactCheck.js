import { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkNumbersAgainstContacts,
  contactsPermission,
  requestContactsPermission,
} from '../utils/deviceContacts';
import { pruneResults, readContactCheck, writeContactCheck } from '../utils/contactCheck';

// Remembers, on this phone, which received invites have been compared with the contacts.
//   phones   normalised numbers of the pending invites the person received (null until loaded)
//   active   true while the screen is showing, so the check runs when the page opens
//
// A number with an entry in `results` is checked: its value is the saved contact name, or
// null for "not in your contacts". A number with no entry is unchecked. Turning the switch
// off or losing permission never moves a checked number back.
export function useContactCheck(userId, phones, active) {
  const [stored, setStored] = useState({ on: false, results: {} });
  const [loaded, setLoaded] = useState(false);
  const [permission, setPermission] = useState('ask');
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(stored);
  const running = useRef(false);
  latest.current = stored;

  const save = useCallback((next) => {
    latest.current = next;
    setStored(next);
    writeContactCheck(userId, next);
  }, [userId]);

  useEffect(() => {
    let live = true;
    setLoaded(false);
    readContactCheck(userId).then((value) => {
      if (!live) return;
      latest.current = value;
      setStored(value);
      setLoaded(true);
    });
    return () => { live = false; };
  }, [userId]);

  // Re-read the saved switch and OS permission when this screen shows, so Settings
  // and Pending stay on the same choice.
  useEffect(() => {
    if (!active || !userId) return undefined;
    let live = true;
    readContactCheck(userId).then((value) => {
      if (!live) return;
      latest.current = value;
      setStored(value);
      setLoaded(true);
    });
    contactsPermission().then((state) => { if (live) setPermission(state); });
    return () => { live = false; };
  }, [active, userId]);

  const enabled = loaded && stored.on && permission === 'granted';
  const phoneKey = phones ? phones.join('|') : null;

  // Numbers that are no longer pending invites do not need a saved result.
  useEffect(() => {
    if (!loaded || !phones) return;
    const pruned = pruneResults(latest.current.results, phones);
    if (pruned !== latest.current.results) save({ ...latest.current, results: pruned });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, phoneKey]);

  const unchecked = phones ? phones.filter((phone) => !(phone in stored.results)) : [];
  const uncheckedKey = unchecked.join('|');
  const pending = enabled && Boolean(phones) && unchecked.length > 0 && !failed;

  // A new invite is worth another try after a failed read.
  useEffect(() => {
    setFailed(false);
  }, [uncheckedKey]);

  useEffect(() => {
    if (!pending || !active || running.current) return undefined;
    let live = true;
    running.current = true;
    checkNumbersAgainstContacts(unchecked)
      .then((found) => {
        if (!live) return;
        save({ ...latest.current, results: { ...latest.current.results, ...found } });
      })
      .catch((err) => {
        if (!live) return;
        setFailed(true);
        setError(err.message || 'Could not read your contacts.');
      })
      .finally(() => {
        running.current = false;
      });
    return () => { live = false; running.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, active, uncheckedKey]);

  // The switch. Returns '' when done, 'blocked' when the person must use Settings,
  // 'unavailable' when this device has no contacts, 'denied' if they said no.
  const toggle = useCallback(async () => {
    setError('');
    if (enabled) {
      save({ ...latest.current, on: false });
      return '';
    }
    let state = await contactsPermission();
    if (state === 'ask') state = await requestContactsPermission();
    setPermission(state);
    if (state === 'granted') {
      setFailed(false);
      save({ ...latest.current, on: true });
      return '';
    }
    if (state === 'blocked') return 'blocked';
    if (state === 'unavailable') return 'unavailable';
    return 'denied';
  }, [enabled, save]);

  const forget = useCallback((phone) => {
    if (!(phone in latest.current.results)) return;
    const results = { ...latest.current.results };
    delete results[phone];
    save({ ...latest.current, results });
  }, [save]);

  const retry = useCallback(() => {
    setError('');
    setFailed(false);
  }, []);

  return {
    ready: loaded,
    enabled,
    permission,
    results: stored.results,
    checking: pending,
    error,
    toggle,
    forget,
    retry,
  };
}
