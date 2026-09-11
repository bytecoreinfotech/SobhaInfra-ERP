const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function checkStatus() {
  const ids = [
    'wamid.HBgMOTE5NDcyNjk3ODQ5FQIAERgSQjZDQ0QwRDY0RkEwQkM5ODM4AA==',
    'wamid.HBgMOTE4MDkyODk3NTkwFQIAERgSRDQxMUMxQkVCQUU0Q0FBNDZFAA==',
    'wamid.HBgMOTE5NDcyNjk3ODQ5FQIAERgSRTY4Q0NFMjQ4NEI2RTExRkYxAA==',
    'wamid.HBgMOTE5NDcyNjk3ODQ5FQIAERgSRkE2MjlDMDYyNUFERkNFQTE3AA==',
    'wamid.HBgMOTE4MDkyODk3NTkwFQIAERgSRkE2Q0Q4NzBFRkU1MTVGQkFCAA==',
    'wamid.HBgMOTE5NDcyNjk3ODQ5FQIAERgSQTY1MEFGQjhGMTBBOEQ4MEMxAA=='
  ];

  const { data, error } = await supabase.from('whatsapp_messages').select('*').in('provider_message_id', ids);
  console.log('Found in whatsapp_messages:', data ? data.length : error);
  if (data) {
    data.forEach(m => {
      console.log(`- ID: ${m.provider_message_id}, Status: ${m.status}, Error: ${m.error_message}, Body: ${m.body?.slice(0, 50)}`);
    });
  }
}
checkStatus();
