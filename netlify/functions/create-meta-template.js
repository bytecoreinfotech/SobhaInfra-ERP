/**
 * Meta WhatsApp Template Creator — Netlify Function
 * URL: POST /.netlify/functions/create-meta-template
 * 
 * Takes template details from the ERP Campaign Studio (name, header, body, buttons),
 * uploads header media (if image/document) via Meta Resumable Upload API,
 * registers the template directly with Meta Graph API,
 * and saves it into Supabase whatsapp_templates table.
 */

const { createClient } = require('@supabase/supabase-js');

const WA_TOKEN     = process.env.WHATSAPP_TOKEN || 'EAAZAoFJNWmo4BSXS3ZBJrD7sk039yowup2fxSWYZAQFTiTvEfOm5XsRNmyRZC4RnkYyjvFaXaxN3fhqNVvvyBqe0CXwoWClgcBx6X8UhqaNWTUjNFt0XMkufGVKkF9FSOP2V2SXSwxreUpX3UALTRW8TC8feqyWyYdyyamSrkF8qWvqkuSEEkatiTGvaGZC1AYwZDZD';
const WABA_ID      = process.env.WHATSAPP_WABA_ID || '2375569266307315';
const APP_ID       = process.env.WHATSAPP_APP_ID || '1803287440824974';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcgmppnvnwnilioapbli.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3MTk4MiwiZXhwIjoyMTAzMTQ3OTgyfQ.iMVtS3kZ5jkXd7wOsgviN_3Umz0Auw7vBa0NDlD9rKg';
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

