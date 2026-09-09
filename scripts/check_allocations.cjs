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
  const { data: pmts } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_name, amount, metadata')
    .ilike('company_name', '%READY PLAST%')
    .ilike('invoice_number', 'SRP-PAY-%')
    .limit(1000);

  let totalAllocs = 0;
  let sampleRefs = [];
  for (const p of pmts || []) {
    const allocs = p.metadata?.bill_allocations;
    if (allocs && Array.isArray(allocs) && allocs.length > 0) {
      totalAllocs += allocs.length;
      if (sampleRefs.length < 10) {
        sampleRefs.push({ voucher: p.invoice_number, vendor: p.client_name, allocs });
      }
    }
  }

  console.log('Total payment vouchers checked:', pmts?.length);
  console.log('Total bill_allocations found:', totalAllocs);
  console.log('Sample allocs:', JSON.stringify(sampleRefs, null, 2));
}

run();
