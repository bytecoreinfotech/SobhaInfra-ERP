/**
 * Payment Reminder Sender — Netlify Function (v2.0 with PDF Invoice)
 * URL: POST /.netlify/functions/send-reminder
 *
 * Manual body: { invoiceId }
 * Auto (no body): scans ALL overdue invoices and sends reminders
 *
 * Now uses PDF invoice URLs stored in Supabase and attaches them as 
 * a document in the WhatsApp reminder message.
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

// ── Env vars with hardcoded Supabase fallback ─────────────────────────────────
const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const PHONE_ID     = process.env.WHATSAPP_PHONE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jbgkeeubevwopphekwfj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB';
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

const fmtAmount = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtDate   = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ── WhatsApp API helpers ──────────────────────────────────────────────────────

async function sendTextMessage(to, text) {
  if (!WA_TOKEN || !PHONE_ID) {
    return { success: true, messageId: 'mock-' + Date.now(), simulated: true };
  }
  try {
    const phone = to.replace(/\s+/g, '').replace(/^\+/, '');
    const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
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

async function sendDocumentMessage(to, documentUrl, fileName, caption) {
  if (!WA_TOKEN || !PHONE_ID) {
    return { success: true, messageId: 'mock-doc-' + Date.now(), simulated: true };
  }
  try {
    const phone = to.replace(/\s+/g, '').replace(/^\+/, '');
    const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'document',
        document: {
          link: documentUrl,
          filename: fileName,
          caption: caption || '',
        },
      }),
    });
    const data = await res.json();
    return { success: !data.error, messageId: data.messages?.[0]?.id, error: data.error?.message };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Reminder message template ─────────────────────────────────────────────────
const REMINDER_TEXT = (inv) =>
`Dear ${inv.client_name || 'Valued Customer'},

This is a payment reminder for Invoice *${inv.tally_voucher_number || inv.invoice_number || 'N/A'}*.

💰 *Amount Due: ${fmtAmount(inv.amount)}*
📅 Due Date: ${fmtDate(inv.due_date)}
📌 Status: ${inv.status || 'Pending'}

Please clear the outstanding amount at your earliest convenience.
📞 Contact us: Mon–Sat, 10AM–7PM

Thank you! 🙏
_ERPPro Automation_`;

// ── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const supabase = getSupabase();
    const body = event.body ? JSON.parse(event.body) : {};

    let invoices = [];

    if (body.invoiceId) {
      // Single invoice reminder (manual trigger from UI)
      const { data } = await supabase.from('invoices').select('*').eq('id', body.invoiceId).single();
      if (data) invoices = [data];
    } else {
      // Auto: find all overdue/pending invoices not reminded in last 3 days
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const { data } = await supabase
        .from('invoices')
        .select('*')
        .in('status', ['Overdue', 'Pending'])
        .not('client_phone', 'is', null);

      invoices = (data || []).filter(inv => {
        if (!inv.last_reminder_at) return true;
        return new Date(inv.last_reminder_at) < threeDaysAgo;
      });
    }

    const results = { total: invoices.length, sent: 0, failed: 0, skipped: 0 };

    for (const inv of invoices) {
      if (!inv.client_phone) { results.skipped++; continue; }

      const message = REMINDER_TEXT(inv);

      // Generate and upload invoice SVG to Supabase Storage
      const invoiceImageUrl = await uploadInvoice(supabase, inv);

      let result;
      // Use real Tally invoice PDF from Supabase Storage (generated by tally-sync.py)
      if (inv.pdf_url) {
        const pdfFileName = `Invoice_${inv.invoice_number || inv.id}.pdf`;
        result = await sendDocumentMessage(
          inv.client_phone,
          inv.pdf_url,
          pdfFileName,
          message
        );
        // Fallback to text if document send fails
        if (!result.success) {
          console.warn('[Reminder] Document send failed, falling back to text:', result.error);
          result = await sendTextMessage(inv.client_phone, message);
        }
      } else {
        // No PDF yet — remind admin that tally-sync.py needs reportlab installed
        console.log(`[Reminder] No pdf_url for invoice ${inv.invoice_number}. Sending text only.`);
        console.log(`[Reminder] Fix: Run 'pip install reportlab' on the Tally PC and re-sync.`);
        result = await sendTextMessage(inv.client_phone, message);
      }

      if (result.success) {
        results.sent++;

        // Update invoice reminder tracking
        await supabase.from('invoices').update({
          reminder_count: (inv.reminder_count || 0) + 1,
          last_reminder_at: new Date().toISOString(),
        }).eq('id', inv.id);

        // Log to payment_reminders
        try {
          const prInsert = {
            invoice_id: inv.id,
            channel: 'WhatsApp',
            message,
            status: result.simulated ? 'simulated' : 'sent',
            ...(invoiceImageUrl ? { media_url: invoiceImageUrl } : {}),
          };
          const { error: prErr } = await supabase.from('payment_reminders').insert([prInsert]);
          if (prErr) {
            // Try with org_id as fallback
            await supabase.from('payment_reminders').insert([{ ...prInsert, organization_id: DEFAULT_ORG_ID }]);
          }
        } catch {}

        // Log to activities
        try {
          await supabase.from('activities').insert([{
            type: 'payment_reminder',
            description: `WhatsApp reminder sent${invoiceImageUrl ? ' with invoice PDF' : ''}: ${fmtAmount(inv.amount)} due`,
            lead_id: inv.lead_id || null,
          }]);
        } catch {}

      } else {
        results.failed++;
        console.warn('[Reminder] Failed to send to', inv.client_phone, ':', result.error);
      }
    }

    console.log('[Reminder] Results:', JSON.stringify(results));
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, results }),
    };
  } catch (err) {
    console.error('[Reminder] Fatal error:', err.message);
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
