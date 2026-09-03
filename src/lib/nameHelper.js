/**
 * nameHelper.js
 * Utility to extract clean primary/given name (main name without surname, titles, or company prefix)
 * Examples:
 *   "Ajit Kumar"            -> "Ajit"
 *   "Kumar Ajit"            -> "Ajit"
 *   "Pooja kumari"          -> "Pooja"
 *   "Shobha Group - Neelam" -> "Neelam"
 *   "PK PATIL"              -> "PK"
 *   "GURDAYAL SINGH"        -> "Gurdayal"
 *   "AASHIM BHAI"           -> "Aashim"
 *   "AMAR KANORIA"          -> "Amar"
 *   "SAMJI SETH"            -> "Samji"
 *   "HASNUKH NARIGRA"       -> "Hasnukh"
 */

const SURNAME_SET = new Set([
  'kumar', 'kumari', 'singh', 'sharma', 'patel', 'patil', 'shah', 'jain', 'gupta', 'verma', 
  'mehta', 'yadav', 'mishra', 'tiwari', 'pandey', 'jha', 'das', 'ali', 'khan', 'narigra', 
  'kanoria', 'gehlot', 'parmar', 'khot', 'seth', 'bhai', 'ji', 'saab', 'sahab', 'devi',
  'shri', 'mr', 'mrs', 'dr', 'er', 'pvt', 'ltd', 'enterprises', 'enterprise', 'traders'
]);

export function extractMainName(fullName, companyName = '') {
  let name = (fullName || '').trim();
  if (!name && companyName) {
    name = companyName.trim();
  }
  if (!name) return 'Sir/Ma\'am';

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
  if (words.length === 0) return 'Sir/Ma\'am';

  // If first word is a title or honorific e.g. 'Kumar Ajit' or 'Shri Rajesh'
  const firstWordLower = words[0].toLowerCase().replace(/[^a-z]/g, '');
  if (['mr', 'shri', 'dr', 'er', 'kumar'].includes(firstWordLower) && words.length > 1) {
    words = words.slice(1);
  }

  // Filter out trailing surnames/suffixes
  while (words.length > 1) {
    const lastWordLower = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '');
    if (SURNAME_SET.has(lastWordLower)) {
      words.pop();
    } else {
      break;
    }
  }

  // Take the primary given name
  let main = words[0] || name;
  main = main.replace(/[^a-zA-Z0-9.]/g, '');
  if (!main) return 'Sir/Ma\'am';

  // Capitalize nicely
  if (main.length <= 3 && main.toUpperCase() === main) {
    return main; // Keep acronyms like PK, SS as is
  }
  return main.charAt(0).toUpperCase() + main.slice(1).toLowerCase();
}
