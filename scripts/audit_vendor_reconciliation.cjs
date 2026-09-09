const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Parse .env
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
    const { data, error } = await supabase.from('invoices').select('*').range(start, start + step - 1);
    if (error) { console.error(error); break; }
    allRows = allRows.concat(data);
    if (data.length < step) break;
    start += step;
  }
  
  const srp = allRows.filter(i => {
    const c = (i.company_name || i.tally_company || '').toUpperCase();
    return c.includes('READY PLAST') || (c.includes('SHOBHA') && !c.includes('BUILDTECH'));
  });

  const isActualVoucher = (inv) => {
    const num = (inv?.invoice_number || inv?.tally_voucher_number || '').toUpperCase();
    return !num.startsWith('LEDGER-');
  };

  const purchaseBills = srp.filter(i => {
    const vt = (i.voucher_type || i.metadata?.voucher_type || '').toLowerCase();
    const dir = (i.direction || i.metadata?.direction || '').toLowerCase();
    const num = (i.invoice_number || '').toLowerCase();
    if (!isActualVoucher(i)) return false;
    return vt.includes('purchase') || dir === 'payable' || /^(pur|po|sb-pur|sb-p)-/.test(num);
  });

  const paymentVouchers = srp.filter(i => {
    const vt = (i.voucher_type || i.metadata?.voucher_type || '').toLowerCase();
    const dir = (i.direction || i.metadata?.direction || '').toLowerCase();
    const num = (i.invoice_number || '').toLowerCase();
    if (!isActualVoucher(i)) return false;
    return vt.includes('payment') || dir === 'paid_out' || /^(pay|pmt|sb-pay|srp-pay)-/.test(num);
  });

  console.log('Purchase Bills count:', purchaseBills.length, 'Sum:', purchaseBills.reduce((s,i)=>s+Number(i.amount||0),0));
  console.log('Payment Vouchers count:', paymentVouchers.length, 'Sum:', paymentVouchers.reduce((s,i)=>s+Number(i.amount||0),0));

  // Let's inspect party names and amounts
  const vendorPurMap = new Map();
  for (const pb of purchaseBills) {
    const p = (pb.client_name || '').trim().toUpperCase();
    vendorPurMap.set(p, (vendorPurMap.get(p) || 0) + Number(pb.amount || 0));
  }

  const vendorPayMap = new Map();
  for (const pv of paymentVouchers) {
    const p = (pv.client_name || '').trim().toUpperCase();
    vendorPayMap.set(p, (vendorPayMap.get(p) || 0) + Number(pv.amount || 0));
  }

  console.log('Total Vendors in Purchases:', vendorPurMap.size);
  console.log('Total Vendors in Payments:', vendorPayMap.size);

  let totalPur = 0;
  let totalPay = 0;
  for (const [v, amt] of vendorPurMap) totalPur += amt;
  for (const [v, amt] of vendorPayMap) totalPay += amt;

  console.log(`Total Purchases: ₹${totalPur.toFixed(2)}`);
  console.log(`Total Payments:  ₹${totalPay.toFixed(2)}`);

  // Let's see top 10 purchase vendors and their payment status
  console.log('\n--- Top 10 Purchase Vendors vs Payments ---');
  const sortedVendors = Array.from(vendorPurMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 10);
  for (const [v, pAmt] of sortedVendors) {
    const payAmt = vendorPayMap.get(v) || 0;
    console.log(`Vendor: "${v}" -> Purchased: ₹${pAmt.toFixed(2)}, Paid: ₹${payAmt.toFixed(2)}, Net Balance: ₹${(pAmt - payAmt).toFixed(2)}`);
  }

  // Let's also check LEDGER- closing balances for vendors in Tally
  const vendorLedgers = srp.filter(i => {
    const num = (i.invoice_number || '').toUpperCase();
    return num.startsWith('LEDGER-') && (i.direction === 'payable' || i.metadata?.direction === 'payable');
  });
  console.log('\nVendor Ledger markers count:', vendorLedgers.length);
  const ledgerSum = vendorLedgers.reduce((s,i)=>s+Number(i.amount||0),0);
  console.log(`Total Vendor Closing Balances (from Tally ledgers): ₹${ledgerSum.toFixed(2)}`);

  // Also check all LEDGER- records
  const allLedgers = srp.filter(i => (i.invoice_number || '').toUpperCase().startsWith('LEDGER-'));
  console.log('Total SRP LEDGER- count:', allLedgers.length);
  const ledgerDirs = {};
  allLedgers.forEach(l => {
    const d = l.direction || l.metadata?.direction || 'NONE';
    ledgerDirs[d] = (ledgerDirs[d] || 0) + 1;
  });
  console.log('LEDGER- directions:', ledgerDirs);
}

run();
