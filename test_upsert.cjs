const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jbgkeeubevwopphekwfj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiZ2tlZXViZXZ3b3BwaGVrd2ZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTk0OTI3MiwiZXhwIjoyMTAxNTI1MjcyfQ.no6vIDGE9691Q4O_zYeWIDWKzgKCO2z0bHTY2f0-Io8';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function testUpsert() {
  const row = {
    invoice_number: 'INV-TEST-999',
    client_name: 'SOBHA INFRATECH',
    client_phone: '+919876543210',
    amount: 150000,
    status: 'Pending',
    due_date: '2026-09-01'
  };

  // Test upsert by checking if invoice_number exists, or upsert with onConflict if constraint exists
  const { data: existing } = await supabase.from('invoices').select('id').eq('invoice_number', row.invoice_number).maybeSingle();
  let result;
  if (existing) {
    result = await supabase.from('invoices').update(row).eq('id', existing.id).select();
    console.log('Updated existing invoice:', result);
  } else {
    result = await supabase.from('invoices').insert([row]).select();
    console.log('Inserted new invoice:', result);
  }

  // Verify fetch
  const all = await supabase.from('invoices').select('*');
  console.log('All invoices in DB now:', all.data);

  // Clean up test
  await supabase.from('invoices').delete().eq('invoice_number', 'INV-TEST-999');
}

testUpsert().catch(console.error);
