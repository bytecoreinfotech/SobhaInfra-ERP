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
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, client_name, amount, metadata')
      .range(start, start + step - 1);
    if (error) { console.error(error); break; }
    allRows = allRows.concat(data);
    if (data.length < step) break;
    start += step;
  }

  const srp = allRows.filter(i => {
    const c = (i.company_name || i.metadata?.tally_company || '').toUpperCase();
    return c.includes('READY PLAST') || (c.includes('SHOBHA') && !c.includes('BUILDTECH'));
  });

  const isActualVoucher = (inv) => {
    const num = (inv?.invoice_number || '').toUpperCase();
    return !num.startsWith('LEDGER-');
  };

  const purchaseBills = srp.filter(i => {
    const vt = (i.metadata?.voucher_type || '').toLowerCase();
    const dir = (i.metadata?.direction || '').toLowerCase();
    const num = (i.invoice_number || '').toLowerCase();
    if (!isActualVoucher(i)) return false;
    return vt.includes('purchase') || dir === 'payable' || /^(pur|po)-/.test(num);
  });

  const ledgerCounts = {};
  for (const pb of purchaseBills) {
    const tl = pb.metadata?.tally_ledger || 'NONE';
    ledgerCounts[tl] = (ledgerCounts[tl] || 0) + 1;
  }
  console.log('Purchase bills tally_ledger breakdown:');
  console.table(ledgerCounts);
}

run();
