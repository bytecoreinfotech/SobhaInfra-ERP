/**
 * Payment Reminder Sender — Netlify Function
 * URL: POST /.netlify/functions/send-reminder
 *
 * Called either manually (from Payments page) or automatically by a cron job.
 * Sends WhatsApp payment reminder to overdue invoices.
 *
 * Manual body: { invoiceId }
 * Auto (no body): scans ALL overdue invoices and sends reminders
 */

const { createClient } = require('@supabase/supabase-js');

const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const PHONE_ID     = process.env.WHATSAPP_PHONE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const fmtAmount = (n) => '₹' + Number(n).toLocaleString('en-IN');

const REMINDER_TEMPLATE = (inv) =>
`Dear ${inv.client_name},

This is a gentle reminder that your payment of *${fmtAmount(inv.amount)}* (Invoice: ${inv.invoice_number}) is ${inv.status === 'Overdue' ? 'overdue' : 'due soon'}.

Please clear the amount at your earliest convenience to avoid any disruption to your property transaction.

For any queries, please contact us:
📞 +91 98765 43210
🏢 Business Hours: Mon–Sat, 10AM–7PM

Thank you for your cooperation! 🙏`;

async function sendMessage(to, text) {
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
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const body = event.body ? JSON.parse(event.body) : {};

    let invoices = [];

    if (body.invoiceId) {
      // Single invoice reminder (manual trigger from UI)
      const { data } = await supabase.from('invoices').select('*').eq('id', body.invoiceId).single();
      if (data) invoices = [data];
    } else {
      // Auto: find all overdue invoices
      const { data } = await supabase
        .from('invoices')
        .select('*')
        .in('status', ['Overdue', 'Pending'])
        .not('client_phone', 'is', null);
      invoices = data || [];
    }

    const results = { total: invoices.length, sent: 0, failed: 0 };

    for (const inv of invoices) {
      if (!inv.client_phone) continue;

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
        await supabase.from('payment_reminders').insert([{
          invoice_id: inv.id,
          channel: 'WhatsApp',
          message,
          status: 'sent',
        }]);

        // Log to activity feed
        await supabase.from('activity_feed').insert([{
          type: 'payment',
          title: `Payment reminder sent to ${inv.client_name}`,
          subtitle: `${fmtAmount(inv.amount)} — ${inv.invoice_number}`,
          icon_color: '#f59e0b',
        }]);
      } else {
        results.failed++;
        console.warn(`Failed to send to ${inv.client_phone}: ${result.error}`);
      }

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
