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
    .select('*')
    .ilike('company_name', '%READY PLAST%')
    .limit(100);

  if (error) { console.error(error); return; }

  const pur = data.filter(i => {
    const vt = (i.voucher_type || i.metadata?.voucher_type || '').toLowerCase();
    const dir = (i.direction || i.metadata?.direction || '').toLowerCase();
    const num = (i.invoice_number || '').toLowerCase();
    if (num.startsWith('ledger-')) return false;
    return vt.includes('purchase') || dir === 'payable' || /^(pur|po)-/.test(num);
  });

  console.log('Found PUR bills in sample:', pur.length);
  for (const p of pur.slice(0, 5)) {
    console.log('--- Invoice:', p.invoice_number, '---');
    console.log('Direct columns:', {
      client_name: p.client_name,
      client_phone: p.client_phone,
      amount: p.amount,
      direction: p.direction,
      voucher_type: p.voucher_type,
      reference_number: p.reference_number,
      order_number: p.order_number,
      description: p.description,
    });
    console.log('Metadata keys:', Object.keys(p.metadata || {}));
    console.log('Full metadata:', p.metadata);
  }
}

run();
