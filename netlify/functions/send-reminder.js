/**
 * Payment Reminder Sender — Netlify Function (v3.0 Smart Pause Engine)
 * URL: POST /.netlify/functions/send-reminder
 *
 * Manual body: { invoiceId }
 * Auto (no body): scans ALL overdue/pending invoices and sends reminders
 *
 * Smart features:
 *  - Reads reminder_interval_days from org_settings (customizable by admin)
 *  - Skips invoices where reminder_paused = true and payment_promised_date is future
 *  - Auto-resumes if payment_promised_date has passed and invoice is still unpaid
 *  - Attaches real TallyPrime PDF if available
 *  - Detects WhatsApp payment promise replies (keyword NLP) and auto-pauses
 */

const { createClient } = require('@supabase/supabase-js');

const WA_TOKEN     = process.env.WHATSAPP_TOKEN || 'EAAZAoFJNWmo4BSXS3ZBJrD7sk039yowup2fxSWYZAQFTiTvEfOm5XsRNmyRZC4RnkYyjvFaXaxN3fhqNVvvyBqe0CXwoWClgcBx6X8UhqaNWTUjNFt0XMkufGVKkF9FSOP2V2SXSwxreUpX3UALTRW8TC8feqyWyYdyyamSrkF8qWvqkuSEEkatiTGvaGZC1AYwZDZD';
const PHONE_ID     = process.env.WHATSAPP_PHONE_ID || '1213997841806162';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcgmppnvnwnilioapbli.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3MTk4MiwiZXhwIjoyMTAzMTQ3OTgyfQ.iMVtS3kZ5jkXd7wOsgviN_3Umz0Auw7vBa0NDlD9rKg';
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

const fmtAmount = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtDate   = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

// ── Read org setting ───────────────────────────────────────────────────────────
async function getOrgSetting(supabase, key, defaultValue) {
  try {
    const { data } = await supabase
      .from('org_settings')
      .select('value')
      .eq('organization_id', DEFAULT_ORG_ID)
      .eq('key', key)
      .maybeSingle();
    if (data?.value !== undefined) return data.value;
  } catch {}
  return defaultValue;
}

// ── WhatsApp API helpers ───────────────────────────────────────────────────────
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

// ── Reminder message builder ──────────────────────────────────────────────────
const REMINDER_TEXT = (inv, reminderNum) => {
  const isOverdue = inv.status === 'Overdue';
  const urgency = reminderNum >= 5 ? '⚠️ FINAL NOTICE ⚠️\n\n' : reminderNum >= 3 ? '⚡ Urgent: ' : '';
  return `${urgency}Dear ${inv.client_name || 'Valued Customer'},

This is payment reminder #${reminderNum} for Invoice *${inv.tally_voucher_number || inv.invoice_number || 'N/A'}*.

💰 *Amount Due: ${fmtAmount(inv.amount)}*
📅 Due Date: ${fmtDate(inv.due_date)}
📌 Status: *${inv.status || 'Pending'}*${isOverdue ? ' — OVERDUE' : ''}

Please clear the outstanding amount at your earliest convenience.
📞 Contact us: Mon–Sat, 10AM–7PM

💬 *Reply "paid"* if you have already made the payment.
💬 *Reply "pay in [N] days"* to pause reminders and give us your payment date.

Thank you! 🙏
_ERPPro Automation_`;
};

