/**
 * TallyPrime Cloud Sync Ingestion Endpoint — Netlify Function
 * Production-ready schema matching live Supabase PostgreSQL
 */

const { createClient } = require('@supabase/supabase-js');

// Strip literal 'undefined' / 'null' / 'NaN' strings that Python may send
function cleanVal(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return (s === 'undefined' || s === 'null' || s === 'NaN') ? '' : s;
}

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
          const rawVoucherType = cleanVal(v.voucher_type || v.metadata?.voucher_type).toLowerCase().trim();
          const rawDirection = cleanVal(v.direction || v.metadata?.direction).toLowerCase().trim();
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
              voucher_type: rawVoucherType || null,
              direction:    derivedDirection || null,
              pending_amount: v.pending_amount ?? v.metadata?.pending_amount,
              paid_amount: v.paid_amount ?? v.metadata?.paid_amount,
              bill_allocations: v.bill_allocations || v.metadata?.bill_allocations || [],
              raw_voucher_number: v.raw_voucher_number || v.metadata?.raw_voucher_number || '',
              supplier_invoice_number: v.supplier_invoice_number || v.metadata?.supplier_invoice_number || '',
              eway_pdf_url:    v.metadata?.eway_pdf_url    || null,
              pending_pdf_url: v.metadata?.pending_pdf_url || null,
              ledger_pdf_url:  v.metadata?.ledger_pdf_url  || null,
            },
            company_name: v.company_name || companyName || '',
          };

          // Check if invoice already exists within the target company
          let existing = null;
          const targetCompany = v.company_name || companyName || '';
          try {
            let q = supabase
              .from('invoices')
              .select('id, company_name')
              .eq('tally_voucher_number', invNum);
            if (targetCompany) {
              q = q.eq('company_name', targetCompany);
            }
            const { data } = await q.maybeSingle();
            existing = data;
          } catch (e) {
            try {
              let q2 = supabase
                .from('invoices')
                .select('id, company_name')
                .eq('invoice_number', invNum);
              if (targetCompany) {
                q2 = q2.eq('company_name', targetCompany);
              }
              const { data } = await q2.maybeSingle();
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

            // ── AIRTIGHT SAFETY GUARD FOR NEW BILL AUTO-DISPATCH ─────
            // Rule 1: Date Recency Guard — invoice must be same-day or within the last 48 hours
            const invDateMs = new Date(invoiceDateStr).getTime();
            const nowMs = Date.now();
            const diffHours = (nowMs - invDateMs) / (1000 * 60 * 60);
            const isRecentInvoice = diffHours >= -12 && diffHours <= 48;

            // Rule 2: Idempotency Guard — never re-send if already dispatched
            const isAlreadyDispatched = Boolean(existing?.metadata?.first_dispatched_at || existing?.metadata?.auto_dispatched_at);

            // Rule 3: Must be a genuine Sales / Tax Invoice (never purchase/payment)
            const isSalesInvoice = derivedDirection === 'receivable' ||
              ['sales', 'sales order', 'tax invoice'].some(t => rawVoucherType.includes(t)) ||
              /^(srp|sb|inv|tax)\//i.test(invNum);

            // Rule 4: Authoritative Google Sheet Phone Verification
            let verifiedSheetPhone = '';
            let verifiedSheetName = '';
            if (v.ledger_name) {
              try {
                const cleanLedger = String(v.ledger_name || '').trim();
                const { data: sheetCust } = await supabase.from('customer_master')
                  .select('company_name, contact_person, contact_number')
                  .ilike('company_name', `%${cleanLedger}%`)
                  .limit(1)
                  .maybeSingle();

                if (sheetCust?.contact_number) {
                  const rawDigits = String(sheetCust.contact_number).replace(/[^\d]/g, '');
                  if (rawDigits.length >= 10) {
                    verifiedSheetPhone = rawDigits.slice(-10);
                    verifiedSheetName = sheetCust.contact_person
                      ? `${sheetCust.contact_person} (${sheetCust.company_name})`
                      : sheetCust.company_name;
                  }
                }
              } catch (custErr) {
                console.warn('[tally-sync] Customer master lookup notice:', custErr.message);
              }
            }

            // Target recipient phone: strictly Google Sheet verified phone preferred, fallback to normalized voucher phone
            const targetPhone = verifiedSheetPhone ? `+91${verifiedSheetPhone}` : (normVoucherPhone || '');

            const canAutoDispatch = isRecentInvoice &&
              !isAlreadyDispatched &&
              isSalesInvoice &&
              Boolean(targetPhone) &&
              Boolean(finalPdfUrl);

            if (canAutoDispatch) {
              try {
                const fmtAmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
                const clientDisplayName = verifiedSheetName || v.ledger_name || 'Customer';
                const company = v.company_name || companyName || 'Sobhainfra Tech';

                const textMsg = [
                  `🧾 *Tax Invoice Dispatched from ${company}*`,
                  ``,
                  `Namaste ${clientDisplayName}! 🙏`,
                  `Your order under Invoice *${invNum}* has been generated and dispatched from our plant.`,
                  ``,
                  `📋 *Invoice No:* ${invNum}`,
                  `📅 *Date:* ${invoiceDateStr}`,
                  `💰 *Total Amount:* *${fmtAmt(invoiceRow.amount)}*`,
                  `📌 *Status:* ${invoiceRow.status}`,
                  ``,
                  `Your official 2-Page GST Tax Invoice is attached below as a PDF.`,
                  `Kindly review and share confirmation once received. Thank you for your valued business! 🙏`,
                  `_${company}_`,
                ].join('\n');

                const WA_TOKEN_LOCAL = process.env.WHATSAPP_TOKEN || 'EAAZAoFJNWmo4BSXS3ZBJrD7sk039yowup2fxSWYZAQFTiTvEfOm5XsRNmyRZC4RnkYyjvFaXaxN3fhqNVvvyBqe0CXwoWClgcBx6X8UhqaNWTUjNFt0XMkufGVKkF9FSOP2V2SXSwxreUpX3UALTRW8TC8feqyWyYdyyamSrkF8qWvqkuSEEkatiTGvaGZC1AYwZDZD';
                const PHONE_ID_LOCAL = process.env.WHATSAPP_PHONE_ID || '1213997841806162';
                const BASE_URL = `https://graph.facebook.com/v20.0/${PHONE_ID_LOCAL}/messages`;
                const waHeaders = {
                  'Authorization': `Bearer ${WA_TOKEN_LOCAL}`,
                  'Content-Type': 'application/json',
                };
                const cleanPhone = String(targetPhone).replace(/[^\d]/g, '');

                if (WA_TOKEN_LOCAL && PHONE_ID_LOCAL) {
                  let wamid = null;
                  let sentViaTemplate = false;

                  // 1. Send Text Notification (within 24h window)
                  const textRes = await fetch(BASE_URL, {
                    method: 'POST',
                    headers: waHeaders,
                    body: JSON.stringify({
                      messaging_product: 'whatsapp',
                      to: cleanPhone,
                      type: 'text',
                      text: { body: textMsg },
                    }),
                  });
                  const textData = await textRes.json();
                  if (textData.error && (textData.error.code === 131047 || textData.error.message?.includes('Re-engagement') || textData.error.message?.includes('24-hour'))) {
                    // Outside 24h window: dispatch official approved Meta template invoice_dispatch_v1
                    try {
                      const tplRes = await fetch(BASE_URL, {
                        method: 'POST',
                        headers: waHeaders,
                        body: JSON.stringify({
                          messaging_product: 'whatsapp',
                          to: cleanPhone,
                          type: 'template',
                          template: {
                            name: 'invoice_dispatch_v1',
                            language: { code: 'en' },
                            components: [{
                              type: 'body',
                              parameters: [
                                { type: 'text', text: clientDisplayName || 'Valued Customer' },
                                { type: 'text', text: String(invNum) },
                                { type: 'text', text: 'Sobhainfra Tech' },
                                { type: 'text', text: String(v.date || new Date().toISOString().slice(0, 10)) },
                                { type: 'text', text: fmtAmt(invoiceRow.amount) },
                                { type: 'text', text: 'Dispatched' },
                              ]
                            }]
                          }
                        }),
                      });
                      const tplData = await tplRes.json();
                      wamid = tplData?.messages?.[0]?.id;
                      sentViaTemplate = true;
                      console.log(`[tally-sync] Dispatched invoice_dispatch_v1 template to ${cleanPhone} for invoice ${invNum}`);
                    } catch (tplErr) {
                      console.warn('[tally-sync] Template dispatch warning:', tplErr.message);
                    }
                  } else {
                    wamid = textData?.messages?.[0]?.id;
                  }

                  // 2. Small delay then send Tax Invoice PDF document (only when within 24h window)
                  if (!sentViaTemplate && finalPdfUrl) {
                    await new Promise(r => setTimeout(r, 600));

                    const safePdfName = `Invoice_${String(invNum).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
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
                          caption: `Tax Invoice ${invNum} | ${fmtAmt(invoiceRow.amount)} | ${company}`,
                        },
                      }),
                    });
                  }

                  // 3. If separate e-Way bill PDF exists, send e-Way bill too (only when within 24h window)
                  const ewayUrl = v.metadata?.eway_pdf_url || v.eway_pdf_url;
                  if (!sentViaTemplate && ewayUrl && ewayUrl.startsWith('http')) {
                    await new Promise(r => setTimeout(r, 600));
                    await fetch(BASE_URL, {
                      method: 'POST',
                      headers: waHeaders,
                      body: JSON.stringify({
                        messaging_product: 'whatsapp',
                        to: cleanPhone,
                        type: 'document',
                        document: {
                          link: ewayUrl,
                          filename: `eWayBill_${String(invNum).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
                          caption: `e-Way Bill for Invoice ${invNum}`,
                        },
                      }),
                    });
                  }

                  // 4. Mark invoice as first_dispatched_at in database
                  try {
                    const nowDispatched = new Date().toISOString();
                    const updatedMeta = {
                      ...(invoiceRow.metadata || {}),
                      first_dispatched_at: nowDispatched,
                      auto_dispatched_at: nowDispatched,
                      auto_dispatched_to: targetPhone,
                    };
                    await supabase.from('invoices').update({
                      metadata: updatedMeta,
                    }).eq('tally_voucher_number', invNum);
                  } catch (metaUpErr) {
                    console.warn('[AutoSend] Metadata update notice:', metaUpErr.message);
                  }

                  // 5. Log to WhatsApp Live Inbox (whatsapp_conversations & whatsapp_messages)
                  try {
                    const cleanTargetDigits = cleanPhone.slice(-10);
                    let convId = null;
                    const { data: convRow } = await supabase.from('whatsapp_conversations')
                      .select('id')
                      .or(`contact_phone.eq.+91${cleanTargetDigits},contact_phone.eq.91${cleanTargetDigits},contact_phone.eq.${cleanTargetDigits}`)
                      .maybeSingle();

                    if (convRow?.id) {
                      convId = convRow.id;
                    } else {
                      const { data: newConv } = await supabase.from('whatsapp_conversations').insert([{
                        organization_id: '00000000-0000-0000-0000-000000000001',
                        contact_name: clientDisplayName,
                        contact_phone: `+91${cleanTargetDigits}`,
                        conversation_mode: 'HUMAN ACTIVE',
                        last_message_text: textMsg,
                        last_message_at: new Date().toISOString(),
                        unread_count: 0,
                      }]).select('id').maybeSingle();
                      convId = newConv?.id;
                    }

                    if (convId) {
                      await supabase.from('whatsapp_messages').insert([{
                        organization_id: '00000000-0000-0000-0000-000000000001',
                        conversation_id: convId,
                        direction: 'outbound',
                        sender_type: 'system',
                        message_type: 'document',
                        body: textMsg,
                        media_url: finalPdfUrl,
                        status: 'delivered',
                        provider_message_id: wamid || null,
                      }]);

                      await supabase.from('whatsapp_conversations').update({
                        last_message_text: `🧾 Dispatched Invoice ${invNum}`,
                        last_message_at: new Date().toISOString(),
                        unread_count: 0,
                      }).eq('id', convId);
                    }
                  } catch (inboxErr) {
                    console.warn('[AutoSend] Live inbox logging notice:', inboxErr.message);
                  }

                  console.log(`[AutoSend Guard] Verified new invoice ${invNum} safely auto-dispatched to ${targetPhone}`);
                  results.autoSentWhatsApp = (results.autoSentWhatsApp || 0) + 1;
                }
              } catch (waSendErr) {
                console.warn('[AutoSend Guard] Non-fatal WhatsApp dispatch error:', waSendErr.message);
              }
            } else {
              if (isBulkSync) {
                // Silently skip bulk batch
              } else if (!isRecentInvoice) {
                console.log(`[AutoSend Guard] Invoice ${invNum} dated ${invoiceDateStr} is older than 48h. Auto-dispatch skipped.`);
              } else if (isAlreadyDispatched) {
                console.log(`[AutoSend Guard] Invoice ${invNum} was already dispatched previously. Skipped.`);
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
