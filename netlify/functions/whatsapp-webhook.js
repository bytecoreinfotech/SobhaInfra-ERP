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
 *     - Multi-Model AI Sales Engine (Gemini / OpenAI / Deterministic Bounded Engine)
 *     - Outbound WhatsApp message dispatch
 *     - Resilient DB Logging (Gracefully handles non-migrated Supabase state)
 */

const { createClient } = require('@supabase/supabase-js');

const VERIFY_TOKEN    = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'erppro_wa_sec_9f8b2c4e1a7d6e5c8302';
const WA_TOKEN        = process.env.WHATSAPP_TOKEN;
const PHONE_ID        = process.env.WHATSAPP_PHONE_ID;
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_KEY    = process.env.SUPABASE_ANON_KEY;
const GEMINI_API_KEY  = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY  = process.env.OPENAI_API_KEY;
const DEFAULT_ORG_ID  = '00000000-0000-0000-0000-000000000001';

// ─── 1. Outbound WhatsApp Message Dispatcher ─────────────────────────────────
async function sendWhatsAppMessage(to, text) {
  if (!WA_TOKEN || !PHONE_ID) {
    console.warn('[WA Webhook] Meta WhatsApp credentials missing in env. Simulating outbound send.');
    return { success: true, messages: [{ id: 'mock-wamid-' + Date.now() }] };
  }
  try {
    const cleanPhone = String(to).replace(/[^\d+]/g, '').replace(/^\+/, '');
    const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;
    console.log(`📤 Sending WA to ${cleanPhone} via PhoneID ${PHONE_ID}...`);

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
      console.error('[WA Webhook] Meta API Error:', JSON.stringify(data.error));
      return { success: false, error: data.error };
    }
    console.log(`✅ WhatsApp message delivered to Meta! Message ID: ${data.messages?.[0]?.id}`);
    return { success: true, messages: data.messages };
  } catch (err) {
    console.error('[WA Webhook] Outbound fetch error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── 2. Multi-Model AI Sales Intelligence Engine ──────────────────────────────
const SYSTEM_SALES_PROMPT = `
You are the AI Sales Assistant for ERPPro Real Estate (Techma Suite).
You represent luxury properties in Mumbai:
- 3BHK Luxury Residence (Andheri West) — Approved Rate: ₹95 Lakhs (1,450 sq.ft, skyline view)
- 2BHK Prime Apartment (Borivali East) — Approved Rate: ₹62 Lakhs (950 sq.ft, near Metro)
- Weekend Hillside Villa (Lonavala) — Approved Rate: ₹2.10 Crores (Private pool, 4,200 sq.ft)

Guidelines:
1. Always be polite, professional, and helpful. Use friendly emojis.
2. If customer asks about price/rate, quote the official approved rate.
3. If customer asks for discount, negotiation, or human agent ("kam hoga?", "any offer?", "talk to agent"): Politely inform them you have connected them with Senior Sales Executive Rajesh Kumar (+91 98765 43210) who will assist with customized payment terms.
4. Keep responses concise (under 3 sentences) and suitable for WhatsApp messages.
`;

async function generateAIResponse(messageText, contactName = 'Customer') {
  const text = (messageText || '').trim();
  const lower = text.toLowerCase();

  // A. Try Google Gemini API
  if (GEMINI_API_KEY && !GEMINI_API_KEY.includes('placeholder')) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const gRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${SYSTEM_SALES_PROMPT}\n\nCustomer (${contactName}) asks: "${text}"\n\nProvide direct WhatsApp reply:` }]
            }
          ],
          generationConfig: { maxOutputTokens: 250, temperature: 0.2 }
        })
      });

      const gData = await gRes.json();
      const aiReply = gData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (aiReply && aiReply.trim()) {
        console.log(`🤖 Gemini AI generated response successfully.`);
        return aiReply.trim();
      }
    } catch (e) {
      console.warn('[WA Webhook] Gemini API call failed, falling back:', e.message);
    }
  }

  // B. Try OpenAI GPT-4o API
  if (OPENAI_API_KEY && !OPENAI_API_KEY.includes('placeholder')) {
    try {
      const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_SALES_PROMPT },
            { role: 'user', content: text },
          ],
          max_tokens: 200,
          temperature: 0.2,
        }),
      });

      const oaiData = await oaiRes.json();
      const aiReply = oaiData.choices?.[0]?.message?.content;
      if (aiReply && aiReply.trim()) {
        console.log(`🤖 OpenAI GPT-4o generated response successfully.`);
        return aiReply.trim();
      }
    } catch (e) {
      console.warn('[WA Webhook] OpenAI call failed, falling back:', e.message);
    }
  }

  // C. Deterministic Bounded Sales Engine Fallback (Guaranteed 100% Uptime)
  if (lower.includes('rate') || lower.includes('price') || lower.includes('cost') || lower.includes('kitna') || lower.includes('how much')) {
    if (lower.includes('kam') || lower.includes('discount') || lower.includes('offer') || lower.includes('negotiat')) {
      return `Hello ${contactName}! 🏠 Our official approved rate for 3BHK Andheri is ₹95 Lakhs. For customized down-payment discounts and festive concessions, I have connected you with our Senior Sales Executive Rajesh Kumar (+91 98765 43210) who will assist you shortly!`;
    }
    if (lower.includes('2bhk') || lower.includes('borivali')) {
      return `Hello ${contactName}! 🏢 Our approved rate for 2BHK Prime Apartment in Borivali East is ₹62 Lakhs (950 sq.ft, 2 mins from Metro). Would you like to schedule a site visit this weekend?`;
    }
    if (lower.includes('villa') || lower.includes('lonavala')) {
      return `Hello ${contactName}! 🌴 Our luxury Hillside Villa in Lonavala is priced at ₹2.10 Crores (Private pool, 4,200 sq.ft). Would you like the official floor plan & brochure?`;
    }
    return `Hello ${contactName}! 🏠 Our approved starting prices are:\n• 2BHK Borivali: ₹62 Lakhs\n• 3BHK Andheri West: ₹95 Lakhs\n• Weekend Villa Lonavala: ₹2.10 Cr\n\nWhich property would you like to explore?`;
  }

  if (lower.includes('brochure') || lower.includes('floor plan') || lower.includes('pdf') || lower.includes('details')) {
    return `Hello ${contactName}! 📄 Here is our official project brochure & floor plan: https://erppro-crm-automation.netlify.app/brochure-3bhk.pdf\n\nWould you like me to reserve a site visit slot for you?`;
  }

  if (lower.includes('visit') || lower.includes('location') || lower.includes('kahan') || lower.includes('address') || lower.includes('time')) {
    return `Hello ${contactName}! 📍 Site visits are open Monday to Sunday (10:00 AM – 6:00 PM). Complimentary pick-and-drop service is available from the nearest station. What time works best for you?`;
  }

  return `Hello ${contactName}! 👋 Welcome to ERPPro Real Estate. I am your AI Sales Assistant. I can assist you with approved pricing, project brochures, sample flat videos, and scheduling site visits. Which property are you interested in today?`;
}

// ─── 3. Main Webhook Handler ──────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  // ── A. GET: Meta webhook verification handshake ────────────────────────────
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    console.log('[WA Webhook] Received verification handshake GET request:', params);
    if (params['hub.mode'] === 'subscribe' && (params['hub.verify_token'] === VERIFY_TOKEN || params['hub.verify_token'] === 'erppro_wa_sec_9f8b2c4e1a7d6e5c8302')) {
      console.log('✅ Meta WhatsApp Webhook verified successfully');
      return { statusCode: 200, body: params['hub.challenge'] };
    }
    return { statusCode: 403, body: 'Forbidden: verify token mismatch' };
  }

  // ── B. POST: Incoming message / status update ──────────────────────────────
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
      const contactName = value.contacts?.[0]?.profile?.name || 'Customer';
      const messageText = msg.text?.body || '';

      console.log(`📩 Incoming WA message [${providerEventId}] from ${contactName} (${fromPhone}): "${messageText}"`);

      // Initialize Supabase client if configured
      let supabase = null;
      if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('placeholder')) {
        try {
          supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        } catch (e) {
          console.warn('[WA Webhook] Supabase client init warning:', e.message);
        }
      }

      // Check for opt-out keywords (Section 50B)
      const upperMsg = messageText.trim().toUpperCase();
      const isOptOut = ['STOP', 'UNSUBSCRIBE', 'OPT OUT', 'CANCEL'].includes(upperMsg);

      if (isOptOut) {
        const optOutReply = 'You have been successfully unsubscribed from marketing messages. Reply START to re-subscribe.';
        await sendWhatsAppMessage(fromPhone, optOutReply);
        if (supabase) {
          try {
            await supabase.from('leads').update({ marketing_opt_out: true, marketing_opt_out_at: new Date().toISOString() }).eq('phone', fromPhone);
          } catch {}
        }
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'opt_out_processed' }) };
      }

      // Resilient DB logging (survives non-migrated Supabase database)
      let conversationMode = 'AI ACTIVE';
      let leadId = null;
      let conversationId = null;

      if (supabase) {
        try {
          // Idempotency check
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

          // Record event
          await supabase.from('integration_events').upsert([{
            organization_id: DEFAULT_ORG_ID,
            provider: 'whatsapp',
            provider_event_id: providerEventId,
            event_type: 'incoming_message',
            payload: body,
            processed: true,
          }], { onConflict: 'provider,provider_event_id' });

          // Lead lookup or creation
          const { data: existingLead } = await supabase.from('leads').select('id').eq('phone', fromPhone).maybeSingle();
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

          // Conversation session lookup
          const { data: conv } = await supabase.from('whatsapp_conversations').select('id, conversation_mode, unread_count').eq('contact_phone', fromPhone).maybeSingle();
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

          // Log inbound message
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
        } catch (dbErr) {
          console.warn('[WA Webhook] DB operation non-fatal warning:', dbErr.message);
        }
      }

      // Check if Human Takeover is active
      if (conversationMode === 'HUMAN ACTIVE' || conversationMode === 'AI PAUSED' || conversationMode === 'CLOSED') {
        console.log(`⏸️ Auto-reply suppressed because conversation mode is "${conversationMode}"`);
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'human_mode_active' }) };
      }

      // Generate AI Auto-Reply
      const aiReply = await generateAIResponse(messageText, contactName);
      console.log(`💬 Generated AI response: "${aiReply}"`);

      // Dispatch to WhatsApp
      const sendResult = await sendWhatsAppMessage(fromPhone, aiReply);

      // Log outbound message if Supabase is reachable
      if (supabase && sendResult.success) {
        try {
          await supabase.from('whatsapp_messages').insert([{
            organization_id: DEFAULT_ORG_ID,
            conversation_id: conversationId,
            direction: 'outbound',
            sender_type: 'ai',
            body: aiReply,
            status: 'sent',
            provider_message_id: sendResult.messages?.[0]?.id,
          }]);
        } catch {}
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'replied',
          aiReply,
          metaResult: sendResult,
        }),
      };
    } catch (err) {
      console.error('[WA Webhook] Fatal Exception:', err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers, body: 'Method Not Allowed' };
};
