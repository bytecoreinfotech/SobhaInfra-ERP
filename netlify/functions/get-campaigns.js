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

    return { statusCode: 200, headers: cors, body: JSON.stringify({ campaigns: campaigns || [] }) };
  } catch (err) {
    console.error('[get-campaigns] Fatal error:', err.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ campaigns: [] }) };
  }
};