// ── Payment promise keyword detector ─────────────────────────────────────────
// Returns { isPromise: bool, daysFromNow: number|null, promisedDate: Date|null }
function detectPaymentPromise(text) {
  if (!text || typeof text !== 'string') return { isPromise: false };

  const t = text.toLowerCase().trim();

  // "paid" / "payment done" → mark as paid, not a promise
  if (/\b(paid|payment done|kiya|kar diya|ho gaya|cleared|settled)\b/.test(t)) {
    return { isPromise: false, isPaidConfirmation: true };
  }

  // Detect "pay in N days" / "will pay in N days" / "15 din mein"
  const daysPattern = /(?:pay|paid|payment|karunga|karugi|dunga|dungi|bharunga|kar dunga).*?(\d+)\s*(?:day|din|d\b)/i;
  const daysMatch = t.match(daysPattern) || t.match(/(\d+)\s*(?:day|din|d\b).*?(?:pay|paid|bhar)/i);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    if (days > 0 && days <= 180) {
      const promisedDate = new Date();
      promisedDate.setDate(promisedDate.getDate() + days);
      return { isPromise: true, daysFromNow: days, promisedDate };
    }
  }

  // Detect "by [date]" / "on [Nth]" / "by 25th" / "by 15 August" / "25 tarikh tak"
  const datePatterns = [
    /by (\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december))/i,
    /by (\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(?:this month|this week)/i,
    /on (\d{1,2})(?:st|nd|rd|th)/i,
    /(\d{1,2})\s*tarikh\s*(?:tak|ko|se pehle)/i,
    /(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{2,4})?/,
  ];

  for (const pattern of datePatterns) {
    const m = t.match(pattern);
    if (m) {
      // Try to parse a day number at minimum
      const dayNum = parseInt(m[1], 10);
      if (dayNum >= 1 && dayNum <= 31) {
        const now = new Date();
        const promisedDate = new Date(now.getFullYear(), now.getMonth(), dayNum);
        if (promisedDate <= now) {
          promisedDate.setMonth(promisedDate.getMonth() + 1);
        }
        const daysFromNow = Math.round((promisedDate - now) / (1000 * 60 * 60 * 24));
        return { isPromise: true, daysFromNow, promisedDate };
      }
    }
  }

  // General "will pay later" without date — snooze 7 days as a courtesy pause
  if (/(?:will pay|pay kar dunga|de dunga|bhejta hoon|thoda time|kuch time|kal|parso|next week|agle hafte|soon|jaldi|thodi der)/i.test(t)) {
    const promisedDate = new Date();
    promisedDate.setDate(promisedDate.getDate() + 7);
    return { isPromise: true, daysFromNow: 7, promisedDate, isVague: true };
  }

  return { isPromise: false };
}

