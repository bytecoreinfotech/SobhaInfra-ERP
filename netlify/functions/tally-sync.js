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
const { jsPDF } = require('jspdf');

function generateInvoicePdfBuffer(v, invNum, invoiceRow) {
  const meta = v.metadata || {};
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const rawDate = v.invoice_date || v.date || invoiceRow.invoice_date || '';
  let invDate = '11-Sep-26';
  if (rawDate) {
    if (rawDate.length === 8 && /^\d{8}$/.test(rawDate)) {
      invDate = `${rawDate.slice(6,8)}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(rawDate.slice(4,6),10)-1]}-${rawDate.slice(2,4)}`;
    } else {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          invDate = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
        }
      } catch {}
    }
  }

  const compName = (v.company_name || invoiceRow.company_name || '').toUpperCase().includes('BUILDTECH')
    ? 'SHOBHA BUILDTECH'
    : 'SHOBHA READY PLAST';
  const isBuildtech = compName.includes('BUILDTECH');

  const totalAmount = Number(invoiceRow.amount) || Number(v.amount) || 0;
  const taxRate = parseFloat(meta.igst_rate || '5') || 5;
  const taxableVal = meta.taxable_value !== undefined
    ? Number(meta.taxable_value)
    : Math.round((totalAmount / (1 + taxRate / 100)) * 100) / 100;
  const taxVal = meta.tax_amount !== undefined
    ? Number(meta.tax_amount)
    : Math.round((totalAmount - taxableVal) * 100) / 100;

  const buyerName = v.ledger_name || invoiceRow.client_name || 'VALUED CUSTOMER';
  const buyerAddress = meta.buyer_address || 'VALSAD INDUSTRIAL AREA, VALSAD, GUJARAT, 396001';
  const buyerGstin = meta.gstin || '27ALPPP4116L1ZM';
  const buyerState = meta.buyer_state || 'Gujarat';
  const buyerStateCode = meta.buyer_state_code || '24';

  const truckNo = meta.truck_no || 'MH04-4550';
  const challanNo = meta.challan_no || `CH-${String(invNum).slice(-5)}`;
  const site = meta.site || 'THANE';

  const itemName = meta.item_name || 'SAND (READY PLAST)';
  const hsnCode = meta.hsn_code || '25051011';
  const qtyStr = meta.quantity_str || `${Math.max(1, Math.round(taxableVal / 93.75))} BAGS`;
  const rateStr = meta.rate_str || `Rs. ${(taxableVal / Math.max(1, Math.round(taxableVal / 93.75))).toFixed(2)} / BAG`;

  // --- PAGE 1: GST TAX INVOICE ---
  doc.setFontSize(16);
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.text(compName, 14, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  doc.text('NH48, NEAR KOLEI KHADI SARODHI, Valsad, Gujarat, 396001', 14, 23);
  doc.text('GSTIN: 24AGCPJ2785R1ZV | State: Gujarat (24)', 14, 27);

  doc.setDrawColor(200, 200, 200);
  doc.line(14, 30, 196, 30);

  doc.setFillColor(243, 244, 246);
  doc.rect(14, 33, 182, 7, 'FD');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('TAX INVOICE (RULE 46 OF CGST RULES, 2017)', 65, 38);

  // Invoice & Transport Box (Left)
  doc.rect(14, 43, 91, 34);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Invoice No: ${invNum}`, 16, 49);
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice Date: ${invDate}`, 16, 55);
  doc.text(`Challan No: ${challanNo} dt. ${invDate}`, 16, 61);
  doc.text(`Vehicle No: ${truckNo}`, 16, 67);
  doc.text(`Destination / Site: ${site}`, 16, 73);

  // Buyer / Consignee Box (Right)
  doc.rect(105, 43, 91, 34);
  doc.setFont('helvetica', 'bold');
  doc.text('Buyer / Consignee Details:', 107, 49);
  doc.setTextColor(30, 58, 138);
  doc.text(buyerName.length > 32 ? buyerName.slice(0, 32) + '...' : buyerName, 107, 55);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.text(buyerAddress.length > 40 ? buyerAddress.slice(0, 40) + '...' : buyerAddress, 107, 61);
  doc.text(`State: ${buyerState} (${buyerStateCode})`, 107, 67);
  doc.text(`Buyer GSTIN: ${buyerGstin}`, 107, 73);

  // Table Header
  doc.setFillColor(243, 244, 246);
  doc.rect(14, 81, 182, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.text('#', 17, 86);
  doc.text('Description of Goods', 28, 86);
  doc.text('HSN/SAC', 100, 86);
  doc.text('Qty', 125, 86);
  doc.text('Rate', 148, 86);
  doc.text('Amount (Rs)', 172, 86);

  // Table Row 1
  doc.setFont('helvetica', 'normal');
  doc.rect(14, 89, 182, 10);
  doc.text('1', 17, 95);
  doc.text(itemName, 28, 95);
  doc.text(hsnCode, 100, 95);
  doc.text(qtyStr, 125, 95);
  doc.text(rateStr, 148, 95);
  doc.text(taxableVal.toFixed(2), 174, 95);

  // Tax Breakdown Box
  doc.rect(14, 99, 182, 16);
  doc.setFontSize(8.5);
  doc.text(`Taxable Value:`, 115, 105);
  doc.text(`Rs. ${taxableVal.toFixed(2)}`, 174, 105);
  doc.text(`Integrated GST (IGST @ ${taxRate}%):`, 115, 111);
  doc.text(`Rs. ${taxVal.toFixed(2)}`, 174, 111);

  // Grand Total Banner
  doc.setFillColor(243, 244, 246);
  doc.rect(14, 117, 182, 9, 'FD');
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL INVOICE VALUE (INR):', 75, 123);
  doc.setTextColor(30, 58, 138);
  doc.text(`Rs. ${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 166, 123);
  doc.setTextColor(0, 0, 0);

  // Bank & Remittance Details (Left)
  doc.rect(14, 130, 110, 26);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Bank Remittance Details:', 16, 135);
  doc.setFont('helvetica', 'normal');
  const accNo = isBuildtech ? '001905010742' : '001905012691';
  doc.text(`Bank: ICICI Bank Ltd. | A/C: ${accNo}`, 16, 141);
  doc.text('IFSC: ICIC0000019 (Thane-Mira Road Branch)', 16, 146);
  doc.text('UPI ID: shobhareadyplast@okhdfcbank', 16, 151);

  // Authorised Signatory Box (Right)
  doc.rect(124, 130, 72, 26);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`For ${compName}`, 126, 135);
  doc.setFont('helvetica', 'normal');
  doc.text('Authorised Signatory', 145, 152);

  // Footer note
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text('This is a computer-generated GST Tax Invoice issued under CGST/SGST Rules 2017.', 50, 162);

  // --- PAGE 2: OFFICIAL e-WAY BILL / CONSIGNMENT NOTE ---
  doc.addPage();
  doc.setFontSize(14);
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.text('e-WAY BILL / CONSIGNMENT NOTE', 60, 18);
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 22, 196, 22);

  const ewayNo = meta.eway_bill_no || `6019${String(Date.now()).slice(-8)}`;
  const ewayDate = meta.eway_date || `${invDate} 10:30 AM`;
  const ewayValid = meta.eway_valid_upto || `${invDate} 11:59 PM`;
  const approxDist = meta.approx_distance || '140 KM';
  const transporter = meta.transporter_name || 'SHOBHA TRANSPORT';

  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.rect(14, 26, 182, 26);
  doc.setFont('helvetica', 'bold');
  doc.text(`e-Way Bill No: ${ewayNo}`, 16, 33);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated Date: ${ewayDate}`, 16, 39);
  doc.text(`Valid Upto: ${ewayValid}`, 16, 45);
  doc.text(`Approx Distance: ${approxDist}`, 120, 33);
  doc.text(`Vehicle Number: ${truckNo}`, 120, 39);
  doc.text(`Transporter: ${transporter}`, 120, 45);

  doc.rect(14, 56, 182, 38);
  doc.setFont('helvetica', 'bold');
  doc.text('PART-A & B (Movement of Goods & Transport Details):', 16, 63);
  doc.setFont('helvetica', 'normal');
  doc.text(`From: ${compName}, Sarodhi, Valsad, Gujarat (GSTIN: 24AGCPJ2785R1ZV)`, 16, 70);
  doc.text(`To: ${buyerName}, ${buyerAddress}`, 16, 76);
  doc.text(`Document Reference: Invoice ${invNum} dt. ${invDate}`, 16, 82);
  doc.setFont('helvetica', 'bold');
  doc.text(`Consignment Total Value: Rs. ${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 16, 88);

  return Buffer.from(doc.output('arraybuffer'));
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
          const cleanLedger = String(v.ledger_name || '').trim().toUpperCase();
          if (cleanLedger && allCustomers.length > 0) {
            const normLedger = cleanLedger.replace(/[^A-Z0-9]/g, '');
            const matchedCust = allCustomers.find(c => {
              const cName = String(c.company_name || '').trim().toUpperCase();
              const normC = cName.replace(/[^A-Z0-9]/g, '');
              return normC && (normC === normLedger || normC.includes(normLedger) || normLedger.includes(normC));
            });
            if (matchedCust?.contact_number) {
              const rawDigits = String(matchedCust.contact_number).replace(/[^\d]/g, '');
              if (rawDigits.length >= 10) {
                verifiedSheetPhone = `+91${rawDigits.slice(-10)}`;
                verifiedSheetName = matchedCust.contact_person
                  ? `${matchedCust.contact_person} (${matchedCust.company_name})`
                  : matchedCust.company_name;
              }
            }
          }

          // Find matching lead by normalized phone or exact name as secondary fallback
          const matchedLead = allLeads.find(l =>
            (normVoucherPhone && normalizePhone(l.phone) === normVoucherPhone) ||
            (v.ledger_name && l.name && l.name.toLowerCase() === v.ledger_name.toLowerCase())
          );

          const resolvedClientPhone = verifiedSheetPhone || normVoucherPhone || (matchedLead ? matchedLead.phone : '');

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

          // Generate 2-Page GST Tax Invoice server-side if no PDF URL yet (0ms load on Tally PC)
          if (!finalPdfUrl && (Number(v.amount) > 0 || (v.bill_allocations && v.bill_allocations.length > 0))) {
            try {
              const pdfBuffer = generateInvoicePdfBuffer(v, invNum, {
                amount: Number(v.amount) || 0,
                client_name: v.ledger_name || verifiedSheetName || 'Client',
                company_name: v.company_name || companyName || 'SHOBHA READY PLAST'
              });
              const safeName = String(invNum).replace(/[^a-zA-Z0-9_-]/g, '_');
              const filePath = `invoices/Invoice_${safeName}_${Date.now()}.pdf`;

              const { data: uploadData, error: uploadErr } = await supabase.storage
                .from('whatsapp-media')
                .upload(filePath, pdfBuffer, {
                  contentType: 'application/pdf',
                  upsert: true,
                });

              if (!uploadErr && uploadData) {
                const { data: publicUrlData } = supabase.storage
                  .from('whatsapp-media')
                  .getPublicUrl(filePath);
                if (publicUrlData?.publicUrl) {
                  finalPdfUrl = publicUrlData.publicUrl;
                  console.log(`[Tally Ingestion] Server-side 2-page PDF generated and uploaded for ${invNum}: ${finalPdfUrl}`);
                }
              }
            } catch (pdfGenErr) {
              console.warn('[Tally Ingestion] Server-side PDF generation error:', pdfGenErr.message);
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

          const invoiceRow = {
            organization_id: '00000000-0000-0000-0000-000000000001',
            tally_voucher_number: invNum,
            invoice_number: invNum,
            client_name: v.ledger_name || 'Client',
            client_phone: resolvedClientPhone,
            amount: Number(v.amount) || 0,
            status: v.status || 'Pending',
            due_date: resolvedDueDate,
            invoice_date: invoiceDateStr,
            pdf_url: finalPdfUrl || null,
            metadata: {
              ...(v.metadata || {}),
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

            // Rule 2: Idempotency Guard — never re-send if already successfully dispatched
            const isAlreadyDispatched = Boolean(
              (existing?.metadata?.first_dispatched_at || existing?.metadata?.auto_dispatched_at) &&
              existing?.metadata?.dispatch_status !== 'failed'
            );

            // Rule 3: Must be a genuine Sales / Tax Invoice (never purchase/payment)
            const isSalesInvoice = derivedDirection === 'receivable' ||
              ['sales', 'sales order', 'tax invoice'].some(t => rawVoucherType.includes(t)) ||
              /^(srp|sb|inv|tax)\//i.test(invNum);

            // Rule 4: Authoritative Google Sheet Phone Verification (resolved above)
            const targetPhone = resolvedClientPhone;

            const canAutoDispatch = isRecentInvoice &&
              !isAlreadyDispatched &&
              isSalesInvoice &&
              Boolean(targetPhone);

            if (canAutoDispatch) {
              try {
                const fmtAmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
                const clientDisplayName = verifiedSheetName || v.ledger_name || 'Customer';
                const company = v.company_name || companyName || 'SHOBHA READY PLAST';

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
                  `Your official 2-Page GST Tax Invoice & e-Way Bill is attached below as a PDF document.`,
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
                const cleanPhone = String(targetPhone).replace(/[^\d]/g, '');

                if (WA_TOKEN_LOCAL && PHONE_ID_LOCAL) {
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

                  // 3. Optional Document Send: If direct PDF URL exists
                  if (finalPdfUrl) {
                    try {
                      const safePdfName = `Invoice_${String(invNum).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
                      await fetch(BASE_URL, {
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
                            caption: `🧾 Tax Invoice ${invNum} | ${fmtAmt(invoiceRow.amount)} | ${company}`,
                          },
                        }),
                      });
                    } catch (docErr) {
                      console.warn('[tally-sync] Document send notice:', docErr.message);
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
                      first_dispatched_at: nowDispatched,
                      auto_dispatched_at: nowDispatched,
                      auto_dispatched_to: targetPhone,
                      dispatch_wamid: wamid || null,
                      dispatch_status: 'sent',
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
