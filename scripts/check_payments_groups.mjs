import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { reconcileCustomerInvoices, isSalesVoucher } from '../src/lib/reconciliation.js';
import { buildCustomerIndex, matchCustomer } from '../src/lib/customerMatcher.js';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkCustomerGroups() {
  let allData = [];
  let offset = 0;
  const batchSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .range(offset, offset + batchSize - 1)
      .order('created_at', { ascending: false });
    if (error || !data || data.length === 0) break;
    allData.push(...data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }
  console.log('Total invoices fetched:', allData.length);

  const { data: customerMaster } = await supabase.from('customer_master').select('*').limit(2000);

  // Clean strings like getInvoices does
  const cleanStr = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).trim();
    return (s === 'undefined' || s === 'null' || s === 'NaN') ? '' : s;
  };
  const normalized = allData.map(inv => ({
    ...inv,
    voucher_type: cleanStr(inv.voucher_type) || cleanStr(inv.metadata?.voucher_type) || '',
    direction: cleanStr(inv.direction) || cleanStr(inv.metadata?.direction) || '',
    company_name: cleanStr(inv.company_name) || cleanStr(inv.metadata?.tally_company) || cleanStr(inv.tally_company) || '',
    invoice_number: cleanStr(inv.invoice_number) || cleanStr(inv.tally_voucher_number) || `INV-${inv.id?.slice(0, 8)}`,
    tally_voucher_number: cleanStr(inv.tally_voucher_number) || cleanStr(inv.invoice_number) || '',
  }));

  const targetNums = ['SRP-SALES-12', 'SRP-SALES-23', 'SRP-SALES-632'];
  const targets = normalized.filter(i => targetNums.includes(i.invoice_number));
  console.log('Target invoices count in normalized:', targets.length);

  const customerIndex = buildCustomerIndex(customerMaster);
  const reconciled = reconcileCustomerInvoices(normalized);

  // Filter SHOBHA READY PLAST
  const srpInvoices = reconciled.filter(inv => {
    const invCompany = (inv.company_name || inv.tally_company || '').toUpperCase();
    return invCompany.includes('READY PLAST');
  });
  console.log('Total SRP Invoices:', srpInvoices.length);

  const transactional = srpInvoices.filter(inv => {
    const num = (inv?.invoice_number || inv?.tally_voucher_number || '').toUpperCase();
    if (num.startsWith('LEDGER-') || num.startsWith('OP-')) return false;
    return isSalesVoucher(inv);
  });
  console.log('Total transactional sales for SRP:', transactional.length);

  // Enriched invoices
  const enrichedInvoices = transactional.map(inv => {
    const match = matchCustomer(inv, customerIndex);
    const isSheetVerified = match.status === 'verified' && !!match.customer;
    const sheetCustomer = isSheetVerified ? match.customer : null;
    const sheetPhone = (sheetCustomer?.contact_number || '').trim();
    const tallyPhone = (inv.client_phone || '').trim();
    const activePhone = sheetPhone || tallyPhone;
    const digits = activePhone.replace(/\D/g, '');
    const hasVerifiedPhone = digits.length >= 10;
    return {
      ...inv,
      _sheet_customer: sheetCustomer,
      _is_sheet_customer: isSheetVerified,
      _has_verified_phone: hasVerifiedPhone,
      _verified_phone: hasVerifiedPhone ? activePhone : '',
      _contact_person: sheetCustomer?.contact_person || '',
    };
  });

  // Check the 3 targets in enrichedInvoices
  for (const t of targetNums) {
    const found = enrichedInvoices.find(i => i.invoice_number === t);
    if (found) {
      console.log(`Target ${t} (${found.client_name}): in enriched! Phone: "${found._verified_phone}", HasVerified: ${found._has_verified_phone}, SheetCustomer: ${!!found._sheet_customer}`);
    } else {
      console.log(`Target ${t}: NOT in enriched!`);
    }
  }

  // Check groupMap
  const groupMap = new Map();
  for (const inv of enrichedInvoices) {
    const key = (inv._sheet_customer?.id || inv._sheet_customer?.company_name || inv.client_name || '').trim().toUpperCase();
    if (!key) continue;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        clientName: inv.client_name,
        totalPending: 0,
        invoices: [],
      });
    }
    const grp = groupMap.get(key);
    grp.invoices.push(inv);
    const amt = Number(inv.amount || 0);
    const bal = Number(inv.pending_amount !== undefined && inv.status !== 'Paid' ? inv.pending_amount : (inv.status === 'Paid' ? 0 : amt));
    grp.totalPending += bal;
  }

  const allGroups = Array.from(groupMap.values()).sort((a, b) => b.totalPending - a.totalPending);
  console.log(`Total customer groups: ${allGroups.length}`);

  for (const name of ['VIE WIN ENTERPRISES', 'VNR INFRATECH', 'YADAV TRADING COMPANY']) {
    const idx = allGroups.findIndex(g => g.key.includes(name) || name.includes(g.key));
    if (idx !== -1) {
      const g = allGroups[idx];
      console.log(`Group for "${name}" FOUND at index ${idx} (Rank #${idx+1}): Pending: ₹${g.totalPending}, Invoices count: ${g.invoices.length}`);
    } else {
      console.log(`Group for "${name}" NOT FOUND!`);
    }
  }
}

checkCustomerGroups();
