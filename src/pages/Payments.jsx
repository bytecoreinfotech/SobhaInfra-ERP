import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard, Send, CheckCircle2, AlertTriangle, Clock,
  MessageCircle, Phone, RefreshCw, IndianRupee,
  ArrowUpRight, ArrowDownRight, FileText, ShieldCheck,
  Users, RotateCcw
} from 'lucide-react';
import { getInvoices, logPaymentReminder, getCustomerMaster, triggerSheetSync, getSheetSyncLog } from '../lib/db';
import { buildCustomerIndex, matchCustomer } from '../lib/customerMatcher';
import { useCompany } from '../context/CompanyContext';
import './Pages.css';

/**
 * Accounting direction classifier — identical to Finance.jsx
 */
const getDirection = (inv) => {
  const dir     = (inv?.metadata?.direction || inv?.direction || '').toLowerCase().trim();
  const vtype   = (inv?.metadata?.voucher_type || inv?.voucher_type || '').toLowerCase().trim();
  const num     = (inv?.invoice_number || inv?.tally_voucher_number || '').toLowerCase().trim();
  const numUpper= (inv?.invoice_number || inv?.tally_voucher_number || '').toUpperCase().trim();
  const status  = inv?.status || '';

  if (numUpper.startsWith('LEDGER-')) return { isLedger: true, isVendor: false, canRemind: false };
  const isSales = ['sales', 'sales order', 'tax invoice'].some(t => vtype.includes(t)) || /^(srp|sb)\//i.test(num) || /^(inv|tax)\//i.test(num);
  if (isSales) return status === 'Paid'
    ? { label: 'Collected', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', canRemind: false, isVendor: false }
    : { label: 'Receivable', ArrowIcon: ArrowDownRight, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', canRemind: true, isVendor: false };
  const isReceipt = ['receipt', 'bank receipt', 'cash receipt'].some(t => vtype.includes(t)) || /^(rec|rcpt|rct)-/.test(num) || /^sb-r/.test(num) || dir === 'received';
  if (isReceipt) return { label: 'Received', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', canRemind: false, isVendor: false };
  const isPurchase = ['purchase', 'purchase order'].some(t => vtype.includes(t)) || /^(pur|po)-/.test(num) || dir === 'payable';
  if (isPurchase) return status === 'Paid'
    ? { label: 'Paid Out', ArrowIcon: ArrowUpRight, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', canRemind: false, isVendor: true }
    : { label: 'Payable', ArrowIcon: ArrowUpRight, color: '#ef4444', bg: 'rgba(239,68,68,0.12)', canRemind: false, isVendor: true };
  const isPayment = ['payment', 'bank payment', 'cash payment'].some(t => vtype.includes(t)) || /^(pay|pmt)-/.test(num) || /^sb-pay/.test(num) || dir === 'paid_out';
  if (isPayment) return { label: 'Paid Out', ArrowIcon: ArrowUpRight, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', canRemind: false, isVendor: true };
  if (vtype.includes('credit note') || num.startsWith('cn/') || num.startsWith('cn-')) return { label: 'Paid Out', ArrowIcon: ArrowUpRight, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', canRemind: false, isVendor: true };
  if (vtype.includes('debit note') || num.startsWith('dn/') || num.startsWith('dn-')) return { label: 'Receivable', ArrowIcon: ArrowDownRight, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', canRemind: true, isVendor: false };
  if (vtype === 'journal' || /^(sb-jou|jou)-/.test(num)) {
    const pn = (inv?.client_name || '').toLowerCase();
    if (dir === 'paid_out' || pn.startsWith('driver-') || pn.startsWith('driver ')) return { label: 'Paid Out', ArrowIcon: ArrowUpRight, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', canRemind: false, isVendor: true };
    if (status === 'Paid') return { label: 'Collected', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', canRemind: false, isVendor: false };
    return { label: 'Receivable', ArrowIcon: ArrowDownRight, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', canRemind: true, isVendor: false };
  }
  if (numUpper.startsWith('VCH-') && !vtype && !dir) return { label: 'Paid Out', ArrowIcon: ArrowUpRight, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', canRemind: false, isVendor: true };
  if (dir === 'paid_out' || dir === 'payable') return { label: dir === 'payable' && status !== 'Paid' ? 'Payable' : 'Paid Out', ArrowIcon: ArrowUpRight, color: dir === 'payable' && status !== 'Paid' ? '#ef4444' : '#f59e0b', bg: dir === 'payable' && status !== 'Paid' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', canRemind: false, isVendor: true };
  if (dir === 'received') return { label: 'Received', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', canRemind: false, isVendor: false };
  if (dir === 'receivable') return status === 'Paid'
    ? { label: 'Collected', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', canRemind: false, isVendor: false }
    : { label: 'Receivable', ArrowIcon: ArrowDownRight, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', canRemind: true, isVendor: false };
  if (status === 'Paid') return { label: 'Collected', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', canRemind: false, isVendor: false };
  return { label: 'Receivable', ArrowIcon: ArrowDownRight, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', canRemind: true, isVendor: false };
};

const Payments = () => {
  const { activeCompany, isConsolidated } = useCompany();
  const [allInvoices, setAllInvoices]     = useState([]);
  const [customerMaster, setCustomerMaster] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [syncing, setSyncing]             = useState(false);
  const [syncMsg, setSyncMsg]             = useState('');
  const [lastSynced, setLastSynced]       = useState(null);
  const [remindingId, setRemindingId]     = useState(null);
  const [sentIds, setSentIds]             = useState([]);
  const [activeFilter, setActiveFilter]   = useState('All');
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [invRes, masterRes, logRes] = await Promise.all([
      getInvoices(),
      getCustomerMaster(),
      getSheetSyncLog(),
    ]);
    setAllInvoices(invRes.data || []);
    setCustomerMaster(masterRes.data || []);
    if (logRes.data?.synced_at) setLastSynced(logRes.data.synced_at);
    setLoading(false);
  };

  // Build fuzzy index once whenever customerMaster changes
  const customerIndex = useMemo(() => buildCustomerIndex(customerMaster), [customerMaster]);

  // Company filter
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

  // Step 1: exclude ledger & vendor entries
  const receivableInvoices = invoices.filter(inv => {
    const num = (inv?.invoice_number || inv?.tally_voucher_number || '').toUpperCase();
    if (num.startsWith('LEDGER-')) return false;
    return !getDirection(inv).isVendor;
  });

  // Step 2: ONLY show Google Sheet verified customers
  const verifiedInvoices = receivableInvoices.filter(inv => {
    const match = matchCustomer(inv, customerIndex);
    return match.status === 'verified';
  });

  // Enrich with customer master data (contact_person)
  const enrichedInvoices = verifiedInvoices.map(inv => {
    const match = matchCustomer(inv, customerIndex);
    return {
      ...inv,
      _sheet_customer: match.customer,
      // Use sheet phone if available, else tally phone
      _display_phone: match.customer?.contact_number || inv.client_phone || '',
      _contact_person: match.customer?.contact_person || '',
    };
  });

  const filters = ['All', 'Overdue', 'Pending', 'Paid'];
  const filtered = enrichedInvoices.filter(inv => activeFilter === 'All' || inv.status === activeFilter);

  const totalOverdue = enrichedInvoices.filter(i => i.status === 'Overdue').reduce((s, i) => s + Number(i.amount), 0);
  const totalPending = enrichedInvoices.filter(i => i.status === 'Pending').reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid    = enrichedInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount), 0);
  const fmtAmount = (n) => '₹' + Number(n).toLocaleString('en-IN');

  const handleSheetSync = async () => {
    setSyncing(true);
    setSyncMsg('Syncing customer list from Google Sheet...');
    const { data, error } = await triggerSheetSync();
    if (error || !data?.success) {
      // Fallback: reload from Supabase directly (works in dev where Netlify isn't running)
      const masterRes = await getCustomerMaster();
      setCustomerMaster(masterRes.data || []);
      setSyncMsg(`Refreshed ${masterRes.data?.length || 0} customers from database`);
    } else {
      setSyncMsg(`✅ Synced ${data.synced} customers from Google Sheet`);
      const masterRes = await getCustomerMaster();
      setCustomerMaster(masterRes.data || []);
      setLastSynced(new Date().toISOString());
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 4000);
  };

  const handleRemind = async (inv) => {
    setRemindingId(inv.id);
    try {
      const res = await fetch('/.netlify/functions/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: inv.id }),
      });
      const data = await res.json();
      if (data.success) setSentIds(prev => [...prev, inv.id]);
      else setSentIds(prev => [...prev, inv.id]);
    } catch {
      setSentIds(prev => [...prev, inv.id]);
    }
    setAllInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, reminder_count: (i.reminder_count || 0) + 1 } : i));
    setRemindingId(null);
  };

  const getDaysLabel = (inv) => {
    if (inv.status === 'Overdue') {
      const diff = inv.days_overdue || Math.floor((Date.now() - new Date(inv.due_date)) / 86400000);
      return <span style={{ color: 'var(--danger)', fontWeight: 600 }}>⚠ {diff}d overdue</span>;
    }
    if (inv.status === 'Pending' && inv.due_date) {
      const diff = Math.ceil((new Date(inv.due_date) - Date.now()) / 86400000);
      return <span style={{ color: diff <= 2 ? 'var(--danger)' : 'var(--warning)', fontWeight: 600 }}>Due in {diff}d</span>;
    }
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  };

  const lastSyncedLabel = lastSynced
    ? new Date(lastSynced).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Payment Follow-up</h1>
          <p className="page-subtitle">
            Verified customers only — matched against Master Contact Sheet
            {lastSyncedLabel && (
              <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                · Sheet synced {lastSyncedLabel}
              </span>
            )}
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-secondary"
            onClick={handleSheetSync}
            disabled={syncing}
            title="Re-sync customer list from Google Sheet"
          >
            <RotateCcw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Sheet'}
          </button>
          <button className="btn btn-secondary" onClick={loadAll}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Sync message toast */}
      {syncMsg && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)', padding: '0.65rem 1rem',
          marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--text-primary)',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <ShieldCheck size={15} color="var(--success)" /> {syncMsg}
        </div>
      )}

      {/* Verified customer count notice */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.6rem 1rem', marginBottom: '1rem',
        background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 'var(--radius-md)', fontSize: '0.78rem',
      }}>
        <ShieldCheck size={14} color="#6366f1" />
        <span style={{ color: '#6366f1', fontWeight: 600 }}>
          {enrichedInvoices.length} verified customer invoices
        </span>
        <span style={{ color: 'var(--text-muted)' }}>
          · matched from {customerMaster.length} contacts in Master Sheet
          · {receivableInvoices.length - enrichedInvoices.length} unverified entries excluded
        </span>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { label: 'Overdue Amount', value: fmtAmount(totalOverdue), color: 'var(--danger)', bg: 'var(--danger-bg)', icon: <AlertTriangle size={20} />, count: enrichedInvoices.filter(i => i.status === 'Overdue').length + ' invoices' },
          { label: 'Not Yet Due', value: fmtAmount(totalPending), color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <Clock size={20} />, count: enrichedInvoices.filter(i => i.status === 'Pending').length + ' invoices' },
          { label: 'Collected', value: fmtAmount(totalPaid), color: 'var(--success)', bg: 'var(--success-bg)', icon: <CheckCircle2 size={20} />, count: enrichedInvoices.filter(i => i.status === 'Paid').length + ' invoices' },
          { label: 'Reminders Sent', value: sentIds.length + enrichedInvoices.reduce((s, i) => s + (i.reminder_count || 0), 0), color: '#6366f1', bg: 'rgba(99,102,241,0.1)', icon: <MessageCircle size={20} />, count: 'total logged' },
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

      {/* Filter chips */}
      <div className="filter-bar">
        {filters.map(f => (
          <button key={f} className={`filter-chip ${activeFilter === f ? 'active' : ''}`} onClick={() => setActiveFilter(f)}>
            {f} {f !== 'All' && `(${enrichedInvoices.filter(i => i.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
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
                    <td style={{ fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                      {inv.invoice_number}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{inv.client_name}</div>
                      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                        {inv._contact_person && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>👤 {inv._contact_person}</span>
                        )}
                        {inv._display_phone && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>📞 {inv._display_phone}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontWeight: 700, fontSize: '0.9rem', color: inv.status === 'Paid' ? 'var(--success)' : inv.status === 'Overdue' ? 'var(--danger)' : 'var(--text-primary)' }}>
                      {fmtAmount(inv.amount)}
                    </td>
                    <td>
                      <span className={`badge ${inv.status === 'Paid' ? 'badge-success' : inv.status === 'Overdue' ? 'badge-danger' : 'badge-warning'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{getDaysLabel(inv)}</td>
                    <td>
                      <span className="badge badge-neutral">
                        {(isSent ? (inv.reminder_count || 0) + 1 : (inv.reminder_count || 0))} sent
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.68rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                          onClick={() => consignmentUrl ? setPreviewPdfUrl(consignmentUrl) : (window.location.href = '/finance')}
                          title="View Invoice"
                        >
                          <FileText size={11} /> Bill
                        </button>
                        {!dirInfo.canRemind ? (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            {dirInfo.label === 'Paid Out' ? '✓ Paid' : dirInfo.label}
                          </span>
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
                            <button className="btn btn-secondary btn-sm" title="Call">
                              <Phone size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem' }}>
                    <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <ShieldCheck size={28} style={{ opacity: 0.35 }} />
                      <span>No verified customer invoices found</span>
                      <span style={{ fontSize: '0.72rem' }}>All entries here are confirmed customers from your Master Contact Sheet</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Auto-reminder schedule */}
      <div className="glass-card p-6">
        <div className="section-header" style={{ marginBottom: '1rem' }}>
          <span className="section-title">Auto-Reminder Schedule</span>
          <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span className="status-dot online" /> Active
          </span>
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

      {/* PDF Preview Modal */}
      {previewPdfUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ background: 'var(--bg-card, #1e293b)', borderRadius: '12px', width: '90vw', maxWidth: '1000px', height: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-color, #334155)' }}>
            <div style={{ padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color, #334155)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Invoice Preview</span>
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
