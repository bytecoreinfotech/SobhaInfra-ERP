const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function checkRecent() {
  const { data } = await supabase.from('whatsapp_messages').select('*').order('created_at', { ascending: false }).limit(10);
  console.log('Last 10 messages in DB:');
  data.forEach(m => {
    console.log(`- ID: ${m.id}, Direction: ${m.direction}, Status: ${m.status}, Err: ${m.error_message}, Wamid: ${m.provider_message_id}, Created: ${m.created_at}`);
  });
}
checkRecent();
