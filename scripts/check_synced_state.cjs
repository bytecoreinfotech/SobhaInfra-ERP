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
      .select('*')
      .range(start, start + step - 1);
    if (error) { console.error(error); break; }
    allRows = allRows.concat(data);
    if (data.length < step) break;
    start += step;
  }

  console.log('Total invoices in DB:', allRows.length);

  const srp = allRows.filter(i => {
    const c = (i.company_name || i.metadata?.tally_company || '').toUpperCase();
    return c.includes('READY PLAST') || (c.includes('SHOBHA') && !c.includes('BUILDTECH'));
  });
  console.log('Total SRP records:', srp.length);

  const isActualVoucher = (inv) => {
    const num = (inv?.invoice_number || '').toUpperCase();
    return !num.startsWith('LEDGER-');
  };

  const purchaseBills = srp.filter(i => {
    const vt = (i.metadata?.voucher_type || i.voucher_type || '').toLowerCase();
    const dir = (i.metadata?.direction || i.direction || '').toLowerCase();
    const num = (i.invoice_number || '').toLowerCase();
    if (!isActualVoucher(i)) return false;
    return vt.includes('purchase') || dir === 'payable' || /^(pur|po|sb-pur|sb-p)-/.test(num);
  });

  const paymentVouchers = srp.filter(i => {
    const vt = (i.metadata?.voucher_type || i.voucher_type || '').toLowerCase();
    const dir = (i.metadata?.direction || i.direction || '').toLowerCase();
    const num = (i.invoice_number || '').toLowerCase();
    if (!isActualVoucher(i)) return false;
    return vt.includes('payment') || dir === 'paid_out' || /^(pay|pmt|sb-pay|srp-pay)-/.test(num);
  });

  console.log('Purchase bills count:', purchaseBills.length, 'Total amount:', purchaseBills.reduce((s,i)=>s+Number(i.amount||0), 0));
  console.log('Payment vouchers count:', paymentVouchers.length, 'Total amount:', paymentVouchers.reduce((s,i)=>s+Number(i.amount||0), 0));

  // Check unique vendors in purchase bills now!
  const purVendors = new Map();
  for (const pb of purchaseBills) {
    const p = pb.client_name || 'BLANK';
    purVendors.set(p, (purVendors.get(p) || 0) + 1);
  }
  console.log('Unique client_name count in purchase bills:', purVendors.size);
  console.log('Sample purchase bill vendors:');
  const sortedVendors = Array.from(purVendors.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 15);
  console.table(sortedVendors);

  // Check status breakdown of purchase bills
  const statusCounts = {};
  const statusSums = {};
  for (const pb of purchaseBills) {
    const st = pb.status || 'NO_STATUS';
    statusCounts[st] = (statusCounts[st] || 0) + 1;
    statusSums[st] = (statusSums[st] || 0) + Number(pb.pending_amount ?? pb.amount ?? 0);
  }
  console.log('Purchase bills by status:');
  console.table(statusCounts);
  console.log('Purchase bills pending amount by status:');
  console.table(statusSums);

  // Check sample purchase bills with their fields
  console.log('\nSample 5 purchase bills:');
  for (const pb of purchaseBills.slice(0, 5)) {
    console.log({
      invoice_number: pb.invoice_number,
      client_name: pb.client_name,
      amount: pb.amount,
      paid_amount: pb.paid_amount,
      pending_amount: pb.pending_amount,
      status: pb.status,
      due_date: pb.due_date
    });
  }
}

run();
