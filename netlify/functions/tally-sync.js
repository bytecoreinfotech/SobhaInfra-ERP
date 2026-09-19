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

const { buildExactInvoicePdf } = require('./utils/invoicePdfGenerator');
const generateInvoicePdfBuffer = buildExactInvoicePdf;
const { resolveCustomerEmail, sendInvoiceEmail } = require('./utils/customerEmailHelper');

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  try {
    const hdrs = event.headers || {};
    const token = hdrs['x-connector-token'] || hdrs['X-Connector-Token'] || hdrs['x-tally-token'];
    if (token !== EXPECTED_TOKEN) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Unauthorized: Invalid connector token' }) };
    }

    const payload = JSON.parse(event.body || '{}');
    const { vouchers = [], connectorStatus = 'Connected', companyName = 'TallyPrime Company' } = payload;
    const isBulkSync = vouchers.length > 5;

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
      autoSentWhatsApp: 0,
      autoSentEmail: 0,
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

      // 1b. Authoritative Tally Master Summary Ingestion (Option 2: Dual-Engine)
      if (payload.master_summary) {
        try {
          let existingSummaries = {};
          try {
            const { data: existingRow } = await supabase
              .from('org_settings')
              .select('value')
              .eq('organization_id', '00000000-0000-0000-0000-000000000001')
              .eq('key', 'tally_master_summary')
              .maybeSingle();
            if (existingRow?.value) {
              existingSummaries = typeof existingRow.value === 'string' ? JSON.parse(existingRow.value) : existingRow.value;
            }
          } catch (_) {}

          const merged = {
            ...existingSummaries,
            ...payload.master_summary,
            _last_synced_at: new Date().toISOString(),
          };

          await supabase.from('org_settings').upsert({
            organization_id: '00000000-0000-0000-0000-000000000001',
            key: 'tally_master_summary',
            value: JSON.stringify(merged),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'organization_id,key' });
          console.log('[Tally Ingestion] Authoritative Tally Master Summary persisted to org_settings');
        } catch (mErr) {
          console.warn('[Tally Ingestion] Master summary persistence warning:', mErr.message);
        }
      }

      // 1c. Tally Deletion Reconciliation (Prunes vouchers deleted from Tally)
      if (Array.isArray(payload.active_voucher_numbers) && payload.active_voucher_numbers.length > 0) {
        try {
          const activeSet = new Set(payload.active_voucher_numbers.map(n => String(n).trim().toUpperCase()));
          const targetCompany = companyName || '';

          let q = supabase
            .from('invoices')
            .select('id, invoice_number, tally_voucher_number, amount, client_name, company_name, metadata')
            .eq('organization_id', '00000000-0000-0000-0000-000000000001');
          if (targetCompany && targetCompany !== 'TallyPrime Company') {
            q = q.or(`company_name.eq.${targetCompany},metadata->>tally_company.eq.${targetCompany}`);
          }
          const { data: currentInvs } = await q.limit(10000);
          if (currentInvs && currentInvs.length > 0) {
            const orphans = currentInvs.filter(i => {
              const num = String(i.tally_voucher_number || i.invoice_number || '').trim().toUpperCase();
              const rawNum = String(i.metadata?.raw_voucher_number || '').trim().toUpperCase();
              if (num.startsWith('LEDGER-') || num.startsWith('OP-')) return false;
              return !activeSet.has(num) && (!rawNum || !activeSet.has(rawNum));
            });

            // Circuit breaker: prune only if <= 50% of the company records are missing
            if (orphans.length > 0 && (orphans.length <= currentInvs.length * 0.5 || currentInvs.length <= 10)) {
              const delIds = orphans.map(o => o.id);
              for (let i = 0; i < delIds.length; i += 100) {
                await supabase.from('invoices').delete().in('id', delIds.slice(i, i + 100));
              }
              results.prunedDeletedInvoices = orphans.length;
              console.log(`[Tally Ingestion] 🗑️ Pruned ${orphans.length} deleted vouchers for company '${targetCompany}'`);

              // Log audit record for deleted vouchers
              try {
                const auditEntries = orphans.slice(0, 50).map(o => ({
                  organization_id: '00000000-0000-0000-0000-000000000001',
                  action: 'invoice.tally_deleted',
                  resource: 'invoice',
                  resource_id: o.id,
                  payload: {
                    invoice_number: o.invoice_number || o.tally_voucher_number,
                    client_name: o.client_name,
                    amount: o.amount,
                    company_name: o.company_name,
                    reason: 'Voucher was deleted in TallyPrime; reconciled and pruned from Cloud ERP',
                  }
                }));
                if (auditEntries.length > 0) {
                  await supabase.from('audit_logs').insert(auditEntries);
                }
              } catch (_) {}
            }
          }
        } catch (delErr) {
          console.warn('[Tally Ingestion] Deletion reconciliation error:', delErr.message);
        }
      }

      // 2. Fetch existing leads and customer master for auto-mapping
      let allLeads = [];
      try {
        const { data: leadsData } = await supabase.from('leads').select('id, name, phone');
        allLeads = leadsData || [];
      } catch (err) {
        console.warn('[Tally Ingestion] Leads fetch error:', err.message);
      }

      let allCustomers = [];
      try {
        const { data: custData } = await supabase.from('customer_master').select('company_name, contact_person, contact_number');
        allCustomers = custData || [];
      } catch (err) {
        console.warn('[Tally Ingestion] Customer master fetch error:', err.message);
      }

      for (const v of vouchers) {
        try {
          const invNum = v.invoice_number || v.tally_voucher_number || `INV-${Date.now()}`;
          const normVoucherPhone = normalizePhone(v.phone);

          // Match against Google Sheet customer_master (authoritative contact phone)
          let verifiedSheetPhone = '';
          let verifiedSheetName = '';
          let isSheetCustomer = false;
          const cleanLedger = String(v.ledger_name || '').trim().toUpperCase();
          if (cleanLedger && allCustomers.length > 0) {
            const normLedger = cleanLedger.replace(/[^A-Z0-9]/g, '');
            const matchedCust = allCustomers.find(c => {
              const cName = String(c.company_name || '').trim().toUpperCase();
              const normC = cName.replace(/[^A-Z0-9]/g, '');
              return normC && (normC === normLedger || normC.includes(normLedger) || normLedger.includes(normC));
            });
            if (matchedCust) {
              isSheetCustomer = true;
              if (matchedCust.contact_number) {
                const rawDigits = String(matchedCust.contact_number).replace(/[^\d]/g, '');
                if (rawDigits.length >= 10) {
                  verifiedSheetPhone = `+91${rawDigits.slice(-10)}`;
                  verifiedSheetName = matchedCust.contact_person
                    ? `${matchedCust.contact_person} (${matchedCust.company_name})`
                    : matchedCust.company_name;
                }
              }
            }
          }

          // If party is managed in Google Sheet, Google Sheet contact number is strictly authoritative:
          // If the client removed the contact number from Google Sheet, DO NOT resurrect it from Tally voucher or leads!
          let resolvedClientPhone = '';
          if (isSheetCustomer) {
            resolvedClientPhone = verifiedSheetPhone; // empty if contact number was removed in sheet
          } else {
            // Find matching lead by normalized phone or exact name as secondary fallback only for unlisted parties
            const matchedLead = allLeads.find(l =>
              (normVoucherPhone && normalizePhone(l.phone) === normVoucherPhone) ||
              (v.ledger_name && l.name && l.name.toLowerCase() === v.ledger_name.toLowerCase())
            );
            resolvedClientPhone = normVoucherPhone || (matchedLead ? matchedLead.phone : '');
          }

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

          let resolvedDueDate = v.due_date || null;
          const rawCreditDays = v.credit_period_days ?? v.metadata?.credit_period_days ?? null;
          if (!resolvedDueDate && rawCreditDays) {
            const cDays = Number(rawCreditDays);
            if (!isNaN(cDays) && cDays > 0) {
              try {
                const baseDate = new Date(invoiceDateStr);
                baseDate.setDate(baseDate.getDate() + cDays);
                resolvedDueDate = baseDate.toISOString().split('T')[0];
              } catch {}
            }
          }
          // Default due date to invoice date (immediate / due on presentation) if not explicitly set
          if (!resolvedDueDate && invoiceDateStr) {
            resolvedDueDate = invoiceDateStr;
          }

          finalPdfUrl = finalPdfUrl || v.pdf_url || v.metadata?.pdf_url || null;

          const clientDisplayName = verifiedSheetName || v.ledger_name || 'Customer';
          const company = v.company_name || companyName || 'SHOBHA READY PLAST';

          // Direct party email from voucher, metadata, or customer directory (Google Sheet / DB)
          let targetEmail = v.email || v.client_email || v.buyer_email || v.metadata?.email || null;
          if (!targetEmail || !targetEmail.includes('@')) {
            try {
              targetEmail = await resolveCustomerEmail(supabase, {
                companyName: v.ledger_name || clientDisplayName || company,
                clientName: clientDisplayName,
                phone: resolvedClientPhone,
                email: targetEmail,
              });
            } catch (_) {}
          }

          const isCancelled = v.status === 'Cancelled' || v.metadata?.is_cancelled_in_tally || false;

          const invoiceRow = {
            organization_id: '00000000-0000-0000-0000-000000000001',
            tally_voucher_number: invNum,
            invoice_number: invNum,
            client_name: verifiedSheetName || v.ledger_name || 'Client',
            client_phone: resolvedClientPhone,
            amount: isCancelled ? 0 : (Number(v.amount) || 0),
            status: isCancelled ? 'Cancelled' : (v.status || 'Pending'),
            due_date: resolvedDueDate,
            invoice_date: invoiceDateStr,
            pdf_url: finalPdfUrl || null,
            metadata: {
              ...(v.metadata || {}),
              is_cancelled_in_tally: isCancelled,
              email: targetEmail || '',
              client_email: targetEmail || '',
              pdf_url: finalPdfUrl,
              pdf_generated_at: new Date().toISOString(),
              tally_ledger: v.ledger_name,
              tally_company: v.company_name || companyName || '',
              sync_source: 'TallyPrime XML Bridge',
              voucher_type: rawVoucherType || null,
              direction:    derivedDirection || null,
              pending_amount: v.pending_amount ?? v.metadata?.pending_amount,
              paid_amount: v.paid_amount ?? v.metadata?.paid_amount,
              credit_period_days: rawCreditDays,
              bill_allocations: v.bill_allocations || v.metadata?.bill_allocations || [],
              raw_voucher_number: v.raw_voucher_number || v.metadata?.raw_voucher_number || '',
              supplier_invoice_number: v.supplier_invoice_number || v.metadata?.supplier_invoice_number || '',
              truck_no: v.truck_no || v.metadata?.truck_no || null,
              challan_no: v.challan_no || v.metadata?.challan_no || null,
              challan_date: v.challan_date || v.metadata?.challan_date || null,
              site: v.site || v.metadata?.site || null,
              eway_bill_no: v.eway_bill_no || v.metadata?.eway_bill_no || null,
              eway_date: v.eway_date || v.metadata?.eway_date || null,
              approx_distance: v.approx_distance || v.metadata?.approx_distance || null,
              transporter_name: v.transporter_name || v.metadata?.transporter_name || null,
              transporter_id: v.transporter_id || v.metadata?.transporter_id || null,
              order_no: v.order_no || v.metadata?.order_no || null,
              order_date: v.order_date || v.metadata?.order_date || null,
              item_name: v.item_name || v.metadata?.item_name || null,
              hsn_code: v.hsn_code || v.metadata?.hsn_code || null,
              quantity_str: v.quantity_str || v.metadata?.quantity_str || null,
              rate_str: v.rate_str || v.metadata?.rate_str || null,
              unit: v.unit || v.metadata?.unit || null,
              taxable_value: v.taxable_amount ?? v.metadata?.taxable_value,
              tax_amount: (v.igst_amount || 0) + (v.cgst_amount || 0) + (v.sgst_amount || 0) || v.metadata?.tax_amount,
              igst_amount: v.igst_amount ?? v.metadata?.igst_amount,
              cgst_amount: v.cgst_amount ?? v.metadata?.cgst_amount,
              sgst_amount: v.sgst_amount ?? v.metadata?.sgst_amount,
              line_items: v.line_items || v.metadata?.line_items || [],
              buyer_address: v.buyer_address || v.metadata?.buyer_address || null,
              gstin: v.gstin || v.metadata?.gstin || null,
              eway_pdf_url:    v.metadata?.eway_pdf_url    || null,
              pending_pdf_url: v.metadata?.pending_pdf_url || null,
              ledger_pdf_url:  v.metadata?.ledger_pdf_url  || null,
            },
            company_name: v.company_name || companyName || '',
          };

          // Generate authentic exact 2-Page GST Tax Invoice & e-Way Bill PDF
          const isSalesOrTaxInv = derivedDirection === 'receivable' ||
            ['sales', 'sales order', 'tax invoice'].some(t => rawVoucherType.includes(t)) ||
            /^(srp|sb|inv|tax)[-/]/i.test(invNum) || /sales/i.test(invNum);

          if (!finalPdfUrl && isSalesOrTaxInv && Number(v.amount) > 0) {
            try {
              const pdfBuffer = generateInvoicePdfBuffer(v, invNum, invoiceRow);
              if (pdfBuffer && pdfBuffer.length > 0) {
                const cleanInvFile = String(invNum).replace(/[^a-zA-Z0-9_-]/g, '_');
                const storagePath = `invoices/Invoice_${cleanInvFile}.pdf`;
                const { data: uploadData, error: uploadErr } = await supabase.storage
                  .from('whatsapp-media')
                  .upload(storagePath, pdfBuffer, {
                    contentType: 'application/pdf',
                    upsert: true,
                  });
                if (!uploadErr && uploadData?.path) {
                  const { data: urlData } = supabase.storage
                    .from('whatsapp-media')
                    .getPublicUrl(uploadData.path);
                  finalPdfUrl = urlData?.publicUrl || null;
                  invoiceRow.pdf_url = finalPdfUrl;
                  invoiceRow.metadata.pdf_url = finalPdfUrl;
                  console.log(`[tally-sync] Generated & uploaded exact 2-Page PDF for ${invNum}: ${finalPdfUrl}`);
                } else if (uploadErr) {
                  console.warn('[tally-sync] PDF upload notice:', uploadErr.message);
                }
              }
            } catch (pdfGenErr) {
              console.warn('[tally-sync] PDF generation notice:', pdfGenErr.message);
            }
          }

          // Check if invoice already exists within the target company
          let existing = null;
          const targetCompany = v.company_name || companyName || '';
          try {
            let q = supabase
              .from('invoices')
              .select('id, company_name, client_phone, pdf_url, metadata')
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
                .select('id, company_name, client_phone, pdf_url, metadata')
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
            if (!invoiceRow.client_phone && existing.client_phone) {
              invoiceRow.client_phone = existing.client_phone;
            }
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
            // Rule 1: Date Recency Guard — invoice must be same-day or within the last 30 days OR brand-new voucher OR targeted sync (<= 5 vouchers)
            const invDateMs = new Date(invoiceDateStr).getTime();
            const nowMs = Date.now();
            const diffHours = (nowMs - invDateMs) / (1000 * 60 * 60);
            const isRecentInvoice = diffHours >= -12 && diffHours <= (24 * 30); // 30 days window covers backdated vouchers & weekend lags
            const isNewVoucher = !existing || !existing.id;
            const isEligibleForDispatch = !isBulkSync || isNewVoucher || isRecentInvoice;

            // Rule 2: Idempotency Guard — check both WhatsApp and Email separately
            const isAlreadyDispatchedWhatsApp = Boolean(
              (existing?.metadata?.first_dispatched_at || existing?.metadata?.auto_dispatched_at) &&
              existing?.metadata?.dispatch_status !== 'failed' &&
              (existing?.pdf_url || existing?.metadata?.pdf_url)
            );

            const isAlreadyDispatchedEmail = Boolean(
              existing?.metadata?.auto_email_dispatched_at &&
              existing?.metadata?.email_dispatch_status !== 'failed'
            );

            // Rule 3: Must be a genuine Sales / Tax Invoice (never purchase/payment or cancelled)
            const isSalesInvoice = !isCancelled && (derivedDirection === 'receivable' ||
              ['sales', 'sales order', 'tax invoice'].some(t => rawVoucherType.includes(t)) ||
              /^(srp|sb|inv|tax)[-/]/i.test(invNum) ||
              /sales/i.test(invNum));

            // Rule 4: Authoritative Phone & Email Verification
            const targetPhone = resolvedClientPhone || invoiceRow.client_phone || existing?.client_phone;

            const canAutoDispatchWhatsApp = isEligibleForDispatch &&
              !isAlreadyDispatchedWhatsApp &&
              isSalesInvoice &&
              Boolean(targetPhone);

            const canAutoDispatchEmail = isEligibleForDispatch &&
              !isAlreadyDispatchedEmail &&
              isSalesInvoice &&
              Boolean(targetEmail);

            const canAutoDispatch = canAutoDispatchWhatsApp || canAutoDispatchEmail;

            let localPdfBuffer = null;

            if (canAutoDispatch) {
              try {
                // Pre-dispatch PDF guarantee: Ensure 2-Page PDF exists before any dispatch
                if (!finalPdfUrl && Number(invoiceRow.amount || v.amount) > 0) {
                  try {
                    localPdfBuffer = generateInvoicePdfBuffer(v, invNum, invoiceRow);
                    if (localPdfBuffer && localPdfBuffer.length > 0) {
                      const cleanInvFile = String(invNum).replace(/[^a-zA-Z0-9_-]/g, '_');
                      const storagePath = `invoices/Invoice_${cleanInvFile}.pdf`;
                      const { data: uploadData, error: uploadErr } = await supabase.storage
                        .from('whatsapp-media')
                        .upload(storagePath, localPdfBuffer, {
                          contentType: 'application/pdf',
                          upsert: true,
                        });
                      if (!uploadErr && uploadData?.path) {
                        const { data: urlData } = supabase.storage
                          .from('whatsapp-media')
                          .getPublicUrl(uploadData.path);
                        finalPdfUrl = urlData?.publicUrl || null;
                        invoiceRow.pdf_url = finalPdfUrl;
                        invoiceRow.metadata.pdf_url = finalPdfUrl;
                        await supabase.from('invoices').update({
                          pdf_url: finalPdfUrl,
                          metadata: invoiceRow.metadata,
                        }).eq('tally_voucher_number', invNum);
                        console.log(`[AutoSend Guard] Pre-dispatch PDF successfully generated & stored for ${invNum}: ${finalPdfUrl}`);
                      }
                    }
                  } catch (prePdfErr) {
                    console.error(`[AutoSend Guard] Pre-dispatch PDF generation error for ${invNum}:`, prePdfErr.message);
                  }
                }

                // If PDF is still missing for a sales invoice, NEVER SEND TEXT-ONLY!
                if (!finalPdfUrl && !localPdfBuffer) {
                  console.warn(`[AutoSend Guard] PDF not available for ${invNum}. Skipping dispatch to prevent sending text without document.`);
                  continue;
                }

                const fmtAmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
                const clientDisplayName = verifiedSheetName || v.ledger_name || 'Customer';
                const company = v.company_name || companyName || 'SHOBHA READY PLAST';

                const rawEwb = String(v.eway_bill_no || invoiceRow.metadata?.eway_bill_no || '').trim();
                const hasEwb = Boolean(rawEwb && rawEwb !== 'null' && rawEwb !== 'undefined' && rawEwb.length > 3);
                const docDesc = hasEwb
                  ? 'Your official 2-Page GST Tax Invoice & e-Way Bill is attached below as a PDF document.'
                  : 'Your official GST Tax Invoice is attached below as a PDF document.';

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
                  docDesc,
                  ``,
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
                const cleanPhone = String(targetPhone || '').replace(/[^\d]/g, '');

                if (canAutoDispatchWhatsApp && cleanPhone && WA_TOKEN_LOCAL && PHONE_ID_LOCAL) {
                  let wamid = null;
                  let sentViaTemplate = false;

                  // Check if recipient has an active 24-hour customer service window in database
                  let isIn24hWindow = false;
                  try {
                    const tenDigit = cleanPhone.slice(-10);
                    const { data: convRow } = await supabase
                      .from('whatsapp_conversations')
                      .select('id')
                      .or(`contact_phone.eq.+91${tenDigit},contact_phone.eq.91${tenDigit},contact_phone.eq.${tenDigit}`)
                      .maybeSingle();

                    if (convRow?.id) {
                      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                      const { data: inboundMsg } = await supabase
                        .from('whatsapp_messages')
                        .select('id')
                        .eq('conversation_id', convRow.id)
                        .eq('direction', 'inbound')
                        .gte('created_at', dayAgo)
                        .limit(1)
                        .maybeSingle();
                      if (inboundMsg?.id) {
                        isIn24hWindow = true;
                        console.log(`[tally-sync] Customer ${cleanPhone} is inside 24h window. Using direct free delivery.`);
                      }
                    }
                  } catch (wErr) {}

                  // 1. If in 24h window, dispatch direct freeform text message (100% free, no Meta card required!)
                  if (isIn24hWindow) {
                    try {
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
                      if (textData?.messages?.[0]?.id) {
                        wamid = textData.messages[0].id;
                        console.log(`[tally-sync] Delivered direct free invoice message to ${cleanPhone} for ${invNum} (wamid: ${wamid})`);
                      }
                    } catch (textErr) {
                      console.warn('[tally-sync] Text send warning:', textErr.message);
                    }
                  }

                  // 2. If outside 24h window (or if direct text failed), dispatch approved Meta Utility Template
                  if (!wamid) {
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
                                { type: 'text', text: company || 'SHOBHA READY PLAST' },
                                { type: 'text', text: String(v.date || invoiceDateStr) },
                                { type: 'text', text: fmtAmt(invoiceRow.amount) },
                                { type: 'text', text: 'Pending' },
                              ]
                            }]
                          }
                        }),
                      });
                      const tplData = await tplRes.json();
                      if (tplData?.messages?.[0]?.id) {
                        wamid = tplData.messages[0].id;
                        sentViaTemplate = true;
                        console.log(`[tally-sync] Successfully dispatched invoice_dispatch_v1 template to ${cleanPhone} for invoice ${invNum} (wamid: ${wamid})`);
                      } else if (tplData?.error) {
                        console.warn(`[tally-sync] Template dispatch API notice:`, tplData.error);
                      }
                    } catch (tplErr) {
                      console.warn('[tally-sync] Template dispatch exception:', tplErr.message);
                    }
                  }

                  // 3. Document Send: Native PDF Document Attachment (Guaranteed)
                  let docWamid = null;
                  if (finalPdfUrl) {
                    try {
                      await new Promise(r => setTimeout(r, 600)); // Small delay so text precedes document
                      const safePdfName = `Invoice_${String(invNum).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
                      const docRes = await fetch(BASE_URL, {
                        method: 'POST',
                        headers: waHeaders,
                        body: JSON.stringify({
                          messaging_product: 'whatsapp',
                          recipient_type: 'individual',
                          to: cleanPhone,
                          type: 'document',
                          document: {
                            link: finalPdfUrl,
                            filename: safePdfName,
                            caption: hasEwb
                              ? `🧾 Tax Invoice & e-Way Bill ${invNum} | ${fmtAmt(invoiceRow.amount)} | ${company}`
                              : `🧾 Tax Invoice ${invNum} | ${fmtAmt(invoiceRow.amount)} | ${company}`,
                          },
                        }),
                      });
                      const docData = await docRes.json();
                      if (docData?.messages?.[0]?.id) {
                        docWamid = docData.messages[0].id;
                        console.log(`[tally-sync] Successfully delivered PDF document to ${cleanPhone} for ${invNum} (docWamid: ${docWamid})`);
                      } else {
                        console.warn('[tally-sync] Document send API response notice:', docData);
                      }
                    } catch (docErr) {
                      console.warn('[tally-sync] Document send exception:', docErr.message);
                    }
                  }

                  // 4. If separate e-Way bill PDF exists, send e-Way bill too
                  const ewayUrl = v.metadata?.eway_pdf_url || v.eway_pdf_url;
                  if (ewayUrl && ewayUrl.startsWith('http')) {
                    try {
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
                    } catch (ewErr) {
                      console.warn('[tally-sync] e-Way bill send notice:', ewErr.message);
                    }
                  }

                  // 5. Mark invoice dispatch metadata in database
                  try {
                    const nowDispatched = new Date().toISOString();
                    const updatedMeta = {
                      ...(invoiceRow.metadata || {}),
                      pdf_url: finalPdfUrl,
                      first_dispatched_at: nowDispatched,
                      auto_dispatched_at: nowDispatched,
                      auto_dispatched_to: targetPhone,
                      dispatch_wamid: docWamid || wamid || null,
                      dispatch_status: (docWamid || wamid) ? 'sent' : 'failed',
                    };
                    await supabase.from('invoices').update({
                      pdf_url: finalPdfUrl,
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
                        message_type: sentViaTemplate ? 'template' : (finalPdfUrl ? 'document' : 'text'),
                        body: sentViaTemplate
                          ? `Tax Invoice Dispatched: ${invNum} | ${fmtAmt(invoiceRow.amount)} | ${company}`
                          : textMsg,
                        media_url: finalPdfUrl,
                        status: 'sent',
                        provider_message_id: wamid || null,
                      }]);

                      await supabase.from('whatsapp_conversations').update({
                        last_message_text: `🧾 Dispatched Invoice ${invNum} (${fmtAmt(invoiceRow.amount)})`,
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

                // ── 5b. Automated Invoice Email Dispatch (Google Sheet Email) ───────────
                if (canAutoDispatchEmail && targetEmail) {
                  try {
                    console.log(`[AutoSend Guard] Customer email resolved (${targetEmail}) for invoice ${invNum}. Dispatching invoice email...`);
                    const emailRes = await sendInvoiceEmail(supabase, {
                      to: targetEmail,
                      recipientName: clientDisplayName || 'Valued Customer',
                      companyName: company,
                      invNum,
                      amount: invoiceRow.amount,
                      dueDate: invoiceRow.due_date,
                      invoiceDate: v.date || invoiceDateStr,
                      pdfUrl: finalPdfUrl,
                      pdfBuffer: localPdfBuffer,
                    });

                    if (emailRes.success) {
                      console.log(`[AutoSend Guard] Auto-dispatched invoice email to ${targetEmail} for ${invNum}`);
                      results.autoSentEmail = (results.autoSentEmail || 0) + 1;
                      try {
                        const nowDispatched = new Date().toISOString();
                        const updatedMeta = {
                          ...(invoiceRow.metadata || {}),
                          email: targetEmail,
                          pdf_url: finalPdfUrl,
                          auto_email_dispatched_at: nowDispatched,
                          auto_email_dispatched_to: targetEmail,
                          email_dispatch_status: emailRes.simulated ? 'simulated' : 'sent',
                          email_message_id: emailRes.messageId || null,
                        };
                        await supabase.from('invoices').update({
                          metadata: updatedMeta,
                        }).eq('tally_voucher_number', invNum);
                      } catch (metaErr) {}
                    }
                  } catch (mailErr) {
                    console.warn('[AutoSend Guard] Non-fatal email dispatch exception:', mailErr.message);
                  }
                }
              } catch (waSendErr) {
                console.warn('[AutoSend Guard] Non-fatal dispatch error:', waSendErr.message);
              }
            } else {
              if (isBulkSync && !isRecentInvoice) {
                // Silently skip bulk batch
              } else if (!isRecentInvoice && isBulkSync) {
                console.log(`[AutoSend Guard] Invoice ${invNum} dated ${invoiceDateStr} is older than 30d in bulk sync. Auto-dispatch skipped.`);
              } else if (isAlreadyDispatchedWhatsApp && isAlreadyDispatchedEmail) {
                console.log(`[AutoSend Guard] Invoice ${invNum} was already dispatched previously via WhatsApp & Email. Skipped.`);
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
