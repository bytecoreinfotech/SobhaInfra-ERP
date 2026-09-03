import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard, Send, CheckCircle2, AlertTriangle, Clock,
  MessageCircle, Phone, RefreshCw, IndianRupee,
  ArrowUpRight, ArrowDownRight, FileText, ShieldCheck,
  RotateCcw, Search, AlertCircle, X, ExternalLink, HelpCircle
} from 'lucide-react';
import { getInvoices, getCustomerMaster, triggerSheetSync, getSheetSyncLog } from '../lib/db';
import { buildCustomerIndex, matchCustomer } from '../lib/customerMatcher';
import { useCompany } from '../context/CompanyContext';
import './Pages.css';

/**
 * Accounting direction classifier — mirrors Finance.jsx logic
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
  const [allInvoices, setAllInvoices]         = useState([]);
  const [customerMaster, setCustomerMaster]   = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [syncing, setSyncing]                 = useState(false);
  const [syncMsg, setSyncMsg]                 = useState('');
  const [lastSynced, setLastSynced]           = useState(null);
  const [remindingId, setRemindingId]         = useState(null);
  const [sentIds, setSentIds]                 = useState([]);
  const [statusFilter, setStatusFilter]       = useState('All'); // 'All' | 'Overdue' | 'Pending' | 'Paid'
  const [phoneFilter, setPhoneFilter]         = useState('all'); // 'all' | 'verified' | 'missing'
  const [searchQuery, setSearchQuery]         = useState('');
  const [previewPdfUrl, setPreviewPdfUrl]     = useState(null);
  const [detailModalInv, setDetailModalInv]   = useState(null);

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

  // Build customer fuzzy index once whenever customerMaster updates
  const customerIndex = useMemo(() => buildCustomerIndex(customerMaster), [customerMaster]);

  // Company filtering across active workspace
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

  // Step 1: Exclude ledger closing balances & vendor entries
  const receivableInvoices = invoices.filter(inv => {
    const num = (inv?.invoice_number || inv?.tally_voucher_number || '').toUpperCase();
    if (num.startsWith('LEDGER-')) return false;
    return !getDirection(inv).isVendor;
  });

  // Step 2: ONLY include parties verified against the Google Sheet Master
  const enrichedInvoices = useMemo(() => {
    return receivableInvoices
      .map(inv => {
        const match = matchCustomer(inv, customerIndex);
        if (match.status !== 'verified' || !match.customer) return null;

        const rawPhone = (match.customer.contact_number || '').trim();
        // Strictly verified only if present in Google Sheet (digits count >= 10)
        const digits = rawPhone.replace(/\D/g, '');
        const hasVerifiedPhone = digits.length >= 10;

        return {
          ...inv,
          _sheet_customer: match.customer,
          _has_verified_phone: hasVerifiedPhone,
          _verified_phone: hasVerifiedPhone ? rawPhone : '', // STRICTLY Google Sheet phone
          _contact_person: match.customer.contact_person || '',
        };
      })
      .filter(Boolean);
  }, [receivableInvoices, customerIndex]);

  // Multi-dimensional filtering: Status + Phone Verified Status + Search Query
  const filtered = useMemo(() => {
    return enrichedInvoices.filter(inv => {
      // 1. Status Filter
      if (statusFilter !== 'All' && inv.status !== statusFilter) return false;

      // 2. Phone Verification Filter
      if (phoneFilter === 'verified' && !inv._has_verified_phone) return false;
      if (phoneFilter === 'missing' && inv._has_verified_phone) return false;

      // 3. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const num = (inv.invoice_number || '').toLowerCase();
        const client = (inv.client_name || '').toLowerCase();
        const person = (inv._contact_person || '').toLowerCase();
        const phone = (inv._verified_phone || '').toLowerCase();
        if (!num.includes(q) && !client.includes(q) && !person.includes(q) && !phone.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [enrichedInvoices, statusFilter, phoneFilter, searchQuery]);

  // Aggregate Metrics
  const totalOverdue = enrichedInvoices.filter(i => i.status === 'Overdue').reduce((s, i) => s + Number(i.amount), 0);
  const totalPending = enrichedInvoices.filter(i => i.status === 'Pending').reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid    = enrichedInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount), 0);
  const totalWithPhone = enrichedInvoices.filter(i => i._has_verified_phone).length;
  const totalMissingPhone = enrichedInvoices.filter(i => !i._has_verified_phone).length;

  const fmtAmount = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

  const handleSheetSync = async () => {
    setSyncing(true);
    setSyncMsg('Fetching latest updates from Google Sheet...');
    const { data, error } = await triggerSheetSync();
    if (error || !data?.success) {
      const masterRes = await getCustomerMaster();
      setCustomerMaster(masterRes.data || []);
      setSyncMsg(`Refreshed ${masterRes.data?.length || 0} customers from database`);
    } else {
      setSyncMsg(`✅ Synced ${data.synced} customers from Google Sheet! Phone numbers updated.`);
      const masterRes = await getCustomerMaster();
      setCustomerMaster(masterRes.data || []);
      setLastSynced(new Date().toISOString());
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 4500);
  };

  const handleRemind = async (inv) => {
    if (!inv._has_verified_phone) return;
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
    if (inv.status === 'Paid') return <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Settled</span>;
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
            Authoritative Google Sheet Customer Directory
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
            title="Fetch latest names & phone numbers from live Google Sheet"
          >
            <RotateCcw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Sheet'}
          </button>
          <button className="btn btn-secondary" onClick={loadAll} title="Reload invoices from database">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Sync Notification Toast */}
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

      {/* Verification Summary Banner */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.75rem 1.1rem', marginBottom: '1.25rem',
        background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)',
        borderRadius: 'var(--radius-md)', fontSize: '0.8rem', flexWrap: 'wrap', gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldCheck size={16} color="#6366f1" />
          <span style={{ color: '#6366f1', fontWeight: 700 }}>
            {enrichedInvoices.length} Verified Customer Invoices
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            · Matched from {customerMaster.length} Google Sheet Master Contacts
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', fontSize: '0.75rem' }}>
          <span style={{ color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
            {totalWithPhone} Ready for WhatsApp
          </span>
          {totalMissingPhone > 0 && (
            <span style={{ color: '#d97706', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }} title="Add phone numbers in Google Sheet and click 'Sync Sheet' to enable">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#d97706' }} />
              {totalMissingPhone} Phone Missing in Sheet (Greyed Out)
            </span>
          )}
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats-grid">
        {[
          { label: 'Overdue Amount', value: fmtAmount(totalOverdue), color: 'var(--danger)', bg: 'var(--danger-bg)', icon: <AlertTriangle size={20} />, count: enrichedInvoices.filter(i => i.status === 'Overdue').length + ' invoices' },
          { label: 'Not Yet Due', value: fmtAmount(totalPending), color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <Clock size={20} />, count: enrichedInvoices.filter(i => i.status === 'Pending').length + ' invoices' },
          { label: 'Collected (Paid)', value: fmtAmount(totalPaid), color: 'var(--success)', bg: 'var(--success-bg)', icon: <CheckCircle2 size={20} />, count: enrichedInvoices.filter(i => i.status === 'Paid').length + ' invoices' },
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

      {/* Search & Multi-filter Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {/* Status Filter Chips */}
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          {['All', 'Overdue', 'Pending', 'Paid'].map(f => (
            <button
              key={f}
              className={`filter-chip ${statusFilter === f ? 'active' : ''}`}
              onClick={() => setStatusFilter(f)}
            >
              {f} {f !== 'All' && `(${enrichedInvoices.filter(i => i.status === f).length})`}
            </button>
          ))}
        </div>

        {/* Phone Verification Filter Chips */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginRight: '0.2rem' }}>
            Phone Filter:
          </span>
          {[
            { id: 'all', label: `All (${enrichedInvoices.length})` },
            { id: 'verified', label: `📱 Verified Phone (${totalWithPhone})`, activeColor: '#10b981' },
            { id: 'missing', label: `⚠️ Missing Phone (${totalMissingPhone})`, activeColor: '#d97706' },
          ].map(pf => {
            const isActive = phoneFilter === pf.id;
            return (
              <button
                key={pf.id}
                onClick={() => setPhoneFilter(pf.id)}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: isActive ? 700 : 500,
                  padding: '0.3rem 0.65rem',
                  borderRadius: '9999px',
                  border: isActive ? `1.5px solid ${pf.activeColor || 'var(--accent-primary)'}` : '1px solid var(--border-color)',
                  background: isActive ? (pf.activeColor ? `${pf.activeColor}18` : 'var(--accent-primary-bg, rgba(99,102,241,0.12))') : 'var(--bg-tertiary)',
                  color: isActive ? (pf.activeColor || 'var(--accent-primary)') : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {pf.label}
              </button>
            );
          })}
        </div>

        {/* Search Box */}
        <div style={{ position: 'relative', minWidth: '220px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search voucher, client..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '32px', fontSize: '0.78rem', height: '32px' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Main Invoices Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3.5rem' }}>
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
                const hasPhone = inv._has_verified_phone;

                return (
                  <tr
                    key={inv.id}
                    style={{
                      opacity: hasPhone ? 1 : 0.72,
                      background: hasPhone ? 'transparent' : 'rgba(248, 250, 252, 0.45)',
                      transition: 'all 0.15s ease',
                    }}
                    title={!hasPhone ? "⚠️ Phone number missing in Google Sheet. Add contact number in Google Sheet and click 'Sync Sheet' to enable WhatsApp reminders." : undefined}
                  >
                    {/* Invoice Number */}
                    <td style={{ fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                      {inv.invoice_number}
                    </td>

                    {/* Client & Phone Verified from Sheet */}
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: hasPhone ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {inv.client_name}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                        {inv._contact_person && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            👤 {inv._contact_person}
                          </span>
                        )}
                        {hasPhone ? (
                          <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                            📞 {inv._verified_phone}
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              background: 'rgba(245, 158, 11, 0.12)',
                              color: '#d97706',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              padding: '0.1rem 0.45rem',
                              borderRadius: '12px',
                              cursor: 'help',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }}
                            title="Phone number missing in Google Sheet. Update Google Sheet and click 'Sync Sheet' to enable WhatsApp reminders."
                          >
                            ⚠️ No Phone in Sheet
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Amount */}
                    <td style={{ fontWeight: 700, fontSize: '0.9rem', color: inv.status === 'Paid' ? 'var(--success)' : inv.status === 'Overdue' ? 'var(--danger)' : 'var(--text-primary)' }}>
                      {fmtAmount(inv.amount)}
                    </td>

                    {/* Status */}
                    <td>
                      <span className={`badge ${inv.status === 'Paid' ? 'badge-success' : inv.status === 'Overdue' ? 'badge-danger' : 'badge-warning'}`}>
                        {inv.status}
                      </span>
                    </td>

                    {/* Due / Overdue */}
                    <td style={{ fontSize: '0.82rem' }}>{getDaysLabel(inv)}</td>

                    {/* Reminders Count */}
                    <td>
                      <span className="badge badge-neutral">
                        {(isSent ? (inv.reminder_count || 0) + 1 : (inv.reminder_count || 0))} sent
                      </span>
                    </td>

                    {/* Actions */}
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        {/* Bill Button — opens PDF modal if attached, else opens in-page Voucher Detail modal (NEVER redirects away) */}
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.68rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                          onClick={() => {
                            if (consignmentUrl) {
                              setPreviewPdfUrl(consignmentUrl);
                            } else {
                              setDetailModalInv(inv);
                            }
                          }}
                          title="View Invoice / Voucher Details"
                        >
                          <FileText size={11} /> Bill
                        </button>

                        {!dirInfo.canRemind ? (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            {dirInfo.label === 'Paid Out' ? '✓ Paid' : dirInfo.label}
                          </span>
                        ) : inv.status === 'Paid' ? (
                          <span style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 600 }}>✓ Cleared</span>
                        ) : !hasPhone ? (
                          /* Disabled Remind Button when phone is missing in Google Sheet */
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled
                            style={{
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.7rem',
                              opacity: 0.5,
                              cursor: 'not-allowed',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              color: '#d97706',
                              borderColor: 'rgba(245, 158, 11, 0.4)'
                            }}
                            title="Disabled: Phone number is missing in Google Sheet. Add the contact number in Google Sheet and click 'Sync Sheet' to enable."
                          >
                            <AlertTriangle size={11} color="#d97706" /> No Phone
                          </button>
                        ) : (
                          /* Active WhatsApp Remind Button */
                          <>
                            <button
                              className={`btn btn-sm ${isSent ? 'btn-success' : isReminding ? 'btn-secondary' : 'btn-whatsapp'}`}
                              onClick={() => !isSent && !isReminding && handleRemind(inv)}
                              disabled={isReminding || isSent}
                              title={`Send payment reminder via WhatsApp to ${inv._verified_phone}`}
                            >
                              {isSent ? <><CheckCircle2 size={13} /> Sent</> : isReminding ? 'Sending...' : <><Send size={13} /> Remind</>}
                            </button>
                            <a
                              href={`tel:${inv._verified_phone}`}
                              className="btn btn-secondary btn-sm"
                              title={`Call ${inv._verified_phone}`}
                              style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.4rem' }}
                            >
                              <Phone size={12} />
                            </a>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <ShieldCheck size={32} style={{ opacity: 0.35 }} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>No matching customer invoices found</span>
                      <span style={{ fontSize: '0.75rem' }}>
                        {phoneFilter === 'missing'
                          ? 'Great! All active customer invoices have verified phone numbers in Google Sheet.'
                          : 'Try changing the status or phone filter above.'}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewPdfUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ background: 'var(--bg-card, #1e293b)', borderRadius: '12px', width: '90vw', maxWidth: '1000px', height: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-color, #334155)' }}>
            <div style={{ padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color, #334155)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Tax Invoice & Consignment Bill</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <a href={previewPdfUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                  <ExternalLink size={12} /> Open in New Tab
                </a>
                <button className="btn btn-danger btn-sm" onClick={() => setPreviewPdfUrl(null)}>Close</button>
              </div>
            </div>
            <iframe src={previewPdfUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Invoice Preview" />
          </div>
        </div>
      )}

      {/* Voucher Detail Modal (When PDF bill is not attached — prevents unwanted redirect) */}
      {detailModalInv && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--bg-card, #ffffff)', borderRadius: '14px', width: '100%', maxWidth: '560px', overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={16} color="var(--accent-primary)" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Voucher {detailModalInv.invoice_number}</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setDetailModalInv(null)} style={{ padding: '0.2rem 0.4rem' }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: 'var(--bg-tertiary)', padding: '0.85rem', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Client Name</div>
                  <div style={{ fontWeight: 700, marginTop: '0.15rem' }}>{detailModalInv.client_name}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Company / Entity</div>
                  <div style={{ fontWeight: 600, marginTop: '0.15rem' }}>{detailModalInv.company_name || 'Tally Live'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Invoice Date</div>
                  <div style={{ fontWeight: 600, marginTop: '0.15rem' }}>{detailModalInv.invoice_date || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Due Date</div>
                  <div style={{ fontWeight: 600, marginTop: '0.15rem' }}>{detailModalInv.due_date || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Amount</div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-primary)', marginTop: '0.15rem' }}>
                    {fmtAmount(detailModalInv.amount)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</div>
                  <div style={{ marginTop: '0.2rem' }}>
                    <span className={`badge ${detailModalInv.status === 'Paid' ? 'badge-success' : detailModalInv.status === 'Overdue' ? 'badge-danger' : 'badge-warning'}`}>
                      {detailModalInv.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Google Sheet Contact Status */}
              <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: detailModalInv._has_verified_phone ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${detailModalInv._has_verified_phone ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: detailModalInv._has_verified_phone ? '#10b981' : '#d97706', marginBottom: '0.25rem' }}>
                  {detailModalInv._has_verified_phone ? '✅ Google Sheet Contact Verified' : '⚠️ Phone Missing in Google Sheet'}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {detailModalInv._has_verified_phone ? (
                    <>Recipient: <strong>{detailModalInv._contact_person || detailModalInv.client_name}</strong> (<code>{detailModalInv._verified_phone}</code>)</>
                  ) : (
                    <>Add phone number for <strong>{detailModalInv.client_name}</strong> in your Google Sheet, then click <strong>Sync Sheet</strong> to enable WhatsApp reminders.</>
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setDetailModalInv(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
