const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://jbgkeeubevwopphekwfj.supabase.co', 'sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB');

async function checkWebhookLogs() {
  // Check integration_events for any webhook receipts
  const { data: events, error } = await sb.from('integration_events')
    .select('id, provider, event_type, provider_event_id, processed, created_at, payload')
    .eq('provider', 'whatsapp')
    .order('created_at', { ascending: false })
    .limit(10);
  
  console.log('=== WEBHOOK EVENT LOG (last 10) ===');
  console.log('Error:', JSON.stringify(error));
  console.log('Count:', events?.length);
  events?.forEach(e => {
    console.log(`\n  [${e.created_at}] type=${e.event_type} wamid=${e.provider_event_id} processed=${e.processed}`);
    if (e.payload) {
      const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
      const entry = p?.entry?.[0]?.changes?.[0]?.value;
      if (entry?.messages) console.log('    Message from:', entry.messages[0]?.from, '| text:', entry.messages[0]?.text?.body);
    }
  });
}

checkWebhookLogs().catch(console.error);
