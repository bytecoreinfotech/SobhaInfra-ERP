/**
 * Outbound WhatsApp Message Dispatcher — Netlify Function
 * URL: POST /.netlify/functions/send-message
 *
 * Dispatches live outbound message to customer WhatsApp via Meta Cloud API v20.0
 * and records it into Supabase / CRM activity feed.
 * 
 * Supports: text, image (URL), document (URL), video (URL), audio (URL)
 * 
 * 24-HOUR WINDOW HANDLING:
 * If Meta rejects a free-form message because the recipient hasn't messaged
 * within the last 24 hours (error 131047), the system automatically retries
 * using a pre-approved Meta Message Template (hello_world or custom).
 */

const { createClient } = require('@supabase/supabase-js');

const WA_TOKEN     = process.env.WHATSAPP_TOKEN || 'EAAZAoFJNWmo4BSXS3ZBJrD7sk039yowup2fxSWYZAQFTiTvEfOm5XsRNmyRZC4RnkYyjvFaXaxN3fhqNVvvyBqe0CXwoWClgcBx6X8UhqaNWTUjNFt0XMkufGVKkF9FSOP2V2SXSwxreUpX3UALTRW8TC8feqyWyYdyyamSrkF8qWvqkuSEEkatiTGvaGZC1AYwZDZD';
const PHONE_ID     = process.env.WHATSAPP_PHONE_ID || '1213997841806162';
// Supabase: env var first, then hardcoded fallback (anon key is safe — RLS disabled for CRM tables)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcgmppnvnwnilioapbli.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NzE5ODIsImV4cCI6MjEwMzE0Nzk4Mn0.27BrkeNVxcEfG0R1W2gzlV2ueuK6NBS7MuD98Y5iDME';


// ─── Check if a Meta API error is a 24-hour session window rejection ──────────
function is24HourWindowError(error) {
  if (!error) return false;
  const errStr = typeof error === 'string' ? error : JSON.stringify(error);
  // Meta error codes for outside-session: 131047 (re-engagement), 131026 (not opted-in),
  // 130429 (rate limit / session), plus keyword fallbacks
  return /131047|131026|130429/i.test(errStr) ||
    /re.?engag/i.test(errStr) ||
    /24.?hour/i.test(errStr) ||
    /session|outside.*window|message.*window/i.test(errStr) ||
    /recipient.*not.*message/i.test(errStr);
}

// ─── Send Approved Meta Template Message (bypasses 24h window) ────────────────
async function sendWhatsAppTemplate(to, templateName, language = 'en', params = []) {
  if (!WA_TOKEN || !PHONE_ID) {
    return { success: true, messageId: 'mock-tpl-' + Date.now(), simulated: true, isTemplate: true, templateName };
  }
  try {
    const cleanPhone = String(to).replace(/[^\d]/g, '');
    const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;

    const components = [];
    if (params && params.length > 0) {
      components.push({
        type: 'body',
        parameters: params.map(p => ({ type: 'text', text: String(p) })),
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        ...(components.length > 0 ? { components } : {}),
      },
    };

    console.log(`[send-message] Sending template "${templateName}" to ${cleanPhone}`);
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
      console.warn(`[send-message] Template "${templateName}" failed:`, data.error.message);
      return { success: false, error: data.error, isTemplate: true, templateName };
    }
    console.log(`[send-message] Template "${templateName}" delivered to ${cleanPhone}: ${data.messages?.[0]?.id}`);
    return { success: true, messageId: data.messages?.[0]?.id, isTemplate: true, templateName };
  } catch (err) {
    return { success: false, error: { message: err.message }, isTemplate: true, templateName };
  }
}

