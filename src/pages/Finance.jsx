import React, { useState, useEffect } from 'react';
import {
  DollarSign, TrendingUp, AlertTriangle, CheckCircle2,
  Clock, Plus, Search, Filter, ArrowUpRight, ArrowDownRight,
  Download, Send, RefreshCw, X, FileText, Check, ShieldCheck,
  Server, Link, AlertOctagon, HelpCircle, Building2
} from 'lucide-react';
import {
  getInvoices, getTallyConnectionStatus, triggerTallySyncNow,
  getLedgerMappings, updateLedgerMapping, getSyncErrors,
  sendPaymentReminderWhatsApp, getLeads, normalizePhone
} from '../lib/db';
import './Pages.css';

const statusConfig = {
  'Paid':    { badge: 'badge-success', icon: <CheckCircle2 size={13} /> },
  'Pending': { badge: 'badge-warning', icon: <Clock size={13} /> },
  'Overdue': { badge: 'badge-danger',  icon: <AlertTriangle size={13} /> },
  'Draft':   { badge: 'badge-neutral', icon: <Clock size={13} /> },
};

const Finance = () => {
  const [activeTab, setActiveTab] = useState('invoices'); // 'invoices' | 'tally' | 'mappings' | 'errors'
  
  // Invoices & Outstandings State
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
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

  // Sync Errors State
  const [syncErrors, setSyncErrors] = useState([]);

  useEffect(() => {
    loadAllFinanceData();
  }, []);

  const loadAllFinanceData = async () => {
    setLoading(true);
    const [invRes, tallyRes, mapRes, errRes, leadsRes] = await Promise.all([
      getInvoices(),
      getTallyConnectionStatus(),
      getLedgerMappings(),
      getSyncErrors(),
      getLeads(),
    ]);
    setInvoices(invRes.data || []);
    setTallyStatus(tallyRes.data || null);
    setMappings(mapRes.data || []);
    setSyncErrors(errRes.data || []);
    setLeads(leadsRes.data || []);
    setLoading(false);
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
    loadAllFinanceData();
  };

  // Metrics
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalOverdue = invoices.filter(i => i.status === 'Overdue').reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalPending = invoices.filter(i => i.status === 'Pending').reduce((s, i) => s + Number(i.amount || 0), 0);

  // Filter by aging / status
  const filtered = invoices.filter(inv => {
    const matchSearch = !search ||
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      inv.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.client_phone?.includes(search);

    if (!matchSearch) return false;
    if (filter === 'All') return true;
    if (filter === 'Overdue') return inv.status === 'Overdue';
    if (filter === 'Pending') return inv.status === 'Pending';
    if (filter === 'Paid') return inv.status === 'Paid';
    return true;
  });

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

          <button className="btn btn-secondary" onClick={loadAllFinanceData}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
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
              { label: 'Total Invoiced', value: fmtCurrency(totalInvoiced), icon: <DollarSign size={20} />, color: 'var(--accent-primary)', bg: 'var(--accent-glow)' },
              { label: 'Total Collected', value: fmtCurrency(totalPaid), icon: <TrendingUp size={20} />, color: 'var(--success)', bg: 'var(--success-bg)' },
              { label: 'Overdue Recovery', value: fmtCurrency(totalOverdue), icon: <AlertTriangle size={20} />, color: 'var(--danger)', bg: 'var(--danger-bg)' },
              { label: 'Pending Due', value: fmtCurrency(totalPending), icon: <Clock size={20} />, color: 'var(--warning)', bg: 'var(--warning-bg)' },
            ].map(s => (
              <div key={s.label} className="stat-card" style={{ '--card-accent': s.color }}>
                <div className="stat-header">
                  <div>
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-value" style={{ fontSize: '1.55rem' }}>{s.value}</div>
                  </div>
                  <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Search & Filter Bar */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="input-group" style={{ flex: 1, minWidth: 240 }}>
              <Search size={15} className="input-icon" />
              <input
                type="text"
                className="input-field"
                placeholder="Search invoice number, client name, phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
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
            </div>
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
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent-secondary)' }}>
                        {inv.invoice_number}
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
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          {(inv.pdf_url || inv.metadata?.pdf_url) ? (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              onClick={() => setPreviewPdfUrl(inv.pdf_url || inv.metadata?.pdf_url)}
                            >
                              <FileText size={12} /> View PDF
                            </button>
                          ) : (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              onClick={() => {
                                const safeName = String(inv.invoice_number || inv.tally_voucher_number || 'INV').replace(/[^a-zA-Z0-9_-]/g, '_');
                                window.open(`https://jbgkeeubevwopphekwfj.supabase.co/storage/v1/object/public/whatsapp-media/invoices/${safeName}_1787339499.pdf`, '_blank');
                              }}
                            >
                              <FileText size={12} /> PDF
                            </button>
                          )}

                          {inv.status !== 'Paid' ? (
                            <button
                              className="btn btn-whatsapp btn-sm"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
                              onClick={() => handleSendReminder(inv)}
                              disabled={remindingId === inv.id}
                            >
                              <Send size={12} /> {remindingId === inv.id ? 'Sending...' : 'Remind on WA'}
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--success)', fontWeight: 600 }}>Settled</span>
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
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Ledger & Customer Mapping Master (Section 30)</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                Bridges Tally accounting ledgers with CRM customer profiles via normalized phone matching.
              </p>
            </div>
          </div>

          <div className="glass-card table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tally Ledger Name</th>
                  <th>Mapped CRM Customer</th>
                  <th>Normalized Phone</th>
                  <th>Match Confidence</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 700, fontSize: '0.85rem' }}>{m.tally_ledger_name}</td>
                    <td style={{ color: m.mapping_status === 'MAPPED' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {m.lead_name || '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{m.lead_phone || '—'}</td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontWeight: 700 }}>
                        {((m.match_confidence || 0) * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${m.mapping_status === 'MAPPED' ? 'badge-success' : m.mapping_status === 'AMBIGUOUS' ? 'badge-warning' : 'badge-danger'}`}>
                        {m.mapping_status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                        onClick={() => { setSelectedMapping(m); setShowMapModal(true); }}
                      >
                        Map Lead
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: SYNC ERRORS & AUDIT LOG
         ========================================================================= */}
      {activeTab === 'errors' && (
        <div className="glass-card table-container">
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="section-title">Tally Synchronization Audit & Error Log</span>
            <button className="btn btn-secondary btn-sm" onClick={loadAllFinanceData}><RefreshCw size={13} /> Refresh</button>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Error ID</th><th>Entity</th><th>Voucher / Ledger ID</th><th>Error Detail</th><th>Logged At</th><th>Resolution</th></tr>
            </thead>
            <tbody>
              {syncErrors.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No sync errors. All vouchers cleanly synchronized.</td></tr>
              ) : (
                syncErrors.map(err => (
                  <tr key={err.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{err.id}</td>
                    <td><span className="badge badge-neutral">{err.entity_type}</span></td>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent-secondary)' }}>{err.entity_id}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--danger)', maxWidth: 300 }}>{err.error_message}</td>
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
          <div className="modal-content animate-fade-in" style={{ maxWidth: 500 }}>
            <button className="modal-close-btn" onClick={() => setShowMapModal(false)} title="Close Modal (Esc)" aria-label="Close">
              <X size={18} />
            </button>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem', paddingRight: '2.5rem' }}>
              Map Tally Ledger to CRM Customer
            </h2>
            <form onSubmit={handleSaveMapping} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Tally Ledger Name</label>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{selectedMapping.tally_ledger_name}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Select Matching CRM Lead *</label>
                <select className="input-field" value={targetLeadId} onChange={e => setTargetLeadId(e.target.value)} required>
                  <option value="">-- Choose CRM Lead --</option>
                  {leads.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.phone})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowMapModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Ledger Mapping</button>
              </div>
            </form>
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
