import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, User, MessageCircle, Phone, Mail, FileText, CheckCircle2,
  Clock, IndianRupee, Send, AlertTriangle, Shield, Building2,
  TrendingUp, Calendar, Tag, ChevronRight, Plus, RefreshCw, Zap,
  Paperclip, UploadCloud, Image, Film, Music, FileIcon
} from 'lucide-react';
import { getCustomer360, addCustomerNote, createDeal, logPaymentReminder, sendWhatsAppMessage, updateConversationMode, deleteWhatsAppMessage, clearWhatsAppChat } from '../lib/db';
import { uploadToWhatsAppMedia, getWhatsAppMediaType, parseMessageMedia } from '../lib/storage';
import './Customer360Modal.css';

const Customer360Modal = ({ leadId, onClose, onLeadUpdated }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  
  // Deal Form
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [dealForm, setDealForm] = useState({ title: '', value: '', stage: 'Quotation', expected_close_date: '' });
  const [savingDeal, setSavingDeal] = useState(false);

  // Quick Message
  const [replyText, setReplyText] = useState('');
  const [msgSent, setMsgSent] = useState(null);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [togglingMode, setTogglingMode] = useState(false);

  // File attachment (local file → Supabase Storage → WhatsApp URL)
  const [attachedFile, setAttachedFile] = useState(null);      // File object
  const [attachedPreview, setAttachedPreview] = useState(null); // data URL for image preview
  const [uploadProgress, setUploadProgress] = useState(0);      // 0-100
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Message management
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [clearingChat, setClearingChat] = useState(false);

  useEffect(() => {
    if (leadId) load360Data();
  }, [leadId]);

  // Real-time message polling every 3 seconds when WhatsApp tab is active
  useEffect(() => {
    if (!leadId || activeTab !== 'whatsapp') return;
    const interval = setInterval(async () => {
      const res = await getCustomer360(leadId);
      if (res.data?.messages) {
        setData(prev => {
          if (!prev) return res.data;
          // Only update if message count changed to prevent flicker
          if ((prev.messages || []).length !== (res.data.messages || []).length) {
            return { ...prev, messages: res.data.messages, conv: res.data.conv || prev.conv };
          }
          return prev;
        });
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [leadId, activeTab]);

  const load360Data = async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await getCustomer360(leadId);
    if (res.data) setData(res.data);
    if (!silent) setLoading(false);
  };

  const handleToggleMode = async () => {
    const convId = data?.conv?.id;
    if (!convId || togglingMode) return;
    setTogglingMode(true);
    const currentMode = data?.conv?.conversation_mode || 'AI ACTIVE';
    const nextMode = currentMode === 'AI ACTIVE' ? 'HUMAN ACTIVE' : 'AI ACTIVE';
    
    await updateConversationMode(convId, nextMode);
    setData(prev => ({
      ...prev,
      conv: { ...(prev?.conv || {}), conversation_mode: nextMode }
    }));
    setTogglingMode(false);
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    const { data: newAct } = await addCustomerNote(leadId, noteText);
    if (newAct) {
      setData(prev => ({
        ...prev,
        activities: [newAct, ...(prev.activities || [])],
      }));
      setNoteText('');
    }
    setSavingNote(false);
  };

  const handleCreateDeal = async (e) => {
    e.preventDefault();
    if (!dealForm.title.trim()) return;
    setSavingDeal(true);
    const { data: newDeal } = await createDeal({
      ...dealForm,
      lead_id: leadId,
      value: Number(dealForm.value || 0),
    });
    if (newDeal) {
      setData(prev => ({
        ...prev,
        deals: [newDeal, ...(prev.deals || [])],
      }));
      setShowAddDeal(false);
      setDealForm({ title: '', value: '', stage: 'Quotation', expected_close_date: '' });
    }
    setSavingDeal(false);
  };

  // ── File attachment handlers ──────────────────────────────────────────────
  const handleFileSelect = useCallback((file) => {
    if (!file) return;
    setAttachedFile(file);
    setUploadProgress(0);
    // Generate preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setAttachedPreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setAttachedPreview(null);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);

  const clearAttachment = () => {
    setAttachedFile(null);
    setAttachedPreview(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Send message handler ──────────────────────────────────────────────────
  const handleSendQuickMsg = async (e) => {
    e.preventDefault();
    const hasText = replyText.trim();
    if ((!hasText && !attachedFile) || sendingMsg) return;
    setSendingMsg(true);
    const textToSend = replyText;
    const phoneToUse = data?.lead?.phone;
    const convId = data?.conv?.id || null;

    let mUrl = null;
    let mType = 'text';

    try {
      // Upload file to Supabase Storage if attached
      if (attachedFile) {
        setMsgSent({ success: true, text: '⬆ Uploading file to storage...' });
        mUrl = await uploadToWhatsAppMedia(attachedFile, 'crm', setUploadProgress);
        mType = getWhatsAppMediaType(attachedFile);
      }

      const res = await sendWhatsAppMessage(convId, textToSend, 'human_agent', phoneToUse, mType, mUrl, attachedFile?.name || null);
      setReplyText('');
      clearAttachment();

      // Immediately reload from DB so message persists after modal close/reopen
      const refreshed = await getCustomer360(leadId);
      if (refreshed.data) {
        setData(prev => ({
          ...prev,
          conv: refreshed.data.conv || prev?.conv,
          messages: refreshed.data.messages || prev?.messages || [],
        }));
      } else {
        const newMsg = {
          id: 'msg-' + Date.now(),
          direction: 'outbound',
          sender_type: 'human_agent',
          body: textToSend,
          created_at: new Date().toISOString(),
        };
        setData(prev => ({ ...prev, messages: [...(prev.messages || []), newMsg] }));
      }

      if (res.error) {
        setMsgSent({ success: false, text: 'Logged (WhatsApp API warning: ' + (res.error.message || 'Check credentials') + ')' });
      } else {
        setMsgSent({ success: true, text: `✓ ${attachedFile ? 'File + message' : 'Message'} sent to WhatsApp (${phoneToUse})` });
      }
      setTimeout(() => setMsgSent(null), 4000);
    } catch (err) {
      setMsgSent({ success: false, text: 'Failed: ' + err.message });
      setTimeout(() => setMsgSent(null), 4000);
    }
    setSendingMsg(false);
  };

  const handleDeleteMessage = async (messageId) => {
    await deleteWhatsAppMessage(messageId);
    setData(prev => ({ ...prev, messages: (prev.messages || []).filter(m => m.id !== messageId) }));
  };

  const handleClearChat = async () => {
    if (!data?.conv?.id) return;
    if (!window.confirm('Clear all messages in this chat? This only removes them from CRM view, not from WhatsApp.')) return;
    setClearingChat(true);
    await clearWhatsAppChat(data.conv.id);
    setData(prev => ({ ...prev, messages: [] }));
    setClearingChat(false);
  };


  const fmtCurrency = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

  if (!leadId) return null;

  return (
    <div className="c360-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="c360-container animate-fade-in">
        {/* Top bar */}
        <div className="c360-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div className="c360-avatar">
              {data?.lead?.name ? data.lead.name.slice(0, 2).toUpperCase() : 'C'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 className="c360-title">{data?.lead?.name || 'Customer 360'}</h2>
                {data?.lead?.status && (
                  <span className={`badge ${data.lead.status === 'Hot' ? 'badge-danger' : data.lead.status === 'Converted' ? 'badge-success' : 'badge-warning'}`}>
                    {data.lead.status}
                  </span>
                )}
                {data?.lead?.lead_score !== undefined && (
                  <span className="badge badge-accent" title="AI Qualification Score">
                    ⚡ Score: {data.lead.lead_score}/100
                  </span>
                )}
              </div>
              <div className="c360-subtitle">
                <span>{data?.lead?.phone}</span>
                {data?.lead?.email && <span> · {data.lead.email}</span>}
                <span> · Source: <strong>{data?.lead?.source}</strong></span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={load360Data} title="Refresh 360 Profile">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              title="Close Customer 360"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-secondary)'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="c360-tabs">
          {[
            { id: 'overview', label: 'Overview & AI Insights', icon: <Zap size={14} /> },
            { id: 'whatsapp', label: `WhatsApp Thread (${data?.messages?.length || 0})`, icon: <MessageCircle size={14} /> },
            { id: 'deals', label: `Deals & Quotes (${(data?.deals?.length || 0) + (data?.quotations?.length || 0)})`, icon: <TrendingUp size={14} /> },
            { id: 'finance', label: `Tally Invoices (${data?.invoices?.length || 0})`, icon: <IndianRupee size={14} /> },
            { id: 'timeline', label: `Activity & Notes (${data?.activities?.length || 0})`, icon: <Clock size={14} /> },
          ].map(t => (
            <button
              key={t.id}
              className={`c360-tab-btn ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="c360-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
              <RefreshCw size={28} className="animate-spin" />
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW & AI INSIGHTS */}
              {activeTab === 'overview' && (
                <div className="c360-overview-grid">
                  {/* Left Column: Quick Profile */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="c360-card">
                      <div className="c360-card-title">Lead Attributes</div>
                      <div className="c360-field-list">
                        <div><span className="text-muted">Property Interest:</span> <strong>{data.lead.property_interest || '—'}</strong></div>
                        <div><span className="text-muted">Target Budget:</span> <strong style={{ color: 'var(--success)' }}>{data.lead.budget || '—'}</strong></div>
                        <div><span className="text-muted">Opt-in Status:</span> <strong>{data.lead.marketing_opt_out ? '❌ Opted Out' : '✅ Active Opt-in'}</strong></div>
                        <div><span className="text-muted">First Touch Campaign:</span> <strong>{data.lead.first_touch_campaign || 'Direct / Organic'}</strong></div>
                        <div><span className="text-muted">Last Touch Campaign:</span> <strong>{data.lead.last_touch_campaign || '—'}</strong></div>
                        <div><span className="text-muted">Created Date:</span> <span>{new Date(data.lead.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="c360-card">
                      <div className="c360-card-title">Tally Financial Pulse</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', textAlign: 'center' }}>
                        <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: data.financials.totalOutstanding > 0 ? 'var(--danger)' : 'var(--success)' }}>
                            {fmtCurrency(data.financials.totalOutstanding)}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total Outstanding</div>
                        </div>
                        <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)' }}>
                            {fmtCurrency(data.financials.totalPaid)}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total Cleared</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: AI Handoff & Qualification Card */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="c360-card" style={{ border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.04)' }}>
                      <div className="c360-card-title" style={{ color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Zap size={16} /> AI Sales Qualification Card
                      </div>
                      <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                        {data.lead.notes || 'Lead in active discovery. AI has identified product preference.'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem' }}>
                        <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: 6 }}>
                          🎯 <strong>Recommended Next Action:</strong> Call customer to discuss custom payment plan.
                        </div>
                        <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: 6 }}>
                          💬 <strong>Price Objection:</strong> Rate review requested for 50% immediate down-payment.
                        </div>
                      </div>
                    </div>

                    {/* Quick Add Internal Note */}
                    <div className="c360-card">
                      <div className="c360-card-title">Add Internal Sales Note</div>
                      <form onSubmit={handleAddNote}>
                        <textarea
                          className="input-field textarea-field"
                          rows={2}
                          placeholder="Log site visit outcome, phone call notes, or follow-up details..."
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                          <button type="submit" className="btn btn-primary btn-sm" disabled={savingNote || !noteText.trim()}>
                            {savingNote ? 'Saving...' : 'Post Note'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: WHATSAPP THREAD */}
              {activeTab === 'whatsapp' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '460px' }}>
                  {/* Mode bar + Clear Chat */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', padding: '0.4rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`badge ${data.conv?.conversation_mode === 'AI ACTIVE' ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.7rem' }}>
                        ● {data.conv?.conversation_mode === 'AI ACTIVE' ? '🤖 AI Bot Active' : '👤 Human Mode Active'}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {data.conv?.conversation_mode === 'AI ACTIVE' ? '(AI auto-replies)' : '(Human has control)'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {data.conv?.id && (data.messages?.length > 0) && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={handleClearChat}
                          disabled={clearingChat}
                          style={{ fontSize: '0.65rem', padding: '0.18rem 0.45rem', color: 'var(--warning)' }}
                          title="Clear CRM chat history (does not delete from WhatsApp)"
                        >
                          {clearingChat ? '...' : '🗑 Clear Chat'}
                        </button>
                      )}
                      {data.conv?.id && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={handleToggleMode}
                          disabled={togglingMode}
                          style={{ fontSize: '0.65rem', padding: '0.18rem 0.45rem' }}
                        >
                          {data.conv?.conversation_mode === 'AI ACTIVE' ? '👤 Human Mode' : '🤖 AI Mode'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Message list */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {(!data.messages || data.messages.length === 0) ? (
                      <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No WhatsApp conversations logged yet for this contact.
                      </div>
                    ) : (
                      data.messages.map(m => (
                        <div
                          key={m.id}
                          style={{ alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start', maxWidth: '78%', position: 'relative' }}
                          onMouseEnter={() => setHoveredMsgId(m.id)}
                          onMouseLeave={() => setHoveredMsgId(null)}
                        >
                          {/* Delete button on hover */}
                          {hoveredMsgId === m.id && (
                            <button
                              onClick={() => handleDeleteMessage(m.id)}
                              style={{
                                position: 'absolute', top: -8,
                                right: m.direction === 'outbound' ? 0 : 'auto',
                                left: m.direction === 'inbound' ? 0 : 'auto',
                                background: 'var(--danger, #ef4444)', color: '#fff',
                                border: 'none', borderRadius: 999, width: 18, height: 18,
                                cursor: 'pointer', fontSize: '0.6rem', lineHeight: '18px', textAlign: 'center', zIndex: 10,
                              }}
                              title="Delete from CRM (not from WhatsApp)"
                            >✕</button>
                          )}
                          <div style={{
                            padding: '0.6rem 0.9rem',
                            borderRadius: 12,
                            background: m.direction === 'outbound' ? 'rgba(99,102,241,0.2)' : 'var(--bg-tertiary)',
                            border: `1px solid ${m.direction === 'outbound' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                            fontSize: '0.82rem',
                          }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                              {m.sender_type === 'customer' ? data.lead.name : m.sender_type === 'ai' ? '🤖 AI Sales Assistant' : '👤 Sales Agent'}
                              {' · '}{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {m.status === 'failed' && <span style={{ color: 'var(--danger, #ef4444)', marginLeft: 4 }}>✕ Failed</span>}
                            </div>

                            {/* Smart Media & Text Rendering */}
                            {(() => {
                              const { text: cleanText, mediaUrl, mediaType } = parseMessageMedia(m);
                              return (
                                <>
                                  {/* Image preview */}
                                  {mediaUrl && mediaType === 'image' && (
                                    <div style={{ marginBottom: cleanText ? '0.45rem' : 0 }}>
                                      <a href={mediaUrl} target="_blank" rel="noopener noreferrer" title="Click to view full image">
                                        <img
                                          src={mediaUrl}
                                          alt="WhatsApp shared image"
                                          style={{
                                            maxWidth: '100%',
                                            maxHeight: 280,
                                            borderRadius: 8,
                                            display: 'block',
                                            cursor: 'pointer',
                                            objectFit: 'contain',
                                            background: 'rgba(0,0,0,0.15)',
                                            border: '1px solid rgba(255,255,255,0.08)'
                                          }}
                                          onError={e => { e.target.style.display = 'none'; }}
                                        />
                                      </a>
                                    </div>
                                  )}

                                  {/* Video preview */}
                                  {mediaUrl && mediaType === 'video' && (
                                    <div style={{ marginBottom: cleanText ? '0.45rem' : 0 }}>
                                      <video controls style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8, display: 'block' }}>
                                        <source src={mediaUrl} />
                                      </video>
                                    </div>
                                  )}

                                  {/* Audio preview */}
                                  {mediaUrl && mediaType === 'audio' && (
                                    <div style={{ marginBottom: cleanText ? '0.45rem' : 0 }}>
                                      <audio controls style={{ width: '100%', minWidth: 200 }}>
                                        <source src={mediaUrl} />
                                      </audio>
                                    </div>
                                  )}

                                  {/* Document preview */}
                                  {mediaUrl && mediaType === 'document' && (
                                    <div style={{ marginBottom: cleanText ? '0.45rem' : 0 }}>
                                      <a
                                        href={mediaUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.4rem',
                                          padding: '0.35rem 0.6rem',
                                          background: 'rgba(99,102,241,0.15)',
                                          border: '1px solid var(--accent-primary)',
                                          borderRadius: 6,
                                          color: 'var(--text-primary)',
                                          textDecoration: 'none',
                                          fontSize: '0.78rem',
                                          fontWeight: 500
                                        }}
                                      >
                                        📎 {cleanText || 'Document'} ↗
                                      </a>
                                    </div>
                                  )}

                                  {/* Clean Text Body */}
                                  {cleanText && (mediaType !== 'document' || !mediaUrl) && (
                                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{cleanText}</div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>

                      ))
                    )}
                  </div>

                  {/* Status bar */}
                  {msgSent && (
                    <div style={{
                      fontSize: '0.78rem',
                      color: msgSent.success ? 'var(--success)' : 'var(--warning)',
                      marginTop: '0.4rem', padding: '0.35rem 0.75rem', borderRadius: 6,
                      background: msgSent.success ? 'rgba(16,185,129,0.1)' : 'var(--warning-bg)',
                      border: `1px solid ${msgSent.success ? 'var(--success)' : 'var(--warning)'}`,
                      textAlign: 'center'
                    }}>
                      {msgSent.text}
                    </div>
                  )}

                  {/* File Attachment Preview */}
                  {attachedFile && (
                    <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: 8, border: `1px solid ${isDragOver ? 'var(--accent-primary)' : 'var(--border-color)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        {attachedPreview
                          ? <img src={attachedPreview} alt="preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />
                          : <div style={{ width: 48, height: 48, borderRadius: 6, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                              {attachedFile.type.startsWith('video') ? '🎬' : attachedFile.type.startsWith('audio') ? '🎵' : '📄'}
                            </div>
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{(attachedFile.size / 1024).toFixed(1)} KB · {getWhatsAppMediaType(attachedFile)}</div>
                          {uploadProgress > 0 && uploadProgress < 100 && (
                            <div style={{ marginTop: '0.3rem', height: 3, background: 'var(--border-color)', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.2s' }} />
                            </div>
                          )}
                        </div>
                        <button type="button" onClick={clearAttachment} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem', padding: '0.2rem' }}>✕</button>
                      </div>
                    </div>
                  )}

                  {/* Drag & Drop zone (shown when no file attached) */}
                  {!attachedFile && (
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        marginTop: '0.5rem',
                        border: `1.5px dashed ${isDragOver ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        borderRadius: 8, padding: '0.6rem',
                        textAlign: 'center', cursor: 'pointer',
                        background: isDragOver ? 'rgba(99,102,241,0.06)' : 'transparent',
                        transition: 'all 0.15s', display: 'none',
                      }}
                      id="crm-drop-zone"
                    >
                      <UploadCloud size={14} style={{ opacity: 0.4, marginBottom: 2 }} />
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Drop image, PDF, video, audio</div>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf,.mp4,.mp3,.ogg,.wav,.doc,.docx" style={{ display: 'none' }} onChange={e => handleFileSelect(e.target.files[0])} />

                  {/* Compose bar */}
                  <form onSubmit={handleSendQuickMsg} style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Attach file (image, PDF, video, audio)"
                      style={{
                        background: attachedFile ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 8, padding: '0.45rem 0.6rem',
                        cursor: 'pointer', color: attachedFile ? '#fff' : 'var(--text-muted)',
                        fontSize: '1.1rem', lineHeight: 1, flexShrink: 0,
                      }}
                    >📎</button>
                    <input
                      type="text"
                      className="input-field"
                      placeholder={attachedFile ? 'Add a caption (optional)...' : 'Type a WhatsApp message...'}
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      disabled={sendingMsg}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="submit"
                      className="btn btn-whatsapp"
                      disabled={sendingMsg || (!replyText.trim() && !attachedFile)}
                    >
                      <Send size={15} className={sendingMsg ? 'animate-spin' : ''} />
                      {sendingMsg ? (uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}%` : 'Sending...') : 'Send'}
                    </button>
                  </form>
                </div>
              )}


              {/* TAB 3: DEALS & QUOTATIONS */}
              {activeTab === 'deals' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="section-title">Active Deals Pipeline</span>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddDeal(true)}>
                      <Plus size={13} /> Create Deal
                    </button>
                  </div>

                  {showAddDeal && (
                    <form onSubmit={handleCreateDeal} className="c360-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'flex-end' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Deal Title *</label>
                        <input type="text" className="input-field" placeholder="e.g. 3BHK Andheri Unit 804" value={dealForm.title} onChange={e => setDealForm(p => ({ ...p, title: e.target.value }))} required />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Deal Value (₹)</label>
                        <input type="number" className="input-field" placeholder="9500000" value={dealForm.value} onChange={e => setDealForm(p => ({ ...p, value: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Stage</label>
                        <select className="input-field" value={dealForm.stage} onChange={e => setDealForm(p => ({ ...p, stage: e.target.value }))}>
                          {['Discovery', 'Qualified', 'Quotation', 'Negotiation', 'Won', 'Lost'].map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={savingDeal}>Save</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddDeal(false)}>Cancel</button>
                      </div>
                    </form>
                  )}

                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr><th>Deal Title</th><th>Value</th><th>Stage</th><th>Expected Close</th></tr>
                      </thead>
                      <tbody>
                        {(!data.deals || data.deals.length === 0) ? (
                          <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No active deals created yet.</td></tr>
                        ) : (
                          data.deals.map(d => (
                            <tr key={d.id}>
                              <td style={{ fontWeight: 600 }}>{d.title}</td>
                              <td style={{ fontWeight: 700, color: 'var(--success)' }}>{fmtCurrency(d.value)}</td>
                              <td><span className="badge badge-accent">{d.stage}</span></td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{d.expected_close_date || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="section-title" style={{ marginTop: '0.5rem' }}>Quotations Issued</div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr><th>Quotation #</th><th>Total Amount</th><th>Status</th><th>Valid Until</th></tr>
                      </thead>
                      <tbody>
                        {(!data.quotations || data.quotations.length === 0) ? (
                          <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No formal quotations issued.</td></tr>
                        ) : (
                          data.quotations.map(q => (
                            <tr key={q.id}>
                              <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-primary)' }}>{q.quotation_number}</td>
                              <td style={{ fontWeight: 700 }}>{fmtCurrency(q.total_amount)}</td>
                              <td><span className="badge badge-success">{q.status}</span></td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{q.valid_until || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: TALLY INVOICES */}
              {activeTab === 'finance' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="section-title">Tally Invoices & Outstandings</span>
                    <span className="badge badge-neutral">Accounting Source of Truth: TallyPrime</span>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr><th>Voucher #</th><th>Amount</th><th>Status</th><th>Due Date</th><th>Reminders</th></tr>
                      </thead>
                      <tbody>
                        {(!data.invoices || data.invoices.length === 0) ? (
                          <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No Tally invoices mapped to this contact phone.</td></tr>
                        ) : (
                          data.invoices.map(inv => (
                            <tr key={inv.id}>
                              <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-primary)' }}>{inv.invoice_number}</td>
                              <td style={{ fontWeight: 700, color: inv.status === 'Paid' ? 'var(--success)' : inv.status === 'Overdue' ? 'var(--danger)' : 'var(--warning)' }}>
                                {fmtCurrency(inv.amount)}
                              </td>
                              <td><span className={`badge ${inv.status === 'Paid' ? 'badge-success' : inv.status === 'Overdue' ? 'badge-danger' : 'badge-warning'}`}>{inv.status}</span></td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{inv.due_date || '—'}</td>
                              <td><span className="badge badge-neutral">{inv.reminder_count || 0} sent</span></td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 5: TIMELINE & ACTIVITIES */}
              {activeTab === 'timeline' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <span className="section-title">Complete Touchpoint Timeline</span>
                  <div className="activity-feed">
                    {(!data.activities || data.activities.length === 0) ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No activities logged.</div>
                    ) : (
                      data.activities.map(act => (
                        <div className="activity-item" key={act.id}>
                          <div className="activity-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent-primary)' }}>
                            <Calendar size={14} />
                          </div>
                          <div className="activity-content">
                            <div className="activity-title" style={{ fontWeight: 600 }}>{act.title}</div>
                            {act.subtitle && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{act.subtitle}</div>}
                            <div className="activity-time">{new Date(act.created_at).toLocaleString('en-IN')}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Customer360Modal;
