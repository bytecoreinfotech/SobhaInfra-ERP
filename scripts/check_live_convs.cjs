const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function checkConvs() {
  const { data: convs, error: cErr } = await supabase.from('whatsapp_conversations').select('*').limit(10);
  console.log('whatsapp_conversations count:', convs ? convs.length : cErr);
  if (convs && convs.length) console.log(convs.map(c => ({ phone: c.phone || c.customer_phone, name: c.customer_name, last_msg: c.last_message, updated_at: c.updated_at })));

  const { data: msgs, error: mErr } = await supabase.from('whatsapp_messages').select('*').order('created_at', { ascending: false }).limit(5);
  console.log('whatsapp_messages count:', msgs ? msgs.length : mErr);
  if (msgs && msgs.length) console.log(msgs.map(m => ({ to: m.to_phone || m.phone, dir: m.direction, text: m.message_body?.slice(0, 40), created_at: m.created_at })));
}
checkConvs();