// ─── Cascading Template Fallback: try custom templates → hello_world ──────────
async function sendTemplateFallback(to, originalText) {
  // Try 1: Custom Sobha template (if approved on Meta)
  const tpl1 = await sendWhatsAppTemplate(to, 'sobha_catalog_campaign_v1', 'en', []);
  if (tpl1.success) return tpl1;

  // Try 2: Meta's built-in hello_world template (every business account has this)
  const tpl2 = await sendWhatsAppTemplate(to, 'hello_world', 'en_US', []);
  if (tpl2.success) return tpl2;

  // All template attempts failed
  console.error(`[send-message] All template fallbacks failed for ${to}`);
  return {
    success: false,
    error: {
      message: 'Message could not be delivered. Contact has not messaged within 24 hours and no approved templates are available. Please create an approved message template in Meta Business Manager.',
      code: 'TEMPLATE_FALLBACK_EXHAUSTED',
    },
    isTemplate: true,
  };
}


// ─── Resolve and ensure valid public HTTPS URL for WhatsApp Media ─────────────
async function resolvePublicMediaUrl(mediaUrl, mediaType, folder = 'crm') {
  if (!mediaUrl || typeof mediaUrl !== 'string') return { url: null, type: 'text' };
  const trimmed = mediaUrl.trim();
  if (!trimmed) return { url: null, type: 'text' };

  // Fast path: already a public HTTP/HTTPS URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { url: trimmed, type: mediaType || 'image' };
  }

  // If it's a base64 Data URL (e.g. data:image/png;base64,...)
  if (trimmed.startsWith('data:')) {
    try {
      let mimeType = 'image/png';
      let rawBase64 = trimmed;
      const match = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
      if (match) {
        mimeType = match[1];
        rawBase64 = match[2];
      } else {
        const comma = trimmed.indexOf(',');
        if (comma !== -1) rawBase64 = trimmed.slice(comma + 1);
      }

      const buffer = Buffer.from(rawBase64, 'base64');
      if (buffer.length > 0) {
        const ext = mimeType.includes('pdf') ? 'pdf' : (mimeType.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '');
        const safeFolder = folder || 'crm';
        const path = `${safeFolder}/${Date.now()}_upload.${ext}`;

        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data: upData, error: upErr } = await supabase.storage
          .from('whatsapp-media')
          .upload(path, buffer, { contentType: mimeType, upsert: true });

        if (!upErr && upData) {
          const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
          if (urlData?.publicUrl && urlData.publicUrl.startsWith('http')) {
            const resolvedType = mimeType.includes('pdf') ? 'document' : (mimeType.startsWith('video/') ? 'video' : 'image');
            return { url: urlData.publicUrl, type: resolvedType };
          }
        }
      }
    } catch (err) {
      console.warn('[send-message] Base64 auto-upload failed:', err.message);
    }
  }

  // Safety fallback
  return { url: null, type: 'text' };
}

