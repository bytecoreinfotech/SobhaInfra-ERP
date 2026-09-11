import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { reconcileVendorInvoices, isPurchaseVoucher } from '../src/lib/reconciliation.js';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  let allRows = [];
  let start = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .range(start, start + step - 1);
    if (error) { console.error(error); break; }
    allRows = allRows.concat(data);
    if (data.length < step) break;
    start += step;
  }

  const reconciled = reconcileVendorInvoices(allRows);

  const srp = reconciled.filter(i => {
    const c = (i.company_name || i.metadata?.tally_company || '').toUpperCase();
    return c.includes('READY PLAST') || (c.includes('SHOBHA') && !c.includes('BUILDTECH'));
  });

  const isActualVoucher = (inv) => {
    const num = (inv?.invoice_number || '').toUpperCase();
    return !num.startsWith('LEDGER-');
  };

  const actualSRP = srp.filter(isActualVoucher);
  const purchaseBills = actualSRP.filter(isPurchaseVoucher);

  const totalInvoiced = purchaseBills.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalPaid = purchaseBills.reduce((s, i) => s + (i.status === 'Paid' ? Number(i.amount || 0) : Number(i.paid_amount || 0)), 0);
  const overdueBills = purchaseBills.filter(i => i.status === 'Overdue');
  const pendingBills = purchaseBills.filter(i => i.status === 'Pending');
  const paidBills = purchaseBills.filter(i => i.status === 'Paid');

  const totalOverdue = overdueBills.reduce((s, i) => s + Number(i.pending_amount ?? i.amount ?? 0), 0);
  const totalPending = pendingBills.reduce((s, i) => s + Number(i.pending_amount ?? i.amount ?? 0), 0);

  console.log('--- RECONCILED VENDOR METRICS IN ERP FRONTEND ---');
  console.log(`Total Vendor Bills:        ₹${totalInvoiced.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${purchaseBills.length} bills)`);
  console.log(`Total Paid / Settled:      ₹${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${paidBills.length} bills fully paid)`);
  console.log(`Total Outstanding:         ₹${(totalOverdue + totalPending).toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${overdueBills.length + pendingBills.length} bills unpaid)`);
  console.log(`  ↳ Overdue Vendor Bills:  ₹${totalOverdue.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${overdueBills.length} bills past due)`);
  console.log(`  ↳ Pending Payable:       ₹${totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${pendingBills.length} bills not yet due)`);
}

run();
