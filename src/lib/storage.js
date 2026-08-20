/**
 * Supabase Storage — whatsapp-media bucket utility
 * Bucket: whatsapp-media (public, created in Supabase Dashboard)
 *
 * Usage:
 *   import { uploadToWhatsAppMedia, getPublicUrl, cleanOldMedia } from './storage';
 *   const url = await uploadToWhatsAppMedia(file, 'campaigns');
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
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
  const supabase = getClient();

  // Build unique path: folder/timestamp_filename
  const ext = file.name.split('.').pop().toLowerCase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${folder}/${Date.now()}_${safeName}`;

  // Validate file type
  const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'mp4', 'mp3', 'ogg', 'wav', 'doc', 'docx'];
  if (!allowed.includes(ext)) {
    throw new Error(`File type ".${ext}" is not allowed. Supported: images, PDF, video, audio, documents.`);
  }

  // Validate file size (max 15 MB per WhatsApp limit)
  const MAX_BYTES = 15 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 15 MB.`);
  }

  if (onProgress) onProgress(10);

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });

  if (error) throw new Error('Upload failed: ' + error.message);

  if (onProgress) onProgress(90);

  // Get public URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);

  if (onProgress) onProgress(100);

  return urlData.publicUrl;
}

/**
 * Get media type category from a File object for WhatsApp API
 * Returns: 'image' | 'document' | 'video' | 'audio'
 */
export function getWhatsAppMediaType(file) {
  const type = file.type || '';
  const ext = file.name.split('.').pop().toLowerCase();

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
    // Extract path from URL: ...storage/v1/object/public/whatsapp-media/PATH
    const match = publicUrl.match(/whatsapp-media\/(.+)$/);
    if (!match) return;
    await supabase.storage.from(BUCKET).remove([match[1]]);
  } catch {
    // Non-critical cleanup failure
  }
}
