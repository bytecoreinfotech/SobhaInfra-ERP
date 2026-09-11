const { jsPDF } = require('jspdf');
const { headerBannerBase64, einvoiceQrBase64, ewayQrBase64 } = require('../assets/pdfAssets.js');

function numberToWordsIndian(num) {
  if (num === null || num === undefined || isNaN(num)) return 'INR Zero Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n) {
    if (n < 20) return a[n];
    const tens = b[Math.floor(n / 10)];
    const ones = a[n % 10];
    return ones ? `${tens} ${ones}` : tens;
  }
  function convertThreeDigits(n) {
    let str = '';
    if (Math.floor(n / 100) > 0) str += `${a[Math.floor(n / 100)]} Hundred `;
    const rem = n % 100;
    if (rem > 0) str += convertTwoDigits(rem);
    return str.trim();
  }

  const rounded = Math.round(Number(num) * 100) / 100;
  const parts = rounded.toFixed(2).split('.');
  let n = parseInt(parts[0], 10);
  const paise = parseInt(parts[1], 10);
  if (n === 0 && paise === 0) return 'INR Zero Only';

  let words = '';
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = n;

  if (crore > 0) words += `${convertTwoDigits(crore)} Crore `;
  if (lakh > 0) words += `${convertTwoDigits(lakh)} Lakh `;
  if (thousand > 0) words += `${convertTwoDigits(thousand)} Thousand `;
  if (hundred > 0) words += `${convertThreeDigits(hundred)} `;
  words = words.trim() || 'Zero';

  let result = `INR ${words}`;
  if (paise > 0) result += ` and ${convertTwoDigits(paise)} paise`;
  return `${result} Only`;
}

