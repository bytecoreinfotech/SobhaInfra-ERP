/**
 * Campaign Sender — Netlify Function
 * Called by the React frontend when user clicks "Launch Campaign"
 * URL: POST /.netlify/functions/send-campaign
 *
 * Body: { campaignId, templateText, audienceFilter }
 * - Fetches leads from Supabase matching the filter
 * - Sends WhatsApp text message to each lead
 * - Updates campaign stats in wa_campaigns table
 */

const { createClient } = require('@supabase/supabase-js');

const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const PHONE_ID     = process.env.WHATSAPP_PHONE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

async function sendMessage(to, text) {
  const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  const data = await res.json();
  return { success: !data.error, messageId: data.messages?.[0]?.id, error: data.error?.message };
}

function personalizeMessage(template, lead) {
  return template
    .replace(/{name}/g, lead.name || 'Valued Customer')
    .replace(/{property}/g, lead.property_interest || 'our properties')
    .replace(/{budget}/g, lead.budget || '');
}

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };
  }

  try {
    const { campaignId, templateText, statusFilter } = JSON.parse(event.body || '{}');

    if (!templateText) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'templateText is required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Fetch leads matching filter
    let query = supabase.from('leads').select('*').not('phone', 'is', null);
    if (statusFilter && statusFilter !== 'All') {
      query = query.eq('status', statusFilter);
    }
    const { data: leads, error: leadsError } = await query;
    if (leadsError) throw new Error(leadsError.message);

    const results = { total: leads.length, sent: 0, failed: 0, failedNumbers: [] };

    // Send to each lead (with 200ms delay between messages to avoid rate limiting)
    for (const lead of leads) {
      if (!lead.phone) continue;

      // Clean phone: ensure it starts with country code, no spaces
      const phone = lead.phone.replace(/\s+/g, '').replace(/^\+/, '');
      const message = personalizeMessage(templateText, lead);

      const result = await sendMessage(phone, message);

      if (result.success) {
        results.sent++;
        // Log to wa_messages table
        await supabase.from('wa_messages').insert([{
          lead_id: lead.id,
          direction: 'outbound',
          message,
          status: 'sent',
          wa_message_id: result.messageId,
        }]);
      } else {
        results.failed++;
        results.failedNumbers.push(phone);
        console.warn(`Failed to send to ${phone}: ${result.error}`);
      }

      // 200ms delay between messages
      await new Promise(r => setTimeout(r, 200));
    }

    // Update campaign record with actual stats
    if (campaignId) {
      await supabase.from('wa_campaigns').update({
        status: 'Completed',
        total_sent: results.sent,
        delivered: results.sent,
      }).eq('id', campaignId);
    }

    // Log to activity feed
    await supabase.from('activity_feed').insert([{
      type: 'whatsapp',
      title: `Campaign sent to ${results.sent} contacts`,
      subtitle: `${results.failed} failed. Powered by Meta Cloud API.`,
      icon_color: '#6366f1',
    }]);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, results }),
    };
  } catch (err) {
    console.error('Campaign sender error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
