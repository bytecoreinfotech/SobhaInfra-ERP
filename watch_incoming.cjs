/**
 * Live watcher - polls DB every 5 seconds for 3 minutes
 * Run this while sending a WhatsApp message from your phone
 */
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://jbgkeeubevwopphekwfj.supabase.co', 'sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB');

let knownCount = 0;
let checks = 0;
const MAX_CHECKS = 36; // 3 minutes

async function poll() {
  const { data: msgs } = await sb.from('whatsapp_messages')
    .select('direction, body, created_at')
    .eq('conversation_id', '918a5194-3f6f-49fc-953a-30958908886c')
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(5);

  const count = msgs?.length || 0;
  
  if (knownCount === 0) {
    knownCount = count;
    console.log(`🔍 Watching for new inbound messages... (current: ${count})`);
    console.log('   Send a WhatsApp message from your phone NOW!\n');
  } else if (count > knownCount) {
    const newMsg = msgs[0];
    console.log(`\n✅ NEW INBOUND MESSAGE RECEIVED!`);
    console.log(`   Body: "${newMsg.body}"`);
    console.log(`   Time: ${new Date(newMsg.created_at).toLocaleTimeString()}`);
    console.log(`\n🎉 WhatsApp inbound is WORKING!`);
    process.exit(0);
  } else {
    process.stdout.write('.');
    checks++;
    if (checks >= MAX_CHECKS) {
      console.log('\n⏱ Timeout - no new messages in 3 minutes');
      console.log('Check Meta Developer Portal webhook subscription (messages field)');
      process.exit(0);
    }
  }
}

poll();
const interval = setInterval(poll, 5000);
