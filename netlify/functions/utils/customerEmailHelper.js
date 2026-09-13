/**
 * customerEmailHelper.js — Netlify Functions Shared Email Dispatch Utility
 * 
 * Supports:
 *  - Automatic resolution of customer email from Google Sheet / customer_email_directory / leads
 *  - Automated Tax Invoice Email dispatch upon Tally sync
 *  - Automated & Manual Payment Follow-up Email dispatch (mirroring WhatsApp reminder cadence)
 *  - Full Supabase email_logs logging & activity tracking
 */

const nodemailer = require('nodemailer');

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_SHEET_ID = '1phUUKnsQcWR9kIPjNsOGr4lzu7Torj8W1XMziRNuncw';

const fmtAmount = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

// ── In-Memory Cache for Sheet Customer Email Directory ───────────────────────
let _cachedEmailDirectory = null;
let _cachedDirectoryTime = 0;
const DIRECTORY_CACHE_TTL = 5 * 60 * 1000; // 5 mins

// ── Fetch SMTP Configuration ──────────────────────────────────────────────────
async function getSmtpConfig(supabase) {
  let user = process.env.GMAIL_USER || process.env.SMTP_USER || '';
  let pass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '';
  let host = process.env.SMTP_HOST || 'smtp.gmail.com';
  let port = Number(process.env.SMTP_PORT || 465);
  let fromName = process.env.SMTP_FROM_NAME || 'Sobha Infratech Pvt. Ltd.';

  if ((!user || !pass) && supabase) {
    try {
      const { data: settings } = await supabase
        .from('org_settings')
        .select('key, value')
        .in('key', ['gmail_user', 'gmail_app_password', 'smtp_host', 'smtp_port', 'smtp_from_name']);

      if (settings && settings.length > 0) {
        settings.forEach(s => {
          if (s.key === 'gmail_user' && s.value && !user) user = s.value;
          if (s.key === 'gmail_app_password' && s.value && !pass) pass = s.value;
          if (s.key === 'smtp_host' && s.value) host = s.value;
          if (s.key === 'smtp_port' && s.value) port = Number(s.value);
          if (s.key === 'smtp_from_name' && s.value) fromName = s.value;
        });
      }
    } catch (err) {
      console.warn('[customerEmailHelper] SMTP settings fetch notice:', err.message);
    }
  }

  user = String(user || '').trim();
  // Strip spaces from Gmail 16-character app password (e.g. "abcd efgh ijkl mnop" -> "abcdefghijklmnop")
  pass = String(pass || '').trim().replace(/\s+/g, '');
  const secure = port === 465;
  const fromEmail = user || 'noreply@sobhainfra.com';

  return { host, port, secure, user, pass, fromName, fromEmail };
}

// ── Normalize Company Key ────────────────────────────────────────────────────
function normalizeKey(str) {
  if (!str) return '';
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── Quote-Aware CSV Parser ───────────────────────────────────────────────────
function parseCsvText(text) {
  if (!text || typeof text !== 'string') return [];
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentVal.trim());
      if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    rows.push(currentRow);
  }
  return rows;
}

