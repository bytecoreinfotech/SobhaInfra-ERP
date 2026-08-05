import React, { useState, useEffect } from 'react';
import {
  MessageCircle, Mail, Phone, Plus, Search, Filter,
  X, CheckCircle2, Send, User, Building2, Star,
  ChevronRight, MoreVertical, RefreshCw
} from 'lucide-react';
import { getLeads, createLead, updateLead, deleteLead } from '../lib/db';
import './Pages.css';

const allLeads = [
  { id: 1, name: 'Rajesh Kumar', company: 'Global Traders Pvt. Ltd.', status: 'Hot Lead', phone: '+91 98765 43210', email: 'rajesh@globaltraders.in', value: '₹3,50,000', source: 'WhatsApp', lastContact: 'Today', stage: 'Negotiation', assigned: 'Priya S.' },
  { id: 2, name: 'Priya Sharma', company: 'Tech Innovators India', status: 'In Discussion', phone: '+91 87654 32109', email: 'priya@techinnovators.co', value: '₹1,80,000', source: 'Website', lastContact: 'Yesterday', stage: 'Proposal', assigned: 'Admin' },
  { id: 3, name: 'Amit Singh', company: 'BuildRight Construction', status: 'New', phone: '+91 76543 21098', email: 'amit@buildright.com', value: '₹5,20,000', source: 'Referral', lastContact: '2 days ago', stage: 'Contacted', assigned: 'Rajesh K.' },
  { id: 4, name: 'Sneha Patel', company: 'Patel Logistics Ltd.', status: 'Closed', phone: '+91 65432 10987', email: 'sneha@patellogistics.com', value: '₹2,10,000', source: 'Cold Call', lastContact: '1 week ago', stage: 'Closed Won', assigned: 'Admin' },
  { id: 5, name: 'Vikram Desai', company: 'Alpha Manufacturing', status: 'Hot Lead', phone: '+91 99887 76655', email: 'vikram@alphamfg.in', value: '₹8,50,000', source: 'LinkedIn', lastContact: '3 hr ago', stage: 'Demo', assigned: 'Priya S.' },
  { id: 6, name: 'Karan Mehta', company: 'Mehta Industries', status: 'New', phone: '+91 88776 65544', email: 'karan@mehtaind.com', value: '₹95,000', source: 'WhatsApp', lastContact: 'Just now', stage: 'New', assigned: 'Unassigned' },
];

const statusConfig = {
  'Hot Lead': 'badge-danger',
  'In Discussion': 'badge-warning',
  'Closed': 'badge-success',
  'New': 'badge-neutral',
};

const templates = [
  {
    id: 1, name: 'Follow Up – Product Pitch',
    body: `Hi {name},\n\nThank you for your interest in ERPPro! 🙏\n\nWe noticed you explored our platform and we'd love to schedule a personalized demo for you.\n\n📅 Are you available for a quick 15-min call this week?\n\nBest regards,\nTeam ERPPro`
  },
  {
    id: 2, name: 'Meeting Reminder',
    body: `Hi {name},\n\nThis is a friendly reminder about our scheduled meeting tomorrow. 📅\n\nLooking forward to connecting with you!\n\nTeam ERPPro`
  },
  {
    id: 3, name: 'Festival Discount Offer',
    body: `🎉 Special Offer for {name}!\n\nThis festive season, get 25% OFF on ERPPro Annual Plan!\n\n✅ WhatsApp CRM\n✅ Tally Integration\n✅ Unlimited Automations\n\nOffer valid till Aug 31. Reply YES to claim!\n\nTeam ERPPro`
  },
];

