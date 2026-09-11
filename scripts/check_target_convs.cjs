const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function checkTargetConvs() {
  const { data: convs } = await supabase.from('whatsapp_conversations').select('*');
  if (convs && convs.length) {
    console.log('Columns:', Object.keys(convs[0]));
    const matches = convs.filter(c => {
      const s = JSON.stringify(c);
      return s.includes('9472697849') || s.includes('8092897590');
    });
    console.log('Matching conversations with 9472697849 or 8092897590:', matches);
  }
}
checkTargetConvs();
