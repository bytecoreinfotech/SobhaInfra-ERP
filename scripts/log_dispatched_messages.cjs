const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function logDispatches() {
  const logs = [
    {
      convId: 'f31742cd-180e-4741-83ac-6f8f47f267b0',
      wamid: 'wamid.HBgMOTE5NDcyNjk3ODQ5FQIAERgSRjFEMkU5NDYzODdCRjk0RURGAA==',
      body: 'Tax Invoice Dispatched: SRP-SALES-12 | Rs. 85,050.00 | SHOBHA READY PLAST',
      phone: '+919472697849',
      invNum: 'SRP-SALES-12'
    },
    {
      convId: 'bb255255-36f9-426b-bf2c-1b128fb9f7da',
      wamid: 'wamid.HBgMOTE4MDkyODk3NTkwFQIAERgSNjZFMkU3MjI2QjU5NzEwQjdBAA==',
      body: 'Tax Invoice Dispatched: SRP-SALES-23 | Rs. 85,050.00 | SHOBHA READY PLAST',
      phone: '+918092897590',
      invNum: 'SRP-SALES-23'
    },
    {
      convId: 'f31742cd-180e-4741-83ac-6f8f47f267b0',
      wamid: 'wamid.HBgMOTE5NDcyNjk3ODQ5FQIAERgSOTUwRTQxRTVFQjY2MjdCRjRBAA==',
      body: 'Tax Invoice Dispatched: SRP-SALES-632 | Rs. 80,325.00 | SHOBHA READY PLAST',
      phone: '+919472697849',
      invNum: 'SRP-SALES-632'
    }
  ];

  for (const l of logs) {
    await supabase.from('whatsapp_messages').insert([{
      organization_id: '00000000-0000-0000-0000-000000000001',
      conversation_id: l.convId,
      provider_message_id: l.wamid,
      direction: 'outbound',
      sender_type: 'system',
      message_type: 'template',
      body: l.body,
      status: 'sent'
    }]);

    await supabase.from('whatsapp_conversations').update({
      last_message_text: l.body,
      last_message_at: new Date().toISOString()
    }).eq('id', l.convId);

    console.log(`Logged ${l.invNum} for ${l.phone}`);
  }
}

logDispatches();
