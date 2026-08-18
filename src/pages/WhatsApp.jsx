import React, { useState, useEffect, useRef } from 'react';
import {
  MessageCircle, Send, Users, BarChart3, Plus,
  CheckCircle2, Clock, XCircle, FileText, Zap, RefreshCw,
  Search, User, Phone, Shield, Pause, Play, CheckCheck, Eye
} from 'lucide-react';
import {
  getCampaigns, getLeads,
  getWhatsAppConversations, getWhatsAppMessages, sendWhatsAppMessage,
  updateConversationMode, toggleLeadOptOut, normalizePhone
} from '../lib/db';
import Customer360Modal from '../components/Customer360Modal';
import CampaignBuilderModal from '../components/CampaignBuilderModal';
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
  const [activeTab, setActiveTab] = useState('inbox'); // 'inbox' | 'campaigns'
  
  // Live Inbox State
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState('');
  const [searchConv, setSearchConv] = useState('');
  const [convLoading, setConvLoading] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [selected360LeadId, setSelected360LeadId] = useState(null);

  // Campaigns State
  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCampaignBuilder, setShowCampaignBuilder] = useState(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (selectedConv) {
      loadMessages(selectedConv.id);
    }
  }, [selectedConv]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadAllData = async () => {
    setLoading(true);
    setConvLoading(true);
    const [cRes, lRes, convRes] = await Promise.all([
      getCampaigns(),
      getLeads(),
      getWhatsAppConversations(),
    ]);
    setCampaigns(cRes.data || []);
    setLeads(lRes.data || []);
    setConversations(convRes.data || []);
    if (convRes.data && convRes.data.length > 0 && !selectedConv) {
      setSelectedConv(convRes.data[0]);
    }
    setLoading(false);
    setConvLoading(false);
  };

  const loadMessages = async (convId) => {
    const res = await getWhatsAppMessages(convId);
    setMessages(res.data || []);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!msgInput.trim() || !selectedConv) return;
    setSendingMsg(true);
    const textToSend = msgInput;
    setMsgInput('');

    const { data: newMsg } = await sendWhatsAppMessage(selectedConv.id, textToSend, 'human_agent');
    if (newMsg) {
      setMessages(prev => [...prev, newMsg]);
      if (selectedConv.conversation_mode === 'AI ACTIVE') {
        handleModeChange('HUMAN ACTIVE');
      }
    }
    setSendingMsg(false);
  };

  const handleModeChange = async (newMode) => {
    if (!selectedConv) return;
    await updateConversationMode(selectedConv.id, newMode);
    setSelectedConv(prev => ({ ...prev, conversation_mode: newMode }));
    setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, conversation_mode: newMode } : c));
  };

  const totalSent = campaigns.reduce((s, c) => s + (c.total_sent || 0), 0);
  const totalDelivered = campaigns.reduce((s, c) => s + (c.delivered || 0), 0);
  const totalRead = campaigns.reduce((s, c) => s + (c.read_count || 0), 0);
  const totalReplied = campaigns.reduce((s, c) => s + (c.replied || 0), 0);
  const readRate = totalSent > 0 ? ((totalRead / totalSent) * 100).toFixed(1) : '0.0';

  const filteredConversations = conversations.filter(c => {
    if (!searchConv) return true;
    const s = searchConv.toLowerCase();
    return c.contact_name?.toLowerCase().includes(s) || c.contact_phone?.includes(s) || c.last_message_text?.toLowerCase().includes(s);
  });

  return (
    <div className="page-container animate-fade-in">
      {/* Banner */}
      <div className="demo-banner">
        <span className="demo-badge">WHATSAPP CLOUD API</span>
        Meta Cloud API integration with live 3-pane inbox, human takeover mode switching, and bulk campaign broadcaster.
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">WhatsApp Center</h1>
          <p className="page-subtitle">Live customer conversations, AI sales assistant takeover, and broadcast campaigns.</p>
        </div>
        <div className="page-actions">
          {/* Tab navigation */}
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button
              className="btn"
              onClick={() => setActiveTab('inbox')}
              style={{
                borderRadius: 0,
                background: activeTab === 'inbox' ? 'var(--whatsapp)' : 'var(--bg-tertiary)',
                color: activeTab === 'inbox' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <MessageCircle size={15} /> Live Inbox ({conversations.length})
            </button>
            <button
              className="btn"
              onClick={() => setActiveTab('campaigns')}
              style={{
                borderRadius: 0,
                background: activeTab === 'campaigns' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'campaigns' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <Send size={15} /> Broadcast Campaigns
            </button>
          </div>

          <button className="btn btn-secondary" onClick={loadAllData}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {activeTab === 'campaigns' && (
            <button className="btn btn-whatsapp" onClick={() => setShowCampaignBuilder(true)}>
              <Plus size={15} /> New Campaign
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          TAB 1: 3-PANE LIVE INBOX
         ========================================================================= */}
      {activeTab === 'inbox' && (
        <div className="glass-card" style={{ display: 'grid', gridTemplateColumns: '300px 1fr 280px', height: '640px', overflow: 'hidden', padding: 0 }}>
          
          {/* PANE 1: CONVERSATIONS LIST */}
          <div style={{ borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)' }}>
            <div style={{ padding: '0.85rem', borderBottom: '1px solid var(--border-color)' }}>
              <div className="input-group">
                <Search size={14} className="input-icon" />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search chats..."
                  style={{ fontSize: '0.8rem', padding: '0.5rem 0.5rem 0.5rem 2rem' }}
                  value={searchConv}
                  onChange={e => setSearchConv(e.target.value)}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {convLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}><RefreshCw size={20} className="animate-spin" /></div>
              ) : filteredConversations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No conversations found.</div>
              ) : (
                filteredConversations.map(c => {
                  const isSelected = selectedConv?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedConv(c)}
                      style={{
                        padding: '0.85rem 1rem',
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
                        borderLeft: isSelected ? '3px solid var(--accent-primary)' : '3px solid transparent',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{c.contact_name}</div>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          {new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.4rem' }}>
                        {c.last_message_text}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span
                          className="badge"
                          style={{
                            fontSize: '0.6rem',
                            background: c.conversation_mode === 'AI ACTIVE' ? 'rgba(16,185,129,0.15)' : c.conversation_mode === 'HUMAN ACTIVE' ? 'rgba(99,102,241,0.15)' : 'rgba(245,158,11,0.15)',
                            color: c.conversation_mode === 'AI ACTIVE' ? 'var(--success)' : c.conversation_mode === 'HUMAN ACTIVE' ? 'var(--accent-primary)' : 'var(--warning)',
                          }}
                        >
                          {c.conversation_mode === 'AI ACTIVE' ? '🤖 AI Active' : c.conversation_mode === 'HUMAN ACTIVE' ? '👤 Human Active' : '⏸️ AI Paused'}
                        </span>
                        {c.unread_count > 0 && (
                          <span className="badge badge-danger" style={{ fontSize: '0.6rem', borderRadius: 99, padding: '0.1rem 0.4rem' }}>
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* PANE 2: ACTIVE CHAT THREAD */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
            {selectedConv ? (
              <>
                {/* Chat Top bar */}
                <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {selectedConv.contact_name}
                      <span className="badge badge-whatsapp" style={{ fontSize: '0.65rem' }}>WhatsApp</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {selectedConv.contact_phone} · {selectedConv.property_interest || 'General'}
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelected360LeadId(selectedConv.lead_id || 'lead-1')}
                  >
                    <Eye size={13} /> View 360 Profile
                  </button>
                </div>

                {/* Messages List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {messages.map(m => {
                    const isOutbound = m.direction === 'outbound';
                    return (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: isOutbound ? 'flex-end' : 'flex-start',
                          maxWidth: '75%',
                          padding: '0.75rem 1rem',
                          borderRadius: 12,
                          background: isOutbound
                            ? m.sender_type === 'ai' ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.18)'
                            : 'var(--bg-tertiary)',
                          border: `1px solid ${isOutbound ? (m.sender_type === 'ai' ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)') : 'var(--border-color)'}`,
                          fontSize: '0.82rem',
                          position: 'relative',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                          <span>
                            {m.sender_type === 'customer' ? selectedConv.contact_name : m.sender_type === 'ai' ? '🤖 AI Sales Assistant' : '👤 Sales Executive (Rajesh)'}
                          </span>
                          <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{m.body}</div>
                        {isOutbound && (
                          <div style={{ textAlign: 'right', marginTop: '0.2rem' }}>
                            <CheckCheck size={12} color="var(--accent-secondary)" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Chat Composer */}
                <form onSubmit={handleSendMessage} style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="input-field"
                    placeholder={`Reply as human agent to ${selectedConv.contact_name}...`}
                    value={msgInput}
                    onChange={e => setMsgInput(e.target.value)}
                  />
                  <button type="submit" className="btn btn-whatsapp" disabled={sendingMsg || !msgInput.trim()}>
                    <Send size={15} /> Send
                  </button>
                </form>
              </>
            ) : (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
                Select a conversation from the left pane.
              </div>
            )}
          </div>

          {/* PANE 3: CUSTOMER CONTEXT & MODE SWITCHER */}
          <div style={{ borderLeft: '1px solid var(--border-color)', background: 'var(--bg-secondary)', padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {selectedConv ? (
              <>
                <div>
                  <span className="section-title" style={{ fontSize: '0.85rem' }}>Conversation Mode</span>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.25rem 0 0.75rem 0' }}>
                    Take over to silence automated AI replies or resume AI assistance.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <button
                      className={`btn btn-sm ${selectedConv.conversation_mode === 'HUMAN ACTIVE' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ width: '100%', justifyContent: 'flex-start' }}
                      onClick={() => handleModeChange('HUMAN ACTIVE')}
                    >
                      <User size={13} /> Take Over (Human Active)
                    </button>
                    <button
                      className={`btn btn-sm ${selectedConv.conversation_mode === 'AI ACTIVE' ? 'btn-success' : 'btn-secondary'}`}
                      style={{ width: '100%', justifyContent: 'flex-start' }}
                      onClick={() => handleModeChange('AI ACTIVE')}
                    >
                      <Play size={13} /> Resume AI Assistant
                    </button>
                    <button
                      className={`btn btn-sm ${selectedConv.conversation_mode === 'AI PAUSED' ? 'btn-warning' : 'btn-secondary'}`}
                      style={{ width: '100%', justifyContent: 'flex-start' }}
                      onClick={() => handleModeChange('AI PAUSED')}
                    >
                      <Pause size={13} /> Pause AI
                    </button>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <span className="section-title" style={{ fontSize: '0.85rem' }}>Customer Context</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.6rem', fontSize: '0.78rem' }}>
                    <div><span className="text-muted">Assigned Rep:</span> <strong>{selectedConv.assigned_salesperson || 'Rajesh Kumar'}</strong></div>
                    <div><span className="text-muted">Interest:</span> <strong>{selectedConv.property_interest || '3BHK - Andheri'}</strong></div>
                    <div><span className="text-muted">Phone:</span> <strong>{selectedConv.contact_phone}</strong></div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <span className="section-title" style={{ fontSize: '0.85rem' }}>Consent & Opt-Out</span>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.2rem 0 0.5rem 0' }}>
                    Customer is eligible for campaign broadcasts.
                  </p>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}
                    onClick={() => toggleLeadOptOut(selectedConv.lead_id || 'lead-1', true, 'Manual agent request')}
                  >
                    Opt-Out Contact (STOP)
                  </button>
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>No contact selected</div>
            )}
          </div>

        </div>
      )}

      {/* =========================================================================
          TAB 2: BROADCAST CAMPAIGNS & TEMPLATES
         ========================================================================= */}
      {activeTab === 'campaigns' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
          <div className="glass-card">
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <span className="section-title">Campaign Broadcast History</span>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr><th>Campaign Name</th><th>Status</th><th>Targeted</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Replied</th><th>Template</th></tr>
                </thead>
                <tbody>
                  {campaigns.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No campaigns launched yet.</td></tr>}
                  {campaigns.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td><span className={`badge ${statusConfig[c.status]}`}>{c.status}</span></td>
                      <td>{(c.total_targeted || c.total_sent || 0).toLocaleString()}</td>
                      <td style={{ fontWeight: 700 }}>{(c.total_sent || 0).toLocaleString()}</td>
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

          {/* Templates Library */}
          <div>
            <div className="section-header" style={{ marginBottom: '1rem' }}>
              <span className="section-title">Meta-Approved Message Templates</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              {templates.map(t => (
                <div key={t.id} className="template-card">
                  <div style={{ marginBottom: '0.5rem' }}><span className="template-tag">{t.tag}</span></div>
                  <div className="template-title">{t.name}</div>
                  <div className="template-preview">{t.preview}</div>
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-whatsapp btn-sm" style={{ width: '100%' }} onClick={() => setShowCampaignBuilder(true)}>
                      Launch Broadcast
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Campaign Builder Modal */}
      {showCampaignBuilder && (
        <CampaignBuilderModal
          isOpen={showCampaignBuilder}
          onClose={() => setShowCampaignBuilder(false)}
          onCampaignQueued={loadAllData}
        />
      )}

      {/* Customer 360 Modal link from Live Inbox */}
      {selected360LeadId && (
        <Customer360Modal
          leadId={selected360LeadId}
          onClose={() => setSelected360LeadId(null)}
          onLeadUpdated={loadAllData}
        />
      )}
    </div>
  );
};

export default WhatsApp;
