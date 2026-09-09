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
  // Let's fetch payment vouchers for SRP
  const { data: pmt, error: pmtErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_name, amount, metadata')
    .ilike('company_name', '%READY PLAST%')
    .ilike('invoice_number', 'SRP-PAY-%')
    .limit(500);

  if (pmtErr) { console.error(pmtErr); return; }
  console.log('Fetched SRP-PAY vouchers:', pmt.length);

  const gstinToParty = new Map();
  for (const p of pmt) {
    const g = p.metadata?.gstin;
    if (g && p.client_name) {
      gstinToParty.set(g, p.client_name);
    }
  }
  console.log('GSTINs mapped from SRP-PAY vouchers:', gstinToParty.size);

  // Check how many SRP purchase bills have a GSTIN that matches
  const { data: pur, error: purErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_name, amount, metadata')
    .ilike('company_name', '%READY PLAST%')
    .not('invoice_number', 'ilike', 'LEDGER-%')
    .not('invoice_number', 'ilike', 'SRP-PAY-%')
    .not('invoice_number', 'ilike', 'SRP-REC-%')
    .not('invoice_number', 'ilike', 'SRP-INV-%')
    .limit(1000);

  if (purErr) { console.error(purErr); return; }
  console.log('SRP candidate purchase bills:', pur.length);

  let matchedGstin = 0;
  let uniquePurGstins = new Set();
  for (const pb of pur) {
    const g = pb.metadata?.gstin;
    if (g) {
      uniquePurGstins.add(g);
      if (gstinToParty.has(g)) matchedGstin++;
    }
  }
  console.log('Unique GSTINs in purchase bills:', uniquePurGstins.size);
  console.log('Purchase bills whose GSTIN matches a Payment voucher vendor:', matchedGstin);

  // Also check leads table
  const { data: leads } = await supabase.from('leads').select('name, gstin, phone, company');
  console.log('Total leads:', leads?.length || 0);
  const leadsGstinMap = new Map();
  for (const l of leads || []) {
    if (l.gstin) leadsGstinMap.set(l.gstin, l.name);
  }
  console.log('Leads with GSTIN:', leadsGstinMap.size);

  // Check ledger mappings
  const { data: mappings } = await supabase.from('tally_ledger_mappings').select('*');
  console.log('Total tally_ledger_mappings:', mappings?.length || 0);
  for (const m of (mappings || []).slice(0, 5)) {
    console.log('Mapping sample:', m.tally_ledger_name, '->', m.canonical_name);
  }
}

run();
