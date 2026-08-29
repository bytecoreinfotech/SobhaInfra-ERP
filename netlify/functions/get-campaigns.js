/**
 * WhatsApp Campaign History Proxy — Netlify Function
 * URL: GET  /.netlify/functions/get-campaigns        → returns all wa_campaigns (sorted newest first)
 *
 * Uses the SERVICE ROLE key to bypass RLS so campaign records are always visible.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcgmppnvnwnilioapbli.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3MTk4MiwiZXhwIjoyMTAzMTQ3OTgyfQ.iMVtS3kZ5jkXd7wOsgviN_3Umz0Auw7vBa0NDlD9rKg';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache, no-store',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('placeholder')) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ campaigns: [] }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: campaigns, error } = await supabase
      .from('wa_campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[get-campaigns] query error:', error.message);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ campaigns: [] }) };
    }

    // Get live read message count from whatsapp_messages
    const { count: liveReadCount } = await supabase
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .eq('status', 'read');

    // Get live inbound customer reply count from whatsapp_messages
    const { count: liveReplyCount } = await supabase
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .eq('sender_type', 'customer');

    const enriched = (campaigns || []).map((c, idx) => {
      const sent = c.total_sent || 1;
      const read = Number(c.total_read || c.read_count || 0) || (idx === 0 && liveReadCount ? Math.min(liveReadCount, sent) : 0);
      const replied = Number(c.total_replied || c.replied || 0) || (idx === 0 && liveReplyCount ? Math.min(liveReplyCount, sent) : 0);
      return {
        ...c,
        total_read: read,
        read_count: read,
        total_replied: replied,
        replied: replied,
      };
    });

    return { statusCode: 200, headers: cors, body: JSON.stringify({ campaigns: enriched }) };
  } catch (err) {
    console.error('[get-campaigns] Fatal error:', err.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ campaigns: [] }) };
  }
};

