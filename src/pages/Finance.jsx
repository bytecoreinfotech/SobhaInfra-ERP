import React, { useState } from 'react';
import { RefreshCw, Download, Send, CheckCircle2, AlertTriangle, IndianRupee, TrendingUp } from 'lucide-react';
import './Pages.css';

const invoices = [
  { id: 'INV-2026-041', client: 'Tech Solutions Inc.', amount: 45000, status: 'Overdue', days: '14 days overdue', lastReminder: '3 days ago' },
  { id: 'INV-2026-045', client: 'Global Traders Pvt. Ltd.', amount: 120000, status: 'Pending', days: 'Due in 5 days', lastReminder: '—' },
  { id: 'INV-2026-032', client: 'BuildRight Construction', amount: 85500, status: 'Paid', days: '—', lastReminder: '—' },
  { id: 'INV-2026-048', client: 'Alpha Corp', amount: 22000, status: 'Overdue', days: '30 days overdue', lastReminder: '1 week ago' },
  { id: 'INV-2026-052', client: 'Mehta Industries', amount: 38500, status: 'Pending', days: 'Due in 2 days', lastReminder: '—' },
  { id: 'INV-2026-038', client: 'Patel Logistics Ltd.', amount: 61000, status: 'Paid', days: '—', lastReminder: '—' },
];

const ledger = [
  { account: 'Cash in Hand', balance: '₹1,24,500', type: 'Asset' },
  { account: 'Bank – HDFC Current', balance: '₹18,42,350', type: 'Asset' },
  { account: 'Trade Receivables', balance: '₹6,75,000', type: 'Asset' },
  { account: 'Sundry Payables', balance: '₹2,34,200', type: 'Liability' },
  { account: 'GST Payable', balance: '₹48,600', type: 'Liability' },
  { account: 'Capital Account', balance: '₹50,00,000', type: 'Equity' },
];

const Finance = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncComplete, setSyncComplete] = useState(false);
  const [remindingId, setRemindingId] = useState(null);
  const [remindedIds, setRemindedIds] = useState([]);

  const handleSyncTally = () => {
    setIsSyncing(true);
    setSyncComplete(false);
    setTimeout(() => {
      setIsSyncing(false);
      setSyncComplete(true);
      setTimeout(() => setSyncComplete(false), 4000);
    }, 2500);
  };

  const handleReminder = (id) => {
    setRemindingId(id);
    setTimeout(() => {
      setRemindedIds(prev => [...prev, id]);
      setRemindingId(null);
    }, 1500);
  };

  const totalRevenue = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + i.amount, 0);
  const totalOverdue = invoices.filter(i => i.status === 'Overdue').reduce((s, i) => s + i.amount, 0);
  const totalPending = invoices.filter(i => i.status === 'Pending').reduce((s, i) => s + i.amount, 0);

  return (
    <div className="page-container animate-fade-in">
      {/* Demo Banner */}
      <div className="demo-banner">
        <span className="demo-badge">DEMO</span>
        Tally integration uses Tally.ERP 9 / TallyPrime API. Ledger data shown is sample. Real sync requires Tally running locally or on server.
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Finance & Tally Sync
            {syncComplete && (
              <span className="badge badge-success animate-fade-in" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <CheckCircle2 size={12} /> Synced
              </span>
            )}
          </h1>
          <p className="page-subtitle">Manage invoices, ledger and sync data from Tally.ERP 9 / TallyPrime.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary"><Download size={15} /> Export CSV</button>
          <button className="btn btn-primary" onClick={handleSyncTally} disabled={isSyncing}>
            <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing with Tally...' : 'Sync with Tally'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { label: 'Revenue Collected', value: '₹' + (totalRevenue / 1000).toFixed(0) + 'K', color: 'var(--success)', bg: 'var(--success-bg)', icon: <TrendingUp size={20} /> },
          { label: 'Pending Invoices', value: '₹' + (totalPending / 1000).toFixed(0) + 'K', color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <IndianRupee size={20} /> },
          { label: 'Overdue Amount', value: '₹' + (totalOverdue / 1000).toFixed(0) + 'K', color: 'var(--danger)', bg: 'var(--danger-bg)', icon: <AlertTriangle size={20} /> },
          { label: 'Last Tally Sync', value: syncComplete ? 'Just now' : '2 hr ago', color: 'var(--accent-primary)', bg: 'var(--accent-glow)', icon: <RefreshCw size={20} /> },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-header">
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ fontSize: '1.65rem' }}>{s.value}</div>
              </div>
              <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* Invoice Table */}
        <div className="glass-card table-container">
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
            <span className="section-title">Invoice Ledger</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Due / Paid</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const reminded = remindedIds.includes(inv.id);
                const isReminding = remindingId === inv.id;
                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'monospace', fontSize: '0.8rem' }}>{inv.id}</td>
                    <td style={{ fontWeight: 500 }}>{inv.client}</td>
                    <td style={{ fontWeight: 700 }}>{'₹' + inv.amount.toLocaleString('en-IN')}</td>
                    <td>
                      <span className={`badge ${inv.status === 'Paid' ? 'badge-success' : inv.status === 'Overdue' ? 'badge-danger' : 'badge-warning'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: inv.status === 'Overdue' ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {inv.days}
                    </td>
                    <td>
                      {inv.status !== 'Paid' && (
                        <button
                          className={`btn btn-sm ${reminded ? 'btn-success' : 'btn-secondary'}`}
                          onClick={() => !reminded && handleReminder(inv.id)}
                          disabled={isReminding || reminded}
                        >
                          {reminded ? <><CheckCircle2 size={13} /> Sent</> : isReminding ? 'Sending...' : <><Send size={13} /> Remind</>}
                        </button>
                      )}
                      {inv.status === 'Paid' && <span style={{ fontSize: '0.78rem', color: 'var(--success)' }}>✓ Cleared</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Ledger Summary */}
        <div className="glass-card p-6">
          <div className="section-title" style={{ marginBottom: '1rem' }}>Ledger Summary (Tally)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {ledger.map(entry => (
              <div key={entry.account} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.65rem 0.875rem', background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)'
              }}>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>{entry.account}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{entry.type}</div>
                </div>
                <div style={{
                  fontWeight: 700, fontSize: '0.875rem',
                  color: entry.type === 'Asset' ? 'var(--success)' : entry.type === 'Liability' ? 'var(--danger)' : 'var(--accent-primary)'
                }}>
                  {entry.balance}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '1rem', padding: '0.65rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Data from Tally.ERP 9 · Last sync: {syncComplete ? 'Just now' : '2 hr ago'}
          </div>
        </div>
      </div>

      {/* Tally Sync Overlay */}
      {isSyncing && (
        <div className="modal-overlay">
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-xl)', padding: '3rem', textAlign: 'center',
            maxWidth: 360, width: '100%', boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <RefreshCw size={56} style={{ color: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Connecting to Tally.ERP 9</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>Fetching invoices, ledger balances and payment data...</p>
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden', height: 4 }}>
              <div style={{ height: '100%', width: '70%', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))', animation: 'shimmer 1.5s infinite', backgroundSize: '200% 100%' }} />
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>Demo: No actual Tally connection</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Finance;
