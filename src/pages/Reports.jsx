import React, { useState } from 'react';
import { BarChart3, TrendingUp, Users, MessageCircle, Download } from 'lucide-react';
import './Pages.css';

const weeklyData = [48, 62, 55, 78, 91, 85, 73];
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const maxVal = Math.max(...weeklyData);

const leadFunnel = [
  { stage: 'Total Leads', count: 1248, pct: 100, color: 'var(--accent-primary)' },
  { stage: 'Contacted', count: 892, pct: 71, color: 'var(--info)' },
  { stage: 'In Discussion', count: 412, pct: 33, color: 'var(--warning)' },
  { stage: 'Proposal Sent', count: 198, pct: 16, color: 'var(--accent-secondary)' },
  { stage: 'Closed Won', count: 64, pct: 5.1, color: 'var(--success)' },
];

const waMetrics = [
  { label: 'Campaigns Run', value: 12 },
  { label: 'Messages Sent', value: '3,840' },
  { label: 'Delivered', value: '3,712' },
  { label: 'Read', value: '2,928' },
  { label: 'Replies', value: 412 },
  { label: 'New Leads (WA)', value: 64 },
];

const moduleUsage = [
  { name: 'CRM & Leads', usage: 94, color: 'var(--accent-primary)' },
  { name: 'WhatsApp Campaigns', usage: 87, color: 'var(--whatsapp)' },
  { name: 'Task Management', usage: 76, color: 'var(--success)' },
  { name: 'Finance / Tally', usage: 68, color: 'var(--warning)' },
  { name: 'Payment Follow-up', usage: 55, color: 'var(--danger)' },
  { name: 'Chatbot', usage: 42, color: 'var(--info)' },
];

const Reports = () => {
  const [period, setPeriod] = useState('week');

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="page-subtitle">Business intelligence across all modules.</p>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {['week', 'month', 'quarter'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="btn"
                style={{
                  borderRadius: 0, background: period === p ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: period === p ? 'white' : 'var(--text-secondary)', padding: '0.4rem 0.875rem',
                  textTransform: 'capitalize'
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary"><Download size={15} /> Export PDF</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid">
        {[
          { label: 'Total Revenue', value: '₹48L', trend: '+18.7%', up: true, color: 'var(--success)', bg: 'var(--success-bg)', icon: <TrendingUp size={20} /> },
          { label: 'New Leads', value: '248', trend: '+12.5%', up: true, color: 'var(--accent-primary)', bg: 'var(--accent-glow)', icon: <Users size={20} /> },
          { label: 'WA Messages Sent', value: '3,840', trend: '+28.3%', up: true, color: 'var(--whatsapp)', bg: 'var(--whatsapp-bg)', icon: <MessageCircle size={20} /> },
          { label: 'Conversion Rate', value: '5.1%', trend: '+0.8%', up: true, color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <BarChart3 size={20} /> },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-header">
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ fontSize: '1.75rem' }}>{s.value}</div>
              </div>
              <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
            </div>
            <div className="stat-footer">
              <span className={`stat-trend ${s.up ? 'up' : 'down'}`}>▲ {s.trend}</span>
              <span className="stat-period">vs last period</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>

        {/* Revenue Chart */}
        <div className="glass-card p-6">
          <div className="section-header" style={{ marginBottom: '1.5rem' }}>
            <span className="section-title">Weekly Revenue (₹ Lakhs)</span>
            <span className="badge badge-success">Peak: Thu ₹91L</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 140 }}>
            {weeklyData.map((val, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>₹{val}L</span>
                <div
                  style={{
                    width: '100%', borderRadius: '6px 6px 0 0',
                    height: `${(val / maxVal) * 100}%`,
                    background: i === 3
                      ? 'linear-gradient(to top, var(--accent-primary), var(--accent-secondary))'
                      : 'linear-gradient(to top, rgba(99,102,241,0.5), rgba(99,102,241,0.2))',
                    transition: 'height 0.5s ease',
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            {days.map(d => (
              <div key={d} style={{ flex: 1, textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{d}</div>
            ))}
          </div>
        </div>

        {/* Lead Funnel */}
        <div className="glass-card p-6">
          <div className="section-title" style={{ marginBottom: '1.25rem' }}>Lead Conversion Funnel</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {leadFunnel.map(stage => (
              <div key={stage.stage}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{stage.stage}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: stage.color }}>{stage.count.toLocaleString()}</span>
                </div>
                <div className="progress-bar-wrap">
                  <div className="progress-bar-fill" style={{ width: `${stage.pct}%`, background: stage.color }} />
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: '0.15rem' }}>{stage.pct}%</div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* WA Campaign Metrics */}
      <div className="glass-card p-6">
        <div className="section-title" style={{ marginBottom: '1.25rem' }}>WhatsApp Campaign Metrics</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
          {waMetrics.map(m => (
            <div key={m.label} style={{
              textAlign: 'center', padding: '1rem',
              background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--whatsapp)', fontFamily: 'Outfit, sans-serif' }}>{m.value.toLocaleString()}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Module Usage */}
      <div className="glass-card p-6">
        <div className="section-title" style={{ marginBottom: '1.25rem' }}>Module Engagement</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {moduleUsage.map(m => (
            <div key={m.name} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 50px', alignItems: 'center', gap: '1rem' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{m.name}</div>
              <div className="progress-bar-wrap" style={{ height: 8 }}>
                <div className="progress-bar-fill" style={{ width: `${m.usage}%`, background: m.color }} />
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: m.color, textAlign: 'right' }}>{m.usage}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Reports;
