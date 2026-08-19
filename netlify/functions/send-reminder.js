/**
 * Payment Reminder Sender — Netlify Function
 * URL: POST /.netlify/functions/send-reminder
 *
 * Called either manually (from Payments page) or automatically by scheduled-automations.
 * Sends WhatsApp payment reminder to overdue invoices.
 *
 * Manual body: { invoiceId }
 * Auto (no body): scans ALL overdue invoices and sends reminders
 *
 * Production fixes:
 *  - Null check for WA_TOKEN / PHONE_ID (graceful degradation)
 *  - organization_id added to payment_reminders inserts
 *  - Fixed activity_feed → activities table reference
 *  - Business event logging for automation engine
 */

const { createClient } = require('@supabase/supabase-js');

const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const PHONE_ID     = process.env.WHATSAPP_PHONE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

const fmtAmount = (n) => '₹' + Number(n).toLocaleString('en-IN');

const REMINDER_TEMPLATE = (inv) =>
`Dear ${inv.client_name},

This is a gentle reminder that your payment of *${fmtAmount(inv.amount)}* (Invoice: ${inv.tally_voucher_number || inv.invoice_number || 'N/A'}) is ${inv.status === 'Overdue' ? 'overdue' : 'due soon'}.

Please clear the amount at your earliest convenience.

For any queries, please contact us:
📞 Our Sales Team
🏢 Business Hours: Mon–Sat, 10AM–7PM

Thank you for your cooperation! 🙏`;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('placeholder')) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

async function sendMessage(to, text) {
  if (!WA_TOKEN || !PHONE_ID) {
    console.log('[Send Reminder] Simulated send (no WA credentials):', to);
    return { success: true, messageId: 'mock-wamid-' + Date.now(), simulated: true };
  }
  try {
    const phone = to.replace(/\s+/g, '').replace(/^\+/, '');
    const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text },
      }),
    });
    const data = await res.json();
    return { success: !data.error, messageId: data.messages?.[0]?.id, error: data.error?.message };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const supabase = getSupabase();
    if (!supabase) {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ success: false, error: 'Supabase not configured' }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};

    let invoices = [];

    if (body.invoiceId) {
      // Single invoice reminder (manual trigger from UI)
      const { data } = await supabase.from('invoices').select('*').eq('id', body.invoiceId).single();
      if (data) invoices = [data];
    } else {
      // Auto: find all overdue invoices that haven't been reminded recently (>3 days)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const { data } = await supabase
        .from('invoices')
        .select('*')
        .in('status', ['Overdue', 'Pending'])
        .not('client_phone', 'is', null);

      // Filter out recently reminded invoices
      invoices = (data || []).filter(inv => {
        if (!inv.last_reminder_at) return true;
        return new Date(inv.last_reminder_at) < threeDaysAgo;
      });
    }

    const results = { total: invoices.length, sent: 0, failed: 0, skipped: 0 };

    for (const inv of invoices) {
      if (!inv.client_phone) {
        results.skipped++;
        continue;
      }

      const message = REMINDER_TEMPLATE(inv);
      const result = await sendMessage(inv.client_phone, message);

      if (result.success) {
        results.sent++;

        // Update reminder count + last reminder timestamp
        await supabase.from('invoices').update({
          reminder_count: (inv.reminder_count || 0) + 1,
          last_reminder_at: new Date().toISOString(),
        }).eq('id', inv.id);

        // Log to payment_reminders
        try {
          const { error: prErr } = await supabase.from('payment_reminders').insert([{
            invoice_id: inv.id,
            channel: 'WhatsApp',
            message,
            status: result.simulated ? 'simulated' : 'sent',
          }]);
          if (prErr) {
            await supabase.from('payment_reminders').insert([{
              organization_id: DEFAULT_ORG_ID,
              invoice_id: inv.id,
              channel: 'WhatsApp',
              message,
              status: result.simulated ? 'simulated' : 'sent',
            }]);
          }
        } catch {}

        // Log to activities table (not activity_feed which doesn't exist)
        try {
          await supabase.from('activities').insert([{
            organization_id: inv.organization_id || DEFAULT_ORG_ID,
            activity_type: 'note',
            title: `Payment reminder sent to ${inv.client_name}`,
            content: `${fmtAmount(inv.amount)} — ${inv.tally_voucher_number || 'N/A'}`,
            metadata: {
              type: 'payment_reminder',
              invoice_id: inv.id,
              amount: inv.amount,
              icon_color: '#f59e0b',
            },
          }]);
        } catch {}

        // Log business event for automation engine
        try {
          await supabase.from('business_events').insert([{
            organization_id: inv.organization_id || DEFAULT_ORG_ID,
            event_type: 'payment.reminder_sent',
            entity_type: 'invoice',
            entity_id: inv.id,
            actor_type: 'system',
            payload: {
              client_name: inv.client_name,
              amount: inv.amount,
              reminder_count: (inv.reminder_count || 0) + 1,
            },
          }]);
        } catch {}
      } else {
        results.failed++;
        console.warn(`Failed to send to ${inv.client_phone}: ${result.error}`);
      }

      // Rate limiting delay between messages
      await new Promise(r => setTimeout(r, 200));
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, results }),
    };
  } catch (err) {
    console.error('Reminder error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
