const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jbgkeeubevwopphekwfj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiZ2tlZXViZXZ3b3BwaGVrd2ZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTk0OTI3MiwiZXhwIjoyMTAxNTI1MjcyfQ.no6vIDGE9691Q4O_zYeWIDWKzgKCO2z0bHTY2f0-Io8';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function check() {
  console.log('Checking other tables:');
  const tables = ['tally_connections', 'ledger_mappings', 'sync_errors', 'leads', 'payment_reminders'];
  for (const t of tables) {
    const res = await supabase.from(t).select('*').limit(1);
    console.log(`Table '${t}':`, res.error ? `Error: ${res.error.message}` : `OK (${res.data?.length} rows)`);
    if (res.data && res.data.length > 0) {
      console.log(`  Sample row:`, Object.keys(res.data[0]));
    }
  }
}

check().catch(console.error);