// ── Should invoice be skipped (smart pause logic) ─────────────────────────────
function shouldSkipInvoice(inv, todayMs) {
  // If paused and promise date is still in the future → skip
  if (inv.reminder_paused === true || inv.reminder_paused === 'true') {
    if (inv.payment_promised_date) {
      const promisedMs = new Date(inv.payment_promised_date).getTime();
      if (promisedMs > todayMs) {
        return {
          skip: true,
          reason: `Paused — promised payment by ${fmtDate(inv.payment_promised_date)} (via ${inv.promise_committed_by || 'admin'})`
        };
      }
      // Promise date has passed — auto-resume and remind
      return { skip: false, autoResume: true };
    }
    // Paused with no date (indefinite admin pause) — still skip
    return { skip: true, reason: 'Manually paused by admin (no promise date set)' };
  }
  return { skip: false };
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const supabase = getSupabase();
    const body = event.body ? JSON.parse(event.body) : {};

    // ── Handle inbound WhatsApp message (payment promise auto-detection) ───────
    if (body.type === 'inbound_whatsapp') {
      return await handleInboundWhatsApp(supabase, body, cors);
    }

    // ── Read org-level reminder interval setting ────────────────────────────────
    const rawInterval = await getOrgSetting(supabase, 'reminder_interval_days', '3');
    const intervalDays = Math.max(1, parseInt(rawInterval, 10) || 3);
    const rawMaxReminders = await getOrgSetting(supabase, 'max_reminders_per_invoice', '7');
    const maxReminders = Math.max(1, parseInt(rawMaxReminders, 10) || 7);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - intervalDays);
    const todayMs = Date.now();

    let invoices = [];
    const isSingleManual = Boolean(body.invoiceId);
    const customText = body.customMessage && typeof body.customMessage === 'string' ? body.customMessage.trim() : null;

    if (body.invoiceId) {
      // Single invoice reminder (manual trigger from UI)
      const { data } = await supabase.from('invoices').select('*').eq('id', body.invoiceId).maybeSingle();
      if (data) {
        if (body.phone) {
          data.client_phone = body.phone;
        }
        if (body.pdfUrl) {
          data.pdf_url = body.pdfUrl;
          try {
            await supabase.from('invoices').update({ pdf_url: body.pdfUrl }).eq('id', data.id);
          } catch (err) {
            console.warn('[Reminder] Failed to cache pdf_url:', err.message);
          }
        }
        if (body.attachPdf === false) {
          data.pdf_url = null;
        }
        invoices = [data];
      }
    } else {
      // Auto: find all overdue/pending invoices
      const { data } = await supabase
        .from('invoices')
        .select('*')
        .in('status', ['Overdue', 'Pending'])
        .not('client_phone', 'is', null);

      invoices = (data || []).filter(inv => {
        // Has exceeded max reminders
        if ((inv.reminder_count || 0) >= maxReminders) return false;
        // Not yet due for reminder by interval
        if (inv.last_reminder_at && new Date(inv.last_reminder_at) > cutoffDate) return false;
        return true;
      });
    }

    const results = {
      total: invoices.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      autoResumed: 0,
      skippedDetails: [],
    };

    for (const inv of invoices) {
      if (!inv.client_phone) { results.skipped++; continue; }

      // ── Smart Pause Check (Only for automated bulk runs; single manual clicks can bypass) ─
      if (!isSingleManual) {
        const pauseCheck = shouldSkipInvoice(inv, todayMs);

        if (pauseCheck.skip) {
          results.skipped++;
          results.skippedDetails.push({ invoice: inv.invoice_number || inv.id, reason: pauseCheck.reason });
          console.log(`[Reminder] SKIPPED ${inv.invoice_number || inv.id}: ${pauseCheck.reason}`);
          continue;
        }

        // Auto-resume if promise date passed
        if (pauseCheck.autoResume) {
          results.autoResumed++;
          console.log(`[Reminder] AUTO-RESUME: ${inv.invoice_number || inv.id} — promise date passed, resuming reminders`);
          await supabase.from('invoices').update({
            reminder_paused: false,
            reminder_paused_reason: null,
            payment_promised_date: null,
            payment_promised_at: null,
            promise_committed_by: null,
            promise_notes: null,
          }).eq('id', inv.id);
        }
      }

      const reminderNum = (inv.reminder_count || 0) + 1;
      const message = customText || REMINDER_TEXT(inv, reminderNum);

      let result;
      const hasValidPdf = inv.pdf_url && typeof inv.pdf_url === 'string' && (inv.pdf_url.startsWith('http://') || inv.pdf_url.startsWith('https://'));

      if (hasValidPdf) {
        const pdfFileName = `Invoice_${inv.invoice_number || inv.id}.pdf`;
        result = await sendDocumentMessage(inv.client_phone, inv.pdf_url, pdfFileName, message);
        if (!result.success) {
          console.warn('[Reminder] Document send failed, falling back to text:', result.error);
          result = await sendTextMessage(inv.client_phone, message);
        }
      } else {
        result = await sendTextMessage(inv.client_phone, message);
      }

      if (result.success) {
        results.sent++;

        // Update invoice reminder tracking
        const updatePayload = {
          reminder_count: reminderNum,
          last_reminder_at: new Date().toISOString(),
        };
        // Auto-mark overdue if past due date
        if (inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'Overdue') {
          updatePayload.status = 'Overdue';
        }
        await supabase.from('invoices').update(updatePayload).eq('id', inv.id);

        // 1. Log to WhatsApp Live Inbox (whatsapp_conversations & whatsapp_messages)
        try {
          const rawPhone = String(inv.client_phone).trim();
          const cleanPhone = rawPhone.replace(/[^\d+]/g, '');
          const digitsOnly = cleanPhone.replace(/[^\d]/g, '');
          const tenDigits = digitsOnly.slice(-10);

          let convId = null;
          const { data: existingConv } = await supabase.from('whatsapp_conversations')
            .select('id, contact_name')
            .or(`contact_phone.eq.${cleanPhone},contact_phone.eq.${digitsOnly},contact_phone.eq.+${digitsOnly}`)
            .maybeSingle();

          if (existingConv?.id) {
            convId = existingConv.id;
          } else {
            // Match with customer_master or invoice for authentic business/contact name
            let contactName = inv.client_name || inv.party_name || null;
            try {
              const { data: sheetCust } = await supabase.from('customer_master')
                .select('customer_name, contact_person, company_name')
                .or(`contact_number.eq.${cleanPhone},contact_number.eq.${digitsOnly},contact_number.ilike.%${tenDigits}`)
                .maybeSingle();
              if (sheetCust) {
                contactName = sheetCust.contact_person
                  ? `${sheetCust.contact_person} (${sheetCust.company_name})`
                  : (sheetCust.company_name || sheetCust.customer_name);
              }
            } catch (custErr) {
              console.warn('[Reminder] Customer lookup note:', custErr.message);
            }

            const newConvPayload = {
              organization_id: DEFAULT_ORG_ID,
              contact_name: contactName || (cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`),
              contact_phone: cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone,
              conversation_mode: 'HUMAN ACTIVE',
              last_message_text: message,
              last_message_at: new Date().toISOString(),
              unread_count: 0,
            };

            const { data: newConv } = await supabase.from('whatsapp_conversations')
              .insert([newConvPayload])
              .select('id')
              .maybeSingle();
            convId = newConv?.id;
          }

          if (convId) {
            // Insert outbound reminder message into whatsapp_messages
            await supabase.from('whatsapp_messages').insert([{
              organization_id: DEFAULT_ORG_ID,
              conversation_id: convId,
              direction: 'outbound',
              sender_type: 'human_agent',
              message_type: hasValidPdf ? 'document' : 'text',
              body: message,
              media_url: hasValidPdf ? inv.pdf_url : null,
              status: 'delivered',
              provider_message_id: result.messageId || null,
            }]);

            // Keep conversation in sync for the Live Inbox list
            await supabase.from('whatsapp_conversations').update({
              last_message_text: message,
              last_message_at: new Date().toISOString(),
              unread_count: 0,
            }).eq('id', convId);
          }
        } catch (inboxErr) {
          console.warn('[Reminder] WhatsApp Live Inbox logging error:', inboxErr.message);
        }

        // 2. Log to payment_reminders
        try {
          await supabase.from('payment_reminders').insert([{
            organization_id: DEFAULT_ORG_ID,
            invoice_id: inv.id,
            channel: 'WhatsApp',
            message,
            status: result.simulated ? 'simulated' : 'sent',
          }]);
        } catch {}

        // 3. Log to activities
        try {
          await supabase.from('activities').insert([{
            type: 'payment_reminder',
            description: `WhatsApp reminder #${reminderNum} sent: ${fmtAmount(inv.amount)} due`,
            lead_id: inv.lead_id || null,
          }]);
        } catch {}

      } else {
        results.failed++;
        console.warn('[Reminder] Failed to send to', inv.client_phone, ':', result.error);
      }
    }

    console.log('[Reminder] Results:', JSON.stringify({ ...results, skippedDetails: undefined }));
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: results.sent > 0, intervalDays, maxReminders, results }),
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

