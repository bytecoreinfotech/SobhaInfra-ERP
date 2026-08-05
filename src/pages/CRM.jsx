import React, { useState, useEffect } from 'react';
import {
  MessageCircle, Mail, Phone, Plus, Search, Filter,
  X, CheckCircle2, Send, User, Building2, Star,
  ChevronRight, MoreVertical, RefreshCw, Trash2, Edit2
} from 'lucide-react';
import { getLeads, createLead, updateLead, deleteLead } from '../lib/db';
import './Pages.css';

const statusConfig = {
  Hot:       { badge: 'badge-danger',   dot: '#ef4444' },
  Warm:      { badge: 'badge-warning',  dot: '#f59e0b' },
  New:       { badge: 'badge-neutral',  dot: '#94a3b8' },
  Cold:      { badge: 'badge-neutral',  dot: '#64748b' },
  Converted: { badge: 'badge-success',  dot: '#10b981' },
  Lost:      { badge: 'badge-neutral',  dot: '#475569' },
};

const sourceColors = {
  WhatsApp:  '#25d366', Facebook: '#1877f2', Instagram: '#e1306c',
  Website:   '#6366f1', Referral: '#f59e0b', 'Walk-in': '#10b981',
};

const EMPTY_LEAD = { name: '', phone: '', email: '', source: 'WhatsApp', status: 'New', property_interest: '', budget: '', notes: '' };