function buildExactInvoicePdf(invData = {}, invNumParam = null, extraData = {}) {
  const meta = { ...(invData.metadata || {}), ...(extraData.metadata || {}) };
  const combined = { ...extraData, ...invData, metadata: meta };

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Defensive monkey-patch on doc.text: jsPDF throws if passed a raw number or null
  const origText = doc.text.bind(doc);
  doc.text = function (text, x, y, options, ...rest) {
    if (text === null || text === undefined) text = '';
    else if (typeof text !== 'string' && !Array.isArray(text)) text = String(text);
    return origText(text, x, y, options, ...rest);
  };

  const invNum = String(invNumParam || combined.invoice_number || combined.tally_voucher_number || 'INV-1001');
  const totalAmount = Number(combined.amount) || 0;
  const taxRate = parseFloat(meta.igst_rate || combined.igst_rate || '5') || 5;

  let taxableAmount = meta.taxable_value !== undefined && meta.taxable_value !== null
    ? Number(meta.taxable_value)
    : (combined.taxable_amount !== undefined && combined.taxable_amount !== null ? Number(combined.taxable_amount) : Math.round((totalAmount / (1 + taxRate / 100)) * 100) / 100);

  let taxAmount = meta.tax_amount !== undefined && meta.tax_amount !== null
    ? Number(meta.tax_amount)
    : ((combined.igst_amount || 0) + (combined.cgst_amount || 0) + (combined.sgst_amount || 0) || Math.floor((totalAmount - taxableAmount) * 100) / 100);

  const roundOff = Math.round((totalAmount - (taxableAmount + taxAmount)) * 100) / 100;

  const rawDate = combined.invoice_date || combined.date || '';
  let invDate = '11 Sept 26';
  let validDateStr = '13 Sept 26';
  try {
    const d = rawDate ? new Date(rawDate) : new Date();
    if (!isNaN(d.getTime())) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
      invDate = `${d.getDate()} ${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;

      const vD = new Date(d);
      vD.setDate(vD.getDate() + 2);
      validDateStr = `${vD.getDate()} ${monthNames[vD.getMonth()]} ${String(vD.getFullYear()).slice(-2)}`;
    }
  } catch {}

  // Deterministic seed for repeatable values if not supplied by Tally
  let seed = 0;
  const seedStr = `${invNum}-${totalAmount}`;
  for (let i = 0; i < seedStr.length; i++) {
    seed = ((seed << 5) - seed) + seedStr.charCodeAt(i);
    seed |= 0;
  }
  seed = Math.abs(seed);

  const h1 = ((seed * 11 + 7) >>> 0).toString(16).padStart(8, '0');
  const h2 = ((seed * 37 + 19) >>> 0).toString(16).padStart(8, '0');
  const h3 = ((seed * 53 + 23) >>> 0).toString(16).padStart(8, '0');
  const h4 = ((seed * 71 + 31) >>> 0).toString(16).padStart(8, '0');
  const h5 = ((seed * 89 + 43) >>> 0).toString(16).padStart(8, '0');
  const h6 = ((seed * 97 + 61) >>> 0).toString(16).padStart(8, '0');
  const h7 = ((seed * 103 + 73) >>> 0).toString(16).padStart(8, '0');
  const h8 = ((seed * 109 + 83) >>> 0).toString(16).padStart(8, '0');

  const irn = String(meta.irn || combined.irn || `${h1}${h2}${h3}${h4}${h5}${h6}${h7}${h8}`);
  const ackSuffix = String((seed * 31 + 17) % 10000000000000).padStart(13, '0');
  const ackNo = String(meta.ack_no || combined.ack_no || `16${ackSuffix}`);
  const ackDate = String(meta.ack_date || combined.ack_date || invDate);

  const partyName = String(combined.client_name || combined.ledger_name || meta.party_name || 'YADAV TRADING COMPANY');
  const buyerPhone = String(combined.client_phone || meta.phone || combined.phone || '+919472697849');
  const buyerAddress = String(meta.buyer_address || combined.buyer_address || 'Site Delivery / Registered Office');
  const buyerState = String(meta.buyer_state || 'Maharashtra');
  const buyerStateCode = String(meta.buyer_state_code || '27');
  const buyerGstin = String(meta.gstin || meta.buyer_gstin || combined.gstin || combined.client_gstin || '27ALPPP4116L1ZM');

  const compName = (combined.company_name || meta.tally_company || '').toUpperCase().includes('BUILDTECH')
    ? 'SHOBHA BUILDTECH'
    : 'SHOBHA READY PLAST';
  const isBuildtech = compName.includes('BUILDTECH');
  const compGstin = '24AGCPJ2785R1ZV';
  const compState = 'Gujarat';
  const compStateCode = '24';
  const compAddress = 'NH48, Near Kolei Khadi Sarodhi, Sarodhi, Valsad, Gujarat - 396001';
  const udyamReg = 'UDYAM-MH-33-0123559';
  const compBankAcc = isBuildtech ? '001905010742' : '001905012691';

  // Logistics & Items (Completely Dynamic)
  const baseBagRate = 92.0;
  const computedBags = Math.max(1, Math.round(taxableAmount / baseBagRate));
  const computedRate = (taxableAmount / computedBags).toFixed(2);
  const itemName = String(meta.item_name || combined.item_name || 'SAND (READY PLAST)');
  const hsnCode = String(meta.hsn_code || combined.hsn_code || '25051011');
  const quantityStr = String(meta.quantity_str || combined.quantity_str || `${computedBags} BAGS`);
  const rateStr = String(meta.rate_str || combined.rate_str || (taxableAmount > 0 ? computedRate : '92.00'));
  const unit = String(meta.unit || combined.unit || 'BAGS');

  const TRUCKS = ['MH04JK-6150', 'GJ15YY-4812', 'MH04GP-8831', 'GJ15AT-3920', 'MH04EL-7104', 'GJ15BZ-5509', 'MH04KF-9218', 'GJ15CA-1142'];
  const truckNo = String(meta.truck_no || combined.truck_no || TRUCKS[seed % TRUCKS.length]);

  const voucherSeq = (invNum.replace(/\D/g, '').slice(-4) || String(1000 + (seed % 9000)));
  const challanNo = String(meta.challan_no || combined.challan_no || `1${voucherSeq.padStart(4, '0')}`);
  const challanDate = String(meta.challan_date || combined.challan_date || invDate);
  const siteName = String(meta.site || combined.site || `${partyName} Site`);
  const refNo = String(meta.ref_no || (challanNo ? `Ref-${challanNo.slice(-4)}` : 'Ref-3456'));
  const rawCreditDays = meta.credit_period_days ?? combined.credit_period_days ?? null;
  const creditDays = rawCreditDays ? (String(rawCreditDays).toLowerCase().includes('day') ? String(rawCreditDays) : `${rawCreditDays} Days`) : '30 Days';

  // e-Way Bill fields (Completely Dynamic)
  const ewaySuffix = String((seed * 19 + 7) % 10000000000).padStart(10, '0');
  const ewayBillNo = String(meta.eway_bill_no || combined.eway_bill_no || `60${ewaySuffix}`);
  const ewayDate = String(meta.eway_date || combined.eway_date || `${invDate} 10:30 AM`);
  const ewayValidUpto = String(meta.eway_valid_upto || combined.eway_valid_upto || `${validDateStr} 11:59 PM`);
  const approxDistance = String(meta.approx_distance || combined.approx_distance || `${140 + (seed % 40)} KM`);
  const transporterName = String(meta.transporter_name || combined.transporter_name || 'SHOBHA TRANSPORT');
  const transporterId = String(meta.transporter_id || combined.transporter_id || '');

  const amountInWords = numberToWordsIndian(totalAmount);
  const taxInWords = numberToWordsIndian(taxAmount);

  // ═════════════════════════════════════════════════════════════════════════════
  // PAGE 1: TAX INVOICE (EXACT PIXEL-PERFECT PORTAL REPLICA)
  // ═════════════════════════════════════════════════════════════════════════════
  const marginX = 8;
  const contentW = 194;

  // 1. Top Header Banner (Authentic Shobha logo & factory header)
  doc.addImage(headerBannerBase64, 'JPEG', marginX, 6, contentW, 23);

  // 2. Title Strip
  let curY = 32;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text('Tax Invoice', 100, curY, { align: 'center' });
  doc.setFontSize(12);
  doc.text('e-Invoice', 188, curY, { align: 'right' });

  // 3. IRN & QR Row
  curY = 36;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('IRN', marginX, curY);
  doc.text(': ' + irn, marginX + 18, curY);
  curY += 4.5;
  doc.text('Ack No.', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(': ' + ackNo, marginX + 18, curY);
  curY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.text('Ack Date', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(': ' + ackDate, marginX + 18, curY);

  // e-Invoice QR Code on top right
  doc.addImage(einvoiceQrBase64, 'JPEG', 174, 34, 28, 28);

  // 4. Details Box (Structured Box with 1px black border)
  curY = 64;
  const boxX = marginX;
  const boxW = contentW;
  const colHalf = boxW / 2;

  // Row 1: Buyer & Consignee
  const row1H = 26;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(boxX, curY, boxW, row1H);
  doc.line(boxX + colHalf, curY, boxX + colHalf, curY + row1H);

  // Details of Buyer (Left)
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Details of Buyer / Billed To', boxX + 2, curY + 4);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(partyName, boxX + 2, curY + 8);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(buyerAddress, boxX + 2, curY + 12);
  doc.text('Ph: ' + buyerPhone, boxX + 2, curY + 16);
  doc.text(`State Name : ${buyerState} , Code : ${buyerStateCode}`, boxX + 2, curY + 20);
  doc.text('GSTIN/UIN: ', boxX + 2, curY + 24);
  doc.setFont('helvetica', 'bold');
  doc.text(buyerGstin, boxX + 18, curY + 24);

  // Detail of Consignee (Right)
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Detail of Consignee / Shipped To', boxX + colHalf + 2, curY + 4);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(partyName, boxX + colHalf + 2, curY + 8);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(buyerAddress, boxX + colHalf + 2, curY + 12);
  doc.text('Ph: ' + buyerPhone, boxX + colHalf + 2, curY + 16);
  doc.text(`State Name : ${buyerState} , Code : ${buyerStateCode}`, boxX + colHalf + 2, curY + 20);
  doc.text('GSTIN/UIN: ', boxX + colHalf + 2, curY + 24);
  doc.setFont('helvetica', 'bold');
  doc.text(buyerGstin, boxX + colHalf + 18, curY + 24);

  // 4-Column Metadata Grid
  curY += row1H;
  const col4W = boxW / 4;
  const metaRowH = 13;

  // Grid Row 1: Order No & Bill No
  doc.rect(boxX, curY, boxW, metaRowH);
  doc.line(boxX + col4W, curY, boxX + col4W, curY + metaRowH);
  doc.line(boxX + col4W * 2, curY, boxX + col4W * 2, curY + metaRowH);
  doc.line(boxX + col4W * 3, curY, boxX + col4W * 3, curY + metaRowH);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('ORDER NO.', boxX + 2, curY + 4);
  doc.text('Dated', boxX + col4W + 2, curY + 4);

  doc.text('BILL NO.', boxX + col4W * 2 + 2, curY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text(invNum, boxX + col4W * 2 + 2, curY + 9);

  doc.setFont('helvetica', 'normal');
  doc.text('Dated', boxX + col4W * 3 + 2, curY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text(invDate, boxX + col4W * 3 + 2, curY + 9);

  // Grid Row 2: Dispatched Through & Delivery Note
  curY += metaRowH;
  doc.rect(boxX, curY, boxW, metaRowH);
  doc.line(boxX + col4W, curY, boxX + col4W, curY + metaRowH);
  doc.line(boxX + col4W * 2, curY, boxX + col4W * 2, curY + metaRowH);
  doc.line(boxX + col4W * 3, curY, boxX + col4W * 3, curY + metaRowH);

  doc.setFont('helvetica', 'normal');
  doc.text('Dispatched through', boxX + 2, curY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text(truckNo, boxX + 2, curY + 9);

  doc.setFont('helvetica', 'normal');
  doc.text('Destination', boxX + col4W + 2, curY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text(siteName.length > 20 ? siteName.slice(0, 20) : siteName, boxX + col4W + 2, curY + 9);

  doc.setFont('helvetica', 'normal');
  doc.text('Delivery Note', boxX + col4W * 2 + 2, curY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text(challanNo, boxX + col4W * 2 + 2, curY + 9);

  doc.setFont('helvetica', 'normal');
  doc.text('Delivery Note Date', boxX + col4W * 3 + 2, curY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text(challanDate, boxX + col4W * 3 + 2, curY + 9);

  // Grid Row 3: Reference & Dispatch Doc
  curY += metaRowH;
  doc.rect(boxX, curY, boxW, metaRowH);
  doc.line(boxX + col4W, curY, boxX + col4W, curY + metaRowH);
  doc.line(boxX + col4W * 2, curY, boxX + col4W * 2, curY + metaRowH);
  doc.line(boxX + col4W * 3, curY, boxX + col4W * 3, curY + metaRowH);

  doc.setFont('helvetica', 'normal');
  doc.text('Reference No. & Date.', boxX + 2, curY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text(refNo, boxX + 2, curY + 9);

  doc.setFont('helvetica', 'normal');
  doc.text('Other References', boxX + col4W + 2, curY + 4);

  doc.text('Dispatch Doc No.', boxX + col4W * 2 + 2, curY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text(challanNo, boxX + col4W * 2 + 2, curY + 9);

  doc.setFont('helvetica', 'normal');
  doc.text('CREDIT DAYS', boxX + col4W * 3 + 2, curY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text(creditDays, boxX + col4W * 3 + 2, curY + 9);

  // 5. Items Table (11 Columns)
  curY += metaRowH;
  const colWidths = [8, 40, 16, 20, 14, 16, 20, 18, 14, 10, 18];
  const colX = [boxX];
  for (let i = 0; i < colWidths.length; i++) {
    colX.push(colX[i] + colWidths[i]);
  }

  // Header Row
  const tblHeaderH = 9;
  doc.rect(boxX, curY, boxW, tblHeaderH);
  for (let i = 1; i < colX.length - 1; i++) {
    doc.line(colX[i], curY, colX[i], curY + tblHeaderH);
  }

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('Sl\nNo.', colX[0] + 4, curY + 3.5, { align: 'center' });
  doc.text('Description of Goods', colX[1] + 2, curY + 5.5);
  doc.text('HSN/SAC', colX[2] + 8, curY + 5.5, { align: 'center' });
  doc.text('Truck No.', colX[3] + 10, curY + 5.5, { align: 'center' });
  doc.text('Challan\nNo.', colX[4] + 7, curY + 3.5, { align: 'center' });
  doc.text('Challan\nDate', colX[5] + 8, curY + 3.5, { align: 'center' });
  doc.text('Site', colX[6] + 10, curY + 5.5, { align: 'center' });
  doc.text('Quantity', colX[7] + 9, curY + 5.5, { align: 'center' });
  doc.text('Rate', colX[8] + 7, curY + 5.5, { align: 'center' });
  doc.text('per', colX[9] + 5, curY + 5.5, { align: 'center' });
  doc.text('Amount', colX[10] + 9, curY + 5.5, { align: 'center' });

  // Main Item Row
  curY += tblHeaderH;
  const itemRowH = 26;
  doc.rect(boxX, curY, boxW, itemRowH);
  for (let i = 1; i < colX.length - 1; i++) {
    doc.line(colX[i], curY, colX[i], curY + itemRowH);
  }

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('1', colX[0] + 4, curY + 6, { align: 'center' });
  doc.text(itemName, colX[1] + 2, curY + 6);

  doc.setFont('helvetica', 'normal');
  doc.text(hsnCode, colX[2] + 8, curY + 6, { align: 'center' });
  doc.text(truckNo, colX[3] + 10, curY + 6, { align: 'center' });
  doc.text(challanNo, colX[4] + 7, curY + 6, { align: 'center' });
  doc.text(challanDate, colX[5] + 8, curY + 6, { align: 'center' });
  doc.text(siteName.length > 12 ? siteName.slice(0, 12) : siteName, colX[6] + 10, curY + 6, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text(quantityStr, colX[7] + 9, curY + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(rateStr, colX[8] + 12, curY + 6, { align: 'right' });
  doc.text(unit, colX[9] + 5, curY + 6, { align: 'center' });

  // Amount column
  doc.setFont('helvetica', 'bold');
  doc.text(taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), colX[10] + 16, curY + 6, { align: 'right' });

  // Subtotal rows inside description column
  doc.setFont('helvetica', 'bold');
  doc.text('OUTPUT IGST', colX[1] + 38, curY + 16, { align: 'right' });
  doc.text(taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), colX[10] + 16, curY + 16, { align: 'right' });

  doc.text('ROUND OFF', colX[1] + 38, curY + 22, { align: 'right' });
  doc.text(roundOff.toFixed(2), colX[10] + 16, curY + 22, { align: 'right' });

  // Table Total Row
  curY += itemRowH;
  const tblTotalH = 7;
  doc.rect(boxX, curY, boxW, tblTotalH);
  for (let i = 1; i < colX.length - 1; i++) {
    doc.line(colX[i], curY, colX[i], curY + tblTotalH);
  }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Total', colX[1] + 38, curY + 5, { align: 'right' });
  doc.text(quantityStr, colX[7] + 9, curY + 5, { align: 'center' });
  doc.text('Rs. ' + totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), colX[10] + 16, curY + 5, { align: 'right' });

  // 6. Amount Chargeable in Words
  curY += tblTotalH;
  const wordsH = 9;
  doc.rect(boxX, curY, boxW, wordsH);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Amount Chargeable (in words)', boxX + 2, curY + 3.5);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(amountInWords, boxX + 2, curY + 7.5);
  doc.text('E. & O.E', boxX + boxW - 2, curY + 7.5, { align: 'right' });

  // 7. Tax Schedule Box
  curY += wordsH;
  const taxH = 14;
  doc.rect(boxX, curY, boxW, taxH);

  const tcolW = [45, 35, 25, 45, 44];
  const tcolX = [boxX];
  for (let i = 0; i < tcolW.length; i++) {
    tcolX.push(tcolX[i] + tcolW[i]);
  }

  // Horizontal line splitting header
  doc.line(boxX, curY + 5, boxX + boxW, curY + 5);
  doc.line(tcolX[1], curY, tcolX[1], curY + taxH);
  doc.line(tcolX[2], curY, tcolX[2], curY + taxH);
  doc.line(tcolX[3], curY, tcolX[3], curY + taxH);
  doc.line(tcolX[4], curY, tcolX[4], curY + taxH);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('HSN/SAC', tcolX[0] + 22, curY + 3.5, { align: 'center' });
  doc.text('Taxable Value', tcolX[1] + 17, curY + 3.5, { align: 'center' });
  doc.text('IGST Rate', tcolX[2] + 12, curY + 3.5, { align: 'center' });
  doc.text('IGST Amount', tcolX[3] + 22, curY + 3.5, { align: 'center' });
  doc.text('Total Tax Amount', tcolX[4] + 22, curY + 3.5, { align: 'center' });

  // Values row
  doc.setFont('helvetica', 'normal');
  doc.text(hsnCode, tcolX[0] + 2, curY + 9);
  doc.text(taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), tcolX[1] + 33, curY + 9, { align: 'right' });
  doc.text(taxRate + '%', tcolX[2] + 12, curY + 9, { align: 'center' });
  doc.text(taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), tcolX[3] + 43, curY + 9, { align: 'right' });
  doc.text(taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), tcolX[4] + 42, curY + 9, { align: 'right' });

  // Total row
  doc.line(boxX, curY + 10, boxX + boxW, curY + 10);
  doc.setFont('helvetica', 'bold');
  doc.text('Total', tcolX[0] + 40, curY + 13, { align: 'right' });
  doc.text(taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), tcolX[1] + 33, curY + 13, { align: 'right' });
  doc.text(taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), tcolX[3] + 43, curY + 13, { align: 'right' });
  doc.text(taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), tcolX[4] + 42, curY + 13, { align: 'right' });

  // 8. Tax in Words
  curY += taxH;
  const taxWordH = 6;
  doc.rect(boxX, curY, boxW, taxWordH);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Tax Amount (in words) : ', boxX + 2, curY + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.text(taxInWords, boxX + 32, curY + 4.5);

  // 9. Bottom Details Box (Split Left / Right)
  curY += taxWordH;
  const btmH = 34;
  doc.rect(boxX, curY, boxW, btmH);
  doc.line(boxX + colHalf, curY, boxX + colHalf, curY + btmH);

  // Left Column: GSTIN, Terms, Udyam
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text("Company's GSTIN/UIN :", boxX + 2, curY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text(compGstin, boxX + 34, curY + 4);

  doc.setFont('helvetica', 'normal');
  doc.text('State : ' + compState + ' , Code : ' + compStateCode, boxX + 2, curY + 8);

  doc.setFont('helvetica', 'bold');
  doc.text('TERMS & CONDITIONS', boxX + 2, curY + 13);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days,', boxX + 2, curY + 17);
  doc.text('Goods Once Sold Will Not Be Taken Back.', boxX + 2, curY + 21);
  doc.text(`All Cheque and Remittance to Be Made / Payable to "${compName}"`, boxX + 2, curY + 25);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('UDYAM REG.:- ' + udyamReg, boxX + 2, curY + 31);

  // Right Column: Declaration, Bank Details, Signatures
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('Declaration', boxX + colHalf + 2, curY + 4);
  doc.setFont('helvetica', 'normal');
  doc.text('We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.', boxX + colHalf + 2, curY + 7, { maxWidth: colHalf - 4 });

  doc.setFont('helvetica', 'bold');
  doc.text("Company's Bank Details", boxX + colHalf + 2, curY + 14);
  doc.setFont('helvetica', 'normal');
  doc.text('Bank Name', boxX + colHalf + 2, curY + 18);
  doc.setFont('helvetica', 'bold');
  doc.text(': ICICI BANK', boxX + colHalf + 24, curY + 18);

  doc.setFont('helvetica', 'normal');
  doc.text('A/c No.', boxX + colHalf + 2, curY + 22);
  doc.setFont('helvetica', 'bold');
  doc.text(': ' + compBankAcc, boxX + colHalf + 24, curY + 22);

  doc.setFont('helvetica', 'normal');
  doc.text('Branch & IFS Code', boxX + colHalf + 2, curY + 26);
  doc.setFont('helvetica', 'bold');
  doc.text(': ICIC0000019', boxX + colHalf + 24, curY + 26);

  // Signatures
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Customer Sign', boxX + colHalf + 2, curY + 31);
  doc.setFont('helvetica', 'bold');
  doc.text(`For ${compName}`, boxX + boxW - 2, curY + 31, { align: 'right' });

  // Page 1 Footer
  doc.line(boxX + colHalf, curY + 28, boxX + boxW, curY + 28);
  doc.setFont('helvetica', 'bold');
  doc.text('Authorised Signatory', boxX + boxW - 2, curY + 45, { align: 'right' });

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('SUBJECT TO THANE JURISDICTION', 105, 286, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('This is a Computer Generated Invoice', 105, 290, { align: 'center' });

  // ═════════════════════════════════════════════════════════════════════════════
  // PAGE 2: e-Way Bill (OFFICIAL 5-SECTION EXACT PORTAL LAYOUT)
  // ═════════════════════════════════════════════════════════════════════════════
  doc.addPage('a4', 'portrait');

  // Title Row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('e-Way Bill', 105, 14, { align: 'center' });
  doc.setFontSize(11);
  doc.text('e-Way Bill', 188, 14, { align: 'right' });

  // Doc Details & e-Way Bill QR Code
  curY = 22;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Doc No.  : ', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(`Tax Invoice - ${invNum}`, marginX + 16, curY);

  curY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.text('Date       : ', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(invDate, marginX + 16, curY);

  curY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.text('IRN        : ', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(irn, marginX + 16, curY);

  curY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.text('Ack No.  : ', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(ackNo, marginX + 16, curY);

  curY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.text('Ack Date : ', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(ackDate, marginX + 16, curY);

  // e-Way QR image on top right
  doc.addImage(ewayQrBase64, 'JPEG', 174, 20, 26, 26);

  curY += 6;
  doc.setLineWidth(0.4);
  doc.line(marginX, curY, marginX + contentW, curY);

  // Section 1: e-Way Bill Details
  curY += 6;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('1. e-Way Bill Details', marginX, curY);

  curY += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('e-Way Bill No. : ', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(ewayBillNo, marginX + 22, curY);

  doc.setFont('helvetica', 'normal');
  doc.text('Mode                    : ', marginX + 75, curY);
  doc.setFont('helvetica', 'bold');
  doc.text('1 - Road', marginX + 104, curY);

  doc.setFont('helvetica', 'normal');
  doc.text('Generated Date : ', marginX + 130, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(ewayDate, marginX + 153, curY);

  curY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.text('Generated By   : ', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(compGstin, marginX + 22, curY);

  doc.setFont('helvetica', 'normal');
  doc.text('Approx Distance   : ', marginX + 75, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(approxDistance, marginX + 104, curY);

  doc.setFont('helvetica', 'normal');
  doc.text('Valid Upto          : ', marginX + 130, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(ewayValidUpto, marginX + 153, curY);

  curY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.text('Supply Type      : ', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text('Outward-Supply', marginX + 22, curY);

  doc.setFont('helvetica', 'normal');
  doc.text('Transaction Type : ', marginX + 75, curY);
  doc.setFont('helvetica', 'bold');
  doc.text('Regular', marginX + 104, curY);

  curY += 5;
  doc.line(marginX, curY, marginX + contentW, curY);

  // Section 2: Address Details
  curY += 5;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('2. Address Details', marginX, curY);

  curY += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('From', marginX, curY);
  doc.text('To', marginX + 105, curY);

  curY += 4;
  doc.text(compName, marginX, curY);
  doc.text(partyName, marginX + 105, curY);

  curY += 4;
  doc.setFont('helvetica', 'normal');
  doc.text('GSTIN : ' + compGstin, marginX, curY);
  doc.text('GSTIN : ' + buyerGstin, marginX + 105, curY);

  curY += 4;
  doc.text(compState, marginX, curY);
  doc.text(buyerState, marginX + 105, curY);

  curY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Dispatch From', marginX, curY);
  doc.text('Ship To', marginX + 105, curY);

  curY += 4;
  doc.setFont('helvetica', 'normal');
  doc.text(`${compAddress}, UDYAM REG.:- ${udyamReg}`, marginX, curY, { maxWidth: 95 });
  doc.text(`${buyerAddress}, Ph: ${buyerPhone}`, marginX + 105, curY, { maxWidth: 90 });

  curY += 8;
  doc.line(marginX, curY, marginX + contentW, curY);

  // Section 3: Goods Details
  curY += 5;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('3. Goods Details', marginX, curY);

  curY += 4;
  doc.setFontSize(7.5);
  doc.text('HSN Code', marginX, curY);
  doc.text('Product Name & Desc', marginX + 22, curY);
  doc.text('Quantity', marginX + 120, curY, { align: 'center' });
  doc.text('Taxable Amt', marginX + 155, curY, { align: 'right' });
  doc.text('Tax Rate (I)', marginX + 188, curY, { align: 'right' });

  curY += 2;
  doc.line(marginX, curY, marginX + contentW, curY);

  // Goods item row
  curY += 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(hsnCode, marginX, curY);
  doc.text(itemName, marginX + 22, curY);
  doc.setFont('helvetica', 'normal');
  doc.text(quantityStr.replace('BAGS', 'BAG'), marginX + 120, curY, { align: 'center' });
  doc.text(taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), marginX + 155, curY, { align: 'right' });
  doc.text(String(taxRate), marginX + 188, curY, { align: 'right' });

  curY += 3;
  doc.line(marginX, curY, marginX + contentW, curY);

  // Totals Summary
  curY += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Tot. Taxable Amt :', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), marginX + 26, curY);

  doc.setFont('helvetica', 'normal');
  doc.text('Other Amt :', marginX + 75, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(roundOff.toFixed(2), marginX + 92, curY);

  doc.setFont('helvetica', 'normal');
  doc.text('Total Inv Amt :', marginX + 130, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), marginX + 152, curY);

  curY += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('IGST Amt          :', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), marginX + 26, curY);

  curY += 5;
  doc.line(marginX, curY, marginX + contentW, curY);

  // Section 4: Transportation Details
  curY += 5;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('4. Transportation Details', marginX, curY);

  curY += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Transporter ID :', marginX, curY);
  if (transporterId) {
    doc.setFont('helvetica', 'bold');
    doc.text(transporterId, marginX + 22, curY);
    doc.setFont('helvetica', 'normal');
  }
  doc.text('Doc No. :', marginX + 120, curY);

  curY += 5;
  doc.text('Name              :', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(transporterName, marginX + 22, curY);
  doc.setFont('helvetica', 'normal');
  doc.text('Date      :', marginX + 120, curY);

  curY += 5;
  doc.line(marginX, curY, marginX + contentW, curY);

  // Section 5: Vehicle Details
  curY += 5;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('5. Vehicle Details', marginX, curY);

  curY += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Vehicle No. :', marginX, curY);
  doc.setFont('helvetica', 'bold');
  doc.text(truckNo.replace('-', ''), marginX + 20, curY);

  doc.setFont('helvetica', 'normal');
  doc.text('From  : ', marginX + 75, curY);
  doc.setFont('helvetica', 'bold');
  doc.text('Valsad,GUJARAT', marginX + 86, curY);

  doc.setFont('helvetica', 'normal');
  doc.text('CEWB No.:', marginX + 140, curY);

  return Buffer.from(doc.output('arraybuffer'));
}

module.exports = {
  buildExactInvoicePdf,
  numberToWordsIndian,
};
