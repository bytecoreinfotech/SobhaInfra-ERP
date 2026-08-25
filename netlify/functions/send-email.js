/**
/**
 * Outbound Email Dispatcher — Netlify Serverless Function (Gmail / SMTP)
 * URL: POST /.netlify/functions/send-email
 * 
 * Supports:
 *  - Gmail SMTP (smtp.gmail.com, SSL: 465 / TLS: 587)
 *  - Custom SMTP & App Passwords
 *  - Pre-styled Real-Estate HTML Templates & Dynamic Variables
 *  - Attachments (Brochures, Quotations, Invoices)
 *  - Database Logging to Supabase (email_logs & activities)
 */

const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

// Supabase Connection
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcgmppnvnwnilioapbli.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Helper to format branded email wrapper
function formatBrandedEmail(bodyHtml, companyName = 'Sobha Infratech Pvt. Ltd.', logoUrl = '') {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Communication</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6f9; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 25px 30px; text-align: left;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" height="40" style="max-height: 40px; margin-bottom: 8px; display: block;" />` : ''}
                    <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.3px;">${companyName}</h1>
                    <p style="margin: 4px 0 0 0; color: #c7d2fe; font-size: 12px; font-weight: 500;">Official Client Communication</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Email Content Body -->
          <tr>
            <td style="padding: 35px 30px; font-size: 15px; line-height: 1.6; color: #334155;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
              <p style="margin: 0 0 6px 0; font-weight: 600; color: #475569;">${companyName}</p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">This is an automated communication generated via SobhaInfra ERP. Please do not hesitate to contact our sales team.</p>
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

exports.handler = async function (event) {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method Not Allowed' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const {
      to,
      subject,
      text,
      html,
      recipientName,
      leadId,
      templateUsed,
      senderName,
      senderEmail,
      attachments,
      smtpConfig, // Optional custom runtime SMTP config from settings test
    } = payload;

    if (!to || !subject || (!text && !html)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Missing required fields: to, subject, and message content.',
        }),
      };
    }

    // 1. Resolve SMTP Configuration
    // Order: runtime payload -> environment variables -> fallback defaults
    const host = smtpConfig?.host || process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(smtpConfig?.port || process.env.SMTP_PORT || 465);
    const secure = port === 465; // true for 465, false for 587
    const user = smtpConfig?.user || process.env.GMAIL_USER || process.env.SMTP_USER || '';
    const pass = smtpConfig?.pass || process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '';
    const fromName = senderName || smtpConfig?.fromName || process.env.SMTP_FROM_NAME || 'Sobha Infratech Pvt. Ltd.';
    const fromEmail = senderEmail || user || 'noreply@sobhainfra.com';

    if (!user || !pass) {
      // In development / demo mode when credentials are not yet entered in panel
      console.warn('Gmail / SMTP credentials not configured in environment or request.');
      
      // Log mock send to Supabase for local dev
      try {
        const sb = getSupabase();
        await sb.from('email_logs').insert([{
          recipient_email: to,
          recipient_name: recipientName || '',
          sender_email: fromEmail,
          sender_name: fromName,
          subject,
          body_html: html || text,
          body_text: text || '',
          template_used: templateUsed || 'Custom',
          status: 'SIMULATED',
          error_message: 'Mock dispatch: Please configure Gmail App Password in Settings > Email Settings',
          lead_id: leadId || null,
        }]);
      } catch (dbErr) {
        console.warn('Database log warning:', dbErr.message);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          simulated: true,
          messageId: 'simulated-msg-' + Date.now(),
          message: 'Email simulated. Please configure your Gmail App Password in Settings > Email Settings for live delivery.',
        }),
      };
    }

    // 2. Configure Nodemailer Transporter
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false, // Prevents self-signed cert issues on modern nodes
      },
    });

    // 3. Prepare Final HTML Content
    const finalHtml = html ? formatBrandedEmail(html, fromName) : formatBrandedEmail(`<p>${(text || '').replace(/\n/g, '<br/>')}</p>`, fromName);

    // 4. Send Email
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text: text || subject,
      html: finalHtml,
      attachments: Array.isArray(attachments) ? attachments : [],
    };

    const info = await transporter.sendMail(mailOptions);

    // 5. Record Log in Database
    try {
      const sb = getSupabase();
      await sb.from('email_logs').insert([{
        recipient_email: to,
        recipient_name: recipientName || '',
        sender_email: fromEmail,
        sender_name: fromName,
        subject,
        body_html: finalHtml,
        body_text: text || '',
        template_used: templateUsed || 'Custom',
        status: 'SENT',
        sent_by_name: fromName,
        lead_id: leadId || null,
        metadata: { messageId: info.messageId, response: info.response },
      }]);

      // If linked to a lead, also append to CRM activities feed
      if (leadId) {
        await sb.from('activities').insert([{
          lead_id: leadId,
          type: 'email',
          description: `Sent email "${subject}" to ${to}`,
          created_by: fromName,
        }]).catch(() => {}); // Gracefully ignore if activities table schema varies
      }
    } catch (dbErr) {
      console.warn('Could not write email log to Supabase:', dbErr.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        messageId: info.messageId,
        message: 'Email delivered successfully via Gmail SMTP.',
      }),
    };
  } catch (error) {
    console.error('Email dispatch failed:', error);

    // Log failure
    try {
      const sb = getSupabase();
      const payload = JSON.parse(event.body || '{}');
      await sb.from('email_logs').insert([{
        recipient_email: payload.to || 'unknown',
        subject: payload.subject || 'unknown',
        status: 'FAILED',
        error_message: error.message,
        lead_id: payload.leadId || null,
      }]);
    } catch (_) {}

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to send email. Check Gmail credentials and App Password.',
      }),
    };
  }
};
