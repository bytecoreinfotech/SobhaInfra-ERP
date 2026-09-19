/**
 * sync-customer-master.js — Netlify Function
 * Fetches live Google Sheet CSV → normalizes → upserts into Supabase customer_master
 * Triggered: POST /.netlify/functions/sync-customer-master or direct function call
 * Also logs result to sheet_sync_log
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcgmppnvnwnilioapbli.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3MTk4MiwiZXhwIjoyMTAzMTQ3OTgyfQ.iMVtS3kZ5jkXd7wOsgviN_3Umz0Auw7vBa0NDlD9rKg';
const ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_SHEET_ID = '1phUUKnsQcWR9kIPjNsOGr4lzu7Torj8W1XMziRNuncw';

const SUFFIX_PATTERN = /\b(private\s+limited|pvt\.?\s*ltd\.?|ltd\.?|llp|inc\.?|corp\.?|corporation|enterprises?|enterprise|traders?|trading\s+co\.?|trading|agency|agencies|associates?|builders?|developers?|infracon|infratech|infra|constructions?|construction|contractors?|suppliers?|store|depot|co\.?|huf|aop|m\/s)\b/gi;

function normalizeName(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  n = n.replace(/\s*&\s*/g, ' and ');
  n = n.replace(SUFFIX_PATTERN, ' ');
  n = n.replace(/[^a-z0-9]/g, '');
  return n;
}

function normalizePhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return '';
}

function parseCSV(text) {
  if (!text || typeof text !== 'string') return [];
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentVal.trim());
      if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }

  if (currentRow.length > 0 || currentVal !== '') {
    currentRow.push(currentVal.trim());
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) return [];

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));

  const compIdx = headers.findIndex(h => h.includes('company'));
  const custIdx = headers.findIndex(h => h.includes('customer') || h.includes('person') || h.includes('contact name'));
  const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('contact number') || h.includes('number'));
  const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('mail') || h.includes('e-mail'));

  return rows.slice(1).map(cols => {
    return {
      'Company Name': (compIdx >= 0 ? cols[compIdx] : cols[0]) || '',
      'Customer Name': (custIdx >= 0 ? cols[custIdx] : cols[1]) || '',
      'Contact Number': (phoneIdx >= 0 ? cols[phoneIdx] : cols[2]) || '',
      'Email Address': (emailIdx >= 0 ? cols[emailIdx] : (cols[3] || '')) || '',
    };
  }).filter(r => (r['Company Name'] || '').trim().length > 0);
}

/**
 * Core customer master sync function — can be called internally or via Netlify HTTP handler
 */
async function syncCustomerMaster(supabaseClient) {
  const supabase = supabaseClient || createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Get sheet URL from org_settings or use default
  let sheetId = DEFAULT_SHEET_ID;
  try {
    const { data: sheetSetting } = await supabase
      .from('org_settings')
      .select('value')
      .eq('organization_id', ORG_ID)
      .eq('key', 'customer_sheet_url')
      .maybeSingle();
    if (sheetSetting?.value) {
      const match = sheetSetting.value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (match) sheetId = match[1];
    }
  } catch (_) {}

  // Fetch CSV from Google Sheet (public read)
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
  const res = await fetch(csvUrl, { headers: { 'User-Agent': 'SobhaInfra-ERP/1.0' } });
  if (!res.ok) throw new Error(`Google Sheet fetch failed: HTTP ${res.status}`);

  const csvText = await res.text();
  const parsed = parseCSV(csvText);

  // Build rows (deduplicate strictly by exact alphanumeric company name)
  const seenNames = new Set();
  const rows = [];
  const emailDirectory = {};
  const companiesWithNoPhone = [];

  parsed.forEach((row, i) => {
    const company = (row['Company Name'] || '').trim();
    const rawEmail = (row['Email Address'] || '').trim();
    const email = rawEmail.includes('@') ? rawEmail.toLowerCase() : null;

    if (!company) return;
    const identityKey = company.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!identityKey || seenNames.has(identityKey)) return;
    seenNames.add(identityKey);

    const nk = normalizeName(company);
    const normalizedPhone = normalizePhone(row['Contact Number']) || null;

    if (!normalizedPhone) {
      companiesWithNoPhone.push(company);
    }

    rows.push({
      organization_id:  ORG_ID,
      company_name:     company,
      contact_person:   (row['Customer Name'] || '').trim() || null,
      contact_number:   normalizedPhone,
      normalized_key:   nk || identityKey,
      sheet_row_index:  i + 2,
      last_synced_at:   new Date().toISOString(),
    });

    // Record every customer in emailDirectory:
    // If email was removed or left blank, email is stored as null so downstream resolution
    // knows the client explicitly chose not to authorize email follow-up.
    const entry = {
      email: email || null,
      company_name: company,
      contact_person: (row['Customer Name'] || '').trim() || null,
      contact_number: normalizedPhone,
      is_sheet_customer: true,
    };
    emailDirectory[identityKey] = entry;
    if (nk && nk !== identityKey) {
      emailDirectory[nk] = entry;
    }
    if (normalizedPhone) {
      const digits = normalizedPhone.replace(/\D/g, '').slice(-10);
      if (digits) {
        if (email) emailDirectory[`phone_${digits}`] = email;
      }
    }
  });

  // Save emailDirectory into org_settings under customer_email_directory
  try {
    await supabase.from('org_settings').upsert({
      organization_id: ORG_ID,
      key: 'customer_email_directory',
      value: JSON.stringify(emailDirectory),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,key' });
    console.log(`[sync-customer-master] Saved ${Object.keys(emailDirectory).length} customer records to email directory`);
  } catch (dirErr) {
    console.warn('[sync-customer-master] Email directory save notice:', dirErr.message);
  }

  // Delete old records and insert fresh customer_master
  await supabase.from('customer_master').delete().eq('organization_id', ORG_ID);

  let pushed = 0;
  const batchSize = 200;
  for (let i = 0; i < rows.length; i += batchSize) {
    const { error } = await supabase.from('customer_master').insert(rows.slice(i, i + batchSize));
    if (!error) pushed += Math.min(batchSize, rows.length - i);
    else console.warn('[CustomerMaster] Batch error:', error.message);
  }

  // Log sync
  await supabase.from('sheet_sync_log').insert({
    organization_id: ORG_ID,
    row_count: pushed,
    status: pushed > 0 ? 'ok' : 'error',
    error_msg: pushed === 0 ? 'No rows inserted' : null,
  });

  // Authoritative Cleanup: If a client removed contact number from Google Sheet,
  // nullify stale client_phone on active invoices for those companies so stale numbers don't persist
  if (companiesWithNoPhone.length > 0) {
    try {
      for (const comp of companiesWithNoPhone) {
        await supabase
          .from('invoices')
          .update({ client_phone: null })
          .ilike('client_name', `%${comp}%`)
          .eq('organization_id', ORG_ID);
      }
      console.log(`[sync-customer-master] Wiped stale invoice phones for ${companiesWithNoPhone.length} companies with no phone in sheet.`);
    } catch (cleanErr) {
      console.warn('[sync-customer-master] Stale phone cleanup notice:', cleanErr.message);
    }
  }

  return { success: true, synced: pushed, total: rows.length, noPhoneCount: companiesWithNoPhone.length };
}

exports.syncCustomerMaster = syncCustomerMaster;
exports.parseCSV = parseCSV;
exports.normalizeName = normalizeName;
exports.normalizePhone = normalizePhone;

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const result = await syncCustomerMaster();
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error('[sync-customer-master] Error:', err.message);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
