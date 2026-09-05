/**
 * nameHelper.js
 * Utility to extract clean primary/given name (main name without surname, titles, or company prefix)
 * and smartly identify generic placeholders (e.g. "Customer", "Recipient 1", "WhatsApp User")
 * so the CRM and AI messages always use authentic names or clean phone numbers.
 */

const SURNAME_SET = new Set([
  'kumar', 'kumari', 'singh', 'sharma', 'patel', 'patil', 'shah', 'jain', 'gupta', 'verma', 
  'mehta', 'yadav', 'mishra', 'tiwari', 'pandey', 'jha', 'das', 'ali', 'khan', 'narigra', 
  'kanoria', 'gehlot', 'parmar', 'khot', 'seth', 'bhai', 'ji', 'saab', 'sahab', 'devi',
  'shri', 'mr', 'mrs', 'dr', 'er', 'pvt', 'ltd', 'enterprises', 'enterprise', 'traders'
]);

/**
 * Checks if a given name is a generic placeholder or phone number
 */
export function isGenericName(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (/^customer(\s*\d+)?$/i.test(trimmed)) return true;
  if (/^recipient(\s*\d+)?$/i.test(trimmed)) return true;
  if (/^whatsapp\s*user(\s*\(.*\))?$/i.test(trimmed)) return true;
  if (/^user(\s*\d+)?$/i.test(trimmed)) return true;
  if (/^client(\s*\d+)?$/i.test(trimmed)) return true;
  if (/^valued\s*(customer|client)$/i.test(trimmed)) return true;
  if (/^sir\s*\/?\s*ma'?am$/i.test(trimmed)) return true;
  if (/^new\s*(lead|contact|inquiry)$/i.test(trimmed)) return true;
  
  // If it is just phone digits / symbols e.g. "+919160001213" or "9160001213"
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 7 && trimmed.replace(/[\d\s+\-()]/g, '').length === 0) return true;
  
  return false;
}

/**
 * Cleanly format phone number (e.g. +91 91600 01213)
 */
export function formatPhoneNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (String(phone).startsWith('+')) return String(phone);
  return `+${phone}`;
}

/**
 * Return the best display name for UI chat lists and headers.
 * If contactName is a generic placeholder ("Customer", "Recipient 1", etc.),
 * returns the clean formatted phone number instead.
 */
export function getDisplayName(contactName, contactPhone) {
  if (contactName && !isGenericName(contactName)) {
    return contactName.trim();
  }
  return formatPhoneNumber(contactPhone) || 'New Inquiry';
}

/**
 * Extract clean given/first name without surnames or honorifics.
 * Returns empty string if the name is a generic placeholder or phone number.
 */
export function extractMainName(fullName, companyName = '') {
  let name = (fullName || '').trim();
  if (isGenericName(name)) {
    name = (companyName || '').trim();
  }
  if (isGenericName(name)) return '';

  // If contains delimiter like '-', '–', '/', take the personal part
  if (name.includes('-')) {
    const parts = name.split('-');
    name = parts[parts.length - 1].trim() || parts[0].trim();
  } else if (name.includes('–')) {
    const parts = name.split('–');
    name = parts[parts.length - 1].trim() || parts[0].trim();
  } else if (name.includes('/')) {
    const parts = name.split('/');
    name = parts[parts.length - 1].trim() || parts[0].trim();
  }

  // Split into words
  let words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';

  // If first word is a title or honorific e.g. 'Kumar Ajit' or 'Shri Rajesh'
  const firstWordLower = words[0].toLowerCase().replace(/[^\p{L}]/gu, '');
  if (['mr', 'shri', 'dr', 'er', 'kumar'].includes(firstWordLower) && words.length > 1) {
    words = words.slice(1);
  }

  // Filter out trailing surnames/suffixes
  while (words.length > 1) {
    const lastWordLower = words[words.length - 1].toLowerCase().replace(/[^\p{L}]/gu, '');
    if (SURNAME_SET.has(lastWordLower)) {
      words.pop();
    } else {
      break;
    }
  }

  let main = words[0] || name;
  main = main.replace(/[^\p{L}\p{N}]/gu, '');
  if (!main || isGenericName(main)) return '';

  // Keep acronyms like PK, SS as is
  if (main.length <= 3 && main.toUpperCase() === main) {
    return main;
  }
  return main.charAt(0).toUpperCase() + main.slice(1);
}

/**
 * Returns a polite personalized greeting.
 * If name is unknown/generic: "Namaste!" or "Hello!"
 * If name is known: "Namaste Abhay!" or "Hello Abhay!"
 */
export function getGreeting(fullName, companyName = '', greetingWord = 'Namaste') {
  const main = extractMainName(fullName, companyName);
  if (main) return `${greetingWord} ${main}!`;
  return `${greetingWord}!`;
}
