const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function inspectNewInvoices() {
  const invNums = ['SRP-SALES-12', 'SRP-SALES-632', 'SRP-SALES-23'];
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .in('invoice_number', invNums);

  if (error) {
    console.error('Error fetching invoices:', error);
    return;
  }

  console.log('Fetched invoices:', data.length);
  for (const inv of data) {
    console.log('--------------------------------------------------');
    console.log('Invoice Number:', inv.invoice_number);
    console.log('Client Name:', inv.client_name);
    console.log('Client Phone:', inv.client_phone);
    console.log('Amount:', inv.amount);
    console.log('Date:', inv.invoice_date);
    console.log('Due Date:', inv.due_date);
    console.log('PDF URL:', inv.pdf_url);
    console.log('Metadata:', JSON.stringify(inv.metadata, null, 2));
  }
}

inspectNewInvoices();
