import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Send, Plus, Trash2, Edit2, CheckCircle2, AlertTriangle,
  Zap, RefreshCw, Database, Terminal, Shield, Sparkles, Activity,
  ChevronRight, ArrowRight, IndianRupee, Layers, HelpCircle, ExternalLink,
  FileText, Upload, Check, Copy, Eye, AlertCircle, FileCheck, UserCheck, MessageSquare, Save, Sliders,
  CornerDownRight, Smartphone, X
} from 'lucide-react';
import {
  getAiKnowledge, createAiKnowledge, deleteAiKnowledge,
  getAiRuns, runAiSalesAgent, getOrgSettings, updateOrgSetting
} from '../lib/db';
import { uploadToWhatsAppMedia } from '../lib/storage';
import './Pages.css';

const SCORING_RULES = [
  { trigger: 'Explicit Buying Intent ("Ready to book")', delta: '+30 pts', type: 'positive' },
  { trigger: 'Formal Quotation Requested', delta: '+20 pts', type: 'positive' },
  { trigger: 'Human Salesperson Requested', delta: '+20 pts', type: 'positive' },
  { trigger: 'Specific Quantity / Unit Provided', delta: '+10 pts', type: 'positive' },
  { trigger: 'Rate Chart / Pricing Requested', delta: '+10 pts', type: 'positive' },
  { trigger: 'Downloadable Brochure Requested', delta: '+5 pts', type: 'positive' },
  { trigger: 'Price Objection ("Too expensive / Rate kam karo")', delta: '-10 pts', type: 'negative' },
  { trigger: 'Not Interested / Postponed', delta: '-40 pts', type: 'negative' },
  { trigger: 'Opt-Out Request ("STOP / UNSUBSCRIBE")', delta: '-100 pts', type: 'critical' },
];

const DEFAULT_WELCOME_BUTTONS = [
  {
    id: 'btn_catalog',
    title: '📄 Get Catalog',
    action: 'catalog',
    response_text: '',
    sub_buttons: [
      { id: 'sub_catalog_spec', title: '🔬 Tech Specs', action: 'custom', response_text: 'Our technical guide covers mixing ratios (1:4 water cement), tensile adhesion (>1.2 N/mm²), and pot life (3 hours).' },
      { id: 'sub_catalog_talk', title: '👤 Talk to Exec', action: 'human', response_text: 'Connecting you with our product specialist...' }
    ]
  },
  {
    id: 'btn_pricing',
    title: '💰 Get Quote',
    action: 'quote',
    response_text: '',
    sub_buttons: [
      { id: 'sub_rate_pdf', title: '📊 Rate List PDF', action: 'rate_list_pdf', response_text: 'Sending our latest official rate list schedule...' },
      { id: 'sub_rate_call', title: '📞 Call Executive', action: 'human', response_text: 'Our sales executive will call you shortly.' }
    ]
  },
  {
    id: 'btn_human',
    title: '👤 Talk to Exec',
    action: 'human',
    response_text: '',
    sub_buttons: []
  }
];

