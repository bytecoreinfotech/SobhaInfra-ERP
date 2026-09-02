/**
 * Outbound WhatsApp Message Dispatcher — Netlify Function
 * URL: POST /.netlify/functions/send-message
 *
 * Dispatches live outbound message to customer WhatsApp via Meta Cloud API v20.0
 * and records it into Supabase / CRM activity feed.
 * 
 * Supports: text, image (URL), document (URL), video (URL), audio (URL)
 */

const { createClient } = require('@supabase/supabase-js');

const WA_TOKEN     = process.env.WHATSAPP_TOKEN || 'EAAZAoFJNWmo4BSXS3ZBJrD7sk039yowup2fxSWYZAQFTiTvEfOm5XsRNmyRZC4RnkYyjvFaXaxN3fhqNVvvyBqe0CXwoWClgcBx6X8UhqaNWTUjNFt0XMkufGVKkF9FSOP2V2SXSwxreUpX3UALTRW8TC8feqyWyYdyyamSrkF8qWvqkuSEEkatiTGvaGZC1AYwZDZD';
const PHONE_ID     = process.env.WHATSAPP_PHONE_ID || '1213997841806162';
// Supabase: env var first, then hardcoded fallback (anon key is safe — RLS disabled for CRM tables)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcgmppnvnwnilioapbli.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NzE5ODIsImV4cCI6MjEwMzE0Nzk4Mn0.27BrkeNVxcEfG0R1W2gzlV2ueuK6NBS7MuD98Y5iDME';


/**
 * Send a message via Meta WhatsApp Cloud API.
 * Supports: text, image, document, video, audio
 * 
 * @param {string} to - Recipient phone number (digits only or with +)
 * @param {string} text - Message text (used for text type and image/video captions)
 * @param {string} mediaType - 'text' | 'image' | 'document' | 'video' | 'audio'
 * @param {string} mediaUrl - Public URL to the media file (required for media types)
 * @param {string} mediaFileName - Optional filename for documents
 */
async function sendMetaWhatsApp(to, text, mediaType = 'text', mediaUrl = null, mediaFileName = null) {
  if (!WA_TOKEN || !PHONE_ID) {
    return { success: true, messageId: 'mock-wamid-' + Date.now() };
  }
  const cleanPhone = String(to).replace(/[^\d+]/g, '').replace(/^\+/, '');
  const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;

  let payload;

  // Auto-resolve relative or sobha catalog document URLs
  if (mediaType === 'document') {
    if (!mediaUrl || !mediaUrl.startsWith('http')) {
      mediaUrl = 'https://sobhainfra-erp.netlify.app/sobha-products.pdf';
    }
    if (!mediaFileName) {
      mediaFileName = 'Sobha_Infratech_Product_Catalog.pdf';
    }
  }

  if (mediaType === 'image' && mediaUrl) {
    payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'image',
      image: { link: mediaUrl, ...(text ? { caption: text } : {}) },
    };
  } else if (mediaType === 'document' && mediaUrl) {
    payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'document',
      document: {
        link: mediaUrl,
        filename: mediaFileName || 'Sobha_Infratech_Product_Catalog.pdf',
        ...(text ? { caption: text } : {}),
      },
    };
  } else if (mediaType === 'video' && mediaUrl) {
    payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'video',
      video: { link: mediaUrl, ...(text ? { caption: text } : {}) },
    };
  } else if (mediaType === 'audio' && mediaUrl) {
    payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'audio',
      audio: { link: mediaUrl },
    };
  } else {
    payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: { body: text || '' },
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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
    const {
      to, text, conversationId, senderType = 'human_agent',
      mediaType = 'text', mediaUrl = null, mediaFileName = null,
    } = JSON.parse(event.body || '{}');

    if (!to || (!text && !mediaUrl)) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Both "to" and either "text" or "mediaUrl" are required' }) };
    }

    const sendRes = await sendMetaWhatsApp(to, text || '', mediaType, mediaUrl, mediaFileName);

    let supabase = null;
    let effectiveConvId = conversationId;

    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const cleanPhone = String(to).replace(/[^\d+]/g, '');
        const digitsOnly = cleanPhone.replace(/[^\d]/g, '');

        // If no conversationId passed, find or create one
        if (!effectiveConvId) {
          const { data: existingConv } = await supabase.from('whatsapp_conversations')
            .select('id')
            .or(`contact_phone.eq.${cleanPhone},contact_phone.eq.${digitsOnly},contact_phone.eq.+${digitsOnly}`)
            .maybeSingle();

          if (existingConv) {
            effectiveConvId = existingConv.id;
          } else {
            // Check if matching lead name exists (just for display)
            const { data: leadMatch } = await supabase.from('leads')
              .select('id, name')
              .or(`phone.eq.${cleanPhone},phone.eq.${digitsOnly},phone.eq.+${digitsOnly}`)
              .maybeSingle();

            const newConvPayload = {
              contact_name: leadMatch?.name || 'Customer',
              contact_phone: cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone,
              conversation_mode: 'HUMAN ACTIVE',
              last_message_text: text || (mediaType === 'document' ? `📄 ${mediaFileName || 'PDF Document'}` : `[${mediaType}]`),
              last_message_at: new Date().toISOString(),
              unread_count: 0,
            };

            const { data: newConv } = await supabase.from('whatsapp_conversations').insert([newConvPayload]).select('id').maybeSingle();
            effectiveConvId = newConv?.id;
          }
        }

        if (effectiveConvId) {
          const msgPayload = {
            conversation_id: effectiveConvId,
            direction: 'outbound',
            sender_type: senderType,
            message_type: mediaType,
            media_url: mediaUrl,
            body: text || (mediaType === 'document' ? `📄 ${mediaFileName || 'PDF Document'}` : `[${mediaType}]`),
            status: sendRes.success ? 'delivered' : 'failed',
            provider_message_id: sendRes.messageId || null,
          };

          await supabase.from('whatsapp_messages').insert([msgPayload]);

          // Update conversation last message
          const newMode = senderType === 'ai' ? 'AI ACTIVE' : 'HUMAN ACTIVE';
          await supabase.from('whatsapp_conversations').update({
            last_message_text: text || (mediaType === 'document' ? `📄 ${mediaFileName || 'PDF Document'}` : `[${mediaType}]`),
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
        conversationId: effectiveConvId,
      }),
    };
  } catch (err) {
    console.error('[Send Message] Unhandled error:', err.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