async function sendMetaWhatsApp(to, text, mediaType = 'text', mediaUrl = null, mediaFileName = null) {
  if (!WA_TOKEN || !PHONE_ID) {
    return { success: true, messageId: 'mock-wamid-' + Date.now() };
  }
  const cleanPhone = String(to).replace(/[^\d+]/g, '').replace(/^\+/, '');
  const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;

  // Resolve media URL to ensure valid public HTTPS link
  let resolvedUrl = mediaUrl;
  let resolvedType = mediaType;
  if (mediaUrl) {
    const res = await resolvePublicMediaUrl(mediaUrl, mediaType, 'crm');
    resolvedUrl = res.url;
    resolvedType = res.type;
  }

  // Auto-resolve relative or sobha catalog document URLs
  if (resolvedType === 'document') {
    if (!resolvedUrl || !resolvedUrl.startsWith('http')) {
      resolvedUrl = 'https://sobhainfra-erp.netlify.app/sobha-products.pdf';
    }
    if (!mediaFileName) {
      mediaFileName = 'Sobha_Infratech_Product_Catalog.pdf';
    }
  }

  const hasValidMediaUrl = resolvedUrl && typeof resolvedUrl === 'string' && (resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://'));

  let payload;
  if (resolvedType === 'image' && hasValidMediaUrl) {
    payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'image',
      image: { link: resolvedUrl, ...(text ? { caption: text } : {}) },
    };
  } else if (resolvedType === 'document' && hasValidMediaUrl) {
    payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'document',
      document: {
        link: resolvedUrl,
        filename: mediaFileName || 'Sobha_Infratech_Product_Catalog.pdf',
        ...(text ? { caption: text } : {}),
      },
    };
  } else if (resolvedType === 'video' && hasValidMediaUrl) {
    payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'video',
      video: { link: resolvedUrl, ...(text ? { caption: text } : {}) },
    };
  } else if (resolvedType === 'audio' && hasValidMediaUrl) {
    payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'audio',
      audio: { link: resolvedUrl },
    };
  } else {
    payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: { body: text || 'Hello!' },
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

    // ─── 1. Try sending the free-form message first ────────────────────────────
    let sendRes = await sendMetaWhatsApp(to, text || '', mediaType, mediaUrl, mediaFileName);
    let usedTemplate = false;
    let templateName = null;

    // ─── 2. If rejected due to 24-hour window, fallback to approved template ───
    if (!sendRes.success && is24HourWindowError(sendRes.error)) {
      console.warn(`[send-message] 24-hour window closed for ${to}. Attempting template fallback...`);
      const tplRes = await sendTemplateFallback(to, text);
      if (tplRes.success) {
        sendRes = tplRes;
        usedTemplate = true;
        templateName = tplRes.templateName;
        console.log(`[send-message] ✅ Template fallback SUCCESS for ${to} using "${templateName}"`);
      } else {
        console.error(`[send-message] ❌ Template fallback FAILED for ${to}:`, tplRes.error?.message);
        // Keep the original error but enhance with template fallback info
        sendRes = {
          success: false,
          error: tplRes.error || sendRes.error,
          templateFallbackAttempted: true,
        };
      }
    }

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
            // Check if matching lead name or customer_master name exists
            let discoveredName = null;
            const isGenericName = (n) => !n || typeof n !== 'string' || !n.trim() || /^(customer(\s*\d+)?|recipient(\s*\d+)?|whatsapp\s*user|user\s*\d*)$/i.test(n.trim());
            const tenDigits = digitsOnly.slice(-10);

            const { data: leadMatch } = await supabase.from('leads')
              .select('id, name')
              .or(`phone.eq.${cleanPhone},phone.eq.${digitsOnly},phone.eq.+${digitsOnly},phone.ilike.%${tenDigits}`)
              .maybeSingle();
            if (leadMatch?.name && !isGenericName(leadMatch.name)) {
              discoveredName = leadMatch.name.trim();
            } else {
              const { data: sheetCust } = await supabase.from('customer_master')
                .select('company_name, contact_person, contact_number')
                .or(`contact_number.eq.${cleanPhone},contact_number.eq.${digitsOnly},contact_number.ilike.%${tenDigits}`)
                .maybeSingle();
              if (sheetCust) {
                const candidate = sheetCust.contact_person || sheetCust.company_name;
                if (candidate && !isGenericName(candidate)) discoveredName = candidate.trim();
              }
            }

            const newConvPayload = {
              contact_name: discoveredName || null,
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
          // Build message body — include template info if fallback was used
          const msgBody = usedTemplate
            ? `[📋 Template: ${templateName}] ${text || 'Automated greeting sent (contact outside 24h window)'}`
            : (text || (mediaType === 'document' ? `📄 ${mediaFileName || 'PDF Document'}` : `[${mediaType}]`));

          const msgPayload = {
            conversation_id: effectiveConvId,
            direction: 'outbound',
            sender_type: senderType,
            message_type: usedTemplate ? 'template' : mediaType,
            media_url: usedTemplate ? null : mediaUrl,
            body: msgBody,
            status: sendRes.success ? 'delivered' : 'failed',
            provider_message_id: sendRes.messageId || null,
          };

          await supabase.from('whatsapp_messages').insert([msgPayload]);

          // Update conversation last message
          const newMode = senderType === 'ai' ? 'AI ACTIVE' : 'HUMAN ACTIVE';
          await supabase.from('whatsapp_conversations').update({
            last_message_text: msgBody,
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
        usedTemplate,
        templateName,
        templateFallbackAttempted: sendRes.templateFallbackAttempted || usedTemplate,
      }),
    };
  } catch (err) {
    console.error('[Send Message] Unhandled error:', err.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
