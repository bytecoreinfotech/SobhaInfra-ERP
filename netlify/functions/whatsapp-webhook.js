/**
 * WhatsApp Webhook Handler — Netlify Function
 * URL: https://ermpro.netlify.app/.netlify/functions/whatsapp-webhook
 *
 * Two jobs:
 *  GET  — Meta verification handshake (called once when you register the webhook)
 *  POST — Receives every incoming WhatsApp message and auto-replies via chatbot rules
 */

const { createClient } = require('@supabase/supabase-js');

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'erppro_webhook_2026';
const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const PHONE_ID     = process.env.WHATSAPP_PHONE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// ─── Helper: Send a WhatsApp text message ─────────────────────────────────────
async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  const data = await res.json();
  return data;
}

// ─── Helper: Match message against DB rules ────────────────────────────────────
async function getAutoReply(messageText) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: rules } = await supabase
      .from('chatbot_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    const lower = messageText.toLowerCase();
    for (const rule of (rules || [])) {
      if (rule.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
        return rule.response;
      }
    }
  } catch (e) {
    console.error('Supabase error:', e.message);
  }
  return '😊 Thanks for reaching out! Our team will get back to you shortly.\n\nFor immediate help, call: +91 98765 43210\n\nBusiness hours: Mon–Sat, 10AM–7PM';
}

// ─── Helper: Save incoming lead to CRM ────────────────────────────────────────
async function upsertLead(phone, name) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (!existing) {
      await supabase.from('leads').insert([{
        name: name || phone,
        phone,
        source: 'WhatsApp',
        status: 'New',
        notes: 'Auto-created by WhatsApp bot',
      }]);
    }

    // Log the message
    await supabase.from('activity_feed').insert([{
      type: 'lead',
      title: `WhatsApp message received from ${name || phone}`,
      subtitle: 'Auto-logged by webhook',
      icon_color: '#25d366',
    }]);
  } catch (e) {
    console.error('Lead upsert error:', e.message);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  // ── GET: Meta webhook verification ──────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    if (params['hub.mode'] === 'subscribe' && params['hub.verify_token'] === VERIFY_TOKEN) {
      console.log('✅ Webhook verified by Meta');
      return { statusCode: 200, body: params['hub.challenge'] };
    }
    return { statusCode: 403, body: 'Forbidden: verify token mismatch' };
  }

  // ── POST: Incoming message ───────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // Ignore status updates (delivered, read receipts)
      if (!value?.messages) {
        return { statusCode: 200, headers, body: 'OK' };
      }

      const msg = value.messages[0];
      const from = msg.from; // sender's phone number
      const contactName = value.contacts?.[0]?.profile?.name || from;
      const messageText = msg.text?.body || '';

      console.log(`📩 Message from ${contactName} (${from}): "${messageText}"`);

      // 1. Save lead to CRM if new
      await upsertLead(from, contactName);

      // 2. Get auto-reply from chatbot rules
      const reply = await getAutoReply(messageText);

      // 3. Send the reply via WhatsApp API
      const result = await sendWhatsAppMessage(from, reply);
      console.log('📤 Reply sent:', JSON.stringify(result));

      return { statusCode: 200, headers, body: JSON.stringify({ status: 'replied', messageId: result.messages?.[0]?.id }) };
    } catch (err) {
      console.error('Webhook error:', err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, body: 'Method not allowed' };
};
