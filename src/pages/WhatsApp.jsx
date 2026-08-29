import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle, Send, Users, BarChart3, Plus,
  CheckCircle2, Clock, XCircle, FileText, Zap, RefreshCw,
  Search, User, Phone, Shield, Pause, Play, CheckCheck, Eye,
  UserCheck, ThumbsUp, ThumbsDown, MessageSquare, Award, Sparkles, ExternalLink
} from 'lucide-react';
import {
  getCampaigns, getLeads,
  getWhatsAppConversations, getWhatsAppMessages, sendWhatsAppMessage,
  updateConversationMode, toggleLeadOptOut, reassignSalesperson, submitAiFeedback,
  getTeamMembers
} from '../lib/db';
import Customer360Modal from '../components/Customer360Modal';
import CampaignBuilderModal from '../components/CampaignBuilderModal';
import HumanHandoffModal from '../components/HumanHandoffModal';
import { uploadToWhatsAppMedia, getWhatsAppMediaType, parseMessageMedia } from '../lib/storage';
import './Pages.css';

const statusConfig = {
  'Completed': 'badge-success',
  'Running':   'badge-warning',
  'Scheduled': 'badge-info',
  'Failed':    'badge-danger',
  'Draft':     'badge-neutral',
};

const templates = [
  { id: 1, tag: 'Launch', name: 'New Product Launch', preview: 'Hi {name}! 🚀 We have introduced our new {product}. Would you like the official catalog and brochure?' },
  { id: 2, tag: 'Catalog', name: 'Product Catalog & Demo', preview: 'Dear {name}, thank you for inquiring about {product}! We are offering free samples & demo this week. Would you like a callback?' },
  { id: 3, tag: 'Payment', name: 'Product Payment Reminder', preview: 'Dear {name}, your payment of {amount} for {product} is due on {date}. Please clear at the earliest.' },
  { id: 4, tag: 'Festival', name: 'Special Product Offer', preview: '🎉 {name}, this week get special volume discounts on our {product}! Limited period offer.' },
];

const AI_FEEDBACK_TAGS = ['AI Helpful', 'Wrong Information', 'Premature Handoff', 'Late Handoff', 'Customer Annoyed'];
const TEAM_MEMBERS = ['Rajesh Kumar', 'Priya Sharma', 'Amit Verma', 'Sunita Patel'];

// ── Live polling helpers ────────────────────────────────────────────────────
async function fetchLiveConversations() {
  try {
    const res = await fetch('/.netlify/functions/get-conversations');
    const json = await res.json();
    return json.conversations || [];
  } catch { return []; }
}

async function fetchLiveMessages(convId) {
  try {
    const res = await fetch(`/.netlify/functions/get-conversations?conv_id=${convId}`);
    const json = await res.json();
    return json.messages || [];
  } catch { return []; }
}

async function fetchLiveCampaigns() {
  try {
    const res = await fetch('/.netlify/functions/get-campaigns');
    const json = await res.json();
    return json.campaigns || [];
  } catch { return []; }
}