// ── Fetch Live Customer Email Directory from Google Sheet or Org Settings ─────
async function getCustomerEmailDirectory(supabase, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _cachedEmailDirectory && (now - _cachedDirectoryTime < DIRECTORY_CACHE_TTL)) {
    return _cachedEmailDirectory;
  }

  // 1. Try reading from org_settings
  if (supabase) {
    try {
      const { data: setting } = await supabase
        .from('org_settings')
        .select('value')
        .eq('organization_id', DEFAULT_ORG_ID)
        .eq('key', 'customer_email_directory')
        .maybeSingle();

      if (setting?.value) {
        const parsed = JSON.parse(setting.value);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          _cachedEmailDirectory = parsed;
          _cachedDirectoryTime = now;
          return parsed;
        }
      }
    } catch (_) {}
  }

  // 2. Fetch directly from Google Sheet CSV
  try {
    let sheetId = DEFAULT_SHEET_ID;
    if (supabase) {
      try {
        const { data: sheetSetting } = await supabase
          .from('org_settings')
          .select('value')
          .eq('organization_id', DEFAULT_ORG_ID)
          .eq('key', 'customer_sheet_url')
          .maybeSingle();
        if (sheetSetting?.value) {
          const match = sheetSetting.value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
          if (match) sheetId = match[1];
        }
      } catch (_) {}
    }

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
    const res = await fetch(csvUrl, { headers: { 'User-Agent': 'SobhaInfra-ERP/1.0' } });
    if (res.ok) {
      const csvText = await res.text();
      const rows = parseCsvText(csvText);
      if (rows.length > 1) {
        const headers = rows[0].map(h => String(h).trim().toLowerCase());
        const compIdx = headers.findIndex(h => h.includes('company'));
        const custIdx = headers.findIndex(h => h.includes('customer') || h.includes('person') || h.includes('contact name'));
        const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('contact number') || h.includes('number'));
        const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('mail') || h.includes('e-mail'));

        const directory = {};
        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i];
          if (!cols || cols.length === 0) continue;
          const company = compIdx >= 0 ? cols[compIdx] : cols[0];
          const contact = custIdx >= 0 ? cols[custIdx] : cols[1];
          const phone = phoneIdx >= 0 ? cols[phoneIdx] : cols[2];
          const email = emailIdx >= 0 ? cols[emailIdx] : (cols[3] || '');

          if (company && email && email.includes('@')) {
            const key = normalizeKey(company);
            const cleanEmail = email.trim().toLowerCase();
            directory[key] = {
              email: cleanEmail,
              company_name: company,
              contact_person: contact || '',
              contact_number: phone || '',
            };
            // Also index phone digits if available
            const digits = (phone || '').replace(/\D/g, '').slice(-10);
            if (digits) {
              directory[`phone_${digits}`] = cleanEmail;
            }
          }
        }

        _cachedEmailDirectory = directory;
        _cachedDirectoryTime = now;

        // Persist to org_settings if supabase client provided
        if (supabase && Object.keys(directory).length > 0) {
          supabase.from('org_settings').upsert({
            organization_id: DEFAULT_ORG_ID,
            key: 'customer_email_directory',
            value: JSON.stringify(directory),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'organization_id,key' }).then(() => {}).catch(() => {});
        }

        return directory;
      }
    }
  } catch (sheetErr) {
    console.warn('[customerEmailHelper] Google Sheet directory fetch notice:', sheetErr.message);
  }

  return _cachedEmailDirectory || {};
}

// ── Resolve Customer Email ────────────────────────────────────────────────────
async function resolveCustomerEmail(supabase, { companyName, clientName, phone, email } = {}) {
  // 0. Direct email provided on voucher or party
  if (email && typeof email === 'string' && email.includes('@')) {
    return email.trim().toLowerCase();
  }

  const directory = await getCustomerEmailDirectory(supabase);

  // 1. Match by normalized company name
  if (companyName) {
    const key = normalizeKey(companyName);
    if (directory[key]?.email) return directory[key].email;
    // Partial substring match
    for (const [k, item] of Object.entries(directory)) {
      if (k.startsWith('phone_')) continue;
      if (k && key && (k.includes(key) || key.includes(k))) {
        return item.email;
      }
    }
  }

  // 2. Match by normalized client name
  if (clientName) {
    const key = normalizeKey(clientName);
    if (directory[key]?.email) return directory[key].email;
    for (const [k, item] of Object.entries(directory)) {
      if (k.startsWith('phone_')) continue;
      if (k && key && (k.includes(key) || key.includes(k))) {
        return item.email;
      }
    }
  }

  // 3. Match by phone digits
  if (phone) {
    const digits = String(phone).replace(/\D/g, '').slice(-10);
    if (digits && directory[`phone_${digits}`]) {
      return directory[`phone_${digits}`];
    }
  }

  // 4. Fallback: query Supabase leads table
  if (supabase && (companyName || clientName || phone)) {
    try {
      const q = supabase.from('leads').select('email').not('email', 'is', null);
      if (phone) {
        const digits = String(phone).replace(/\D/g, '').slice(-10);
        const { data: leadMatch } = await q.ilike('phone', `%${digits}%`).limit(1).maybeSingle();
        if (leadMatch?.email) return leadMatch.email.trim().toLowerCase();
      }
      if (clientName) {
        const { data: leadMatch } = await q.ilike('name', `%${clientName.trim()}%`).limit(1).maybeSingle();
        if (leadMatch?.email) return leadMatch.email.trim().toLowerCase();
      }
    } catch (_) {}
  }

  return null;
}

