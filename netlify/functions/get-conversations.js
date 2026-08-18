/**
 * Live WhatsApp Conversations & Messages Proxy — Netlify Function
 * URL: GET  /.netlify/functions/get-conversations        → returns all conversations (sorted newest first)
 * URL: GET  /.netlify/functions/get-conversations?conv_id=xxx → returns messages for that conversation
 *
 * Uses the SERVICE ROLE key to bypass RLS and always return fresh data.
 * Falls back to empty arrays if Supabase tables don't exist yet.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_ANON_KEY;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache, no-store',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    let supabase = null;
    if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('placeholder')) {
      supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    if (!supabase) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ conversations: [], messages: [] }) };
    }

    const convId = event.queryStringParameters?.conv_id;
    const loadKb = event.queryStringParameters?.kb === '1';

    if (loadKb) {
      const { data: kb, error } = await supabase
        .from('ai_knowledge')
        .select('*')
        .eq('status', 'active')
        .order('category', { ascending: true });
      if (error) {
        console.warn('[get-conversations] kb query error:', error.message);
        return { statusCode: 200, headers: cors, body: JSON.stringify({ kb: [] }) };
      }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ kb: kb || [] }) };
    }


    if (convId) {
      // Return messages for a specific conversation
      const { data: messages, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('[get-conversations] messages query error:', error.message);
        return { statusCode: 200, headers: cors, body: JSON.stringify({ messages: [] }) };
      }

      return { statusCode: 200, headers: cors, body: JSON.stringify({ messages: messages || [] }) };
    } else {
      // Return all conversations sorted by most recent message
      const { data: conversations, error } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) {
        console.warn('[get-conversations] conversations query error:', error.message);
        return { statusCode: 200, headers: cors, body: JSON.stringify({ conversations: [] }) };
      }

      return { statusCode: 200, headers: cors, body: JSON.stringify({ conversations: conversations || [] }) };
    }
  } catch (err) {
    console.error('[get-conversations] Fatal error:', err.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ conversations: [], messages: [] }) };
  }
};
