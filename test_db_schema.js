const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jbgkeeubevwopphekwfj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiZ2tlZXViZXZ3b3BwaGVrd2ZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTk0OTI3MiwiZXhwIjoyMTAxNTI1MjcyfQ.no6vIDGE9691Q4O_zYeWIDWKzgKCO2z0bHTY2f0-Io8';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function check() {
  console.log('Testing Supabase connection...');
  
  // 1. Try to query invoices
  const invRes = await supabase.from('invoices').select('*').limit(2);
  console.log('Invoices query result:', invRes);

  // 2. Try to insert test invoice to see which columns are accepted
  const testObj = {
    invoice_number: 'TEST-001',
    client_name: 'Test Client',
    client_phone: '+919999999999',
    amount: 100,
    status: 'Pending'
  };
  
  const testIns = await supabase.from('invoices').insert([testObj]).select();
  console.log('Insert test with invoice_number:', testIns);

  // 3. Try with tally_voucher_number
  const testObj2 = {
    tally_voucher_number: 'TEST-002',
    client_name: 'Test Client 2',
    amount: 200
  };
  const testIns2 = await supabase.from('invoices').insert([testObj2]).select();
  console.log('Insert test with tally_voucher_number:', testIns2);
}

check().catch(console.error);
