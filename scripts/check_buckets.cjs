const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY);

async function run() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) console.error('Buckets error:', error);
  else console.log('Buckets:', buckets.map(b => ({ name: b.name, public: b.public })));
}

run();
