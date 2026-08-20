/**
 * Campaign Batch Queue Worker — Netlify Function
 * Conforms to Techma Master Spec v4.0 (Sections 13, 14, 15, 50G)
 *
 * Implements:
 *  - Meta WhatsApp Cloud API live message dispatch (with permanent token fallback)
 *  - Custom WhatsApp messages with image/media attachments & captions
 *  - Dynamic personalization variables ({name}, {product}, {budget}, {phone}, {company})
 *  - Database sync with wa_campaigns, whatsapp_conversations, and whatsapp_messages
 *  - Rate pacing (150ms delay between messages)
 */

const { createClient } = require('@supabase/supabase-js');

// Meta Cloud API Credentials (env var with permanent system token fallback)
const WA_TOKEN = process.env.WHATSAPP_TOKEN || 'EAAO5bP4en30BSechJ6djYxtfPtupXjDgsLW72pAnjZAcOykmIN7XHRj4bAp9WzuBWDFCMVgwhoY8xVKk3AxVAchmZA3VApLGAeiGj67FkXGevfsSJMftyN4jLuAwKz2haKRbx83Mp6hZCCFVFGrkTIS7tzVjmZCsSxIUsmxvfj5MGtLZCG4Vba4G8hP3FNulU4AZDZD';
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || '1217775984755724';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jbgkeeubevwopphekwfj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB';
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

