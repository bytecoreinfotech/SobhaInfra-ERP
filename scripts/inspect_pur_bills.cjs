const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_name, company_name, amount, metadata')
    .ilike('company_name', '%READY PLAST%')
    .limit(30);

  if (error) { console.error(error); return; }

  const pur = data.filter(i => {
    const vt = (i.voucher_type || i.metadata?.voucher_type || '').toLowerCase();
    const dir = (i.direction || i.metadata?.direction || '').toLowerCase();
    const num = (i.invoice_number || '').toLowerCase();
    return vt.includes('purchase') || dir === 'payable' || /^(pur|po)-/.test(num);
  });

  console.log('Sample SRP Purchase bills count:', pur.length);
  for (const inv of pur.slice(0, 15)) {
    console.log(inv.invoice_number, '| Party:', inv.client_name, '| Amount:', inv.amount, '| Meta:', JSON.stringify(inv.metadata));
  }
}

run();
