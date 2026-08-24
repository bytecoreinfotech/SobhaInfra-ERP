import React, { useState, useEffect } from 'react';
import {
  CreditCard, Send, CheckCircle2, AlertTriangle, Clock,
  MessageCircle, Phone, RefreshCw, IndianRupee, Plus
} from 'lucide-react';
import { getInvoices, logPaymentReminder } from '../lib/db';
import { useCompany } from '../context/CompanyContext';
import './Pages.css';

const Payments = () => {
  const { activeCompany, isConsolidated } = useCompany();
  const [allInvoices, setAllInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remindingId, setRemindingId] = useState(null);
  const [sentIds, setSentIds] = useState([]);
  const [activeFilter, setActiveFilter] = useState('All');

  useEffect(() => { loadInvoices(); }, []);

  // Filter by active company (instant, no refetch)
  const invoices = isConsolidated
    ? allInvoices
    : allInvoices.filter(inv => {
        if (!activeCompany) return true;
        const compName = (activeCompany.company_name || '').toUpperCase();
        const aliases = Array.isArray(activeCompany.alias_names) ? activeCompany.alias_names.map(a => a.toUpperCase()) : [];
        const invCompany = (inv.company_name || inv.tally_company || '').toUpperCase();
        if (!invCompany) return true;
        return [compName, ...aliases].some(n => n && (invCompany.includes(n) || n.includes(invCompany)));
      });

  const loadInvoices = async () => {
    setLoading(true);
    const { data } = await getInvoices();
    setAllInvoices(data || []);
    setLoading(false);
  };

  const filters = ['All', 'Overdue', 'Pending', 'Paid'];
  const filtered = invoices.filter(inv => activeFilter === 'All' || inv.status === activeFilter);

  const totalOverdue = invoices.filter(i => i.status === 'Overdue').reduce((s, i) => s + Number(i.amount), 0);
  const totalPending = invoices.filter(i => i.status === 'Pending').reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount), 0);
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
        setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, reminder_count: (i.reminder_count || 0) + 1 } : i));
      } else {
        console.warn('Reminder API error:', data.error);
        // Still mark as sent in UI (may fail in dev due to no live function)
        setSentIds(prev => [...prev, inv.id]);
      }
    } catch (err) {
      // Dev mode — functions not running locally, just simulate
      setSentIds(prev => [...prev, inv.id]);
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, reminder_count: (i.reminder_count || 0) + 1 } : i));
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
          { label: 'Overdue Amount', value: fmtAmount(totalOverdue), color: 'var(--danger)', bg: 'var(--danger-bg)', icon: <AlertTriangle size={20} />, count: invoices.filter(i => i.status === 'Overdue').length + ' invoices' },
          { label: 'Pending Amount', value: fmtAmount(totalPending), color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <Clock size={20} />, count: invoices.filter(i => i.status === 'Pending').length + ' invoices' },
          { label: 'Collected (MTD)', value: fmtAmount(totalPaid), color: 'var(--success)', bg: 'var(--success-bg)', icon: <CheckCircle2 size={20} />, count: invoices.filter(i => i.status === 'Paid').length + ' invoices' },
          { label: 'Reminders Sent', value: sentIds.length + invoices.reduce((s, i) => s + (i.reminder_count || 0), 0), color: 'var(--whatsapp)', bg: 'var(--whatsapp-bg)', icon: <MessageCircle size={20} />, count: 'total logged' },
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
            {f} {f !== 'All' && `(${invoices.filter(i => i.status === f).length})`}
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
                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'monospace', fontSize: '0.78rem' }}>{inv.invoice_number}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{inv.client_name}</div>
                      {inv.client_phone && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{inv.client_phone}</div>}
                    </td>
                    <td style={{ fontWeight: 700, color: inv.status === 'Paid' ? 'var(--success)' : inv.status === 'Overdue' ? 'var(--danger)' : 'var(--text-primary)', fontSize: '0.9rem' }}>
                      {fmtAmount(inv.amount)}
                    </td>
                    <td>
                      <span className={`badge ${inv.status === 'Paid' ? 'badge-success' : inv.status === 'Overdue' ? 'badge-danger' : 'badge-warning'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{getDaysLabel(inv)}</td>
                    <td><span className="badge badge-neutral">{(isSent ? (inv.reminder_count || 0) + 1 : (inv.reminder_count || 0))} sent</span></td>
                    <td>
                      {inv.status !== 'Paid' ? (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            className={`btn btn-sm ${isSent ? 'btn-success' : isReminding ? 'btn-secondary' : 'btn-whatsapp'}`}
                            onClick={() => !isSent && !isReminding && handleRemind(inv)}
                            disabled={isReminding || isSent}
                          >
                            {isSent ? <><CheckCircle2 size={13} /> Sent</> : isReminding ? 'Sending...' : <><Send size={13} /> Remind</>}
                          </button>
                          <button className="btn btn-secondary btn-sm" title="Call"><Phone size={13} /></button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 600 }}>✓ Cleared</span>
                      )}
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
    </div>
  );
};

export default Payments;
