const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://jbgkeeubevwopphekwfj.supabase.co', 'sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB');

async function checkSchema() {
  // Try inserting with ALL fields to see which one causes the error
  const convId = '918a5194-3f6f-49fc-953a-30958908886c';
  
  console.log('--- Test 1: minimal insert ---');
  const r1 = await sb.from('whatsapp_messages').insert([{
    conversation_id: convId,
    direction: 'inbound',
    sender_type: 'customer',
    body: 'Schema test minimal',
    status: 'delivered'
  }]).select('id').maybeSingle();
  console.log('Result:', JSON.stringify(r1.data), 'Error:', JSON.stringify(r1.error));

  console.log('\n--- Test 2: with provider_message_id ---');
  const r2 = await sb.from('whatsapp_messages').insert([{
    conversation_id: convId,
    provider_message_id: 'test-wamid-' + Date.now(),
    direction: 'inbound',
    sender_type: 'customer',
    body: 'Schema test with wamid',
    status: 'delivered'
  }]).select('id').maybeSingle();
  console.log('Result:', JSON.stringify(r2.data), 'Error:', JSON.stringify(r2.error));

  console.log('\n--- Test 3: with message_type ---');
  const r3 = await sb.from('whatsapp_messages').insert([{
    conversation_id: convId,
    direction: 'inbound',
    sender_type: 'customer',
    message_type: 'text',
    body: 'Schema test with message_type',
    status: 'delivered'
  }]).select('id').maybeSingle();
  console.log('Result:', JSON.stringify(r3.data), 'Error:', JSON.stringify(r3.error));

  console.log('\n--- Test 4: with raw_payload (JSON) ---');
  const r4 = await sb.from('whatsapp_messages').insert([{
    conversation_id: convId,
    direction: 'inbound',
    sender_type: 'customer',
    body: 'Schema test with raw_payload',
    status: 'delivered',
    raw_payload: { type: 'text', text: { body: 'hello' } }
  }]).select('id').maybeSingle();
  console.log('Result:', JSON.stringify(r4.data), 'Error:', JSON.stringify(r4.error));

  console.log('\n--- Test 5: full payload as webhook sends ---');
  const r5 = await sb.from('whatsapp_messages').insert([{
    conversation_id: convId,
    provider_message_id: 'wamid.full_test_' + Date.now(),
    direction: 'inbound',
    sender_type: 'customer',
    message_type: 'text',
    body: 'Schema test full payload',
    status: 'delivered',
    raw_payload: { from: '918092897590', type: 'text', text: { body: 'hello' } }
  }]).select('id').maybeSingle();
  console.log('Result:', JSON.stringify(r5.data), 'Error:', JSON.stringify(r5.error));

  console.log('\n--- Final count ---');
  const { data: msgs } = await sb.from('whatsapp_messages').select('id, body').eq('conversation_id', convId).order('created_at', { ascending: false }).limit(3);
  console.log('Last 3 messages:', JSON.stringify(msgs));
}

checkSchema().catch(console.error);
