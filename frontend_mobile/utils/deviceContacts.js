import { Platform } from 'react-native';
import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { normalizePhone } from './phone';

const NAME_FIELDS = [
  ContactField.GIVEN_NAME,
  ContactField.FAMILY_NAME,
  ContactField.FULL_NAME,
  ContactField.PHONES,
];

function realContactName(contact) {
  const combined = [contact?.givenName, contact?.familyName].filter(Boolean).join(' ').trim();
  const name = combined || String(contact?.fullName || '').trim();
  if (!name) return null;
  const stripped = name.replace(/[\s()+.-]/g, '');
  if (/^[0-9]+$/.test(stripped)) return null;
  return name.length > 100 ? name.slice(0, 100) : name;
}

function fullNumber(value) {
  const phone = normalizePhone(value);
  if (phone.replace(/\D/g, '').length < 10) return '';
  return phone;
}

// Where the phone's contacts permission stands, without asking:
//   granted      can read contacts
//   ask          never decided, the phone will show its prompt
//   blocked      refused and the phone will not ask again
//   unavailable  no contacts on this device (web)
export async function contactsPermission() {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    const current = await getPermissionsAsync();
    if (current.granted) return 'granted';
    return current.canAskAgain ? 'ask' : 'blocked';
  } catch {
    return 'unavailable';
  }
}

// Shows the phone's own prompt. Returns the new state, same words as above.
export async function requestContactsPermission() {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    const next = await requestPermissionsAsync();
    if (next.granted) return 'granted';
    return next.canAskAgain ? 'ask' : 'blocked';
  } catch {
    return 'unavailable';
  }
}

async function allowContacts() {
  const state = await contactsPermission();
  if (state === 'granted') return true;
  if (state !== 'ask') return false;
  return (await requestContactsPermission()) === 'granted';
}

export async function listPhoneContacts() {
  if (Platform.OS === 'web') return { unavailable: true, contacts: [] };
  const allowed = await allowContacts();
  if (!allowed) {
    const state = await contactsPermission();
    return { denied: true, blocked: state === 'blocked', contacts: [] };
  }
  const rows = await Contact.getAllDetails(NAME_FIELDS);
  const byPhone = new Map();
  for (const contact of rows || []) {
    const name = realContactName(contact);
    for (const entry of contact.phones || []) {
      const phone = fullNumber(entry.number);
      if (!phone || byPhone.has(phone)) continue;
      byPhone.set(phone, { phone, name: name || phone });
    }
  }
  return { contacts: [...byPhone.values()].slice(0, 80) };
}

export async function pickContact() {
  if (Platform.OS === 'web') return { unavailable: true };
  const allowed = await allowContacts();
  if (!allowed) return { denied: true };
  const contact = await Contact.presentPicker();
  if (!contact) return null;
  const details = await contact.getDetails(NAME_FIELDS);
  const phone = (details.phones || []).map((entry) => fullNumber(entry.number)).find(Boolean);
  if (!phone) return { error: 'That contact has no phone number.' };
  return { phone, name: realContactName(details) };
}

// Compares these numbers with the contacts and returns phone -> saved name, or null.
// Never shows a permission prompt. Throws if contacts cannot be read, so the caller
// can leave those numbers unchecked instead of marking them "not in your contacts".
export async function checkNumbersAgainstContacts(phones) {
  const wanted = [...new Set(phones.map(fullNumber).filter(Boolean))];
  const found = {};
  wanted.forEach((phone) => { found[phone] = null; });
  if (!wanted.length) return found;
  if ((await contactsPermission()) !== 'granted') throw new Error('Contacts access is off.');
  const rows = await Contact.getAllDetails(NAME_FIELDS);
  const pending = new Set(wanted);
  for (const contact of rows || []) {
    const name = realContactName(contact);
    if (!name) continue;
    for (const entry of contact.phones || []) {
      const phone = fullNumber(entry.number);
      if (!pending.has(phone)) continue;
      found[phone] = name;
      pending.delete(phone);
    }
    if (!pending.size) break;
  }
  return found;
}
