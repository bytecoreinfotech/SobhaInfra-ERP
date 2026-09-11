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

async function checkKeys() {
  const { data: allData } = await supabase.from('invoices').select('*').in('invoice_number', ['SRP-SALES-12', 'SRP-SALES-23', 'SRP-SALES-632']);
  const { data: customerMaster } = await supabase.from('customer_master').select('*');

  const customerIndex = buildCustomerIndex(customerMaster);

  for (const inv of allData) {
    const match = matchCustomer(inv, customerIndex);
    console.log('Invoice:', inv.invoice_number);
    console.log('  client_name:', inv.client_name);
    console.log('  match.status:', match.status);
    console.log('  match.customer.id:', match.customer?.id);
    console.log('  match.customer.company_name:', match.customer?.company_name);
    console.log('  match.customer.contact_number:', match.customer?.contact_number);
    const key = (match.customer?.id || match.customer?.company_name || inv.client_name || '').trim().toUpperCase();
    console.log('  GROUP KEY:', key);
  }
}

checkKeys();
