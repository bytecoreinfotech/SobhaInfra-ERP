import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { numberToWordsIndian } from './invoicePdfService';

/**
 * Capture HTML elements and create a 2-page A4 Statement of Account PDF Blob
 * @param {HTMLElement} page1El - Executive Summary & Aging Ledger
 * @param {HTMLElement} page2El - Remittance Slip & Bank Details (optional)
 * @returns {Promise<Blob>}
 */
export async function generateStatementPdfBlob(page1El, page2El = null) {
  if (!page1El) {
    throw new Error('Page 1 element is required to generate Statement PDF');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const a4Width = 210;
  const a4Height = 297;

  // Render Page 1 (Executive Summary & Aging Schedule)
  const canvas1 = await html2canvas(page1El, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });
  const imgData1 = canvas1.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData1, 'JPEG', 0, 0, a4Width, a4Height);

  // Render Page 2 (Remittance Slip & Settlement Instructions) if provided
  if (page2El) {
    pdf.addPage();
    const canvas2 = await html2canvas(page2El, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    const imgData2 = canvas2.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData2, 'JPEG', 0, 0, a4Width, a4Height);
  }

  return pdf.output('blob');
}

/**
 * Upload generated Statement PDF blob to Supabase Storage
 * @param {Blob} blob
 * @param {string} clientName
 * @returns {Promise<string>} Public HTTPS URL
 */
export async function uploadStatementPdfBlob(blob, clientName) {
  const safeName = String(clientName || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Statement_${safeName}_${Date.now()}.pdf`;

  // Convert Blob to base64
  const base64Data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  // Upload through Netlify serverless function (bypasses RLS with Service Role Key)
  const res = await fetch('/.netlify/functions/upload-media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileData: base64Data,
      fileName,
      contentType: 'application/pdf',
      folder: 'statements',
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to upload Statement PDF to storage');
  }

  const json = await res.json();
  if (!json.success || !json.publicUrl) {
    throw new Error(json.error || 'No public URL returned for Statement PDF');
  }

  return json.publicUrl;
}

/**
 * Trigger local browser download of Statement PDF
 * @param {Blob} blob
 * @param {string} fileName
 */
export function triggerStatementPdfDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