const Chatbot = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('flows'); // 'flows' | 'simulator' | 'knowledge' | 'rules' | 'logs'
  
  // Bot Flows & Dynamic PDF Assets State
  const [flowSettings, setFlowSettings] = useState({
    whatsapp_catalog_pdf_url: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
    whatsapp_catalog_filename: 'Sobha_Infratech_Product_Catalog.pdf',
    whatsapp_rate_list_pdf_url: '',
    whatsapp_rate_list_filename: 'Sobha_Infratech_Official_Rate_List.pdf',
    whatsapp_auto_send_rate_list: 'true',
    whatsapp_default_salesperson: 'Senior Sales Executive',
    whatsapp_talk_executive_message: `👋 Namaste {name}!\n\nI have notified our Senior Sales Team regarding your inquiry.\n\n📞 A dedicated sales specialist has been alerted and will connect with you directly on this number shortly!\n\n💡 *In the meantime, our AI Assistant is right here 24/7:* feel free to ask about product technical specifications, AAC block mortar coverage, plaster mixing ratios, or packing sizes.\n\nWhat can I help you check right now?`,
    whatsapp_get_quote_message: `💰 Namaste {name}!\n\nOur official rate lists and customized project quotations are provided directly by our senior sales specialists based on your delivery location and order quantity.\n\nI have forwarded your request to our Senior Sales Team who will share the latest rate schedule and connect with you shortly! 📞\n\nIn the meantime, feel free to ask any technical, application, or packing questions about our products right here!`,
    whatsapp_welcome_message: `👋 Namaste {name}! Welcome to *Sobhainfra Tech Pvt. Ltd.*\n\nWe manufacture high-performance construction chemicals, AAC block fix mortars, ready-mix plasters, and tile adhesives.\n\nHow can we help you today? Please choose an option below or type your inquiry:`,
    whatsapp_enable_welcome_buttons: 'true',
    whatsapp_welcome_buttons: DEFAULT_WELCOME_BUTTONS,
  });
  const [activeWelcomeButtonIdx, setActiveWelcomeButtonIdx] = useState(0);
  const [simulatedSelectedBtn, setSimulatedSelectedBtn] = useState(null);
  const [loadingFlowSettings, setLoadingFlowSettings] = useState(true);
  const [savingFlowSettings, setSavingFlowSettings] = useState(false);
  const [catalogProgress, setCatalogProgress] = useState(null);
  const [rateListProgress, setRateListProgress] = useState(null);
  const [flowSaveSuccess, setFlowSaveSuccess] = useState(false);

  // Simulator State
  const [messages, setMessages] = useState([
    { id: 1, sender: 'bot', text: '👋 Hello! I am your Bounded AI Sales Assistant. How can I assist you with our product catalog, specifications, or official pricing today?', toolCalls: [] }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeInspectorTool, setActiveInspectorTool] = useState(null);
  const [lastObservability, setLastObservability] = useState(null);

  // Knowledge Base State
  const [knowledgeList, setKnowledgeList] = useState([]);
  const [loadingKB, setLoadingKB] = useState(true);
  const [showAddKB, setShowAddKB] = useState(false);
  const [kbForm, setKbForm] = useState({ category: 'Pricing', title: '', content: '' });
  const [savingKB, setSavingKB] = useState(false);

  // Logs State
  const [aiRuns, setAiRuns] = useState([]);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadFlowSettings();
    loadKB();
    loadRuns();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadFlowSettings = async () => {
    setLoadingFlowSettings(true);
    try {
      const { data } = await getOrgSettings();
      if (data) {
        let loadedButtons = DEFAULT_WELCOME_BUTTONS;
        if (data.whatsapp_welcome_buttons) {
          try {
            const parsed = typeof data.whatsapp_welcome_buttons === 'string'
              ? JSON.parse(data.whatsapp_welcome_buttons)
              : data.whatsapp_welcome_buttons;
            if (Array.isArray(parsed) && parsed.length > 0) {
              loadedButtons = parsed;
            }
          } catch (e) {
            console.warn('[Chatbot] parse welcome buttons error:', e);
          }
        }

        setFlowSettings(prev => ({
          ...prev,
          whatsapp_catalog_pdf_url: data.whatsapp_catalog_pdf_url || prev.whatsapp_catalog_pdf_url,
          whatsapp_catalog_filename: data.whatsapp_catalog_filename || prev.whatsapp_catalog_filename,
          whatsapp_rate_list_pdf_url: data.whatsapp_rate_list_pdf_url || '',
          whatsapp_rate_list_filename: data.whatsapp_rate_list_filename || prev.whatsapp_rate_list_filename,
          whatsapp_auto_send_rate_list: data.whatsapp_auto_send_rate_list !== undefined ? String(data.whatsapp_auto_send_rate_list) : 'true',
          whatsapp_default_salesperson: data.whatsapp_default_salesperson || 'Pooja Kumari',
          whatsapp_talk_executive_message: data.whatsapp_talk_executive_message || prev.whatsapp_talk_executive_message,
          whatsapp_get_quote_message: data.whatsapp_get_quote_message || prev.whatsapp_get_quote_message,
          whatsapp_welcome_message: data.whatsapp_welcome_message || prev.whatsapp_welcome_message,
          whatsapp_enable_welcome_buttons: data.whatsapp_enable_welcome_buttons !== undefined ? String(data.whatsapp_enable_welcome_buttons) : 'true',
          whatsapp_welcome_buttons: loadedButtons,
        }));
      }
    } catch (err) {
      console.warn('[Chatbot] loadFlowSettings error:', err.message);
    } finally {
      setLoadingFlowSettings(false);
    }
  };

  const handleSaveFlowSettings = async () => {
    setSavingFlowSettings(true);
    setFlowSaveSuccess(false);
    try {
      const entries = Object.entries(flowSettings);
      for (const [k, v] of entries) {
        await updateOrgSetting(k, v);
      }
      setFlowSaveSuccess(true);
      setTimeout(() => setFlowSaveSuccess(false), 4000);
    } catch (err) {
      console.error('[Chatbot] saveFlowSettings error:', err);
    } finally {
      setSavingFlowSettings(false);
    }
  };

  const handleAddWelcomeButton = () => {
    const current = flowSettings.whatsapp_welcome_buttons || [];
    if (current.length >= 3) return;
    const newIdx = current.length + 1;
    const newBtn = {
      id: `btn_${Date.now()}`,
      title: `Option ${newIdx}`,
      action: 'custom',
      response_text: '',
      sub_buttons: []
    };
    setFlowSettings(prev => ({
      ...prev,
      whatsapp_welcome_buttons: [...(prev.whatsapp_welcome_buttons || []), newBtn]
    }));
    setActiveWelcomeButtonIdx(current.length);
  };

  const handleRemoveWelcomeButton = (idxToRemove) => {
    setFlowSettings(prev => {
      const updated = (prev.whatsapp_welcome_buttons || []).filter((_, i) => i !== idxToRemove);
      return { ...prev, whatsapp_welcome_buttons: updated };
    });
    if (activeWelcomeButtonIdx >= idxToRemove && activeWelcomeButtonIdx > 0) {
      setActiveWelcomeButtonIdx(activeWelcomeButtonIdx - 1);
    }
  };

  const handleUpdateWelcomeButton = (idx, field, value) => {
    setFlowSettings(prev => {
      const updated = [...(prev.whatsapp_welcome_buttons || [])];
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], [field]: value };
      }
      return { ...prev, whatsapp_welcome_buttons: updated };
    });
  };

  const handleAddSubButton = (buttonIdx) => {
    setFlowSettings(prev => {
      const updated = [...(prev.whatsapp_welcome_buttons || [])];
      const target = updated[buttonIdx];
      if (!target) return prev;
      const subList = target.sub_buttons || [];
      if (subList.length >= 3) return prev;
      const newSub = {
        id: `sub_${Date.now()}`,
        title: `Sub Option ${subList.length + 1}`,
        action: 'custom',
        response_text: ''
      };
      updated[buttonIdx] = { ...target, sub_buttons: [...subList, newSub] };
      return { ...prev, whatsapp_welcome_buttons: updated };
    });
  };

  const handleUpdateSubButton = (buttonIdx, subIdx, field, value) => {
    setFlowSettings(prev => {
      const updated = [...(prev.whatsapp_welcome_buttons || [])];
      const target = updated[buttonIdx];
      if (!target || !target.sub_buttons || !target.sub_buttons[subIdx]) return prev;
      const updatedSubs = [...target.sub_buttons];
      updatedSubs[subIdx] = { ...updatedSubs[subIdx], [field]: value };
      updated[buttonIdx] = { ...target, sub_buttons: updatedSubs };
      return { ...prev, whatsapp_welcome_buttons: updated };
    });
  };

  const handleRemoveSubButton = (buttonIdx, subIdx) => {
    setFlowSettings(prev => {
      const updated = [...(prev.whatsapp_welcome_buttons || [])];
      const target = updated[buttonIdx];
      if (!target || !target.sub_buttons) return prev;
      const updatedSubs = target.sub_buttons.filter((_, i) => i !== subIdx);
      updated[buttonIdx] = { ...target, sub_buttons: updatedSubs };
      return { ...prev, whatsapp_welcome_buttons: updated };
    });
  };

  const handleCatalogUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a valid PDF file for the Product Catalog.');
      return;
    }
    setCatalogProgress(15);
    try {
      const publicUrl = await uploadToWhatsAppMedia(file, 'catalog', setCatalogProgress);
      if (publicUrl) {
        const newSettings = {
          ...flowSettings,
          whatsapp_catalog_pdf_url: publicUrl,
          whatsapp_catalog_filename: file.name,
        };
        setFlowSettings(newSettings);
        await updateOrgSetting('whatsapp_catalog_pdf_url', publicUrl);
        await updateOrgSetting('whatsapp_catalog_filename', file.name);
        setFlowSaveSuccess(true);
        setTimeout(() => setFlowSaveSuccess(false), 4000);
      }
    } catch (err) {
      alert('Upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setTimeout(() => setCatalogProgress(null), 1000);
    }
  };

  const handleRateListUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a valid PDF file for the Rate List.');
      return;
    }
    setRateListProgress(15);
    try {
      const publicUrl = await uploadToWhatsAppMedia(file, 'ratelist', setRateListProgress);
      if (publicUrl) {
        const newSettings = {
          ...flowSettings,
          whatsapp_rate_list_pdf_url: publicUrl,
          whatsapp_rate_list_filename: file.name,
        };
        setFlowSettings(newSettings);
        await updateOrgSetting('whatsapp_rate_list_pdf_url', publicUrl);
        await updateOrgSetting('whatsapp_rate_list_filename', file.name);
        setFlowSaveSuccess(true);
        setTimeout(() => setFlowSaveSuccess(false), 4000);
      }
    } catch (err) {
      alert('Upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setTimeout(() => setRateListProgress(null), 1000);
    }
  };

  const loadKB = async () => {
    setLoadingKB(true);
    const { data } = await getAiKnowledge();
    setKnowledgeList(data || []);
    setLoadingKB(false);
  };

  const loadRuns = async () => {
    const { data } = await getAiRuns();
    setAiRuns(data || []);
  };

  const handleSendSimulator = async (e) => {
    e.preventDefault();
    if (!userInput.trim() || isProcessing) return;

    const userText = userInput;
    setUserInput('');
    const userMsg = { id: Date.now(), sender: 'user', text: userText, toolCalls: [] };
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);

    const result = await runAiSalesAgent({
      messageText: userText,
      history: messages.map(m => ({ sender_type: m.sender === 'user' ? 'customer' : 'ai', body: m.text })),
    });

    const botMsg = {
      id: Date.now() + 1,
      sender: 'bot',
      text: result.responseText || 'Our sales executive will contact you shortly.',
      toolCalls: result.toolCalls || [],
    };

    setMessages(prev => [...prev, botMsg]);
    if (result.toolCalls && result.toolCalls.length > 0) {
      setActiveInspectorTool(result.toolCalls[0]);
    }
    setLastObservability(result.observability || null);
    setIsProcessing(false);
    loadRuns();
  };

  const handleCreateKB = async (e) => {
    e.preventDefault();
    if (!kbForm.title.trim() || !kbForm.content.trim()) return;
    setSavingKB(true);
    const { data } = await createAiKnowledge(kbForm);
    if (data) {
      setKnowledgeList(prev => [data, ...prev]);
      setShowAddKB(false);
      setKbForm({ category: 'Pricing', title: '', content: '' });
    }
    setSavingKB(false);
  };

  const handleDeleteKB = async (id) => {
    await deleteAiKnowledge(id);
    setKnowledgeList(prev => prev.filter(k => k.id !== id));
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">AI Sales Assistant</h1>
          <p className="page-subtitle">Bounded conversational qualification, tool registry, and pricing guardrail rules.</p>
        </div>

        {/* Tab Navigation */}
        <div className="page-actions">
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
            <Sparkles size={14} /> Interactive Flow Studio ↗
          </button>

          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden', flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={() => setActiveTab('flows')}
              style={{
                borderRadius: 0,
                background: activeTab === 'flows' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'flows' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
                fontWeight: activeTab === 'flows' ? 600 : 400,
              }}
            >
              <Sliders size={14} /> Bot Flows & PDF Assets
            </button>
            <button
              className="btn"
              onClick={() => setActiveTab('simulator')}
              style={{
                borderRadius: 0,
                background: activeTab === 'simulator' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'simulator' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <Terminal size={14} /> Agent Simulator
            </button>
            <button
              className="btn"
              onClick={() => setActiveTab('knowledge')}
              style={{
                borderRadius: 0,
                background: activeTab === 'knowledge' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'knowledge' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <Database size={14} /> Knowledge Base ({knowledgeList.length})
            </button>
            <button
              className="btn"
              onClick={() => setActiveTab('rules')}
              style={{
                borderRadius: 0,
                background: activeTab === 'rules' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'rules' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <Shield size={14} /> Scoring & Guardrails
            </button>
            <button
              className="btn"
              onClick={() => setActiveTab('logs')}
              style={{
                borderRadius: 0,
                background: activeTab === 'logs' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'logs' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <Activity size={14} /> Observability Logs
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TAB 0: BOT FLOWS, BUTTON REPLIES & DYNAMIC PDF ASSETS
         ========================================================================= */}
      {activeTab === 'flows' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Header Banner */}
          <div className="glass-card" style={{ padding: '1.25rem 1.5rem', background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(16,185,129,0.08))', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.35rem 0', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Sparkles size={20} color="var(--accent-primary)" /> WhatsApp Bot Flows, Button Replies & Dynamic PDF Assets
                </h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Customize what the bot replies when customers click buttons (e.g. <em>"Talk to Executive"</em>, <em>"Get Quote"</em>) or first send a message.
                  Upload and update your official <strong>Product Catalog</strong> and <strong>Rate List PDF</strong> anytime — changes reflect on WhatsApp instantly!
                </p>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleSaveFlowSettings}
                disabled={savingFlowSettings}
                style={{ minWidth: '160px' }}
              >
                {savingFlowSettings ? (
                  <><RefreshCw size={15} className="spin" /> Saving...</>
                ) : flowSaveSuccess ? (
                  <><CheckCircle2 size={15} color="#10B981" /> Saved to Cloud!</>
                ) : (
                  <><Save size={15} /> Save Flow Settings</>
                )}
              </button>
            </div>
            {flowSaveSuccess && (
              <div style={{ marginTop: '0.85rem', padding: '0.6rem 1rem', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', fontSize: '0.82rem', color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} /> All WhatsApp button responses and PDF asset URLs have been synced to the live webhook server!
              </div>
            )}
          </div>

          {/* Two-Column Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
            
            {/* COLUMN 1: Dynamic PDF Assets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Card 1A: Product Catalog / Brochure */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '8px', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                      <FileText size={22} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Product Catalog / Brochure PDF</h3>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sent when customer clicks "📄 Get Catalog"</span>
                    </div>
                  </div>
                  <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Live on WhatsApp</span>
                </div>

                <div style={{ background: 'var(--bg-tertiary)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                      {flowSettings.whatsapp_catalog_filename || 'Sobha_Infratech_Product_Catalog.pdf'}
                    </div>
                    {flowSettings.whatsapp_catalog_pdf_url && (
                      <a
                        href={flowSettings.whatsapp_catalog_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}
                      >
                        <Eye size={12} /> View PDF
                      </a>
                    )}
                  </div>
                </div>

                <div style={{ border: '2px dashed var(--border-color)', borderRadius: '8px', padding: '1.25rem', textAlign: 'center', background: 'var(--bg-secondary)', position: 'relative' }}>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleCatalogUpload}
                    disabled={catalogProgress !== null}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', zIndex: 2 }}
                  />
                  <Upload size={24} style={{ color: 'var(--accent-primary)', marginBottom: '0.4rem' }} />
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Click or Drag to Upload New Catalog PDF</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Replaces the active brochure sent to all WhatsApp customers</div>
                  {catalogProgress !== null && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${catalogProgress}%`, background: 'var(--accent-primary)', transition: 'width 0.3s' }} />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', marginTop: '0.3rem' }}>Uploading {catalogProgress}%...</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 1B: Official Rate List / Price Schedule */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '8px', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}>
                      <IndianRupee size={22} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Official Rate List / Price Chart PDF</h3>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto-dispatched on "💰 Get Quote" or rate inquiries</span>
                    </div>
                  </div>
                  {flowSettings.whatsapp_rate_list_pdf_url ? (
                    <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Active PDF</span>
                  ) : (
                    <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>Live Callback Active</span>
                  )}
                </div>

                <div style={{ background: 'var(--bg-tertiary)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                      {flowSettings.whatsapp_rate_list_pdf_url
                        ? (flowSettings.whatsapp_rate_list_filename || 'Sobha_Infratech_Official_Rate_List.pdf')
                        : 'No custom Rate List PDF uploaded yet (Text quote message sent by default)'}
                    </div>
                    {flowSettings.whatsapp_rate_list_pdf_url && (
                      <a
                        href={flowSettings.whatsapp_rate_list_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}
                      >
                        <Eye size={12} /> View PDF
                      </a>
                    )}
                  </div>
                </div>

                <div style={{ border: '2px dashed var(--border-color)', borderRadius: '8px', padding: '1.25rem', textAlign: 'center', background: 'var(--bg-secondary)', position: 'relative', marginBottom: '1rem' }}>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleRateListUpload}
                    disabled={rateListProgress !== null}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', zIndex: 2 }}
                  />
                  <Upload size={24} style={{ color: '#10B981', marginBottom: '0.4rem' }} />
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Upload Latest Official Rate List PDF</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Update whenever price charts change from time to time</div>
                  {rateListProgress !== null && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${rateListProgress}%`, background: '#10B981', transition: 'width 0.3s' }} />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#10B981', marginTop: '0.3rem' }}>Uploading {rateListProgress}%...</div>
                    </div>
                  )}
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.82rem', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={flowSettings.whatsapp_auto_send_rate_list !== 'false'}
                    onChange={e => setFlowSettings(prev => ({ ...prev, whatsapp_auto_send_rate_list: e.target.checked ? 'true' : 'false' }))}
                  />
                  <span>Auto-attach and send this Rate List PDF document whenever a customer clicks <strong>"Get Quote"</strong> or asks for rates/prices</span>
                </label>
              </div>
            </div>

            {/* COLUMN 2: Button Triggers & Automated Replies */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Trigger 1: Talk to Executive */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <UserCheck size={18} color="var(--accent-primary)" />
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>"Talk to Executive" Button Reply</h3>
                  </div>
                  <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Executive Handoff</span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
                  Automated reply sent when the customer clicks the <strong>👤 Talk to Executive</strong> button. A high-priority CRM callback task is also created automatically in the database.
                </p>

                <div style={{ marginBottom: '0.85rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                    Assigned Sales Executive Name:
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={flowSettings.whatsapp_default_salesperson || ''}
                    onChange={e => setFlowSettings(prev => ({ ...prev, whatsapp_default_salesperson: e.target.value }))}
                    placeholder="e.g. Senior Sales Executive, Technical Specialist"
                    style={{ width: '100%', fontSize: '0.85rem', padding: '0.45rem 0.75rem' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Response Message:</label>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}
                        onClick={() => setFlowSettings(prev => ({ ...prev, whatsapp_talk_executive_message: (prev.whatsapp_talk_executive_message || '') + ' {name}' }))}
                      >+ {'{name}'}</button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}
                        onClick={() => setFlowSettings(prev => ({ ...prev, whatsapp_talk_executive_message: (prev.whatsapp_talk_executive_message || '') + ' {executive}' }))}
                      >+ {'{executive}'}</button>
                    </div>
                  </div>
                  <textarea
                    className="input-field"
                    rows={5}
                    value={flowSettings.whatsapp_talk_executive_message || ''}
                    onChange={e => setFlowSettings(prev => ({ ...prev, whatsapp_talk_executive_message: e.target.value }))}
                    placeholder="Enter reply text..."
                    style={{ width: '100%', fontSize: '0.82rem', fontFamily: 'inherit', lineHeight: 1.4, resize: 'vertical' }}
                  />
                </div>
              </div>

              {/* Trigger 2: Get Quote */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <IndianRupee size={18} color="#10B981" />
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>"Get Quote" Button Reply</h3>
                  </div>
                  <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Rate Escalation</span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
                  Automated reply sent when customer clicks <strong>💰 Get Quote</strong> or asks for rate charts.
                </p>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Response Message:</label>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}
                        onClick={() => setFlowSettings(prev => ({ ...prev, whatsapp_get_quote_message: (prev.whatsapp_get_quote_message || '') + ' {name}' }))}
                      >+ {'{name}'}</button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}
                        onClick={() => setFlowSettings(prev => ({ ...prev, whatsapp_get_quote_message: (prev.whatsapp_get_quote_message || '') + ' {executive}' }))}
                      >+ {'{executive}'}</button>
                    </div>
                  </div>
                  <textarea
                    className="input-field"
                    rows={5}
                    value={flowSettings.whatsapp_get_quote_message || ''}
                    onChange={e => setFlowSettings(prev => ({ ...prev, whatsapp_get_quote_message: e.target.value }))}
                    placeholder="Enter quotation reply text..."
                    style={{ width: '100%', fontSize: '0.82rem', fontFamily: 'inherit', lineHeight: 1.4, resize: 'vertical' }}
                  />
                </div>
              </div>

              {/* Trigger 3: First Contact Welcome Greeting & Dynamic Interactive Buttons Studio */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MessageSquare size={18} color="var(--accent-secondary)" />
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>First Contact Welcome Greeting & Interactive Flow Studio</h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={flowSettings.whatsapp_enable_welcome_buttons !== 'false'}
                        onChange={e => setFlowSettings(prev => ({ ...prev, whatsapp_enable_welcome_buttons: e.target.checked ? 'true' : 'false' }))}
                        style={{ accentColor: '#10B981', cursor: 'pointer' }}
                      />
                      <span style={{ color: flowSettings.whatsapp_enable_welcome_buttons !== 'false' ? '#10B981' : 'var(--text-muted)' }}>
                        {flowSettings.whatsapp_enable_welcome_buttons !== 'false' ? 'Interactive Buttons Active' : 'Buttons Disabled'}
                      </span>
                    </label>
                    <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>Meta Cloud API (v20.0)</span>
                  </div>
                </div>

                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
                  Dispatched when an unfamiliar contact or new lead initiates contact on WhatsApp, or sends a greeting (e.g. <em>"Hi"</em>, <em>"Hello"</em>, <em>"Namaste"</em>). Predefine 1 to 3 interactive reply buttons and multi-level follow-up sub-buttons dynamically.
                </p>

                {/* Welcome Message Copy */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Welcome Greeting Message:</label>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}
                        onClick={() => setFlowSettings(prev => ({ ...prev, whatsapp_welcome_message: (prev.whatsapp_welcome_message || '') + ' {name}' }))}
                      >+ {'{name}'}</button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}
                        onClick={() => setFlowSettings(prev => ({ ...prev, whatsapp_welcome_message: (prev.whatsapp_welcome_message || '') + ' {executive}' }))}
                      >+ {'{executive}'}</button>
                    </div>
                  </div>
                  <textarea
                    className="input-field"
                    rows={4}
                    value={flowSettings.whatsapp_welcome_message || ''}
                    onChange={e => setFlowSettings(prev => ({ ...prev, whatsapp_welcome_message: e.target.value }))}
                    placeholder="Enter first greeting..."
                    style={{ width: '100%', fontSize: '0.82rem', fontFamily: 'inherit', lineHeight: 1.4, resize: 'vertical' }}
                  />
                </div>

                {/* Dynamic Interactive Reply Buttons & Sub-Buttons Flow Builder */}
                {flowSettings.whatsapp_enable_welcome_buttons !== 'false' && (
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '1.25rem', border: '1px solid var(--border-color)', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Layers size={16} color="var(--accent-primary)" />
                          Interactive Quick Reply Buttons & Decision Flow Tree
                        </h4>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Configure 1 to 3 primary reply buttons attached to greeting, with optional Level-2 sub-buttons.
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                          {(flowSettings.whatsapp_welcome_buttons || []).length} / 3 Buttons
                        </span>
                        {(flowSettings.whatsapp_welcome_buttons || []).length < 3 && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            onClick={handleAddWelcomeButton}
                          >
                            <Plus size={13} /> Add Button
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Button Selector Tabs */}
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
                      {(flowSettings.whatsapp_welcome_buttons || []).map((btn, idx) => (
                        <button
                          key={btn.id || idx}
                          type="button"
                          onClick={() => setActiveWelcomeButtonIdx(idx)}
                          className={activeWelcomeButtonIdx === idx ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>Button {idx + 1}:</span> {btn.title || 'Untitled'}
                          {(btn.sub_buttons || []).length > 0 && (
                            <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '10px', padding: '0.05rem 0.35rem', fontSize: '0.62rem' }}>
                              +{btn.sub_buttons.length} subs
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Active Button Configuration Form */}
                    {(() => {
                      const buttons = flowSettings.whatsapp_welcome_buttons || [];
                      const safeIdx = Math.min(activeWelcomeButtonIdx, Math.max(0, buttons.length - 1));
                      const activeBtn = buttons[safeIdx];
                      if (!activeBtn) return null;

                      const titleCharCount = (activeBtn.title || '').length;
                      const isTitleTooLong = titleCharCount > 20;

                      return (
                        <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '1.1rem', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              Configure Button #{safeIdx + 1}
                            </span>
                            {buttons.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveWelcomeButton(safeIdx)}
                                style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.4rem' }}
                              >
                                <Trash2 size={13} /> Remove Button
                              </button>
                            )}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '0.85rem' }}>
                            {/* Button Label Input */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                  Button Title / Label (Max 20 chars) *
                                </label>
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: isTitleTooLong ? '#EF4444' : 'var(--text-muted)' }}>
                                  {titleCharCount} / 20
                                </span>
                              </div>
                              <input
                                type="text"
                                className="input-field"
                                value={activeBtn.title || ''}
                                maxLength={20}
                                onChange={e => handleUpdateWelcomeButton(safeIdx, 'title', e.target.value)}
                                placeholder="e.g. 📄 Get Catalog"
                                style={{
                                  width: '100%',
                                  fontSize: '0.82rem',
                                  borderColor: isTitleTooLong ? '#EF4444' : undefined,
                                }}
                              />
                              {isTitleTooLong && (
                                <p style={{ fontSize: '0.68rem', color: '#EF4444', margin: '0.25rem 0 0 0' }}>
                                  ⚠️ Meta Cloud API limits button titles to 20 characters. Excess characters will be clipped!
                                </p>
                              )}
                            </div>

                            {/* Trigger Action Select */}
                            <div>
                              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                                Trigger Action on Click *
                              </label>
                              <select
                                className="input-field"
                                value={activeBtn.action || 'custom'}
                                onChange={e => handleUpdateWelcomeButton(safeIdx, 'action', e.target.value)}
                                style={{ width: '100%', fontSize: '0.82rem', height: '38px' }}
                              >
                                <option value="catalog">📄 Send Official Catalog PDF Document</option>
                                <option value="quote">💰 Request Official Quote & Rate List (Sales Lead)</option>
                                <option value="human">👤 Connect with Human Senior Executive (Callback)</option>
                                <option value="custom">💬 Send Custom Bot Response & Sub-Buttons</option>
                              </select>
                            </div>
                          </div>

                          {/* Automated Response Copy */}
                          <div style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                              <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                Automated Bot Response Copy:
                              </label>
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Leave empty to use default system template</span>
                            </div>
                            <textarea
                              className="input-field"
                              rows={2}
                              value={activeBtn.response_text || ''}
                              onChange={e => handleUpdateWelcomeButton(safeIdx, 'response_text', e.target.value)}
                              placeholder={
                                activeBtn.action === 'catalog'
                                  ? 'e.g. Please find our official Sobhainfra Tech Product Catalog attached above in PDF format...'
                                  : activeBtn.action === 'quote'
                                  ? 'e.g. Our official rate lists and customized project quotations are provided directly by our senior sales specialists...'
                                  : activeBtn.action === 'human'
                                  ? 'e.g. A dedicated sales specialist has been alerted and will connect with you directly shortly!'
                                  : 'e.g. Thank you for selecting this option. How else can we assist you with our products today?'
                              }
                              style={{ width: '100%', fontSize: '0.8rem', fontFamily: 'inherit', lineHeight: 1.35, resize: 'vertical' }}
                            />
                          </div>

                          {/* Level-2 Sub-Buttons Flow Tree — Full Configuration */}
                          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '0.85rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <CornerDownRight size={15} color="var(--accent-secondary)" />
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  Level-2 Sub-Buttons (Follow-up Options After Click)
                                </span>
                                <span className="badge badge-neutral" style={{ fontSize: '0.62rem' }}>
                                  {(activeBtn.sub_buttons || []).length} / 3
                                </span>
                              </div>
                              {(activeBtn.sub_buttons || []).length < 3 && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                  onClick={() => handleAddSubButton(safeIdx)}
                                >
                                  <Plus size={12} /> Add Sub-Button
                                </button>
                              )}
                            </div>

                            {(!activeBtn.sub_buttons || activeBtn.sub_buttons.length === 0) ? (
                              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0', fontStyle: 'italic', padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: 6 }}>
                                No follow-up sub-buttons configured for Button #{safeIdx + 1}. Tapping will execute the primary action directly. Add sub-buttons to create a multi-step decision tree.
                              </p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {activeBtn.sub_buttons.map((sub, subIdx) => {
                                  const subAction = sub.action || 'custom';
                                  const effectLabel = subAction === 'human' ? '👤 Creates Sales Callback Task → HUMAN ACTIVE'
                                    : subAction === 'catalog' ? '📄 Sends Catalog / Document PDF'
                                    : subAction === 'rate_list_pdf' ? '📊 Sends Rate List PDF + Sales Escalation'
                                    : '💬 Sends Custom Reply Message';
                                  return (
                                    <div
                                      key={sub.id || subIdx}
                                      style={{
                                        background: 'var(--bg-secondary)',
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        position: 'relative'
                                      }}
                                    >
                                      {/* Sub-button header with level indicator */}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-primary)', background: 'rgba(99,102,241,0.1)', padding: '0.1rem 0.4rem', borderRadius: 4 }}>
                                            L1 → L2 #{subIdx + 1}
                                          </span>
                                          <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                                            {effectLabel}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveSubButton(safeIdx, subIdx)}
                                          style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                          title="Delete sub-button"
                                        >
                                          <Trash2 size={12} /> Remove
                                        </button>
                                      </div>

                                      {/* Title + Action row */}
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.5rem' }}>
                                        <div>
                                          <label style={{ fontSize: '0.68rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>
                                            Sub-Button Label (Max 20 chars) *
                                          </label>
                                          <input
                                            type="text"
                                            className="input-field"
                                            value={sub.title || ''}
                                            maxLength={20}
                                            onChange={e => handleUpdateSubButton(safeIdx, subIdx, 'title', e.target.value)}
                                            placeholder="e.g. 📊 Rate List PDF"
                                            style={{ width: '100%', fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                                          />
                                        </div>
                                        <div>
                                          <label style={{ fontSize: '0.68rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>
                                            Trigger Action on Click *
                                          </label>
                                          <select
                                            className="input-field"
                                            value={subAction}
                                            onChange={e => handleUpdateSubButton(safeIdx, subIdx, 'action', e.target.value)}
                                            style={{ width: '100%', fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                                          >
                                            <option value="custom">💬 Send Custom Reply Message</option>
                                            <option value="catalog">📄 Send Catalog / Document PDF</option>
                                            <option value="rate_list_pdf">📊 Send Rate List PDF + Sales Escalation</option>
                                            <option value="human">👤 Connect with Executive (Human Takeover)</option>
                                          </select>
                                        </div>
                                      </div>

                                      {/* Reply Text (for all non-human actions) */}
                                      {subAction !== 'human' && (
                                        <div style={{ marginBottom: '0.45rem' }}>
                                          <label style={{ fontSize: '0.68rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>
                                            Automated Bot Response When Tapped:
                                          </label>
                                          <textarea
                                            className="input-field"
                                            rows={2}
                                            value={sub.response_text || ''}
                                            onChange={e => handleUpdateSubButton(safeIdx, subIdx, 'response_text', e.target.value)}
                                            placeholder={
                                              subAction === 'catalog' ? 'e.g. Here is our official product catalog PDF. Would you like a custom quote?'
                                              : subAction === 'rate_list_pdf' ? 'e.g. Sending our latest official rate list. A sales executive will connect with you shortly...'
                                              : 'e.g. Thank you! Here are the details you requested...'
                                            }
                                            style={{ width: '100%', fontSize: '0.74rem', resize: 'vertical' }}
                                          />
                                        </div>
                                      )}

                                      {/* Link URL (for catalog / rate_list actions) */}
                                      {(subAction === 'catalog' || subAction === 'rate_list_pdf') && (
                                        <div style={{ marginBottom: '0.35rem' }}>
                                          <label style={{ fontSize: '0.68rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>
                                            Document / PDF URL (optional override):
                                          </label>
                                          <input
                                            type="url"
                                            className="input-field"
                                            value={sub.link_url || ''}
                                            onChange={e => handleUpdateSubButton(safeIdx, subIdx, 'link_url', e.target.value)}
                                            placeholder="https://yoursite.com/catalog.pdf"
                                            style={{ width: '100%', fontSize: '0.74rem', padding: '0.35rem 0.5rem' }}
                                          />
                                        </div>
                                      )}

                                      {/* Human handoff notice */}
                                      {subAction === 'human' && (
                                        <div style={{ padding: '0.5rem 0.65rem', background: 'rgba(245,158,11,0.08)', borderRadius: 5, border: '1px solid rgba(245,158,11,0.25)', fontSize: '0.7rem', color: 'var(--text-primary)' }}>
                                          👤 <strong>Effect:</strong> AI is paused, conversation mode → <code>HUMAN ACTIVE</code>, urgent callback task assigned to sales executive.
                                        </div>
                                      )}

                                      {/* Rate list notice */}
                                      {subAction === 'rate_list_pdf' && (
                                        <div style={{ padding: '0.5rem 0.65rem', background: 'rgba(16,185,129,0.08)', borderRadius: 5, border: '1px solid rgba(16,185,129,0.25)', fontSize: '0.7rem', color: 'var(--text-primary)' }}>
                                          📊 <strong>Effect:</strong> Official Rate List PDF auto-attached (if uploaded) + high-priority sales escalation task created.
                                        </div>
                                      )}

                                      {/* Catalog notice */}
                                      {subAction === 'catalog' && (
                                        <div style={{ padding: '0.5rem 0.65rem', background: 'rgba(59,130,246,0.08)', borderRadius: 5, border: '1px solid rgba(59,130,246,0.25)', fontSize: '0.7rem', color: 'var(--text-primary)' }}>
                                          📄 <strong>Effect:</strong> Product catalog PDF auto-attached from your uploaded document library.
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Interactive Live WhatsApp Mobile Phone Simulator Preview */}
                <div style={{ background: '#0B141A', borderRadius: '10px', padding: '1rem', border: '1px solid #222D34' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid #202C33', paddingBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#25D366' }}>
                      <Smartphone size={15} />
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#E9EDEF' }}>
                        WhatsApp Live Interactive Simulator
                      </span>
                    </div>
                    {simulatedSelectedBtn && (
                      <button
                        type="button"
                        onClick={() => setSimulatedSelectedBtn(null)}
                        style={{ background: 'none', border: 'none', color: '#00A884', fontSize: '0.68rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Reset Flow
                      </button>
                    )}
                  </div>

                  {/* WhatsApp Chat Area */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {/* Bot Welcome Greeting Message Bubble */}
                    <div style={{ alignSelf: 'flex-start', maxWidth: '85%', background: '#202C33', borderRadius: '8px', padding: '0.65rem 0.85rem', color: '#E9EDEF', fontSize: '0.78rem', lineHeight: 1.45, boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                      <div style={{ fontWeight: 600, color: '#25D366', fontSize: '0.72rem', marginBottom: '0.25rem' }}>
                        Sobhainfra Tech Pvt. Ltd. (Verified Business)
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>
                        {(flowSettings.whatsapp_welcome_message || '')
                          .replace(/\{name\}/g, 'Rahul Sharma')
                          .replace(/\{executive\}/g, flowSettings.whatsapp_default_salesperson || 'Senior Sales Executive')}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: '#8696A0', textAlign: 'right', marginTop: '0.2rem' }}>
                        09:15 AM
                      </div>
                    </div>

                    {/* Primary Interactive Quick Reply Buttons */}
                    {flowSettings.whatsapp_enable_welcome_buttons !== 'false' && (flowSettings.whatsapp_welcome_buttons || []).length > 0 && (
                      <div style={{ alignSelf: 'flex-start', maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%' }}>
                        <span style={{ fontSize: '0.65rem', color: '#8696A0', fontStyle: 'italic', marginBottom: '0.1rem' }}>
                          ⚡ Tap a reply button to simulate client action:
                        </span>
                        {(flowSettings.whatsapp_welcome_buttons || []).map((btn, idx) => (
                          <button
                            key={btn.id || idx}
                            type="button"
                            onClick={() => setSimulatedSelectedBtn(btn)}
                            style={{
                              background: simulatedSelectedBtn?.id === btn.id ? '#005C4B' : '#111B21',
                              border: '1px solid #202C33',
                              color: simulatedSelectedBtn?.id === btn.id ? '#FFFFFF' : '#00A884',
                              borderRadius: '8px',
                              padding: '0.45rem 0.85rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.4rem',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {btn.title || `Button #${idx + 1}`}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Simulated Client Tap Response */}
                    {simulatedSelectedBtn && (
                      <>
                        {/* Customer tap bubble (right aligned, green) */}
                        <div style={{ alignSelf: 'flex-end', maxWidth: '75%', background: '#005C4B', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#E9EDEF', fontSize: '0.76rem', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                          {simulatedSelectedBtn.title}
                          <div style={{ fontSize: '0.6rem', color: '#8696A0', textAlign: 'right', marginTop: '0.15rem' }}>
                            09:16 AM ✓✓
                          </div>
                        </div>

                        {/* Bot follow-up action response bubble */}
                        <div style={{ alignSelf: 'flex-start', maxWidth: '85%', background: '#202C33', borderRadius: '8px', padding: '0.65rem 0.85rem', color: '#E9EDEF', fontSize: '0.78rem', lineHeight: 1.45, boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                          {simulatedSelectedBtn.action === 'catalog' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#111B21', padding: '0.4rem 0.6rem', borderRadius: '6px', marginBottom: '0.4rem' }}>
                              <FileText size={18} color="#EF4444" />
                              <div>
                                <div style={{ fontSize: '0.74rem', fontWeight: 600 }}>{flowSettings.whatsapp_catalog_filename || 'Product_Catalog.pdf'}</div>
                                <div style={{ fontSize: '0.62rem', color: '#8696A0' }}>PDF Document • 4.2 MB</div>
                              </div>
                            </div>
                          )}
                          {simulatedSelectedBtn.action === 'quote' && flowSettings.whatsapp_rate_list_pdf_url && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#111B21', padding: '0.4rem 0.6rem', borderRadius: '6px', marginBottom: '0.4rem' }}>
                              <FileText size={18} color="#10B981" />
                              <div>
                                <div style={{ fontSize: '0.74rem', fontWeight: 600 }}>{flowSettings.whatsapp_rate_list_filename || 'Official_Rate_List.pdf'}</div>
                                <div style={{ fontSize: '0.62rem', color: '#8696A0' }}>Official Rate Schedule • PDF</div>
                              </div>
                            </div>
                          )}
                          <div style={{ whiteSpace: 'pre-wrap' }}>
                            {simulatedSelectedBtn.response_text || (
                              simulatedSelectedBtn.action === 'catalog'
                                ? `📄 Namaste Rahul Sharma!\n\nPlease find our official Sobhainfra Tech Product Catalog attached above in PDF format.`
                                : simulatedSelectedBtn.action === 'quote'
                                ? `💰 Namaste Rahul Sharma!\n\nOur official rate lists and customized quotations are coordinated directly by our senior sales specialists. An executive will connect with you shortly!`
                                : simulatedSelectedBtn.action === 'human'
                                ? `👋 Namaste Rahul Sharma!\n\nA dedicated senior sales specialist has been alerted and will connect with you directly on this number shortly!`
                                : `Thank you! How else may we assist you with our products today?`
                            )}
                          </div>
                          <div style={{ fontSize: '0.62rem', color: '#8696A0', textAlign: 'right', marginTop: '0.2rem' }}>
                            09:16 AM
                          </div>
                        </div>

                        {/* Level-2 Sub-Buttons in Simulator */}
                        {Array.isArray(simulatedSelectedBtn.sub_buttons) && simulatedSelectedBtn.sub_buttons.length > 0 && (
                          <div style={{ alignSelf: 'flex-start', maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%' }}>
                            <span style={{ fontSize: '0.65rem', color: '#8696A0', fontStyle: 'italic', marginBottom: '0.1rem' }}>
                              ↳ Level-2 Follow-up Options:
                            </span>
                            {simulatedSelectedBtn.sub_buttons.map((sub, sIdx) => (
                              <div
                                key={sub.id || sIdx}
                                style={{
                                  background: '#111B21',
                                  border: '1px dashed #202C33',
                                  color: '#25D366',
                                  borderRadius: '8px',
                                  padding: '0.4rem 0.75rem',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.35rem'
                                }}
                              >
                                {sub.title}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 1: AGENT SIMULATOR & TOOL CALL INSPECTOR
         ========================================================================= */}
      {activeTab === 'simulator' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', height: '620px' }}>
          
          {/* Chat Simulator Console */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bot size={18} color="var(--accent-primary)" />
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>OpenAI GPT-4o Bounded Simulator</span>
              </div>
              <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Pricing Guardrails ON</span>
            </div>

            {/* Quick Test Prompts */}
            <div style={{ padding: '0.5rem 1rem', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {[
                'What is the price of Tile Adhesive?',
                'Can I get a 20% discount on bulk order?',
                'Send me the product brochure PDF',
                'Connect me with a human sales representative',
                'Ready to place an order for 50 bags',
              ].map(q => (
                <button
                  key={q}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}
                  onClick={() => setUserInput(q)}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Message Feed */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {messages.map(m => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    padding: '0.85rem 1rem',
                    borderRadius: 12,
                    background: m.sender === 'user' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: m.sender === 'user' ? 'white' : 'var(--text-primary)',
                    fontSize: '0.84rem',
                    lineHeight: 1.4,
                  }}
                >
                  <div style={{ fontSize: '0.65rem', opacity: 0.8, marginBottom: '0.25rem' }}>
                    {m.sender === 'user' ? '👤 Customer Inquiry' : '🤖 AI Sales Agent'}
                  </div>
                  <div>{m.text}</div>
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div style={{ marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '0.4rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      {m.toolCalls.map((tc, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveInspectorTool(tc)}
                          style={{
                            background: 'rgba(99,102,241,0.25)',
                            border: '1px solid var(--accent-secondary)',
                            borderRadius: 4,
                            color: 'var(--text-primary)',
                            fontSize: '0.65rem',
                            padding: '0.15rem 0.4rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          <Zap size={10} color="var(--warning)" /> {tc.toolName}()
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isProcessing && (
                <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <RefreshCw size={13} className="animate-spin" /> Calling OpenAI tools...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input form */}
            <form onSubmit={handleSendSimulator} style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="input-field"
                placeholder="Ask about properties, pricing, discounts, brochures..."
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={isProcessing || !userInput.trim()}>
                <Send size={15} /> Send
              </button>
            </form>
          </div>

          {/* Real-time Tool Call Inspector & Observability Pane */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
            
            {/* Tool Call Inspector */}
            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Zap size={15} color="var(--warning)" /> Tool Call Inspector
                </span>
                {activeInspectorTool && <span className="badge badge-neutral">{activeInspectorTool.toolName}</span>}
              </div>

              <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', background: '#0b0f19', color: '#10b981', fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: 1.5 }}>
                {activeInspectorTool ? (
                  <div>
                    <div style={{ color: '#6366f1', marginBottom: '0.5rem' }}>// Tool Invocation Payload</div>
                    <div style={{ color: '#e2e8f0', marginBottom: '0.75rem' }}>
                      <strong>Function:</strong> {activeInspectorTool.toolName}
                    </div>
                    <div style={{ color: '#94a3b8', marginBottom: '0.25rem' }}>// Arguments:</div>
                    <pre style={{ background: '#05070d', padding: '0.5rem', borderRadius: 6, color: '#f59e0b', overflowX: 'auto' }}>
                      {JSON.stringify(activeInspectorTool.args, null, 2)}
                    </pre>
                    <div style={{ color: '#94a3b8', margin: '0.75rem 0 0.25rem 0' }}>// Returned Output (Ground Truth):</div>
                    <pre style={{ background: '#05070d', padding: '0.5rem', borderRadius: 6, color: '#10b981', overflowX: 'auto' }}>
                      {JSON.stringify(activeInspectorTool.output, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div style={{ color: '#64748b', textAlign: 'center', marginTop: '3rem' }}>
                    Trigger a message in the simulator to inspect executed tool calls.
                  </div>
                )}
              </div>
            </div>

            {/* Observability & Cost Metric Card */}
            <div className="glass-card" style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Activity size={14} color="var(--success)" /> Live Run Observability
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                <div style={{ background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: 6 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Model</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{lastObservability?.model || 'gpt-4o'}</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: 6 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Latency</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-secondary)' }}>{lastObservability?.latencyMs ? `${lastObservability.latencyMs}ms` : '320ms'}</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: 6 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Est. Cost</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--success)' }}>${lastObservability?.estimatedCostUsd || '0.00045'}</div>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* =========================================================================
          TAB 2: KNOWLEDGE BASE MASTER
         ========================================================================= */}
      {activeTab === 'knowledge' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Ground-Truth Knowledge Base (Section 17)</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                The AI can only reference active, verified knowledge articles.
              </p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddKB(true)}>
              <Plus size={14} /> Add Knowledge Article
            </button>
          </div>

          {showAddKB && (
            <form onSubmit={handleCreateKB} className="glass-card p-6" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>New Knowledge Base Entry</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Category</label>
                  <select className="input-field" value={kbForm.category} onChange={e => setKbForm(p => ({ ...p, category: e.target.value }))}>
                    {['Pricing', 'FAQ', 'Policy', 'Script', 'Catalog'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Title *</label>
                  <input type="text" className="input-field" placeholder="e.g. Possession Timelines for Andheri Tower" value={kbForm.title} onChange={e => setKbForm(p => ({ ...p, title: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Verified Content *</label>
                <textarea className="input-field textarea-field" rows={3} placeholder="Exact verified facts for AI context..." value={kbForm.content} onChange={e => setKbForm(p => ({ ...p, content: e.target.value }))} required />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddKB(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={savingKB}>{savingKB ? 'Saving...' : 'Save Knowledge'}</button>
              </div>
            </form>
          )}

          <div className="glass-card table-container">
            <table className="data-table">
              <thead>
                <tr><th>Category</th><th>Title</th><th>Content / Facts</th><th>Version</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {loadingKB ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}><RefreshCw size={20} className="animate-spin" /></td></tr>
                ) : knowledgeList.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No knowledge base items added yet.</td></tr>
                ) : (
                  knowledgeList.map(k => (
                    <tr key={k.id}>
                      <td><span className="badge badge-neutral">{k.category}</span></td>
                      <td style={{ fontWeight: 700, fontSize: '0.85rem' }}>{k.title}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: 350 }}>{k.content}</td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)' }}>v{k.version || 1}</td>
                      <td><span className="badge badge-success">Active</span></td>
                      <td>
                        <button className="btn-icon" onClick={() => handleDeleteKB(k.id)} title="Delete">
                          <Trash2 size={14} color="var(--danger)" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: SCORING & GUARDRAILS RULES
         ========================================================================= */}
      {activeTab === 'rules' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          
          {/* Section 22 Lead Scoring Rules */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={18} color="var(--warning)" /> Lead Scoring Weights (Section 22)
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Dynamic point system calculated during automated discovery and qualification.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {SCORING_RULES.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.65rem 0.85rem',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                  }}
                >
                  <span>{r.trigger}</span>
                  <span
                    style={{
                      fontWeight: 800,
                      color: r.type === 'positive' ? 'var(--success)' : r.type === 'negative' ? 'var(--warning)' : 'var(--danger)',
                    }}
                  >
                    {r.delta}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 19 Pricing Guardrails */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={18} color="var(--accent-primary)" /> Pricing Guardrails (Section 19)
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Strict safety parameters preventing hallucinations or unapproved commitments.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem' }}>
              <div style={{ padding: '0.85rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8 }}>
                <strong style={{ color: 'var(--danger)', display: 'block', marginBottom: '0.25rem' }}>🚫 Zero Price Invention Policy</strong>
                AI must never invent rates, discounts, credit terms, taxes, or delivery dates. All pricing must come directly from <code>get_product_price()</code>.
              </div>
              <div style={{ padding: '0.85rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8 }}>
                <strong style={{ color: 'var(--accent-primary)', display: 'block', marginBottom: '0.25rem' }}>👤 Mandatory Negotiation Escalation</strong>
                Any customer request for discounts ("Rate kam karo") automatically logs a price objection and triggers <code>request_human_handoff()</code>.
              </div>
              <div style={{ padding: '0.85rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8 }}>
                <strong style={{ color: 'var(--success)', display: 'block', marginBottom: '0.25rem' }}>🔒 Prompt Injection Resistance</strong>
                AI rejects attempts to reveal internal system instructions, export other customer leads, or execute unauthorized transactions.
              </div>
            </div>
          </div>

        </div>
      )}

      {/* =========================================================================
          TAB 4: OBSERVABILITY & RUN LOGS
         ========================================================================= */}
      {activeTab === 'logs' && (
        <div className="glass-card table-container">
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="section-title">AI Execution & Latency Audit Logs</span>
            <button className="btn btn-secondary btn-sm" onClick={loadRuns}><RefreshCw size={13} /> Refresh</button>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Run ID</th><th>Model</th><th>Latency</th><th>Estimated Cost</th><th>Status</th><th>Timestamp</th></tr>
            </thead>
            <tbody>
              {aiRuns.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No execution runs recorded yet.</td></tr>
              ) : (
                aiRuns.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.id}</td>
                    <td><span className="badge badge-neutral">{r.model_name}</span></td>
                    <td style={{ color: 'var(--accent-secondary)' }}>{r.latency_ms}ms</td>
                    <td style={{ color: 'var(--success)' }}>${Number(r.total_cost || 0).toFixed(5)}</td>
                    <td><span className="badge badge-success">{r.status}</span></td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};

export default Chatbot;
