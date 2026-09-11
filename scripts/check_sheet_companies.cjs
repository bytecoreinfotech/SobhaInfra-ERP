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
  const names = [
    'VIE WIN ENTERPRISES',
    'VINAYAK DEVELOPERS',
    'VIRA INFRA',
    'VISHNU ENTERPRISE',
    'VNR INFRATECH',
    'YADAV TRADING COMPANY'
  ];

  console.log('Checking customer_master table:');
  const { data: allCust, error } = await supabase.from('customer_master').select('*');
  if (error) { console.error('Error:', error); return; }
  console.log(`Total records in customer_master: ${allCust?.length || 0}`);

  for (const n of names) {
    const found = (allCust || []).filter(c => (c.company_name || '').toUpperCase().includes(n) || n.includes((c.company_name || '').toUpperCase()));
    if (found.length) {
      console.log(`✅ FOUND "${n}":`, found.map(f => ({ name: f.company_name, phone: f.contact_number })));
    } else {
      console.log(`❌ NOT FOUND in customer_master: "${n}"`);
    }
  }

  // Also check leads table
  console.log('\nChecking leads table:');
  const { data: allLeads } = await supabase.from('leads').select('name, phone, company');
  for (const n of names) {
    const found = (allLeads || []).filter(l => (l.company || l.name || '').toUpperCase().includes(n));
    if (found.length) {
      console.log(`✅ FOUND in leads "${n}":`, found);
    }
  }

  // Also check conversations table
  console.log('\nChecking conversations table for existing chats:');
  const { data: convs } = await supabase.from('conversations').select('id, contact_name, contact_phone, unread_count, updated_at').limit(50);
  console.log('Total recent conversations:', convs?.length || 0);
  for (const p of ['9472697849', '8092897590']) {
    const match = (convs || []).filter(c => (c.contact_phone || '').includes(p));
    console.log(`Phone ${p} in conversations:`, match);
  }
}

run();
