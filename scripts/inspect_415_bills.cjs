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
  const { data: bills } = await supabase
    .from('invoices')
    .select('id, invoice_number, tally_voucher_number, client_name, amount, metadata, created_at')
    .ilike('company_name', '%READY PLAST%')
    .eq('client_name', 'SHOBHA READY PLAST')
    .limit(100);

  console.log('Fetched sample Shobha Ready Plast self-assigned bills:', bills?.length);
  const pur = (bills || []).filter(b => (b.metadata?.voucher_type || '').toLowerCase() === 'purchase');
  console.log('Purchase vouchers in sample:', pur.length);
  for (const b of pur.slice(0, 5)) {
    console.log({
      invoice_number: b.invoice_number,
      tally_voucher_number: b.tally_voucher_number,
      raw_vnum: b.metadata?.raw_voucher_number,
      sync_source: b.metadata?.sync_source,
      synced_at: b.metadata?.synced_at,
      created_at: b.created_at
    });
  }

  // Also check if any of these exist in Tally's debug XML:
  // C:\Users\Public\Automation\tally_debug_2_SalesVouchers_SHOBHA READY PLAST.xml
  const debugXmlPath = 'C:\\Users\\Public\\Automation\\tally_debug_2_SalesVouchers_SHOBHA READY PLAST.xml';
  if (fs.existsSync(debugXmlPath)) {
    console.log('Found debug XML for 2_SalesVouchers!');
    const stat = fs.statSync(debugXmlPath);
    console.log('File size:', stat.size, 'bytes');
  }
}

run();
