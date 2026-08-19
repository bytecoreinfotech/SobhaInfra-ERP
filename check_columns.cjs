const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://jbgkeeubevwopphekwfj.supabase.co', 'sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB');

async function checkColumns() {
  const { data, error } = await sb.from('whatsapp_messages').select('*').limit(1);
  if (data && data.length > 0) {
    console.log('Actual columns in whatsapp_messages:', Object.keys(data[0]).join(', '));
  } else {
    // Insert and check
    const r = await sb.from('whatsapp_messages').insert([{
      conversation_id: '918a5194-3f6f-49fc-953a-30958908886c',
      direction: 'inbound', sender_type: 'customer',
      body: 'Column check', status: 'delivered'
    }]).select().maybeSingle();
    if (r.data) console.log('Actual columns:', Object.keys(r.data).join(', '));
  }
  
  // Also check whatsapp_conversations columns
  const { data: c } = await sb.from('whatsapp_conversations').select('*').limit(1).maybeSingle();
  if (c) console.log('Conversation columns:', Object.keys(c).join(', '));
}

checkColumns().catch(console.error);
