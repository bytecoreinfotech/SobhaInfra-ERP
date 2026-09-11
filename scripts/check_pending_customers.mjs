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

async function test() {
  let allData = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase.from('invoices').select('*').range(offset, offset + 999).order('created_at', { ascending: false });
    if (!data || !data.length) break;
    allData.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  const { data: cm } = await supabase.from('customer_master').select('*').limit(2000);
  const cleanStr = (v) => (v === null || v === undefined) ? '' : String(v).trim();
  const normalized = allData.map(inv => ({
    ...inv,
    voucher_type: cleanStr(inv.voucher_type) || cleanStr(inv.metadata?.voucher_type) || '',
    direction: cleanStr(inv.direction) || cleanStr(inv.metadata?.direction) || '',
    company_name: cleanStr(inv.company_name) || cleanStr(inv.metadata?.tally_company) || cleanStr(inv.tally_company) || '',
    invoice_number: cleanStr(inv.invoice_number) || cleanStr(inv.tally_voucher_number) || '',
    tally_voucher_number: cleanStr(inv.tally_voucher_number) || cleanStr(inv.invoice_number) || '',
  }));
  const reconciled = reconcileCustomerInvoices(normalized);
  const srp = reconciled.filter(inv => {
    const c = (inv.company_name || inv.tally_company || '').toUpperCase();
    return c.includes('READY PLAST');
  });
  const tx = srp.filter(inv => {
    const num = (inv.invoice_number || inv.tally_voucher_number || '').toUpperCase();
    return !num.startsWith('LEDGER-') && !num.startsWith('OP-') && isSalesVoucher(inv);
  });
  const cIndex = buildCustomerIndex(cm);
  const enriched = tx.map(inv => {
    const match = matchCustomer(inv, cIndex);
    return { ...inv, _sheet_customer: match.customer };
  });

  const groupMap = new Map();
  for (const inv of enriched) {
    const key = (inv._sheet_customer?.id || inv._sheet_customer?.company_name || inv.client_name || '').trim().toUpperCase();
    if (!key) continue;
    if (!groupMap.has(key)) {
      groupMap.set(key, { key, name: inv._sheet_customer?.company_name || inv.client_name, invoices: [], overdueCount: 0, pendingCount: 0, totalPending: 0 });
    }
    const g = groupMap.get(key);
    g.invoices.push(inv);
    const amt = Number(inv.amount || 0);
    const bal = Number(inv.pending_amount !== undefined && inv.status !== 'Paid' ? inv.pending_amount : (inv.status === 'Paid' ? 0 : amt));
    g.totalPending += bal;
    if (inv.status === 'Overdue') g.overdueCount++;
    else if (inv.status === 'Pending') g.pendingCount++;
  }

  const allGroups = Array.from(groupMap.values()).sort((a,b) => b.totalPending - a.totalPending);
  const pendingOnly = allGroups.filter(g => g.pendingCount > 0 && g.overdueCount === 0);
  console.log('Customers with pendingCount > 0 and overdueCount === 0 (Count:', pendingOnly.length, '):');
  pendingOnly.forEach((g, idx) => console.log(idx + 1, g.name, 'Pending Amt:', g.totalPending, 'Invoices:', g.invoices.map(i => i.invoice_number + ' (' + i.status + ')')));
}
test();
