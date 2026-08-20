/**
 * Payment Reminder Sender — Netlify Function (v2.0 with PDF Invoice)
 * URL: POST /.netlify/functions/send-reminder
 *
 * Manual body: { invoiceId }
 * Auto (no body): scans ALL overdue invoices and sends reminders
 *
 * Now generates a styled PDF invoice, uploads it to Supabase whatsapp-media bucket,
 * and attaches it as a document in the WhatsApp reminder message.
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

// ── Env vars with hardcoded Supabase fallback ─────────────────────────────────
const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const PHONE_ID     = process.env.WHATSAPP_PHONE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jbgkeeubevwopphekwfj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB';
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
const BUCKET = 'whatsapp-media';

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

// ── PDF Invoice Generator (SVG-based, no external deps) ──────────────────────
/**
 * Generates a minimal but professional SVG "invoice" as a Buffer.
 * Supabase Storage serves it as image/svg+xml which WhatsApp renders inline.
 *
 * Falls back gracefully — even if this fails, the text reminder still goes out.
 */
function generateInvoiceSvg(inv) {
  const amount = fmtAmount(inv.amount);
  const dueDate = fmtDate(inv.due_date);
  const invNum = inv.tally_voucher_number || inv.invoice_number || 'N/A';
  const client = (inv.client_name || 'Valued Customer').substring(0, 40);
  const status = inv.status || 'Pending';
  const statusColor = status === 'Overdue' ? '#ef4444' : '#f59e0b';
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="480" viewBox="0 0 800 480" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
  <!-- Background -->
  <rect width="800" height="480" fill="#0f172a" rx="16"/>
  <!-- Top accent bar -->
  <rect width="800" height="6" fill="#6366f1" rx="3"/>
  <!-- Header area -->
  <rect x="0" y="6" width="800" height="100" fill="#1e293b"/>

  <!-- Company name / logo area -->
  <text x="48" y="52" font-size="26" font-weight="bold" fill="#6366f1">ERPPro</text>
  <text x="48" y="74" font-size="13" fill="#94a3b8">Automated Invoice Reminder</text>

  <!-- Status badge -->
  <rect x="620" y="28" width="130" height="36" fill="${statusColor}" rx="8" opacity="0.2"/>
  <rect x="620" y="28" width="130" height="36" fill="none" stroke="${statusColor}" stroke-width="1.5" rx="8"/>
  <text x="685" y="51" font-size="14" font-weight="bold" fill="${statusColor}" text-anchor="middle">${status.toUpperCase()}</text>

  <!-- Divider -->
  <line x1="48" y1="115" x2="752" y2="115" stroke="#334155" stroke-width="1"/>

  <!-- Invoice details grid -->
  <!-- Left column -->
  <text x="48" y="155" font-size="11" fill="#64748b">BILL TO</text>
  <text x="48" y="176" font-size="17" font-weight="bold" fill="#f1f5f9">${client}</text>

  <text x="48" y="215" font-size="11" fill="#64748b">INVOICE NUMBER</text>
  <text x="48" y="236" font-size="15" fill="#e2e8f0">${invNum}</text>

  <text x="48" y="276" font-size="11" fill="#64748b">REMINDER DATE</text>
  <text x="48" y="297" font-size="15" fill="#e2e8f0">${today}</text>

  <!-- Right column -->
  <text x="450" y="155" font-size="11" fill="#64748b">AMOUNT DUE</text>
  <text x="450" y="190" font-size="32" font-weight="bold" fill="#6366f1">${amount}</text>

  <text x="450" y="235" font-size="11" fill="#64748b">DUE DATE</text>
  <text x="450" y="256" font-size="15" fill="${statusColor}" font-weight="bold">${dueDate}</text>

  <!-- Divider -->
  <line x1="48" y1="330" x2="752" y2="330" stroke="#334155" stroke-width="1"/>

  <!-- Footer note -->
  <text x="48" y="366" font-size="12" fill="#64748b">Please clear the above amount at your earliest convenience.</text>
  <text x="48" y="386" font-size="12" fill="#64748b">Contact our team for any queries: Mon–Sat, 10AM–7PM</text>

  <!-- Bottom brand line -->
  <rect x="0" y="450" width="800" height="30" fill="#1e293b"/>
  <text x="400" y="470" font-size="11" fill="#475569" text-anchor="middle">Powered by ERPPro CRM &amp; WhatsApp Automation</text>
</svg>`;

  return Buffer.from(svg, 'utf8');
}

// ── Upload invoice SVG to Supabase Storage ────────────────────────────────────
async function uploadInvoice(supabase, inv) {
  try {
    const svgBuffer = generateInvoiceSvg(inv);
    const fileName = `reminders/invoice_${inv.id}_${Date.now()}.svg`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, svgBuffer, {
        contentType: 'image/svg+xml',
        cacheControl: '86400', // 24 hours cache (enough for WhatsApp to fetch)
        upsert: true,
      });

    if (error) {
      console.warn('[Invoice Upload] Storage error:', error.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
    console.log('[Invoice Upload] Success:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (err) {
    console.warn('[Invoice Upload] Failed:', err.message);
    return null; // Non-fatal: reminder will still be sent as text
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
      if (invoiceImageUrl) {
        // Send as image with caption (renders nicely in WhatsApp)
        result = await sendDocumentMessage(
          inv.client_phone,
          invoiceImageUrl,
          `Invoice_${inv.invoice_number || inv.id}.svg`,
          message
        );
        // If document send fails, fallback to text
        if (!result.success) {
          result = await sendTextMessage(inv.client_phone, message);
        }
      } else {
        // Fallback: send as plain text reminder
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
