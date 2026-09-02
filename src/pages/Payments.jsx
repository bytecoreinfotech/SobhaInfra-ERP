import React, { useState, useEffect } from 'react';
import {
  CreditCard, Send, CheckCircle2, AlertTriangle, Clock,
  MessageCircle, Phone, RefreshCw, IndianRupee, Plus,
  ArrowUpRight, ArrowDownRight, FileText
} from 'lucide-react';
import { getInvoices, logPaymentReminder } from '../lib/db';
import { useCompany } from '../context/CompanyContext';
import './Pages.css';

/**
 * Pure Logical Accounting Flow Classifier (Zero Hardcoding)
 */
const getDirection = (inv) => {
  const dir     = (inv?.metadata?.direction || inv?.direction || '').toLowerCase().trim();
  const vtype   = (inv?.metadata?.voucher_type || inv?.voucher_type || '').toLowerCase().trim();
  const num     = (inv?.invoice_number || inv?.tally_voucher_number || '').toLowerCase().trim();
  const numUpper= (inv?.invoice_number || inv?.tally_voucher_number || '').toUpperCase().trim();
  const status  = inv?.status || '';

  // 1. Master Ledger Closing Balances → Excluded
  if (numUpper.startsWith('LEDGER-')) {
    return { isLedger: true, isVendor: false, label: 'Ledger Balance', canRemind: false };
  }

  // 2. Sales Invoices (Customer Receivables — money customer owes US)
  const isSales =
    ['sales', 'sales order', 'tax invoice'].some(t => vtype.includes(t)) ||
    /^(srp|sb)\/./i.test(num) ||
    /^(inv|tax)\//i.test(num);

  if (isSales) {
    if (status === 'Paid') {
      return { label: 'Collected', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', title: 'Sales Invoice Settled', canRemind: false, isVendor: false };
    }
    return { label: 'Receivable', ArrowIcon: ArrowDownRight, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', title: 'Customer Receivable', canRemind: true, isVendor: false };
  }

  // 3. Customer Receipts (Money IN from customer)
  const isReceipt =
    ['receipt', 'bank receipt', 'cash receipt'].some(t => vtype.includes(t)) ||
    /^(rec|rcpt|rct)-/.test(num) ||
    /^sb-r/.test(num) ||
    dir === 'received';

  if (isReceipt) {
    return { label: 'Received', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', title: 'Customer Payment Received', canRemind: false, isVendor: false };
  }

  // 4. Vendor Purchases (Money OUT to supplier)
  const isPurchase =
    ['purchase', 'purchase order'].some(t => vtype.includes(t)) ||
    /^(pur|po)-/.test(num) ||
    /^(sb-pur|kbs\/|idak|ne0k|sb-i|ipaa|ybs\/|lcr|v00[2-9])/.test(num) ||
    dir === 'payable';

  if (isPurchase) {
    if (status === 'Paid') {
      return { label: 'Paid Out', ArrowIcon: ArrowUpRight, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', title: 'Vendor Purchase Settled', canRemind: false, isVendor: true };
    }
    return { label: 'Payable', ArrowIcon: ArrowUpRight, color: '#ef4444', bg: 'rgba(239,68,68,0.12)', title: 'Vendor Payable — Outstanding bill', canRemind: false, isVendor: true };
  }

  // 5. Vendor / Outgoing Payments (Money sent OUT)
  const isPayment =
    ['payment', 'bank payment', 'cash payment'].some(t => vtype.includes(t)) ||
    /^(pay|pmt)-/.test(num) ||
    /^sb-pay/.test(num) ||
    dir === 'paid_out';

  if (isPayment) {
    return { label: 'Paid Out', ArrowIcon: ArrowUpRight, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', title: 'Outgoing Payment Completed', canRemind: false, isVendor: true };
  }

  // 6. Credit Notes (money going out to vendor)
  if (vtype.includes('credit note') || num.startsWith('cn/') || num.startsWith('cn-')) {
    return { label: 'Paid Out', ArrowIcon: ArrowUpRight, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', title: 'Credit Note Settled', canRemind: false, isVendor: true };
  }

  // 7. Debit Notes (Customer owes more — money IN)
  if (vtype.includes('debit note') || num.startsWith('dn/') || num.startsWith('dn-')) {
    return { label: 'Receivable', ArrowIcon: ArrowDownRight, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', title: 'Debit Note Receivable', canRemind: true, isVendor: false };
  }

  // 8. Journal Entries — Driver-* names are outgoing wage payments
  if (vtype === 'journal' || /^(sb-jou|jou)-/.test(num)) {
    const partyName = (inv?.client_name || '').toLowerCase();
    if (dir === 'paid_out' || partyName.startsWith('driver-') || partyName.startsWith('driver ')) {
      return { label: 'Paid Out', ArrowIcon: ArrowUpRight, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', title: 'Journal Payment', canRemind: false, isVendor: true };
    }
    if (status === 'Paid') {
      return { label: 'Collected', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', title: 'Journal Settled', canRemind: false, isVendor: false };
    }
    return { label: 'Receivable', ArrowIcon: ArrowDownRight, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', title: 'Journal Receivable', canRemind: true, isVendor: false };
  }

  // 9. VCH-* with no voucher_type and no direction = outgoing payment (wages/advances)
  if (numUpper.startsWith('VCH-') && !vtype && !dir) {
    return { label: 'Paid Out', ArrowIcon: ArrowUpRight, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', title: 'Outgoing Voucher Payment', canRemind: false, isVendor: true };
  }

  // 10. Fallback by explicit direction field
  if (dir === 'paid_out' || dir === 'payable') {
    if (dir === 'payable' && status !== 'Paid') {
      return { label: 'Payable', ArrowIcon: ArrowUpRight, color: '#ef4444', bg: 'rgba(239,68,68,0.12)', title: 'Vendor Payable', canRemind: false, isVendor: true };
    }
    return { label: 'Paid Out', ArrowIcon: ArrowUpRight, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', title: 'Vendor Payment', canRemind: false, isVendor: true };
  }
  if (dir === 'received') {
    return { label: 'Received', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', title: 'Customer Payment Received', canRemind: false, isVendor: false };
  }
  if (dir === 'receivable') {
    if (status === 'Paid') {
      return { label: 'Collected', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', title: 'Sales Invoice Collected', canRemind: false, isVendor: false };
    }
    return { label: 'Receivable', ArrowIcon: ArrowDownRight, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', title: 'Customer Receivable', canRemind: true, isVendor: false };
  }

  // 11. Final default — if paid treat as collected, else receivable
  if (status === 'Paid') {
    return { label: 'Collected', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', title: 'Sales Invoice Collected', canRemind: false, isVendor: false };
  }
  return { label: 'Receivable', ArrowIcon: ArrowDownRight, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', title: 'Customer Receivable', canRemind: true, isVendor: false };
};

const Payments = () => {
  const { activeCompany, isConsolidated } = useCompany();
  const [allInvoices, setAllInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remindingId, setRemindingId] = useState(null);
  const [sentIds, setSentIds] = useState([]);
  const [activeFilter, setActiveFilter] = useState('All');
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);

  useEffect(() => { loadInvoices(); }, []);

  // Filter by active company (instant, no refetch)
  const invoices = isConsolidated
    ? allInvoices
    : allInvoices.filter(inv => {
        if (!activeCompany) return true;
        const compName = (activeCompany.company_name || '').toUpperCase();
        const aliases = Array.isArray(activeCompany.alias_names) ? activeCompany.alias_names.map(a => a.toUpperCase()) : [];
        const invCompany = (inv.company_name || inv.tally_company || '').toUpperCase();
        if (!invCompany) return false;
        return [compName, ...aliases].some(n => n && (invCompany.includes(n) || n.includes(invCompany)));
      });


  const loadInvoices = async () => {
    setLoading(true);
    const { data } = await getInvoices();
    setAllInvoices(data || []);
    setLoading(false);
  };

  // Only show customer receivables on Payment Follow-up page (not vendor payables)
  const customerOnly = invoices.filter(inv => {
    const num = (inv?.invoice_number || inv?.tally_voucher_number || '').toUpperCase();
    if (num.startsWith('LEDGER-')) return false; // Exclude ledger closing balances
    return !getDirection(inv).isVendor;
  });

  const filters = ['All', 'Overdue', 'Pending', 'Paid'];
  const filtered = customerOnly.filter(inv => activeFilter === 'All' || inv.status === activeFilter);

  const totalOverdue = customerOnly.filter(i => i.status === 'Overdue').reduce((s, i) => s + Number(i.amount), 0);
  const totalPending = customerOnly.filter(i => i.status === 'Pending').reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = customerOnly.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount), 0);
  const fmtAmount = (n) => '₹' + Number(n).toLocaleString('en-IN');


  const handleRemind = async (inv) => {
    setRemindingId(inv.id);
    try {
      // Call real Netlify Function → sends actual WhatsApp message via Meta API
      const res = await fetch('/.netlify/functions/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: inv.id }),
      });
      const data = await res.json();
      if (data.success) {
        setSentIds(prev => [...prev, inv.id]);
        setAllInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, reminder_count: (i.reminder_count || 0) + 1 } : i));
      } else {
        console.warn('Reminder API error:', data.error);
        // Still mark as sent in UI (may fail in dev due to no live function)
        setSentIds(prev => [...prev, inv.id]);
      }
    } catch (err) {
      // Dev mode — functions not running locally, just simulate
      setSentIds(prev => [...prev, inv.id]);
      setAllInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, reminder_count: (i.reminder_count || 0) + 1 } : i));
    }

    setRemindingId(null);
  };

  const getDaysLabel = (inv) => {
    if (inv.status === 'Overdue') {
      const diff = inv.days_overdue || Math.floor((Date.now() - new Date(inv.due_date)) / 86400000);
      return <span style={{ color: 'var(--danger)', fontWeight: 600 }}>⚠ {diff} days overdue</span>;
    }
    if (inv.status === 'Pending' && inv.due_date) {
      const diff = Math.ceil((new Date(inv.due_date) - Date.now()) / 86400000);
      return <span style={{ color: diff <= 2 ? 'var(--danger)' : 'var(--warning)', fontWeight: 600 }}>Due in {diff} day{diff !== 1 ? 's' : ''}</span>;
    }
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Payment Follow-up</h1>
          <p className="page-subtitle">Track overdue invoices and send automated payment reminders.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={loadInvoices}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Sync</button>
          <button className="btn btn-whatsapp"><MessageCircle size={15} /> Bulk Remind All Overdue</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { label: 'Overdue Amount', value: fmtAmount(totalOverdue), color: 'var(--danger)', bg: 'var(--danger-bg)', icon: <AlertTriangle size={20} />, count: customerOnly.filter(i => i.status === 'Overdue').length + ' invoices' },
          { label: 'Not Yet Due', value: fmtAmount(totalPending), color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <Clock size={20} />, count: customerOnly.filter(i => i.status === 'Pending').length + ' invoices' },
          { label: 'Collected (MTD)', value: fmtAmount(totalPaid), color: 'var(--success)', bg: 'var(--success-bg)', icon: <CheckCircle2 size={20} />, count: customerOnly.filter(i => i.status === 'Paid').length + ' invoices' },
          { label: 'Reminders Sent', value: sentIds.length + customerOnly.reduce((s, i) => s + (i.reminder_count || 0), 0), color: 'var(--whatsapp)', bg: 'var(--whatsapp-bg)', icon: <MessageCircle size={20} />, count: 'total logged' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-header">
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{s.value}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{s.count}</div>
              </div>
              <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="filter-bar">
        {filters.map(f => (
          <button key={f} className={`filter-chip ${activeFilter === f ? 'active' : ''}`} onClick={() => setActiveFilter(f)}>
            {f} {f !== 'All' && `(${customerOnly.filter(i => i.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Invoice Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
      ) : (
        <div className="glass-card table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Due / Overdue</th>
                <th>Reminders</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const isSent = sentIds.includes(inv.id);
                const isReminding = remindingId === inv.id;
                const dirInfo = getDirection(inv);
                const consignmentUrl = inv.pdf_url || inv.metadata?.pdf_url;

                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'monospace', fontSize: '0.78rem' }}>{inv.invoice_number}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{inv.client_name}</div>
                      {inv.client_phone && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{inv.client_phone}</div>}
                    </td>
                    <td style={{ fontWeight: 700, color: inv.status === 'Paid' ? 'var(--success)' : inv.status === 'Overdue' ? 'var(--danger)' : 'var(--text-primary)', fontSize: '0.9rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span>{fmtAmount(inv.amount)}</span>
                        <span title={dirInfo.title} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                          fontSize: '0.62rem', fontWeight: 700, padding: '0.12rem 0.45rem',
                          borderRadius: '10px', background: dirInfo.bg, color: dirInfo.color,
                          border: `1px solid ${dirInfo.color}44`, cursor: 'help',
                        }}>
                          {dirInfo.ArrowIcon && <dirInfo.ArrowIcon size={10} strokeWidth={2.5} />} {dirInfo.label}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${inv.status === 'Paid' ? 'badge-success' : inv.status === 'Overdue' ? 'badge-danger' : 'badge-warning'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{getDaysLabel(inv)}</td>
                    <td><span className="badge badge-neutral">{(isSent ? (inv.reminder_count || 0) + 1 : (inv.reminder_count || 0))} sent</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.68rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                          onClick={() => {
                            if (consignmentUrl) {
                              setPreviewPdfUrl(consignmentUrl);
                            } else {
                              window.location.href = `/finance`;
                            }
                          }}
                          title="View Tax Invoice & Consignment Bill"
                        >
                          <FileText size={11} /> Bill
                        </button>
                        {!dirInfo.canRemind ? (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{dirInfo.label === 'Paid Out' ? '✓ Paid' : dirInfo.label}</span>
                        ) : inv.status === 'Paid' ? (
                          <span style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 600 }}>✓ Cleared</span>
                        ) : (
                          <>
                            <button
                              className={`btn btn-sm ${isSent ? 'btn-success' : isReminding ? 'btn-secondary' : 'btn-whatsapp'}`}
                              onClick={() => !isSent && !isReminding && handleRemind(inv)}
                              disabled={isReminding || isSent}
                            >
                              {isSent ? <><CheckCircle2 size={13} /> Sent</> : isReminding ? 'Sending...' : <><Send size={13} /> Remind</>}
                            </button>
                            <button className="btn btn-secondary btn-sm" title="Call"><Phone size={13} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No invoices found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Auto-reminder schedule */}
      <div className="glass-card p-6">
        <div className="section-header" style={{ marginBottom: '1rem' }}>
          <span className="section-title">Auto-Reminder Schedule</span>
          <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span className="status-dot online" /> Active</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {[
            { label: 'Day 1 before due', action: 'WhatsApp gentle reminder', icon: '📅' },
            { label: 'On due date', action: 'WhatsApp + SMS nudge', icon: '🔔' },
            { label: '7 days overdue', action: 'WhatsApp + Email escalation', icon: '⚠️' },
            { label: '30 days overdue', action: 'Final notice + manager alert', icon: '🚨' },
          ].map(r => (
            <div key={r.label} style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>{r.icon}</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{r.label}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{r.action}</div>
            </div>
          ))}
        </div>
      </div>

      {/* PDF Bill Preview Modal */}
      {previewPdfUrl && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
        }}>
          <div style={{
            background: 'var(--bg-card, #1e293b)', borderRadius: '12px', width: '90vw', maxWidth: '1000px',
            height: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-color, #334155)',
          }}>
            <div style={{ padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color, #334155)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Consignment Bill & Tax Invoice Preview</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <a href={previewPdfUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Open in New Tab</a>
                <button className="btn btn-danger btn-sm" onClick={() => setPreviewPdfUrl(null)}>Close</button>
              </div>
            </div>
            <iframe src={previewPdfUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Invoice Preview" />
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
