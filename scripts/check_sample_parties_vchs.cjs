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
  const names = [
    'VIE WIN',
    'VINAYAK',
    'VIRA INFRA',
    'VISHNU',
    'VNR',
    'YADAV TRADING'
  ];

  for (const n of names) {
    const { data: vchs } = await supabase
      .from('invoices')
      .select('id, invoice_number, client_name, client_phone, amount, invoice_date, metadata')
      .ilike('client_name', `%${n}%`)
      .limit(5);

    if (vchs && vchs.length > 0) {
      console.log(`Party matching "${n}":`);
      for (const v of vchs) {
        console.log(`  - Inv: ${v.invoice_number} | Client: "${v.client_name}" | Phone: "${v.client_phone}" | Date: ${v.invoice_date} | Dispatched: ${v.metadata?.first_dispatched_at || 'NO'}`);
      }
    } else {
      console.log(`No existing vouchers for "${n}"`);
    }
  }
}

run();
