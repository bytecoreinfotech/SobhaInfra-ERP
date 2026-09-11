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
      .select('id, invoice_number, tally_voucher_number, client_name, amount, invoice_date, metadata, created_at')
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

  const pur = srp.filter(i => {
    const vt = (i.metadata?.voucher_type || i.voucher_type || '').toLowerCase();
    const dir = (i.metadata?.direction || i.direction || '').toLowerCase();
    const num = (i.invoice_number || '').toLowerCase();
    if (!isActualVoucher(i)) return false;
    return vt.includes('purchase') || dir === 'payable' || /^(pur|po|sb-pur|sb-p)-/.test(num);
  });

  console.log('Total SRP Purchase bills in DB:', pur.length);

  // Separate old (self-assigned) vs new (with real vendor)
  const oldSelf = pur.filter(p => p.client_name === 'SHOBHA READY PLAST');
  const newNamed = pur.filter(p => p.client_name !== 'SHOBHA READY PLAST');

  console.log(`Old self-assigned bills: ${oldSelf.length}, sum: ₹${oldSelf.reduce((s,i)=>s+Number(i.amount||0),0).toFixed(2)}`);
  console.log(`New vendor-named bills:  ${newNamed.length}, sum: ₹${newNamed.reduce((s,i)=>s+Number(i.amount||0),0).toFixed(2)}`);

  // Check how many of newNamed have exact same (amount, invoice_date) as an oldSelf bill
  let matchedDups = 0;
  for (const o of oldSelf) {
    const d = o.invoice_date;
    const a = Number(o.amount || 0);
    const match = newNamed.find(n => n.invoice_date === d && Math.abs(Number(n.amount || 0) - a) < 0.01);
    if (match) {
      matchedDups++;
    }
  }
  console.log(`Old bills that match a new bill by (amount, invoice_date): ${matchedDups} / ${oldSelf.length}`);

  // Check sample matched pair
  for (const o of oldSelf.slice(0, 5)) {
    const d = o.invoice_date;
    const a = Number(o.amount || 0);
    const match = newNamed.find(n => n.invoice_date === d && Math.abs(Number(n.amount || 0) - a) < 0.01);
    if (match) {
      console.log(`DUPLICATE FOUND: Old "${o.invoice_number}" (${o.client_name}, ₹${o.amount}, ${o.invoice_date}) matches New "${match.invoice_number}" (${match.client_name}, ₹${match.amount}, ${match.invoice_date})`);
    }
  }
}

run();
