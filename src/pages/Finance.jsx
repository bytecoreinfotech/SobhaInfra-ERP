import React, { useState, useEffect } from 'react';
import {
  DollarSign, TrendingUp, AlertTriangle, CheckCircle2,
  Clock, Plus, Search, Filter, ArrowUpRight, ArrowDownRight,
  Download, Send, RefreshCw, X, FileText, Check, ShieldCheck,
  Server, Link, AlertOctagon, HelpCircle, Building2,
  PauseCircle, PlayCircle, CalendarClock, MessageSquare
} from 'lucide-react';
import {
  getInvoices, getTallyConnectionStatus, triggerTallySyncNow,
  getLedgerMappings, updateLedgerMapping, getSyncErrors,
  sendPaymentReminderWhatsApp, getLeads, normalizePhone,
  pauseInvoiceReminder, resumeInvoiceReminder, createLead
} from '../lib/db';
import { supabase } from '../lib/supabase';
import { useCompany } from '../context/CompanyContext';
import LedgerDetailDrawer from '../components/LedgerDetailDrawer';
import './Pages.css';


const statusConfig = {
  'Paid':    { badge: 'badge-success', icon: <CheckCircle2 size={13} /> },
  'Pending': { badge: 'badge-warning', icon: <Clock size={13} /> },
  'Overdue': { badge: 'badge-danger',  icon: <AlertTriangle size={13} /> },
  'Draft':   { badge: 'badge-neutral', icon: <Clock size={13} /> },
};