// ─── 1. Send WhatsApp Template Message (Meta Approved) ───────────────────────
async function sendWhatsAppTemplate(to, template, params) {
  if (!WA_TOKEN || !PHONE_ID) {
    return { success: true, messageId: 'mock-wamid-' + Date.now() };
  }
  try {
    const cleanPhone = String(to).replace(/[^\d+]/g, '').replace(/^\+/, '');
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
        name: template.name,
        language: { code: template.language || 'en_US' },
      },
    };

    if (components.length > 0) {
      payload.template.components = components;
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
    return {
      success: !data.error,
      messageId: data.messages?.[0]?.id,
      error: data.error?.message,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── 2. Send Custom WhatsApp Message (Image / Document / Video / Text) ────────
async function sendMetaWhatsAppMediaOrText(to, text, mediaType = 'text', mediaUrl = null, mediaFileName = null) {
  if (!WA_TOKEN || !PHONE_ID) {
    return { success: true, messageId: 'mock-wamid-' + Date.now() };
  }
  try {
    const cleanPhone = String(to).replace(/[^\d+]/g, '').replace(/^\+/, '');
    const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;

    let payload;
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
          filename: mediaFileName || 'Document.pdf',
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
    } else {
      payload = {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'text',
        text: { body: text || 'Hello from our team!' },
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
      console.error('[Campaign Send] Meta API Error for ' + cleanPhone + ':', JSON.stringify(data.error));
      return { success: false, error: data.error.message || 'WhatsApp API error' };
    }
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── 3. Personalization helper ────────────────────────────────────────────────
function personalize(template, recipient) {
  if (!template) return '';
  const lead = recipient.lead || recipient || {};
  return template
    .replace(/{name}/g, lead.name || 'Valued Customer')
    .replace(/{product}/g, lead.property_interest || lead.product || 'our products')
    .replace(/{budget}/g, lead.budget || 'special pricing')
    .replace(/{amount}/g, lead.budget || 'advance')
    .replace(/{phone}/g, lead.phone || '')
    .replace(/{company}/g, lead.company_name || 'your company');
}

// ─── 4. Main Handler ─────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  try {
    const {
      campaignId,
      batchSize = 50,
      customMessage,
      templateText,
      mediaUrl,
      mediaType,
      recipients = [],
    } = JSON.parse(event.body || '{}');

    let supabase = null;
    if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('placeholder')) {
      supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    let targetRecipients = Array.isArray(recipients) && recipients.length > 0 ? recipients : [];
    let campaign = null;

    if (supabase && campaignId) {
      // 1. Fetch Campaign Info from wa_campaigns
      try {
        const { data: cData } = await supabase.from('wa_campaigns').select('*').eq('id', campaignId).maybeSingle();
        campaign = cData;

        // If recipients were not passed directly in body, extract from audience_filter
        if (targetRecipients.length === 0 && campaign?.audience_filter) {
          try {
            const filterObj = typeof campaign.audience_filter === 'string'
              ? JSON.parse(campaign.audience_filter)
              : campaign.audience_filter;
            if (Array.isArray(filterObj.recipients)) {
              targetRecipients = filterObj.recipients;
            }
          } catch {}
        }
      } catch (err) {
        console.warn('[send-campaign] wa_campaigns fetch warning:', err.message);
      }
    }

    // If no recipients found, return early with 0 processed
    if (targetRecipients.length === 0) {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          success: true,
          batchResults: { campaignId, processed: 0, sent: 0, failed: 0, errors: [] },
          message: 'No recipients provided.'
        }),
      };
    }

    const effectiveMediaUrl = mediaUrl || campaign?.media_url || null;
    const effectiveMediaType = mediaType || campaign?.media_type || (effectiveMediaUrl ? 'image' : 'text');
    const messageBodyRaw = customMessage || templateText || campaign?.custom_message || campaign?.template_name || 'Hello {name}, we have exciting updates for you!';

    const results = {
      campaignId,
      batchSize,
      processed: targetRecipients.length,
      sent: 0,
      failed: 0,
      errors: [],
      hasMedia: Boolean(effectiveMediaUrl),
    };

    // 2. Process Batch with Meta WhatsApp Cloud API
    for (const item of targetRecipients) {
      const phone = item.phone || (typeof item === 'string' ? item : '');
      if (!phone || phone.replace(/\D/g, '').length < 10) continue;

      const recipientLead = item.lead || item;
      const personalizedMsg = personalize(messageBodyRaw, recipientLead);

      const sendRes = await sendMetaWhatsAppMediaOrText(
        phone,
        personalizedMsg,
        effectiveMediaType,
        effectiveMediaUrl
      );

      if (sendRes.success) {
        results.sent++;

        if (supabase) {
          try {
            const cleanPhone = phone.startsWith('+') ? phone : '+' + phone;
            const digitsOnly = phone.replace(/[^\d]/g, '');

            let convId = null;
            const { data: conv } = await supabase.from('whatsapp_conversations')
              .select('id')
              .or(`contact_phone.eq.${cleanPhone},contact_phone.eq.${digitsOnly},contact_phone.eq.+${digitsOnly}`)
              .maybeSingle();

            if (conv?.id) {
              convId = conv.id;
            } else {
              const { data: newConv } = await supabase.from('whatsapp_conversations').insert([{
                contact_name: recipientLead.name || 'Customer',
                contact_phone: cleanPhone,
                conversation_mode: 'HUMAN ACTIVE',
                last_message_text: personalizedMsg || (effectiveMediaUrl ? `[${effectiveMediaType}]` : 'Campaign broadcast'),
                last_message_at: new Date().toISOString(),
                unread_count: 0,
              }]).select('id').maybeSingle();
              convId = newConv?.id;
            }

            if (convId) {
              const msgBody = effectiveMediaUrl
                ? (personalizedMsg ? `${personalizedMsg}\n[${effectiveMediaType}: ${effectiveMediaUrl}]` : `[${effectiveMediaType}: ${effectiveMediaUrl}]`)
                : personalizedMsg;

              await supabase.from('whatsapp_messages').insert([{
                conversation_id: convId,
                direction: 'outbound',
                sender_type: 'system',
                body: msgBody,
                status: 'delivered',
                provider_message_id: sendRes.messageId || null,
              }]);

              await supabase.from('whatsapp_conversations').update({
                last_message_text: personalizedMsg || `[${effectiveMediaType}]`,
                last_message_at: new Date().toISOString(),
                unread_count: 0,
              }).eq('id', convId);
            }
          } catch (logErr) {
            console.warn('[send-campaign] Message logging warning:', logErr.message);
          }
        }
      } else {
        results.failed++;
        results.errors.push({ phone, error: sendRes.error });
      }

      // Rate limit delay (150ms)
      await new Promise(r => setTimeout(r, 150));
    }

    // 3. Update wa_campaigns with live sent/delivered counts
    if (supabase && campaignId) {
      try {
        await supabase.from('wa_campaigns').update({
          total_sent: results.sent,
          delivered: results.sent,
          status: 'Completed',
        }).eq('id', campaignId);
      } catch (upErr) {
        console.warn('[send-campaign] wa_campaigns update warning:', upErr.message);
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        batchResults: results,
      }),
    };
  } catch (err) {
    console.error('[Campaign Worker] Error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
