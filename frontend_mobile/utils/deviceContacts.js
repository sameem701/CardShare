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

async function allowContacts() {
  if (Platform.OS === 'web') return false;
  const current = await getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await requestPermissionsAsync();
  return next.granted;
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

export async function contactNamesByPhone(phones) {
  const wanted = [...new Set(phones.map(fullNumber).filter(Boolean))];
  if (!wanted.length) return {};
  const allowed = await allowContacts();
  if (!allowed) return {};
  const rows = await Contact.getAllDetails(NAME_FIELDS);
  const pending = new Set(wanted);
  const found = {};
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