// Upload media buffer to Meta Resumable Upload API to obtain header_handle
// Supports IMAGE, DOCUMENT (PDF), and VIDEO formats
async function getHeaderHandle(mediaUrl, format = 'IMAGE') {
  try {
    let buffer = null;
    // Default MIME types per format
    let mimeType = format === 'DOCUMENT' ? 'application/pdf'
      : format === 'VIDEO' ? 'video/mp4'
      : 'image/png';

    if (mediaUrl && (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://'))) {
      const res = await fetch(mediaUrl);
      const arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      const ct = res.headers.get('content-type');
      if (ct) mimeType = ct.split(';')[0].trim();
    } else if (mediaUrl && mediaUrl.startsWith('data:')) {
      const match = mediaUrl.match(/^data:([^;]+);base64,(.+)$/s);
      if (match) {
        mimeType = match[1];
        buffer = Buffer.from(match[2], 'base64');
      }
    }

    // Fallback to 1px PNG only for IMAGE format if media download fails
    if (!buffer || buffer.length === 0) {
      if (format === 'IMAGE') {
        buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        mimeType = 'image/png';
      } else {
        console.warn(`[create-meta-template] No media data for ${format} header`);
        return null;
      }
    }

    console.log(`[create-meta-template] Uploading ${format} header (${buffer.length} bytes, ${mimeType})...`);

    // Step 1: Initialize upload session
    const initRes = await fetch(`https://graph.facebook.com/v20.0/${APP_ID}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(mimeType)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WA_TOKEN}` },
    });
    const initData = await initRes.json();
    if (!initData.id) {
      console.warn('[create-meta-template] Upload session init failed:', initData);
      return null;
    }

    // Step 2: Upload file bytes
    const uploadRes = await fetch(`https://graph.facebook.com/v20.0/${initData.id}`, {
      method: 'POST',
      headers: {
        'Authorization': `OAuth ${WA_TOKEN}`,
        'file_offset': '0',
        'Content-Type': mimeType,
      },
      body: buffer,
    });
    const uploadData = await uploadRes.json();
    if (uploadData.h) {
      console.log(`[create-meta-template] ✅ ${format} header handle obtained: ${uploadData.h.substring(0, 30)}...`);
      return uploadData.h;
    }
    console.warn('[create-meta-template] Resumable upload failed:', uploadData);
    return null;
  } catch (err) {
    console.warn(`[create-meta-template] getHeaderHandle(${format}) error:`, err.message);
    return null;
  }
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  try {
    const {
      name,
      category = 'MARKETING',
      language = 'en',
      headerType = 'NONE', // 'NONE' | 'IMAGE' | 'TEXT' | 'DOCUMENT'
      headerText = '',
      headerMediaUrl = null,
      bodyText = '',
      footerText = 'Sobhainfra Tech Private Limited',
      buttons = [], // [{ text: 'Get Brochure', type: 'QUICK_REPLY' }]
    } = JSON.parse(event.body || '{}');

    if (!bodyText || !bodyText.trim()) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: 'Body message text is required' }),
      };
    }

    // Sanitize template name: lowercase, letters, numbers, underscores only
    let cleanName = (name || `sobha_campaign_${Date.now().toString().slice(-6)}`)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    if (!cleanName) {
      cleanName = `sobha_campaign_${Date.now().toString().slice(-6)}`;
    }

    const components = [];

    // 1. Header Component — supports IMAGE, DOCUMENT (PDF), and VIDEO
    if (headerType === 'IMAGE' || headerType === 'DOCUMENT' || headerType === 'VIDEO') {
      const handle = await getHeaderHandle(headerMediaUrl, headerType);
      if (handle) {
        components.push({
          type: 'HEADER',
          format: headerType, // 'IMAGE', 'DOCUMENT', or 'VIDEO'
          example: { header_handle: [handle] },
        });
      } else if (headerType === 'IMAGE') {
        // Fallback to text header only if IMAGE handle couldn't be generated
        components.push({
          type: 'HEADER',
          format: 'TEXT',
          text: headerText || 'Sobhainfra Tech',
        });
      } else {
        console.warn(`[create-meta-template] ${headerType} header handle failed — skipping header`);
      }
    } else if (headerType === 'TEXT' && headerText && headerText.trim()) {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: headerText.trim(),
      });
    }

    // 2. Body Component & Parameter Examples
    const cleanBody = bodyText.trim();
    const varMatches = cleanBody.match(/\{\{\d+\}\}/g);
    let bodyComponent = {
      type: 'BODY',
      text: cleanBody,
    };

    if (varMatches && varMatches.length > 0) {
      // Provide sample values for each variable so Meta review passes
      const sampleValues = varMatches.map((_, i) => (i === 0 ? 'Valued Client' : (i === 1 ? 'Sobhainfra Tech' : 'Update')));
      bodyComponent.example = {
        body_text: [sampleValues],
      };
    }
    components.push(bodyComponent);

    // 3. Footer Component
    if (footerText && footerText.trim()) {
      components.push({
        type: 'FOOTER',
        text: footerText.trim(),
      });
    }

    // 4. Buttons Component (Max 3 Quick Reply Buttons per Meta spec)
    if (Array.isArray(buttons) && buttons.length > 0) {
      const validButtons = buttons.slice(0, 3).map((b, idx) => {
        const title = typeof b === 'string' ? b : (b.text || b.title || `Option ${idx + 1}`);
        return {
          type: 'QUICK_REPLY',
          text: String(title).slice(0, 25).trim(),
        };
      });

      if (validButtons.length > 0) {
        components.push({
          type: 'BUTTONS',
          buttons: validButtons,
        });
      }
    }

    const metaPayload = {
      name: cleanName,
      category: category.toUpperCase(),
      language: language || 'en',
      components,
    };

    console.log(`[create-meta-template] Submitting template "${cleanName}" to Meta WABA ${WABA_ID}...`);

    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${WABA_ID}/message_templates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metaPayload),
    });

    const metaData = await metaRes.json();

    if (metaData.error) {
      console.error('[create-meta-template] Meta API error:', JSON.stringify(metaData.error));
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({
          error: metaData.error.message || 'Meta rejected template creation',
          details: metaData.error,
        }),
      };
    }

    console.log(`[create-meta-template] Successfully created template "${cleanName}" on Meta: ID ${metaData.id}, Status: ${metaData.status}`);

    // Upsert into Supabase whatsapp_templates table
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        // Check if row with this name already exists
        const { data: existing } = await supabase
          .from('whatsapp_templates')
          .select('id')
          .eq('name', cleanName)
          .maybeSingle();

        const templateRow = {
          organization_id: DEFAULT_ORG_ID,
          provider_template_id: metaData.id,
          name: cleanName,
          language: language || 'en',
          category: category.toUpperCase(),
          status: metaData.status || 'PENDING',
          body_text: cleanBody,
          components_json: components,
          campaign_eligible: true,
          last_synced_at: new Date().toISOString(),
        };

        if (existing?.id) {
          await supabase.from('whatsapp_templates').update(templateRow).eq('id', existing.id);
        } else {
          await supabase.from('whatsapp_templates').insert([templateRow]);
        }
      } catch (dbErr) {
        console.warn('[create-meta-template] DB persistence warning:', dbErr.message);
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        templateId: metaData.id,
        status: metaData.status || 'PENDING',
        name: cleanName,
        category: metaData.category || category.toUpperCase(),
        message: `Template "${cleanName}" submitted to Meta successfully! Status: ${metaData.status || 'PENDING'}`,
      }),
    };
  } catch (err) {
    console.error('[create-meta-template] Server error:', err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
};
