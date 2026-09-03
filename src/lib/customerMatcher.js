/**
 * customerMatcher.js
 * Smart 4-tier fuzzy matching engine against Google Sheet customer master.
 * Tier 1: Exact match (case-insensitive)
 * Tier 2: Normalized match (suffixes stripped, & → and, no special chars)
 * Tier 3: Phone cross-check (Tally phone vs sheet phone)
 * Tier 4: Levenshtein similarity >= 85% → auto-verified
 */

const SUFFIX_PATTERN = /\b(private\s+limited|pvt\.?\s*ltd\.?|ltd\.?|llp|inc\.?|corp\.?|corporation|enterprises?|enterprise|traders?|trading\s+co\.?|trading\s+company|trading|agency|agencies|associates?|builders?|developer|developers?|infrasolutions?|infracon|infratech|infra|constructions?|construction|contractor|contractors?|suppliers?|supplier|store|depot|co\.?|huf|aop|lp|m\/s)\b/gi;

export function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  let n = name.toLowerCase().trim();
  n = n.replace(/\s*&\s*/g, ' and ');
  n = n.replace(SUFFIX_PATTERN, ' ');
  n = n.replace(/[^a-z0-9]/g, '');
  return n;
}

function levenshteinSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const dp = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[la][lb] / Math.max(la, lb);
}

export function buildCustomerIndex(customers) {
  const exactMap = new Map();
  const normMap  = new Map();
  const phoneMap = new Map();
  for (const c of customers) {
    if (!c.company_name) continue;
    exactMap.set(c.company_name.toLowerCase().trim(), c);
    const nk = c.normalized_key || normalizeName(c.company_name);
    if (nk) normMap.set(nk, c);
    if (c.contact_number) {
      const digits = c.contact_number.replace(/\D/g, '').slice(-10);
      if (digits.length === 10) phoneMap.set(digits, c);
    }
  }
  return { exactMap, normMap, phoneMap, all: customers };
}

export function matchCustomer(inv, index) {
  if (!index || !index.all || index.all.length === 0) return { status: 'unverified', customer: null };
  const { exactMap, normMap, phoneMap, all } = index;
  const partyName = (inv.client_name || '').trim();
  if (!partyName) return { status: 'unverified', customer: null };

  // Tier 1: Exact
  const exactKey = partyName.toLowerCase().trim();
  if (exactMap.has(exactKey)) return { status: 'verified', customer: exactMap.get(exactKey) };

  // Tier 2: Normalized
  const normKey = normalizeName(partyName);
  if (normKey && normMap.has(normKey)) return { status: 'verified', customer: normMap.get(normKey) };

  // Tier 3: Phone
  const invPhone = (inv.client_phone || '').replace(/\D/g, '').slice(-10);
  if (invPhone.length === 10 && phoneMap.has(invPhone)) return { status: 'verified', customer: phoneMap.get(invPhone) };

  // Tier 4: Fuzzy >= 85%
  if (normKey && normKey.length >= 4) {
    let bestScore = 0, bestCustomer = null;
    for (const c of all) {
      const cNorm = c.normalized_key || normalizeName(c.company_name);
      if (!cNorm || cNorm.length < 4) continue;
      const score = levenshteinSimilarity(normKey, cNorm);
      if (score > bestScore) { bestScore = score; bestCustomer = c; }
      if (score === 1) break;
    }
    if (bestScore >= 0.85 && bestCustomer) return { status: 'verified', customer: bestCustomer };
  }

  return { status: 'unverified', customer: null };
}
