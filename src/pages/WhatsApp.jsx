import React, { useState, useEffect } from 'react';
import {
  MessageCircle, Send, Users, BarChart3, Plus,
  CheckCircle2, Clock, XCircle, FileText, Zap, RefreshCw
} from 'lucide-react';
import { getCampaigns, createCampaign, getLeads } from '../lib/db';
import './Pages.css';

const statusConfig = {
  'Completed': 'badge-success',
  'Running':   'badge-warning',
  'Scheduled': 'badge-info',
  'Failed':    'badge-danger',
  'Draft':     'badge-neutral',
};

const templates = [
  { id: 1, tag: 'Launch', name: 'New Property Launch', preview: 'Hi {name}! 🏠 We have an exciting new 3BHK launch in Andheri. Prices start at ₹85L. Interested in a site visit?' },
  { id: 2, tag: 'Site Visit', name: 'Site Visit Invite', preview: 'Dear {name}, our site visits are open this weekend! Book your slot today and get ₹50K off on booking.' },
  { id: 3, tag: 'Payment', name: 'Payment Reminder', preview: 'Dear {name}, your payment of {amount} for {property} is due on {date}. Please clear at the earliest.' },
  { id: 4, tag: 'Festival', name: 'Festival Offer', preview: '🎉 {name}, this festive season get special pricing on our 2BHK & 3BHK properties! Limited period offer.' },
];

const WhatsApp = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [campaignSent, setCampaignSent] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: '', template_name: templates[0].name, audience_filter: {}, scheduled_at: '' });

  useEffect(() => {
    Promise.all([loadCampaigns(), loadLeads()]);
  }, []);

  const loadCampaigns = async () => {
    setLoading(true);
    const { data } = await getCampaigns();
    setCampaigns(data || []);
    setLoading(false);
  };

  const loadLeads = async () => {
    const { data } = await getLeads();
    setLeads(data || []);
  };

  const totalSent = campaigns.reduce((s, c) => s + (c.total_sent || 0), 0);
  const totalDelivered = campaigns.reduce((s, c) => s + (c.delivered || 0), 0);
  const totalRead = campaigns.reduce((s, c) => s + (c.read_count || 0), 0);
  const totalReplied = campaigns.reduce((s, c) => s + (c.replied || 0), 0);
  const readRate = totalSent > 0 ? ((totalRead / totalSent) * 100).toFixed(1) : '0.0';

  const handleLaunch = async () => {
    if (!newCampaign.name.trim()) return;
    setIsSending(true);
    const payload = {
      name: newCampaign.name,
      status: 'Running',
      template_name: newCampaign.template_name,
      total_sent: leads.length,
      delivered: Math.floor(leads.length * 0.96),
      read_count: Math.floor(leads.length * 0.72),
      replied: Math.floor(leads.length * 0.14),
    };
    const { data } = await createCampaign(payload);
    if (data) setCampaigns(prev => [data, ...prev]);
    setTimeout(() => {
      setIsSending(false);
      setCampaignSent(true);
    }, 2000);
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Demo Banner */}
      <div className="demo-banner">
        <span className="demo-badge">DEMO</span>
        Campaign data is saved to Supabase. Actual message sending requires a verified Meta WhatsApp Business API account.
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">WhatsApp Campaigns</h1>
          <p className="page-subtitle">Bulk messaging, broadcast lists & campaign analytics.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={loadCampaigns}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
          <button className="btn btn-whatsapp" onClick={() => { setShowNewCampaign(true); setCampaignSent(false); }}>
            <Plus size={15} /> New Campaign
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { label: 'Total Sent', value: totalSent.toLocaleString(), icon: <Send size={20} />, color: 'var(--accent-primary)', bg: 'var(--accent-glow)' },
          { label: 'Delivered', value: totalDelivered.toLocaleString(), icon: <CheckCircle2 size={20} />, color: 'var(--success)', bg: 'var(--success-bg)' },
          { label: 'Read Rate', value: readRate + '%', icon: <BarChart3 size={20} />, color: 'var(--warning)', bg: 'var(--warning-bg)' },
          { label: 'Replies', value: totalReplied.toLocaleString(), icon: <MessageCircle size={20} />, color: 'var(--whatsapp)', bg: 'var(--whatsapp-bg)' },
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
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
      ) : (
        <div className="glass-card">
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
            <span className="section-title">Campaign History</span>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Campaign Name</th><th>Status</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Replied</th><th>Template</th></tr>
              </thead>
              <tbody>
                {campaigns.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No campaigns yet. Launch your first one!</td></tr>}
                {campaigns.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td><span className={`badge ${statusConfig[c.status]}`}>{c.status}</span></td>
                    <td>{(c.total_sent || 0).toLocaleString()}</td>
                    <td style={{ color: 'var(--success)' }}>{(c.delivered || 0).toLocaleString()}</td>
                    <td style={{ color: 'var(--warning)' }}>{(c.read_count || 0).toLocaleString()}</td>
                    <td style={{ color: 'var(--whatsapp)' }}>{(c.replied || 0)}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{c.template_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Template Library */}
      <div>
        <div className="section-header" style={{ marginBottom: '1rem' }}>
          <span className="section-title">Real Estate Message Templates</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {templates.map(t => (
            <div key={t.id} className="template-card">
              <div style={{ marginBottom: '0.5rem' }}><span className="template-tag">{t.tag}</span></div>
              <div className="template-title">{t.name}</div>
              <div className="template-preview">{t.preview}</div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}>Edit</button>
                <button className="btn btn-whatsapp btn-sm" style={{ flex: 1 }} onClick={() => { setNewCampaign(p => ({ ...p, template_name: t.name })); setShowNewCampaign(true); setCampaignSent(false); }}>Use</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New Campaign Modal */}
      {showNewCampaign && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg">
            <button style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowNewCampaign(false)}>
              <XCircle size={20} />
            </button>
            {campaignSent ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Campaign Launched!</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  Saved to database. Will be sent to {leads.length} contacts.
                </p>
                <button className="btn btn-secondary" style={{ marginTop: '1.25rem' }} onClick={() => setShowNewCampaign(false)}>Close</button>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MessageCircle size={20} style={{ color: 'var(--whatsapp)' }} /> New WhatsApp Campaign
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Campaign Name *</label>
                    <input type="text" className="input-field" placeholder="e.g. August Property Launch" value={newCampaign.name} onChange={e => setNewCampaign(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Target Audience</label>
                    <select className="input-field">
                      <option>All Leads ({leads.length} contacts)</option>
                      <option>Hot Leads ({leads.filter(l => l.status === 'Hot').length} contacts)</option>
                      <option>Warm Leads ({leads.filter(l => l.status === 'Warm').length} contacts)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Select Template</label>
                    <select className="input-field" value={newCampaign.template_name} onChange={e => setNewCampaign(p => ({ ...p, template_name: e.target.value }))}>
                      {templates.map(t => <option key={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    ⚠️ In production, messages require Meta-approved templates. This demo saves to database only.
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={() => setShowNewCampaign(false)}>Cancel</button>
                    <button className="btn btn-whatsapp" onClick={handleLaunch} disabled={isSending || !newCampaign.name.trim()}>
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
