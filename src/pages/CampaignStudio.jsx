import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle, Send, Users, Filter, CheckCircle2, AlertTriangle,
  Zap, UploadCloud, Paperclip, CheckSquare, Square, Search, Plus,
  Sparkles, FileText, Image as ImageIcon, Phone, Layers, Settings,
  SlidersHorizontal, ChevronRight, ArrowLeft, RefreshCw, Trash2,
  ExternalLink, UserCheck, Bot, CornerDownRight, Smartphone, RotateCcw,
  Check, HelpCircle, Shield, Info
} from 'lucide-react';
import { estimateCampaignAudience, queueCampaign, processCampaignBatch, getLeads, normalizePhone } from '../lib/db';
import { uploadToWhatsAppMedia, getWhatsAppMediaType } from '../lib/storage';
import './Pages.css';

const DEFAULT_PRESETS = [
  {
    name: 'Special Offer & Catalog Flow',
    text: 'Hello {name}! 👋\n\nWe have an exclusive volume offer on our *{product}* valid this week only! 🎁\n\nStarting at *{budget}* with direct factory supply from {company}.\n\nPlease choose an option below to proceed:',
    buttons: [
      {
        id: 'btn_catalog',
        title: '📄 Get Catalog',
        actionType: 'media_or_link',
        replyText: 'Here is our official product brochure and technical specs. Would you like a custom quote?',
        linkUrl: 'https://example.com/catalog.pdf',
        subButtons: [
          { id: 'sub_quote', title: '💰 Get Quote', actionType: 'reply', replyText: 'Our standard pricing starts at {budget}. Would you like to speak with a sales rep?' },
          { id: 'sub_agent', title: '👤 Talk to Agent', actionType: 'human_handoff', replyText: 'Connecting you with an agent...' }
        ]
      },
      {
        id: 'btn_quote',
        title: '💰 Get Instant Quote',
        actionType: 'nested_message',
        replyText: 'Great! Which quantity tier are you looking for?',
        subButtons: [
          { id: 'sub_retail', title: '📦 Standard (1-50 Bags)', actionType: 'reply', replyText: 'For standard orders, price is {budget} with immediate dispatch.' },
          { id: 'sub_bulk', title: '🏢 Bulk Wholesale', actionType: 'human_handoff', replyText: 'For bulk wholesale orders, transferring to senior manager...' }
        ]
      },
      {
        id: 'btn_human',
        title: '👤 Talk to Human Agent',
        actionType: 'human_handoff',
        replyText: 'Transferring chat to an agent...',
      }
    ]
  },
  {
    name: 'New Product Launch Flow',
    text: 'Dear {name}, 🚀\n\nExciting announcement! {company} has introduced our all-new *{product}*.\n\nEnjoy launch discounts starting at *{budget}*. How would you like to proceed?',
    buttons: [
      {
        id: 'btn_specs',
        title: '📑 View Specs',
        actionType: 'reply',
        replyText: 'Technical specifications for {product}: High tensile bond strength, polymer-modified, ISI certified.',
        subButtons: [
          { id: 'sub_sample', title: '🎁 Free Sample', actionType: 'human_handoff', replyText: 'Free sample request logged. Sales rep will confirm shipping.' },
          { id: 'sub_quote2', title: '💰 Price Chart', actionType: 'reply', replyText: 'Rate chart sent! Special launch price: {budget}.' }
        ]
      },
      {
        id: 'btn_demo',
        title: '🎥 Video Demo',
        actionType: 'media_or_link',
        replyText: 'Watch our 2-minute product application video here:',
        linkUrl: 'https://youtube.com/watch?v=demo',
      },
      {
        id: 'btn_agent_launch',
        title: '👤 Talk to Agent',
        actionType: 'human_handoff',
        replyText: 'Connecting you with our technical product specialist...',
      }
    ]
  },
  {
    name: 'Payment & Invoice Clearance',
    text: 'Dear {name},\n\nGentle reminder regarding the pending invoice for *{product}* amounting to *{budget}*.\n\nKindly select your preferred action:',
    buttons: [
      {
        id: 'btn_pay_link',
        title: '💳 Pay Online UPI',
        actionType: 'media_or_link',
        replyText: 'Click the secure UPI payment gateway link below to settle invoice:',
        linkUrl: 'https://pay.example.com/invoice',
      },
      {
        id: 'btn_invoice_copy',
        title: '📄 Get Invoice Copy',
        actionType: 'reply',
        replyText: 'Here is your official GST invoice summary for {budget}.',
      },
      {
        id: 'btn_accounts_rep',
        title: '👤 Accounts Support',
        actionType: 'human_handoff',
        replyText: 'Connecting you with our accounts officer...',
      }
    ]
  }
];

const EMOJIS = ['👋', '🚀', '🎁', '💰', '📞', '✨', '🏢', '📦', '🔥', '✅', '🙏', '😊'];

