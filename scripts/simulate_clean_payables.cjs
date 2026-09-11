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

  const srp = allRows.filter(i => {
    const c = (i.company_name || i.metadata?.tally_company || '').toUpperCase();
    return c.includes('READY PLAST') || (c.includes('SHOBHA') && !c.includes('BUILDTECH'));
  });

  const isActualVoucher = (inv) => {
    const num = (inv?.invoice_number || '').toUpperCase();
    return !num.startsWith('LEDGER-');
  };

  // Filter out the old 415 duplicate purchase bills where client_name is SHOBHA READY PLAST
  const cleanSRP = srp.filter(i => {
    const num = (i.invoice_number || '').toUpperCase();
    if (!isActualVoucher(i)) return false;
    const vt = (i.metadata?.voucher_type || i.voucher_type || '').toLowerCase();
    const isPur = vt.includes('purchase') || /^(pur|po|sb-pur|sb-p)-/.test(num.toLowerCase());
    if (isPur && i.client_name === 'SHOBHA READY PLAST') {
      return false; // Obsolete duplicate!
    }
    return true;
  });

  const purchaseBills = cleanSRP.filter(i => {
    const vt = (i.metadata?.voucher_type || i.voucher_type || '').toLowerCase();
    const dir = (i.metadata?.direction || i.direction || '').toLowerCase();
    const num = (i.invoice_number || '').toLowerCase();
    return vt.includes('purchase') || dir === 'payable' || /^(pur|po|sb-pur|sb-p)-/.test(num);
  });

  const paymentVouchers = cleanSRP.filter(i => {
    const vt = (i.metadata?.voucher_type || i.voucher_type || '').toLowerCase();
    const dir = (i.metadata?.direction || i.direction || '').toLowerCase();
    const num = (i.invoice_number || '').toLowerCase();
    return vt.includes('payment') || dir === 'paid_out' || /^(pay|pmt|sb-pay|srp-pay)-/.test(num);
  });

  console.log('Clean Purchase bills count:', purchaseBills.length, 'Sum: ₹', purchaseBills.reduce((s,i)=>s+Number(i.amount||0),0).toFixed(2));
  console.log('Payment vouchers count:', paymentVouchers.length, 'Sum: ₹', paymentVouchers.reduce((s,i)=>s+Number(i.amount||0),0).toFixed(2));

  // Let's run reconcileVendorInvoices simulation
  // We can simulate it right here:
  const vendorMap = new Map();
  for (const inv of cleanSRP) {
    const p = (inv.client_name || '').trim().toUpperCase();
    if (!vendorMap.has(p)) vendorMap.set(p, { purchases: [], payments: [] });
    const isPur = purchaseBills.some(b => b.id === inv.id);
    const isPay = paymentVouchers.some(b => b.id === inv.id);
    if (isPur) vendorMap.get(p).purchases.push(inv);
    if (isPay) vendorMap.get(p).payments.push(inv);
  }

  let totalBilled = 0;
  let totalSettled = 0;
  let totalPending = 0;
  let totalOverdue = 0;
  let overdueCount = 0;
  let pendingCount = 0;
  let paidCount = 0;

  const today = new Date();
  today.setHours(0,0,0,0);

  for (const [vendor, data] of vendorMap.entries()) {
    const pBills = data.purchases.sort((a,b)=> new Date(a.invoice_date||0) - new Date(b.invoice_date||0));
    let remPayments = data.payments.reduce((s,p)=> s + Number(p.amount||0), 0);

    for (const b of pBills) {
      const bAmt = Number(b.amount || 0);
      totalBilled += bAmt;
      const applied = Math.min(bAmt, remPayments);
      remPayments -= applied;
      const pending = bAmt - applied;
      totalSettled += applied;

      if (pending <= 0.01) {
        paidCount++;
      } else {
        const d = b.due_date ? new Date(b.due_date) : null;
        if (d) d.setHours(0,0,0,0);
        if (d && d < today) {
          overdueCount++;
          totalOverdue += pending;
        } else {
          pendingCount++;
          totalPending += pending;
        }
      }
    }
  }

  console.log('\n--- SIMULATED ACCURATE VENDOR PAYABLES DASHBOARD ---');
  console.log(`Total Vendor Bills:         ₹${totalBilled.toFixed(2)} (${purchaseBills.length} bills)`);
  console.log(`Total Payments to Vendors:  ₹${paymentVouchers.reduce((s,i)=>s+Number(i.amount||0),0).toFixed(2)} (${paymentVouchers.length} vouchers)`);
  console.log(`Total Settled / Paid:       ₹${totalSettled.toFixed(2)} (${paidCount} bills fully paid)`);
  console.log(`Total Outstanding:          ₹${(totalOverdue + totalPending).toFixed(2)} (${overdueCount + pendingCount} bills unpaid)`);
  console.log(`  ↳ Overdue Vendor Bills:   ₹${totalOverdue.toFixed(2)} (${overdueCount} bills past due)`);
  console.log(`  ↳ Pending Payable:        ₹${totalPending.toFixed(2)} (${pendingCount} bills not yet due)`);
}

run();
