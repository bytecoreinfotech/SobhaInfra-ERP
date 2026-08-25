const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = (match[2] || '').trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1]] = val;
  }
});

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await sb.from('email_logs').select('id').limit(1);
  if (error) {
    console.log('email_logs table check error:', error.message);
    const sql = fs.readFileSync('supabase/migrations/010_email_system.sql', 'utf8');
    const { data: rpcData, error: rpcError } = await sb.rpc('exec_sql', { sql_query: sql });
    if (rpcError) {
      console.log('exec_sql RPC not present, testing via direct insert or fallback:', rpcError.message);
    } else {
      console.log('Migration executed successfully via RPC!');
    }
  } else {
    console.log('✅ Table email_logs exists and is accessible!');
  }
}

run();
