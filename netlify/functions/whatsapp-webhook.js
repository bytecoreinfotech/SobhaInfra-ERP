/**
 * WhatsApp Cloud API Webhook Handler — Netlify Function
 * Conforms to Techma Master Spec v4.0 (Sections 11, 12, 27, 50A, 50B)
 *
 * Capabilities:
 *  1. GET  — Meta verification handshake
 *  2. POST — Idempotent webhook event processor with:
 *     - Duplicate suppression via integration_events (provider_event_id / wamid)
 *     - Automated Opt-Out / Consent tracking ("STOP" / "UNSUBSCRIBE")
 *     - Conversation Mode enforcement ('AI ACTIVE' vs 'HUMAN ACTIVE' vs 'AI PAUSED')
 *     - Outbound message logging into whatsapp_messages and CRM activity feed
 */

const { createClient } = require('@supabase/supabase-js');

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'erppro_webhook_2026';
const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const PHONE_ID     = process.env.WHATSAPP_PHONE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

// ─── Helper: Send Outbound WhatsApp message ──────────────────────────────────
async function sendWhatsAppMessage(to, text) {
  if (!WA_TOKEN || !PHONE_ID) {
    console.warn('[WA Webhook] Meta WhatsApp credentials missing in env. Simulating outbound send.');
    return { messages: [{ id: 'mock-wamid-' + Date.now() }] };
  }
  const cleanPhone = to.replace(/[^\d+]/g, '').replace(/^\+/, '');
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
  return await res.json();
}

