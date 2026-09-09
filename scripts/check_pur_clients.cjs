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
  let allRows = [];
  let start = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase.from('invoices').select('id, invoice_number, client_name, company_name, amount, metadata').range(start, start + step - 1);
    if (error) { console.error(error); break; }
    allRows = allRows.concat(data);
    if (data.length < step) break;
    start += step;
  }

  const isActualVoucher = (inv) => {
    const num = (inv?.invoice_number || inv?.tally_voucher_number || '').toUpperCase();
    return !num.startsWith('LEDGER-');
  };

  const purchaseBills = allRows.filter(i => {
    const vt = (i.voucher_type || i.metadata?.voucher_type || '').toLowerCase();
    const dir = (i.direction || i.metadata?.direction || '').toLowerCase();
    const num = (i.invoice_number || '').toLowerCase();
    if (!isActualVoucher(i)) return false;
    return vt.includes('purchase') || dir === 'payable' || /^(pur|po|sb-pur|sb-p)-/.test(num);
  });

  console.log('Total purchase bills across all companies:', purchaseBills.length);

  const byClient = {};
  purchaseBills.forEach(p => {
    const c = p.client_name || 'BLANK';
    byClient[c] = (byClient[c] || 0) + 1;
  });
  console.log('Purchase bills by client_name:', byClient);
}

run();
