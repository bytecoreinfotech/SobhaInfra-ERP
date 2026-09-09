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

  // Build a global GSTIN -> Party Name map from ALL vouchers (including LEDGER- markers!)
  const globalGstinMap = new Map();
  for (const r of allRows) {
    const g = r.metadata?.gstin;
    const name = r.client_name;
    if (g && name && !name.toUpperCase().includes('SHOBHA')) {
      globalGstinMap.set(g, name);
    }
  }
  console.log('Global GSTIN to non-Shobha party map size:', globalGstinMap.size);

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

  let matched = 0;
  let unmatched = 0;
  const unmatchedGstins = new Set();
  for (const pb of purchaseBills) {
    const g = pb.metadata?.gstin;
    if (g && globalGstinMap.has(g)) {
      matched++;
    } else {
      unmatched++;
      if (g) unmatchedGstins.add(g);
    }
  }

  console.log(`Matched with global map: ${matched}, Unmatched: ${unmatched}`);
  console.log('Sample unmatched GSTINs:', Array.from(unmatchedGstins).slice(0, 10));
}

run();
