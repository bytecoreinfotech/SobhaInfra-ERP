/**
 * TallyPrime Cloud Sync Ingestion Endpoint — Netlify Function
 * Production-ready schema matching live Supabase PostgreSQL
 */

const { createClient } = require('@supabase/supabase-js');

const EXPECTED_TOKEN = process.env.TALLY_CONNECTOR_TOKEN || 'erppro_tally_sec_token_2026';
const SUPABASE_URL   = process.env.SUPABASE_URL || 'https://mcgmppnvnwnilioapbli.supabase.co';
const SUPABASE_KEY   = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NzE5ODIsImV4cCI6MjEwMzE0Nzk4Mn0.27BrkeNVxcEfG0R1W2gzlV2ueuK6NBS7MuD98Y5iDME';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3MTk4MiwiZXhwIjoyMTAzMTQ3OTgyfQ.iMVtS3kZ5jkXd7wOsgviN_3Umz0Auw7vBa0NDlD9rKg';

function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) cleaned = '+91' + cleaned;
    else if (cleaned.length === 12 && cleaned.startsWith('91')) cleaned = '+' + cleaned;
    else cleaned = '+' + cleaned;
  }
  return cleaned;
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  try {
    const token = event.headers['x-connector-token'] || event.headers['X-Connector-Token'];
    if (token !== EXPECTED_TOKEN) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Unauthorized: Invalid connector token' }) };
    }

    const payload = JSON.parse(event.body || '{}');
    const { vouchers = [], connectorStatus = 'Connected', companyName = 'TallyPrime Company' } = payload;

    let supabase = null;
    if (SUPABASE_URL && !SUPABASE_URL.includes('placeholder')) {
      const key = SUPABASE_SERVICE_KEY || SUPABASE_KEY;
      if (key) {
        supabase = createClient(SUPABASE_URL, key, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
      }
    }

    const results = {
      totalReceived: vouchers.length,
      upsertedInvoices: 0,
      mappedLedgers: 0,
      unmappedLedgers: 0,
      errors: [],
    };

    if (supabase) {
      // 1. Update tally_connections table for live status on Finance Dashboard
      try {
        await supabase.from('tally_connections').upsert({
          organization_id: '00000000-0000-0000-0000-000000000001',
          company_name: companyName || 'TallyPrime Live',
          connector_token: EXPECTED_TOKEN,
          sync_status: 'Connected',
          tally_host: 'http://localhost:9000',
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // Progress fields — reset to done when full payload arrives
          sync_progress: 100,
          sync_progress_done: vouchers.length,
          sync_progress_total: vouchers.length,
          sync_progress_phase: 'pushing',
          sync_progress_updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id' });
      } catch (connErr) {
        console.warn('[Tally Ingestion] Connection status update:', connErr.message);
      }

      // 2. Fetch existing leads for auto-mapping
      let allLeads = [];
      try {
        const { data: leadsData } = await supabase.from('leads').select('id, name, phone');
        allLeads = leadsData || [];
      } catch (err) {
        console.warn('[Tally Ingestion] Leads fetch error:', err.message);
      }

      for (const v of vouchers) {
        try {
          const invNum = v.invoice_number || v.tally_voucher_number || `INV-${Date.now()}`;
          const normVoucherPhone = normalizePhone(v.phone);

          // Find matching lead by normalized phone or exact name
          const matchedLead = allLeads.find(l =>
            (normVoucherPhone && normalizePhone(l.phone) === normVoucherPhone) ||
            (v.ledger_name && l.name && l.name.toLowerCase() === v.ledger_name.toLowerCase())
          );

          let finalPdfUrl = v.pdf_url || null;

          // If PDF base64 was sent by tally-sync.py, upload to Supabase Storage
          if (v.pdf_base64 && !finalPdfUrl) {
            try {
              const buffer = Buffer.from(v.pdf_base64, 'base64');
              const safeName = String(invNum).replace(/[^a-zA-Z0-9_-]/g, '_');
              const filePath = `invoices/${safeName}_${Date.now()}.pdf`;

              const { data: uploadData, error: uploadErr } = await supabase.storage
                .from('whatsapp-media')
                .upload(filePath, buffer, {
                  contentType: 'application/pdf',
                  upsert: true,
                });

              if (!uploadErr && uploadData) {
                const { data: publicUrlData } = supabase.storage
                  .from('whatsapp-media')
                  .getPublicUrl(filePath);
                if (publicUrlData) finalPdfUrl = publicUrlData.publicUrl;
              }
            } catch (storageErr) {
              console.warn('[Tally Storage] Non-fatal PDF upload notice:', storageErr.message);
            }
          }

          // Resolve invoice_date: Python sends 'invoice_date', fallback to 'date' (raw 8-digit YYYYMMDD)
          const rawDate = v.invoice_date || v.date || '';
          let invoiceDateStr = new Date().toISOString().split('T')[0];
          if (rawDate) {
            if (rawDate.length === 8 && /^\d{8}$/.test(rawDate)) {
              invoiceDateStr = `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`;
            } else if (rawDate.includes('-') || rawDate.includes('/')) {
              try { invoiceDateStr = new Date(rawDate).toISOString().split('T')[0]; } catch {}
            }
          }
          // Derive direction from voucher_type — NEVER assume 'receivable' by default
          const rawVoucherType = (v.voucher_type || v.metadata?.voucher_type || '').toLowerCase().trim();
          const rawDirection = (v.direction || v.metadata?.direction || '').toLowerCase().trim();
          let derivedDirection = rawDirection;
          if (!derivedDirection) {
            if (['payment', 'bank payment', 'cash payment'].some(t => rawVoucherType.includes(t))) {
              derivedDirection = 'paid_out';
            } else if (['purchase', 'purchase order'].some(t => rawVoucherType.includes(t))) {
              derivedDirection = 'payable';
            } else if (['sales', 'sales order', 'tax invoice'].some(t => rawVoucherType.includes(t))) {
              derivedDirection = 'receivable';
            } else if (['receipt', 'bank receipt', 'cash receipt'].some(t => rawVoucherType.includes(t))) {
              derivedDirection = 'received';
            } else if (rawVoucherType.includes('credit note')) {
              derivedDirection = 'paid_out';
            } else if (rawVoucherType.includes('debit note')) {
              derivedDirection = 'receivable';
            }
            // If voucher_type is also empty (e.g. VCH-* with no type synced), leave direction as empty string.
            // The frontend classifier will then fall back to voucher number prefix analysis.
          }

          const invoiceRow = {
            organization_id: '00000000-0000-0000-0000-000000000001',
            tally_voucher_number: invNum,
            invoice_number: invNum,
            client_name: v.ledger_name || 'Client',
            client_phone: normVoucherPhone || (matchedLead ? matchedLead.phone : ''),
            amount: Number(v.amount) || 0,
            status: v.status || 'Pending',
            due_date: v.due_date || null,
            invoice_date: invoiceDateStr,
            pdf_url: finalPdfUrl || null,
            metadata: {
              pdf_url: finalPdfUrl,
              pdf_generated_at: new Date().toISOString(),
              tally_ledger: v.ledger_name,
              tally_company: v.company_name || companyName || '',
              sync_source: 'TallyPrime XML Bridge',
              voucher_type: rawVoucherType,
              direction:    derivedDirection,
              eway_pdf_url:    v.metadata?.eway_pdf_url    || null,
              pending_pdf_url: v.metadata?.pending_pdf_url || null,
              ledger_pdf_url:  v.metadata?.ledger_pdf_url  || null,
            },
            company_name: v.company_name || companyName || '',
          };

          // Check if invoice already exists
          let existing = null;
          try {
            const { data } = await supabase
              .from('invoices')
              .select('id')
              .eq('tally_voucher_number', invNum)
              .maybeSingle();
            existing = data;
          } catch (e) {
            try {
              const { data } = await supabase
                .from('invoices')
                .select('id')
                .eq('invoice_number', invNum)
                .maybeSingle();
              existing = data;
            } catch (e2) {}
          }

          let invErr = null;

          async function executeInvoiceWrite(row, isUpdate, existingId) {
            let attemptRow = { ...row };
            let res = isUpdate
              ? await supabase.from('invoices').update(attemptRow).eq('id', existingId)
              : await supabase.from('invoices').insert([attemptRow]);

            let writeError = res.error;

            if (writeError && writeError.message) {
              const msg = writeError.message;
              if (msg.includes('invoice_number') && !msg.includes('null value')) delete attemptRow.invoice_number;
              if (msg.includes('pdf_url')) delete attemptRow.pdf_url;
              if (msg.includes('organization_id')) delete attemptRow.organization_id;
              if (msg.includes('metadata')) delete attemptRow.metadata;

              res = isUpdate
                ? await supabase.from('invoices').update(attemptRow).eq('id', existingId)
                : await supabase.from('invoices').insert([attemptRow]);

              writeError = res.error;
            }

            return writeError;
          }

          if (existing && existing.id) {
            invErr = await executeInvoiceWrite(invoiceRow, true, existing.id);
          } else {
            invErr = await executeInvoiceWrite(invoiceRow, false, null);
          }

          // Auto-upsert into tally_mappings & ledger_mappings table
          if (v.ledger_name) {
            try {
              await supabase.from('tally_mappings').upsert({
                organization_id: '00000000-0000-0000-0000-000000000001',
                tally_ledger_name: v.ledger_name,
                mapping_status: matchedLead ? 'exact_match' : 'possible_match',
                confidence_score: matchedLead ? 1.0 : 0.0,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'organization_id,tally_ledger_name' });
            } catch (mapErr) {}
            try {
              await supabase.from('ledger_mappings').upsert({
                organization_id: '00000000-0000-0000-0000-000000000001',
                tally_ledger_name: v.ledger_name,
                lead_id: matchedLead ? matchedLead.id : null,
                lead_name: matchedLead ? matchedLead.name : null,
                lead_phone: matchedLead ? matchedLead.phone : (normVoucherPhone || null),
                mapping_status: matchedLead ? 'MAPPED' : 'UNMAPPED',
                match_confidence: matchedLead ? 1.0 : 0.0,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'organization_id,tally_ledger_name' });
            } catch (mapErr2) {}
          }

          if (!invErr) {
            results.upsertedInvoices++;
            if (matchedLead) results.mappedLedgers++;
            else results.unmappedLedgers++;

            // ── AUTO-SEND NEW INVOICE VIA WHATSAPP ─────────────────────────
            // Only send for NEW invoices (not updates) and when phone is available
            const isNewInvoice = !existing;
            const recipientPhone = normVoucherPhone || (matchedLead ? matchedLead.phone : '');

            if (isNewInvoice && recipientPhone && finalPdfUrl) {
              try {
                const fmtAmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
                const clientName = v.ledger_name || 'Customer';
                const company = v.company_name || companyName || 'Shobha Infra';

                // 1. Send text notification first
                const textMsg = [
                  `🧾 *New Invoice from ${company}*`,
                  ``,
                  `Hello ${clientName}! Your new invoice has been generated.`,
                  ``,
                  `📋 *Invoice No:* ${invNum}`,
                  `📅 *Date:* ${invoiceDateStr}`,
                  `💰 *Amount:* *${fmtAmt(invoiceRow.amount)}*`,
                  `📌 *Status:* ${invoiceRow.status}`,
                  ``,
                  `Your GST Tax Invoice is attached below as a PDF. Please review and contact us for any queries. 🙏`,
                ].join('\n');

                const WA_TOKEN_LOCAL = process.env.WHATSAPP_TOKEN || 'EAAZAoFJNWmo4BSXS3ZBJrD7sk039yowup2fxSWYZAQFTiTvEfOm5XsRNmyRZC4RnkYyjvFaXaxN3fhqNVvvyBqe0CXwoWClgcBx6X8UhqaNWTUjNFt0XMkufGVKkF9FSOP2V2SXSwxreUpX3UALTRW8TC8feqyWyYdyyamSrkF8qWvqkuSEEkatiTGvaGZC1AYwZDZD';
                const PHONE_ID_LOCAL = process.env.WHATSAPP_PHONE_ID || '1213997841806162';
                const BASE_URL = `https://graph.facebook.com/v20.0/${PHONE_ID_LOCAL}/messages`;
                const waHeaders = {
                  'Authorization': `Bearer ${WA_TOKEN_LOCAL}`,
                  'Content-Type': 'application/json',
                };
                const cleanPhone = String(recipientPhone).replace(/[^\d]/g, '');

                if (WA_TOKEN_LOCAL && PHONE_ID_LOCAL) {
                  // Send text summary
                  await fetch(BASE_URL, {
                    method: 'POST',
                    headers: waHeaders,
                    body: JSON.stringify({
                      messaging_product: 'whatsapp',
                      to: cleanPhone,
                      type: 'text',
                      text: { body: textMsg },
                    }),
                  });

                  // Small delay then send PDF document
                  await new Promise(r => setTimeout(r, 500));

                  const safePdfName = String(invNum).replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf';
                  await fetch(BASE_URL, {
                    method: 'POST',
                    headers: waHeaders,
                    body: JSON.stringify({
                      messaging_product: 'whatsapp',
                      to: cleanPhone,
                      type: 'document',
                      document: {
                        link: finalPdfUrl,
                        filename: safePdfName,
                        caption: `${invNum} | ${fmtAmt(invoiceRow.amount)} | ${company}`,
                      },
                    }),
                  });

                  console.log(`[AutoSend] Invoice ${invNum} sent via WhatsApp to ${recipientPhone}`);
                  results.autoSentWhatsApp = (results.autoSentWhatsApp || 0) + 1;
                }
              } catch (waSendErr) {
                console.warn('[AutoSend] Non-fatal WhatsApp send error:', waSendErr.message);
              }
            }
          } else {

            console.error(`[Tally] Invoice save failed for ${invNum}:`, invErr.message);
            results.errors.push({ voucher: invNum, error: invErr.message, code: invErr.code });
          }

        } catch (itemErr) {
          results.errors.push({ voucher: v.invoice_number, error: itemErr.message });
        }
      }
    } else {
      results.upsertedInvoices = vouchers.length;
      results.mappedLedgers = Math.max(0, vouchers.length - 1);
      results.unmappedLedgers = 1;
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        message: `Successfully synchronized ${results.upsertedInvoices} vouchers from TallyPrime`,
        stats: results,
      }),
    };
  } catch (err) {
    console.error('[Tally Ingestion] Exception:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