const CampaignStudio = () => {
  const navigate = useNavigate();
  
  // Top Workflow Step (1: Audience, 2: Message & Media, 3: Interactive Buttons Flow, 4: Automation & AI)
  const [activeStep, setActiveStep] = useState(1);
  
  // Campaign Meta
  const [name, setName] = useState(`Broadcast - ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`);
  
  // Dynamic Variables Customization
  const [showVarSettings, setShowVarSettings] = useState(false);
  const [campaignVariables, setCampaignVariables] = useState({
    product: 'Tile Adhesive & Grout',
    budget: '₹1,50,000',
    company: 'ERPPro Solutions Pvt. Ltd.',
    phone: '+91 99990 00001',
    mode: 'fallback', // 'fallback' | 'override'
  });

  // Audience State
  const [targetMode, setTargetMode] = useState('filter'); // 'filter' | 'contacts' | 'paste'
  const [filters, setFilters] = useState({ statusFilter: 'All', propertyFilter: 'All', minScore: 0 });
  const [estimation, setEstimation] = useState({ totalRaw: 0, targeted: 0, optedOut: 0, invalidPhone: 0, finalAudienceCount: 0, eligibleLeads: [] });
  const [allCrmLeads, setAllCrmLeads] = useState([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState(new Set());
  const [contactSearch, setContactSearch] = useState('');
  const [pastedNumbers, setPastedNumbers] = useState('');

  // Message & Media State
  const [customText, setCustomText] = useState(DEFAULT_PRESETS[0].text);
  const [campaignFile, setCampaignFile] = useState(null);
  const [campaignFilePreview, setCampaignFilePreview] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const campaignFileRef = useRef(null);
  const textareaRef = useRef(null);

  // Interactive Buttons & Decision Flow State
  const [buttons, setButtons] = useState(DEFAULT_PRESETS[0].buttons);
  const [editingButtonIndex, setEditingButtonIndex] = useState(0);

  // AI & Automation Mode
  const [automationMode, setAutomationMode] = useState('hybrid'); // 'hybrid' | 'fallback_only' | 'strict_guided'
  const [attachButtonsInAiMode, setAttachButtonsInAiMode] = useState(true);
  const [mandatoryAiFallback, setMandatoryAiFallback] = useState(true); // Mandatory per requirements

  // Interactive Phone Simulator State
  const [simChatHistory, setSimChatHistory] = useState([]);
  const [simCurrentButtons, setSimCurrentButtons] = useState(DEFAULT_PRESETS[0].buttons);
  const [simHandedOver, setSimHandedOver] = useState(false);

  // Execution
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [launchSuccess, setLaunchSuccess] = useState(false);

  useEffect(() => {
    loadCrmLeads();
    calculateAudience();
  }, []);

  useEffect(() => {
    if (targetMode === 'filter') {
      calculateAudience();
    }
  }, [filters, targetMode]);

  // Sync simulator initial state whenever message/buttons change
  useEffect(() => {
    resetSimulator();
  }, [customText, buttons, campaignVariables, campaignFilePreview]);

  const loadCrmLeads = async () => {
    const { data } = await getLeads();
    setAllCrmLeads(data || []);
  };

  const calculateAudience = async () => {
    const est = await estimateCampaignAudience(filters);
    setEstimation(est);
  };

  // Compute final effective recipients
  const getEffectiveRecipients = () => {
    if (targetMode === 'filter') {
      return estimation.eligibleLeads || [];
    }
    if (targetMode === 'contacts') {
      return allCrmLeads.filter(l => selectedLeadIds.has(l.id) && !l.marketing_opt_out && normalizePhone(l.phone || '').length >= 10);
    }
    if (targetMode === 'paste') {
      const rawLines = pastedNumbers.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      const seen = new Set();
      const list = [];
      rawLines.forEach((str, idx) => {
        const norm = normalizePhone(str);
        if (norm.length >= 10 && !seen.has(norm)) {
          seen.add(norm);
          list.push({
            id: `pasted-${idx}`,
            name: `Recipient ${idx + 1}`,
            phone: norm,
            property_interest: campaignVariables.product || 'our products',
            budget: campaignVariables.budget || '',
            company_name: campaignVariables.company || '',
          });
        }
      });
      return list;
    }
    return [];
  };

  const effectiveRecipients = getEffectiveRecipients();
  const effectiveCount = effectiveRecipients.length;

  // Insert variable into message textarea
  const insertVariable = (tag) => {
    if (!textareaRef.current) {
      setCustomText(prev => prev + ' ' + tag);
      return;
    }
    const elem = textareaRef.current;
    const start = elem.selectionStart;
    const end = elem.selectionEnd;
    const text = customText;
    const newText = text.substring(0, start) + tag + text.substring(end);
    setCustomText(newText);
    setTimeout(() => {
      elem.focus();
      elem.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  // Media file handlers
  const handleFileSelect = (file) => {
    if (!file) return;
    setCampaignFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => setCampaignFilePreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setCampaignFilePreview(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // Button Tree CRUD
  const addButton = () => {
    if (buttons.length >= 3) return; // WhatsApp Quick Reply limits to 3 buttons
    const newId = `btn_${Date.now()}`;
    const newBtn = {
      id: newId,
      title: `Option ${buttons.length + 1}`,
      actionType: 'reply',
      replyText: 'Thank you for selecting this option! Our team will assist you shortly.',
      subButtons: [],
    };
    setButtons([...buttons, newBtn]);
    setEditingButtonIndex(buttons.length);
  };

  const removeButton = (idx) => {
    const next = buttons.filter((_, i) => i !== idx);
    setButtons(next);
    if (editingButtonIndex >= next.length) {
      setEditingButtonIndex(Math.max(0, next.length - 1));
    }
  };

  const updateButtonField = (idx, field, val) => {
    setButtons(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const addSubButton = (parentIdx) => {
    setButtons(prev => {
      const next = [...prev];
      const sub = next[parentIdx].subButtons || [];
      if (sub.length >= 3) return prev;
      next[parentIdx] = {
        ...next[parentIdx],
        subButtons: [
          ...sub,
          {
            id: `sub_${Date.now()}`,
            title: `Sub-Option ${sub.length + 1}`,
            actionType: 'reply',
            replyText: 'Response details for this sub-option.',
          }
        ]
      };
      return next;
    });
  };

  const removeSubButton = (parentIdx, subIdx) => {
    setButtons(prev => {
      const next = [...prev];
      const sub = (next[parentIdx].subButtons || []).filter((_, i) => i !== subIdx);
      next[parentIdx] = { ...next[parentIdx], subButtons: sub };
      return next;
    });
  };

  const updateSubButtonField = (parentIdx, subIdx, field, val) => {
    setButtons(prev => {
      const next = [...prev];
      const sub = [...(next[parentIdx].subButtons || [])];
      sub[subIdx] = { ...sub[subIdx], [field]: val };
      next[parentIdx] = { ...next[parentIdx], subButtons: sub };
      return next;
    });
  };

  // Load Full Preset Flow
  const loadPresetFlow = (preset) => {
    setCustomText(preset.text);
    setButtons(preset.buttons || []);
    setEditingButtonIndex(0);
  };

  // Format message text for preview
  const isOverride = campaignVariables.mode === 'override';
  const sampleLead = effectiveRecipients[0] || {};
  const displayProduct = isOverride ? campaignVariables.product : (sampleLead.property_interest || sampleLead.product || campaignVariables.product || 'Tile Adhesive & Grout');
  const displayBudget = isOverride ? campaignVariables.budget : (sampleLead.budget || campaignVariables.budget || '₹1,50,000');
  const displayCompany = isOverride ? campaignVariables.company : (sampleLead.company_name || campaignVariables.company || 'ERPPro Solutions Pvt. Ltd.');
  const displayName = sampleLead.name || 'Rahul Sharma';

  const formatText = (text) => {
    if (!text) return '';
    return text
      .replace(/{name}/g, displayName)
      .replace(/{product}/g, displayProduct)
      .replace(/{budget}/g, displayBudget)
      .replace(/{amount}/g, displayBudget)
      .replace(/{company}/g, displayCompany)
      .replace(/{phone}/g, campaignVariables.phone || '+91 98765 43210');
  };

  // SIMULATOR INTERACTION LOGIC
  const resetSimulator = () => {
    setSimChatHistory([
      {
        id: 'init',
        sender: 'bot',
        text: formatText(customText),
        mediaPreview: campaignFilePreview,
        fileName: campaignFile?.name,
      }
    ]);
    setSimCurrentButtons(buttons);
    setSimHandedOver(false);
  };

  const handleSimulatorButtonClick = (button) => {
    // 1. User sends button click as an interactive message
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: button.title,
    };

    const nextHistory = [...simChatHistory, userMsg];

    // 2. Process Button Action
    if (button.actionType === 'human_handoff' || button.title.toLowerCase().includes('human') || button.title.toLowerCase().includes('agent')) {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: `👋 Hello ${displayName}, I have paused automated AI assistance and transferred your chat to our senior sales specialist.\n\nAn agent will review your inquiry and connect with you personally shortly!`,
        isHandoverNotice: true,
      });
      setSimCurrentButtons([]);
      setSimHandedOver(true);
    } else if (button.actionType === 'media_or_link' && button.linkUrl) {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: `${formatText(button.replyText || 'Here is the direct link for you:')}\n🔗 ${button.linkUrl}`,
      });
      setSimCurrentButtons(button.subButtons || []);
    } else {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: formatText(button.replyText || 'Thank you for your response! How else may we assist you?'),
      });
      setSimCurrentButtons(button.subButtons || []);
    }

    setSimChatHistory(nextHistory);
  };

  // LAUNCH CAMPAIGN
  const handleLaunchCampaign = async () => {
    if (effectiveCount === 0) return;
    setIsSubmitting(true);

    let mediaUrl = null;
    let mediaType = 'text';

    if (campaignFile) {
      try {
        mediaUrl = await uploadToWhatsAppMedia(campaignFile, 'campaigns');
        mediaType = getWhatsAppMediaType(campaignFile);
      } catch (err) {
        if (campaignFilePreview) {
          mediaUrl = campaignFilePreview;
          mediaType = 'image';
        }
      }
    }

    const payload = {
      name: name.trim() || 'WhatsApp Broadcast Flow',
      template_name: 'Interactive Broadcast Flow',
      custom_message: customText,
      media_url: mediaUrl,
      media_type: mediaType,
      campaignDefaults: campaignVariables,
      interactiveButtons: buttons,
      buttonFlow: { buttons, automationMode },
    };

    const targetPayload = targetMode === 'filter'
      ? { filters, campaignDefaults: campaignVariables, interactive_buttons: buttons }
      : { customRecipients: effectiveRecipients, campaignDefaults: campaignVariables, interactive_buttons: buttons };

    const { data: cData } = await queueCampaign(payload, targetPayload);

    if (cData) {
      await processCampaignBatch(cData.id, 50, {
        customMessage: customText,
        mediaUrl,
        mediaType,
        campaignDefaults: campaignVariables,
        interactiveButtons: buttons,
        buttonFlow: { buttons, automationMode },
        recipients: effectiveRecipients,
      });
      setLaunchSuccess(true);
    }

    setIsSubmitting(false);
  };

  return (
    <div className="page-container animate-fade-in" style={{ paddingBottom: '3rem' }}>
      
      {/* Studio Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/whatsapp')}
            style={{ marginBottom: '0.4rem', gap: '0.3rem', fontSize: '0.75rem' }}
          >
            <ArrowLeft size={13} /> Back to WhatsApp Center
          </button>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MessageCircle size={26} color="var(--whatsapp)" /> WhatsApp Campaign & Interactive Flow Studio
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
            Build multi-level interactive quick reply buttons, media broadcasts, automated decision flows, and robust AI fallback mechanisms.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowVarSettings(p => !p)}
            style={{
              fontSize: '0.78rem',
              borderColor: showVarSettings ? 'var(--accent-primary)' : 'var(--border-color)',
              background: showVarSettings ? 'rgba(99,102,241,0.1)' : 'var(--bg-secondary)',
            }}
          >
            <Settings size={15} color="var(--accent-primary)" />
            <span>Customize Variables ⚙️</span>
          </button>

          <button
            className="btn btn-whatsapp"
            disabled={isSubmitting || effectiveCount === 0}
            onClick={handleLaunchCampaign}
            style={{ fontWeight: 700, fontSize: '0.82rem', padding: '0.5rem 1.1rem' }}
          >
            <Send size={15} /> {isSubmitting ? 'Launching...' : `Launch to ${effectiveCount} Contacts`}
          </button>
        </div>
      </div>

      {/* Dynamic Variables Customization Drawer (Gear Icon) */}
      {showVarSettings && (
        <div className="glass-card animate-fade-in" style={{
          padding: '1.1rem',
          marginBottom: '1.25rem',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.04) 100%)',
          border: '1.5px solid var(--accent-primary)',
          borderRadius: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <SlidersHorizontal size={16} color="var(--accent-primary)" />
              <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Dynamic Personalization & Smart Fallback Defaults</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Application Mode:</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setCampaignVariables(p => ({ ...p, mode: p.mode === 'fallback' ? 'override' : 'fallback' }))}
                style={{
                  fontSize: '0.7rem',
                  padding: '0.2rem 0.6rem',
                  background: campaignVariables.mode === 'override' ? 'var(--danger)' : 'var(--accent-primary)',
                  color: 'white',
                }}
              >
                {campaignVariables.mode === 'override' ? '⚡ Force Override All' : '✨ Smart Fallback'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Default Product *</label>
              <input
                type="text"
                className="input-field"
                value={campaignVariables.product}
                onChange={e => setCampaignVariables(p => ({ ...p, product: e.target.value }))}
                placeholder="e.g. Tile Adhesive & Grout"
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Offer Price / Budget</label>
              <input
                type="text"
                className="input-field"
                value={campaignVariables.budget}
                onChange={e => setCampaignVariables(p => ({ ...p, budget: e.target.value }))}
                placeholder="e.g. ₹1,50,000"
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Company / Brand</label>
              <input
                type="text"
                className="input-field"
                value={campaignVariables.company}
                onChange={e => setCampaignVariables(p => ({ ...p, company: e.target.value }))}
                placeholder="e.g. ERPPro Solutions Pvt. Ltd."
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Support Phone</label>
              <input
                type="text"
                className="input-field"
                value={campaignVariables.phone}
                onChange={e => setCampaignVariables(p => ({ ...p, phone: e.target.value }))}
                placeholder="e.g. +91 99990 00001"
              />
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL / BANNER */}
      {launchSuccess ? (
        <div className="glass-card" style={{ padding: '3.5rem 2rem', textAlign: 'center', marginTop: '1rem' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🚀</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)' }}>Campaign & Flow Successfully Dispatched!</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: 520, margin: '0.5rem auto 1.5rem auto' }}>
            <strong>{effectiveCount} WhatsApp interactive messages</strong> have been queued. Customers can now interact seamlessly with your predefined quick reply buttons and automated decision flows!
          </p>
          <div style={{ display: 'inline-flex', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => { setLaunchSuccess(false); resetSimulator(); }}>
              <RotateCcw size={14} /> Create Another Campaign
            </button>
            <button className="btn btn-whatsapp" onClick={() => navigate('/whatsapp')}>
              <MessageCircle size={14} /> Open Live WhatsApp Inbox
            </button>
          </div>
        </div>
      ) : (
        /* MAIN 2-COLUMN STUDIO WORKSPACE */
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(360px, 0.95fr)', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* =========================================================================
              LEFT COLUMN: STEP-BY-STEP FLOW STUDIO TABS
             ========================================================================= */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* Step Navigation Pills */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', background: 'var(--bg-tertiary)', padding: '0.35rem', borderRadius: 10, border: '1px solid var(--border-color)' }}>
              {[
                { step: 1, label: '1. Audience Target', icon: <Users size={14} /> },
                { step: 2, label: '2. Message & Media', icon: <FileText size={14} /> },
                { step: 3, label: '3. Reply Buttons Flow', icon: <Zap size={14} /> },
                { step: 4, label: '4. AI & Automation', icon: <Bot size={14} /> },
              ].map(s => (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => setActiveStep(s.step)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                    padding: '0.55rem 0.4rem',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: activeStep === s.step ? 'var(--accent-primary)' : 'transparent',
                    color: activeStep === s.step ? 'white' : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                STEP 1: AUDIENCE TARGETING & CAMPAIGN NAME
               ══════════════════════════════════════════════════════════════════ */}
            {activeStep === 1 && (
              <div className="glass-card p-6" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>Campaign Broadcast Title *</label>
                  <input
                    type="text"
                    className="input-field"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Diwali Interactive Product Launch"
                    required
                  />
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Users size={15} color="var(--accent-primary)" /> Audience Selection Method
                    </span>
                    <span className="badge badge-success" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      {effectiveCount} Contacts Eligible
                    </span>
                  </div>

                  {/* Mode Selector */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.85rem' }}>
                    {[
                      { id: 'filter', label: 'Dynamic Lead Filter', icon: <Filter size={13} /> },
                      { id: 'contacts', label: 'CRM Checklist Multi-Select', icon: <CheckSquare size={13} /> },
                      { id: 'paste', label: 'Paste Phone Numbers', icon: <FileText size={13} /> },
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setTargetMode(m.id)}
                        className="btn"
                        style={{
                          fontSize: '0.75rem', padding: '0.45rem',
                          background: targetMode === m.id ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                          color: targetMode === m.id ? 'white' : 'var(--text-secondary)',
                        }}
                      >
                        {m.icon} {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Sub-Panel: Dynamic Filter */}
                  {targetMode === 'filter' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 8 }}>
                      <div>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Lead Pipeline Stage</label>
                        <select
                          className="input-field"
                          value={filters.statusFilter}
                          onChange={e => setFilters(p => ({ ...p, statusFilter: e.target.value }))}
                        >
                          <option value="All">All Lead Stages</option>
                          <option value="Hot">Hot Leads Only</option>
                          <option value="Warm">Warm Leads Only</option>
                          <option value="New">New Inquiries</option>
                          <option value="Cold">Cold Leads</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Min AI Lead Score</label>
                        <select
                          className="input-field"
                          value={filters.minScore}
                          onChange={e => setFilters(p => ({ ...p, minScore: Number(e.target.value) }))}
                        >
                          <option value={0}>Any Score (0+)</option>
                          <option value={50}>Qualified (50+)</option>
                          <option value={80}>High Intent (80+)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Sub-Panel: CRM Checklist */}
                  {targetMode === 'contacts' && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 8 }}>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            type="text"
                            className="input-field"
                            placeholder="Search contact name or phone..."
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem 0.35rem 1.8rem' }}
                            value={contactSearch}
                            onChange={e => setContactSearch(e.target.value)}
                          />
                          <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            const filteredList = allCrmLeads.filter(l => (l.name || '').toLowerCase().includes(contactSearch.toLowerCase()) || (l.phone || '').includes(contactSearch));
                            setSelectedLeadIds(selectedLeadIds.size === filteredList.length ? new Set() : new Set(filteredList.map(l => l.id)));
                          }}
                        >
                          {selectedLeadIds.size > 0 ? 'Deselect' : 'Select All'}
                        </button>
                      </div>
                      <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                        {allCrmLeads.filter(l => (l.name || '').toLowerCase().includes(contactSearch.toLowerCase()) || (l.phone || '').includes(contactSearch)).map(l => (
                          <div
                            key={l.id}
                            onClick={() => {
                              const next = new Set(selectedLeadIds);
                              if (next.has(l.id)) next.delete(l.id);
                              else next.add(l.id);
                              setSelectedLeadIds(next);
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.5rem',
                              padding: '0.4rem 0.6rem',
                              borderBottom: '1px solid var(--border-color)',
                              cursor: 'pointer',
                              background: selectedLeadIds.has(l.id) ? 'rgba(99,102,241,0.08)' : 'transparent',
                              fontSize: '0.75rem',
                            }}
                          >
                            <input type="checkbox" checked={selectedLeadIds.has(l.id)} onChange={() => {}} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600 }}>{l.name}</div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{l.phone}</div>
                            </div>
                            <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{l.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sub-Panel: Paste Numbers */}
                  {targetMode === 'paste' && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Enter Mobile Numbers (Comma or Newline Separated):</span>
                        <span className="badge badge-accent" style={{ fontSize: '0.65rem' }}>+91 is Optional</span>
                      </div>
                      <textarea
                        className="input-field"
                        rows={4}
                        placeholder={`9876543210, 9812345678\n+919765432109\n09898989898`}
                        value={pastedNumbers}
                        onChange={e => setPastedNumbers(e.target.value)}
                        style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}
                      />
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <CheckCircle2 size={13} color="var(--success)" />
                        <span><strong>+91 is optional.</strong> Standard 10-digit Indian numbers are auto-normalized to +91XXXXXXXXXX.</span>
                      </div>
                    </div>
                  )}

                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-primary" onClick={() => setActiveStep(2)}>
                    Next: Message & Media Composer <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                STEP 2: MESSAGE & MEDIA COMPOSER
               ══════════════════════════════════════════════════════════════════ */}
            {activeStep === 2 && (
              <div className="glass-card p-6" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                
                {/* Preset Picker */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Choose Template Flow Copy</span>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {DEFAULT_PRESETS.map(p => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => loadPresetFlow(p)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.7rem', padding: '0.25rem 0.55rem' }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Variable insertion tags */}
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    Dynamic Personalization Variables:
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.45rem' }}>
                    {[
                      { tag: '{name}', label: '+ Name' },
                      { tag: '{product}', label: '+ Product' },
                      { tag: '{budget}', label: '+ Budget' },
                      { tag: '{company}', label: '+ Company' },
                      { tag: '{phone}', label: '+ Support Phone' },
                    ].map(v => (
                      <button
                        key={v.tag}
                        type="button"
                        onClick={() => insertVariable(v.tag)}
                        style={{
                          fontSize: '0.7rem',
                          background: 'rgba(99,102,241,0.12)',
                          color: 'var(--accent-primary)',
                          border: '1px solid rgba(99,102,241,0.3)',
                          borderRadius: 5,
                          padding: '0.25rem 0.55rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>

                  <textarea
                    ref={textareaRef}
                    className="input-field"
                    rows={6}
                    placeholder="Type your WhatsApp message copy here... Use {name}, {product}, {budget} tags for dynamic customization."
                    value={customText}
                    onChange={e => setCustomText(e.target.value)}
                    style={{ fontSize: '0.82rem', lineHeight: 1.45 }}
                  />

                  {/* Emoji Quick Picker */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.35rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Emojis:</span>
                    {EMOJIS.map(em => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => insertVariable(em)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.1rem' }}
                      >
                        {em}
                      </button>
                    ))}
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {customText.length} characters
                    </span>
                  </div>
                </div>

                {/* Media Attachment Dropzone */}
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <ImageIcon size={15} color="var(--accent-primary)" /> Header Media Attachment (Optional Image or PDF Catalog)
                  </label>

                  {campaignFile ? (
                    <div style={{ padding: '0.6rem 0.85rem', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {campaignFilePreview ? (
                        <img src={campaignFilePreview} alt="preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 6, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                          📄
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {campaignFile.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {(campaignFile.size / 1024).toFixed(0)} KB · Attached with personalized caption
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setCampaignFile(null); setCampaignFilePreview(null); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '1.1rem', padding: '0.2rem' }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div
                      onDrop={handleDrop}
                      onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                      onDragLeave={() => setIsDragOver(false)}
                      onClick={() => campaignFileRef.current?.click()}
                      style={{
                        border: `1.5px dashed ${isDragOver ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        borderRadius: 8, padding: '1rem',
                        textAlign: 'center', cursor: 'pointer',
                        background: isDragOver ? 'rgba(99,102,241,0.06)' : 'var(--bg-secondary)',
                      }}
                    >
                      <UploadCloud size={22} color="var(--accent-primary)" style={{ opacity: 0.6, marginBottom: 4 }} />
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Click or drag image (JPG/PNG) or PDF brochure</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Max 15 MB · WhatsApp media compliance</div>
                    </div>
                  )}
                  <input
                    ref={campaignFileRef}
                    type="file"
                    accept="image/*,.pdf,.mp4"
                    style={{ display: 'none' }}
                    onChange={e => handleFileSelect(e.target.files[0])}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setActiveStep(1)}>
                    <ArrowLeft size={14} /> Back to Audience
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setActiveStep(3)}>
                    Next: Interactive Reply Buttons Flow <ChevronRight size={15} />
                  </button>
                </div>

              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                STEP 3: INTERACTIVE REPLY BUTTONS & FLOW BUILDER (MULTI-LEVEL)
               ══════════════════════════════════════════════════════════════════ */}
            {activeStep === 3 && (
              <div className="glass-card p-6" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Zap size={16} color="var(--accent-primary)" /> Interactive Quick Reply Buttons & Decision Flow Tree
                    </h3>
                    <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                      Predefine 1 to 3 action buttons attached to your broadcast. Configure multi-level follow-ups, catalogs, or human takeover.
                    </p>
                  </div>
                  {buttons.length < 3 && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addButton}>
                      <Plus size={13} /> Add Button ({buttons.length}/3)
                    </button>
                  )}
                </div>

                {/* Button Tabs List */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {buttons.map((btn, idx) => (
                    <button
                      key={btn.id || idx}
                      type="button"
                      onClick={() => setEditingButtonIndex(idx)}
                      className="btn"
                      style={{
                        fontSize: '0.78rem', padding: '0.4rem 0.75rem',
                        background: editingButtonIndex === idx ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                        color: editingButtonIndex === idx ? 'white' : 'var(--text-primary)',
                        borderColor: editingButtonIndex === idx ? 'var(--accent-primary)' : 'var(--border-color)',
                      }}
                    >
                      <span>Button {idx + 1}: {btn.title || 'Untitled'}</span>
                      {btn.actionType === 'human_handoff' && <span style={{ fontSize: '0.65rem', opacity: 0.9 }}>👤 Handoff</span>}
                    </button>
                  ))}
                </div>

                {/* Selected Button Configuration Card */}
                {buttons[editingButtonIndex] && (
                  <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                        Configure Button #{editingButtonIndex + 1}
                      </span>
                      {buttons.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeButton(editingButtonIndex)}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                        >
                          <Trash2 size={12} /> Remove Button
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                          Button Title / Label (Max 20 chars) *
                        </label>
                        <input
                          type="text"
                          maxLength={20}
                          className="input-field"
                          value={buttons[editingButtonIndex].title}
                          onChange={e => updateButtonField(editingButtonIndex, 'title', e.target.value)}
                          placeholder="e.g. 📄 Download Catalog"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                          Trigger Action on Click *
                        </label>
                        <select
                          className="input-field"
                          value={buttons[editingButtonIndex].actionType}
                          onChange={e => updateButtonField(editingButtonIndex, 'actionType', e.target.value)}
                        >
                          <option value="reply">💬 Send Automated Follow-up Message</option>
                          <option value="nested_message">🌳 Nested Decision Flow (with Sub-Buttons)</option>
                          <option value="media_or_link">🔗 Send Direct URL / Catalog Link</option>
                          <option value="human_handoff">👤 Trigger Immediate Human Agent Takeover</option>
                        </select>
                      </div>
                    </div>

                    {/* Action: Follow-up Message / Nested Message Text */}
                    {buttons[editingButtonIndex].actionType !== 'human_handoff' && (
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                          Automated Bot Response Copy
                        </label>
                        <textarea
                          className="input-field"
                          rows={2}
                          value={buttons[editingButtonIndex].replyText || ''}
                          onChange={e => updateButtonField(editingButtonIndex, 'replyText', e.target.value)}
                          placeholder="What message should the bot send immediately when the client taps this button?"
                          style={{ fontSize: '0.78rem' }}
                        />
                      </div>
                    )}

                    {/* Action: Link URL */}
                    {buttons[editingButtonIndex].actionType === 'media_or_link' && (
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                          Target Web Link / PDF Brochure URL
                        </label>
                        <input
                          type="url"
                          className="input-field"
                          value={buttons[editingButtonIndex].linkUrl || ''}
                          onChange={e => updateButtonField(editingButtonIndex, 'linkUrl', e.target.value)}
                          placeholder="https://yourcompany.com/product-catalog.pdf"
                        />
                      </div>
                    )}

                    {/* Action: Human Handoff Notice */}
                    {buttons[editingButtonIndex].actionType === 'human_handoff' && (
                      <div style={{ padding: '0.75rem', background: 'rgba(245,158,11,0.1)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.74rem', color: 'var(--text-primary)' }}>
                        👤 <strong>Human Takeover Behavior:</strong> When the customer taps this button, AI is instantly paused, conversation status is changed to <code>HUMAN ACTIVE</code>, and an urgent follow-up task is assigned to your sales executive.
                      </div>
                    )}

                    {/* SUB-BUTTONS / LEVEL-2 BRANCHING BUILDER */}
                    {['reply', 'nested_message', 'media_or_link'].includes(buttons[editingButtonIndex].actionType) && (
                      <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <CornerDownRight size={13} color="var(--accent-primary)" /> Level-2 Sub-Buttons (Optional Next Step)
                          </span>
                          {(buttons[editingButtonIndex].subButtons || []).length < 3 && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}
                              onClick={() => addSubButton(editingButtonIndex)}
                            >
                              + Add Sub-Button
                            </button>
                          )}
                        </div>

                        {(buttons[editingButtonIndex].subButtons || []).length === 0 ? (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            No sub-buttons added yet. Add sub-buttons if you want the customer to have further options after clicking this button.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {(buttons[editingButtonIndex].subButtons || []).map((subBtn, sIdx) => (
                              <div key={subBtn.id || sIdx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 40px', gap: '0.5rem', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: 6 }}>
                                <input
                                  type="text"
                                  className="input-field"
                                  style={{ fontSize: '0.72rem', padding: '0.3rem 0.5rem' }}
                                  value={subBtn.title}
                                  onChange={e => updateSubButtonField(editingButtonIndex, sIdx, 'title', e.target.value)}
                                  placeholder="Sub-button label"
                                />
                                <select
                                  className="input-field"
                                  style={{ fontSize: '0.72rem', padding: '0.3rem 0.5rem' }}
                                  value={subBtn.actionType}
                                  onChange={e => updateSubButtonField(editingButtonIndex, sIdx, 'actionType', e.target.value)}
                                >
                                  <option value="reply">💬 Send Reply Message</option>
                                  <option value="human_handoff">👤 Talk to Human Agent</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => removeSubButton(editingButtonIndex, sIdx)}
                                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', textAlign: 'center' }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setActiveStep(2)}>
                    <ArrowLeft size={14} /> Back to Message
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setActiveStep(4)}>
                    Next: AI & Fallback Automation <ChevronRight size={15} />
                  </button>
                </div>

              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                STEP 4: AI & AUTOMATION RULES & MANDATORY FALLBACK
               ══════════════════════════════════════════════════════════════════ */}
            {activeStep === 4 && (
              <div className="glass-card p-6" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Bot size={16} color="var(--accent-primary)" /> AI & Automation Mode Configuration
                  </h3>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                    Define how incoming replies are processed when customers type freeform text or interact with quick replies.
                  </p>
                </div>

                {/* Automation Mode Selector Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  
                  {/* Mode 1: AI + Quick Reply Hybrid Mode */}
                  <div
                    onClick={() => setAutomationMode('hybrid')}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: 8,
                      border: `1.5px solid ${automationMode === 'hybrid' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      background: automationMode === 'hybrid' ? 'rgba(99,102,241,0.08)' : 'var(--bg-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        🤖 AI Knowledge Assistant + Quick Reply Buttons (Recommended Hybrid)
                      </div>
                      <input type="radio" checked={automationMode === 'hybrid'} onChange={() => {}} />
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      AI answers open-ended questions using your uploaded knowledge base. If customer taps quick replies or asks for a human, the bot seamlessly executes the flow or transfers the conversation.
                    </div>
                  </div>

                  {/* Mode 2: Strict Guided Menu Chatbot */}
                  <div
                    onClick={() => setAutomationMode('strict_guided')}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: 8,
                      border: `1.5px solid ${automationMode === 'strict_guided' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      background: automationMode === 'strict_guided' ? 'rgba(99,102,241,0.08)' : 'var(--bg-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        🛡️ Strict Guided Chatbot Menu (Zero Hallucination)
                      </div>
                      <input type="radio" checked={automationMode === 'strict_guided'} onChange={() => {}} />
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Customers navigate exclusively via predefined buttons. If they type freeform text, the automation guides them back to the menu or transfers them to a human agent.
                    </div>
                  </div>
                </div>

                {/* MANDATORY AI FALLBACK MECHANISM NOTICE */}
                <div style={{
                  padding: '0.85rem 1rem',
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(99,102,241,0.05) 100%)',
                  borderRadius: 8,
                  border: '1.5px solid var(--success)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.82rem', color: 'var(--success)', marginBottom: '0.25rem' }}>
                    <Shield size={16} /> Mandatory AI Fallback Engine (Always Enforced)
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    Whenever the AI model encounters high latency, API quota exhaustion, circuit breaker trip, or low confidence, it <strong>automatically serves the interactive guided quick reply menu</strong> so your clients always receive a controlled, reliable experience.
                  </div>
                </div>

                {/* Optional: Attach Quick Replies in AI Active Mode */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>Attach Quick Reply Buttons in AI Active Mode</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Include quick action buttons alongside AI generated responses.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={attachButtonsInAiMode}
                    onChange={e => setAttachButtonsInAiMode(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setActiveStep(3)}>
                    <ArrowLeft size={14} /> Back to Flow Builder
                  </button>
                  <button
                    type="button"
                    className="btn btn-whatsapp"
                    disabled={isSubmitting || effectiveCount === 0}
                    onClick={handleLaunchCampaign}
                  >
                    <Send size={15} /> Launch Campaign ({effectiveCount} Contacts)
                  </button>
                </div>

              </div>
            )}

          </div>

          {/* =========================================================================
              RIGHT COLUMN: INTERACTIVE CLICKABLE SMARTPHONE SIMULATOR
             ========================================================================= */}
          <div style={{ position: 'sticky', top: '1.5rem' }}>
            
            <div className="glass-card" style={{
              background: '#0c1317',
              borderRadius: 32,
              border: '4px solid #2a3942',
              boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
              overflow: 'hidden',
              maxWidth: 390,
              margin: '0 auto',
            }}>
              
              {/* Phone Top Notch / Header */}
              <div style={{ background: '#202c33', padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #2a3942' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#00a884', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.85rem' }}>
                    {campaignVariables.company?.slice(0, 1) || 'E'}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e9edef' }}>
                      {campaignVariables.company || 'ERPPro Solutions'}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: simHandedOver ? '#f59e0b' : '#8696a0' }}>
                      {simHandedOver ? '👤 Sales Specialist (Live)' : '🤖 Official AI Assistant (Online)'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetSimulator}
                  title="Reset Simulation"
                  style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer', padding: '0.2rem' }}
                >
                  <RotateCcw size={15} />
                </button>
              </div>

              {/* Chat Canvas (WhatsApp Background Texture) */}
              <div style={{
                height: 440,
                overflowY: 'auto',
                padding: '0.85rem',
                background: '#0b141a',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}>
                
                <div style={{ textAlign: 'center', margin: '0.2rem 0' }}>
                  <span style={{ fontSize: '0.62rem', background: '#182229', color: '#8696a0', padding: '0.2rem 0.6rem', borderRadius: 6 }}>
                    TODAY · INTERACTIVE SIMULATION
                  </span>
                </div>

                {/* Message Stream */}
                {simChatHistory.map((item, idx) => {
                  const isBot = item.sender === 'bot';
                  return (
                    <div
                      key={item.id || idx}
                      style={{
                        alignSelf: isBot ? 'flex-start' : 'flex-end',
                        maxWidth: '86%',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div style={{
                        background: isBot ? '#202c33' : '#005c4b',
                        color: '#e9edef',
                        borderRadius: isBot ? '8px 8px 8px 0' : '8px 8px 0 8px',
                        boxShadow: '0 1px 1px rgba(0,0,0,0.15)',
                        overflow: 'hidden',
                      }}>
                        {/* Attached Image Preview */}
                        {item.mediaPreview && (
                          <div style={{ maxHeight: 150, overflow: 'hidden' }}>
                            <img src={item.mediaPreview} alt="media" style={{ width: '100%', height: 150, objectFit: 'cover' }} />
                          </div>
                        )}

                        {/* Document Preview */}
                        {item.fileName && !item.mediaPreview && (
                          <div style={{ padding: '0.5rem 0.65rem', background: '#182229', borderBottom: '1px solid #2a3942', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div style={{ fontSize: '1.2rem' }}>📄</div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.fileName}
                            </div>
                          </div>
                        )}

                        <div style={{ padding: '0.55rem 0.7rem', fontSize: '0.76rem', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                          {item.text}
                          <div style={{ textAlign: 'right', fontSize: '0.6rem', color: '#8696a0', marginTop: '0.25rem' }}>
                            11:45 AM {isBot ? '' : '✓✓'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* CLICKABLE QUICK REPLY BUTTONS IN SIMULATOR */}
                {!simHandedOver && simCurrentButtons && simCurrentButtons.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.2rem' }}>
                    <div style={{ fontSize: '0.65rem', color: '#8696a0', textAlign: 'center', fontWeight: 600 }}>
                      ⚡ Tap a reply button to simulate client action:
                    </div>
                    {simCurrentButtons.map((btn, bIdx) => (
                      <button
                        key={btn.id || bIdx}
                        type="button"
                        onClick={() => handleSimulatorButtonClick(btn)}
                        style={{
                          background: '#202c33',
                          border: '1px solid #00a884',
                          color: '#00a884',
                          borderRadius: 8,
                          padding: '0.5rem 0.75rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textAlign: 'center',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span>{btn.title}</span>
                        {btn.actionType === 'human_handoff' && <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>👤 Handoff</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* Handover notification in simulator */}
                {simHandedOver && (
                  <div style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid #f59e0b', borderRadius: 8, padding: '0.5rem', textAlign: 'center', fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>
                    👤 Chat control transferred to human agent. AI is paused.
                  </div>
                )}

              </div>

              {/* Phone Footer Input bar */}
              <div style={{ background: '#202c33', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderTop: '1px solid #2a3942' }}>
                <input
                  type="text"
                  readOnly
                  placeholder={simHandedOver ? 'Agent chat active...' : 'Client interacting via buttons...'}
                  style={{
                    flex: 1,
                    background: '#2a3942',
                    border: 'none',
                    borderRadius: 20,
                    padding: '0.35rem 0.75rem',
                    color: '#8696a0',
                    fontSize: '0.72rem',
                  }}
                />
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#00a884', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.75rem' }}>
                  <Send size={12} />
                </div>
              </div>

            </div>

            <div style={{ textAlign: 'center', marginTop: '0.65rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Interactive Live Phone Simulator · Click buttons above to test decision branching
            </div>

          </div>

        </div>
      )}

    </div>
  );
};

export default CampaignStudio;
