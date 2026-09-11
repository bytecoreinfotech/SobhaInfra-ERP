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
      .select('id, invoice_number, client_name, company_name, metadata')
      .range(start, start + step - 1);
    if (error) { console.error(error); break; }
    allRows = allRows.concat(data);
    if (data.length < step) break;
    start += step;
  }

  // Find the exact 415 obsolete purchase bills with client_name = 'SHOBHA READY PLAST'
  const toDelete = allRows.filter(i => {
    const num = (i.invoice_number || '').toUpperCase();
    if (num.startsWith('LEDGER-')) return false;
    const vt = (i.metadata?.voucher_type || '').toLowerCase();
    const isPur = vt.includes('purchase') || /^(pur|po|sb-pur|sb-p)-/.test(num.toLowerCase());
    const isSrp = (i.company_name || i.metadata?.tally_company || '').toUpperCase().includes('READY PLAST');
    return isSrp && isPur && i.client_name === 'SHOBHA READY PLAST';
  });

  console.log(`Found ${toDelete.length} obsolete duplicate purchase bills to delete.`);

  const ids = toDelete.map(r => r.id);
  // Delete in batches of 100
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { error: delErr } = await supabase.from('invoices').delete().in('id', batch);
    if (delErr) {
      console.error('Error deleting batch:', delErr);
      break;
    }
    deleted += batch.length;
    console.log(`Deleted ${deleted} / ${ids.length}`);
  }

  console.log(`✅ Cleanup finished! Successfully deleted ${deleted} obsolete duplicate records.`);
}

run();