const Finance = () => {
  const { activeCompany, isConsolidated, activeCompanyId } = useCompany();
  const [activeTab, setActiveTab] = useState('invoices'); // 'invoices' | 'tally' | 'mappings' | 'errors'
  
  // Invoices & Outstandings State
  const [allInvoices, setAllInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeDatePreset, setActiveDatePreset] = useState(''); // 'today' | 'week' | 'month' | '3m' | '6m' | 'fy' | 'last_fy' | 'custom' | ''
  const [sortBy, setSortBy] = useState('date_desc'); // date_desc | date_asc | amount_desc | amount_asc
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);
  const [remindingId, setRemindingId] = useState(null);
  const [reminderToast, setReminderToast] = useState(null);

  // Tally Connector State
  const [tallyStatus, setTallyStatus] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  // Ledger Mappings State
  const [mappings, setMappings] = useState([]);
  const [leads, setLeads] = useState([]);
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedMapping, setSelectedMapping] = useState(null);
  const [targetLeadId, setTargetLeadId] = useState('');
  const [drawerMapping, setDrawerMapping] = useState(null); // <-- row detail drawer

  // Sync Errors State
  const [syncErrors, setSyncErrors] = useState([]);

  // Pause Reminder State
  const [pauseModal, setPauseModal] = useState(null); // { invoice } | null
  const [pauseReason, setPauseReason] = useState('');
  const [pausePromisedDate, setPausePromisedDate] = useState('');
  const [pauseNotes, setPauseNotes] = useState('');
  const [pausingSaving, setPausingSaving] = useState(false);

  // Document Templates Preview Modal State
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [selectedTemplateTab, setSelectedTemplateTab] = useState('tax_invoice'); // 'tax_invoice' | 'eway_bill' | 'pending_bills'

  useEffect(() => {
    loadAllFinanceData();
  }, [activeCompanyId]); // reload when company changes

  // Re-filter when company switcher changes
  const invoices = isConsolidated
    ? allInvoices
    : allInvoices.filter(inv => {
        if (!activeCompany) return true;  // 'All Companies' — show everything
        const compName = (activeCompany.company_name || '').toUpperCase();
        const aliases = Array.isArray(activeCompany.alias_names)
          ? activeCompany.alias_names.map(a => a.toUpperCase())
          : [];
        const allNames = [compName, ...aliases];
        const invCompany = (inv.company_name || inv.tally_company || '').toUpperCase();
        // If invoice has no company tag and a specific company is selected,
        // hide it — it shouldn't bleed into another company's view
        if (!invCompany) return false;
        return allNames.some(n => n && (invCompany.includes(n) || n.includes(invCompany)));
      });

  const loadAllFinanceData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    const [invRes, tallyRes, mapRes, errRes, leadsRes] = await Promise.all([
      getInvoices(),
      getTallyConnectionStatus(),
      getLedgerMappings(),
      getSyncErrors(),
      getLeads(),
    ]);
    setAllInvoices(invRes.data || []);
    setTallyStatus(tallyRes.data || null);
    setMappings(mapRes.data || []);
    setSyncErrors(errRes.data || []);
    setLeads(leadsRes.data || []);
    if (showSpinner) setLoading(false);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncMessage('Communicating with local TallyPrime XML port 9000...');
    const { data } = await triggerTallySyncNow();
    setTimeout(() => {
      setIsSyncing(false);
      setSyncMessage(data?.message || 'Sync completed successfully!');
      loadAllFinanceData();
    }, 1200);
  };

  const handleSendReminder = async (inv) => {
    setRemindingId(inv.id);
    const res = await sendPaymentReminderWhatsApp(inv.id);
    setRemindingId(null);
    setReminderToast(`WhatsApp reminder dispatched to ${inv.client_name} (${inv.client_phone})!`);
    setTimeout(() => setReminderToast(null), 4000);
  };

  const handleSaveMapping = async (e) => {
    e.preventDefault();
    if (!selectedMapping || !targetLeadId) return;
    await updateLedgerMapping(selectedMapping.id, targetLeadId, selectedMapping.tally_ledger_name);
    setShowMapModal(false);
    setSelectedMapping(null);
    setReminderToast(`✅ Linked "${selectedMapping.tally_ledger_name}" to CRM Customer!`);
    setTimeout(() => setReminderToast(null), 3500);
    loadAllFinanceData(false);
  };

  const handleQuickCreateLead = async (m) => {
    if (!m) return;
    const phone = m.lead_phone && m.lead_phone !== '—' ? m.lead_phone : '+919876543210';
    const newLeadRes = await createLead({
      name: m.tally_ledger_name,
      phone: phone,
      company: m.tally_ledger_name,
      source: 'Tally Accounting',
      status: 'Qualified',
      notes: `Auto-created from Tally Ledger (${m.invoice_count || 0} vouchers, ₹${(m.total_billed || 0).toLocaleString('en-IN')})`,
    });

    if (newLeadRes?.data?.id) {
      await updateLedgerMapping(m.id, newLeadRes.data.id, m.tally_ledger_name);
      setShowMapModal(false);
      setSelectedMapping(null);
      setReminderToast(`🎉 Created CRM Profile & Linked "${m.tally_ledger_name}"!`);
      setTimeout(() => setReminderToast(null), 3500);
      loadAllFinanceData(false);
    }
  };


  const handlePauseReminder = async (e) => {
    e.preventDefault();
    if (!pauseModal?.invoice) return;
    setPausingSaving(true);

    // Derive committedBy channel label from reason
    let committedBy = 'admin_manual';
    if (pauseReason?.includes('phone call')) committedBy = 'admin_phone_call';
    else if (pauseReason?.includes('in-person')) committedBy = 'admin_in_person';
    else if (pauseReason?.includes('WhatsApp message')) committedBy = 'admin_whatsapp_manual';
    else if (pauseReason?.includes('Email')) committedBy = 'admin_email';

    const { data } = await pauseInvoiceReminder(pauseModal.invoice.id, {
      reason: pauseReason || 'Paused by admin',
      promisedDate: pausePromisedDate || null,
      committedBy,
      notes: pauseNotes,
    });
    if (data) {
      setAllInvoices(prev => prev.map(i => i.id === pauseModal.invoice.id ? { ...i, ...data } : i));
      setReminderToast(`✅ Reminders paused for ${pauseModal.invoice.client_name}${pausePromisedDate ? ` until ${new Date(pausePromisedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ' (indefinitely)'}`);
    }
    setPauseModal(null);
    setPauseReason('');
    setPausePromisedDate('');
    setPauseNotes('');
    setPausingSaving(false);
    setTimeout(() => setReminderToast(null), 4000);
  };

  const handleResumeReminder = async (inv) => {
    const { data } = await resumeInvoiceReminder(inv.id);
    if (data) {
      setAllInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, ...data } : i));
      setReminderToast(`▶️ Reminders resumed for ${inv.client_name}`);
      setTimeout(() => setReminderToast(null), 3500);
    }
  };

  // Metrics
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalOverdue = invoices.filter(i => i.status === 'Overdue').reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalPending = invoices.filter(i => i.status === 'Pending').reduce((s, i) => s + Number(i.amount || 0), 0);

  // Filter by status, search, and date range
  const filtered = invoices.filter(inv => {
    const matchSearch = !search ||
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      inv.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.client_phone?.includes(search) ||
      inv.company_name?.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;

    // Date range filter (uses due_date or invoice_date or created_at)
    const invDate = inv.due_date || inv.invoice_date || inv.created_at;
    if (dateFrom && invDate && new Date(invDate) < new Date(dateFrom)) return false;
    if (dateTo && invDate && new Date(invDate) > new Date(dateTo + 'T23:59:59')) return false;

    if (filter === 'All') return true;
    if (filter === 'Overdue') return inv.status === 'Overdue';
    if (filter === 'Pending') return inv.status === 'Pending';
    if (filter === 'Paid') return inv.status === 'Paid';
    if (filter === 'Paused') return inv.reminder_paused === true || inv.reminder_paused === 'true';
    return true;
  }).sort((a, b) => {
    const da = new Date(a.due_date || a.invoice_date || a.created_at || 0);
    const db = new Date(b.due_date || b.invoice_date || b.created_at || 0);
    if (sortBy === 'date_desc') return db - da;
    if (sortBy === 'date_asc') return da - db;
    if (sortBy === 'amount_desc') return Number(b.amount || 0) - Number(a.amount || 0);
    if (sortBy === 'amount_asc') return Number(a.amount || 0) - Number(b.amount || 0);
    return db - da;
  });

  const pausedCount = invoices.filter(i => i.reminder_paused === true || i.reminder_paused === 'true').length;

  const fmtCurrency = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

  return (
    <div className="page-container animate-fade-in">
      {/* Toast */}
      {reminderToast && (
        <div style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999, background: 'var(--success)', color: 'white', padding: '0.75rem 1.25rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          <CheckCircle2 size={16} /> {reminderToast}
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Finance & Tally Center</h1>
          <p className="page-subtitle">Voucher ledger synchronization, overdue recovery, and ledger mapping master.</p>
        </div>
        <div className="page-actions">
          {/* Tab navigation */}
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button
              className="btn"
              onClick={() => setActiveTab('invoices')}
              style={{
                borderRadius: 0,
                background: activeTab === 'invoices' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'invoices' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <DollarSign size={15} /> Invoices & Aging
            </button>
            <button
              className="btn"
              onClick={() => setActiveTab('tally')}
              style={{
                borderRadius: 0,
                background: activeTab === 'tally' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'tally' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <Server size={15} /> Tally Connector
            </button>
            <button
              className="btn"
              onClick={() => setActiveTab('mappings')}
              style={{
                borderRadius: 0,
                background: activeTab === 'mappings' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'mappings' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <Link size={15} /> Ledger Mappings ({mappings.length})
            </button>
            <button
              className="btn"
              onClick={() => setActiveTab('errors')}
              style={{
                borderRadius: 0,
                background: activeTab === 'errors' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'errors' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <AlertOctagon size={15} /> Sync Errors ({syncErrors.length})
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              className="btn btn-outline"
              onClick={() => setShowTemplatesModal(true)}
              style={{
                fontSize: '0.8rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                borderColor: 'var(--accent-primary)',
                color: 'var(--accent-primary)',
                fontWeight: 600
              }}
            >
              <FileText size={14} /> 📑 Document Templates
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => loadAllFinanceData(false)}
              title="Refresh data from Supabase"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Finance Info: Two Separate Panels ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>

        {/* Panel 1: Selected Filter Range (what the user is viewing) */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '0.4rem',
          padding: '0.75rem 1rem',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.78rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.1rem' }}>
            <Filter size={13} color="var(--accent-primary)" />
            <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Selected Filter Range
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ color: dateFrom || dateTo ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: dateFrom || dateTo ? 700 : 400, fontSize: '0.85rem' }}>
              {dateFrom || dateTo ? (
                <>
                  {dateFrom ? new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Beginning'}
                  {' → '}
                  {dateTo ? new Date(dateTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Today'}
                </>
              ) : 'All dates (no filter applied)'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.1rem' }}>
            <FileText size={12} color="var(--text-muted)" />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
              Showing <strong style={{ color: 'var(--accent-primary)' }}>{filtered.length}</strong> of {invoices.length} invoices
              {filter !== 'All' && <span style={{ color: 'var(--warning)', fontWeight: 600 }}> · {filter}</span>}
            </span>
          </div>
        </div>

        {/* Panel 2: Overall Data Availability Period (what exists in DB) */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '0.4rem',
          padding: '0.75rem 1rem',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.78rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <CalendarClock size={13} color="var(--success)" />
              <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Data Available In System
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem' }}>
              <Server size={12} color={tallyStatus?.sync_status === 'Connected' ? 'var(--success)' : 'var(--text-muted)'} />
              <span style={{ color: 'var(--text-muted)' }}>Last sync:</span>
              <span style={{ color: tallyStatus?.last_sync_at ? 'var(--success)' : 'var(--text-muted)', fontWeight: 700 }}>
                {tallyStatus?.last_sync_at
                  ? new Date(tallyStatus.last_sync_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
                  : 'Not synced yet'}
              </span>
              {isSyncing && <RefreshCw size={11} className="animate-spin" color="var(--accent-primary)" />}
            </div>
          </div>
          {(() => {
            const dates = allInvoices
              .map(i => i.invoice_date || i.due_date || i.created_at)
              .filter(Boolean)
              .map(d => new Date(d))
              .filter(d => !isNaN(d));
            if (dates.length === 0) {
              return <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No invoice data in system yet</span>;
            }
            const earliest = new Date(Math.min(...dates));
            const latest = new Date(Math.max(...dates));
            return (
              <>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.85rem' }}>
                  {earliest.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {' → '}
                  {latest.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {allInvoices.length} total records spanning{' '}
                  <strong style={{ color: 'var(--text-secondary)' }}>
                    {Math.round((latest - earliest) / (1000 * 60 * 60 * 24 * 30))} months
                  </strong>
                </span>
              </>
            );
          })()}
        </div>
      </div>

      {/* =========================================================================
          TAB 1: INVOICES & AGING OUTSTANDINGS
         ========================================================================= */}
      {activeTab === 'invoices' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* KPI Summary Cards */}
          <div className="stats-grid">
            {[
              { label: 'Total Invoiced', value: fmtCurrency(totalInvoiced), sub: `${invoices.length} invoices`, icon: <DollarSign size={20} />, color: 'var(--accent-primary)', bg: 'var(--accent-glow)' },
              { label: 'Total Collected', value: fmtCurrency(totalPaid), sub: `${invoices.filter(i => i.status === 'Paid').length} paid`, icon: <TrendingUp size={20} />, color: 'var(--success)', bg: 'var(--success-bg)' },
              { label: 'Overdue Recovery', value: fmtCurrency(totalOverdue), sub: `${invoices.filter(i => i.status === 'Overdue').length} overdue`, icon: <AlertTriangle size={20} />, color: 'var(--danger)', bg: 'var(--danger-bg)' },
              { label: 'Pending Due', value: fmtCurrency(totalPending), sub: `${invoices.filter(i => i.status === 'Pending').length} pending`, icon: <Clock size={20} />, color: 'var(--warning)', bg: 'var(--warning-bg)' },
            ].map(s => (
              <div key={s.label} className="stat-card" style={{ '--card-accent': s.color }}>
                <div className="stat-header">
                  <div>
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-value" style={{ fontSize: '1.55rem' }}>{s.value}</div>
                    {s.sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{s.sub}</div>}
                  </div>
                  <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Search & Filter Bar ─────────────────────────────────── */}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div className="input-group" style={{ flex: 1, minWidth: 200 }}>
              <Search size={15} className="input-icon" />
              <input
                type="text"
                className="input-field"
                placeholder="Search invoice, client, phone, company..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Sort */}
            <select
              className="input-field"
              style={{ padding: '0.35rem 0.55rem', fontSize: '0.78rem', width: 145 }}
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="date_desc">⬇ Date (Newest)</option>
              <option value="date_asc">⬆ Date (Oldest)</option>
              <option value="amount_desc">⬇ Amount (High)</option>
              <option value="amount_asc">⬆ Amount (Low)</option>
            </select>

            {/* Clear Filters */}
            {(search || dateFrom || dateTo || sortBy !== 'date_desc' || filter !== 'All') && (
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', whiteSpace: 'nowrap' }}
                onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setSortBy('date_desc'); setFilter('All'); setActiveDatePreset(''); }}
              >
                ✕ Clear All
              </button>
            )}

            {/* Status Filter Chips */}
            <div className="filter-bar" style={{ margin: 0 }}>
              {['All', 'Overdue', 'Pending', 'Paid'].map(f => (
                <button
                  key={f}
                  className={`filter-chip ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
              <button
                className={`filter-chip ${filter === 'Paused' ? 'active' : ''}`}
                onClick={() => setFilter('Paused')}
                style={filter === 'Paused' ? {} : { color: 'var(--text-muted)' }}
              >
                ⏸ Paused {pausedCount > 0 && <span style={{ background: 'rgba(255,165,0,0.2)', color: 'var(--warning)', borderRadius: 8, padding: '0 4px', marginLeft: 3, fontSize: '0.68rem', fontWeight: 800 }}>{pausedCount}</span>}
              </button>
            </div>

            {/* Result count */}
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {/* ── Date Range Presets ────────────────────────────────────── */}
          <div style={{
            display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center',
            padding: '0.7rem 0.9rem',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
          }}>
            <CalendarClock size={14} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Date Range:</span>

            {/* Quick preset chips */}
            {[
              { label: 'Today', key: 'today' },
              { label: 'This Week', key: 'week' },
              { label: 'This Month', key: 'month' },
              { label: 'Last 3 Months', key: '3m' },
              { label: 'Last 6 Months', key: '6m' },
              { label: 'This FY', key: 'fy' },
              { label: 'Last FY', key: 'last_fy' },
              { label: '📅 Custom', key: 'custom' },
            ].map(preset => {
              const isActive = activeDatePreset === preset.key;
              return (
                <button
                  key={preset.key}
                  onClick={() => {
                    const today = new Date();
                    const fmt = d => d.toISOString().slice(0, 10);
                    setActiveDatePreset(preset.key);

                    if (preset.key === 'today') {
                      setDateFrom(fmt(today)); setDateTo(fmt(today));
                    } else if (preset.key === 'week') {
                      const start = new Date(today); start.setDate(today.getDate() - today.getDay());
                      setDateFrom(fmt(start)); setDateTo(fmt(today));
                    } else if (preset.key === 'month') {
                      setDateFrom(fmt(new Date(today.getFullYear(), today.getMonth(), 1)));
                      setDateTo(fmt(today));
                    } else if (preset.key === '3m') {
                      const d = new Date(today); d.setMonth(d.getMonth() - 3);
                      setDateFrom(fmt(d)); setDateTo(fmt(today));
                    } else if (preset.key === '6m') {
                      const d = new Date(today); d.setMonth(d.getMonth() - 6);
                      setDateFrom(fmt(d)); setDateTo(fmt(today));
                    } else if (preset.key === 'fy') {
                      // Indian FY: Apr 1 – Mar 31
                      const fyStart = today.getMonth() >= 3
                        ? new Date(today.getFullYear(), 3, 1)
                        : new Date(today.getFullYear() - 1, 3, 1);
                      const fyEnd = new Date(fyStart.getFullYear() + 1, 2, 31);
                      setDateFrom(fmt(fyStart)); setDateTo(fmt(fyEnd > today ? today : fyEnd));
                    } else if (preset.key === 'last_fy') {
                      const fyStart = today.getMonth() >= 3
                        ? new Date(today.getFullYear() - 1, 3, 1)
                        : new Date(today.getFullYear() - 2, 3, 1);
                      const fyEnd = new Date(fyStart.getFullYear() + 1, 2, 31);
                      setDateFrom(fmt(fyStart)); setDateTo(fmt(fyEnd));
                    } else if (preset.key === 'custom') {
                      // Just reveal the pickers; don't auto-set dates
                    }
                  }}
                  style={{
                    padding: '0.3rem 0.7rem', borderRadius: 20, border: 'none',
                    fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer',
                    background: isActive ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: isActive ? 'white' : 'var(--text-secondary)',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {preset.label}
                </button>
              );
            })}

            {/* Custom date pickers — shown always when custom selected OR when dateFrom/dateTo set */}
            {(activeDatePreset === 'custom' || activeDatePreset === '' ) && (
              <>
                <div style={{ width: 1, height: 18, background: 'var(--border-color)', flexShrink: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>From</label>
                  <input
                    type="date"
                    className="input-field"
                    style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', width: 130 }}
                    value={dateFrom}
                    onChange={e => { setDateFrom(e.target.value); setActiveDatePreset('custom'); }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>To</label>
                  <input
                    type="date"
                    className="input-field"
                    style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', width: 130 }}
                    value={dateTo}
                    onChange={e => { setDateTo(e.target.value); setActiveDatePreset('custom'); }}
                  />
                </div>
              </>
            )}

            {/* Active range summary */}
            {(dateFrom || dateTo) && activeDatePreset !== 'custom' && activeDatePreset !== '' && (
              <>
                <div style={{ width: 1, height: 18, background: 'var(--border-color)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.73rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                  {dateFrom ? new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  &nbsp;→&nbsp;
                  {dateTo ? new Date(dateTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Today'}
                </span>
              </>
            )}

            {/* Clear date range */}
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setActiveDatePreset(''); }}
                style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'underline' }}
              >
                Clear dates
              </button>
            )}
          </div>

          {/* Invoices Data Table */}
          <div className="glass-card table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice No.</th>
                  <th>Client / Tally Ledger</th>
                  <th>Contact Phone</th>
                  <th>Due Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Reminder Automation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}><RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No invoices found matching criteria.</td></tr>
                ) : (
                  filtered.map(inv => (
                    <tr
                      key={inv.id}
                      style={{
                        background: (inv.reminder_paused === true || inv.reminder_paused === 'true')
                          ? 'rgba(255,165,0,0.04)'
                          : undefined
                      }}
                    >
                      <td style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent-secondary)' }}>
                        {inv.invoice_number}
                        {inv.reminder_count > 0 && (
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 400 }}>#{inv.reminder_count} reminder{inv.reminder_count !== 1 ? 's' : ''} sent</div>
                        )}
                        {/* Show company badge only in All Companies view */}
                        {isConsolidated && inv.company_name && (
                          <div style={{
                            fontSize: '0.58rem', fontWeight: 700, marginTop: '0.15rem',
                            display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                            padding: '0.1rem 0.4rem', borderRadius: '10px',
                            background: 'rgba(99,102,241,0.12)', color: 'var(--accent-primary)',
                            border: '1px solid rgba(99,102,241,0.2)', fontFamily: 'sans-serif'
                          }}>
                            <Building2 size={8} /> {inv.company_name.length > 20 ? inv.company_name.slice(0, 20) + '…' : inv.company_name}
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{inv.client_name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {normalizePhone(inv.client_phone)}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td style={{ fontWeight: 700, fontSize: '0.88rem' }}>{fmtCurrency(inv.amount)}</td>
                      <td>
                        <span className={`badge ${statusConfig[inv.status]?.badge || 'badge-neutral'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          {statusConfig[inv.status]?.icon} {inv.status}
                        </span>
                      </td>

                      {/* Reminder Automation Status */}
                      <td>
                        {(inv.reminder_paused === true || inv.reminder_paused === 'true') ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--warning)' }}>
                              <PauseCircle size={12} /> Paused
                            </span>
                            {inv.payment_promised_date && (
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <CalendarClock size={10} />
                                Until {new Date(inv.payment_promised_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                              </span>
                            )}
                            {inv.promise_committed_by && (
                              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                via {
                                  inv.promise_committed_by === 'whatsapp_auto' ? '🤖 WhatsApp AI' :
                                  inv.promise_committed_by === 'admin_phone_call' ? '📞 Phone Call' :
                                  inv.promise_committed_by === 'admin_in_person' ? '🤝 In-Person' :
                                  inv.promise_committed_by === 'admin_email' ? '📧 Email' :
                                  inv.promise_committed_by === 'admin_whatsapp_manual' ? '💬 WhatsApp (Manual)' :
                                  '👤 Admin'
                                }
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--success)', fontWeight: 600 }}>
                            <PlayCircle size={12} /> Active
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          {/* All 4 PDF Types */}
                          {(() => {
                            const meta = inv.metadata || {};
                            const consignmentUrl = inv.pdf_url || meta.pdf_url;
                            const ewayUrl = meta.eway_pdf_url;
                            const pendingUrl = meta.pending_pdf_url;
                            const ledgerUrl = meta.ledger_pdf_url;
                            if (!consignmentUrl && !ewayUrl && !pendingUrl && !ledgerUrl) return null;
                            return (
                              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                {consignmentUrl && (
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.68rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                    onClick={() => setPreviewPdfUrl(consignmentUrl)}
                                    title="Tax Invoice + e-Way Bill (2-Page Consignment Bill)"
                                  >
                                    <FileText size={11} /> Tax Bill
                                  </button>
                                )}
                                {ewayUrl && (
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.68rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                    onClick={() => setPreviewPdfUrl(ewayUrl)}
                                    title="Standalone e-Way Bill / Conveyance Note"
                                  >
                                    <FileText size={11} /> e-Way
                                  </button>
                                )}
                                {pendingUrl && (
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.68rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                    onClick={() => setPreviewPdfUrl(pendingUrl)}
                                    title="Pending Bills Statement for this client"
                                  >
                                    <FileText size={11} /> Pending
                                  </button>
                                )}
                                {ledgerUrl && (
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.68rem', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                    onClick={() => setPreviewPdfUrl(ledgerUrl)}
                                    title="Customer Ledger Account"
                                  >
                                    <FileText size={11} /> Ledger
                                  </button>
                                )}
                              </div>
                            );
                          })()}


                          {/* Remind / Settled — Admin can ALWAYS send manually, even during pause */}
                          {inv.status !== 'Paid' ? (
                            <button
                              className="btn btn-whatsapp btn-sm"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', opacity: (inv.reminder_paused === true || inv.reminder_paused === 'true') ? 0.75 : 1 }}
                              onClick={() => handleSendReminder(inv)}
                              disabled={remindingId === inv.id}
                              title={(inv.reminder_paused === true || inv.reminder_paused === 'true') ? '⚠️ Auto-reminders are paused, but you can still send manually' : 'Send WhatsApp payment reminder'}
                            >
                              <Send size={12} /> {remindingId === inv.id ? 'Sending...' : (inv.reminder_paused === true || inv.reminder_paused === 'true') ? 'Send Anyway' : 'Remind on WA'}
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--success)', fontWeight: 600 }}>Settled</span>
                          )}

                          {/* Pause / Resume Toggle */}
                          {inv.status !== 'Paid' && (
                            (inv.reminder_paused === true || inv.reminder_paused === 'true') ? (
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem', color: 'var(--success)', borderColor: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                onClick={() => handleResumeReminder(inv)}
                                title="Resume automatic reminders"
                              >
                                <PlayCircle size={12} /> Resume
                              </button>
                            ) : (
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem', color: 'var(--warning)', borderColor: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                onClick={() => { setPauseModal({ invoice: inv }); setPausePromisedDate(''); setPauseReason(''); setPauseNotes(''); }}
                                title="Pause automatic reminders for this client"
                              >
                                <PauseCircle size={12} /> Pause
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: TALLY CONNECTOR HEALTH & SYNC CONSOLE
         ========================================================================= */}
      {activeTab === 'tally' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem' }}>
          {/* Status & Sync Card */}
          <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Server size={18} color="var(--accent-primary)" /> TallyPrime XML Bridge Status
                </h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                  Section 26: Secure read-mostly connection to local TallyPrime XML Server.
                </p>
              </div>
              <span className={`badge ${tallyStatus?.status === 'ONLINE' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
                ● {tallyStatus?.status === 'ONLINE' ? 'ONLINE (Port 9000)' : 'DISCONNECTED / OFFLINE'}
              </span>
            </div>

            {tallyStatus?.status !== 'ONLINE' && (
              <div style={{ padding: '0.85rem 1rem', background: 'var(--warning-bg)', border: '1px solid var(--warning)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--warning)', display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong>TallyPrime is currently not connected:</strong>
                  <div style={{ marginTop: '0.25rem', color: 'var(--text-secondary)' }}>
                    To sync live vouchers, ensure TallyPrime is open with ODBC/HTTP Server enabled (Port 9000) and run:
                    <div style={{ marginTop: '0.35rem', fontFamily: 'monospace', background: 'var(--bg-tertiary)', padding: '0.35rem 0.5rem', borderRadius: 4, color: 'var(--text-primary)' }}>
                      node scripts/tally-connector.js
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Target Host & Port</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace' }}>{tallyStatus?.tally_host || '127.0.0.1:9000'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Tally Company</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: tallyStatus?.tally_company && tallyStatus?.tally_company !== 'Not Connected' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {tallyStatus?.tally_company || 'Not Connected'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Last Synced</div>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: tallyStatus?.last_sync_at ? 'var(--accent-secondary)' : 'var(--text-muted)' }}>
                  {tallyStatus?.last_sync_at ? new Date(tallyStatus.last_sync_at).toLocaleString('en-IN') : 'Never synced'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sync Frequency</div>
                <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>Every 15 Minutes (Daemon)</div>
              </div>
            </div>

            {syncMessage && (
              <div style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.1)', border: '1px solid var(--success)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--success)' }}>
                {syncMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                className="btn btn-primary"
                onClick={handleSyncNow}
                disabled={isSyncing}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
                {isSyncing ? 'Attempting Sync on Port 9000...' : 'Test / Trigger Sync Now'}
              </button>
            </div>
          </div>

          {/* Architecture & Security Notice */}
          <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={18} color="var(--success)" /> Security & Architecture Rules (Section 26)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.78rem', lineHeight: 1.5 }}>
              <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                <strong>1. Read-Mostly Bridge:</strong> TallyPrime remains the single source of truth for accounts. The connector operates without modifying historic ledgers.
              </div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                <strong>2. Token Authentication:</strong> Local Windows daemon signs every payload with a cryptographic <code>X-Connector-Token</code>.
              </div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                <strong>3. Automated Recovery:</strong> Inbound receipts in Tally immediately close out CRM aging alarms and silence WhatsApp payment reminder automations.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: LEDGER MAPPINGS MASTER
         ========================================================================= */}
      {activeTab === 'mappings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Link size={18} color="var(--accent-primary)" /> Ledger &amp; Customer Mapping Master (Section 30)
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                Bridges Tally accounting ledgers with CRM customer profiles so automated WhatsApp notifications and payment statements know where to reach.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                {mappings.filter(m => m.mapping_status === 'MAPPED' || m.mapping_status === 'AUTO_FOUND').length} / {mappings.length} Linked
              </span>
            </div>
          </div>

          <div className="glass-card table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tally Ledger / Party Name</th>
                  <th>Mapped CRM Customer</th>
                  <th>Contact Phone</th>
                  <th>Match Confidence</th>
                  <th>Sync Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mappings.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      No Tally ledger mappings found. Click "Test / Trigger Sync Now" to pull accounting ledgers from Tally.
                    </td>
                  </tr>
                ) : (
                  mappings.map(m => {
                    const isLinked = m.mapping_status === 'MAPPED' || m.mapping_status === 'AUTO_FOUND';
                    return (
                      <tr
                        key={m.id}
                        style={{ transition: 'background 0.15s', cursor: 'pointer' }}
                        onClick={() => setDrawerMapping(m)}
                        title={`Click to view full details for ${m.tally_ledger_name}`}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                              {m.tally_ledger_name}
                            </div>
                            <span style={{ fontSize: '0.68rem', color: 'var(--accent-secondary)', opacity: 0.7 }}>→</span>
                          </div>
                          {(m.invoice_count > 0 || m.total_billed > 0) && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              📦 {m.invoice_count} voucher(s) • <span style={{ fontWeight: 600, color: 'var(--accent-secondary)' }}>₹{Number(m.total_billed || 0).toLocaleString('en-IN')}</span>
                            </div>
                          )}
                        </td>
                        <td>
                          {m.lead_name ? (
                            <span style={{ fontWeight: 600, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={13} /> {m.lead_name}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                              Unlinked (No CRM contact linked)
                            </span>
                          )}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: m.lead_phone && m.lead_phone !== '—' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {m.lead_phone || '—'}
                        </td>
                        <td>
                          <span className={`badge ${m.match_confidence >= 0.8 ? 'badge-success' : m.match_confidence >= 0.4 ? 'badge-warning' : 'badge-neutral'}`} style={{ fontWeight: 700 }}>
                            {((m.match_confidence || 0) * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${m.mapping_status === 'MAPPED' ? 'badge-success' : m.mapping_status === 'AUTO_FOUND' ? 'badge-info' : 'badge-warning'}`}>
                            {m.mapping_status === 'MAPPED' ? '✓ MAPPED' : m.mapping_status === 'AUTO_FOUND' ? '⚡ AUTO DETECTED' : '⏳ PENDING LINK'}
                          </span>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}
                              onClick={e => { e.stopPropagation(); setSelectedMapping(m); setTargetLeadId(m.lead_id || ''); setShowMapModal(true); }}
                              title="Link this Tally ledger to a CRM customer"
                            >
                              {isLinked ? 'Edit Link' : 'Map Lead'}
                            </button>
                            {!isLinked && (
                              <button
                                className="btn btn-primary btn-sm"
                                style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem', background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
                                onClick={e => { e.stopPropagation(); handleQuickCreateLead(m); }}
                                title="Automatically create this party as a new lead in CRM"
                              >
                                + Quick Add CRM
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Ledger Detail Drawer ── */}
      {drawerMapping && (
        <LedgerDetailDrawer
          mapping={drawerMapping}
          allInvoices={allInvoices}
          supabaseClient={supabase}
          onClose={() => setDrawerMapping(null)}
          onEditLink={() => {
            setSelectedMapping(drawerMapping);
            setTargetLeadId(drawerMapping.lead_id || '');
            setShowMapModal(true);
            setDrawerMapping(null);
          }}
        />
      )}


      {/* =========================================================================
          TAB 4: SYNC ERRORS & AUDIT LOG
         ========================================================================= */}
      {activeTab === 'errors' && (
        <div className="glass-card table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Voucher Number</th>
                <th>Error Reason</th>
                <th>Timestamp</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {syncErrors.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No sync errors reported. All Tally records ingested cleanly.
                  </td>
                </tr>
              ) : (
                syncErrors.map((err, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700 }}>{err.voucher_number || 'Unknown'}</td>
                    <td style={{ color: 'var(--danger)' }}>{err.error_message}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(err.created_at).toLocaleTimeString()}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }} onClick={handleSyncNow}>
                        Retry Sync
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual Ledger Mapping Modal */}
      {showMapModal && selectedMapping && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowMapModal(false); }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 520, padding: '1.5rem' }}>
            <button className="modal-close-btn" onClick={() => setShowMapModal(false)} title="Close Modal (Esc)" aria-label="Close">
              <X size={18} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Link size={18} color="var(--accent-primary)" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                  Link Tally Ledger to CRM Profile
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Connect accounting party with customer messaging records</span>
              </div>
            </div>

            <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 8, marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Tally Ledger Name</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginTop: 2 }}>{selectedMapping.tally_ledger_name}</div>
              {selectedMapping.lead_phone && selectedMapping.lead_phone !== '—' && (
                <div style={{ fontSize: '0.78rem', color: 'var(--accent-secondary)', marginTop: 4 }}>
                  📱 Detected Phone: <strong>{selectedMapping.lead_phone}</strong>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveMapping} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Option A: Choose Existing CRM Lead
                </label>
                <select className="input-field" value={targetLeadId} onChange={e => setTargetLeadId(e.target.value)}>
                  <option value="">-- Choose Existing CRM Lead --</option>
                  {leads.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.phone || 'No phone'})</option>
                  ))}
                </select>
              </div>

              <div style={{ textAlign: 'center', position: 'relative', margin: '0.2rem 0' }}>
                <span style={{ background: 'var(--bg-card)', padding: '0 10px', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>OR</span>
              </div>

              <div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--accent-primary)', color: 'var(--accent-secondary)', fontWeight: 600 }}
                  onClick={() => handleQuickCreateLead(selectedMapping)}
                >
                  ➕ Create &amp; Link New CRM Customer for "{selectedMapping.tally_ledger_name}"
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowMapModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!targetLeadId}>Save Ledger Mapping</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Pause Reminder Modal ── */}
      {pauseModal?.invoice && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setPauseModal(null); }} style={{ zIndex: 9999 }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 500, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,165,0,0.15)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PauseCircle size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>Pause Auto-Reminders</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{pauseModal.invoice.client_name} — {pauseModal.invoice.invoice_number}</div>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setPauseModal(null)}>✕</button>
            </div>

            <div style={{ padding: '0.75rem 1rem', background: 'rgba(255,165,0,0.06)', border: '1px solid rgba(255,165,0,0.25)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Pausing will stop all automatic WhatsApp reminders for this invoice. If the client has committed a payment date, set it below — reminders will <strong>auto-resume</strong> after that date if payment hasn't been received.
            </div>

            <form onSubmit={handlePauseReminder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* How was the promise communicated? */}
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  <MessageSquare size={13} style={{ display: 'inline', marginRight: 4 }} />
                  How did the client communicate the payment promise? *
                </label>
                <select
                  className="input-field"
                  value={pauseReason}
                  onChange={e => setPauseReason(e.target.value)}
                  required
                >
                  <option value="">-- Select Channel --</option>
                  <option value="Client committed date on phone call">📞 Phone call with admin/manager</option>
                  <option value="Client in-person payment promise">🤝 In-person / Office visit promise</option>
                  <option value="Client committed via WhatsApp message">💬 WhatsApp message (manual review)</option>
                  <option value="Email commitment received">📧 Email commitment received</option>
                  <option value="Partial payment received, balance pending">💰 Partial payment received — balance pending</option>
                  <option value="Payment arrangement under discussion">🗓️ Under payment arrangement discussion</option>
                  <option value="Account dispute / verification pending">⚠️ Account dispute / verification pending</option>
                  <option value="Client requested pause">📩 Client specifically requested pause</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  <CalendarClock size={13} style={{ display: 'inline', marginRight: 4 }} />
                  Payment Promised By (Date) *
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={pausePromisedDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setPausePromisedDate(e.target.value)}
                />
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {pausePromisedDate
                    ? `⚡ Auto-reminders will resume on ${new Date(pausePromisedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} if payment is still pending.`
                    : 'Leave blank for indefinite pause (admin must manually resume).'}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Internal Notes (Optional)</label>
                <textarea
                  className="input-field textarea-field"
                  rows={2}
                  placeholder="e.g. Spoke to Rakesh on 22 Aug, will pay by 30th via NEFT from ICICI..."
                  value={pauseNotes}
                  onChange={e => setPauseNotes(e.target.value)}
                />
              </div>

              <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                💡 <strong>Note:</strong> Even after pausing, you can still click <strong>"Send Anyway"</strong> on the invoice row to send a manual WhatsApp reminder at any time.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPauseModal(null)}>Cancel</button>
                <button
                  type="submit"
                  className="btn"
                  disabled={pausingSaving}
                  style={{ background: 'var(--warning)', color: 'black', fontWeight: 700 }}
                >
                  {pausingSaving ? 'Pausing...' : '⏸ Pause Auto-Reminders'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          DOCUMENT TEMPLATES PREVIEW MODAL (Without Needing Tally)
         ═════════════════════════════════════════════════════════════════════ */}
      {showTemplatesModal && (
        <div className="modal-overlay" onClick={() => setShowTemplatesModal(false)} style={{ background: 'rgba(0,0,0,0.85)', zIndex: 9999 }}>
          <div style={{ position: 'relative', maxWidth: 960, width: '94%', height: '88vh', background: 'var(--bg-secondary)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.95rem' }}>
                  <FileText size={17} color="var(--accent-primary)" /> Standard Commercial Billing & Document Templates
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Interactive UI previews of all 3 official document layouts generated by our system.
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setShowTemplatesModal(false)}>✕</button>
            </div>

            {/* Template Selector Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.65rem 1.25rem', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
              {[
                { id: 'tax_invoice', label: '1. Complete 2-Page Consignment PDF (Invoice + e-Way Bill)', icon: '📦' },
                { id: 'eway_bill', label: '2. Standard e-Way Bill (Conveyance Permit)', icon: '🚚' },
                { id: 'pending_bills', label: '3. Bill-wise Pending Bills Statement', icon: '📊' },
                { id: 'ledger_account', label: '4. Customer Ledger Account', icon: '📒' },
              ].map(t => (
                <button
                  key={t.id}
                  className="btn btn-sm"
                  onClick={() => setSelectedTemplateTab(t.id)}
                  style={{
                    background: selectedTemplateTab === t.id ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: selectedTemplateTab === t.id ? 'white' : 'var(--text-secondary)',
                    fontWeight: selectedTemplateTab === t.id ? 700 : 500,
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Template Content Viewer */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', justifyContent: 'center', background: '#cbd5e1' }}>
              
              {/* TAB 1: 2-PAGE CONSIGNMENT BILL (TAX INVOICE + E-WAY BILL) */}
              {selectedTemplateTab === 'tax_invoice' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: 780 }}>
                  <div style={{ padding: '8px 12px', background: 'rgba(99,102,241,0.1)', border: '1px solid var(--accent-primary)', borderRadius: 8, fontSize: '0.78rem', color: '#1e293b', fontWeight: 600 }}>
                    💡 <strong>Simultaneous 2-Page Dispatch:</strong> When a truck departs, both pages (Page 1: Product Tax Invoice + Page 2: Transporter Conveyance e-Way Bill) are bundled and sent to the client on WhatsApp in a single attachment.
                  </div>

                  {/* PAGE 1 */}
                  <div style={{ background: 'white', color: '#111', padding: '24px', borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontFamily: 'sans-serif', fontSize: '11px', lineHeight: 1.4, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 8, right: 12, fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>PAGE 1 OF 2</div>
                  {/* Top Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #111', paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ width: 56, height: 56, background: '#f59e0b', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '20px' }}>
                        SG
                      </div>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: '#111', letterSpacing: 0.5 }}>SHOBHA READY PLAST</div>
                        <div style={{ fontSize: '10px', color: '#4b5563' }}>NH48, NEAR KOLEI KHADI SARODHI, VALSAD, GUJARAT - 396001</div>
                        <div style={{ fontSize: '10px', color: '#4b5563' }}>Email: shobhareadyplast@gmail.com | Phone: +91 98765 43210</div>
                        <div style={{ fontSize: '10px', fontWeight: 700 }}>GSTIN: 24AGCPJ2785R1ZV | State: Gujarat (24)</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800 }}>Tax Invoice &nbsp; <span style={{ fontSize: '12px', fontWeight: 600, color: '#4b5563' }}>e-Invoice</span></div>
                      <div style={{ marginTop: '4px', width: 64, height: 64, background: '#f8fafc', border: '1px solid #cbd5e1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#64748b' }}>
                        [ QR CODE ]
                      </div>
                    </div>
                  </div>

                  {/* IRN Strip */}
                  <div style={{ background: '#f9fafb', border: '1px solid #374151', borderTop: 'none', padding: '4px 8px', fontSize: '9.5px' }}>
                    <div><strong>IRN :</strong> a45684e7e4ef9d7c7c9b29e3cf08d0919d11d1df3db16-13f50f26c11e0e32e6c</div>
                    <div><strong>Ack No. :</strong> 162625648066372 &nbsp;&nbsp;&nbsp;&nbsp; <strong>Ack Date :</strong> 19-Aug-26</div>
                  </div>

                  {/* Dual Box */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #374151', borderTop: 'none' }}>
                    <div style={{ padding: '8px', borderRight: '1px solid #374151' }}>
                      <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 700 }}>Details of Buyer / Billed To</div>
                      <div style={{ fontSize: '13px', fontWeight: 800 }}>VAISHNAV CONSTRUCTION</div>
                      <div style={{ fontSize: '10px', color: '#374151' }}>DEU APARTMENT, SHOP NO 4, KHET UPPER VILLEGE, THANE WEST</div>
                      <div style={{ fontSize: '10px' }}><strong>State Name :</strong> Maharashtra, <strong>Code :</strong> 27</div>
                      <div style={{ fontSize: '10px' }}><strong>GSTIN/UIN :</strong> 27ALPRP4116L1ZM</div>
                      <div style={{ fontSize: '9.5px', marginTop: '4px' }}><strong>ORDER NO. :</strong> PO-9912 &nbsp;|&nbsp; <strong>Dispatched through :</strong> Road</div>
                    </div>
                    <div style={{ padding: '8px' }}>
                      <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 700 }}>Detail of Consignee / Shipped To</div>
                      <div style={{ fontSize: '13px', fontWeight: 800 }}>VAISHNAV CONSTRUCTION</div>
                      <div style={{ fontSize: '10px', color: '#374151' }}>DEU APARTMENT, SHOP NO 4, KHET UPPER VILLEGE, THANE WEST</div>
                      <div style={{ fontSize: '10px' }}><strong>BILL NO. :</strong> <strong>SRP/0570/26-27</strong> &nbsp;|&nbsp; <strong>Dated :</strong> 10-Aug-26</div>
                      <div style={{ fontSize: '10px' }}><strong>Delivery Note :</strong> DN-0570 &nbsp;|&nbsp; <strong>CREDIT DAYS :</strong> 30 Days</div>
                    </div>
                  </div>

                  {/* Item Table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #374151', borderTop: 'none', fontSize: '10px' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '1px solid #374151', textAlign: 'center' }}>
                        <th style={{ padding: '4px', borderRight: '1px solid #374151' }}>Sl</th>
                        <th style={{ padding: '4px', borderRight: '1px solid #374151', textAlign: 'left' }}>Description of Goods</th>
                        <th style={{ padding: '4px', borderRight: '1px solid #374151' }}>HSN/SAC</th>
                        <th style={{ padding: '4px', borderRight: '1px solid #374151' }}>Truck No</th>
                        <th style={{ padding: '4px', borderRight: '1px solid #374151' }}>Challan</th>
                        <th style={{ padding: '4px', borderRight: '1px solid #374151' }}>Site</th>
                        <th style={{ padding: '4px', borderRight: '1px solid #374151' }}>Quantity</th>
                        <th style={{ padding: '4px', borderRight: '1px solid #374151', textAlign: 'right' }}>Rate</th>
                        <th style={{ padding: '4px', borderRight: '1px solid #374151' }}>per</th>
                        <th style={{ padding: '4px', textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #374151' }}>1</td>
                        <td style={{ padding: '4px', fontWeight: 700, borderRight: '1px solid #374151' }}>SAND & READY PLAST</td>
                        <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #374151' }}>25051011</td>
                        <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #374151' }}>MH04-4550</td>
                        <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #374151' }}>10199</td>
                        <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #374151' }}>THANE</td>
                        <td style={{ padding: '4px', textAlign: 'center', fontWeight: 700, borderRight: '1px solid #374151' }}>776 BAGS</td>
                        <td style={{ padding: '4px', textAlign: 'right', borderRight: '1px solid #374151' }}>92.00</td>
                        <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #374151' }}>BAGS</td>
                        <td style={{ padding: '4px', textAlign: 'right', fontWeight: 700 }}>71,392.00</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td colSpan={9} style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 700, borderRight: '1px solid #374151' }}>OUTPUT IGST (5%)</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 700 }}>3,569.60</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td colSpan={9} style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 700, borderRight: '1px solid #374151' }}>ROUND OFF</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>0.40</td>
                      </tr>
                      <tr style={{ background: '#f9fafb', fontWeight: 800, borderTop: '1px solid #374151' }}>
                        <td colSpan={6} style={{ padding: '4px 8px', borderRight: '1px solid #374151' }}>Total</td>
                        <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #374151' }}>776 BAGS</td>
                        <td colSpan={2} style={{ borderRight: '1px solid #374151' }}></td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: '11px' }}>₹ 74,962.00</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Words & Schedule */}
                  <div style={{ border: '1px solid #374151', borderTop: 'none', padding: '6px 8px', display: 'flex', justifyContent: 'space-between' }}>
                    <div>Amount Chargeable (in words):<br/><strong>INR Seventy Four Thousand Nine Hundred Sixty Two Only</strong></div>
                    <div><strong>E. & O.E</strong></div>
                  </div>

                  {/* HSN Table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #374151', borderTop: 'none', fontSize: '9.5px' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '1px solid #374151' }}>
                        <th style={{ padding: '3px', borderRight: '1px solid #374151' }}>HSN/SAC</th>
                        <th style={{ padding: '3px', borderRight: '1px solid #374151', textAlign: 'right' }}>Taxable Value</th>
                        <th style={{ padding: '3px', borderRight: '1px solid #374151', textAlign: 'center' }}>IGST Rate</th>
                        <th style={{ padding: '3px', borderRight: '1px solid #374151', textAlign: 'right' }}>IGST Amount</th>
                        <th style={{ padding: '3px', textAlign: 'right' }}>Total Tax Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '3px', textAlign: 'center', borderRight: '1px solid #374151' }}>25051011</td>
                        <td style={{ padding: '3px', textAlign: 'right', borderRight: '1px solid #374151' }}>71,392.00</td>
                        <td style={{ padding: '3px', textAlign: 'center', borderRight: '1px solid #374151' }}>5%</td>
                        <td style={{ padding: '3px', textAlign: 'right', borderRight: '1px solid #374151' }}>3,569.60</td>
                        <td style={{ padding: '3px', textAlign: 'right' }}>3,569.60</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Terms & Signatory */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', border: '1px solid #374151', borderTop: 'none', fontSize: '9px', padding: '6px 8px' }}>
                    <div>
                      <strong>TERMS & CONDITIONS:</strong><br/>
                      • Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days.<br/>
                      • Goods Once Sold Will Not Be Taken Back.<br/>
                      • All Cheque and Remittance To Be Made / Payable to "SHOBHA READY PLAST"<br/>
                      • <strong>UDYAM REG.:-</strong> UDYAM-GJ-01-0012345
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div>For <strong>SHOBHA READY PLAST</strong></div>
                      <div style={{ height: 32 }}></div>
                      <strong>Authorised Signatory</strong>
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', fontSize: '8px', color: '#6b7280', marginTop: '6px' }}>
                    SUBJECT TO THANE JURISDICTION · This is a Computer Generated Invoice<br/>
                    <strong>1</strong>
                  </div>
                </div>

                {/* PAGE 2 (INCLUDED IN CONSIGNMENT ATTACHMENT) */}
                <div style={{ background: 'white', color: '#111', padding: '24px', borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontFamily: 'sans-serif', fontSize: '10.5px', lineHeight: 1.4, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 8, right: 12, fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>PAGE 2 OF 2 (TRANSPORTER / TRUCK CONVEYANCE)</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800 }}>e-Way Bill</div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700 }}>e-Way Bill</div>
                      <div style={{ width: 52, height: 52, background: '#f8fafc', border: '1px solid #cbd5e1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#64748b' }}>[ QR ]</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '9.5px', marginBottom: '12px' }}>
                    <div><strong>Doc No. :</strong> Tax Invoice - SRP/0570/26-27 &nbsp;|&nbsp; <strong>Date :</strong> 10-Aug-26</div>
                    <div><strong>IRN :</strong> a45684e7e4ef9d7c7c9b29e3cf08d0919d11d1df3db1613f50f26c11e0e32e6c</div>
                    <div><strong>Ack No. :</strong> 162625648066372 &nbsp;|&nbsp; <strong>Ack Date :</strong> 19-Aug-26</div>
                  </div>

                  <div style={{ fontWeight: 700, borderBottom: '1px solid #111', paddingBottom: '2px', marginBottom: '6px' }}>1. e-Way Bill Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '9.5px', marginBottom: '12px' }}>
                    <div><strong>e-Way Bill No.:</strong> 602165786131</div>
                    <div><strong>Mode :</strong> 1 - Road</div>
                    <div><strong>Generated Date :</strong> 19-Aug-26 10:30 AM</div>
                    <div><strong>Generated By :</strong> 24AGCPJ2785R1ZV</div>
                    <div><strong>Approx Distance :</strong> 176 KM</div>
                    <div><strong>Valid Upto :</strong> 20-Aug-26 11:59 PM</div>
                  </div>

                  <div style={{ fontWeight: 700, borderBottom: '1px solid #111', paddingBottom: '2px', marginBottom: '6px' }}>2. Address Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '9.5px', marginBottom: '12px' }}>
                    <div>
                      <strong>From:</strong> SHOBHA READY PLAST (GSTIN: 24AGCPJ2785R1ZV, Gujarat)<br/>
                      <strong>Dispatch From:</strong> NH48, NEAR KOLEI KHADI SARODHI, City/Village:Sarodhi, Valsad, Gujarat, 396001, UDYAM REG.:- UDYAM-GJ-01-0012345
                    </div>
                    <div>
                      <strong>To:</strong> VAISHNAV CONSTRUCTION (GSTIN: 27ALPRP4116L1ZM, Maharashtra)<br/>
                      <strong>Ship To:</strong> DEU APARTMENT, SHOP NO 4, KOLShet UPPER VILLEGE, THANE WEST, Maharashtra 400607
                    </div>
                  </div>

                  <div style={{ fontWeight: 700, borderBottom: '1px solid #111', paddingBottom: '2px', marginBottom: '6px' }}>3. Goods Details</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', marginBottom: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ textAlign: 'left', padding: '3px' }}>HSN Code</th>
                        <th style={{ textAlign: 'left', padding: '3px' }}>Product Name & Desc</th>
                        <th style={{ textAlign: 'center', padding: '3px' }}>Quantity</th>
                        <th style={{ textAlign: 'right', padding: '3px' }}>Taxable Amt</th>
                        <th style={{ textAlign: 'center', padding: '3px' }}>Tax Rate (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '3px' }}>25051011</td>
                        <td style={{ padding: '3px' }}>SAND & SAND</td>
                        <td style={{ textAlign: 'center', padding: '3px' }}>776 BAG</td>
                        <td style={{ textAlign: 'right', padding: '3px' }}>71,392.00</td>
                        <td style={{ textAlign: 'center', padding: '3px' }}>5</td>
                      </tr>
                    </tbody>
                  </table>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '9.5px', marginBottom: '12px' }}>
                    <div><strong>Tot. Taxable Amt :</strong> 71,392.00</div>
                    <div><strong>Other Amt :</strong> 0.40</div>
                    <div><strong>Total Inv Amt :</strong> 74,962.00</div>
                    <div><strong>IGST Amt :</strong> 3,569.60</div>
                  </div>

                  <div style={{ fontWeight: 700, borderBottom: '1px solid #111', paddingBottom: '2px', marginBottom: '6px' }}>4. Transportation Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '9.5px', marginBottom: '12px' }}>
                    <div><strong>Transporter ID :</strong> </div>
                    <div><strong>Doc No. :</strong> </div>
                    <div><strong>Name :</strong> SHOBHA TRANSPORT</div>
                    <div><strong>Date :</strong> </div>
                  </div>

                  <div style={{ fontWeight: 700, borderBottom: '1px solid #111', paddingBottom: '2px', marginBottom: '6px' }}>5. Vehicle Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '9.5px' }}>
                    <div><strong>Vehicle No. :</strong> MH04-4550</div>
                    <div><strong>From :</strong> Valsad, GUJARAT</div>
                    <div><strong>CEWB No. :</strong> </div>
                  </div>

                  <div style={{ textAlign: 'center', fontSize: '8px', color: '#6b7280', marginTop: '14px' }}>
                    <strong>2</strong>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: E-WAY BILL */}
            {selectedTemplateTab === 'eway_bill' && (
              <div style={{ width: '100%', maxWidth: 780, background: 'white', color: '#111', padding: '24px', borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontFamily: 'sans-serif', fontSize: '10.5px', lineHeight: 1.4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800 }}>e-Way Bill</div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700 }}>e-Way Bill</div>
                      <div style={{ width: 52, height: 52, background: '#f8fafc', border: '1px solid #cbd5e1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#64748b' }}>[ QR ]</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '9.5px', marginBottom: '12px' }}>
                    <div><strong>Doc No. :</strong> Tax Invoice - SRP/0570/26-27 &nbsp;|&nbsp; <strong>Date :</strong> 10-Aug-26</div>
                    <div><strong>IRN :</strong> a45684e7e4ef9d7c7c9b29e3cf08d0919d11d1df3db1613f50f26c11e0e32e6c</div>
                  </div>

                  <div style={{ fontWeight: 700, borderBottom: '1px solid #111', paddingBottom: '2px', marginBottom: '6px' }}>1. e-Way Bill Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '9.5px', marginBottom: '12px' }}>
                    <div><strong>e-Way Bill No.:</strong> 602165786131</div>
                    <div><strong>Mode :</strong> 1 - Road</div>
                    <div><strong>Generated Date :</strong> 19-Aug-26 10:30 AM</div>
                    <div><strong>Generated By :</strong> 24AGCPJ2785R1ZV</div>
                    <div><strong>Approx Distance :</strong> 176 KM</div>
                    <div><strong>Valid Upto :</strong> 20-Aug-26 11:59 PM</div>
                  </div>

                  <div style={{ fontWeight: 700, borderBottom: '1px solid #111', paddingBottom: '2px', marginBottom: '6px' }}>2. Address Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '9.5px', marginBottom: '12px' }}>
                    <div>
                      <strong>From:</strong> SHOBHA READY PLAST (GSTIN: 24AGCPJ2785R1ZV, Gujarat)<br/>
                      <strong>Dispatch From:</strong> NH48, NEAR KOLEI KHADI SARODHI, Valsad, Gujarat, 396001
                    </div>
                    <div>
                      <strong>To:</strong> VAISHNAV CONSTRUCTION (GSTIN: 27ALPRP4116L1ZM, Maharashtra)<br/>
                      <strong>Ship To:</strong> DEU APARTMENT, SHOP NO 4, KHET UPPER VILLEGE, THANE WEST, 400607
                    </div>
                  </div>

                  <div style={{ fontWeight: 700, borderBottom: '1px solid #111', paddingBottom: '2px', marginBottom: '6px' }}>3. Goods Details</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', marginBottom: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ textAlign: 'left', padding: '3px' }}>HSN Code</th>
                        <th style={{ textAlign: 'left', padding: '3px' }}>Product Name & Desc</th>
                        <th style={{ textAlign: 'center', padding: '3px' }}>Quantity</th>
                        <th style={{ textAlign: 'right', padding: '3px' }}>Taxable Amt</th>
                        <th style={{ textAlign: 'center', padding: '3px' }}>Tax Rate (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '3px' }}>25051011</td>
                        <td style={{ padding: '3px' }}>SAND & SAND</td>
                        <td style={{ textAlign: 'center', padding: '3px' }}>776 BAG</td>
                        <td style={{ textAlign: 'right', padding: '3px' }}>71,392.00</td>
                        <td style={{ textAlign: 'center', padding: '3px' }}>5</td>
                      </tr>
                    </tbody>
                  </table>

                  <div style={{ fontWeight: 700, borderBottom: '1px solid #111', paddingBottom: '2px', marginBottom: '6px' }}>4. Transportation & Vehicle Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '9.5px' }}>
                    <div><strong>Transporter:</strong> SHOBHA TRANSPORT</div>
                    <div><strong>Vehicle No.:</strong> MH04-4550</div>
                    <div><strong>From:</strong> Valsad, GUJARAT</div>
                  </div>
                </div>
              )}

              {/* TAB 3: PENDING BILLS STATEMENT */}
              {selectedTemplateTab === 'pending_bills' && (
                <div style={{ width: '100%', maxWidth: 780, background: 'white', color: '#111', padding: '24px', borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontFamily: 'sans-serif', fontSize: '10.5px', lineHeight: 1.4 }}>
                  <div style={{ textAlign: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800 }}>SHOBHA READY PLAST</div>
                    <div style={{ fontSize: '9.5px', color: '#4b5563' }}>NH48, NEAR KOLEI KHADI SARODHI, VALSAD, GUJARAT - 396001</div>
                    <div style={{ fontSize: '9.5px', color: '#4b5563' }}>UDYAM REG.:- UDYAM-GJ-01-0012345 | E-Mail : shobhareadyplast@gmail.com</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, marginTop: '8px' }}>VAISHNAV CONSTRUCTION</div>
                    <div style={{ fontSize: '10px' }}>Bill-wise Details · 1-Apr-26 to 22-Aug-26 · <strong>Pending Bills</strong></div>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                    <thead>
                      <tr style={{ borderTop: '1px solid #111', borderBottom: '1px solid #111', background: '#f8fafc' }}>
                        <th style={{ textAlign: 'left', padding: '4px' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '4px' }}>Ref. No.</th>
                        <th style={{ textAlign: 'right', padding: '4px' }}>Opening Amount</th>
                        <th style={{ textAlign: 'right', padding: '4px' }}>Pending Amount</th>
                        <th style={{ textAlign: 'center', padding: '4px' }}>Due on</th>
                        <th style={{ textAlign: 'right', padding: '4px' }}>Overdue by days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { date: '20-Mar-26', ref: 'SRP/01957/25-26', op: '86,373.00 Dr', pe: '86,373.00 Dr', due: '20-Mar-26', days: 154 },
                        { date: '26-Mar-26', ref: 'SRP/01995/25-26', op: '84,861.00 Dr', pe: '84,861.00 Dr', due: '26-Mar-26', days: 148 },
                        { date: '11-Apr-26', ref: 'SRP/062/26-27', op: '88,196.00 Dr', pe: '48,158.00 Dr', due: '11-Apr-26', days: 132 },
                        { date: '24-Jun-26', ref: 'SRP/0366/26-27', op: '87,326.00 Dr', pe: '87,326.00 Dr', due: '24-Jun-26', days: 58 },
                        { date: '15-Jul-26', ref: 'SRP/0455/26-27', op: '58,733.00 Dr', pe: '58,733.00 Dr', due: '15-Jul-26', days: 37 },
                        { date: '20-Jul-26', ref: 'SRP/0478/26-27', op: '87,326.00 Dr', pe: '87,326.00 Dr', due: '20-Jul-26', days: 32 },
                        { date: '10-Aug-26', ref: 'SRP/0570/26-27', op: '74,962.00 Dr', pe: '74,962.00 Dr', due: '10-Aug-26', days: 11 },
                      ].map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '4px' }}>{row.date}</td>
                          <td style={{ padding: '4px' }}>{row.ref}</td>
                          <td style={{ padding: '4px', textAlign: 'right' }}>{row.op}</td>
                          <td style={{ padding: '4px', textAlign: 'right', fontWeight: 700 }}>{row.pe}</td>
                          <td style={{ padding: '4px', textAlign: 'center' }}>{row.due}</td>
                          <td style={{ padding: '4px', textAlign: 'right', fontStyle: 'italic' }}>{row.days}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '1px solid #111', borderBottom: '1px solid #111', fontWeight: 800, background: '#f8fafc' }}>
                        <td colSpan={2} style={{ padding: '5px' }}>Total Outstanding</td>
                        <td style={{ padding: '5px', textAlign: 'right' }}>5,67,777.00 Dr</td>
                        <td style={{ padding: '5px', textAlign: 'right', color: 'var(--danger, #dc2626)' }}>5,27,739.00 Dr</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 4: CUSTOMER LEDGER ACCOUNT */}
              {selectedTemplateTab === 'ledger_account' && (
                <div style={{ width: '100%', maxWidth: 780, background: 'white', color: '#111', padding: '24px', borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontFamily: 'sans-serif', fontSize: '10.5px', lineHeight: 1.4 }}>
                  <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800 }}>SHOBHA READY PLAST</div>
                    <div style={{ fontSize: '9.5px', color: '#4b5563' }}>NH48, NEAR KOLEI KHADI SARODHI, VALSAD, GUJARAT - 396001</div>
                    <div style={{ fontSize: '9.5px', color: '#4b5563' }}>UDYAM REG.:- UDYAM-GJ-01-0012345 | E-Mail : shobhareadyplast@gmail.com</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, marginTop: '8px' }}>VAISHNAV CONSTRUCTION</div>
                    <div style={{ fontSize: '11px', fontWeight: 700 }}>Ledger Account</div>
                    <div style={{ fontSize: '9.5px', color: '#4b5563' }}>DEU APARTMENT , SHOP NO 4, KOLShet UPPER VILLEGE, THANE WEST</div>
                    <div style={{ fontSize: '9.5px' }}>1-Apr-26 to 22-Aug-26</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '9px', color: '#6b7280', marginBottom: '4px' }}>Page 1</div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px' }}>
                    <thead>
                      <tr style={{ borderTop: '1px solid #111', borderBottom: '1px solid #111', background: '#f8fafc' }}>
                        <th style={{ textAlign: 'left', padding: '4px' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '4px' }}>Particulars</th>
                        <th style={{ textAlign: 'center', padding: '4px' }}>Vch Type</th>
                        <th style={{ textAlign: 'center', padding: '4px' }}>Vch No.</th>
                        <th style={{ textAlign: 'right', padding: '4px' }}>Debit</th>
                        <th style={{ textAlign: 'right', padding: '4px' }}>Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { date: '1-Apr-26', part: 'To Opening Balance', type: '', no: '', db: '6,05,935.00', cr: '' },
                        { date: '10-Apr-26', part: 'To Sales', type: 'Sales', no: 'SRP/053/26-27', db: '82,690.00', cr: '' },
                        { date: '', part: 'To Sales', type: 'Sales', no: 'SRP/055/26-27', db: '77,377.00', cr: '' },
                        { date: '11-Apr-26', part: 'To Sales', type: 'Sales', no: 'SRP/062/26-27', db: '88,196.00', cr: '' },
                        { date: '2-May-26', part: 'By ICICI BANK 3,78,674.11/-', type: 'Receipt', no: '122', db: '', cr: '74,466.00' },
                        { date: '12-May-26', part: 'By ICICI BANK 3,78,674.11/-', type: 'Receipt', no: '149', db: '', cr: '86,279.00' },
                        { date: '21-May-26', part: 'By ICICI BANK 3,78,674.11/-', type: 'Receipt', no: '186', db: '', cr: '1,01,304.00' },
                        { date: '30-May-26', part: 'By ICICI BANK 3,78,674.11/-', type: 'Receipt', no: '220', db: '', cr: '75,124.00' },
                        { date: '11-Jun-26', part: 'By ICICI BANK 3,78,674.11/-', type: 'Receipt', no: '264', db: '', cr: '97,524.00' },
                        { date: '24-Jun-26', part: 'To Sales', type: 'Sales', no: 'SRP/0366/26-27', db: '87,326.00', cr: '' },
                        { date: '9-Jul-26', part: 'By ICICI BANK 3,78,674.11/-', type: 'Receipt', no: '362', db: '', cr: '77,377.00' },
                        { date: '15-Jul-26', part: 'By ICICI BANK 3,78,674.11/-', type: 'Receipt', no: '378', db: '', cr: '82,690.00' },
                        { date: '', part: 'To Sales', type: 'Sales', no: 'SRP/0455/26-27', db: '58,733.00', cr: '' },
                        { date: '18-Jul-26', part: 'By ICICI BANK 3,78,674.11/-', type: 'Receipt', no: '395', db: '', cr: '40,038.00' },
                        { date: '20-Jul-26', part: 'To Sales', type: 'Sales', no: 'SRP/0478/26-27', db: '87,326.00', cr: '' },
                        { date: '10-Aug-26', part: 'To Sales', type: 'Sales', no: 'SRP/0570/26-27', db: '74,962.00', cr: '' },
                      ].map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                          <td style={{ padding: '3px 4px' }}>{row.date}</td>
                          <td style={{ padding: '3px 4px' }}>{row.part}</td>
                          <td style={{ padding: '3px 4px', textAlign: 'center' }}>{row.type}</td>
                          <td style={{ padding: '3px 4px', textAlign: 'center' }}>{row.no}</td>
                          <td style={{ padding: '3px 4px', textAlign: 'right', fontWeight: row.part.includes('Opening') ? 700 : 400 }}>{row.db}</td>
                          <td style={{ padding: '3px 4px', textAlign: 'right' }}>{row.cr}</td>
                        </tr>
                      ))}
                      <tr>
                        <td></td>
                        <td style={{ padding: '4px' }}>By &nbsp;&nbsp;&nbsp;&nbsp; <strong>Closing Balance</strong></td>
                        <td colSpan={3}></td>
                        <td style={{ padding: '4px', textAlign: 'right', fontWeight: 700 }}>5,27,743.00</td>
                      </tr>
                      <tr style={{ borderTop: '1px solid #cbd5e1' }}>
                        <td colSpan={4}></td>
                        <td style={{ padding: '4px', textAlign: 'right' }}>11,62,545.00</td>
                        <td style={{ padding: '4px', textAlign: 'right' }}>11,62,545.00</td>
                      </tr>
                      <tr style={{ borderTop: '1px solid #111', borderBottom: '2px solid #111', fontWeight: 800 }}>
                        <td colSpan={4}></td>
                        <td style={{ padding: '4px', textAlign: 'right' }}>11,62,545.00</td>
                        <td style={{ padding: '4px', textAlign: 'right' }}>11,62,545.00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Lightbox Modal */}
      {previewPdfUrl && (
        <div className="modal-overlay" onClick={() => setPreviewPdfUrl(null)} style={{ background: 'rgba(0,0,0,0.85)', zIndex: 9999 }}>
          <div style={{ position: 'relative', maxWidth: 900, width: '92%', height: '85vh', background: 'var(--bg-secondary)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>
                <FileText size={16} color="var(--accent-primary)" /> TallyPrime Generated Invoice PDF
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <a
                  href={previewPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem' }}
                >
                  Open in New Tab ↗
                </a>
                <button className="modal-close-btn" onClick={() => setPreviewPdfUrl(null)}>✕</button>
              </div>
            </div>
            <iframe
              src={previewPdfUrl}
              title="Invoice PDF Preview"
              style={{ width: '100%', flex: 1, border: 'none' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Finance;
