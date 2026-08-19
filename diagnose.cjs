const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://jbgkeeubevwopphekwfj.supabase.co', 'sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB');

async function diagnose() {
  // 1. How many conversations for this phone?
  const { data: convs } = await sb.from('whatsapp_conversations')
    .select('id, contact_phone, conversation_mode, last_message_at, unread_count')
    .order('last_message_at', { ascending: false });
  console.log('\n=== ALL CONVERSATIONS ===');
  convs?.forEach(c => console.log(`  id=${c.id} phone=${c.contact_phone} mode=${c.conversation_mode} unread=${c.unread_count} last=${c.last_message_at}`));
  console.log('Total conversations:', convs?.length);

  // 2. Messages per conversation
  console.log('\n=== MESSAGES PER CONVERSATION ===');
  for (const c of (convs || [])) {
    const { data: msgs } = await sb.from('whatsapp_messages')
      .select('id, direction, sender_type, body, created_at')
      .eq('conversation_id', c.id)
      .order('created_at', { ascending: true });
    console.log(`\nConv ${c.id} (${c.contact_phone}) — ${msgs?.length || 0} messages:`);
    msgs?.forEach(m => console.log(`  [${m.direction}][${m.sender_type}] ${m.body?.substring(0, 60)} @ ${m.created_at}`));
  }
}

diagnose().catch(console.error);
