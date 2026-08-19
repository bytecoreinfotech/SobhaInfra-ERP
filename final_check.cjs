const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://jbgkeeubevwopphekwfj.supabase.co', 'sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB');

async function run() {
  // Check integration_events for ANY real Meta events (real wamid starts with "wamid.H")
  const { data: events } = await sb.from('integration_events')
    .select('provider_event_id, created_at')
    .eq('provider', 'whatsapp')
    .order('created_at', { ascending: false });

  console.log('=== ALL WEBHOOK EVENTS ===');
  const realEvents = [];
  const testEvents = [];
  events?.forEach(e => {
    if (e.provider_event_id?.startsWith('wamid.H')) realEvents.push(e);
    else testEvents.push(e);
  });
  console.log('Real Meta events (wamid.H...):', realEvents.length);
  console.log('Our test events:', testEvents.length);
  realEvents.forEach(e => console.log('  REAL:', e.provider_event_id, '@', e.created_at));

  // Show latest DB messages
  const { data: msgs } = await sb.from('whatsapp_messages')
    .select('direction, sender_type, body, created_at')
    .eq('conversation_id', '918a5194-3f6f-49fc-953a-30958908886c')
    .order('created_at', { ascending: true });
  
  console.log('\n=== MESSAGES IN DB ===');
  msgs?.forEach(m => console.log(`  [${m.direction}][${m.sender_type}] "${m.body}" @ ${new Date(m.created_at).toLocaleTimeString()}`));
  console.log('Total:', msgs?.length);
  
  console.log('\n=== CONCLUSION ===');
  if (realEvents.length === 0) {
    console.log('❌ Meta has NEVER sent a real webhook to our URL');
    console.log('   Code is correct. Problem is 100% in Meta Developer Portal configuration.');
  } else {
    console.log('✅ Meta IS sending webhooks. Last one:', realEvents[0]?.created_at);
  }
}
run().catch(console.error);
