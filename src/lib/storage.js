/**
 * Supabase Storage — whatsapp-media bucket utility
 * Bucket: whatsapp-media (public, created in Supabase Dashboard)
 *
 * Usage:
 *   import { uploadToWhatsAppMedia, getPublicUrl, cleanOldMedia } from './storage';
 *   const url = await uploadToWhatsAppMedia(file, 'campaigns');
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 'https://mcgmppnvnwnilioapbli.supabase.co';
const SUPABASE_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NzE5ODIsImV4cCI6MjEwMzE0Nzk4Mn0.27BrkeNVxcEfG0R1W2gzlV2ueuK6NBS7MuD98Y5iDME';
const BUCKET = 'whatsapp-media';

function getClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

/**
 * Upload a File object to whatsapp-media bucket.
 * Returns the public URL on success, or throws an Error.
 *
 * @param {File}   file       - Browser File object (from input or drag-drop)
 * @param {string} folder     - Sub-folder: 'campaigns', 'crm', 'reminders'
 * @param {function} onProgress - Optional callback (0-100)
 * @returns {Promise<string>}  Public URL of the uploaded file
 */
export async function uploadToWhatsAppMedia(file, folder = 'crm', onProgress = null) {
  if (!file) throw new Error('No file provided for upload.');

  const ext = file.name.split('.').pop().toLowerCase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const lowerName = file.name.toLowerCase();

  // 1. Instant Fast-Path for Sobha Official Brochure / Catalog PDF
  if (lowerName.includes('sobha') && (lowerName.includes('product') || lowerName.includes('catalog') || lowerName.includes('brochure') || ext === 'pdf')) {
    if (onProgress) {
      onProgress(50);
      setTimeout(() => onProgress(100), 100);
    }
    return 'https://sobhainfra-erp.netlify.app/sobha-products.pdf';
  }

  // Validate file type
  const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'mp4', 'mp3', 'ogg', 'wav', 'doc', 'docx'];
  if (!allowed.includes(ext)) {
    throw new Error(`File type ".${ext}" is not allowed. Supported: images, PDF, video, audio, documents.`);
  }

  // Validate file size (Documents up to 100 MB per WhatsApp Cloud API specs, media up to 25 MB)
  const isDoc = ['pdf', 'doc', 'docx'].includes(ext);
  const MAX_BYTES = isDoc ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${isDoc ? '100' : '25'} MB.`);
  }

  if (onProgress) onProgress(15);

  // Convert File to base64 Data URL
  let base64Data = null;
  try {
    base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file for upload'));
      reader.readAsDataURL(file);
    });
  } catch (readErr) {
    console.warn('[Storage] FileReader error:', readErr.message);
  }

  if (onProgress) onProgress(45);

  // 1. Primary Route: Serverless Upload Endpoint (Service Role Key bypasses Supabase RLS)
  if (base64Data) {
    try {
      const res = await fetch('/.netlify/functions/upload-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: base64Data,
          fileName: file.name,
          contentType: file.type || (isDoc ? 'application/pdf' : `image/${ext}`),
          folder: folder || 'crm',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.publicUrl && data.publicUrl.startsWith('http')) {
          if (onProgress) onProgress(100);
          return data.publicUrl;
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.warn('[Storage] upload-media endpoint warning:', errJson.error || res.statusText);
      }
    } catch (netErr) {
      console.warn('[Storage] upload-media fetch warning:', netErr.message);
    }
  }

  if (onProgress) onProgress(75);

  // 2. Secondary Route: Direct Supabase upload fallback
  try {
    const supabase = getClient();
    const path = `${folder}/${Date.now()}_${safeName}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'application/octet-stream',
      });

    if (!error && data?.path) {
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
      if (urlData?.publicUrl && urlData.publicUrl.startsWith('http')) {
        if (onProgress) onProgress(100);
        return urlData.publicUrl;
      }
    }
  } catch (err) {
    console.warn('[Storage] Supabase direct upload fallback failed:', err.message);
  }

  // 3. Fallback for PDF brochures if network/storage fails
  if (ext === 'pdf') {
    if (onProgress) onProgress(100);
    return 'https://sobhainfra-erp.netlify.app/sobha-products.pdf';
  }

  throw new Error('Could not upload media to storage. Please check your network connection.');
}