// ─── Helper: Match message against DB knowledge rules ─────────────────────────
async function getAutoReply(supabase, messageText) {
  try {
    const { data: rules } = await supabase
      .from('ai_knowledge')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    const lower = (messageText || '').toLowerCase();
    for (const rule of (rules || [])) {
      if (rule.title && lower.includes(rule.title.toLowerCase())) {
        return rule.content;
      }
    }
  } catch (e) {
    console.error('[WA Webhook] Supabase knowledge error:', e.message);
  }
  return '😊 Thanks for reaching out! Our sales team will get back to you shortly.\n\nFor immediate assistance, call us at +91 98765 43210.';
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  // ── 1. GET: Meta webhook verification handshake ────────────────────────────
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    if (params['hub.mode'] === 'subscribe' && params['hub.verify_token'] === VERIFY_TOKEN) {
      console.log('✅ Meta WhatsApp Webhook verified successfully');
      return { statusCode: 200, body: params['hub.challenge'] };
    }
    return { statusCode: 403, body: 'Forbidden: verify token mismatch' };
  }

  // ── 2. POST: Incoming message / status update ──────────────────────────────
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // Ignore delivery receipts / read receipts for auto-replies
      if (!value?.messages || value.messages.length === 0) {
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'ignored_status_update' }) };
      }

      const msg = value.messages[0];
      const providerEventId = msg.id; // Meta wamid
      const fromPhone = msg.from;     // Sender phone
      const contactName = value.contacts?.[0]?.profile?.name || fromPhone;
      const messageText = msg.text?.body || '';

      console.log(`📩 Incoming WA message [${providerEventId}] from ${contactName} (${fromPhone}): "${messageText}"`);

      // Initialize Supabase client if configured
      let supabase = null;
      if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('placeholder')) {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      }

      // ── A. IDEMPOTENCY CHECK (Section 27) ──────────────────────────────────
      if (supabase) {
        const { data: existingEvent } = await supabase
          .from('integration_events')
          .select('id, processed')
          .eq('provider', 'whatsapp')
          .eq('provider_event_id', providerEventId)
          .maybeSingle();

        if (existingEvent && existingEvent.processed) {
          console.log(`⚠️ Duplicate event suppressed: ${providerEventId}`);
          return { statusCode: 200, headers, body: JSON.stringify({ status: 'duplicate_suppressed' }) };
        }

        // Store event into integration_events table
        await supabase.from('integration_events').upsert([{
          organization_id: DEFAULT_ORG_ID,
          provider: 'whatsapp',
          provider_event_id: providerEventId,
          event_type: 'incoming_message',
          payload: body,
          processed: true,
        }], { onConflict: 'provider,provider_event_id' });
      }

      // ── B. CONSENT / OPT-OUT DETECTION (Section 50B) ───────────────────────
      const upperMsg = messageText.trim().toUpperCase();
      const isOptOut = ['STOP', 'UNSUBSCRIBE', 'OPT OUT', 'CANCEL'].includes(upperMsg);

      if (supabase && isOptOut) {
        await supabase.from('leads').update({
          marketing_opt_out: true,
          marketing_opt_out_at: new Date().toISOString(),
          opt_out_reason: 'Requested via WhatsApp (' + upperMsg + ')',
        }).eq('phone', fromPhone);

        const optOutReply = 'You have been successfully unsubscribed from marketing messages. Reply START to re-subscribe.';
        await sendWhatsAppMessage(fromPhone, optOutReply);
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'opt_out_processed' }) };
      }

      // ── C. UPSERT LEAD & CONVERSATION ─────────────────────────────────────
      let conversationMode = 'AI ACTIVE';
      let leadId = null;
      let conversationId = null;

      if (supabase) {
        // Find or create lead
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('phone', fromPhone)
          .maybeSingle();

        if (existingLead) {
          leadId = existingLead.id;
        } else {
          const { data: newLead } = await supabase.from('leads').insert([{
            organization_id: DEFAULT_ORG_ID,
            name: contactName,
            phone: fromPhone,
            source: 'WhatsApp',
            status: 'New',
            notes: 'Auto-created by incoming WhatsApp webhook',
          }]).select('id').single();
          if (newLead) leadId = newLead.id;
        }

        // Find or create WhatsApp conversation session
        const { data: conv } = await supabase
          .from('whatsapp_conversations')
          .select('id, conversation_mode, unread_count')
          .eq('contact_phone', fromPhone)
          .maybeSingle();

        if (conv) {
          conversationId = conv.id;
          conversationMode = conv.conversation_mode || 'AI ACTIVE';
          await supabase.from('whatsapp_conversations').update({
            last_message_text: messageText,
            last_message_at: new Date().toISOString(),
            unread_count: (conv.unread_count || 0) + 1,
          }).eq('id', conv.id);
        } else {
          const { data: newConv } = await supabase.from('whatsapp_conversations').insert([{
            organization_id: DEFAULT_ORG_ID,
            lead_id: leadId,
            contact_phone: fromPhone,
            contact_name: contactName,
            conversation_mode: 'AI ACTIVE',
            last_message_text: messageText,
            last_message_at: new Date().toISOString(),
            unread_count: 1,
          }]).select('id').single();
          if (newConv) conversationId = newConv.id;
        }

        // Log inbound message (now with conversation_id linked)
        await supabase.from('whatsapp_messages').insert([{
          organization_id: DEFAULT_ORG_ID,
          conversation_id: conversationId,
          provider_message_id: providerEventId,
          direction: 'inbound',
          sender_type: 'customer',
          body: messageText,
          status: 'delivered',
          raw_payload: msg,
        }]);

        // Log to activity feed
        await supabase.from('activities').insert([{
          organization_id: DEFAULT_ORG_ID,
          lead_id: leadId,
          activity_type: 'whatsapp',
          title: `WhatsApp message from ${contactName}`,
          content: messageText,
        }]);
      }

      // ── D. CONVERSATION MODE CHECK (Section 12) ────────────────────────────
      // If a human salesperson has taken over or AI is paused, suppress automated reply!
      if (conversationMode === 'HUMAN ACTIVE' || conversationMode === 'AI PAUSED' || conversationMode === 'CLOSED') {
        console.log(`⏸️ Auto-reply suppressed because conversation mode is "${conversationMode}"`);
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'human_mode_active' }) };
      }

      // ── E. AI / KNOWLEDGE AUTO-REPLY ──────────────────────────────────────
      const reply = supabase ? await getAutoReply(supabase, messageText) : '😊 Thanks for reaching out! Our sales team will get back to you shortly.';
      const sendResult = await sendWhatsAppMessage(fromPhone, reply);

      if (supabase) {
        await supabase.from('whatsapp_messages').insert([{
          organization_id: DEFAULT_ORG_ID,
          conversation_id: conversationId,
          direction: 'outbound',
          sender_type: 'ai',
          body: reply,
          status: 'sent',
          provider_message_id: sendResult.messages?.[0]?.id,
        }]);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'replied', messageId: sendResult.messages?.[0]?.id }),
      };
    } catch (err) {
      console.error('[WA Webhook] Exception:', err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers, body: 'Method Not Allowed' };
};
