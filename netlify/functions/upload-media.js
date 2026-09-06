/**
 * Server-Side Media Upload Function — Netlify Function
 * URL: POST /.netlify/functions/upload-media
 *
 * Bypasses Supabase client-side storage RLS using the service-role key.
 * Converts base64 file payloads to Buffers, uploads to 'whatsapp-media' bucket,
 * and returns public, permanent HTTPS URLs required by Meta WhatsApp Cloud API.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcgmppnvnwnilioapbli.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3MTk4MiwiZXhwIjoyMTAzMTQ3OTgyfQ.iMVtS3kZ5jkXd7wOsgviN_3Umz0Auw7vBa0NDlD9rKg';

const BUCKET = 'whatsapp-media';

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      fileData,      // Base64 string or data URL (data:image/png;base64,...)
      fileName = 'upload.jpg',
      contentType,
      folder = 'campaigns',
    } = body;

    if (!fileData) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ success: false, error: 'No fileData provided' }),
      };
    }

    const lowerName = String(fileName || '').toLowerCase();
    const ext = lowerName.split('.').pop().toLowerCase();

    // Extract raw base64 and inferred MIME type
    let rawBase64 = fileData;
    let mimeType = contentType;

    if (fileData.startsWith('data:')) {
      const match = fileData.match(/^data:([^;]+);base64,(.+)$/s);
      if (match) {
        mimeType = mimeType || match[1];
        rawBase64 = match[2];
      } else {
        // Handle malformed data URL
        const commaIdx = fileData.indexOf(',');
        if (commaIdx !== -1) {
          rawBase64 = fileData.slice(commaIdx + 1);
        }
      }
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.length === 0) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ success: false, error: 'Failed to decode base64 file data' }),
      };
    }

    // Determine mediaType
    let mediaType = 'image';
    if (mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      mediaType = 'image';
      mimeType = mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    } else if (mimeType?.startsWith('video/') || ['mp4', 'mov', 'avi'].includes(ext)) {
      mediaType = 'video';
      mimeType = mimeType || 'video/mp4';
    } else if (mimeType?.startsWith('audio/') || ['mp3', 'ogg', 'wav', 'm4a'].includes(ext)) {
      mediaType = 'audio';
      mimeType = mimeType || 'audio/mpeg';
    } else {
      mediaType = 'document';
      mimeType = mimeType || 'application/pdf';
    }

    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${folder}/${Date.now()}_${safeName}`;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadErr) {
      console.error('[Upload Media] Supabase storage error:', uploadErr);
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ success: false, error: uploadErr.message || 'Storage upload failed' }),
      };
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(uploadData.path || path);
    const publicUrl = urlData?.publicUrl;

    if (!publicUrl || !publicUrl.startsWith('http')) {
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ success: false, error: 'Failed to obtain public URL' }),
      };
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        publicUrl,
        mediaType,
        fileName: safeName,
        path: uploadData.path || path,
      }),
    };
  } catch (err) {
    console.error('[Upload Media Handler] Exception:', err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message || 'Internal upload error' }),
    };
  }
};