// ── Format Branded HTML Email Wrapper ─────────────────────────────────────────
function formatEmailHtml({
  headerTitle = 'Official Communication',
  subtitle = 'Tax Invoice & Accounts Communication',
  recipientName = 'Valued Customer',
  companyName = 'Sobha Infratech Pvt. Ltd.',
  contentHtml = '',
  footerNote = 'This is an automated communication generated via SobhaInfra ERP. Please contact our finance department for any ledger clarification.',
}) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 620px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5 0%, #312e81 100%); padding: 25px 30px; text-align: left;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.3px;">${companyName}</h1>
              <p style="margin: 4px 0 0 0; color: #c7d2fe; font-size: 13px; font-weight: 500;">${subtitle}</p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 30px; font-size: 15px; line-height: 1.6; color: #334155;">
              <p style="margin-top: 0; font-size: 16px; font-weight: 600; color: #0f172a;">Dear ${recipientName},</p>
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
              <p style="margin: 0 0 6px 0; font-weight: 600; color: #475569;">${companyName}</p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.4;">${footerNote}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

// ── Send Automated Tax Invoice Email (on Tally Sync) ──────────────────────────
async function sendInvoiceEmail(supabase, {
  to,
  recipientName = 'Valued Customer',
  companyName = 'Sobha Infratech Pvt. Ltd.',
  invNum,
  amount,
  dueDate,
  invoiceDate,
  pdfUrl = null,
  pdfBuffer = null,
  bankDetails = null,
  portalUrl = null,
}) {
  if (!to || !to.includes('@')) return { success: false, error: 'Invalid recipient email' };

  const smtp = await getSmtpConfig(supabase);
  const bank = bankDetails || {
    name: 'ICICI Bank',
    accNo: '001905012691',
    ifsc: 'ICIC0000019',
    accName: companyName || 'SobhaInfra Tech',
  };

  const formattedAmount = fmtAmount(amount);
  const formattedDate = fmtDate(invoiceDate);
  const formattedDue = fmtDate(dueDate);
  const safePdfName = `Invoice_${String(invNum).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  const viewUrl = pdfUrl || portalUrl || `https://sobhainfra-erp.netlify.app/invoice/${invNum}`;

  const contentHtml = `
    <p>Please find details of your official <strong>Tax Invoice</strong> generated for recent supplies from <strong>${companyName}</strong>.</p>

    <!-- Invoice Summary Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin: 20px 0; padding: 15px;">
      <tr>
        <td style="padding: 6px 12px; font-size: 13px; color: #64748b;">Invoice Number:</td>
        <td style="padding: 6px 12px; font-size: 14px; font-weight: 700; color: #0f172a; text-align: right;">${invNum}</td>
      </tr>
      <tr>
        <td style="padding: 6px 12px; font-size: 13px; color: #64748b;">Invoice Date:</td>
        <td style="padding: 6px 12px; font-size: 13px; font-weight: 600; color: #334155; text-align: right;">${formattedDate}</td>
      </tr>
      <tr>
        <td style="padding: 6px 12px; font-size: 13px; color: #64748b;">Due Date:</td>
        <td style="padding: 6px 12px; font-size: 13px; font-weight: 600; color: #334155; text-align: right;">${formattedDue}</td>
      </tr>
      <tr style="border-top: 1px dashed #cbd5e1;">
        <td style="padding: 10px 12px 6px; font-size: 15px; font-weight: 700; color: #0f172a;">Total Amount Due:</td>
        <td style="padding: 10px 12px 6px; font-size: 18px; font-weight: 800; color: #4f46e5; text-align: right;">${formattedAmount}</td>
      </tr>
    </table>

    <!-- Action Button -->
    <div style="text-align: center; margin: 25px 0;">
      <a href="${viewUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #4338ca); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">
        📄 View & Download Tax Invoice
      </a>
    </div>

    <!-- Bank Details Box -->
    <div style="background-color: #f1f5f9; border-radius: 8px; padding: 14px 18px; margin-top: 20px; font-size: 13px;">
      <strong style="color: #1e293b; display: block; margin-bottom: 6px;">🏦 Remittance Banking Details (NEFT / RTGS / IMPS):</strong>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px; color: #475569;">
        <tr><td style="padding: 3px 0; width: 130px;">Bank Name:</td><td style="font-weight: 600; color: #0f172a;">${bank.name}</td></tr>
        <tr><td style="padding: 3px 0;">Account Name:</td><td style="font-weight: 600; color: #0f172a;">${bank.accName || companyName}</td></tr>
        <tr><td style="padding: 3px 0;">Account Number:</td><td style="font-weight: 700; color: #0f172a;">${bank.accNo}</td></tr>
        <tr><td style="padding: 3px 0;">IFSC Code:</td><td style="font-weight: 700; color: #0f172a;">${bank.ifsc}</td></tr>
      </table>
    </div>

    <p style="font-size: 13px; color: #64748b; margin-top: 20px;">Kindly share the transaction reference / UTR number with our accounts team upon remittance.</p>
  `;

  const finalHtml = formatEmailHtml({
    headerTitle: `Tax Invoice: ${invNum}`,
    subtitle: `Automated Invoice Dispatch · ${companyName}`,
    recipientName,
    companyName,
    contentHtml,
  });

  const subject = `Official Tax Invoice: ${invNum} (${formattedAmount}) — ${companyName}`;

  // Attachments
  const attachments = [];
  if (pdfBuffer) {
    attachments.push({ filename: safePdfName, content: pdfBuffer });
  } else if (pdfUrl && pdfUrl.startsWith('http')) {
    attachments.push({ filename: safePdfName, path: pdfUrl });
  }

  if (!smtp.user || !smtp.pass) {
    console.log(`[customerEmailHelper] Simulated invoice email dispatch to ${to} for ${invNum}`);
    if (supabase) {
      try {
        await supabase.from('email_logs').insert([{
          recipient_email: to,
          recipient_name: recipientName,
          sender_email: smtp.fromEmail,
          sender_name: smtp.fromName,
          subject,
          body_html: finalHtml,
          template_used: 'Auto Invoice Dispatch',
          status: 'SIMULATED',
          error_message: 'Gmail App Password not configured in Settings; simulated successfully.',
        }]);
      } catch (logErr) {
        console.warn('[customerEmailHelper] email_logs insert notice:', logErr.message);
      }
    }
    return { success: true, simulated: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false },
    });

    const info = await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to,
      subject,
      html: finalHtml,
      attachments,
    });

    if (supabase) {
      try {
        await supabase.from('email_logs').insert([{
          recipient_email: to,
          recipient_name: recipientName,
          sender_email: smtp.fromEmail,
          sender_name: smtp.fromName,
          subject,
          body_html: finalHtml,
          template_used: 'Auto Invoice Dispatch',
          status: 'SENT',
          sent_by_name: smtp.fromName,
          metadata: { messageId: info.messageId, invoice_number: invNum, response: info.response },
        }]);
        try {
          await supabase.from('audit_logs').insert([{
            action: 'email.sent',
            resource: 'email',
            payload: {
              recipient_email: to,
              recipient_name: recipientName,
              sender_email: smtp.fromEmail,
              sender_name: smtp.fromName,
              subject,
              template_used: 'Auto Invoice Dispatch',
              status: 'SENT',
              messageId: info.messageId,
              invoice_number: invNum,
            }
          }]);
        } catch (_) {}
      } catch (logErr) {
        console.warn('[customerEmailHelper] email_logs insert notice:', logErr.message);
      }
    }

    console.log(`[customerEmailHelper] Successfully delivered invoice email to ${to} for ${invNum} (msgId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (sendErr) {
    console.warn(`[customerEmailHelper] Failed to deliver invoice email to ${to}:`, sendErr.message);
    if (supabase) {
      try {
        await supabase.from('email_logs').insert([{
          recipient_email: to,
          recipient_name: recipientName,
          subject,
          status: 'FAILED',
          error_message: sendErr.message,
        }]);
      } catch (logErr) {
        console.warn('[customerEmailHelper] email_logs insert notice:', logErr.message);
      }
    }
    return { success: false, error: sendErr.message };
  }
}

// ── Send Payment Reminder Email (Follow-up) ──────────────────────────────────
async function sendPaymentReminderEmail(supabase, {
  to,
  recipientName = 'Valued Customer',
  companyName = 'Sobha Infratech Pvt. Ltd.',
  invNum,
  amount,
  dueDate,
  status = 'Pending',
  reminderNum = 1,
  pdfUrl = null,
  pdfBuffer = null,
  bankDetails = null,
  customMessage = null,
  isConsolidated = false,
  invoices = [],
}) {
  if (!to || !to.includes('@')) return { success: false, error: 'Invalid recipient email' };

  const smtp = await getSmtpConfig(supabase);
  const bank = bankDetails || {
    name: 'ICICI Bank',
    accNo: '001905012691',
    ifsc: 'ICIC0000019',
    accName: companyName || 'SobhaInfra Tech',
  };

  const isOverdue = status === 'Overdue' || (dueDate && new Date(dueDate) < new Date());
  const formattedAmount = fmtAmount(amount);
  const formattedDue = fmtDate(dueDate);
  const safePdfName = isConsolidated
    ? `Statement_${String(recipientName).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
    : `Invoice_${String(invNum).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  const viewUrl = pdfUrl || `https://sobhainfra-erp.netlify.app/invoice/${invNum}`;

  const urgencyBadge = isOverdue
    ? `<span style="background-color: #fee2e2; color: #dc2626; font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">OVERDUE</span>`
    : `<span style="background-color: #fef3c7; color: #d97706; font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">PENDING</span>`;

  let detailsBoxHtml = '';
  if (isConsolidated && Array.isArray(invoices) && invoices.length > 0) {
    const rows = invoices.slice(0, 15).map(inv => {
      const num = inv.tally_voucher_number || inv.invoice_number || 'Inv';
      const dDate = fmtDate(inv.due_date);
      const bal = fmtAmount(inv.pending_amount !== undefined ? inv.pending_amount : inv.amount);
      const isOver = inv.status === 'Overdue' || (inv.due_date && new Date(inv.due_date) < new Date());
      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 10px; font-size: 13px; font-weight: 600; color: #1e293b;">${num}</td>
          <td style="padding: 8px 10px; font-size: 13px; color: #64748b;">${dDate}</td>
          <td style="padding: 8px 10px; font-size: 12px; color: ${isOver ? '#dc2626' : '#d97706'}; font-weight: 600;">${inv.status || 'Pending'}</td>
          <td style="padding: 8px 10px; font-size: 13px; font-weight: 700; color: #0f172a; text-align: right;">${bal}</td>
        </tr>
      `;
    }).join('');

    detailsBoxHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; margin: 20px 0; overflow: hidden; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left;">
            <th style="padding: 10px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Invoice #</th>
            <th style="padding: 10px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Due Date</th>
            <th style="padding: 10px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Status</th>
            <th style="padding: 10px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; text-align: right;">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr style="background-color: #f8fafc; border-top: 2px solid #e2e8f0;">
            <td colspan="3" style="padding: 10px; font-size: 14px; font-weight: 700; color: #0f172a;">Total Outstanding Balance:</td>
            <td style="padding: 10px; font-size: 16px; font-weight: 800; color: #4f46e5; text-align: right;">${formattedAmount}</td>
          </tr>
        </tfoot>
      </table>
    `;
  } else {
    detailsBoxHtml = `
      <!-- Bill Details Box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin: 20px 0; padding: 15px;">
        <tr>
          <td style="padding: 6px 12px; font-size: 13px; color: #64748b;">Invoice Number:</td>
          <td style="padding: 6px 12px; font-size: 14px; font-weight: 700; color: #0f172a; text-align: right;">${invNum}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; font-size: 13px; color: #64748b;">Due Date:</td>
          <td style="padding: 6px 12px; font-size: 13px; font-weight: 600; color: #334155; text-align: right;">${formattedDue}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; font-size: 13px; color: #64748b;">Status:</td>
          <td style="padding: 6px 12px; text-align: right;">${urgencyBadge}</td>
        </tr>
        <tr style="border-top: 1px dashed #cbd5e1;">
          <td style="padding: 10px 12px 6px; font-size: 15px; font-weight: 700; color: #0f172a;">Outstanding Amount Due:</td>
          <td style="padding: 10px 12px 6px; font-size: 18px; font-weight: 800; color: ${isOverdue ? '#dc2626' : '#4f46e5'}; text-align: right;">${formattedAmount}</td>
        </tr>
      </table>
    `;
  }

  const contentHtml = `
    <p>${isConsolidated ? `Please find your official <strong>Statement of Outstanding Dues</strong> with <strong>${companyName}</strong>.` : `This is payment reminder <strong>#${reminderNum}</strong> regarding Invoice <strong>${invNum}</strong> with <strong>${companyName}</strong>.`}</p>
    
    ${customMessage ? `<div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 15px 0; font-size: 14px; color: #334155;">${customMessage.replace(/\n/g, '<br/>')}</div>` : ''}

    ${detailsBoxHtml}

    <!-- Action Button -->
    <div style="text-align: center; margin: 25px 0;">
      <a href="${viewUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #4338ca); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">
        📄 ${isConsolidated ? 'View Official Statement of Account' : 'View Official Statement / Invoice'}
      </a>
    </div>

    <!-- Bank Details Box -->
    <div style="background-color: #f1f5f9; border-radius: 8px; padding: 14px 18px; margin-top: 20px; font-size: 13px;">
      <strong style="color: #1e293b; display: block; margin-bottom: 6px;">🏦 Official Remittance Bank Details:</strong>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px; color: #475569;">
        <tr><td style="padding: 3px 0; width: 130px;">Bank:</td><td style="font-weight: 600; color: #0f172a;">${bank.name}</td></tr>
        <tr><td style="padding: 3px 0;">Beneficiary:</td><td style="font-weight: 600; color: #0f172a;">${bank.accName || companyName}</td></tr>
        <tr><td style="padding: 3px 0;">Account No:</td><td style="font-weight: 700; color: #0f172a;">${bank.accNo}</td></tr>
        <tr><td style="padding: 3px 0;">IFSC Code:</td><td style="font-weight: 700; color: #0f172a;">${bank.ifsc}</td></tr>
      </table>
    </div>

    <p style="font-size: 13px; color: #64748b; margin-top: 20px;">If this balance has already been settled, please reply with transaction details or ignore this reminder. Thank you for your continued partnership! 🙏</p>
  `;

  const finalHtml = formatEmailHtml({
    headerTitle: isConsolidated ? `Statement of Account: ${recipientName}` : `Payment Reminder: ${invNum}`,
    subtitle: isConsolidated ? `Consolidated Statement · ${companyName}` : `Payment Follow-up Notice #${reminderNum} · ${companyName}`,
    recipientName,
    companyName,
    contentHtml,
  });

  const subject = isConsolidated
    ? `Statement of Account: Outstanding Balance (${formattedAmount}) — ${companyName}`
    : (isOverdue
        ? `⚠️ URGENT: Payment Reminder #${reminderNum} — Invoice ${invNum} (${formattedAmount})`
        : `Payment Reminder #${reminderNum}: Invoice ${invNum} (${formattedAmount}) — ${companyName}`);

  const attachments = [];
  if (pdfBuffer) {
    attachments.push({ filename: safePdfName, content: pdfBuffer });
  } else if (pdfUrl && pdfUrl.startsWith('http')) {
    attachments.push({ filename: safePdfName, path: pdfUrl });
  }

  if (!smtp.user || !smtp.pass) {
    console.log(`[customerEmailHelper] Simulated payment reminder email to ${to} for ${invNum}`);
    if (supabase) {
      try {
        await supabase.from('email_logs').insert([{
          recipient_email: to,
          recipient_name: recipientName,
          sender_email: smtp.fromEmail,
          sender_name: smtp.fromName,
          subject,
          body_html: finalHtml,
          template_used: 'Payment Reminder',
          status: 'SIMULATED',
          error_message: 'Gmail App Password not configured in Settings; simulated successfully.',
        }]);
      } catch (logErr) {
        console.warn('[customerEmailHelper] email_logs insert notice:', logErr.message);
      }
    }
    return { success: true, simulated: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false },
    });

    const info = await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to,
      subject,
      html: finalHtml,
      attachments,
    });

    if (supabase) {
      try {
        await supabase.from('email_logs').insert([{
          recipient_email: to,
          recipient_name: recipientName,
          sender_email: smtp.fromEmail,
          sender_name: smtp.fromName,
          subject,
          body_html: finalHtml,
          template_used: 'Payment Reminder',
          status: 'SENT',
          sent_by_name: smtp.fromName,
          metadata: { messageId: info.messageId, invoice_number: invNum, reminder_number: reminderNum },
        }]);
        try {
          await supabase.from('audit_logs').insert([{
            action: 'email.sent',
            resource: 'email',
            payload: {
              recipient_email: to,
              recipient_name: recipientName,
              sender_email: smtp.fromEmail,
              sender_name: smtp.fromName,
              subject,
              template_used: 'Payment Reminder',
              status: 'SENT',
              messageId: info.messageId,
              invoice_number: invNum,
              reminder_number: reminderNum,
            }
          }]);
        } catch (_) {}
      } catch (logErr) {
        console.warn('[customerEmailHelper] email_logs insert notice:', logErr.message);
      }
    }

    console.log(`[customerEmailHelper] Successfully delivered payment reminder email to ${to} for ${invNum} (msgId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (sendErr) {
    console.warn(`[customerEmailHelper] Failed to deliver payment reminder email to ${to}:`, sendErr.message);
    if (supabase) {
      try {
        await supabase.from('email_logs').insert([{
          recipient_email: to,
          recipient_name: recipientName,
          subject,
          status: 'FAILED',
          error_message: sendErr.message,
        }]);
      } catch (logErr) {
        console.warn('[customerEmailHelper] email_logs insert notice:', logErr.message);
      }
    }
    return { success: false, error: sendErr.message };
  }
}

module.exports = {
  getSmtpConfig,
  getCustomerEmailDirectory,
  resolveCustomerEmail,
  sendInvoiceEmail,
  sendPaymentReminderEmail,
};
