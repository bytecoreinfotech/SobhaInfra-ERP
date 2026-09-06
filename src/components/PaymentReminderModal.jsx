import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Send, ShieldCheck, AlertTriangle, FileText, CheckCircle2,
  RefreshCw, Sparkles, MessageCircle, ExternalLink, Building2,
  Calendar, IndianRupee, Clock, ArrowRight
} from 'lucide-react';
import { useCompany } from '../context/CompanyContext';

const fmtCurrency = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

export default function PaymentReminderModal({
  invoice = null,
  customer = null,
  invoices = [],
  statementPdfUrl = null,
  onClose,
  onSendSuccess,
}) {
  const navigate = useNavigate();
  const { activeCompany } = useCompany();

  // Mode detection
  const isConsolidated = Boolean(customer && (invoices.length > 1 || !invoice));
  const effectiveInvoices = isConsolidated ? invoices : (invoice ? [invoice] : []);
  const primaryInvoice = invoice || effectiveInvoices[0];

  const [selectedTemplateKey, setSelectedTemplateKey] = useState(isConsolidated ? 'consolidated' : 'gentle');
  const [customMessage, setCustomMessage] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState(null); // { success: boolean, text: string }

  if (!primaryInvoice && !customer) return null;

  const clientName = customer?.company_name || customer?.customer_name || primaryInvoice?.client_name || primaryInvoice?.party_name || 'Valued Client';
  const contactPerson = customer?.contact_person || primaryInvoice?._contact_person || '';
  const verifiedPhone = customer?.contact_number || primaryInvoice?._verified_phone || primaryInvoice?.client_phone || '';
  const invNumber = primaryInvoice?.invoice_number || primaryInvoice?.tally_voucher_number || 'N/A';

  const totalAmount = effectiveInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);
  const pendingAmount = effectiveInvoices.reduce((s, i) => s + Number(i.pending_amount !== undefined ? i.pending_amount : (i.status === 'Paid' ? 0 : i.amount || 0)), 0);
  const paidAmount = Math.max(0, totalAmount - pendingAmount);
  const isOverdue = effectiveInvoices.some(i => i.status === 'Overdue');
  const dueDateStr = primaryInvoice ? fmtDate(primaryInvoice.due_date) : 'Various Dates';
  const overdueDays = Math.max(0, ...effectiveInvoices.map(i => {
    if (i.days_overdue) return Number(i.days_overdue);
    if (i.due_date) return Math.floor((Date.now() - new Date(i.due_date)) / 86400000);
    return 0;
  }));

  const clean10 = String(verifiedPhone || '').replace(/[^\d]/g, '').slice(-10);
  const waDirectUrl = clean10 ? `https://wa.me/91${clean10}?text=${encodeURIComponent(customMessage)}` : null;

  // Dynamic Company Details & Bank Account from Settings
  const compName = primaryInvoice?.company_name || activeCompany?.company_name || 'Sobhainfra Tech Private Limited';
  const bankName = activeCompany?.bank_name || 'ICICI BANK';
  const bankAcc = activeCompany?.bank_account_no || '001905012691';
  const bankIfsc = activeCompany?.bank_ifsc || 'ICIC0000019';

  // Smart Pre-built Templates
  const templates = useMemo(() => {
    const greeting = contactPerson ? `Dear ${contactPerson} (${clientName})` : `Dear ${clientName}`;
    const overdueNotice = overdueDays > 0 ? ` (${overdueDays} days overdue)` : '';

    if (isConsolidated) {
      // Build bill-wise bullet summary
      const billsList = effectiveInvoices.slice(0, 8).map(inv => {
        const num = inv.invoice_number || inv.tally_voucher_number || 'Inv';
        const dateStr = inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'N/A';
        const bal = Number(inv.pending_amount !== undefined ? inv.pending_amount : inv.amount);
        const days = inv.days_overdue || (inv.due_date ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date)) / 86400000)) : 0);
        return `• *${num}* (${dateStr}): ${fmtCurrency(bal)} ${days > 0 ? `(${days}d overdue)` : ''}`;
      }).join('\n');

      const moreNotice = effectiveInvoices.length > 8 ? `\n• ...and ${effectiveInvoices.length - 8} more invoices in attached statement` : '';

      return {
        consolidated: {
          id: 'consolidated',
          label: 'Consolidated Statement',
          icon: '📑',
          text: `Namaste ${greeting}! 🙏\n\nGreetings from *${compName}*.\n\nHere is your official account statement of outstanding invoices:\n\n${billsList}${moreNotice}\n----------------------------------------\n💰 *Total Outstanding Due: ${fmtCurrency(pendingAmount)}* across ${effectiveInvoices.length} bills\n\n🏦 *Direct Bank Remittance:* \n• Bank: ${bankName}\n• Account No: ${bankAcc}\n• IFSC Code: ${bankIfsc}\n\n📄 Detailed Statement of Account is attached. Please arrange to clear the balance or share transaction UTR numbers. Thank you! 🙏\n_${compName}_`,
        },
        urgent_multi: {
          id: 'urgent_multi',
          label: 'Urgent Multiple Dues',
          icon: '⚡',
          text: `⚡ *URGENT STATEMENT OF OUTSTANDING DUES* ⚡\n\n${greeting},\n\nWe would like to remind you that your account currently has *${effectiveInvoices.length} unpaid invoices* with Sobhainfra Tech amounting to a total overdue balance of *${fmtCurrency(pendingAmount)}* (Oldest due ${overdueDays} days ago).\n\n🏦 *Payment Transfer Details:*\n• Bank: ${bankName}\n• Account No: ${bankAcc}\n• IFSC Code: ${bankIfsc}\n\nPlease prioritize clearing this balance today to maintain credit dispatch terms. Thank you!`,
        },
        bank_only: {
          id: 'bank_only',
          label: 'Bank Details / UPI',
          icon: '🏦',
          text: `Dear ${greeting},\n\nAs requested, here are our official banking details for clearing your outstanding ledger of *${fmtCurrency(pendingAmount)}* (${effectiveInvoices.length} invoices):\n\n🏦 *Bank Name:* ${bankName}\n🏢 *Beneficiary:* ${compName}\n🔢 *Account Number:* ${bankAcc}\n🏛️ *IFSC Code:* ${bankIfsc}\n\nKindly share the payment screenshot or UTR number once done. Thank you! 🙏`,
        }
      };
    }

    // Single Invoice Mode
    return {
      gentle: {
        id: 'gentle',
        label: 'Gentle Follow-up',
        icon: '👋',
        text: `Namaste ${greeting}! 🙏\n\nGreetings from *${compName}*.\n\nThis is a gentle payment reminder regarding Invoice *${invNumber}*.\n\n💰 *Amount Pending: ${fmtCurrency(pendingAmount)}*\n📅 Due Date: ${dueDateStr}${overdueNotice}\n📌 Status: *${primaryInvoice?.status || 'Pending'}*\n\nKindly arrange to release the payment at your earliest convenience. If already processed, please reply with payment receipt/UTR number.\n\nThank you for your business! 🙏\n_${compName}_`,
      },
      urgent: {
        id: 'urgent',
        label: 'Urgent Overdue',
        icon: '⚡',
        text: `⚡ *URGENT PAYMENT REMINDER* ⚡\n\n${greeting},\n\nWe would like to bring to your attention that Invoice *${invNumber}* is currently *OVERDUE*.\n\n💰 *Pending Outstanding: ${fmtCurrency(pendingAmount)}*\n📅 Original Due Date: ${dueDateStr} (${overdueDays} days past due)\n\nPlease prioritize this payment today to avoid credit hold or billing interruptions.\n\n🏦 *Bank Transfer Details:*\n• Bank: ${bankName}\n• Account No: ${bankAcc}\n• IFSC Code: ${bankIfsc}\n\nKindly confirm payment reference once transferred. Thank you!`,
      },
      final: {
        id: 'final',
        label: 'Final Notice',
        icon: '⚠️',
        text: `⚠️ *FORMAL PAYMENT NOTICE* ⚠️\n\n${greeting},\n\nDespite previous reminders, the outstanding payment for Invoice *${invNumber}* remains unpaid.\n\n💰 *Total Overdue Balance: ${fmtCurrency(pendingAmount)}*\n📅 Due Date Was: ${dueDateStr} (${overdueDays} days overdue)\n\nWe request you to clear this invoice immediately into our account:\n• Bank: *${bankName}*\n• Account: *${bankAcc}*\n• IFSC: *${bankIfsc}*\n\nPlease share the transaction reference today. For queries or ledger reconciliation, feel free to reply directly.\n\nRegards,\n*Accounts & Finance Department*\n${compName}`,
      },
      bank_only: {
        id: 'bank_only',
        label: 'Bank Details / UPI',
        icon: '🏦',
        text: `Dear ${greeting},\n\nAs requested, here are our official banking details for clearing Invoice *${invNumber}* (Amount: *${fmtCurrency(pendingAmount)}*):\n\n🏦 *Bank Name:* ${bankName}\n🏢 *Beneficiary:* ${compName}\n🔢 *Account Number:* ${bankAcc}\n🏛️ *IFSC Code:* ${bankIfsc}\n\nKindly share the payment screenshot or UTR number once done. Thank you! 🙏`,
      }
    };
  }, [clientName, contactPerson, compName, invNumber, pendingAmount, dueDateStr, overdueDays, primaryInvoice?.status, bankName, bankAcc, bankIfsc, isConsolidated, effectiveInvoices]);

  // Set default template text when modal opens or template changes
  useEffect(() => {
    if (templates[selectedTemplateKey]) {
      setCustomMessage(templates[selectedTemplateKey].text);
    }
  }, [selectedTemplateKey, templates]);

  const handleSend = async () => {
    if (!verifiedPhone) {
      setSendResult({ success: false, text: 'No verified phone number found for this customer.' });
      return;
    }

    setIsSending(true);
    setSendResult(null);

    try {
      const effectivePdfUrl = isConsolidated
        ? statementPdfUrl
        : (primaryInvoice?.pdf_url || primaryInvoice?.metadata?.pdf_url || null);

      const payload = {
        isConsolidated,
        invoiceId: primaryInvoice?.id,
        invoiceIds: effectiveInvoices.map(i => i.id),
        phone: verifiedPhone,
        clientName,
        customMessage: customMessage.trim(),
        attachPdf: attachPdf && Boolean(effectivePdfUrl),
        pdfUrl: attachPdf ? effectivePdfUrl : null,
      };

      const res = await fetch('/.netlify/functions/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success && !data.is24hWindowClosed) {
        setSendResult({
          success: true,
          text: `Payment reminder sent successfully to ${verifiedPhone}! Logged in Live Inbox.`
        });
        if (onSendSuccess) {
          onSendSuccess(effectiveInvoices.map(i => i.id), customMessage.trim());
        }
      } else if (data.is24hWindowClosed) {
        setSendResult({
          success: false,
          is24hClosed: true,
          isPaymentRequired: data.isPaymentRequired || data.error?.includes('131042'),
          text: data.error || 'Meta requires an active payment card on your WhatsApp Business Account (WABA: 2375569266307315) to deliver official templates to new contacts.'
        });
      } else {
        const isPay = data.error?.includes('131042') || data.error?.toLowerCase().includes('payment issue');
        setSendResult({
          success: false,
          isPaymentRequired: isPay,
          text: isPay
            ? 'Meta Payment Issue (131042): Add a payment method to your WhatsApp Business Account in Meta Business Suite to activate automated delivery.'
            : (data.error || 'Failed to dispatch reminder. Check WhatsApp credentials.')
        });
      }
    } catch (err) {
      setSendResult({
        success: false,
        text: err.message || 'Network error while dispatching reminder.'
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenInbox = () => {
    onClose();
    navigate('/whatsapp');
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="glass-card"
        style={{
          width: '100%', maxWidth: '640px', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card, #1e293b)',
          border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
          borderRadius: '16px', overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(99,102,241,0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(37, 211, 102, 0.15)', color: '#25D366',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MessageCircle size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Send WhatsApp Payment Reminder
              </h2>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Invoice #{invNumber} · {compName}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.3rem' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Customer & Bill Overview Card */}
          <div style={{
            padding: '0.85rem 1rem', background: 'var(--bg-tertiary, rgba(0,0,0,0.2))',
            borderRadius: '10px', border: '1px solid var(--border-color)',
            display: 'flex', flexDirection: 'column', gap: '0.6rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {clientName}
                </div>
                {contactPerson && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Attn: {contactPerson}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.55rem',
                  borderRadius: 20, background: 'rgba(16, 185, 129, 0.12)', color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem'
                }}>
                  <ShieldCheck size={12} /> {verifiedPhone}
                </span>
                <span className={`badge ${isOverdue ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.72rem' }}>
                  {isOverdue ? `Overdue (${overdueDays}d)` : 'Pending'}
                </span>
              </div>
            </div>

            {/* Financial Details Row */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem',
              paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)',
              fontSize: '0.75rem'
            }}>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Pending Due</div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: isOverdue ? 'var(--danger)' : 'var(--text-primary)' }}>
                  {fmtCurrency(pendingAmount)}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Total Billed</div>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {fmtCurrency(totalAmount)}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Due Date</div>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {dueDateStr}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Preset Selector */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.4rem' }}>
              Select Reminder Template
            </label>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {Object.values(templates).map(t => {
                const isActive = selectedTemplateKey === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTemplateKey(t.id)}
                    style={{
                      padding: '0.35rem 0.75rem', borderRadius: 8, fontSize: '0.76rem', fontWeight: 600,
                      border: isActive ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-color)',
                      background: isActive ? 'rgba(99,102,241,0.18)' : 'var(--bg-tertiary)',
                      color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>{t.icon}</span> {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customizable Text Area */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                WhatsApp Message (Fully Customizable)
              </label>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Supports bold *text*, emojis & direct edits
              </span>
            </div>
            <textarea
              className="input-field"
              rows={8}
              value={customMessage}
              onChange={e => setCustomMessage(e.target.value)}
              placeholder="Type your customized payment reminder here..."
              style={{
                width: '100%', fontFamily: 'inherit', fontSize: '0.82rem',
                lineHeight: 1.5, resize: 'vertical', padding: '0.75rem',
                borderRadius: 8
              }}
            />
          </div>

          {/* PDF Attachment Option */}
          {(invoice.pdf_url || invoice.metadata?.pdf_url) && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer',
              padding: '0.5rem 0.75rem', background: 'rgba(99,102,241,0.06)',
              borderRadius: 8, border: '1px solid rgba(99,102,241,0.15)'
            }}>
              <input
                type="checkbox"
                checked={attachPdf}
                onChange={e => setAttachPdf(e.target.checked)}
                style={{ accentColor: 'var(--accent-primary)', width: 16, height: 16 }}
              />
              <FileText size={15} color="var(--accent-primary)" />
              <span>Attach authentic 2-page Tax Invoice & e-Way Bill PDF</span>
            </label>
          )}

          {/* Result Alert */}
          {sendResult && (sendResult.isPaymentRequired || sendResult.is24hClosed) ? (
            <div style={{
              padding: '0.9rem 1rem', borderRadius: 10, fontSize: '0.82rem',
              background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#d97706', display: 'flex', flexDirection: 'column', gap: '0.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.88rem' }}>
                <AlertTriangle size={16} /> Meta Payment Setup Required (Error 131042)
              </div>
              <div style={{ fontSize: '0.76rem', lineHeight: 1.45, color: 'var(--text-secondary)' }}>
                This recipient has not messaged our WhatsApp Business number in 24 hours. Meta dispatches an official approved template (<strong style={{ color: 'var(--text-primary)' }}>payment_reminder_v1</strong>), but requires an active payment card attached to WhatsApp Business Account (<strong style={{ color: 'var(--text-primary)' }}>WABA ID: 2375569266307315</strong>) to deliver utility messages to new contacts.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                <a
                  href="https://business.facebook.com/billing_hub/accounts?business_id=2375569266307315"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-warning btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', padding: '0.4rem 0.85rem', fontWeight: 600 }}
                >
                  <ExternalLink size={13} /> Add Payment Card in Meta Business Suite ↗
                </a>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Once card is attached, all dispatches deliver 100% automatically via +91 88508 81761.
                </span>
              </div>
            </div>
          ) : sendResult ? (
            <div style={{
              padding: '0.75rem 1rem', borderRadius: 8, fontSize: '0.82rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: sendResult.success ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${sendResult.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: sendResult.success ? '#10b981' : '#ef4444',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {sendResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span>{sendResult.text}</span>
              </div>
              {sendResult.success && (
                <button
                  type="button"
                  onClick={handleOpenInbox}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', gap: '0.25rem' }}
                >
                  View in Live Inbox <ArrowRight size={12} />
                </button>
              )}
            </div>
          ) : null}

        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--bg-tertiary)', flexWrap: 'wrap', gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              disabled={isSending}
            >
              {sendResult?.success ? 'Close' : 'Cancel'}
            </button>
          </div>

          <button
            type="button"
            className="btn btn-whatsapp"
            onClick={handleSend}
            disabled={isSending || !customMessage.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.1rem' }}
          >
            {isSending ? (
              <>
                <RefreshCw size={14} className="animate-spin" /> Dispatching via Meta...
              </>
            ) : (
              <>
                <Send size={14} /> Send via Cloud API
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
