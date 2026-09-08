import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle, Send, Users, BarChart3, Plus,
  CheckCircle2, Clock, XCircle, FileText, Zap, RefreshCw,
  Search, User, Phone, Shield, Pause, Play, CheckCheck, Eye,
  UserCheck, ThumbsUp, ThumbsDown, MessageSquare, Award, Sparkles, ExternalLink,
  ShieldCheck, RotateCcw, AlertTriangle, ArrowRight, UserPlus, PhoneCall, Check, X as XIcon, Pencil
} from 'lucide-react';
import {
  getCampaigns, getLeads,
  getWhatsAppConversations, getWhatsAppMessages, sendWhatsAppMessage,
  updateConversationMode, toggleLeadOptOut, reassignSalesperson, submitAiFeedback,
  getTeamMembers, updateConversationContactName,
  getCustomerMaster, triggerSheetSync, invalidateCustomerMasterCache
} from '../lib/db';
import {
  extractMainName, isGenericName, formatPhoneNumber, getDisplayName, getGreeting
} from '../lib/nameHelper';
import Customer360Modal from '../components/Customer360Modal';
import CampaignBuilderModal from '../components/CampaignBuilderModal';
import HumanHandoffModal from '../components/HumanHandoffModal';
import { uploadToWhatsAppMedia, getWhatsAppMediaType, parseMessageMedia } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { useLiveCounts } from '../context/LiveCountsContext';
import './Pages.css';

const statusConfig = {
  'Completed': 'badge-success',
  'Running':   'badge-warning',
  'Scheduled': 'badge-info',
  'Failed':    'badge-danger',
  'Draft':     'badge-neutral',
};

const AI_FEEDBACK_TAGS = ['AI Helpful', 'Wrong Information', 'Premature Handoff', 'Late Handoff', 'Customer Annoyed'];

// ── Live query helpers (Direct to Supabase — 0 Netlify Function invocations) ──
async function fetchLiveConversations() {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .order('last_message_at', { ascending: false });
    return data || [];
  } catch { return []; }
}

async function fetchLiveMessages(convId) {
  if (!supabase || !convId) return [];
  try {
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    return data || [];
  } catch { return []; }
}

async function fetchLiveCampaigns() {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from('wa_campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    return data || [];
  } catch { return []; }
}

