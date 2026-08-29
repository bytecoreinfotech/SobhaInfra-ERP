/**
 * Campaign Batch Queue Worker — Netlify Function
 * Conforms to Techma Master Spec v4.0 (Sections 13, 14, 15, 50G)
 *
 * Implements:
 *  - Meta WhatsApp Cloud API live message dispatch (with permanent token fallback)
 *  - Interactive Quick Reply & Action Buttons (type: 'interactive' button & list)
 *  - Custom WhatsApp messages with image/media attachments & captions
 *  - Dynamic personalization variables ({name}, {product}, {budget}, {phone}, {company})
 *  - Database sync with wa_campaigns, whatsapp_conversations, and whatsapp_messages
 *  - Rate pacing (150ms delay between messages)
 */

const { createClient } = require('@supabase/supabase-js');

// Meta Cloud API Credentials (env var with permanent system token fallback)
const WA_TOKEN = process.env.WHATSAPP_TOKEN || 'EAAZAoFJNWmo4BSXS3ZBJrD7sk039yowup2fxSWYZAQFTiTvEfOm5XsRNmyRZC4RnkYyjvFaXaxN3fhqNVvvyBqe0CXwoWClgcBx6X8UhqaNWTUjNFt0XMkufGVKkF9FSOP2V2SXSwxreUpX3UALTRW8TC8feqyWyYdyyamSrkF8qWvqkuSEEkatiTGvaGZC1AYwZDZD';
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || '1213997841806162';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcgmppnvnwnilioapbli.supabase.co';
// Use SERVICE_ROLE key so DB inserts bypass RLS (safe: server-side function only)
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3MTk4MiwiZXhwIjoyMTAzMTQ3OTgyfQ.iMVtS3kZ5jkXd7wOsgviN_3Umz0Auw7vBa0NDlD9rKg';
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

// ─── 2. Send WhatsApp Interactive Quick Reply / List Message ─────────────────
async function sendMetaWhatsAppInteractive(to, text, buttons = [], headerMedia = null, footerText = null) {
  if (!WA_TOKEN || !PHONE_ID) {
    return { success: true, messageId: 'mock-wamid-' + Date.now() };
  }
  try {
    const cleanPhone = String(to).replace(/[^\d+]/g, '').replace(/^\+/, '');
    const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;

    // Filter valid buttons with labels
    const validButtons = (buttons || []).filter(b => b && (b.title || b.label));

    if (validButtons.length === 0) {
      return sendMetaWhatsAppMediaOrText(to, text, headerMedia?.type || 'text', headerMedia?.url, headerMedia?.filename);
    }

    let payload;

    // Up to 3 buttons -> WhatsApp Quick Reply Buttons
    if (validButtons.length <= 3) {
      const interactiveObj = {
        type: 'button',
        body: { text: text || 'Please select an option below:' },
        action: {
          buttons: validButtons.slice(0, 3).map((b, idx) => ({
            type: 'reply',
            reply: {
              id: b.id || `btn_${idx}_${(b.title || b.label || 'opt').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20)}`,
              title: (b.title || b.label).slice(0, 20),
            },
          })),
        },
      };

      if (footerText) {
        interactiveObj.footer = { text: footerText.slice(0, 60) };
      }

      if (headerMedia && headerMedia.url) {
        if (headerMedia.type === 'image') {
          interactiveObj.header = { type: 'image', image: { link: headerMedia.url } };
        } else if (headerMedia.type === 'document') {
          interactiveObj.header = { type: 'document', document: { link: headerMedia.url, filename: headerMedia.filename || 'Brochure.pdf' } };
        } else if (headerMedia.type === 'video') {
          interactiveObj.header = { type: 'video', video: { link: headerMedia.url } };
        }
      }

      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'interactive',
        interactive: interactiveObj,
      };
    } else {
      // 4+ buttons -> WhatsApp Interactive List Menu
      const interactiveObj = {
        type: 'list',
        body: { text: text || 'Please choose from the menu below:' },
        action: {
          button: 'View Options',
          sections: [
            {
              title: 'Available Options',
              rows: validButtons.slice(0, 10).map((b, idx) => ({
                id: b.id || `opt_${idx}_${(b.title || b.label || 'opt').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20)}`,
                title: (b.title || b.label).slice(0, 24),
                description: (b.description || b.actionType || 'Tap to select').slice(0, 72),
              })),
            },
          ],
        },
      };

      if (footerText) {
        interactiveObj.footer = { text: footerText.slice(0, 60) };
      }

      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'interactive',
        interactive: interactiveObj,
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
      console.warn('[Interactive Dispatch] Fallback to standard message:', data.error.message);
      // Fallback to text/media if interactive fails (e.g. template constraint)
      return sendMetaWhatsAppMediaOrText(to, text, headerMedia?.type || 'text', headerMedia?.url, headerMedia?.filename);
    }
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    console.warn('[Interactive Dispatch Catch] Fallback:', err.message);
    return sendMetaWhatsAppMediaOrText(to, text, headerMedia?.type || 'text', headerMedia?.url, headerMedia?.filename);
  }
}

