import React, { useState, useRef } from 'react';
import {
  FileText, Download, ExternalLink, Send, CheckCircle2,
  X, Printer, Loader2, Sparkles, AlertCircle, ShieldCheck,
  Building2, Phone, Calendar, ArrowRight, RefreshCw
} from 'lucide-react';
import {
  generateStatementPdfBlob,
  uploadStatementPdfBlob,
  triggerStatementPdfDownload
} from '../utils/statementPdfService';
import { numberToWordsIndian } from '../utils/invoicePdfService';
import headerBannerImg from '../assets/shobha_header_banner.jpg';

const fmtCurrency = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

export default function ConsolidatedStatementModal({
  customer,
  invoices = [],
  activeCompany,
  onClose,
  onSendWhatsApp,
}) {
  const [activeTab, setActiveTab] = useState('both'); // 'both' | 'page1' | 'page2'
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const page1Ref = useRef(null);
  const page2Ref = useRef(null);

  if (!customer || invoices.length === 0) return null;

  // Customer identification
  const clientName = customer.company_name || customer.customer_name || invoices[0]?.client_name || 'Valued Client';
  const contactPerson = customer.contact_person || invoices[0]?._contact_person || '';
  const verifiedPhone = customer.contact_number || invoices[0]?._verified_phone || invoices[0]?.client_phone || '';
  const customerAddress = customer.shipping_address || customer.billing_address || 'Gujarat / Maharashtra Region';

  // Company Profile & Dynamic Remittance Details
  const compName = activeCompany?.company_name || 'Sobhainfra Tech Private Limited';
  const compGstin = activeCompany?.gstin_number || '24AGCPJ2785R1ZV';
  const compState = activeCompany?.state_name || 'Gujarat';
  const compStateCode = activeCompany?.state_code || '24';
  const compAddress = activeCompany?.company_address || 'NH48, NEAR KOLEI KHADI SARODHI, SARODHI, Valsad, Gujarat - 396001';
  const compEmail = activeCompany?.admin_email || 'contact@sobhainfratech.com';
  const compPhone = activeCompany?.contact_phone || '+91 98765 43210';

  const bankName = activeCompany?.bank_name || 'ICICI BANK';
  const bankAcc = activeCompany?.bank_account_no || '001905012691';
  const bankIfsc = activeCompany?.bank_ifsc || 'ICIC0000019';
  const upiId = activeCompany?.upi_id || 'shobhareadyplast@okhdfcbank';
  const standeeQrUrl = activeCompany?.company_qr_code_url || '';
  const stampUrl = activeCompany?.company_stamp_url || '';
  const signatureUrl = activeCompany?.authorized_signature_url || '';
  const termsAndConditions = activeCompany?.invoice_footer_notes
    || 'Unpaid invoices will be charged 24% P.A. interest after given credit days. Please share UTR / payment receipt screenshot upon clearance.';

  // Aggregate financial metrics
  const totalBilled = invoices.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalPending = invoices.reduce((s, i) => s + Number(i.pending_amount !== undefined ? i.pending_amount : (i.status === 'Paid' ? 0 : i.amount)), 0);
  const totalPaid = Math.max(0, totalBilled - totalPending);

  const overdueInvoices = invoices.filter(i => i.status === 'Overdue');
  const maxOverdueDays = Math.max(0, ...invoices.map(i => {
    if (i.days_overdue) return Number(i.days_overdue);
    if (i.due_date) return Math.floor((Date.now() - new Date(i.due_date)) / 86400000);
    return 0;
  }));

  const statementDateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const amountInWords = numberToWordsIndian(totalPending);

  // Dynamic QR Code generation for instant UPI settlement
  const dynamicUpiQrUrl = standeeQrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(compName)}&am=${totalPending.toFixed(2)}&cu=INR`)}`;

  // Download PDF Handler
  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      setStatusMessage({ type: 'info', text: 'Generating 2-page Consolidated Statement PDF...' });
      const p1 = page1Ref.current;
      const p2 = page2Ref.current;
      const blob = await generateStatementPdfBlob(p1, p2);
      const fileName = `Statement_${clientName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.pdf`;
      triggerStatementPdfDownload(blob, fileName);
      setStatusMessage({ type: 'success', text: 'Statement PDF downloaded successfully!' });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('PDF generation failed:', err);
      setStatusMessage({ type: 'error', text: 'Failed to generate PDF: ' + err.message });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Open in New Tab for Native Ctrl+P Print
  const handleOpenPrintTab = () => {
    const p1Html = page1Ref.current ? page1Ref.current.innerHTML : '';
    const p2Html = page2Ref.current ? page2Ref.current.innerHTML : '';
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Customer Statement - ${clientName}</title>
        <style>
          @page { size: A4 portrait; margin: 6mm; }
          * { box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0; padding: 10px; background: #cbd5e1;
            display: flex; flex-direction: column; align-items: center; color: #000;
          }
          .no-print {
            width: 100%; max-width: 794px; margin-bottom: 12px;
            display: flex; justify-content: space-between; align-items: center;
            background: #1e293b; color: white; padding: 10px 16px; border-radius: 6px;
          }
          .print-btn {
            background: #10b981; color: white; border: none; padding: 8px 18px;
            border-radius: 6px; font-weight: 700; font-size: 13px; cursor: pointer;
          }
          .page-container {
            width: 794px; background: #fff; padding: 16px; margin-bottom: 16px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15); page-break-after: always;
          }
          .page-container:last-child { page-break-after: auto; }
          @media print {
            body { background: #fff; padding: 0; }
            .no-print { display: none !important; }
            .page-container {
              width: 100% !important; max-width: 100% !important;
              padding: 0 !important; margin: 0 !important; box-shadow: none !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="no-print">
          <span style="font-weight:700;">Consolidated Statement of Account — ${clientName}</span>
          <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
        </div>
        <div class="page-container">${p1Html}</div>
        ${p2Html ? `<div class="page-container">${p2Html}</div>` : ''}
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // WhatsApp Send Trigger with PDF upload
  const handleSendWithPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      setStatusMessage({ type: 'info', text: 'Generating and uploading Consolidated Statement PDF to Cloud Storage...' });
      const p1 = page1Ref.current;
      const p2 = page2Ref.current;
      const blob = await generateStatementPdfBlob(p1, p2);
      const publicUrl = await uploadStatementPdfBlob(blob, clientName);
      
      setStatusMessage({ type: 'success', text: 'PDF prepared! Opening WhatsApp reminder composer...' });
      setTimeout(() => {
        onClose();
        if (onSendWhatsApp) {
          onSendWhatsApp(customer, invoices, publicUrl);
        }
      }, 500);
    } catch (err) {
      console.error('Failed to prepare statement PDF for WhatsApp:', err);
      setStatusMessage({ type: 'error', text: 'Error uploading PDF: ' + err.message });
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(5px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '1.2rem', overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        className="glass-card"
        style={{
          width: '100%', maxWidth: '880px',
          background: 'var(--bg-card, #1e293b)',
          borderRadius: '16px', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          border: '1px solid var(--border-color)',
          marginBottom: '2rem'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div style={{
          padding: '1rem 1.4rem', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(99,102,241,0.06)', flexWrap: 'wrap', gap: '0.75rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Consolidated Statement of Account
              </h2>
              <span className="badge badge-primary" style={{ fontSize: '0.72rem' }}>
                {invoices.length} Unpaid Invoices
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              <strong>{clientName}</strong> · Total Outstanding: <strong style={{ color: 'var(--danger)' }}>{fmtCurrency(totalPending)}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Tab Selector */}
            <div style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: '0.2rem', borderRadius: 8, gap: '0.2rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === 'both' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                onClick={() => setActiveTab('both')}
              >
                All 2 Pages
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === 'page1' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                onClick={() => setActiveTab('page1')}
              >
                Page 1: Ledger
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === 'page2' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                onClick={() => setActiveTab('page2')}
              >
                Page 2: Bank Slip
              </button>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleOpenPrintTab}
              data-tooltip="Open in new tab to print or save via Ctrl+P"
            >
              <Printer size={13} /> Print
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
            >
              <Download size={13} /> {isGeneratingPdf ? 'Generating...' : 'Download PDF'}
            </button>

            <button
              type="button"
              className="btn btn-whatsapp btn-sm"
              onClick={handleSendWithPdf}
              disabled={isGeneratingPdf}
            >
              <Send size={13} /> Send via WhatsApp
            </button>

            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.3rem', marginLeft: '0.25rem' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status Notification */}
        {statusMessage && (
          <div style={{
            padding: '0.6rem 1.25rem', fontSize: '0.8rem',
            background: statusMessage.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
            color: statusMessage.type === 'error' ? '#ef4444' : '#10b981',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', gap: '0.5rem'
          }}>
            {statusMessage.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Scrollable Document Canvas View */}
        <div style={{
          padding: '1.5rem', background: '#cbd5e1',
          overflowY: 'auto', maxHeight: '78vh',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem'
        }}>

          {/* ═════════════════════════════════════════════════════════════════
              PAGE 1: STATEMENT SUMMARY & DETAILED AGING LEDGER BREAKDOWN
             ═════════════════════════════════════════════════════════════════ */}
          <div
            ref={page1Ref}
            style={{
              display: activeTab === 'both' || activeTab === 'page1' ? 'block' : 'none',
              width: '794px', minHeight: '1123px',
              background: '#ffffff', color: '#000000',
              padding: '28px 32px', fontFamily: 'Arial, Helvetica, sans-serif',
              boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
              position: 'relative', boxSizing: 'border-box'
            }}
          >
            {/* Header Banner */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '12px' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {compName}
              </div>
              <div style={{ fontSize: '9.5px', color: '#334155', marginTop: '2px' }}>
                Manufacturers of Dry Mix Mortar, Ready Plast, Tile Adhesives & Construction Chemicals
              </div>
              <div style={{ fontSize: '8.5px', color: '#475569', marginTop: '2px' }}>
                Plant / Regd. Office: {compAddress}
              </div>
              <div style={{ fontSize: '8.5px', fontWeight: 'bold', color: '#0f172a', marginTop: '2px' }}>
                GSTIN: {compGstin} · State: {compState} (Code: {compStateCode}) · Email: {compEmail} · Phone: {compPhone}
              </div>
            </div>

            {/* Document Title Banner */}
            <div style={{
              background: '#1e3a8a', color: '#ffffff', textAlign: 'center',
              padding: '6px', fontWeight: 'bold', fontSize: '13px',
              letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px',
              borderRadius: '2px'
            }}>
              Customer Statement of Account & Outstanding Ledger
            </div>

            {/* Customer & Statement Meta Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', border: '1px solid #000', padding: '10px', marginBottom: '12px', fontSize: '9.5px' }}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '10.5px', color: '#1e3a8a', marginBottom: '3px' }}>
                  STATEMENT FOR:
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{clientName}</div>
                {contactPerson && <div>Attn: <span style={{ fontWeight: 'bold' }}>{contactPerson}</span></div>}
                <div>Phone: <span style={{ fontWeight: 'bold' }}>{verifiedPhone}</span> (Verified Directory)</div>
                <div>Billing Region: {customerAddress}</div>
              </div>
              <div style={{ borderLeft: '1px dashed #94a3b8', paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div>Statement Date: <span style={{ fontWeight: 'bold' }}>{statementDateStr}</span></div>
                <div>Total Pending Vouchers: <span style={{ fontWeight: 'bold' }}>{invoices.length} Bills</span></div>
                <div>Oldest Overdue Invoice: <span style={{ fontWeight: 'bold', color: '#dc2626' }}>{maxOverdueDays} Days Ago</span></div>
                <div>Account Status: <span style={{ fontWeight: 'bold', color: totalPending > 0 ? '#dc2626' : '#16a34a' }}>{totalPending > 0 ? 'PAYMENT DUE' : 'SETTLED'}</span></div>
              </div>
            </div>

            {/* Executive KPI Summary Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
              <div style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'center', background: '#f8fafc' }}>
                <div style={{ fontSize: '8.5px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Invoiced Turn-over</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a', marginTop: '2px' }}>{fmtCurrency(totalBilled)}</div>
              </div>
              <div style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'center', background: '#f0fdf4' }}>
                <div style={{ fontSize: '8.5px', color: '#16a34a', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Settled / Paid</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#16a34a', marginTop: '2px' }}>{fmtCurrency(totalPaid)}</div>
              </div>
              <div style={{ border: '1.5px solid #dc2626', padding: '8px', textAlign: 'center', background: '#fef2f2' }}>
                <div style={{ fontSize: '8.5px', color: '#dc2626', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Outstanding Due</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#dc2626', marginTop: '2px' }}>{fmtCurrency(totalPending)}</div>
              </div>
            </div>

            {/* Detailed Bill Breakdown Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', marginBottom: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderTop: '1.5px solid #000', borderBottom: '1.5px solid #000' }}>
                  <th style={{ padding: '6px 4px', textAlign: 'center', width: '30px' }}>Sr.</th>
                  <th style={{ padding: '6px 6px', textAlign: 'left' }}>Invoice / Voucher No.</th>
                  <th style={{ padding: '6px 6px', textAlign: 'center', width: '75px' }}>Date</th>
                  <th style={{ padding: '6px 6px', textAlign: 'center', width: '75px' }}>Due Date</th>
                  <th style={{ padding: '6px 6px', textAlign: 'right', width: '80px' }}>Billed (₹)</th>
                  <th style={{ padding: '6px 6px', textAlign: 'right', width: '75px' }}>Paid (₹)</th>
                  <th style={{ padding: '6px 6px', textAlign: 'right', width: '85px' }}>Balance Due (₹)</th>
                  <th style={{ padding: '6px 6px', textAlign: 'center', width: '65px' }}>Age (Days)</th>
                  <th style={{ padding: '6px 6px', textAlign: 'center', width: '65px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, idx) => {
                  const invNum = inv.invoice_number || inv.tally_voucher_number || 'N/A';
                  const invAmt = Number(inv.amount || 0);
                  const balDue = Number(inv.pending_amount !== undefined ? inv.pending_amount : (inv.status === 'Paid' ? 0 : inv.amount));
                  const paidAmt = Math.max(0, invAmt - balDue);
                  const ageDays = inv.days_overdue || (inv.due_date ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date)) / 86400000)) : 0);

                  return (
                    <tr key={inv.id || idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                      <td style={{ padding: '5px 4px', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ padding: '5px 6px', fontWeight: 'bold' }}>{invNum}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center' }}>{fmtDate(inv.invoice_date || inv.created_at)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center' }}>{fmtDate(inv.due_date)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right' }}>{fmtCurrency(invAmt)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: '#16a34a' }}>{fmtCurrency(paidAmt)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 'bold', color: balDue > 0 ? '#dc2626' : '#000' }}>
                        {fmtCurrency(balDue)}
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: ageDays > 30 ? '#dc2626' : '#475569', fontWeight: ageDays > 30 ? 'bold' : 'normal' }}>
                        {ageDays > 0 ? `${ageDays}d` : 'Current'}
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                        <span style={{
                          padding: '1px 5px', borderRadius: '4px', fontSize: '7.5px', fontWeight: 'bold',
                          background: inv.status === 'Paid' ? '#dcfce7' : inv.status === 'Overdue' ? '#fee2e2' : '#fef9c3',
                          color: inv.status === 'Paid' ? '#166534' : inv.status === 'Overdue' ? '#991b1b' : '#854d0e',
                        }}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {/* Total Summary Row */}
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #000', borderBottom: '2px solid #000', fontWeight: 'bold' }}>
                  <td colSpan={4} style={{ padding: '7px 6px', textAlign: 'right' }}>TOTAL OUTSTANDING SUMMARY:</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right' }}>{fmtCurrency(totalBilled)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', color: '#16a34a' }}>{fmtCurrency(totalPaid)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', color: '#dc2626', fontSize: '10px' }}>{fmtCurrency(totalPending)}</td>
                  <td colSpan={2} style={{ padding: '7px 6px', textAlign: 'center', color: '#dc2626' }}>{invoices.length} Bills Total</td>
                </tr>
              </tbody>
            </table>

            {/* Total In Words */}
            <div style={{ padding: '6px 8px', background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '9px', marginBottom: '12px' }}>
              <strong>Total Outstanding Balance in Words:</strong> {amountInWords}
            </div>

            {/* Quick Summary Note & Page 2 Indicator */}
            <div style={{ fontSize: '8.5px', color: '#64748b', fontStyle: 'italic', textAlign: 'right', marginTop: 'auto', paddingTop: '10px' }}>
              Page 1 of 2 · Official Bank Remittance Slip & QR Code overleaf
            </div>
          </div>

          {/* ═════════════════════════════════════════════════════════════════
              PAGE 2: OFFICIAL REMITTANCE SLIP, UPI QR & TERMS
             ═════════════════════════════════════════════════════════════════ */}
          <div
            ref={page2Ref}
            style={{
              display: activeTab === 'both' || activeTab === 'page2' ? 'block' : 'none',
              width: '794px', minHeight: '1123px',
              background: '#ffffff', color: '#000000',
              padding: '28px 32px', fontFamily: 'Arial, Helvetica, sans-serif',
              boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
              position: 'relative', boxSizing: 'border-box'
            }}
          >
            {/* Page 2 Header */}
            <div style={{ borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e3a8a' }}>{compName}</div>
                <div style={{ fontSize: '9px', color: '#475569' }}>Official Payment Remittance Slip & Settlement Gateway</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '9px' }}>
                <div>Client: <strong>{clientName}</strong></div>
                <div>Amount Payable: <strong style={{ color: '#dc2626' }}>{fmtCurrency(totalPending)}</strong></div>
              </div>
            </div>

            {/* Bank Details & QR Standee Box */}
            <div style={{
              border: '2px solid #1e3a8a', borderRadius: '4px',
              padding: '16px', marginBottom: '16px', background: '#f8fafc',
              display: 'grid', gridTemplateColumns: '1fr 180px', gap: '16px'
            }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  🏦 Bank Account Remittance Details (RTGS / NEFT / IMPS)
                </div>
                <table style={{ width: '100%', fontSize: '10px', borderSpacing: '0 4px' }}>
                  <tbody>
                    <tr>
                      <td style={{ width: '130px', color: '#475569', fontWeight: 'bold' }}>Bank Name:</td>
                      <td style={{ fontWeight: 'bold', color: '#0f172a' }}>{bankName}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#475569', fontWeight: 'bold' }}>Beneficiary Name:</td>
                      <td style={{ fontWeight: 'bold', color: '#0f172a' }}>{compName.toUpperCase()}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#475569', fontWeight: 'bold' }}>Account Number:</td>
                      <td style={{ fontWeight: 'bold', fontSize: '12px', color: '#1e3a8a' }}>{bankAcc}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#475569', fontWeight: 'bold' }}>IFSC Code:</td>
                      <td style={{ fontWeight: 'bold', fontSize: '11px', color: '#0f172a' }}>{bankIfsc}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#475569', fontWeight: 'bold' }}>UPI ID:</td>
                      <td style={{ fontWeight: 'bold', color: '#16a34a' }}>{upiId}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#475569', fontWeight: 'bold' }}>Branch:</td>
                      <td>{activeCompany?.jurisdiction || 'Valsad / Thane Branch'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* QR Standee Image */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderLeft: '1px dashed #cbd5e1', paddingLeft: '12px' }}>
                <img
                  src={dynamicUpiQrUrl}
                  alt="UPI QR Code"
                  style={{ width: '130px', height: '130px', objectFit: 'contain', border: '1px solid #cbd5e1', padding: '4px', background: '#fff' }}
                />
                <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#475569', marginTop: '4px', textAlign: 'center' }}>
                  SCAN VIA ANY UPI APP<br />(GPay / PhonePe / Paytm / BHIM)
                </div>
              </div>
            </div>

            {/* Payment Terms & Instructions */}
            <div style={{ border: '1px solid #cbd5e1', padding: '12px', background: '#ffffff', fontSize: '9px', marginBottom: '16px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '10px', color: '#1e3a8a', marginBottom: '4px' }}>
                TERMS & SETTLEMENT INSTRUCTIONS:
              </div>
              <div style={{ lineHeight: 1.5, color: '#334155' }}>
                {termsAndConditions}
              </div>
              <ul style={{ margin: '6px 0 0 16px', padding: 0, lineHeight: 1.5, color: '#334155' }}>
                <li>Kindly quote your Firm/Client Name and Invoice Numbers while making NEFT/RTGS transfers.</li>
                <li>Please send the transaction confirmation receipt / UTR number to <strong>{compEmail}</strong> or reply to this WhatsApp thread.</li>
                <li>For any invoice discrepancies, weight slips, or ledger reconciliation, please contact our accounts desk within 48 hours.</li>
              </ul>
            </div>

            {/* Signature & Authentication Box */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px',
              borderTop: '1px solid #cbd5e1', paddingTop: '24px', marginTop: '24px'
            }}>
              <div style={{ border: '1px dashed #cbd5e1', padding: '12px', minHeight: '90px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '9px', color: '#64748b' }}>Client Acceptance & Payment Commitment:</div>
                <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#334155' }}>Customer Signature / Seal</div>
              </div>

              <div style={{ border: '1px solid #1e3a8a', padding: '10px 12px', minHeight: '95px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'right', background: '#f8fafc' }}>
                <div style={{ fontSize: '9.5px', fontWeight: 'bold', color: '#1e3a8a' }}>For {compName.toUpperCase()}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', minHeight: '44px' }}>
                  {stampUrl && (
                    <img
                      src={stampUrl}
                      alt="Stamp"
                      style={{ maxHeight: '44px', maxWidth: '65px', objectFit: 'contain' }}
                    />
                  )}
                  {signatureUrl ? (
                    <img
                      src={signatureUrl}
                      alt="Sign"
                      style={{ maxHeight: '40px', maxWidth: '85px', objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ fontSize: '8.5px', color: '#64748b' }}>[Official Digital Verification]</div>
                  )}
                </div>
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0f172a' }}>Authorised Signatory</div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ textAlign: 'center', marginTop: '30px', fontSize: '8.5px', color: '#64748b' }}>
              <div style={{ fontWeight: 'bold' }}>SUBJECT TO VALSAD / THANE JURISDICTION</div>
              <div>This is a Computer Generated Consolidated Statement of Account from Sobhainfra Tech ERP Engine.</div>
              <div>Page 2 of 2</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
