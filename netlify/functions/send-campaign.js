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
        body: { text: (text || 'Please select an option below:').slice(0, 1024) },
        action: {
          buttons: validButtons.slice(0, 3).map((b, idx) => ({
            type: 'reply',
            reply: {
              id: String(b.id || `btn_${idx}_${(b.title || b.label || 'opt').toLowerCase().replace(/[^a-z0-9]/g, '_')}`).slice(0, 256),
              title: String(b.title || b.label || 'Option').trim().slice(0, 20),
            },
          })),
        },
      };

      if (footerText) {
        interactiveObj.footer = { text: String(footerText).slice(0, 60) };
      }

      if (headerMedia && headerMedia.url && typeof headerMedia.url === 'string' && (headerMedia.url.startsWith('http://') || headerMedia.url.startsWith('https://'))) {
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
        body: { text: (text || 'Please choose from the menu below:').slice(0, 1024) },
        action: {
          button: 'View Options',
          sections: [
            {
              title: 'Available Options',
              rows: validButtons.slice(0, 10).map((b, idx) => ({
                id: String(b.id || `opt_${idx}_${(b.title || b.label || 'opt').toLowerCase().replace(/[^a-z0-9]/g, '_')}`).slice(0, 200),
                title: String(b.title || b.label || 'Option').trim().slice(0, 24),
                description: String(b.description || b.actionType || 'Tap to select').trim().slice(0, 72),
              })),
            },
          ],
        },
      };

      if (footerText) {
        interactiveObj.footer = { text: String(footerText).slice(0, 60) };
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
      console.warn('[Interactive Dispatch] Error with interactive payload:', data.error.message);
      // If header caused the issue, retry interactive buttons without header so buttons are preserved!
      if (payload.interactive?.header) {
        try {
          const retryPayload = { ...payload, interactive: { ...payload.interactive } };
          delete retryPayload.interactive.header;
          const retryRes = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(retryPayload),
          });
          const retryData = await retryRes.json();
          if (!retryData.error && retryData.messages?.[0]?.id) {
            console.log('[Interactive Dispatch] Recovered successfully without media header');
            return { success: true, messageId: retryData.messages[0].id };
          }
        } catch (retryErr) {
          console.warn('[Interactive Retry Error]', retryErr.message);
        }
      }
      // Fallback to text/media if interactive fails completely
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
    const hasValidMediaUrl = mediaUrl && typeof mediaUrl === 'string' && (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://'));

    if (mediaType === 'image' && hasValidMediaUrl) {
      payload = {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'image',
        image: { link: mediaUrl, ...(text ? { caption: text } : {}) },
      };
    } else if (mediaType === 'document' && hasValidMediaUrl) {
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
    } else if (mediaType === 'video' && hasValidMediaUrl) {
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
      return { success: false, error: `${data.error.code || ''}: ${data.error.message || 'WhatsApp API error'}` };
    }
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── 3.1 Send Meta Approved Template Message (Smart Component Builder) ───────
// Accepts either pre-fetched templateComponents (from sync/DB) or fetches from Meta.
// Dynamically builds the correct components array based on header type, body vars, etc.
async function sendWhatsAppTemplate(to, templateName, language = 'en', bodyParams = [], templateComponents = null, mediaUrl = null, preUploadedMediaId = null) {
  if (!WA_TOKEN || !PHONE_ID) {
    return { success: true, messageId: 'mock-tpl-' + Date.now(), simulated: true };
  }
  try {
    const phone = String(to).replace(/[^\d]/g, '');

    // ── Build Components Array from Template Structure ──
    const components = [];

    // 1. HEADER component — only if template has IMAGE/VIDEO/DOCUMENT header
    // Priority: preUploadedMediaId > user mediaUrl (public link) > download+reupload from CDN
    if (templateComponents && Array.isArray(templateComponents)) {
      const headerComp = templateComponents.find(c => c.type === 'HEADER');
      if (headerComp && (headerComp.format === 'IMAGE' || headerComp.format === 'VIDEO' || headerComp.format === 'DOCUMENT')) {
        const mediaTypeLower = headerComp.format.toLowerCase();

        if (preUploadedMediaId) {
          // Best path: use the pre-uploaded media_id (already uploaded once before the loop)
          const mediaParam = { type: mediaTypeLower };
          mediaParam[mediaTypeLower] = { id: preUploadedMediaId };
          components.push({ type: 'header', parameters: [mediaParam] });
        } else if (mediaUrl && !mediaUrl.includes('scontent.whatsapp.net') && !mediaUrl.includes('lookaside.fbsbx.com')) {
          // User-provided public URL — use directly as link
          const mediaParam = { type: mediaTypeLower };
          if (mediaTypeLower === 'document') {
            mediaParam[mediaTypeLower] = { link: mediaUrl, filename: 'Brochure.pdf' };
          } else {
            mediaParam[mediaTypeLower] = { link: mediaUrl };
          }
          components.push({ type: 'header', parameters: [mediaParam] });
        } else {
          // Last resort: download from CDN and re-upload now
          const cdnUrl = mediaUrl || headerComp.example?.header_handle?.[0] || null;
          if (cdnUrl) {
            try {
              const dlRes = await fetch(cdnUrl);
              if (dlRes.ok) {
                const buffer = await dlRes.arrayBuffer();
                const mimeType = mediaTypeLower === 'image' ? 'image/jpeg' : mediaTypeLower === 'video' ? 'video/mp4' : 'application/pdf';
                const ext = mediaTypeLower === 'image' ? '.jpg' : mediaTypeLower === 'video' ? '.mp4' : '.pdf';
                const formData = new FormData();
                formData.append('messaging_product', 'whatsapp');
                formData.append('type', mimeType);
                formData.append('file', new Blob([buffer], { type: mimeType }), `header${ext}`);
                const uploadRes = await fetch(`https://graph.facebook.com/v20.0/${PHONE_ID}/media`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${WA_TOKEN}` },
                  body: formData,
                });
                const uploadData = await uploadRes.json();
                if (uploadData.id) {
                  const mediaParam = { type: mediaTypeLower };
                  mediaParam[mediaTypeLower] = { id: uploadData.id };
                  components.push({ type: 'header', parameters: [mediaParam] });
                }
              }
            } catch (e) { console.warn('[sendWhatsAppTemplate] Header media fallback failed:', e.message); }
          }
        }
      }
    }

    // 2. BODY component — only send params if template actually has {{1}}, {{2}} etc
    let expectedParamCount = 0;
    if (templateComponents && Array.isArray(templateComponents)) {
      const bodyComp = templateComponents.find(c => c.type === 'BODY');
      if (bodyComp && bodyComp.text) {
        const varMatches = bodyComp.text.match(/\{\{\d+\}\}/g);
        expectedParamCount = varMatches ? varMatches.length : 0;
      }
    }

    if (expectedParamCount > 0 && bodyParams && bodyParams.length > 0) {
      // Trim or pad params to match expected count exactly
      const finalParams = [];
      for (let i = 0; i < expectedParamCount; i++) {
        finalParams.push(bodyParams[i] || 'Valued Client');
      }
      components.push({
        type: 'body',
        parameters: finalParams.map(p => ({ type: 'text', text: String(p) })),
      });
    }

    // 3. BUTTON components — FLOW buttons REQUIRE explicit component with flow_token
    // QUICK_REPLY and URL buttons are auto-rendered by Meta from the template definition
    if (templateComponents && Array.isArray(templateComponents)) {
      const buttonsComp = templateComponents.find(c => c.type === 'BUTTONS');
      if (buttonsComp && buttonsComp.buttons) {
        buttonsComp.buttons.forEach((btn, idx) => {
          if (btn.type === 'FLOW') {
            components.push({
              type: 'button',
              sub_type: 'flow',
              index: String(idx),
              parameters: [{
                type: 'action',
                action: {
                  flow_token: 'campaign_broadcast_' + Date.now(),
                  // Use the flow's navigate_screen if specified in the template
                  ...(btn.navigate_screen ? { flow_action_data: { screen: btn.navigate_screen } } : {}),
                },
              }],
            });
          }
        });
      }
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        ...(components.length > 0 ? { components } : {}),
      },
    };

    console.log(`[sendWhatsAppTemplate] Sending "${templateName}" (${language}) to ${phone} | components:`, JSON.stringify(components));

    const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.error) {
      console.error(`[sendWhatsAppTemplate] ❌ "${templateName}" FAILED:`, JSON.stringify(data.error));
      return { success: false, error: `${data.error.code}: ${data.error.message}` };
    }
    console.log(`[sendWhatsAppTemplate] ✅ "${templateName}" delivered to ${phone} | wamid: ${data.messages?.[0]?.id}`);
    return { success: true, messageId: data.messages?.[0]?.id, isTemplate: true };
  } catch (err) {
    console.error(`[sendWhatsAppTemplate] Exception for "${templateName}":`, err.message);
    return { success: false, error: err.message };
  }
}

// Helper: Fetch template components from Meta API (for fallback templates)
async function fetchTemplateComponents(templateName, language) {
  try {
    const wabaId = process.env.WHATSAPP_WABA_ID || '2375569266307315';
    const res = await fetch(`https://graph.facebook.com/v20.0/${wabaId}/message_templates?name=${templateName}`, {
      headers: { 'Authorization': `Bearer ${WA_TOKEN}` },
    });
    const data = await res.json();
    if (data.data && data.data.length > 0) {
      const tpl = data.data.find(t => t.language === language) || data.data[0];
      return { components: tpl.components || [], language: tpl.language };
    }
  } catch (err) {
    console.warn(`[fetchTemplateComponents] Failed for ${templateName}:`, err.message);
  }
  return { components: [], language: language || 'en' };
}


// ─── 4. Personalization helper ────────────────────────────────────────────────
function isGenericName(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (/^customer(\s*\d+)?$/i.test(trimmed)) return true;
  if (/^recipient(\s*\d+)?$/i.test(trimmed)) return true;
  if (/^whatsapp\s*user(\s*\(.*\))?$/i.test(trimmed)) return true;
  if (/^user(\s*\d+)?$/i.test(trimmed)) return true;
  if (/^client(\s*\d+)?$/i.test(trimmed)) return true;
  if (/^valued\s*(customer|client)$/i.test(trimmed)) return true;
  if (/^sir\s*\/?\s*ma'?am$/i.test(trimmed)) return true;
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 7 && trimmed.replace(/[\d\s+\-()]/g, '').length === 0) return true;
  return false;
}

function personalize(template, recipient, campaignDefaults = {}) {
  if (!template) return '';
  const lead = recipient.lead || recipient || {};
  const isOverride = campaignDefaults.mode === 'override';

  const defaultProduct = campaignDefaults.product || 'our products';
  const defaultBudget = campaignDefaults.budget || 'special pricing';
  const defaultCompany = campaignDefaults.company || 'our company';
  const defaultPhone = campaignDefaults.phone || '';

  const rawName = lead.name || campaignDefaults.name || '';
  const name = isGenericName(rawName) ? (campaignDefaults.name || 'Valued Client') : rawName;
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

// ─── 4.1 Resolve and ensure valid public HTTPS URL for WhatsApp Media ────────
async function resolvePublicMediaUrl(mediaUrl, mediaType, folder = 'campaigns') {
  if (!mediaUrl || typeof mediaUrl !== 'string') return { url: null, type: 'text' };
  const trimmed = mediaUrl.trim();
  if (!trimmed) return { url: null, type: 'text' };

  // Fast path: already a valid public HTTP/HTTPS URL
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
        const safeFolder = folder || 'campaigns';
        const path = `${safeFolder}/${Date.now()}_auto_upload.${ext}`;

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
      console.warn('[send-campaign] Base64 auto-upload failed:', err.message);
    }
  }

  // Safety fallback: Never pass invalid URI (like data:... or relative paths) to Meta
  console.warn('[send-campaign] Media URL is not a valid HTTP URL, falling back to text:', trimmed.slice(0, 50));
  return { url: null, type: 'text' };
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
      automationMode = 'hybrid',
      recipients = [],
      templateName = null,
      templateLanguage = 'en',
      templateParams = null,
      templateComponents = null,   // Full Meta template components array for smart payload building
      isChunk = false,
      chunkIndex = 1,
      totalChunks = 1,
    } = JSON.parse(event.body || '{}');

    console.log('[send-campaign] Incoming request:', { campaignId, templateName, recipientsCount: recipients.length, hasButtons: interactiveButtons.length, isChunk, chunkIndex, totalChunks });

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

    const rawMediaUrl = mediaUrl || campaign?.media_url || null;
    const rawMediaType = mediaType || campaign?.media_type || (rawMediaUrl ? 'image' : 'text');
    const { url: effectiveMediaUrl, type: effectiveMediaType } = await resolvePublicMediaUrl(rawMediaUrl, rawMediaType, 'campaigns');
    const messageBodyRaw = customMessage || templateText || campaign?.custom_message || campaign?.template_name || 'Hello {name}, we have exciting updates for you!';

    const results = {
      campaignId,
      batchSize,
      processed: targetRecipients.length,
      sent: 0,
      failed: 0,
      errors: [],
      details: [],
      hasMedia: Boolean(effectiveMediaUrl),
      hasInteractiveButtons: effectiveButtons.length > 0,
    };

    // ── Resolve Template Components (for smart Meta API payload building) ──
    // If templateComponents weren't passed or is empty array, fetch from Meta API
    let effectiveTemplateComponents = (Array.isArray(templateComponents) && templateComponents.length > 0) ? templateComponents : null;
    let effectiveTemplateLang = templateLanguage || 'en';

    const isApprovedMetaTemplate = templateName &&
      templateName !== 'Interactive Broadcast Flow' &&
      !templateName.includes('Interactive Broadcast');

    if (isApprovedMetaTemplate && !effectiveTemplateComponents) {
      console.log(`[send-campaign] No templateComponents passed for "${templateName}", fetching from Meta API...`);
      const fetched = await fetchTemplateComponents(templateName, effectiveTemplateLang);
      effectiveTemplateComponents = fetched.components;
      // Use the actual language from Meta (e.g. 'en_IN' not 'en')
      effectiveTemplateLang = fetched.language || effectiveTemplateLang;
      console.log(`[send-campaign] Resolved template: lang=${effectiveTemplateLang}, components=${effectiveTemplateComponents?.length || 0}`);
    }

    // ── Pre-upload template header media (ONCE, before recipient loop) ──
    // If the template has an IMAGE/VIDEO/DOCUMENT header and the URL is from Meta's CDN
    // (scontent.whatsapp.net), download and re-upload to WhatsApp Media API once.
    // This avoids re-uploading per recipient and prevents 131053 "Media upload error".
    let preUploadedMediaId = null;
    if (isApprovedMetaTemplate && effectiveTemplateComponents && Array.isArray(effectiveTemplateComponents)) {
      const headerComp = effectiveTemplateComponents.find(c => c.type === 'HEADER');
      if (headerComp && (headerComp.format === 'IMAGE' || headerComp.format === 'VIDEO' || headerComp.format === 'DOCUMENT')) {
        const sourceUrl = effectiveMediaUrl || headerComp.example?.header_handle?.[0] || null;
        if (sourceUrl) {
          const isMetaCdn = sourceUrl.includes('scontent.whatsapp.net') || sourceUrl.includes('lookaside.fbsbx.com');
          if (isMetaCdn) {
            try {
              console.log(`[send-campaign] Pre-uploading ${headerComp.format} header from Meta CDN...`);
              const dlRes = await fetch(sourceUrl);
              if (dlRes.ok) {
                const buffer = await dlRes.arrayBuffer();
                const fmt = headerComp.format.toLowerCase();
                const mimeType = fmt === 'image' ? 'image/jpeg' : fmt === 'video' ? 'video/mp4' : 'application/pdf';
                const ext = fmt === 'image' ? '.jpg' : fmt === 'video' ? '.mp4' : '.pdf';

                const formData = new FormData();
                formData.append('messaging_product', 'whatsapp');
                formData.append('type', mimeType);
                formData.append('file', new Blob([buffer], { type: mimeType }), `header${ext}`);

                const uploadRes = await fetch(`https://graph.facebook.com/v20.0/${PHONE_ID}/media`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${WA_TOKEN}` },
                  body: formData,
                });
                const uploadData = await uploadRes.json();
                if (uploadData.id) {
                  preUploadedMediaId = uploadData.id;
                  console.log(`[send-campaign] ✅ Header media pre-uploaded: id=${preUploadedMediaId} (${buffer.byteLength} bytes)`);
                } else {
                  console.warn(`[send-campaign] ⚠️ Header media pre-upload failed:`, JSON.stringify(uploadData));
                }
              } else {
                console.warn(`[send-campaign] ⚠️ Header media download failed: ${dlRes.status}`);
              }
            } catch (preUpErr) {
              console.warn(`[send-campaign] ⚠️ Header media pre-upload error:`, preUpErr.message);
            }
          }
        }
      }
    }

    // 2. Process Batch with Meta WhatsApp Cloud API
    for (const item of targetRecipients) {
      const phone = item.phone || (typeof item === 'string' ? item : '');
      if (!phone || phone.replace(/\D/g, '').length < 10) continue;

      const recipientLead = item.lead || item;
      const personalizedMsg = personalize(messageBodyRaw, recipientLead, effectiveDefaults);

      let sendRes = null;
      let usedTemplate = false;
      let usedTemplateName = null;

      // 1. If an approved Meta template was selected, send it directly
      // This uses the official template API — works outside 24h window for all contacts
      if (isApprovedMetaTemplate) {
        const clientName = (recipientLead.name && !isGenericName(recipientLead.name)) ? recipientLead.name.trim() : 'Valued Client';
        const company = recipientLead.company_name || effectiveDefaults.company || 'Sobhainfra Tech';
        // Build a generous params array — sendWhatsAppTemplate will trim to match template's actual var count
        const params = Array.isArray(templateParams) && templateParams.length > 0
          ? templateParams
          : [clientName, company, effectiveDefaults.product || 'our products', effectiveDefaults.phone || ''];

        console.log(`[send-campaign] Sending approved template "${templateName}" (${effectiveTemplateLang}) → ${phone}`);
        sendRes = await sendWhatsAppTemplate(phone, templateName, effectiveTemplateLang, params, effectiveTemplateComponents, effectiveMediaUrl, preUploadedMediaId);
        if (sendRes.success) {
          usedTemplate = true;
          usedTemplateName = templateName;
        }
      }

      // 2. Otherwise send Interactive or Media/Text
      if (!sendRes) {
        if (effectiveButtons.length > 0) {
          // Send Interactive Quick Reply message
          const headerObj = effectiveMediaUrl ? { type: effectiveMediaType, url: effectiveMediaUrl } : null;
          sendRes = await sendMetaWhatsAppInteractive(
            phone,
            personalizedMsg,
            effectiveButtons,
            headerObj,
            effectiveDefaults.company || 'Sobhainfra Tech'
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
      }

      // If rejected because recipient is outside 24h window, fallback to approved Meta Marketing Template
      // Comprehensive error detection: covers all Meta session-window error codes
      if (!sendRes.success) {
        const errStr = typeof sendRes.error === 'string' ? sendRes.error : JSON.stringify(sendRes.error || '');
        const is24hErr = /131047|131026|130429/i.test(errStr) ||
          /re.?engag/i.test(errStr) ||
          /24.?hour/i.test(errStr) ||
          /session|outside.*window|message.*window/i.test(errStr) ||
          /recipient.*not.*message/i.test(errStr);

        if (is24hErr) {
          console.warn(`[send-campaign] 24h window closed for ${phone}. Attempting template fallback cascade...`);
          const clientName = (recipientLead.name && !isGenericName(recipientLead.name)) ? recipientLead.name.trim() : 'Valued Client';

          // Cascade 1: Try custom Sobha template (fetch its components from Meta for correct payload)
          const sobha = await fetchTemplateComponents('sobha_catalog_campaign_v1', 'en');
          const tpl1 = await sendWhatsAppTemplate(phone, 'sobha_catalog_campaign_v1', sobha.language,
            [clientName, effectiveDefaults.company || 'Sobhainfra Tech'],
            sobha.components
          );
          if (tpl1.success) {
            sendRes = tpl1;
            usedTemplate = true;
            usedTemplateName = 'sobha_catalog_campaign_v1';
          } else {
            // Cascade 2: Try Meta's built-in hello_world template (every WABA has this)
            const hw = await fetchTemplateComponents('hello_world', 'en_US');
            const tpl2 = await sendWhatsAppTemplate(phone, 'hello_world', hw.language, [], hw.components);
            if (tpl2.success) {
              sendRes = tpl2;
              usedTemplate = true;
              usedTemplateName = 'hello_world';
            } else {
              console.error(`[send-campaign] ❌ All template fallbacks FAILED for ${phone}`);
            }
          }
        }
      }

      // Record recipient detail
      results.details.push({
        name: recipientLead.name || 'Valued Client',
        phone,
        status: sendRes.success ? 'sent' : 'failed',
        messageId: sendRes.messageId || null,
        error: sendRes.error || null,
      });

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
              .limit(1)
              .maybeSingle();

            if (conv?.id) {
              convId = conv.id;
            } else {
              const safeName = (recipientLead.name && !isGenericName(recipientLead.name)) ? recipientLead.name.trim() : null;
              const { data: newConv } = await supabase.from('whatsapp_conversations').insert([{
                contact_name: safeName,
                contact_phone: cleanPhone,
                conversation_mode: 'HUMAN ACTIVE',
                unread_count: 0,
              }]).select('id').maybeSingle();
              convId = newConv?.id;
            }

            if (convId) {
              const buttonSummary = effectiveButtons.length > 0
                ? `\n[Quick Replies: ${effectiveButtons.map(b => b.title || b.label).join(' | ')}]`
                : '';
              
              const msgBody = usedTemplate
                ? `[📋 Template: ${usedTemplateName || 'hello_world'}] ${personalizedMsg || 'Automated greeting sent (contact outside 24h window)'}`
                : (effectiveMediaUrl
                    ? (personalizedMsg ? `${personalizedMsg}\n[${effectiveMediaType}: ${effectiveMediaUrl}]${buttonSummary}` : `[${effectiveMediaType}: ${effectiveMediaUrl}]${buttonSummary}`)
                    : (personalizedMsg + buttonSummary));

              await supabase.from('whatsapp_messages').insert([{
                conversation_id: convId,
                direction: 'outbound',
                sender_type: 'system',
                body: msgBody,
                status: 'sent',
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

      // Rate limit delay (80ms: safe for Meta Cloud API, fast throughput)
      await new Promise(r => setTimeout(r, 80));
    }

    // 2.1 Post-dispatch verification:
    // When executing in micro-chunks, skip the 2.2s sleep because the client performs live verification directly.
    // For single-request dispatches with small recipient counts, check webhook callbacks.
    if (!isChunk && supabase && results.sent > 0 && results.details.some(d => d.status === 'sent' && d.messageId)) {
      try {
        await new Promise(r => setTimeout(r, 1200));
        const sentMsgIds = results.details.filter(d => d.status === 'sent' && d.messageId).map(d => d.messageId);
        const { data: checkedMsgs } = await supabase
          .from('whatsapp_messages')
          .select('provider_message_id, status, error_message')
          .in('provider_message_id', sentMsgIds);

        if (checkedMsgs && checkedMsgs.length > 0) {
          checkedMsgs.forEach(cm => {
            if (cm.status === 'failed') {
              const matched = results.details.find(d => d.messageId === cm.provider_message_id);
              if (matched && matched.status === 'sent') {
                matched.status = 'failed';
                matched.error = cm.error_message || '131049: This message was not delivered to maintain healthy ecosystem engagement.';
                results.sent = Math.max(0, results.sent - 1);
                results.failed++;
                results.errors.push({ phone: matched.phone, error: matched.error });
                console.log(`[send-campaign] ⚠️ Post-check caught webhook failure for ${matched.phone}: ${matched.error}`);
              }
            } else if (cm.status === 'delivered') {
              const matched = results.details.find(d => d.messageId === cm.provider_message_id);
              if (matched) matched.status = 'delivered';
            }
          });
        }
      } catch (checkErr) {
        console.warn('[send-campaign] Post-dispatch check warning:', checkErr.message);
      }
    }

    // 3. Update wa_campaigns with live sent/delivered counts & accurate status
    if (supabase && campaignId) {
      try {
        if (isChunk) {
          // Increment cumulative counts
          const { data: curCamp } = await supabase.from('wa_campaigns').select('total_sent, delivered').eq('id', campaignId).maybeSingle();
          const currentSent = (curCamp?.total_sent || 0) + results.sent;
          const currentDelivered = (curCamp?.delivered || 0) + results.sent;
          const isFinalChunk = chunkIndex >= totalChunks;
          await supabase.from('wa_campaigns').update({
            total_sent: currentSent,
            delivered: currentDelivered,
            status: isFinalChunk ? (currentSent === 0 ? 'Failed' : 'Completed') : 'Processing',
          }).eq('id', campaignId);
        } else {
          const finalStatus = results.sent === 0 && results.failed > 0
            ? 'Failed'
            : (results.failed > 0 ? 'Partially Delivered' : 'Completed');
          await supabase.from('wa_campaigns').update({
            total_sent: results.sent,
            delivered: results.sent,
            status: finalStatus,
          }).eq('id', campaignId);
        }
      } catch (upErr) {
        console.warn('[send-campaign] wa_campaigns update warning:', upErr.message);
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: results.failed === 0,
        partial: results.sent > 0 && results.failed > 0,
        batchResults: results,
      }),
    };
  } catch (err) {
    console.error('[Campaign Worker] Error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