// ─── 3. Send Custom WhatsApp Message (Image / Document / Video / Text) ────────
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

// ─── 4. Personalization helper ────────────────────────────────────────────────
function personalize(template, recipient, campaignDefaults = {}) {
  if (!template) return '';
  const lead = recipient.lead || recipient || {};
  const isOverride = campaignDefaults.mode === 'override';

  const defaultProduct = campaignDefaults.product || 'our products';
  const defaultBudget = campaignDefaults.budget || 'special pricing';
  const defaultCompany = campaignDefaults.company || 'our company';
  const defaultPhone = campaignDefaults.phone || '';

  const name = lead.name || campaignDefaults.name || 'Valued Customer';
  const product = isOverride ? defaultProduct : (lead.property_interest || lead.product || defaultProduct);
  const budget = isOverride ? defaultBudget : (lead.budget || defaultBudget);
  const company = isOverride ? defaultCompany : (lead.company_name || defaultCompany);
  const phone = lead.phone || defaultPhone;

  return template
    .replace(/{name}/g, name)
    .replace(/{product}/g, product)
    .replace(/{budget}/g, budget)
    .replace(/{amount}/g, budget)
    .replace(/{phone}/g, phone)
    .replace(/{company}/g, company);
}

// ─── 5. Main Handler ─────────────────────────────────────────────────────────
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
      campaignDefaults = {},
      interactiveButtons = [],
      buttonFlow = null,
      automationMode = 'hybrid', // 'hybrid' | 'fallback_only' | 'strict_guided'
      recipients = [],
    } = JSON.parse(event.body || '{}');

    let supabase = null;
    if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('placeholder')) {
      supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    let targetRecipients = Array.isArray(recipients) && recipients.length > 0 ? recipients : [];
    let campaign = null;
    let effectiveDefaults = { ...campaignDefaults };
    let effectiveButtons = Array.isArray(interactiveButtons) && interactiveButtons.length > 0 ? interactiveButtons : [];
    let effectiveFlow = buttonFlow || null;

    if (supabase && campaignId) {
      // 1. Fetch Campaign Info from wa_campaigns
      try {
        const { data: cData } = await supabase.from('wa_campaigns').select('*').eq('id', campaignId).maybeSingle();
        campaign = cData;

        // If recipients were not passed directly in body, extract from audience_filter
        if (campaign?.audience_filter) {
          try {
            const filterObj = typeof campaign.audience_filter === 'string'
              ? JSON.parse(campaign.audience_filter)
              : campaign.audience_filter;
            if (targetRecipients.length === 0 && Array.isArray(filterObj.recipients)) {
              targetRecipients = filterObj.recipients;
            }
            if (filterObj.campaign_defaults && Object.keys(effectiveDefaults).length === 0) {
              effectiveDefaults = filterObj.campaign_defaults;
            }
            if (effectiveButtons.length === 0 && Array.isArray(filterObj.interactive_buttons)) {
              effectiveButtons = filterObj.interactive_buttons;
            }
            if (!effectiveFlow && filterObj.button_flow) {
              effectiveFlow = filterObj.button_flow;
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
      hasInteractiveButtons: effectiveButtons.length > 0,
    };

    // 2. Process Batch with Meta WhatsApp Cloud API
    for (const item of targetRecipients) {
      const phone = item.phone || (typeof item === 'string' ? item : '');
      if (!phone || phone.replace(/\D/g, '').length < 10) continue;

      const recipientLead = item.lead || item;
      const personalizedMsg = personalize(messageBodyRaw, recipientLead, effectiveDefaults);

      let sendRes;
      if (effectiveButtons.length > 0) {
        // Send Interactive Quick Reply message
        const headerObj = effectiveMediaUrl ? { type: effectiveMediaType, url: effectiveMediaUrl } : null;
        sendRes = await sendMetaWhatsAppInteractive(
          phone,
          personalizedMsg,
          effectiveButtons,
          headerObj,
          effectiveDefaults.company || 'ERPPro Solutions'
        );
      } else {
        // Send regular Media or Text message
        sendRes = await sendMetaWhatsAppMediaOrText(
          phone,
          personalizedMsg,
          effectiveMediaType,
          effectiveMediaUrl
        );
      }

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
                conversation_mode: 'AI ACTIVE',
                last_message_text: personalizedMsg || (effectiveMediaUrl ? `[${effectiveMediaType}]` : 'Campaign broadcast'),
                last_message_at: new Date().toISOString(),
                unread_count: 0,
              }]).select('id').maybeSingle();
              convId = newConv?.id;
            }

            if (convId) {
              const buttonSummary = effectiveButtons.length > 0
                ? `\n[Quick Replies: ${effectiveButtons.map(b => b.title || b.label).join(' | ')}]`
                : '';
              
              const msgBody = effectiveMediaUrl
                ? (personalizedMsg ? `${personalizedMsg}\n[${effectiveMediaType}: ${effectiveMediaUrl}]${buttonSummary}` : `[${effectiveMediaType}: ${effectiveMediaUrl}]${buttonSummary}`)
                : (personalizedMsg + buttonSummary);

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

    // 3. Update wa_campaigns with live sent/delivered counts & flow rules
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