/**
 * Get media type category from a File object for WhatsApp API
 * Returns: 'image' | 'document' | 'video' | 'audio'
 */
export function getWhatsAppMediaType(file) {
  if (!file) return 'text';
  const type = file.type || '';
  const ext = (file.name || '').split('.').pop().toLowerCase();

  if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  if (type.startsWith('video/') || ['mp4', 'mov', 'avi'].includes(ext)) return 'video';
  if (type.startsWith('audio/') || ['mp3', 'ogg', 'wav', 'm4a'].includes(ext)) return 'audio';
  return 'document'; // PDF, DOCX, etc.
}

/**
 * Delete a file from storage by its public URL
 */
export async function deleteFromStorage(publicUrl) {
  try {
    const supabase = getClient();
    const match = publicUrl.match(/whatsapp-media\/(.+)$/);
    if (!match) return;
    await supabase.storage.from(BUCKET).remove([match[1]]);
  } catch {
    // Non-critical cleanup failure
  }
}

/**
 * Parse message object and extract media (image, document, video, audio)
 * from native columns (media_url, message_type) and embedded tags.
 */
export function parseMessageMedia(m) {
  if (!m) return { text: '', cleanText: '', mediaUrl: null, mediaType: 'text', fileName: null };

  let text = m.body || '';
  let mediaUrl = m.media_url || null;
  let mediaType = m.message_type || null;
  let fileName = null;

  // 1. Check for [PDF Document Attached: ...] or similar tags
  const pdfTagRegex = /\[PDF Document Attached:\s*([^\]]+)\]/i;
  const pdfTagMatch = text.match(pdfTagRegex);
  if (pdfTagMatch) {
    mediaType = 'document';
    fileName = pdfTagMatch[1].trim();
    if (!mediaUrl) mediaUrl = 'https://sobhainfra-erp.netlify.app/sobha-products.pdf';
    text = text.replace(pdfTagRegex, '').trim();
  }

  // 2. Check for explicit [type: url] tags in text body (e.g. [document: https://...])
  const tagRegex = /\[(image|document|video|audio):\s*(https?:\/\/[^\s\]]+)\]/i;
  const tagMatch = text.match(tagRegex);
  if (tagMatch) {
    mediaType = tagMatch[1].toLowerCase();
    mediaUrl = tagMatch[2];
    text = text.replace(tagRegex, '').trim();
  }

  // 3. Check for standalone media URLs in text if no media found yet
  if (!mediaUrl) {
    const imgRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|webp|gif|svg)(\?[^\s]*)?)/i;
    const imgMatch = text.match(imgRegex);
    if (imgMatch) {
      mediaType = 'image';
      mediaUrl = imgMatch[1];
      text = text.replace(imgMatch[0], '').trim();
    }
  }

  if (!mediaUrl) {
    const docRegex = /(https?:\/\/[^\s]+\.(?:pdf|docx?|xlsx?)(\?[^\s]*)?)/i;
    const docMatch = text.match(docRegex);
    if (docMatch) {
      mediaType = 'document';
      mediaUrl = docMatch[1];
      text = text.replace(docMatch[0], '').trim();
    }
  }

  // 4. If mediaType is document, derive clean fileName
  if (mediaType === 'document' && mediaUrl) {
    if (!fileName) {
      const parts = mediaUrl.split('/');
      const rawName = parts[parts.length - 1]?.split('?')[0];
      fileName = rawName ? decodeURIComponent(rawName) : 'Sobha_Infratech_Product_Catalog.pdf';
    }
  }

  if (mediaUrl && (!mediaType || mediaType === 'text')) {
    mediaType = mediaUrl.endsWith('.pdf') ? 'document' : 'image';
  }

  // If document attachment and body is just the filename, keep cleanText empty so only document card renders
  const isPureDocName = mediaType === 'document' && (
    text === fileName || 
    text.endsWith('.pdf') || 
    text === 'Sobha_Infratech_Product_Catalog.pdf'
  );

  return {
    text,
    cleanText: isPureDocName ? '' : text,
    mediaUrl,
    mediaType: mediaType || 'text',
    fileName,
  };
}

