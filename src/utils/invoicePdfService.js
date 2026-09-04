import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabase';

/**
 * Convert number to words in Indian numbering format (Lakhs, Crores)
 * @param {number} num
 * @returns {string} e.g. "INR Seventy Four Thousand Nine Hundred Sixty Two Only"
 */
export function numberToWordsIndian(num) {
  if (num === null || num === undefined || isNaN(num)) return 'INR Zero Only';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n) {
    if (n < 20) return a[n];
    const tens = b[Math.floor(n / 10)];
    const ones = a[n % 10];
    return ones ? `${tens} ${ones}` : tens;
  }

  function convertThreeDigits(n) {
    let str = '';
    if (Math.floor(n / 100) > 0) {
      str += `${a[Math.floor(n / 100)]} Hundred `;
    }
    const rem = n % 100;
    if (rem > 0) {
      str += convertTwoDigits(rem);
    }
    return str.trim();
  }

  const rounded = Math.round(Number(num) * 100) / 100;
  const parts = rounded.toFixed(2).split('.');
  let n = parseInt(parts[0], 10);
  const paise = parseInt(parts[1], 10);

  if (n === 0 && paise === 0) return 'INR Zero Only';

  let words = '';

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  if (crore > 0) words += `${convertTwoDigits(crore)} Crore `;
  if (lakh > 0) words += `${convertTwoDigits(lakh)} Lakh `;
  if (thousand > 0) words += `${convertTwoDigits(thousand)} Thousand `;
  if (hundred > 0) words += `${convertThreeDigits(hundred)} `;

  words = words.trim();
  if (!words) words = 'Zero';

  let result = `INR ${words}`;
  if (paise > 0) {
    result += ` and ${convertTwoDigits(paise)} paise`;
  }
  return `${result} Only`;
}

/**
 * Capture HTML elements and create a 2-page A4 PDF Blob
 * @param {HTMLElement} page1El
 * @param {HTMLElement} page2El (optional)
 * @returns {Promise<Blob>}
 */
export async function generateInvoicePdfBlob(page1El, page2El = null) {
  if (!page1El) {
    throw new Error('Page 1 element is required to generate PDF');
  }

  // Create jsPDF instance in A4 format (210 x 297 mm)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const a4Width = 210;
  const a4Height = 297;

  // Render Page 1
  const canvas1 = await html2canvas(page1El, {
    scale: 2, // 2x for retina/print sharpness
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });
  const imgData1 = canvas1.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData1, 'JPEG', 0, 0, a4Width, a4Height);

  // Render Page 2 if provided
  if (page2El) {
    const canvas2 = await html2canvas(page2El, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    const imgData2 = canvas2.toDataURL('image/jpeg', 0.95);
    pdf.addPage('a4', 'portrait');
    pdf.addImage(imgData2, 'JPEG', 0, 0, a4Width, a4Height);
  }

  return pdf.output('blob');
}

/**
 * Upload PDF Blob to Supabase storage bucket 'whatsapp-media'
 * @param {Blob} pdfBlob
 * @param {string} invoiceNumber
 * @returns {Promise<string>} Public URL of uploaded PDF
 */
export async function uploadInvoicePdfBlob(pdfBlob, invoiceNumber = 'INV') {
  const safeName = String(invoiceNumber || 'INV')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  const path = `invoices/Invoice_${safeName}_${Date.now()}.pdf`;

  const { data, error } = await supabase.storage
    .from('whatsapp-media')
    .upload(path, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '3600',
    });

  if (error) {
    console.error('[invoicePdfService] Supabase upload failed:', error);
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from('whatsapp-media')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

/**
 * Update invoice row in Supabase with the generated PDF URL
 * @param {string} invoiceId
 * @param {string} pdfUrl
 */
export async function saveInvoicePdfUrl(invoiceId, pdfUrl) {
  if (!invoiceId || !pdfUrl) return;
  try {
    const { error } = await supabase
      .from('invoices')
      .update({ pdf_url: pdfUrl })
      .eq('id', invoiceId);

    if (error) {
      console.warn('[invoicePdfService] Could not update invoice pdf_url:', error.message);
    }
  } catch (err) {
    console.warn('[invoicePdfService] Error saving pdf_url:', err.message);
  }
}

/**
 * Trigger immediate client-side download of a PDF Blob
 * @param {Blob} blob
 * @param {string} fileName
 */
export function triggerPdfDownload(blob, fileName = 'Invoice.pdf') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}