const WhatsApp = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('inbox'); // 'inbox' | 'customers' | 'campaigns'
  
  // Google Sheet Customer Master State
  const [customerMaster, setCustomerMaster]   = useState([]);
  const [syncingSheet, setSyncingSheet]       = useState(false);
  const [syncMsg, setSyncMsg]                 = useState('');
  const [sheetSearch, setSheetSearch]         = useState('');
  const [sheetFilter, setSheetFilter]         = useState('all'); // 'all' | 'with_phone' | 'active_chat' | 'missing_phone'
  const [customerPage, setCustomerPage]       = useState(1);

  // Live Inbox State
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const { refresh: refreshLiveCounts } = useLiveCounts();
  const [msgInput, setMsgInput] = useState('');
  const [searchConv, setSearchConv] = useState('');
  const [chatFilter, setChatFilter] = useState('all'); // 'all' | 'customers' | 'takeover' | 'unread'
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

  // Inline contact name editing
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const editNameRef = useRef(null);

  const startEditName = () => {
    setEditNameValue(selectedConv?.contact_name || '');
    setEditingName(true);
    setTimeout(() => editNameRef.current?.focus(), 50);
  };

  const saveEditName = async () => {
    const trimmed = editNameValue.trim();
    if (!trimmed || !selectedConv) { setEditingName(false); return; }
    setSavingName(true);
    const { data } = await updateConversationContactName(selectedConv.id, trimmed);
    if (data) {
      const updated = { ...selectedConv, contact_name: trimmed };
      setSelectedConv(updated);
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? updated : c));
    }
    setSavingName(false);
    setEditingName(false);
  };

  // Keep selectedConvRef in sync to prevent polling overwrite
  useEffect(() => {
    selectedConvRef.current = selectedConv;
  }, [selectedConv]);

  // Relaxed background fallback refresh directly against Supabase (0 Netlify calls)
  useEffect(() => {
    const interval = setInterval(async () => {
      const liveConvs = await fetchLiveConversations();
      if (liveConvs.length > 0) {
        setConversations(prev => {
          return liveConvs.map(nc => {
            const old = prev.find(o => o.id === nc.id);
            return old ? { ...old, ...nc } : nc;
          });
        });
      }
      if (selectedConvRef.current?.id) {
        const liveMsgs = await fetchLiveMessages(selectedConvRef.current.id);
        if (liveMsgs && liveMsgs.length > 0) {
          setMessages(prev => {
            if (
              prev.length === liveMsgs.length &&
              prev[prev.length - 1]?.id === liveMsgs[liveMsgs.length - 1]?.id &&
              prev[prev.length - 1]?.status === liveMsgs[liveMsgs.length - 1]?.status
            ) {
              return prev;
            }
            return liveMsgs;
          });
        }
      }
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // Supabase Realtime subscription (instant updates via WebSockets — 0 Netlify calls)
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('whatsapp_live_inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, payload => {
        if (payload.eventType === 'INSERT') {
          const newMsg = payload.new;
          if (selectedConvRef.current && newMsg.conversation_id === selectedConvRef.current.id) {
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
          setConversations(prev => prev.map(c => {
            if (c.id === newMsg.conversation_id) {
              return {
                ...c,
                last_message_text: newMsg.body,
                last_message_at: newMsg.created_at,
                unread_count: selectedConvRef.current?.id === c.id ? 0 : (c.unread_count || 0) + 1,
              };
            }
            return c;
          }));
          refreshLiveCounts();
        } else if (payload.eventType === 'UPDATE') {
          const updatedMsg = payload.new;
          if (selectedConvRef.current && updatedMsg.conversation_id === selectedConvRef.current.id) {
            setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, payload => {
        const conv = payload.new;
        if (!conv) return;
        setConversations(prev => {
          const exists = prev.some(c => c.id === conv.id);
          if (exists) {
            return prev.map(c => c.id === conv.id ? { ...c, ...conv } : c);
          }
          return [conv, ...prev];
        });
        refreshLiveCounts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refreshLiveCounts]);

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (selectedConv?.id) {
      isUserScrolledUpRef.current = false;
      loadMessages(selectedConv.id);
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, unread_count: 0 } : c));
      if (supabase) {
        supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', selectedConv.id).then(() => {
          refreshLiveCounts();
        }).catch(() => {});
      }
    }
  }, [selectedConv?.id]);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isUserScrolledUpRef = useRef(false);

  const handleChatScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isUserScrolledUpRef.current = distanceFromBottom > 120;
  };

  useEffect(() => {
    // Only auto-scroll to bottom if user has NOT scrolled up to read earlier history
    if (!isUserScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
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

    const [lRes, uRes, masterRes] = await Promise.all([
      getLeads(),
      getTeamMembers(),
      getCustomerMaster(),
    ]);
    setLeads(lRes.data || []);
    setCustomerMaster(masterRes.data || []);

    if (uRes?.data && uRes.data.length > 0) {
      const names = uRes.data.map(u => u.full_name || u.name).filter(Boolean);
      if (names.length > 0) setTeamMembers(names);
    }

    const liveCampaigns = await fetchLiveCampaigns();
    if (liveCampaigns.length > 0) {
      setCampaigns(liveCampaigns);
    } else {
      const cRes = await getCampaigns();
      setCampaigns(cRes.data || []);
    }

    const liveConvs = await fetchLiveConversations();
    const activeId = selectedConvRef.current?.id;
    if (liveConvs.length > 0) {
      setConversations(liveConvs.map(c => c.id === activeId ? { ...c, unread_count: 0 } : c));
      if (!selectedConvRef.current) handleSelectConversation(liveConvs[0]);
    } else {
      const convRes = await getWhatsAppConversations();
      const convData = convRes.data || [];
      setConversations(convData.map(c => c.id === activeId ? { ...c, unread_count: 0 } : c));
      if (convData.length > 0 && !selectedConvRef.current) handleSelectConversation(convData[0]);
    }

    setLoading(false);
    setConvLoading(false);
  };

  const handleSelectConversation = (conv) => {
    if (!conv) return;
    setSelectedConv(conv);
    selectedConvRef.current = conv;
    // Clear unread badge in local state immediately
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
    // Persist unread_count = 0 in database
    if (conv.unread_count > 0 && supabase) {
      supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', conv.id)
        .then(() => refreshLiveCounts())
        .catch(err => console.warn('[WhatsApp] Error updating unread_count:', err));
    }
  };

  const handleAfterBroadcast = async () => {
    await loadAllData();
    setTimeout(async () => {
      const liveCampaigns = await fetchLiveCampaigns();
      if (liveCampaigns.length > 0) setCampaigns(liveCampaigns);
      const liveConvs = await fetchLiveConversations();
      const activeId = selectedConvRef.current?.id;
      if (liveConvs.length > 0) {
        setConversations(liveConvs.map(c => c.id === activeId ? { ...c, unread_count: 0 } : c));
        if (!selectedConvRef.current && liveConvs.length > 0) handleSelectConversation(liveConvs[0]);
      }
    }, 3000);
  };

  const loadMessages = async (convId) => {
    const liveMessages = await fetchLiveMessages(convId);
    if (liveMessages.length > 0) {
      setMessages(liveMessages);
    } else {
      const res = await getWhatsAppMessages(convId);
      setMessages(res.data || []);
    }
    // Also clear unread_count for the loaded conversation
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
    if (supabase) {
      supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', convId)
        .then(() => refreshLiveCounts())
        .catch(() => {});
    }
  };

  const handleSendMessage = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if ((!msgInput.trim() && !attachedFile) || !selectedConv) return;
    setSendingMsg(true);
    const textToSend = msgInput.trim();
    const fileToSend = attachedFile;

    let mediaUrl = null;
    let mediaType = 'text';
    let mediaFileName = null;

    try {
      if (fileToSend) {
        mediaFileName = fileToSend.name;
        mediaType = getWhatsAppMediaType(fileToSend);
        mediaUrl = await uploadToWhatsAppMedia(fileToSend, 'crm', setUploadProgress);
      }

      const { data: newMsg, error: sendErr } = await sendWhatsAppMessage(
        selectedConv.id,
        textToSend,
        'human_agent',
        selectedConv.contact_phone,
        mediaType,
        mediaUrl,
        mediaFileName
      );

      if (sendErr) {
        console.warn('[WhatsApp Page] Send warning:', sendErr);
      }

      setMsgInput('');
      clearAttachment();

      if (newMsg) {
        isUserScrolledUpRef.current = false;
        setMessages(prev => [...prev, newMsg]);
        if (selectedConv.conversation_mode === 'AI ACTIVE') {
          handleModeChange('HUMAN ACTIVE');
        }
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    } catch (err) {
      console.error('[WhatsApp Page] Send error:', err);
      alert(`Message sending failed: ${err.message || 'Please try again.'}`);
    } finally {
      setSendingMsg(false);
      setUploadProgress(0);
    }
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
    await submitAiFeedback(selectedConv.id, tag, `Tagged by ${selectedConv.assigned_salesperson || 'Agent'}`);
    setFeedbackSuccess(true);
    setTimeout(() => {
      setFeedbackSuccess(false);
      setSelectedFeedbackTag(null);
    }, 2500);
  };

  // ── Customer Phone Map (matches 10-digit normalized phone numbers to Google Sheet) ──
  const customerPhoneMap = useMemo(() => {
    const map = new Map();
    for (const c of customerMaster) {
      if (c.contact_number) {
        const digits = c.contact_number.replace(/\D/g, '').slice(-10);
        if (digits.length === 10) map.set(digits, c);
      }
    }
    return map;
  }, [customerMaster]);

  // ── CRM Leads Phone Map ──
  const leadsPhoneMap = useMemo(() => {
    const map = new Map();
    for (const l of leads) {
      if (l.phone) {
        const digits = l.phone.replace(/\D/g, '').slice(-10);
        if (digits.length === 10 && l.name && !isGenericName(l.name)) {
          map.set(digits, l.name);
        }
      }
    }
    return map;
  }, [leads]);

  // Match conversations with Google Sheet Master Directory & CRM Leads, with automatic phone deduplication
  const enrichedConversations = useMemo(() => {
    const seen = new Map();
    const result = [];

    for (const c of conversations) {
      const cDigits = (c.contact_phone || '').replace(/\D/g, '').slice(-10);
      const sheetCust = customerPhoneMap.get(cDigits);
      const leadName = leadsPhoneMap.get(cDigits);

      let resolvedName = c.contact_name;
      // If contact_name is generic ("Recipient 1", "Customer", "WhatsApp User", phone digits)
      if (isGenericName(resolvedName)) {
        if (sheetCust) {
          resolvedName = sheetCust.contact_person
            ? `${sheetCust.contact_person} (${sheetCust.company_name})`
            : sheetCust.company_name;
        } else if (leadName) {
          resolvedName = leadName;
        } else {
          resolvedName = formatPhoneNumber(c.contact_phone);
        }
      }

      const isSelected = selectedConv?.id === c.id || selectedConvRef.current?.id === c.id;
      const item = {
        ...c,
        unread_count: isSelected ? 0 : (c.unread_count || 0),
        contact_name: resolvedName,
        _sheet_customer: sheetCust || null,
        _is_sheet_customer: !!sheetCust,
      };

      if (!cDigits) {
        result.push(item);
        continue;
      }

      if (!seen.has(cDigits)) {
        seen.set(cDigits, item);
        result.push(item);
      } else {
        // Merge duplicate conversation for this phone
        const existing = seen.get(cDigits);
        if (!isGenericName(item.contact_name) && isGenericName(existing.contact_name)) {
          existing.contact_name = item.contact_name;
        }
        if ((item.unread_count || 0) > (existing.unread_count || 0)) {
          existing.unread_count = item.unread_count;
        }
        if (new Date(item.last_message_at || 0) > new Date(existing.last_message_at || 0)) {
          existing.last_message_at = item.last_message_at;
          existing.last_message_text = item.last_message_text;
        }
      }
    }

    return result;
  }, [conversations, customerPhoneMap, leadsPhoneMap]);

  const takeoverCount = enrichedConversations.filter(c => c.conversation_mode === 'HUMAN TAKEOVER REQUESTED').length;
  const unreadCount = enrichedConversations.filter(c => (c.unread_count || 0) > 0).length;
  const sheetCustomerConvCount = enrichedConversations.filter(c => c._is_sheet_customer).length;

  const filteredConversations = useMemo(() => {
    return enrichedConversations.filter(c => {
      if (chatFilter === 'takeover' && c.conversation_mode !== 'HUMAN TAKEOVER REQUESTED') return false;
      if (chatFilter === 'unread' && !(c.unread_count > 0)) return false;
      if (chatFilter === 'customers' && !c._is_sheet_customer) return false;
      if (!searchConv) return true;
      const s = searchConv.toLowerCase();
      return (
        c.contact_name?.toLowerCase().includes(s) ||
        c.contact_phone?.includes(s) ||
        c.last_message_text?.toLowerCase().includes(s) ||
        c._sheet_customer?.company_name?.toLowerCase().includes(s)
      );
    });
  }, [enrichedConversations, chatFilter, searchConv]);

  // Open / Initialize conversation for a customer from the Google Sheet
  const handleOpenCustomerChat = (cust) => {
    const custDigits = (cust.contact_number || '').replace(/\D/g, '').slice(-10);
    const formattedName = cust.contact_person
      ? `${cust.contact_person} (${cust.company_name})`
      : cust.company_name;

    const existing = conversations.find(c => {
      const cDigits = (c.contact_phone || '').replace(/\D/g, '').slice(-10);
      return cDigits && custDigits && cDigits === custDigits;
    });

    if (existing) {
      handleSelectConversation(existing);
      setActiveTab('inbox');
    } else {
      const newConv = {
        id: `conv-sheet-${cust.id || custDigits || Date.now()}`,
        contact_phone: cust.contact_number ? (cust.contact_number.startsWith('+') ? cust.contact_number : `+91${custDigits}`) : `+91${custDigits}`,
        contact_name: formattedName,
        conversation_mode: 'AI ACTIVE',
        last_message_text: 'Customer selected from Google Sheet Directory',
        last_message_at: new Date().toISOString(),
        unread_count: 0,
        assigned_salesperson: teamMembers[0] || 'Rajesh Kumar',
        _sheet_customer: cust,
        _is_sheet_customer: true,
      };
      setConversations(prev => [newConv, ...prev]);
      handleSelectConversation(newConv);
      setActiveTab('inbox');
    }
  };

  const handleSheetSync = async () => {
    setSyncingSheet(true);
    setSyncMsg('Fetching live customer directory from Google Sheet...');
    const { data, error } = await triggerSheetSync();
    if (error || !data?.success) {
      invalidateCustomerMasterCache();
      const res = await getCustomerMaster({ forceRefresh: true });
      setCustomerMaster(res.data || []);
      setSyncMsg(`Refreshed ${res.data?.length || 0} customers from database`);
    } else {
      setSyncMsg(`✅ Synced ${data.synced} customers live from Google Sheet! Numbers updated.`);
      invalidateCustomerMasterCache();
      const res = await getCustomerMaster({ forceRefresh: true });
      setCustomerMaster(res.data || []);
    }
    setSyncingSheet(false);
    setTimeout(() => setSyncMsg(''), 4500);
  };

  // Filtered customers for the dedicated Sheet Customers directory
  const filteredSheetCustomers = useMemo(() => {
    return customerMaster.filter(cust => {
      const rawPhone = (cust.contact_number || '').trim();
      const digits = rawPhone.replace(/\D/g, '').slice(-10);
      const hasPhone = digits.length === 10;

      const hasChat = conversations.some(c => {
        const cDigits = (c.contact_phone || '').replace(/\D/g, '').slice(-10);
        return cDigits && digits && cDigits === digits;
      });

      if (sheetFilter === 'with_phone' && !hasPhone) return false;
      if (sheetFilter === 'missing_phone' && hasPhone) return false;
      if (sheetFilter === 'active_chat' && !hasChat) return false;

      if (sheetSearch.trim()) {
        const q = sheetSearch.toLowerCase().trim();
        const co = (cust.company_name || '').toLowerCase();
        const cp = (cust.contact_person || '').toLowerCase();
        const ph = (cust.contact_number || '').toLowerCase();
        if (!co.includes(q) && !cp.includes(q) && !ph.includes(q)) return false;
      }
      return true;
    });
  }, [customerMaster, sheetFilter, sheetSearch, conversations]);

  // Pagination for Sheet Customers Directory
  const PAGE_SIZE = 50;
  const totalCustomerPages = Math.max(1, Math.ceil(filteredSheetCustomers.length / PAGE_SIZE));
  const paginatedCustomers = useMemo(() => {
    const start = (customerPage - 1) * PAGE_SIZE;
    return filteredSheetCustomers.slice(start, start + PAGE_SIZE);
  }, [filteredSheetCustomers, customerPage]);

  const totalSent = campaigns.reduce((s, c) => s + (c.total_sent || c.sent || 0), 0);
  const totalDelivered = campaigns.reduce((s, c) => s + (c.delivered || c.total_delivered || c.total_sent || 0), 0);
  const totalRead = campaigns.reduce((s, c) => s + (c.total_read ?? c.read_count ?? c.read ?? 0), 0);
  const totalReplied = campaigns.reduce((s, c) => s + (c.total_replied ?? c.replied ?? c.replies ?? 0), 0);
  const readRate = totalSent > 0 ? ((totalRead / totalSent) * 100).toFixed(1) : '0.0';

  const totalWithPhone = customerMaster.filter(c => (c.contact_number || '').replace(/\D/g, '').length >= 10).length;

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">WhatsApp Center</h1>
          <p className="page-subtitle">Live customer conversations, AI sales assistant takeover, and broadcast campaigns.</p>
        </div>
        <div className="page-actions">
          {/* Main Tab navigation */}
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button
              className="btn"
              onClick={() => setActiveTab('inbox')}
              style={{
                borderRadius: 0,
                background: activeTab === 'inbox' ? 'var(--whatsapp)' : 'var(--bg-tertiary)',
                color: activeTab === 'inbox' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontWeight: activeTab === 'inbox' ? 700 : 500,
              }}
            >
              <MessageCircle size={15} />
              <span>Live Inbox ({conversations.length})</span>
              {takeoverCount > 0 && (
                <span
                  style={{
                    background: '#ef4444',
                    color: '#ffffff',
                    borderRadius: 99,
                    padding: '0.1rem 0.45rem',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    animation: 'pulse 2s infinite',
                    boxShadow: '0 0 6px rgba(239, 68, 68, 0.6)',
                  }}
                  title={`${takeoverCount} customer(s) requested human takeover / rate list`}
                >
                  🚨 {takeoverCount}
                </span>
              )}
            </button>

            {/* NEW SECTION: GOOGLE SHEET CUSTOMERS */}
            <button
              className="btn"
              onClick={() => setActiveTab('customers')}
              style={{
                borderRadius: 0,
                background: activeTab === 'customers' ? '#10b981' : 'var(--bg-tertiary)',
                color: activeTab === 'customers' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontWeight: activeTab === 'customers' ? 700 : 500,
              }}
              data-tooltip="View and chat with Google Sheet verified customers"
              data-tooltip-pos="bottom"
            >
              <Users size={15} />
              <span>Sheet Customers ({customerMaster.length})</span>
            </button>

            <button
              className="btn"
              onClick={() => setActiveTab('campaigns')}
              style={{
                borderRadius: 0,
                background: activeTab === 'campaigns' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'campaigns' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontWeight: activeTab === 'campaigns' ? 700 : 500,
              }}
            >
              <Send size={15} /> <span>Broadcasts</span>
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

          <button
            className="btn btn-secondary"
            onClick={handleSheetSync}
            disabled={syncingSheet}
            data-tooltip="Fetch latest customer names & numbers from live Google Sheet"
            data-tooltip-pos="bottom"
          >
            <RotateCcw size={14} className={syncingSheet ? 'animate-spin' : ''} />
            {syncingSheet ? 'Syncing...' : 'Sync Sheet'}
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

      {/* Sync Notification Banner */}
      {syncMsg && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)', padding: '0.65rem 1rem',
          marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--text-primary)',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <ShieldCheck size={15} color="var(--success)" /> {syncMsg}
        </div>
      )}

      {/* =========================================================================
          TAB 1: 3-PANE LIVE INBOX
         ========================================================================= */}
      {activeTab === 'inbox' && (
        <div className="glass-card whatsapp-inbox-grid">
          
          {/* PANE 1: CONVERSATIONS LIST */}
          <div className="whatsapp-conv-pane" style={{ borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 0.85rem 0.4rem', borderBottom: '1px solid var(--border-color)' }}>
              <div className="input-group" style={{ marginBottom: '0.45rem' }}>
                <Search size={14} className="input-icon" />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search chats or customers..."
                  style={{ fontSize: '0.8rem', padding: '0.45rem 0.5rem 0.45rem 2rem' }}
                  value={searchConv}
                  onChange={e => setSearchConv(e.target.value)}
                />
              </div>

              {/* Actionable Filter Pills */}
              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', paddingBottom: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setChatFilter('all')}
                  style={{
                    fontSize: '0.68rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 6,
                    border: '1px solid var(--border-color)',
                    background: chatFilter === 'all' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: chatFilter === 'all' ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: chatFilter === 'all' ? 700 : 500,
                  }}
                >
                  All ({conversations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setChatFilter('customers')}
                  style={{
                    fontSize: '0.68rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 6,
                    border: '1px solid var(--border-color)',
                    background: chatFilter === 'customers' ? '#10b981' : 'var(--bg-tertiary)',
                    color: chatFilter === 'customers' ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: chatFilter === 'customers' ? 700 : 500,
                  }}
                  data-tooltip="Show verified Google Sheet customer conversations"
                  data-tooltip-pos="bottom"
                >
                  👥 Sheet ({sheetCustomerConvCount})
                </button>
                <button
                  type="button"
                  onClick={() => setChatFilter('takeover')}
                  style={{
                    fontSize: '0.68rem',
                    padding: '0.2rem 0.55rem',
                    borderRadius: 6,
                    border: takeoverCount > 0 ? '1px solid #ef4444' : '1px solid var(--border-color)',
                    background: chatFilter === 'takeover' ? '#ef4444' : (takeoverCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-tertiary)'),
                    color: chatFilter === 'takeover' ? '#ffffff' : (takeoverCount > 0 ? '#ef4444' : 'var(--text-secondary)'),
                    cursor: 'pointer',
                    fontWeight: takeoverCount > 0 ? 800 : 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <span>🚨</span>
                  <span>Takeover ({takeoverCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChatFilter('unread')}
                  style={{
                    fontSize: '0.68rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 6,
                    border: '1px solid var(--border-color)',
                    background: chatFilter === 'unread' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: chatFilter === 'unread' ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: chatFilter === 'unread' ? 700 : 500,
                  }}
                >
                  Unread ({unreadCount})
                </button>
              </div>
            </div>

            <div className="whatsapp-conv-list" style={{ flex: 1 }}>
              {convLoading ? (
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
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {chatFilter === 'customers' ? (
                    <div>
                      <div style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>👥</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>No Sheet Customer chats yet</div>
                      <div style={{ fontSize: '0.72rem', marginBottom: '0.75rem' }}>Switch to "Sheet Customers" tab to select and message any customer directly.</div>
                      <button className="btn btn-whatsapp btn-sm" onClick={() => setActiveTab('customers')}>
                        Browse Customers
                      </button>
                    </div>
                  ) : (
                    'No conversations found.'
                  )}
                </div>
              ) : (
                filteredConversations.map(c => {
                  const isSelected = selectedConv?.id === c.id;
                  const isTakeover = c.conversation_mode === 'HUMAN TAKEOVER REQUESTED';
                  const isSheetCust = c._is_sheet_customer;

                  return (
                    <div
                      key={c.id}
                      onClick={() => handleSelectConversation(c)}
                      style={{
                        padding: '0.85rem 1rem',
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        background: isTakeover
                          ? (isSelected ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.06)')
                          : (isSelected ? 'rgba(99,102,241,0.1)' : 'transparent'),
                        borderLeft: isTakeover
                          ? '4px solid #ef4444'
                          : (isSelected ? '3px solid var(--accent-primary)' : '3px solid transparent'),
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.15rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', maxWidth: '70%' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.84rem', color: isTakeover ? '#ef4444' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getDisplayName(c.contact_name, c.contact_phone)}
                          </div>
                          {isSheetCust && (
                            <span
                              data-tooltip="Verified Google Sheet Customer"
                              data-tooltip-pos="bottom"
                              style={{ color: '#10b981', display: 'inline-flex', flexShrink: 0 }}
                            >
                              <ShieldCheck size={12} />
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          {c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{c.contact_phone}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.35rem' }}>
                        {c.last_message_text}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {isTakeover ? (
                          <span
                            className="badge"
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 800,
                              background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                              color: '#ffffff',
                              boxShadow: '0 0 8px rgba(239, 68, 68, 0.55)',
                              animation: 'pulse 2s infinite',
                              padding: '0.15rem 0.5rem',
                            }}
                          >
                            🚨 TAKEOVER NEEDED
                          </span>
                        ) : (
                          <span className={`badge ${c.conversation_mode === 'AI ACTIVE' ? 'badge-info' : 'badge-whatsapp'}`} style={{ fontSize: '0.62rem' }}>
                            {c.conversation_mode}
                          </span>
                        )}

                        {c.unread_count > 0 && !isSelected && (
                          <span style={{ background: '#25D366', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800 }}>
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
                <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {editingName ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <input
                            ref={editNameRef}
                            value={editNameValue}
                            onChange={e => setEditNameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEditName(); if (e.key === 'Escape') setEditingName(false); }}
                            style={{
                              fontSize: '0.9rem', fontWeight: 700, border: 'none',
                              borderBottom: '2px solid var(--accent-primary)',
                              background: 'transparent', color: 'var(--text-primary)',
                              outline: 'none', width: 180, padding: '0.1rem 0.2rem',
                            }}
                          />
                          <button onClick={saveEditName} disabled={savingName} title="Save" style={{ background: 'var(--success)', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '0.2rem 0.4rem', color: 'white', display: 'flex', alignItems: 'center' }}>
                            {savingName ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                          </button>
                          <button onClick={() => setEditingName(false)} title="Cancel" style={{ background: 'var(--danger)', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '0.2rem 0.4rem', color: 'white', display: 'flex', alignItems: 'center' }}>
                            <XIcon size={12} />
                          </button>
                        </div>
                      ) : (
                        <span
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                          title="Click to edit contact name"
                          onClick={startEditName}
                        >
                          {getDisplayName(selectedConv.contact_name, selectedConv.contact_phone)}
                          <Pencil size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        </span>
                      )}
                      
                      {selectedConv._is_sheet_customer && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            background: 'rgba(16, 185, 129, 0.12)',
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            padding: '0.1rem 0.45rem',
                            borderRadius: 12,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem'
                          }}
                          data-tooltip="Verified against Google Sheet Customer Master"
                          data-tooltip-pos="bottom"
                        >
                          <ShieldCheck size={11} /> Sheet Verified
                        </span>
                      )}
                      <span className="badge badge-whatsapp" style={{ fontSize: '0.65rem' }}>WhatsApp</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                      {selectedConv._sheet_customer?.company_name && (
                        <strong style={{ color: 'var(--text-secondary)' }}>{selectedConv._sheet_customer.company_name} · </strong>
                      )}
                      {selectedConv.contact_phone} · {selectedConv.property_interest || 'General Product Inquiry'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {/* Executive Conversation Mode Quick Switch Pill */}
                    {selectedConv.conversation_mode === 'AI ACTIVE' ? (
                      <button
                        onClick={() => handleModeChange('HUMAN ACTIVE')}
                        className="btn btn-sm"
                        style={{
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#059669',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          borderRadius: 20,
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          cursor: 'pointer',
                        }}
                        title="AI Auto-Reply is Live. Click to Mute AI & take over."
                      >
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                        <span>⚡ AI Copilot Active</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginLeft: '0.15rem' }}>| Mute</span>
                      </button>
                    ) : selectedConv.conversation_mode === 'HUMAN TAKEOVER REQUESTED' ? (
                      <button
                        onClick={() => handleModeChange('HUMAN ACTIVE')}
                        className="btn btn-sm"
                        style={{
                          background: 'rgba(239, 68, 68, 0.14)',
                          color: '#dc2626',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          borderRadius: 20,
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          cursor: 'pointer',
                        }}
                        title="Customer requested rates / specialist. Click to take over."
                      >
                        <span>🚨 Take Over Chat</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleModeChange('AI ACTIVE')}
                        className="btn btn-sm"
                        style={{
                          background: 'rgba(99, 102, 241, 0.12)',
                          color: 'var(--accent-primary)',
                          border: '1px solid rgba(99, 102, 241, 0.35)',
                          borderRadius: 20,
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          cursor: 'pointer',
                        }}
                        title="Manual Mode active. Click to resume AI copilot."
                      >
                        <User size={12} />
                        <span>👤 Human Mode</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginLeft: '0.15rem' }}>| Resume AI</span>
                      </button>
                    )}

                    <button className="btn btn-secondary btn-sm" onClick={() => setShowHandoffModal(true)}>
                      <UserCheck size={13} color="var(--accent-primary)" /> Assign
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setSelected360LeadId(selectedConv.lead_id || selectedConv.contact_phone || selectedConv.id)}>
                      <Eye size={13} /> 360 View
                    </button>
                  </div>
                </div>

                {/* Messages List */}
                <div
                  ref={chatContainerRef}
                  onScroll={handleChatScroll}
                  className="whatsapp-chat-messages"
                  style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: 1, overflowY: 'auto', background: 'var(--bg-primary)' }}
                >
                  {messages.map(m => {
                    const isOutbound = m.direction === 'outbound';
                    const parsed = parseMessageMedia(m);
                    let displayText = (parsed.cleanText || parsed.text || m.body || m.text || m.content || '').trim();
                    
                    if (!displayText && m.raw_payload) {
                      if (m.raw_payload.interactive?.button_reply?.title) {
                        displayText = m.raw_payload.interactive.button_reply.title;
                      } else if (m.raw_payload.text?.body) {
                        displayText = m.raw_payload.text.body;
                      }
                    }

                    const mediaUrl = parsed.mediaUrl || m.media_url;
                    const mediaType = parsed.mediaType || m.message_type || 'text';
                    const fileName = parsed.fileName;

                    // Determine interactive buttons sent with this message (if outbound)
                    const buttonsSent = m.raw_payload?.buttons || 
                      (isOutbound && (m.sender_type === 'ai' || m.sender_type === 'system') && (displayText.includes('Namaste') || displayText.includes('assist you') || displayText.includes('options below')) ? [
                        { id: 'btn_catalog', title: '📄 Get Catalog' },
                        { id: 'btn_pricing', title: '💰 Get Quote' },
                        { id: 'btn_human', title: '👤 Talk to Executive' }
                      ] : null);

                    const isButtonSelection = !isOutbound && (
                      displayText.startsWith('📄') ||
                      displayText.startsWith('💰') ||
                      displayText.startsWith('👤') ||
                      displayText.startsWith('📦') ||
                      displayText.includes('[Rate List Requested]') ||
                      m.raw_payload?.interactive?.type === 'button_reply'
                    );

                    return (
                      <div
                        key={m.id}
                        className={`whatsapp-bubble ${isOutbound ? 'outbound' : 'inbound'}`}
                        style={{
                          maxWidth: '78%',
                          alignSelf: isOutbound ? 'flex-end' : 'flex-start',
                          padding: '0.75rem 1rem',
                          borderRadius: '12px',
                          borderTopRightRadius: isOutbound ? '2px' : '12px',
                          borderTopLeftRadius: isOutbound ? '12px' : '2px',
                          fontSize: '0.82rem',
                          position: 'relative',
                          background: isOutbound
                            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.06) 100%)'
                            : 'var(--bg-card, #ffffff)',
                          border: isOutbound
                            ? '1px solid rgba(16, 185, 129, 0.28)'
                            : '1px solid var(--border-color, rgba(226, 232, 240, 0.85))',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {/* Bubble Header: Sender & Time */}
                        <div style={{ fontSize: '0.68rem', marginBottom: '0.35rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            color: isOutbound
                              ? (m.sender_type === 'human_agent' ? 'var(--accent-primary)' : '#059669')
                              : 'var(--text-secondary)'
                          }}>
                            {isOutbound ? (
                              m.sender_type === 'human_agent' ? (
                                <>
                                  <User size={11} />
                                  <span>👤 Sales Executive</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles size={11} />
                                  <span>⚡ AI Assistant</span>
                                </>
                              )
                            ) : (
                              <span>{getDisplayName(selectedConv.contact_name, selectedConv.contact_phone)}</span>
                            )}
                          </span>
                          <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                            {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>

                        {/* Button Selection Badge for Inbound */}
                        {isButtonSelection && (
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            background: 'rgba(99, 102, 241, 0.09)',
                            border: '1px solid rgba(99, 102, 241, 0.22)',
                            borderRadius: 6,
                            padding: '0.15rem 0.45rem',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            color: 'var(--accent-primary)',
                            marginBottom: '0.4rem',
                          }}>
                            <span>🔘 Button Selected</span>
                          </div>
                        )}

                        {/* Image attachment */}
                        {mediaUrl && mediaType === 'image' && (
                          <div style={{ marginBottom: displayText ? '0.45rem' : 0 }}>
                            <img src={mediaUrl} alt="attachment" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
                          </div>
                        )}

                        {/* Audio attachment */}
                        {mediaUrl && mediaType === 'audio' && (
                          <div style={{ marginBottom: displayText ? '0.45rem' : 0 }}>
                            <audio controls style={{ width: '100%', minWidth: 220 }}>
                              <source src={mediaUrl} />
                            </audio>
                          </div>
                        )}

                        {/* Document / PDF attachment */}
                        {mediaUrl && mediaType === 'document' && (
                          <div style={{ marginBottom: displayText ? '0.55rem' : 0 }}>
                            <a
                              href={mediaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.65rem',
                                padding: '0.65rem 0.85rem',
                                background: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: 8,
                                color: 'var(--text-primary)',
                                textDecoration: 'none',
                                transition: 'all 0.2s',
                              }}
                            >
                              <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>📄</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {fileName || (mediaUrl.split('/').pop().split('?')[0]) || 'Sobha_Infratech_Product_Catalog.pdf'}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', fontWeight: 500 }}>
                                  PDF Document · Click to View / Download ↗
                                </div>
                              </div>
                            </a>
                          </div>
                        )}

                        {/* Message Text */}
                        {displayText && (
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, wordBreak: 'break-word', color: 'var(--text-primary)' }}>
                            {displayText}
                          </div>
                        )}

                        {/* Interactive Quick Reply Buttons Preview for Outbound */}
                        {buttonsSent && buttonsSent.length > 0 && (
                          <div style={{ marginTop: '0.65rem', borderTop: '1px solid rgba(0, 0, 0, 0.06)', paddingTop: '0.5rem' }}>
                            <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 500 }}>
                              Interactive options sent to customer:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                              {buttonsSent.map((btn, bIdx) => (
                                <span
                                  key={bIdx}
                                  style={{
                                    fontSize: '0.72rem',
                                    padding: '0.22rem 0.55rem',
                                    borderRadius: 16,
                                    background: 'rgba(16, 185, 129, 0.09)',
                                    border: '1px solid rgba(16, 185, 129, 0.25)',
                                    color: 'var(--text-primary)',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                  }}
                                >
                                  {btn.title || btn}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Read / Delivery / Failed Status Indicator */}
                        {isOutbound && (
                          <div style={{ textAlign: 'right', marginTop: '0.35rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.3rem' }}>
                            {m.status === 'failed' ? (
                              <span
                                style={{
                                  fontSize: '0.66rem',
                                  color: '#ef4444',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  background: 'rgba(239, 68, 68, 0.08)',
                                  padding: '0.15rem 0.4rem',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(239, 68, 68, 0.25)'
                                }}
                                title={m.error_message || 'Delivery failed by Meta'}
                              >
                                <AlertTriangle size={11} color="#ef4444" />
                                <span>Failed {m.error_message?.includes('131042') ? '(Meta Card Required)' : m.error_message?.includes('131047') ? '(24h Expired)' : ''}</span>
                              </span>
                            ) : (
                              <>
                                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                  {m.status === 'read' ? 'Read' : m.status === 'delivered' ? 'Delivered' : 'Sent'}
                                </span>
                                {m.status === 'read' ? (
                                  <CheckCheck size={13} color="#3b82f6" title="Read by recipient" />
                                ) : m.status === 'delivered' ? (
                                  <CheckCheck size={13} color="var(--accent-secondary)" title="Delivered to recipient" />
                                ) : (
                                  <Check size={13} color="var(--text-muted)" title="Sent to Meta server" />
                                )}
                              </>
                            )}
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

                {/* Smart Quick Reply Chips (Using main name without surnames) */}
                <div style={{ padding: '0.4rem 1.25rem', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.4rem', overflowX: 'auto', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', flexShrink: 0 }}>
                    Quick Message:
                  </span>
                  {(() => {
                    const cleanMain = extractMainName(selectedConv.contact_name);
                    const helloLabel = cleanMain ? `👋 Hello ${cleanMain}` : '👋 Hello';
                    const helloText = cleanMain
                      ? `Hello ${cleanMain}, how can I assist you with your construction material requirements today?`
                      : `Hello, how can I assist you with your construction material requirements today?`;
                    return [
                      { label: helloLabel, text: helloText },
                      { label: '📄 Send Catalog', text: `Please find our official *Sobhainfra Tech Product Catalog & Technical Specification Guide* attached in PDF format. Feel free to reply if you need project rates.` },
                      { label: '💰 Bulk Quotation', text: `I am preparing our best volume quotation for your project. Could you please confirm the required quantity (bags) and delivery site location?` },
                      { label: '📞 Executive Callback', text: `Our senior technical sales specialist will connect with you on this number shortly. Please let us know the most convenient time to call!` },
                    ];
                  })().map((qr, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setMsgInput(qr.text)}
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {qr.label}
                    </button>
                  ))}
                </div>

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
                    placeholder={attachedFile ? 'Add a caption (optional)...' : (extractMainName(selectedConv.contact_name) ? `Reply to ${extractMainName(selectedConv.contact_name)}...` : `Reply to ${getDisplayName(selectedConv.contact_name, selectedConv.contact_phone)}...`)}
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
                Select a conversation from the left pane, or switch to the <strong>Sheet Customers</strong> tab to start a new chat.
              </div>
            )}
          </div>

          {/* PANE 3: HUMAN TAKEOVER, REASSIGNMENT & AI FEEDBACK LOOP */}
          <div className="whatsapp-right-pane" style={{ borderLeft: '1px solid var(--border-color)', background: 'var(--bg-secondary)', padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {selectedConv ? (
              <>
                {/* 1. Executive Mode & Copilot Control */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Conversation Control
                    </span>
                    {selectedConv.conversation_mode === 'HUMAN ACTIVE' ? (
                      <span style={{ fontSize: '0.68rem', padding: '0.18rem 0.5rem', borderRadius: 9999, background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)' }} />
                        Manual Mode
                      </span>
                    ) : selectedConv.conversation_mode === 'HUMAN TAKEOVER REQUESTED' ? (
                      <span style={{ fontSize: '0.68rem', padding: '0.18rem 0.5rem', borderRadius: 9999, background: 'rgba(239, 68, 68, 0.12)', color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} />
                        Takeover Alert
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.68rem', padding: '0.18rem 0.5rem', borderRadius: 9999, background: 'rgba(16, 185, 129, 0.12)', color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                        AI Copilot Active
                      </span>
                    )}
                  </div>

                  {/* Segmented Switcher */}
                  <div style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: '0.2rem', borderRadius: '10px', gap: '0.25rem' }}>
                    <button
                      type="button"
                      onClick={() => handleModeChange('AI ACTIVE')}
                      style={{
                        flex: 1,
                        padding: '0.45rem 0.5rem',
                        borderRadius: '7px',
                        border: 'none',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        background: selectedConv.conversation_mode === 'AI ACTIVE' ? 'var(--bg-card)' : 'transparent',
                        color: selectedConv.conversation_mode === 'AI ACTIVE' ? 'var(--accent-primary)' : 'var(--text-muted)',
                        boxShadow: selectedConv.conversation_mode === 'AI ACTIVE' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      <Sparkles size={12} color={selectedConv.conversation_mode === 'AI ACTIVE' ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                      <span>AI Copilot</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeChange('HUMAN ACTIVE')}
                      style={{
                        flex: 1,
                        padding: '0.45rem 0.5rem',
                        borderRadius: '7px',
                        border: 'none',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        background: (selectedConv.conversation_mode === 'HUMAN ACTIVE' || selectedConv.conversation_mode === 'HUMAN TAKEOVER REQUESTED') ? 'var(--bg-card)' : 'transparent',
                        color: (selectedConv.conversation_mode === 'HUMAN ACTIVE' || selectedConv.conversation_mode === 'HUMAN TAKEOVER REQUESTED') ? 'var(--accent-primary)' : 'var(--text-muted)',
                        boxShadow: (selectedConv.conversation_mode === 'HUMAN ACTIVE' || selectedConv.conversation_mode === 'HUMAN TAKEOVER REQUESTED') ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      <User size={12} color={(selectedConv.conversation_mode === 'HUMAN ACTIVE' || selectedConv.conversation_mode === 'HUMAN TAKEOVER REQUESTED') ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                      <span>Human Agent</span>
                    </button>
                  </div>

                  {/* Contextual Action & Guidance Card */}
                  {selectedConv.conversation_mode === 'HUMAN TAKEOVER REQUESTED' ? (
                    <div style={{ background: 'rgba(239, 68, 68, 0.07)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', padding: '0.65rem 0.75rem', fontSize: '0.72rem' }}>
                      <div style={{ color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>🚨 Executive Escalation Requested</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.4 }}>
                        Customer requested quotation or executive callback. Smart Copilot continues answering product & technical questions until you send a manual reply.
                      </div>
                      <button
                        onClick={() => handleModeChange('HUMAN ACTIVE')}
                        className="btn btn-sm btn-primary"
                        style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.74rem', fontWeight: 600, justifyContent: 'center', background: '#dc2626', borderColor: '#dc2626' }}
                      >
                        <User size={12} /> Take Over Chat Now
                      </button>
                    </div>
                  ) : selectedConv.conversation_mode === 'HUMAN ACTIVE' ? (
                    <div style={{ background: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '8px', padding: '0.65rem 0.75rem', fontSize: '0.72rem' }}>
                      <div style={{ color: 'var(--accent-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>👤 Hybrid Executive Mode</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.4 }}>
                        You are in manual control. When you are away or idle for &gt; 15 mins, Smart Copilot safely answers product and technical questions so the customer is never left waiting!
                      </div>
                      <button
                        onClick={() => handleModeChange('AI ACTIVE')}
                        className="btn btn-sm btn-secondary"
                        style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.74rem', justifyContent: 'center' }}
                      >
                        <Sparkles size={12} color="var(--accent-primary)" /> Set to 100% AI Autopilot
                      </button>
                    </div>
                  ) : (
                    <div style={{ background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '0.65rem 0.75rem', fontSize: '0.72rem' }}>
                      <div style={{ color: '#059669', fontWeight: 600 }}>
                        ⚡ 100% AI Autopilot
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.4 }}>
                        AI answers product, specification, and company queries automatically 24/7.
                      </div>
                      <button
                        onClick={() => handleModeChange('HUMAN ACTIVE')}
                        className="btn btn-sm btn-secondary"
                        style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.74rem', justifyContent: 'center' }}
                      >
                        <User size={12} /> Mute AI & Switch to Manual
                      </button>
                    </div>
                  )}
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
                    <div style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '0.45rem', borderRadius: 6, fontSize: '0.72rem', textAlign: 'center', fontWeight: 600 }}>
                      ✓ Feedback Logged!
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
          TAB 2: DEDICATED GOOGLE SHEET CUSTOMER DIRECTORY (CUSTOMER TYPE SECTION)
         ========================================================================= */}
      {activeTab === 'customers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Top KPI & Controls Banner */}
          <div className="glass-card" style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldCheck size={20} color="#10b981" />
                  Google Sheet Customer Directory
                </h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Live verified customer list synced from Google Sheet. Select any customer to chat immediately in the Live Inbox.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-secondary"
                  onClick={handleSheetSync}
                  disabled={syncingSheet}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                >
                  <RotateCcw size={14} className={syncingSheet ? 'animate-spin' : ''} />
                  {syncingSheet ? 'Syncing...' : 'Sync Live Sheet'}
                </button>
                <a
                  href="https://docs.google.com/spreadsheets/d/1phUUKnsQcWR9kIPjNsOGr4lzu7Torj8W1XMziRNuncw/edit?gid=0#gid=0"
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
                >
                  <ExternalLink size={13} /> Open Sheet ↗
                </a>
              </div>
            </div>

            {/* Quick Filter & Search Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              {/* Filter Pills */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: `All Customers (${customerMaster.length})` },
                  { id: 'with_phone', label: `📱 Verified Phone (${totalWithPhone})`, activeColor: '#10b981' },
                  { id: 'active_chat', label: `💬 Active in Inbox (${sheetCustomerConvCount})`, activeColor: 'var(--accent-primary)' },
                  { id: 'missing_phone', label: `⚠️ Phone Missing (${customerMaster.length - totalWithPhone})`, activeColor: '#d97706' },
                ].map(f => {
                  const isActive = sheetFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => { setSheetFilter(f.id); setCustomerPage(1); }}
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: isActive ? 700 : 500,
                        padding: '0.3rem 0.75rem',
                        borderRadius: '9999px',
                        border: isActive ? `1.5px solid ${f.activeColor || 'var(--accent-primary)'}` : '1px solid var(--border-color)',
                        background: isActive ? (f.activeColor ? `${f.activeColor}18` : 'var(--accent-primary-bg, rgba(99,102,241,0.12))') : 'var(--bg-tertiary)',
                        color: isActive ? (f.activeColor || 'var(--accent-primary)') : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {/* Search Box */}
              <div style={{ position: 'relative', minWidth: '260px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search company, person, or phone..."
                  value={sheetSearch}
                  onChange={e => { setSheetSearch(e.target.value); setCustomerPage(1); }}
                  style={{ paddingLeft: '32px', fontSize: '0.8rem', height: '34px', width: '100%' }}
                />
                {sheetSearch && (
                  <button
                    onClick={() => setSheetSearch('')}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    <XIcon size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Customers Table */}
          <div className="glass-card table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer / Contact Person</th>
                  <th>Company / Business Name</th>
                  <th>Contact Number</th>
                  <th>Chat in Live Inbox</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      <Users size={32} style={{ opacity: 0.35, margin: '0 auto 0.5rem auto' }} />
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>No customers match the current filter</div>
                      <div style={{ fontSize: '0.75rem' }}>Try clearing the search or switching the filter above.</div>
                    </td>
                  </tr>
                ) : (
                  paginatedCustomers.map(cust => {
                    const rawPhone = (cust.contact_number || '').trim();
                    const digits = rawPhone.replace(/\D/g, '').slice(-10);
                    const hasPhone = digits.length === 10;
                    const mainName = extractMainName(cust.contact_person, cust.company_name);

                    // Find if there is an active conversation matching this phone
                    const existingChat = conversations.find(c => {
                      const cDigits = (c.contact_phone || '').replace(/\D/g, '').slice(-10);
                      return cDigits && digits && cDigits === digits;
                    });

                    return (
                      <tr key={cust.id || cust.sheet_row_index} style={{ opacity: hasPhone ? 1 : 0.72 }}>
                        {/* Customer / Person Name */}
                        <td>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                            {cust.contact_person || '—'}
                          </div>
                          {cust.contact_person && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                              Primary Name: <strong style={{ color: 'var(--accent-primary)' }}>{mainName}</strong>
                            </div>
                          )}
                        </td>

                        {/* Company Name */}
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {cust.company_name}
                          </div>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            Sheet Row #{cust.sheet_row_index}
                          </span>
                        </td>

                        {/* Contact Number */}
                        <td>
                          {hasPhone ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {cust.contact_number}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  color: '#10b981',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: 10,
                                }}
                              >
                                Verified
                              </span>
                            </div>
                          ) : (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                background: 'rgba(245, 158, 11, 0.12)',
                                color: '#d97706',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                padding: '0.15rem 0.5rem',
                                borderRadius: 12,
                              }}
                              data-tooltip="Phone missing in Google Sheet column C. Add phone in sheet and click Sync Sheet."
                              data-tooltip-pos="bottom"
                            >
                              ⚠️ No Phone in Sheet
                            </span>
                          )}
                        </td>

                        {/* Chat Status */}
                        <td>
                          {existingChat ? (
                            <div>
                              <span className="badge badge-success" style={{ fontSize: '0.65rem', marginBottom: '0.2rem' }}>
                                Active Chat
                              </span>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {existingChat.last_message_text}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              Ready for outreach
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', alignItems: 'center' }}>
                            {hasPhone ? (
                              <>
                                <button
                                  className="btn btn-whatsapp btn-sm"
                                  onClick={() => handleOpenCustomerChat(cust)}
                                  data-tooltip={`Open live chat with ${mainName} in Inbox`}
                                  data-tooltip-pos="left"
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                                >
                                  <MessageCircle size={13} /> Chat Now
                                </button>
                                <a
                                  href={`tel:${cust.contact_number}`}
                                  className="btn btn-secondary btn-sm"
                                  data-tooltip={`Call ${cust.contact_number}`}
                                  data-tooltip-pos="left"
                                  style={{ padding: '0.25rem 0.45rem', display: 'flex', alignItems: 'center' }}
                                >
                                  <Phone size={12} />
                                </a>
                              </>
                            ) : (
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled
                                style={{ opacity: 0.5, cursor: 'not-allowed', fontSize: '0.7rem', padding: '0.25rem 0.55rem' }}
                                data-tooltip="Disabled: Add phone number in Google Sheet first"
                                data-tooltip-pos="left"
                              >
                                No Phone
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {filteredSheetCustomers.length > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)',
                background: 'var(--bg-tertiary)', fontSize: '0.78rem', flexWrap: 'wrap', gap: '0.75rem'
              }}>
                <div style={{ color: 'var(--text-muted)' }}>
                  Showing <strong>{(customerPage - 1) * PAGE_SIZE + 1}</strong> to <strong>{Math.min(customerPage * PAGE_SIZE, filteredSheetCustomers.length)}</strong> of <strong>{filteredSheetCustomers.length}</strong> customers
                </div>
                {totalCustomerPages > 1 && (
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={customerPage <= 1}
                      onClick={() => setCustomerPage(p => Math.max(1, p - 1))}
                      style={{ padding: '0.2rem 0.5rem', opacity: customerPage <= 1 ? 0.4 : 1 }}
                    >
                      Prev
                    </button>
                    <span style={{ padding: '0 0.5rem', fontWeight: 600 }}>
                      {customerPage} / {totalCustomerPages}
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={customerPage >= totalCustomerPages}
                      onClick={() => setCustomerPage(p => Math.min(totalCustomerPages, p + 1))}
                      style={{ padding: '0.2rem 0.5rem', opacity: customerPage >= totalCustomerPages ? 0.4 : 1 }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: BROADCAST CAMPAIGNS & TEMPLATES
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
                      <td style={{ fontWeight: 700 }}>{(c.total_sent || c.sent || 0).toLocaleString()}</td>
                      <td style={{ color: 'var(--success)' }}>{(c.delivered || c.total_delivered || c.total_sent || 0).toLocaleString()}</td>
                      <td style={{ color: 'var(--warning)', fontWeight: 600 }}>{(c.total_read ?? c.read_count ?? c.read ?? 0).toLocaleString()}</td>
                      <td style={{ color: 'var(--whatsapp)', fontWeight: 600 }}>{(c.total_replied ?? c.replied ?? c.replies ?? 0).toLocaleString()}</td>
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
