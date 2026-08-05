import React, { useState } from 'react';
import {
  MessageCircle, Send, Users, BarChart3, Plus, Search,
  CheckCircle2, Clock, XCircle, Image, FileText, Zap
} from 'lucide-react';
import './Pages.css';

const campaigns = [
  { id: 1, name: 'Festival Offer – Diwali 2026', status: 'Completed', sent: 248, delivered: 241, read: 198, replied: 34, date: 'Aug 3, 2026' },
  { id: 2, name: 'Product Launch – ERPPro v3', status: 'Running', sent: 85, delivered: 82, read: 67, replied: 12, date: 'Aug 5, 2026' },
  { id: 3, name: 'Payment Reminder – July Dues', status: 'Completed', sent: 32, delivered: 32, read: 28, replied: 21, date: 'Jul 31, 2026' },
  { id: 4, name: 'Follow-Up – Cold Leads', status: 'Scheduled', sent: 0, delivered: 0, read: 0, replied: 0, date: 'Aug 8, 2026' },
];

const templates = [
  {
    id: 1, tag: 'Sales', name: 'Product Pitch',
    preview: 'Hi {name}, We noticed you were interested in our services. Are you available for a quick demo?',
    icon: <Zap size={16} />
  },
  {
    id: 2, tag: 'Reminder', name: 'Meeting Reminder',
    preview: 'Hi {name}, Just a reminder about our meeting scheduled tomorrow at {time}. Looking forward!',
    icon: <Clock size={16} />
  },
  {
    id: 3, tag: 'Offer', name: 'Festival Discount',
    preview: '🎉 {name}, Get 25% OFF this festive season on ERPPro Annual Plan! Offer valid till {date}.',
    icon: <MessageCircle size={16} />
  },
  {
    id: 4, tag: 'Finance', name: 'Payment Follow-up',
    preview: 'Dear {name}, Your invoice #{invoice_id} of ₹{amount} is due. Please clear it at the earliest.',
    icon: <FileText size={16} />
  },
];

const statusConfig = {
  'Completed': 'badge-success',
  'Running': 'badge-warning',
  'Scheduled': 'badge-info',
  'Failed': 'badge-danger',
};

const WhatsApp = () => {
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [campaignSent, setCampaignSent] = useState(false);

  const handleLaunch = () => {
    setIsSending(true);
    setTimeout(() => { setIsSending(false); setCampaignSent(true); }, 2000);
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Demo banner */}
      <div className="demo-banner">
        <span className="demo-badge">DEMO</span>
        Campaign sending is simulated. Production system will integrate with Meta WhatsApp Business API (requires approved business account).
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">WhatsApp Campaigns</h1>
          <p className="page-subtitle">Bulk messaging, broadcast lists & campaign analytics.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary"><FileText size={15} /> Templates</button>
          <button className="btn btn-whatsapp" onClick={() => setShowNewCampaign(true)}><Plus size={15} /> New Campaign</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { label: 'Total Sent', value: '3,840', icon: <Send size={20} />, color: 'var(--accent-primary)', bg: 'var(--accent-glow)' },
          { label: 'Delivered', value: '3,712', icon: <CheckCircle2 size={20} />, color: 'var(--success)', bg: 'var(--success-bg)' },
          { label: 'Read Rate', value: '76.4%', icon: <BarChart3 size={20} />, color: 'var(--warning)', bg: 'var(--warning-bg)' },
          { label: 'Replies', value: '412', icon: <MessageCircle size={20} />, color: 'var(--whatsapp)', bg: 'var(--whatsapp-bg)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-header">
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ fontSize: '1.75rem' }}>{s.value}</div>
              </div>
              <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Campaign Table */}
      <div className="glass-card">
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <span className="section-title">Campaign History</span>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign Name</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Delivered</th>
                <th>Read</th>
                <th>Replied</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td><span className={`badge ${statusConfig[c.status]}`}>{c.status}</span></td>
                  <td>{c.sent.toLocaleString()}</td>
                  <td style={{ color: 'var(--success)' }}>{c.delivered.toLocaleString()}</td>
                  <td style={{ color: 'var(--warning)' }}>{c.read.toLocaleString()}</td>
                  <td style={{ color: 'var(--whatsapp)' }}>{c.replied}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{c.date}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm">View Report</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Template Library */}
      <div>
        <div className="section-header" style={{ marginBottom: '1rem' }}>
          <span className="section-title">Message Templates</span>
          <button className="btn btn-secondary btn-sm"><Plus size={14} /> Add Template</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {templates.map(t => (
            <div
              key={t.id}
              className="template-card"
              onClick={() => setSelectedTemplate(t)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span className="template-tag">{t.tag}</span>
              </div>
              <div className="template-title">{t.name}</div>
              <div className="template-preview">{t.preview}</div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}>Edit</button>
                <button className="btn btn-whatsapp btn-sm" style={{ flex: 1 }}>Use</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New Campaign Modal */}
      {showNewCampaign && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg">
            <button
              style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              onClick={() => { setShowNewCampaign(false); setCampaignSent(false); }}
            >
              <XCircle size={20} />
            </button>

            {campaignSent ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Campaign Launched!</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Your campaign is queued and will be sent to all selected contacts.<br />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Demo: No actual messages sent.</span>
                </p>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MessageCircle size={20} style={{ color: 'var(--whatsapp)' }} /> New WhatsApp Campaign
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Campaign Name</label>
                    <input type="text" className="input-field" placeholder="e.g. August Product Launch" />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Target Audience</label>
                    <select className="input-field">
                      <option>All Leads (248 contacts)</option>
                      <option>Hot Leads only (42 contacts)</option>
                      <option>Customers – Paid (118 contacts)</option>
                      <option>Custom Segment</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Select Template</label>
                    <select className="input-field">
                      {templates.map(t => <option key={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Schedule</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <select className="input-field">
                        <option>Send Immediately</option>
                        <option>Schedule for Later</option>
                      </select>
                      <input type="datetime-local" className="input-field" />
                    </div>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    ⚠️ In production, messages require Meta-approved templates. Unapproved messages may be rejected.
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={() => setShowNewCampaign(false)}>Cancel</button>
                    <button className="btn btn-whatsapp" onClick={handleLaunch} disabled={isSending}>
                      <Send size={15} /> {isSending ? 'Launching...' : 'Launch Campaign'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsApp;
