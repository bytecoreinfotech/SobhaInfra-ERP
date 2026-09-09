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
      .select('id, invoice_number, invoice_date, due_date, amount, metadata')
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

  console.log('Total SRP Purchase Bills:', purchaseBills.length);

  let nullDueDate = 0;
  let hasDueDate = 0;
  let sampleDueDates = [];

  for (const pb of purchaseBills) {
    if (!pb.due_date) {
      nullDueDate++;
    } else {
      hasDueDate++;
      if (sampleDueDates.length < 5) {
        sampleDueDates.push({ inv: pb.invoice_number, inv_date: pb.invoice_date, due_date: pb.due_date });
      }
    }
  }

  console.log(`Has due_date: ${hasDueDate}, Null due_date: ${nullDueDate}`);
  console.log('Sample due dates:', sampleDueDates);

  // How does getDaysOverdue evaluate them?
  const today = new Date();
  today.setHours(0,0,0,0);
  let overdueCount = 0;
  let notOverdueCount = 0;
  let overdueSum = 0;
  let pendingSum = 0;

  for (const pb of purchaseBills) {
    const dStr = pb.due_date || pb.invoice_date; // wait, what does getDaysOverdue do when pb.due_date is null?
    // In reconciliation.js: getDaysOverdue(pb.due_date)
    // If pb.due_date is null, getDaysOverdue returns 0!
    // But what does pb.due_date contain in the DB?
    const d = pb.due_date ? new Date(pb.due_date) : null;
    if (d) d.setHours(0,0,0,0);
    const isOverdue = d && d < today;
    if (isOverdue) {
      overdueCount++;
      overdueSum += Number(pb.amount || 0);
    } else {
      notOverdueCount++;
      pendingSum += Number(pb.amount || 0);
    }
  }

  console.log(`Overdue count: ${overdueCount}, Sum: ₹${overdueSum.toFixed(2)}`);
  console.log(`Not overdue count: ${notOverdueCount}, Sum: ₹${pendingSum.toFixed(2)}`);
}

run();