// ── Handle Inbound WhatsApp message (auto-detect payment promise) ──────────────
async function handleInboundWhatsApp(supabase, body, cors) {
  const { from_phone, message_text, invoice_id } = body;

  if (!from_phone || !message_text) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing from_phone or message_text' }) };
  }

  const detection = detectPaymentPromise(message_text);
  let invoiceToUpdate = null;

  // Find the invoice for this phone number
  if (invoice_id) {
    const { data } = await supabase.from('invoices').select('*').eq('id', invoice_id).maybeSingle();
    invoiceToUpdate = data;
  } else {
    // Find the most recent unpaid invoice for this phone number
    const normPhone = from_phone.replace(/\s+/g, '').replace(/^0/, '+91');
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .in('status', ['Overdue', 'Pending'])
      .or(`client_phone.eq.${normPhone},client_phone.eq.${from_phone}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    invoiceToUpdate = data;
  }

  if (!invoiceToUpdate) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ detected: detection, invoiceFound: false }) };
  }

  // Handle "paid" confirmation
  if (detection.isPaidConfirmation) {
    await supabase.from('invoices').update({
      status: 'Paid',
      reminder_paused: false,
    }).eq('id', invoiceToUpdate.id);

    // Send confirmation acknowledgment back
    if (WA_TOKEN && PHONE_ID) {
      await fetch(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: from_phone.replace(/\s+/g, '').replace(/^\+/, ''),
          type: 'text',
          text: { body: `✅ Thank you! We've noted your payment for Invoice ${invoiceToUpdate.invoice_number || invoiceToUpdate.id}. Our team will verify and update the records. Thank you for your business! 🙏` },
        }),
      });
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ action: 'marked_paid', invoiceId: invoiceToUpdate.id }),
    };
  }

  // Handle payment promise — auto-pause reminders
  if (detection.isPromise && detection.promisedDate) {
    const promisedDateStr = detection.promisedDate.toISOString().split('T')[0];

    await supabase.from('invoices').update({
      reminder_paused: true,
      reminder_paused_reason: `Client promised payment by ${fmtDate(promisedDateStr)} via WhatsApp`,
      payment_promised_date: promisedDateStr,
      payment_promised_at: new Date().toISOString(),
      promise_committed_by: 'whatsapp_auto',
      promise_notes: `Auto-detected from message: "${message_text.slice(0, 200)}"`,
    }).eq('id', invoiceToUpdate.id);

    // Send auto-acknowledgment to client
    const ackMsg = detection.isVague
      ? `🙏 Thank you for letting us know! We've paused payment reminders for the next 7 days. Please do arrange for payment soon. If you need any assistance, contact us at any time.`
      : `🙏 Thank you! We've noted your payment commitment for ${fmtDate(promisedDateStr)}. We'll pause reminders until then. If you pay before that date, simply reply *"paid"* to this message.`;

    if (WA_TOKEN && PHONE_ID) {
      await fetch(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: from_phone.replace(/\s+/g, '').replace(/^\+/, ''),
          type: 'text',
          text: { body: ackMsg },
        }),
      });
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        action: 'auto_paused',
        invoiceId: invoiceToUpdate.id,
        promisedDate: promisedDateStr,
        daysFromNow: detection.daysFromNow,
      }),
    };
  }

  return { statusCode: 200, headers: cors, body: JSON.stringify({ detected: detection, noAction: true }) };
}