const CRM = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editLead, setEditLead] = useState(null);
  const [form, setForm] = useState(EMPTY_LEAD);
  const [saving, setSaving] = useState(false);
  const [showWA, setShowWA] = useState(null);
  const [chatMsg, setChatMsg] = useState('');
  const [chatSent, setChatSent] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('Hi {name}, just checking in about your property interest. Can we schedule a site visit?');

  useEffect(() => { loadLeads(); }, []);

  const loadLeads = async () => {
    setLoading(true);
    const { data } = await getLeads();
    setLeads(data || []);
    setLoading(false);
  };

  const filtered = leads.filter(l => {
    const matchFilter = activeFilter === 'All' || l.status === activeFilter;
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.phone?.includes(search) || l.property_interest?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const openAdd = () => { setForm(EMPTY_LEAD); setEditLead(null); setShowForm(true); };
  const openEdit = (lead) => { setForm({ name: lead.name, phone: lead.phone || '', email: lead.email || '', source: lead.source, status: lead.status, property_interest: lead.property_interest || '', budget: lead.budget || '', notes: lead.notes || '' }); setEditLead(lead); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    if (editLead) {
      const { data } = await updateLead(editLead.id, form);
      if (data) setLeads(prev => prev.map(l => l.id === editLead.id ? { ...l, ...form } : l));
    } else {
      const { data } = await createLead(form);
      if (data) setLeads(prev => [data, ...prev]);
    }
    setSaving(false);
    setShowForm(false);
    setEditLead(null);
  };

  const handleDelete = async (id) => {
    await deleteLead(id);
    setLeads(prev => prev.filter(l => l.id !== id));
  };

  const handleSendWA = () => {
    setChatSent(true);
    setTimeout(() => { setChatSent(false); setShowWA(null); setChatMsg(''); }, 2000);
  };

  const filters = ['All', 'Hot', 'Warm', 'New', 'Cold', 'Converted'];
  const counts = filters.reduce((acc, f) => ({ ...acc, [f]: f === 'All' ? leads.length : leads.filter(l => l.status === f).length }), {});

  const waTemplates = [
    'Hi {name}, just checking in about your property interest. Can we schedule a site visit?',
    '🏠 Hi {name}! We have a new listing that matches your requirement ({property}). Interested?',
    'Dear {name}, your booking advance of {amount} is due. Please clear at the earliest.',
    '📅 Hi {name}, your site visit is confirmed for tomorrow at 11 AM. See you there!',
  ];

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">CRM & Leads</h1>
          <p className="page-subtitle">Real Estate lead pipeline — {leads.length} contacts total</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={loadLeads}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={15} /> Add Lead</button>
        </div>
      </div>

      {/* Pipeline Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
        {filters.slice(1).map(f => (
          <div key={f} className="glass-card" style={{ padding: '1rem', textAlign: 'center', cursor: 'pointer', border: activeFilter === f ? `2px solid ${statusConfig[f]?.dot}` : '1px solid var(--border-color)', transition: 'all 0.2s' }} onClick={() => setActiveFilter(activeFilter === f ? 'All' : f)}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: statusConfig[f]?.dot, fontFamily: 'Outfit, sans-serif' }}>{counts[f]}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{f}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div className="input-group" style={{ flex: 1, minWidth: 200 }}>
          <Search size={15} className="input-icon" />
          <input type="text" className="input-field" placeholder="Search by name, phone, property..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="filter-bar" style={{ margin: 0 }}>
          {filters.map(f => (
            <button key={f} className={`filter-chip ${activeFilter === f ? 'active' : ''}`} onClick={() => setActiveFilter(f)}>
              {f} <span style={{ opacity: 0.7, fontSize: '0.68rem' }}>({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" />
        </div>
      )}

      {/* Leads Table */}
      {!loading && (
        <div className="glass-card table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Property Interest</th>
                <th>Budget</th>
                <th>Source</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No leads found</td></tr>
              )}
              {filtered.map(lead => (
                <tr key={lead.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div className="mini-avatar" style={{ background: `${statusConfig[lead.status]?.dot}22`, color: statusConfig[lead.status]?.dot, border: `1.5px solid ${statusConfig[lead.status]?.dot}` }}>
                        {lead.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{lead.name}</div>
                        {lead.notes && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.notes}</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      {lead.phone && <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Phone size={11} color="var(--text-muted)" />{lead.phone}</div>}
                      {lead.email && <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Mail size={11} color="var(--text-muted)" />{lead.email}</div>}
                    </div>
                  </td>
                  <td><span className={`badge ${statusConfig[lead.status]?.badge}`}>{lead.status}</span></td>
                  <td style={{ fontSize: '0.82rem', maxWidth: 180 }}>{lead.property_interest || '—'}</td>
                  <td style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--success)' }}>{lead.budget || '—'}</td>
                  <td>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: sourceColors[lead.source] || 'var(--text-muted)', background: (sourceColors[lead.source] || '#666') + '18', padding: '0.2rem 0.5rem', borderRadius: 99 }}>
                      {lead.source}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button className="btn-icon" title="Send WhatsApp" onClick={() => { setShowWA(lead); setChatMsg(''); setChatSent(false); }}><MessageCircle size={14} style={{ color: 'var(--whatsapp)' }} /></button>
                      <button className="btn-icon" title="Edit" onClick={() => openEdit(lead)}><Edit2 size={14} /></button>
                      <button className="btn-icon" title="Delete" onClick={() => handleDelete(lead.id)}><Trash2 size={14} style={{ color: 'var(--danger)' }} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Lead Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg">
            <button style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowForm(false)}><X size={20} /></button>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem' }}>{editLead ? 'Edit Lead' : 'Add New Lead'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {[
                { label: 'Full Name *', key: 'name', type: 'text', placeholder: 'e.g. Ravi Mehta' },
                { label: 'Phone Number', key: 'phone', type: 'text', placeholder: '+91 XXXXX XXXXX' },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'email@example.com' },
                { label: 'Budget', key: 'budget', type: 'text', placeholder: '₹50L - ₹80L' },
                { label: 'Property Interest', key: 'property_interest', type: 'text', placeholder: '3BHK - Andheri West' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>{f.label}</label>
                  <input type={f.type} className="input-field" placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Source</label>
                <select className="input-field" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}>
                  {['WhatsApp','Facebook','Instagram','Website','Walk-in','Referral'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Status</label>
                <select className="input-field" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  {['New','Hot','Warm','Cold','Converted','Lost'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Notes</label>
              <textarea className="input-field textarea-field" rows={2} placeholder="Any important details..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving...' : editLead ? 'Update Lead' : 'Add Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Quick Message Modal */}
      {showWA && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowWA(null)}><X size={20} /></button>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageCircle size={18} style={{ color: 'var(--whatsapp)' }} /> Send WhatsApp
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>To: <strong>{showWA.name}</strong> · {showWA.phone}</p>

            {chatSent ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ fontSize: '2.5rem' }}>✅</div>
                <p style={{ color: 'var(--success)', fontWeight: 600, marginTop: '0.5rem' }}>Message Sent!</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Demo: No actual message sent</p>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Quick Template</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {waTemplates.map((t, i) => (
                      <div key={i} onClick={() => setSelectedTemplate(t)} style={{ padding: '0.6rem 0.875rem', borderRadius: 8, background: selectedTemplate === t ? 'rgba(99,102,241,0.1)' : 'var(--bg-tertiary)', border: `1px solid ${selectedTemplate === t ? 'var(--accent-primary)' : 'var(--border-color)'}`, cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {t.replace('{name}', showWA.name).replace('{property}', showWA.property_interest || '2BHK').replace('{amount}', showWA.budget || '₹50,000')}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Custom Message</label>
                  <textarea className="input-field textarea-field" rows={3} placeholder="Type a custom message..." value={chatMsg} onChange={e => setChatMsg(e.target.value)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                  <button className="btn btn-secondary" onClick={() => setShowWA(null)}>Cancel</button>
                  <button className="btn btn-whatsapp" onClick={handleSendWA}><Send size={14} /> Send via WhatsApp</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CRM;