const CRM = () => {
  const [leads] = useState(allLeads);
  const [selectedLead, setSelectedLead] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]);
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);

  const filters = ['All', 'Hot Lead', 'In Discussion', 'New', 'Closed'];

  const filteredLeads = leads.filter(lead => {
    const matchSearch = lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.company.toLowerCase().includes(searchQuery.toLowerCase());
    const matchFilter = activeFilter === 'All' || lead.status === activeFilter;
    return matchSearch && matchFilter;
  });

  const handleSend = (e) => {
    e.preventDefault();
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setSentSuccess(true);
      setTimeout(() => { setSentSuccess(false); setSelectedLead(null); }, 2500);
    }, 1800);
  };

  const getPreviewBody = (lead) => {
    return selectedTemplate.body.replace(/{name}/g, lead?.name || 'there');
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Demo Banner */}
      <div className="demo-banner">
        <span className="demo-badge">DEMO</span>
        WhatsApp messages are simulated. In production, real messages will be sent via WhatsApp Business API (Meta).
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">CRM & Lead Management</h1>
          <p className="page-subtitle">{leads.length} total contacts · {leads.filter(l => l.status === 'Hot Lead').length} hot leads</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary"><Filter size={15} /> Filter</button>
          <button className="btn btn-whatsapp"><MessageCircle size={15} /> Bulk Broadcast</button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}><Plus size={15} /> Add Lead</button>
        </div>
      </div>

      {/* Filter Chips + Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div className="input-group" style={{ maxWidth: 300 }}>
          <Search size={15} className="input-icon" />
          <input
            type="text"
            placeholder="Search leads..."
            className="input-field"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="filter-bar">
          {filters.map(f => (
            <button
              key={f}
              className={`filter-chip ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f} {f !== 'All' && <span>({leads.filter(l => l.status === f).length})</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Lead Name</th>
              <th>Company</th>
              <th>Deal Value</th>
              <th>Status</th>
              <th>Stage</th>
              <th>Last Contact</th>
              <th>Assigned</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map(lead => (
              <tr key={lead.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div className="mini-avatar">{lead.name.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{lead.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{lead.phone}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                    <Building2 size={13} style={{ color: 'var(--text-muted)' }} />
                    {lead.company}
                  </div>
                </td>
                <td style={{ fontWeight: 700, color: 'var(--success)', fontSize: '0.875rem' }}>{lead.value}</td>
                <td><span className={`badge ${statusConfig[lead.status] || 'badge-neutral'}`}>{lead.status}</span></td>
                <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{lead.stage}</td>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{lead.lastContact}</td>
                <td style={{ fontSize: '0.82rem' }}>{lead.assigned}</td>
                <td>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      className="btn-icon"
                      title="Send WhatsApp"
                      onClick={() => setSelectedLead(lead)}
                      style={{ color: 'var(--whatsapp)' }}
                    >
                      <MessageCircle size={16} />
                    </button>
                    <button className="btn-icon" title="Send Email"><Mail size={16} /></button>
                    <button className="btn-icon" title="Call"><Phone size={16} /></button>
                    <button className="btn-icon" title="More"><MoreVertical size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredLeads.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <p>No leads match your search.</p>
          </div>
        )}
      </div>

      {/* WhatsApp Modal */}
      {selectedLead && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg">
            <button
              style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              onClick={() => { setSelectedLead(null); setSentSuccess(false); }}
            >
              <X size={20} />
            </button>

            {sentSuccess ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
                <CheckCircle2 size={64} style={{ color: 'var(--whatsapp)' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Message Sent! ✅</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  WhatsApp message delivered to <strong>{selectedLead.name}</strong> ({selectedLead.phone})<br />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Automated flow triggered · Demo simulation</span>
                </p>
              </div>
            ) : (
              <>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
                  <MessageCircle size={22} style={{ color: 'var(--whatsapp)' }} />
                  Send WhatsApp Message
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  {/* Left: config */}
                  <div>
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.875rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        <div className="mini-avatar" style={{ width: 36, height: 36, fontSize: '0.8rem' }}>{selectedLead.name.slice(0, 2).toUpperCase()}</div>
                        <div>
                          <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{selectedLead.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedLead.phone}</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>Select Template</label>
                      {templates.map(t => (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTemplate(t)}
                          style={{
                            padding: '0.65rem 0.875rem', marginBottom: '0.4rem', borderRadius: 'var(--radius-md)',
                            border: `1px solid ${selectedTemplate.id === t.id ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                            background: selectedTemplate.id === t.id ? 'rgba(99,102,241,0.05)' : 'var(--bg-tertiary)',
                            cursor: 'pointer', transition: 'var(--transition)',
                            fontSize: '0.82rem', color: 'var(--text-primary)'
                          }}
                        >
                          {t.name}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: preview */}
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
                      Message Preview
                    </label>
                    <div style={{
                      background: '#ECE5DD', borderRadius: 'var(--radius-md)', padding: '1rem',
                      minHeight: 200, position: 'relative'
                    }}>
                      <div style={{
                        background: 'white', borderRadius: '0 12px 12px 12px',
                        padding: '0.75rem', fontSize: '0.8rem', lineHeight: 1.6,
                        color: '#111', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        whiteSpace: 'pre-wrap', maxWidth: '90%'
                      }}>
                        {getPreviewBody(selectedLead)}
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '0.65rem', color: '#999', marginTop: '0.4rem' }}>10:34 AM ✓✓</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      🔒 Powered by WhatsApp Business API (Meta) · Demo Mode
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={() => setSelectedLead(null)}>Cancel</button>
                    <button
                      className="btn btn-whatsapp"
                      onClick={handleSend}
                      disabled={isSending}
                    >
                      <Send size={15} />
                      {isSending ? 'Sending...' : 'Send Message'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button
              style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              onClick={() => setShowAddModal(false)}
            >
              <X size={20} />
            </button>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Add New Lead</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Full Name *</label>
                <input type="text" className="input-field" placeholder="e.g. Rajesh Kumar" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Company</label>
                <input type="text" className="input-field" placeholder="e.g. Global Traders Pvt. Ltd." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Phone (WhatsApp)</label>
                  <input type="text" className="input-field" placeholder="+91 XXXXX XXXXX" />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Deal Value</label>
                  <input type="text" className="input-field" placeholder="₹0" />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Lead Source</label>
                <select className="input-field">
                  <option>WhatsApp</option>
                  <option>Website</option>
                  <option>Referral</option>
                  <option>LinkedIn</option>
                  <option>Cold Call</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => setShowAddModal(false)}>Add Lead</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CRM;
