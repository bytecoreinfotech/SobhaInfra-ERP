/**
 * Outbound WhatsApp Message Dispatcher — Netlify Function
 * URL: POST /.netlify/functions/send-message
 *
 * Dispatches live outbound message to customer WhatsApp via Meta Cloud API v20.0
 * and records it into Supabase / CRM activity feed.
 */

const { createClient } = require('@supabase/supabase-js');

const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const PHONE_ID     = process.env.WHATSAPP_PHONE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

async function sendMetaWhatsApp(to, text) {
  if (!WA_TOKEN || !PHONE_ID) {
    return { success: true, messageId: 'mock-wamid-' + Date.now() };
  }
  const cleanPhone = String(to).replace(/[^\d+]/g, '').replace(/^\+/, '');
  const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: { body: text },
    }),
  });

  const data = await res.json();
  if (data.error) {
    console.error('[Send Message] Meta API Error:', JSON.stringify(data.error));
    return { success: false, error: data.error };
  }
  return { success: true, messageId: data.messages?.[0]?.id };
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  try {
    const { to, text, conversationId, senderType = 'human_agent' } = JSON.parse(event.body || '{}');

    if (!to || !text) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Both "to" and "text" are required' }) };
    }

    const sendRes = await sendMetaWhatsApp(to, text);

    let supabase = null;
    let effectiveConvId = conversationId;

    if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('placeholder')) {
      try {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const cleanPhone = String(to).replace(/[^\d+]/g, '');
        const digitsOnly = cleanPhone.replace(/[^\d]/g, '');

        // If no conversationId passed, find or create one in Supabase
        if (!effectiveConvId) {
          const { data: existingConv } = await supabase.from('whatsapp_conversations')
            .select('id')
            .or(`contact_phone.eq.${cleanPhone},contact_phone.eq.${digitsOnly},contact_phone.eq.+${digitsOnly}`)
            .maybeSingle();

          if (existingConv) {
            effectiveConvId = existingConv.id;
          } else {
            // Check if matching lead exists
            const { data: leadMatch } = await supabase.from('leads')
              .select('id, name')
              .or(`phone.eq.${cleanPhone},phone.eq.${digitsOnly},phone.eq.+${digitsOnly}`)
              .maybeSingle();

            const newConvPayload = {
              organization_id: DEFAULT_ORG_ID,
              lead_id: leadMatch?.id || null,
              contact_name: leadMatch?.name || 'Customer',
              contact_phone: cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone,
              conversation_mode: 'HUMAN ACTIVE',
              last_message_text: text,
              last_message_at: new Date().toISOString(),
              unread_count: 0,
            };

            let { data: newConv, error: convErr } = await supabase.from('whatsapp_conversations').insert([newConvPayload]).select('id').maybeSingle();
            if (convErr && convErr.message && convErr.message.includes('organization_id')) {
              delete newConvPayload.organization_id;
              const fallbackConv = await supabase.from('whatsapp_conversations').insert([newConvPayload]).select('id').maybeSingle();
              newConv = fallbackConv.data;
            }
            effectiveConvId = newConv?.id;
          }
        }

        if (effectiveConvId) {
          const msgPayload = {
            organization_id: DEFAULT_ORG_ID,
            conversation_id: effectiveConvId,
            direction: 'outbound',
            sender_type: senderType,
            body: text,
            status: sendRes.success ? 'delivered' : 'failed',
            provider_message_id: sendRes.messageId || null,
          };

          let { error: msgErr } = await supabase.from('whatsapp_messages').insert([msgPayload]);
          if (msgErr && msgErr.message && msgErr.message.includes('organization_id')) {
            delete msgPayload.organization_id;
            await supabase.from('whatsapp_messages').insert([msgPayload]);
          }

          // Preserve conversation mode based on sender type
          const newMode = senderType === 'ai' ? 'AI ACTIVE' : 'HUMAN ACTIVE';
          await supabase.from('whatsapp_conversations').update({
            last_message_text: text,
            last_message_at: new Date().toISOString(),
            conversation_mode: newMode,
            unread_count: 0,
          }).eq('id', effectiveConvId);
        }
      } catch (dbErr) {
        console.warn('[Send Message] DB logging warning:', dbErr.message);
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: sendRes.success,
        messageId: sendRes.messageId,
        error: sendRes.error,
      }),
    };
  } catch (err) {
    console.error('[Send Message] Fatal error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
