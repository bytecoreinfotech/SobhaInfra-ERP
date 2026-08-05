import React, { useState } from 'react';
import {
  CreditCard, Send, CheckCircle2, AlertTriangle, Clock,
  MessageCircle, Phone, RefreshCw, IndianRupee, Plus, X
} from 'lucide-react';
import './Pages.css';

const invoices = [
  { id: 'INV-2026-041', client: 'Tech Solutions Inc.', amount: 45000, status: 'Overdue', daysOverdue: 14, phone: '+91 91234 56789', lastReminder: '3 days ago', reminderCount: 2 },
  { id: 'INV-2026-048', client: 'Alpha Corp', amount: 22000, status: 'Overdue', daysOverdue: 30, phone: '+91 98765 12345', lastReminder: '1 week ago', reminderCount: 4 },
  { id: 'INV-2026-045', client: 'Global Traders', amount: 120000, status: 'Pending', daysOverdue: 0, dueDays: 5, phone: '+91 87654 32101', lastReminder: '—', reminderCount: 0 },
  { id: 'INV-2026-052', client: 'Mehta Industries', amount: 38500, status: 'Pending', daysOverdue: 0, dueDays: 2, phone: '+91 77665 54433', lastReminder: '—', reminderCount: 0 },
  { id: 'INV-2026-032', client: 'BuildRight Construction', amount: 85500, status: 'Paid', daysOverdue: 0, phone: '+91 65432 10987', lastReminder: '—', reminderCount: 1 },
  { id: 'INV-2026-038', client: 'Patel Logistics Ltd.', amount: 61000, status: 'Paid', daysOverdue: 0, phone: '+91 55443 32211', lastReminder: '—', reminderCount: 0 },
];

const reminderMessages = {
  '1': 'First reminder sent',
  '2': 'Second reminder sent',
  '3': 'Third reminder – escalation note',
  '4+': 'Final notice sent',
};

const Payments = () => {
  const [remindingId, setRemindingId] = useState(null);
  const [sentIds, setSentIds] = useState([]);
  const [activeFilter, setActiveFilter] = useState('All');

  const filters = ['All', 'Overdue', 'Pending', 'Paid'];

  const filtered = invoices.filter(inv => activeFilter === 'All' || inv.status === activeFilter);

  const totalOverdue = invoices.filter(i => i.status === 'Overdue').reduce((sum, i) => sum + i.amount, 0);
  const totalPending = invoices.filter(i => i.status === 'Pending').reduce((sum, i) => sum + i.amount, 0);
  const totalPaid = invoices.filter(i => i.status === 'Paid').reduce((sum, i) => sum + i.amount, 0);

  const handleRemind = (inv) => {
    setRemindingId(inv.id);
    setTimeout(() => {
      setSentIds(prev => [...prev, inv.id]);
      setRemindingId(null);
    }, 1600);
  };

  const fmtAmount = (n) => '₹' + n.toLocaleString('en-IN');

  return (
    <div className="page-container animate-fade-in">
      {/* Demo Banner */}
      <div className="demo-banner">
        <span className="demo-badge">DEMO</span>
        Payment reminders are simulated. In production, WhatsApp/SMS messages are sent automatically via configured schedules.
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Payment Follow-up</h1>
          <p className="page-subtitle">Track overdue invoices and send automated payment reminders.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary"><RefreshCw size={15} /> Sync Invoices</button>
          <button className="btn btn-whatsapp"><MessageCircle size={15} /> Bulk Remind</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { label: 'Overdue Amount', value: fmtAmount(totalOverdue), color: 'var(--danger)', bg: 'var(--danger-bg)', icon: <AlertTriangle size={20} />, count: invoices.filter(i => i.status === 'Overdue').length + ' invoices' },
          { label: 'Pending Amount', value: fmtAmount(totalPending), color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <Clock size={20} />, count: invoices.filter(i => i.status === 'Pending').length + ' invoices' },
          { label: 'Collected (MTD)', value: fmtAmount(totalPaid), color: 'var(--success)', bg: 'var(--success-bg)', icon: <CheckCircle2 size={20} />, count: invoices.filter(i => i.status === 'Paid').length + ' invoices' },
          { label: 'Reminders Sent', value: '14', color: 'var(--whatsapp)', bg: 'var(--whatsapp-bg)', icon: <MessageCircle size={20} />, count: 'this month' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-header">
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ fontSize: '1.6rem' }}>{s.value}</div>
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
            {f} {f !== 'All' && `(${invoices.filter(i => i.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Invoice Table */}
      <div className="glass-card table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Client</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Overdue / Due</th>
              <th>Last Reminder</th>
              <th>Reminders Sent</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(inv => {
              const isSent = sentIds.includes(inv.id);
              const isReminding = remindingId === inv.id;
              return (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'monospace' }}>{inv.id}</td>
                  <td style={{ fontWeight: 600 }}>{inv.client}</td>
                  <td style={{ fontWeight: 700, color: inv.status === 'Paid' ? 'var(--success)' : inv.status === 'Overdue' ? 'var(--danger)' : 'var(--text-primary)' }}>
                    {fmtAmount(inv.amount)}
                  </td>
                  <td>
                    <span className={`badge ${inv.status === 'Paid' ? 'badge-success' : inv.status === 'Overdue' ? 'badge-danger' : 'badge-warning'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {inv.status === 'Overdue' && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>⚠ {inv.daysOverdue} days overdue</span>}
                    {inv.status === 'Pending' && <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Due in {inv.dueDays} days</span>}
                    {inv.status === 'Paid' && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isSent ? 'Just now' : inv.lastReminder}</td>
                  <td>
                    <span className="badge badge-neutral">{(isSent ? inv.reminderCount + 1 : inv.reminderCount)} sent</span>
                  </td>
                  <td>
                    {inv.status !== 'Paid' && (
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          className={`btn btn-sm ${isSent ? 'btn-success' : isReminding ? 'btn-secondary' : 'btn-whatsapp'}`}
                          onClick={() => !isSent && handleRemind(inv)}
                          disabled={isReminding || isSent}
                        >
                          {isSent ? <><CheckCircle2 size={13} /> Sent</> : isReminding ? 'Sending...' : <><Send size={13} /> WhatsApp</>}
                        </button>
                        <button className="btn btn-secondary btn-sm" title="Call">
                          <Phone size={13} />
                        </button>
                      </div>
                    )}
                    {inv.status === 'Paid' && <span style={{ fontSize: '0.78rem', color: 'var(--success)' }}>✓ Cleared</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Automation Schedule */}
      <div className="glass-card p-6">
        <div className="section-header" style={{ marginBottom: '1rem' }}>
          <span className="section-title">Auto-Reminder Schedule</span>
          <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span className="status-dot online" /> Active
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {[
            { label: 'Day 1 before due', action: 'SMS + WhatsApp reminder', icon: '📅' },
            { label: 'On due date', action: 'WhatsApp gentle nudge', icon: '🔔' },
            { label: '7 days overdue', action: 'WhatsApp + Email escalation', icon: '⚠️' },
            { label: '30 days overdue', action: 'Final notice + manager alert', icon: '🚨' },
          ].map(r => (
            <div key={r.label} style={{
              padding: '1rem', background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)'
            }}>
              <div style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>{r.icon}</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{r.label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.action}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(99,102,241,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          💡 Auto-reminders run daily at 10:00 AM. Paid invoices are automatically excluded. Configurable in Settings → Automation.
        </div>
      </div>
    </div>
  );
};

export default Payments;