const WhatsApp = () => {
  const navigate = useNavigate();
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
  const selectedConvRef = useRef(null);

  // Phase 6 Handoff & Feedback Modals
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [selectedFeedbackTag, setSelectedFeedbackTag] = useState(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  // Campaigns State
  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [teamMembers, setTeamMembers] = useState(['Rajesh Kumar', 'Priya Sharma', 'Amit Verma', 'Sunita Patel']);
  const [loading, setLoading] = useState(true);
  const [showCampaignBuilder, setShowCampaignBuilder] = useState(false);
  
  // File attachment state
  const [attachedFile, setAttachedFile] = useState(null);
  const [attachedPreview, setAttachedPreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const messagesEndRef = useRef(null);

  // Keep ref in sync with state for use inside interval
  useEffect(() => { selectedConvRef.current = selectedConv; }, [selectedConv]);

  useEffect(() => {
    loadAllData();

    // ── Poll for new conversations & messages every 4 seconds ───────────────
    const pollInterval = setInterval(async () => {
      // Refresh conversation list
      const liveConvs = await fetchLiveConversations();
      if (liveConvs.length > 0) {
        setConversations(prev => {
          // Merge: live data takes priority, keep any that are only in mock
          const liveIds = new Set(liveConvs.map(c => c.id));
          const mockOnly = prev.filter(c => !liveIds.has(c.id));
          return [...liveConvs, ...mockOnly];
        });
        // If the selected conversation was updated (new message), sync it
        const currentConv = selectedConvRef.current;
        if (currentConv) {
          const updated = liveConvs.find(c => c.id === currentConv.id);
          if (updated && updated.last_message_at !== currentConv.last_message_at) {
            setSelectedConv(updated);
          }
        }
      }

      // Refresh messages for selected conversation
      const currentConv = selectedConvRef.current;
      if (currentConv) {
        const liveMessages = await fetchLiveMessages(currentConv.id);
        if (liveMessages.length > 0) {
          setMessages(prev => {
            if (liveMessages.length !== prev.length) return liveMessages;
            return prev;
          });
        }
      }
    }, 4000);

    return () => clearInterval(pollInterval);
  }, []);

  useEffect(() => {
    if (selectedConv) {
      loadMessages(selectedConv.id);
      setAttachedFile(null);
      setAttachedPreview(null);
    }
  }, [selectedConv]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileSelect = (file) => {
    if (!file) return;
    setAttachedFile(file);
    setUploadProgress(0);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => setAttachedPreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setAttachedPreview(null);
    }
  };

  const clearAttachment = () => {
    setAttachedFile(null);
    setAttachedPreview(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadAllData = async () => {
    setLoading(true);
    setConvLoading(true);

    const [lRes, uRes] = await Promise.all([
      getLeads(),
      getTeamMembers(),
    ]);
    setLeads(lRes.data || []);

    if (uRes?.data && uRes.data.length > 0) {
      const names = uRes.data.map(u => u.full_name || u.name).filter(Boolean);
      if (names.length > 0) setTeamMembers(names);
    }

    // Load campaigns via live Netlify function (bypasses RLS)
    const liveCampaigns = await fetchLiveCampaigns();
    if (liveCampaigns.length > 0) {
      setCampaigns(liveCampaigns);
    } else {
      const cRes = await getCampaigns();
      setCampaigns(cRes.data || []);
    }

    // Load conversations via live Netlify proxy (bypasses RLS)
    const liveConvs = await fetchLiveConversations();
    if (liveConvs.length > 0) {
      setConversations(liveConvs);
      if (!selectedConvRef.current) setSelectedConv(liveConvs[0]);
    } else {
      const convRes = await getWhatsAppConversations();
      const convData = convRes.data || [];
      setConversations(convData);
      if (convData.length > 0 && !selectedConvRef.current) setSelectedConv(convData[0]);
    }

    setLoading(false);
    setConvLoading(false);
  };

  // After a broadcast, wait a moment then refresh both campaigns and inbox
  const handleAfterBroadcast = async () => {
    await loadAllData();
    // Re-fetch again after 3s to catch any async Supabase inserts
    setTimeout(async () => {
      const liveCampaigns = await fetchLiveCampaigns();
      if (liveCampaigns.length > 0) setCampaigns(liveCampaigns);
      const liveConvs = await fetchLiveConversations();
      if (liveConvs.length > 0) {
        setConversations(liveConvs);
        if (!selectedConvRef.current && liveConvs.length > 0) setSelectedConv(liveConvs[0]);
      }
    }, 3000);
  };

  const loadMessages = async (convId) => {
    // Try live proxy first, fallback to db.js
    const liveMessages = await fetchLiveMessages(convId);
    if (liveMessages.length > 0) {
      setMessages(liveMessages);
    } else {
      const res = await getWhatsAppMessages(convId);
      setMessages(res.data || []);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!msgInput.trim() && !attachedFile) || !selectedConv) return;
    setSendingMsg(true);
    const textToSend = msgInput;
    setMsgInput('');

    let mediaUrl = null;
    let mediaType = 'text';

    try {
      if (attachedFile) {
        mediaUrl = await uploadToWhatsAppMedia(attachedFile, 'crm', setUploadProgress);
        mediaType = getWhatsAppMediaType(attachedFile);
      }

      const { data: newMsg } = await sendWhatsAppMessage(
        selectedConv.id,
        textToSend,
        'human_agent',
        selectedConv.contact_phone,
        mediaType,
        mediaUrl,
        attachedFile?.name || null
      );

      clearAttachment();

      if (newMsg) {
        setMessages(prev => [...prev, newMsg]);
        if (selectedConv.conversation_mode === 'AI ACTIVE') {
          handleModeChange('HUMAN ACTIVE');
        }
      }
    } catch (err) {
      console.error('[WhatsApp Page] Send error:', err);
    }

    setSendingMsg(false);
  };

  const handleModeChange = async (newMode) => {
    if (!selectedConv) return;
    await updateConversationMode(selectedConv.id, newMode);
    setSelectedConv(prev => ({ ...prev, conversation_mode: newMode }));
    setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, conversation_mode: newMode } : c));
  };

  const handleReassign = async (newRep) => {
    if (!selectedConv) return;
    await reassignSalesperson(selectedConv.id, newRep);
    setSelectedConv(prev => ({ ...prev, assigned_salesperson: newRep }));
    setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, assigned_salesperson: newRep } : c));
  };

  const handleFeedbackSubmit = async (tag) => {
    if (!selectedConv) return;
    setSelectedFeedbackTag(tag);
    await submitAiFeedback({
      conversationId: selectedConv.id,
      rating: tag === 'AI Helpful' ? 5 : 2,
      feedbackType: tag,
      comments: `Agent feedback tagged as: ${tag}`,
    });
    setFeedbackSuccess(true);
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

          <button
            className="btn btn-secondary"
            onClick={() => navigate('/campaign-studio')}
            style={{
              color: 'var(--accent-primary)',
              borderColor: 'var(--accent-primary)',
              background: 'rgba(99,102,241,0.08)',
              fontWeight: 600,
            }}
          >
            <Sparkles size={15} /> Campaign & Flow Studio ↗
          </button>

          <button className="btn btn-secondary" onClick={loadAllData}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {activeTab === 'campaigns' && (
            <button className="btn btn-whatsapp" onClick={() => setShowCampaignBuilder(true)}>
              <Plus size={15} /> Quick Modal
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          TAB 1: 3-PANE LIVE INBOX
         ========================================================================= */}
      {activeTab === 'inbox' && (
        <div className="glass-card whatsapp-inbox-grid">
          
          {/* PANE 1: CONVERSATIONS LIST */}
          <div className="whatsapp-conv-list" style={{ borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)' }}>
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
                // Skeleton shimmer cards while loading
                <div style={{ padding: '0.5rem' }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                        <div style={{ width: '60%', height: 12, background: 'var(--bg-tertiary)', borderRadius: 4, animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
                        <div style={{ width: '15%', height: 10, background: 'var(--bg-tertiary)', borderRadius: 4, animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
                      </div>
                      <div style={{ width: '85%', height: 10, background: 'var(--bg-tertiary)', borderRadius: 4, marginBottom: '0.3rem', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
                      <div style={{ width: '30%', height: 10, background: 'var(--bg-tertiary)', borderRadius: 4, animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
                    </div>
                  ))}
                </div>
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
          <div className="whatsapp-chat-pane" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
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
                      {selectedConv.contact_phone} · {selectedConv.property_interest || 'General Product Inquiry'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowHandoffModal(true)}>
                      <UserCheck size={13} color="var(--accent-primary)" /> Assign & Handoff
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setSelected360LeadId(selectedConv.lead_id || selectedConv.contact_phone || selectedConv.id)}>
                      <Eye size={13} /> 360 View
                    </button>
                  </div>
                </div>

                {/* Messages List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {messages.map(m => {
                    const isOutbound = m.direction === 'outbound';
                    const { text: cleanText, mediaUrl, mediaType } = parseMessageMedia(m);
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
                            {m.sender_type === 'customer' ? selectedConv.contact_name : m.sender_type === 'ai' ? '🤖 AI Sales Assistant' : `👤 ${selectedConv.assigned_salesperson || 'Sales Executive'}`}
                          </span>
                          <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        {/* Image Preview */}
                        {mediaUrl && mediaType === 'image' && (
                          <div style={{ marginBottom: cleanText ? '0.45rem' : 0 }}>
                            <a href={mediaUrl} target="_blank" rel="noopener noreferrer" title="Click to view full image">
                              <img
                                src={mediaUrl}
                                alt="WhatsApp shared image"
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: 260,
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

                        {/* Video Preview */}
                        {mediaUrl && mediaType === 'video' && (
                          <div style={{ marginBottom: cleanText ? '0.45rem' : 0 }}>
                            <video controls style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, display: 'block' }}>
                              <source src={mediaUrl} />
                            </video>
                          </div>
                        )}

                        {/* Audio Preview */}
                        {mediaUrl && mediaType === 'audio' && (
                          <div style={{ marginBottom: cleanText ? '0.45rem' : 0 }}>
                            <audio controls style={{ width: '100%', minWidth: 200 }}>
                              <source src={mediaUrl} />
                            </audio>
                          </div>
                        )}

                        {/* Document Preview */}
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
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{cleanText}</div>
                        )}

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

                {/* Attachment Preview Box */}
                {attachedFile && (
                  <div style={{ padding: '0.5rem 1.25rem', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {attachedPreview
                      ? <img src={attachedPreview} alt="preview" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                      : <div style={{ width: 40, height: 40, borderRadius: 6, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📄</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{(attachedFile.size / 1024).toFixed(0)} KB · {getWhatsAppMediaType(attachedFile)}</div>
                      {uploadProgress > 0 && uploadProgress < 100 && (
                        <div style={{ marginTop: '0.25rem', height: 3, background: 'var(--border-color)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.2s' }} />
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={clearAttachment} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', padding: '0.2rem' }}>✕</button>
                  </div>
                )}

                <input ref={fileInputRef} type="file" accept="image/*,.pdf,.mp4,.mp3,.ogg,.wav,.doc,.docx" style={{ display: 'none' }} onChange={e => handleFileSelect(e.target.files[0])} />

                {/* Chat Composer */}
                <form onSubmit={handleSendMessage} style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach image, PDF, or document"
                    style={{
                      background: attachedFile ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8, padding: '0.45rem 0.65rem',
                      cursor: 'pointer', color: attachedFile ? '#fff' : 'var(--text-muted)',
                      fontSize: '1.1rem', lineHeight: 1, flexShrink: 0
                    }}
                  >
                    📎
                  </button>
                  <input
                    type="text"
                    className="input-field"
                    placeholder={attachedFile ? 'Add a caption (optional)...' : `Reply as ${selectedConv.assigned_salesperson || 'Sales Rep'}...`}
                    value={msgInput}
                    onChange={e => setMsgInput(e.target.value)}
                    disabled={sendingMsg}
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn btn-whatsapp" disabled={sendingMsg || (!msgInput.trim() && !attachedFile)}>
                    <Send size={15} className={sendingMsg ? 'animate-spin' : ''} />
                    {sendingMsg ? (uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}%` : 'Sending...') : 'Send'}
                  </button>
                </form>
              </>
            ) : (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
                Select a conversation from the left pane.
              </div>
            )}
          </div>

          {/* PANE 3: HUMAN TAKEOVER, REASSIGNMENT & AI FEEDBACK LOOP (Section 23, 24) */}
          <div className="whatsapp-right-pane" style={{ borderLeft: '1px solid var(--border-color)', background: 'var(--bg-secondary)', padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {selectedConv ? (
              <>
                {/* 1. Mode Toggle */}
                <div>
                  <span className="section-title" style={{ fontSize: '0.82rem' }}>Conversation Mode</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                    <button
                      className={`btn btn-sm ${selectedConv.conversation_mode === 'HUMAN ACTIVE' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ width: '100%', justifyContent: 'flex-start' }}
                      onClick={() => handleModeChange('HUMAN ACTIVE')}
                    >
                      <User size={13} /> Human Takeover (Mute AI)
                    </button>
                    <button
                      className={`btn btn-sm ${selectedConv.conversation_mode === 'AI ACTIVE' ? 'btn-success' : 'btn-secondary'}`}
                      style={{ width: '100%', justifyContent: 'flex-start' }}
                      onClick={() => handleModeChange('AI ACTIVE')}
                    >
                      <Play size={13} /> Resume AI Assistant
                    </button>
                  </div>
                </div>

                {/* 2. Salesperson Assignment */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem' }}>
                  <span className="section-title" style={{ fontSize: '0.82rem' }}>Assigned Salesperson</span>
                  <select
                    className="input-field"
                    style={{ fontSize: '0.78rem', marginTop: '0.4rem' }}
                    value={selectedConv.assigned_salesperson || teamMembers[0] || 'Rajesh Kumar'}
                    onChange={e => handleReassign(e.target.value)}
                  >
                    {teamMembers.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>

                {/* 3. Section 24: Salesperson AI Feedback Loop */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem' }}>
                  <span className="section-title" style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Award size={14} color="var(--warning)" /> Rate AI Performance
                  </span>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '0.2rem 0 0.5rem 0' }}>
                    Section 24: Helps refine knowledge base & prompts.
                  </p>
                  
                  {feedbackSuccess ? (
                    <div style={{ padding: '0.5rem', background: 'rgba(16,185,129,0.1)', border: '1px solid var(--success)', borderRadius: 6, fontSize: '0.72rem', color: 'var(--success)', textAlign: 'center' }}>
                      ✅ Feedback submitted!
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {AI_FEEDBACK_TAGS.map(tag => (
                        <button
                          key={tag}
                          onClick={() => handleFeedbackSubmit(tag)}
                          className="btn btn-secondary btn-sm"
                          style={{
                            fontSize: '0.68rem',
                            padding: '0.25rem 0.5rem',
                            justifyContent: 'flex-start',
                            background: selectedFeedbackTag === tag ? 'rgba(99,102,241,0.2)' : undefined,
                            borderColor: selectedFeedbackTag === tag ? 'var(--accent-primary)' : undefined,
                          }}
                        >
                          {tag === 'AI Helpful' ? '👍' : '⚠️'} {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Opt-Out Safeguard */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)', fontSize: '0.72rem' }}
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
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="section-title">Campaign Broadcast History</span>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                onClick={async () => {
                  const liveCampaigns = await fetchLiveCampaigns();
                  if (liveCampaigns.length > 0) setCampaigns(liveCampaigns);
                  else { const r = await getCampaigns(); setCampaigns(r.data || []); }
                }}
              >
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr><th>Campaign Name</th><th>Status</th><th>Launched</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Replied</th><th>Template / Message</th></tr>
                </thead>
                <tbody>
                  {campaigns.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📋</div>
                        No campaigns launched yet. Click <strong>Quick Modal</strong> above to launch your first broadcast.
                      </td>
                    </tr>
                  )}
                  {campaigns.map(c => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        {c.custom_message && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.custom_message}
                          </div>
                        )}
                      </td>
                      <td><span className={`badge ${statusConfig[c.status] || 'badge-neutral'}`}>{c.status || 'Draft'}</span></td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ fontWeight: 700 }}>{(c.total_sent || 0).toLocaleString()}</td>
                      <td style={{ color: 'var(--success)' }}>{(c.delivered || c.total_sent || 0).toLocaleString()}</td>
                      <td style={{ color: 'var(--warning)' }}>{(c.read_count || 0).toLocaleString()}</td>
                      <td style={{ color: 'var(--whatsapp)' }}>{(c.replied || 0)}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.template_name || 'Custom Broadcast'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Builder Modal */}
      {showCampaignBuilder && (
        <CampaignBuilderModal
          isOpen={showCampaignBuilder}
          onClose={() => setShowCampaignBuilder(false)}
          onCampaignQueued={handleAfterBroadcast}
        />
      )}

      {/* Human Handoff Modal */}
      {showHandoffModal && selectedConv && (
        <HumanHandoffModal
          isOpen={showHandoffModal}
          onClose={() => setShowHandoffModal(false)}
          conversation={selectedConv}
          lead={leads.find(l => l.id === selectedConv.lead_id)}
          teamMembers={teamMembers}
          onHandoffCompleted={(newRep) => {
            setSelectedConv(p => ({ ...p, conversation_mode: 'HUMAN ACTIVE', assigned_salesperson: newRep }));
            loadAllData();
          }}
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
