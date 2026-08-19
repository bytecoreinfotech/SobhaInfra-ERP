const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jbgkeeubevwopphekwfj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiZ2tlZXViZXZ3b3BwaGVrd2ZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTk0OTI3MiwiZXhwIjoyMTAxNTI1MjcyfQ.no6vIDGE9691Q4O_zYeWIDWKzgKCO2z0bHTY2f0-Io8';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function clean() {
  await supabase.from('invoices').delete().neq('id', 0);
  console.log('Cleaned test invoices.');
}

clean();
