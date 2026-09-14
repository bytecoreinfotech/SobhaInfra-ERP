import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle, Send, Users, Filter, CheckCircle2, AlertTriangle,
  Zap, UploadCloud, Paperclip, CheckSquare, Square, Search, Plus,
  Sparkles, FileText, Image as ImageIcon, Phone, Layers, Settings,
  SlidersHorizontal, ChevronRight, ArrowLeft, RefreshCw, Trash2,
  ExternalLink, UserCheck, Bot, CornerDownRight, Smartphone, RotateCcw,
  Check, HelpCircle, Shield, Info, Save, FolderOpen, Copy, Edit3, X
} from 'lucide-react';
import { estimateCampaignAudience, queueCampaign, processCampaignBatch, getLeads, getCustomerMaster, normalizePhone, getCampaignTemplates, saveCampaignTemplate, deleteCampaignTemplate, syncMetaTemplates, submitMetaTemplate, getMetaTemplates } from '../lib/db';
import { uploadToWhatsAppMedia, getWhatsAppMediaType } from '../lib/storage';
import { extractMainName, isGenericName, formatPhoneNumber } from '../lib/nameHelper';
import './Pages.css';

const DEFAULT_PRESETS = [
  {
    name: 'Sobha Product Range & Brochure Broadcast',
    text: 'Namaste {name}! 🙏\n\nWelcome to *Sobhainfra Tech Private Limited* ("Har Nirman Ki Jaan") — manufacturing high-performance dry mix construction materials since 2003.\n\n🏗️ *Our Core Product Range:*\n• Sobha Block Fix (Thin Joint Mortar)\n• Sobha Plast (Ready Mix Plaster - IS 16777)\n• Sobha Tile Adhesives (Type 1 CE to Type 4 HF)\n• Super Fine Flyash & GGBS Cement\n\n📄 Download our complete product catalog attached or choose an option below:',
    buttons: [
      {
        id: 'btn_catalog',
        title: '📄 Get Brochure',
        actionType: 'media_or_link',
        replyText: '📄 Official Sobha Product Catalog PDF attached directly. Would you like a customized bulk quote?',
        linkUrl: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
        subButtons: [
          { id: 'sub_rate', title: '💰 Rate List', actionType: 'human_handoff', replyText: 'Transferring to sales executive for latest rate chart...' },
          { id: 'sub_human', title: '👤 Talk to Executive', actionType: 'human_handoff', replyText: 'Connecting you with our sales executive...' }
        ]
      },
      {
        id: 'btn_rate_list',
        title: '💰 Rate List',
        actionType: 'human_handoff',
        replyText: 'Our official rate list and bulk project quotations are provided directly by our sales executive. Transferring your request...',
        subButtons: [
          { id: 'sub_catalog2', title: '📄 Product Catalog', actionType: 'media_or_link', linkUrl: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf' },
          { id: 'sub_agent2', title: '👤 Call Executive', actionType: 'human_handoff', replyText: 'Sales executive will call you shortly.' }
        ]
      },
      {
        id: 'btn_human',
        title: '👤 Talk to Executive',
        actionType: 'human_handoff',
        replyText: 'Transferring chat to our sales executive...',
      }
    ]
  },
  {
    name: 'Sobha Dry Mix & Mortar Campaign',
    text: 'Dear {name}, 🚀\n\nLooking for certified, high-bond dry mix solutions for your upcoming construction projects?\n\n*Sobhainfra Tech* provides direct factory supply of *{product}* with 20,000+ bags/day capacity from Gujarat.\n\nSelect an option below to get product details or request a quotation:',
    buttons: [
      {
        id: 'btn_brochure_dm',
        title: '📄 Get Brochure',
        actionType: 'media_or_link',
        replyText: 'Here is our complete technical catalog and test certificate guide.',
        linkUrl: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
        subButtons: [
          { id: 'sub_quote_dm', title: '💰 Rate List', actionType: 'human_handoff', replyText: 'Connecting to sales team for project quotation...' },
          { id: 'sub_human_dm', title: '👤 Talk to Executive', actionType: 'human_handoff', replyText: 'Connecting with specialist...' }
        ]
      },
      {
        id: 'btn_rate_dm',
        title: '💰 Rate List',
        actionType: 'human_handoff',
        replyText: 'Our sales team will share the latest project rate chart with you shortly.',
      },
      {
        id: 'btn_agent_dm',
        title: '👤 Talk to Executive',
        actionType: 'human_handoff',
        replyText: 'Connecting you with our technical sales engineer...',
      }
    ]
  },
  {
    name: 'Payment & Invoice Follow-up',
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
    product: 'Sobha Block Fix & Tile Adhesive',
    budget: '₹1,50,000',
    company: 'Sobhainfra Tech Private Limited',
    phone: '+91 99990 00001',
    mode: 'fallback', // 'fallback' | 'override'
  });

  // Audience State: 'sheet' | 'filter' | 'contacts' | 'paste'
  const [targetMode, setTargetMode] = useState('sheet');
  const [filters, setFilters] = useState({ statusFilter: 'All', propertyFilter: 'All', minScore: 0 });
  const [estimation, setEstimation] = useState({ totalRaw: 0, targeted: 0, optedOut: 0, invalidPhone: 0, finalAudienceCount: 0, eligibleLeads: [] });

  // 1. Google Sheet Customer Master state
  const [customerMaster, setCustomerMaster] = useState([]);
  const [selectedSheetCustomerIds, setSelectedSheetCustomerIds] = useState(new Set());
  const [sheetCustomerSearch, setSheetCustomerSearch] = useState('');
  const [loadingSheetCustomers, setLoadingSheetCustomers] = useState(false);
  const sheetMasterCheckboxRef = useRef(null);
  const crmMasterCheckboxRef = useRef(null);

  // 2. CRM Contacts Multi-select state
  const [allCrmLeads, setAllCrmLeads] = useState([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState(new Set());
  const [contactSearch, setContactSearch] = useState('');
  const [pastedNumbers, setPastedNumbers] = useState('');

  // Message & Media State
  const [customText, setCustomText] = useState(DEFAULT_PRESETS[0].text);
  const [campaignFile, setCampaignFile] = useState(null);
  const [campaignFilePreview, setCampaignFilePreview] = useState(null);
  const [uploadedMediaUrl, setUploadedMediaUrl] = useState(null);
  const [uploadedMediaType, setUploadedMediaType] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
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
  const [simTakeoverFlagged, setSimTakeoverFlagged] = useState(false);
  const [simInputText, setSimInputText] = useState('');
  const simCanvasRef = useRef(null);

  // Execution
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [launchSuccess, setLaunchSuccess] = useState(false);

  // Campaign Template State
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaveSuccess, setTemplateSaveSuccess] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Meta WhatsApp Templates State
  const [metaTemplates, setMetaTemplates] = useState([]);
  const [syncingMeta, setSyncingMeta] = useState(false);
  const [syncToast, setSyncToast] = useState(null);
  const [showSubmitMetaModal, setShowSubmitMetaModal] = useState(false);
  const [submittingToMeta, setSubmittingToMeta] = useState(false);
  const [submitMetaName, setSubmitMetaName] = useState('');
  const [submitMetaCategory, setSubmitMetaCategory] = useState('MARKETING');
  const [submitMetaStatus, setSubmitMetaStatus] = useState(null);
  const [selectedMetaTemplate, setSelectedMetaTemplate] = useState(null);
  // Template Lifecycle: lock fields once an approved Meta template is applied
  const [isTemplateLocked, setIsTemplateLocked] = useState(false);
  const [templateModifiedAfterLock, setTemplateModifiedAfterLock] = useState(false);

  useEffect(() => {
    loadInitialData();
    calculateAudience();
    loadSavedTemplates();
    loadMetaTemplates();
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

  // Auto-scroll simulator canvas
  useEffect(() => {
    if (simCanvasRef.current) {
      simCanvasRef.current.scrollTop = simCanvasRef.current.scrollHeight;
    }
  }, [simChatHistory, simCurrentButtons, simTakeoverFlagged]);

  const loadInitialData = async () => {
    setLoadingSheetCustomers(true);
    try {
      const [leadsRes, masterRes] = await Promise.all([
        getLeads(),
        getCustomerMaster()
      ]);
      const leads = leadsRes.data || [];
      const master = masterRes.data || [];
      setAllCrmLeads(leads);
      setCustomerMaster(master);

      // Pre-select all valid sheet customers so user can broadcast to all or deselect anyone
      const valid = master.filter(c => (c.contact_number || '').replace(/\D/g, '').length >= 10);
      setSelectedSheetCustomerIds(new Set(valid.map(c => c.id)));
    } catch (err) {
      console.warn('[CampaignStudio] loadInitialData error:', err);
    } finally {
      setLoadingSheetCustomers(false);
    }
  };

  const calculateAudience = async () => {
    const est = await estimateCampaignAudience(filters);
    setEstimation(est);
  };

  // Valid & filtered Sheet Customers
  const validSheetCustomers = useMemo(() => {
    return customerMaster.filter(c => {
      const raw = (c.contact_number || '').trim();
      const digits = raw.replace(/\D/g, '').slice(-10);
      return digits.length === 10;
    });
  }, [customerMaster]);

  const filteredSheetCustomers = useMemo(() => {
    if (!sheetCustomerSearch.trim()) return validSheetCustomers;
    const q = sheetCustomerSearch.toLowerCase().trim();
    return validSheetCustomers.filter(c => {
      const co = (c.company_name || '').toLowerCase();
      const cp = (c.contact_person || '').toLowerCase();
      const ph = (c.contact_number || '').toLowerCase();
      return co.includes(q) || cp.includes(q) || ph.includes(q);
    });
  }, [validSheetCustomers, sheetCustomerSearch]);

  const allFilteredSheetSelected = filteredSheetCustomers.length > 0 &&
    filteredSheetCustomers.every(c => selectedSheetCustomerIds.has(c.id));
  const someFilteredSheetSelected = filteredSheetCustomers.some(c => selectedSheetCustomerIds.has(c.id));

  useEffect(() => {
    if (sheetMasterCheckboxRef.current) {
      sheetMasterCheckboxRef.current.indeterminate = !allFilteredSheetSelected && someFilteredSheetSelected;
    }
  }, [allFilteredSheetSelected, someFilteredSheetSelected]);

  const toggleSelectAllSheetCustomers = () => {
    const next = new Set(selectedSheetCustomerIds);
    if (allFilteredSheetSelected) {
      filteredSheetCustomers.forEach(c => next.delete(c.id));
    } else {
      filteredSheetCustomers.forEach(c => next.add(c.id));
    }
    setSelectedSheetCustomerIds(next);
  };

  const toggleSheetCustomer = (id) => {
    const next = new Set(selectedSheetCustomerIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedSheetCustomerIds(next);
  };

  // CRM Leads filtered & selection helpers
  const filteredCrmLeads = useMemo(() => {
    if (!contactSearch.trim()) return allCrmLeads;
    const q = contactSearch.toLowerCase().trim();
    return allCrmLeads.filter(l => (l.name || '').toLowerCase().includes(q) || (l.phone || '').includes(q));
  }, [allCrmLeads, contactSearch]);

  const allFilteredCrmSelected = filteredCrmLeads.length > 0 &&
    filteredCrmLeads.every(l => selectedLeadIds.has(l.id));
  const someFilteredCrmSelected = filteredCrmLeads.some(l => selectedLeadIds.has(l.id));

  useEffect(() => {
    if (crmMasterCheckboxRef.current) {
      crmMasterCheckboxRef.current.indeterminate = !allFilteredCrmSelected && someFilteredCrmSelected;
    }
  }, [allFilteredCrmSelected, someFilteredCrmSelected]);

  const toggleSelectAllCrmContacts = () => {
    const next = new Set(selectedLeadIds);
    if (allFilteredCrmSelected) {
      filteredCrmLeads.forEach(l => next.delete(l.id));
    } else {
      filteredCrmLeads.forEach(l => next.add(l.id));
    }
    setSelectedLeadIds(next);
  };

  const toggleCrmLead = (id) => {
    const next = new Set(selectedLeadIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLeadIds(next);
  };

  // Compute final effective recipients
  const getEffectiveRecipients = () => {
    if (targetMode === 'sheet') {
      return validSheetCustomers
        .filter(c => selectedSheetCustomerIds.has(c.id))
        .map(c => {
          const cleanName = extractMainName(c.contact_person, c.company_name) || c.contact_person || c.company_name || 'Valued Customer';
          return {
            id: c.id,
            name: cleanName,
            full_name: c.contact_person || c.company_name,
            company_name: c.company_name || '',
            phone: normalizePhone(c.contact_number),
            contact_number: c.contact_number,
            property_interest: campaignVariables.product || 'our products',
            budget: campaignVariables.budget || '',
            source: 'google_sheet',
          };
        });
    }
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
          const digits10 = norm.replace(/\D/g, '').slice(-10);
          const matchedCust = customerMaster.find(c => (c.contact_number || '').replace(/\D/g, '').slice(-10) === digits10);
          const matchedLead = allCrmLeads.find(l => (l.phone || '').replace(/\D/g, '').slice(-10) === digits10);
          const matchedName = matchedCust
            ? (matchedCust.contact_person || matchedCust.company_name)
            : (matchedLead?.name && !isGenericName(matchedLead.name) ? matchedLead.name : '');

          list.push({
            id: `pasted-${idx}`,
            name: matchedName || formatPhoneNumber(norm),
            phone: norm,
            property_interest: campaignVariables.product || 'our products',
            budget: campaignVariables.budget || '',
            company_name: matchedCust?.company_name || campaignVariables.company || '',
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

  // Media file handlers with proactive background upload
  const handleFileSelect = (file) => {
    if (!file) return;
    setCampaignFile(file);
    setUploadedMediaUrl(null);
    setUploadedMediaType(null);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => setCampaignFilePreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setCampaignFilePreview(null);
    }

    // Proactively upload in background
    setUploadingMedia(true);
    uploadToWhatsAppMedia(file, 'campaigns')
      .then(url => {
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          setUploadedMediaUrl(url);
          setUploadedMediaType(getWhatsAppMediaType(file));
        }
      })
      .catch(err => {
        console.warn('[CampaignStudio] Proactive upload error:', err.message);
      })
      .finally(() => {
        setUploadingMedia(false);
      });
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
  // ─── Campaign Template CRUD handlers ───
  const loadSavedTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const templates = await getCampaignTemplates();
      setSavedTemplates(templates);
    } catch (err) {
      console.warn('[CampaignStudio] loadSavedTemplates error:', err.message);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      const template = {
        name: templateName.trim(),
        text: customText,
        buttons: buttons,
        mediaUrl: uploadedMediaUrl || null,
        mediaType: uploadedMediaType || null,
        automationMode,
        campaignDefaults: campaignVariables,
      };
      const { data, error } = await saveCampaignTemplate(template);
      if (!error && data) {
        setSavedTemplates(prev => [...prev, data]);
        setTemplateSaveSuccess(true);
        setShowSaveModal(false);
        setTemplateName('');
        setTimeout(() => setTemplateSaveSuccess(false), 4000);
      }
    } catch (err) {
      console.error('[CampaignStudio] saveTemplate error:', err);
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (tplId) => {
    try {
      await deleteCampaignTemplate(tplId);
      setSavedTemplates(prev => prev.filter(t => t.id !== tplId));
    } catch (err) {
      console.error('[CampaignStudio] deleteTemplate error:', err);
    }
  };

  const handleLoadTemplate = (tpl) => {
    setCustomText(tpl.text || '');
    setButtons(tpl.buttons || []);
    if (tpl.mediaUrl) {
      setUploadedMediaUrl(tpl.mediaUrl);
      setUploadedMediaType(tpl.mediaType || 'image');
    }
    if (tpl.automationMode) setAutomationMode(tpl.automationMode);
    if (tpl.campaignDefaults) setCampaignVariables(prev => ({ ...prev, ...tpl.campaignDefaults }));
    setEditingButtonIndex(0);
    setName(tpl.name || '');
  };

  const loadPresetFlow = (preset) => {
    setCustomText(preset.text);
    setButtons(preset.buttons || []);
    setEditingButtonIndex(0);
    setSelectedMetaTemplate(null);
    setIsTemplateLocked(false);
    setTemplateModifiedAfterLock(false);
  };

  // ─── META TEMPLATES MANAGEMENT ─────────────────────────────────────────────
  const loadMetaTemplates = async () => {
    try {
      const { data } = await getMetaTemplates();
      if (data && data.length > 0) {
        setMetaTemplates(data);
      }
    } catch (err) {
      console.warn('[CampaignStudio] loadMetaTemplates error:', err);
    }
  };

  const handleSyncMeta = async () => {
    setSyncingMeta(true);
    setSyncToast('🔄 Connecting to Meta Graph API & pulling approved templates...');
    try {
      const res = await syncMetaTemplates();
      if (res.success) {
        setMetaTemplates(res.templates || []);
        setSyncToast(`✅ Synced ${res.fetched || res.synced || 0} templates from Meta WhatsApp Business Account!`);
        setTimeout(() => setSyncToast(null), 5000);
      } else {
        setSyncToast(`❌ Meta Sync Error: ${res.error || 'Failed to sync'}`);
        setTimeout(() => setSyncToast(null), 6000);
      }
    } catch (err) {
      setSyncToast(`❌ Sync Error: ${err.message}`);
      setTimeout(() => setSyncToast(null), 6000);
    } finally {
      setSyncingMeta(false);
    }
  };

  const handleSubmitToMeta = async () => {
    if (!customText.trim()) {
      alert('Please enter message text in Step 2 before submitting to Meta.');
      return;
    }
    setSubmittingToMeta(true);
    setSubmitMetaStatus(null);
    try {
      let headerType = 'NONE';
      let headerMediaUrl = null;
      let headerText = '';

      if (uploadedMediaUrl || campaignFile) {
        headerType = 'IMAGE';
        headerMediaUrl = uploadedMediaUrl || null;
      } else {
        headerType = 'TEXT';
        headerText = 'Sobhainfra Tech';
      }

      // Format body text: convert {name} to {{1}}, {company} to {{2}} for Meta template syntax
      let metaBodyText = customText
        .replace(/\{name\}/gi, '{{1}}')
        .replace(/\{company\}/gi, '{{2}}')
        .replace(/\{product\}/gi, '{{3}}')
        .replace(/\{budget\}|\{amount\}/gi, '{{4}}')
        .replace(/\{phone\}/gi, '{{5}}');

      // Ensure no raw {variable} braces remain without index
      metaBodyText = metaBodyText.replace(/\{([^}]+)\}/g, '{{1}}');

      // Up to 3 quick reply buttons per Meta specification
      const validButtons = (buttons || []).slice(0, 3).map((b, idx) => ({
        type: 'QUICK_REPLY',
        text: (b.title || b.text || `Option ${idx + 1}`).replace(/[^\w\s-]/gi, '').trim().slice(0, 25) || `Option ${idx + 1}`,
      }));

      const payload = {
        name: submitMetaName || `sobha_promo_${Date.now().toString().slice(-5)}`,
        category: submitMetaCategory || 'MARKETING',
        language: 'en',
        headerType,
        headerText,
        headerMediaUrl,
        bodyText: metaBodyText,
        footerText: 'Sobhainfra Tech Private Limited',
        buttons: validButtons,
      };

      const res = await submitMetaTemplate(payload);
      if (res.success) {
        setSubmitMetaStatus({
          success: true,
          message: `✅ Success! Template "${res.name}" submitted to Meta! Status: ${res.status}. Meta usually approves within 2-15 minutes.`
        });
        // Auto-refresh templates list from Meta
        setTimeout(() => {
          handleSyncMeta();
        }, 1500);
      } else {
        setSubmitMetaStatus({
          success: false,
          message: `❌ ${res.error || 'Meta rejected template registration'}`
        });
      }
    } catch (err) {
      setSubmitMetaStatus({
        success: false,
        message: `❌ Error: ${err.message}`
      });
    } finally {
      setSubmittingToMeta(false);
    }
  };

  const handleSelectMetaTemplate = (tpl) => {
    setSelectedMetaTemplate(tpl);
    // Convert {{1}} to {name}, {{2}} to {company}
    let body = tpl.body_text || '';
    body = body.replace(/\{\{1\}\}/g, '{name}').replace(/\{\{2\}\}/g, '{company}');
    setCustomText(body);
    setName(`Broadcast - ${tpl.name}`);

    // STRICT: set buttons ONLY from what the template defines.
    // If the template has no BUTTONS component, clear to empty — we cannot
    // send buttons that were not part of the approved template.
    let templateButtons = [];
    if (tpl.components) {
      const btnComp = tpl.components.find(c => c.type === 'BUTTONS');
      if (btnComp && btnComp.buttons && btnComp.buttons.length > 0) {
        templateButtons = btnComp.buttons.map((b, i) => ({
          id: `meta_btn_${i + 1}`,
          title: b.text || `Button ${i + 1}`,
          actionType: b.type === 'URL' ? 'media_or_link' : 'human_handoff',
          replyText: `Customer selected: ${b.text}`,
          linkUrl: b.url || '',
        }));
      }
    } else if (tpl.quick_reply_buttons && tpl.quick_reply_buttons.length > 0) {
      // Some DB schemas store buttons flat on the template object
      templateButtons = tpl.quick_reply_buttons.map((b, i) => ({
        id: `meta_btn_${i + 1}`,
        title: (typeof b === 'string' ? b : b.text) || `Button ${i + 1}`,
        actionType: 'human_handoff',
        replyText: `Customer selected: ${typeof b === 'string' ? b : b.text}`,
      }));
    }
    // Always overwrite — never carry over previous campaign buttons
    setButtons(templateButtons);
    setEditingButtonIndex(0);

    // Lock fields — this is an approved Meta template, no edits allowed
    if (tpl.status === 'APPROVED') {
      setIsTemplateLocked(true);
      setTemplateModifiedAfterLock(false);
    } else {
      setIsTemplateLocked(false);
      setTemplateModifiedAfterLock(false);
    }
    setActiveStep(2);
  };

  const handleUnlockTemplate = () => {
    // User wants to edit — unlock but mark as modified (template no longer valid for direct send)
    setIsTemplateLocked(false);
    setTemplateModifiedAfterLock(true);
  };

  const handleRelockTemplate = () => {
    // Re-select same template to restore locked state
    if (selectedMetaTemplate) handleSelectMetaTemplate(selectedMetaTemplate);
  };


  // Format message text for preview
  const isOverride = campaignVariables.mode === 'override';
  const sampleLead = effectiveRecipients[0] || {};
  const displayProduct = isOverride ? campaignVariables.product : (sampleLead.property_interest || sampleLead.product || campaignVariables.product || 'Our Products & Services');
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
    setSimTakeoverFlagged(false);
    setSimInputText('');
  };

  const handleSimulatorButtonClick = (button) => {
    // 1. User sends button click as an interactive message
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: button.title,
    };

    const nextHistory = [...simChatHistory, userMsg];
    const bId = (button.id || '').toLowerCase();
    const bTitle = (button.title || '').toLowerCase();

    const isFirstGreeting = simChatHistory.filter(m => m.sender === 'bot').length === 0;
    const mainName = extractMainName(displayName);

    // 2. Brochure / Catalog trigger
    if (bId.includes('catalog') || bId.includes('brochure') || bTitle.includes('brochure') || bTitle.includes('catalog')) {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        fileName: 'Sobha_Infratech_Product_Catalog.pdf',
        mediaUrl: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
        text: isFirstGreeting
          ? `📄 Namaste ${mainName}!\n\nPlease find our official *Sobhainfra Tech Product Catalog & Technical Specification Guide* attached above in PDF format.\n\nIt covers our complete manufacturing range:\n• Sobha Block Fix (Thin Joint Mortar)\n• Sobha Plast (Ready Mix Plaster)\n• Sobha Tile Adhesives (CE, VT, SA, HF)\n• Super Fine Flyash & GGBS Cement\n\nHow would you like to proceed?`
          : `📄 Please find our official *Sobhainfra Tech Product Catalog & Technical Specification Guide* attached above in PDF format.\n\nIt covers our complete manufacturing range:\n• Sobha Block Fix (Thin Joint Mortar)\n• Sobha Plast (Ready Mix Plaster)\n• Sobha Tile Adhesives (CE, VT, SA, HF)\n• Super Fine Flyash & GGBS Cement\n\nHow would you like to proceed?`,
      });
      setSimCurrentButtons([
        { id: 'sim_rate', title: '💰 Rate List', actionType: 'human_handoff' },
        { id: 'sim_exec', title: '👤 Talk to Executive', actionType: 'human_handoff' },
        { id: 'sim_specs', title: '📦 Product Specs', actionType: 'specs' },
      ]);
    }
    // 3. Rate list trigger -> Handover flagged in CRM, but AI CONTINUES ANSWERING!
    else if (bId.includes('rate') || bTitle.includes('rate') || bTitle.includes('price') || bTitle.includes('quote')) {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: isFirstGreeting
          ? `💰 Namaste ${mainName}!\n\nOur official rate lists and project quotations are provided directly by our sales executive based on your delivery location and order quantity.\n\n🚨 I have transferred your request to our executive who will connect with you shortly! 📞\n\nIn the meantime, feel free to ask about any product specifications, applications, or test certificates right here!`
          : `💰 Our official rate lists and project quotations are provided directly by our sales executive based on your delivery location and order quantity.\n\n🚨 I have transferred your request to our executive who will connect with you shortly! 📞\n\nIn the meantime, feel free to ask about any product specifications, applications, or test certificates right here!`,
      });
      setSimTakeoverFlagged(true);
      setSimCurrentButtons([
        { id: 'sim_brochure', title: '📄 Product Catalog', actionType: 'brochure' },
        { id: 'sim_exec', title: '👤 Talk to Executive', actionType: 'human_handoff' },
        { id: 'sim_specs', title: '📦 Product Specs', actionType: 'specs' },
      ]);
    }
    // 4. Executive callback trigger
    else if (bTitle.includes('executive') || bTitle.includes('human') || bTitle.includes('agent') || button.actionType === 'human_handoff') {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: isFirstGreeting
          ? `👋 Namaste ${mainName}! I have alerted our senior sales executive to connect with you directly.\n\nWhile our team gets in touch, our AI assistant remains active right here to answer any product specifications, applications, or technical details! 📞`
          : `👋 I have alerted our senior sales executive to connect with you directly.\n\nWhile our team gets in touch, our AI assistant remains active right here to answer any product specifications, applications, or technical details! 📞`,
      });
      setSimTakeoverFlagged(true);
      setSimCurrentButtons([
        { id: 'sim_brochure', title: '📄 Product Catalog', actionType: 'brochure' },
        { id: 'sim_specs', title: '📦 Product Specs', actionType: 'specs' },
      ]);
    }
    // 5. Product Specs trigger
    else if (bTitle.includes('spec')) {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: `📦 *Sobha Manufacturing Range & Specifications:*\n\n🧱 *Sobha Block Fix*: Self-curing thin joint mortar (3mm joint, reduces mortar consumption by 75%)\n🛡️ *Sobha Plast*: Premixed cement plaster (IS 16777 certified)\n🏗️ *Sobha Tile Adhesives*: Type 1 CE (Ceramic), Type 2 VT (Vitrified), Type 3 SA (Large Format/Granite), Type 4 HF (High Flexibility/Swimming Pools)\n⚡ *Super Fine Flyash & GGBS Cement*: High-grade pozzolanic binder`,
      });
      setSimCurrentButtons([
        { id: 'sim_brochure', title: '📄 Get Brochure', actionType: 'brochure' },
        { id: 'sim_rate', title: '💰 Rate List', actionType: 'human_handoff' },
        { id: 'sim_exec', title: '👤 Talk to Executive', actionType: 'human_handoff' },
      ]);
    }
    // 6. Sub-buttons or custom reply
    else if (button.subButtons && button.subButtons.length > 0) {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: formatText(button.replyText || 'Thank you! Please select a follow-up option:'),
      });
      setSimCurrentButtons(button.subButtons);
    } else {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: formatText(button.replyText || 'Thank you for your response! How else may we assist you?'),
      });
      setSimCurrentButtons([
        { id: 'sim_brochure', title: '📄 Get Brochure', actionType: 'brochure' },
        { id: 'sim_rate', title: '💰 Rate List', actionType: 'human_handoff' },
        { id: 'sim_exec', title: '👤 Talk to Executive', actionType: 'human_handoff' },
      ]);
    }

    setSimChatHistory(nextHistory);
  };

  // Interactive Typing in Simulator
  const handleSimulatorSendMessage = () => {
    const raw = simInputText.trim();
    if (!raw) return;
    setSimInputText('');

    const userMsg = { id: `user-${Date.now()}`, sender: 'user', text: raw };
    const nextHistory = [...simChatHistory, userMsg];
    const lower = raw.toLowerCase();

    const isFirstGreeting = simChatHistory.filter(m => m.sender === 'bot').length === 0;
    const mainName = extractMainName(displayName);

    if (lower.includes('rate') || lower.includes('price') || lower.includes('quote') || lower.includes('bhav') || lower.includes('discount')) {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: isFirstGreeting
          ? `💰 Namaste ${mainName}!\n\nOur official rate lists and customized project quotations are provided directly by our senior sales specialists based on your delivery location and order quantity.\n\n🚨 I have transferred your request to our executive who will connect with you shortly! 📞\n\nIn the meantime, feel free to ask any technical, application, or packing questions about our products right here!`
          : `💰 Our official rate lists and customized project quotations are provided directly by our senior sales specialists based on your delivery location and order quantity.\n\n🚨 I have transferred your request to our executive who will connect with you shortly! 📞\n\nIn the meantime, feel free to ask any technical, application, or packing questions about our products right here!`,
      });
      setSimTakeoverFlagged(true);
      setSimCurrentButtons([
        { id: 'sim_brochure', title: '📄 Product Catalog', actionType: 'brochure' },
        { id: 'sim_exec', title: '👤 Talk to Executive', actionType: 'human_handoff' },
      ]);
    } else if (lower.includes('brochure') || lower.includes('catalog') || lower.includes('pdf') || lower.includes('details')) {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        fileName: 'Sobha_Infratech_Product_Catalog.pdf',
        mediaUrl: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
        text: isFirstGreeting
          ? `📄 Namaste ${mainName}! Please find our official *Sobhainfra Tech Product Catalog & Technical Specification Guide* attached above in PDF format.`
          : `📄 Please find our official *Sobhainfra Tech Product Catalog & Technical Specification Guide* attached above in PDF format.`,
      });
      setSimCurrentButtons([
        { id: 'sim_rate', title: '💰 Rate List', actionType: 'human_handoff' },
        { id: 'sim_exec', title: '👤 Talk to Executive', actionType: 'human_handoff' },
        { id: 'sim_specs', title: '📦 Product Specs', actionType: 'specs' },
      ]);
    } else if (lower.includes('factory') || lower.includes('plant') || lower.includes('location') || lower.includes('address') || lower.includes('kaha')) {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: `🏭 *Sobhainfra Tech Manufacturing Plant:*\n\nOur state-of-the-art production plant is located in Gujarat with an automated manufacturing capacity of 20,000+ bags/day. We operate computer-controlled batching and continuous German dry-mix blending technology.`,
      });
      setSimCurrentButtons([
        { id: 'sim_brochure', title: '📄 Get Brochure', actionType: 'brochure' },
        { id: 'sim_rate', title: '💰 Rate List', actionType: 'human_handoff' },
      ]);
    } else if (lower.includes('block fix') || lower.includes('mortar') || lower.includes('aac')) {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: `🧱 *Sobha Block Fix (Thin Joint Mortar):*\n\n• High-strength polymer-modified mortar designed for AAC blocks and fly ash bricks.\n• Application thickness: 3-4mm (eliminates conventional 15mm mortar).\n• Curing: Self-curing, saves water and speeds construction by 3x.\n• Coverage: Approx. 140–160 sq.ft per 40kg bag for 4-inch AAC blocks.`,
      });
      setSimCurrentButtons([
        { id: 'sim_brochure', title: '📄 Get Brochure', actionType: 'brochure' },
        { id: 'sim_rate', title: '💰 Rate List', actionType: 'human_handoff' },
      ]);
    } else if (lower.includes('adhesive') || lower.includes('tile') || lower.includes('marble') || lower.includes('granite')) {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: `🏗️ *Sobha Tile Adhesive Range:*\n\n• *Type 1 CE*: For ceramic and small tiles on internal floors/walls.\n• *Type 2 VT*: High-strength for vitrified and porcelain tiles.\n• *Type 3 SA*: High polymer for large slabs, granite, marble & external dry areas.\n• *Type 4 HF*: Highly flexible for external facades, swimming pools & heavy traffic zones.`,
      });
      setSimCurrentButtons([
        { id: 'sim_brochure', title: '📄 Get Brochure', actionType: 'brochure' },
        { id: 'sim_rate', title: '💰 Rate List', actionType: 'human_handoff' },
      ]);
    } else {
      nextHistory.push({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: `Hello ${displayName}! 👋 Thank you for messaging Sobhainfra Tech. Our automated AI assistant is active right here to help with product catalogs, technical specifications, or connect you with our sales team!`,
      });
      setSimCurrentButtons([
        { id: 'sim_brochure', title: '📄 Get Brochure', actionType: 'brochure' },
        { id: 'sim_rate', title: '💰 Rate List', actionType: 'human_handoff' },
        { id: 'sim_exec', title: '👤 Talk to Executive', actionType: 'human_handoff' },
      ]);
    }

    setSimChatHistory(nextHistory);
  };

  // LAUNCH CAMPAIGN
  const handleLaunchCampaign = async () => {
    if (effectiveCount === 0) return;
    setIsSubmitting(true);

    let mediaUrl = uploadedMediaUrl;
    let mediaType = uploadedMediaType || 'text';

    if (campaignFile && (!mediaUrl || !mediaUrl.startsWith('http'))) {
      try {
        mediaUrl = await uploadToWhatsAppMedia(campaignFile, 'campaigns');
        mediaType = getWhatsAppMediaType(campaignFile);
        setUploadedMediaUrl(mediaUrl);
        setUploadedMediaType(mediaType);
      } catch (err) {
        console.warn('[CampaignStudio] Storage upload failed:', err.message);
        mediaUrl = null;
        mediaType = 'text';
      }
    }

    // Safeguard: Ensure mediaUrl is only passed if it is a valid HTTP/HTTPS URL
    const finalMediaUrl = (mediaUrl && typeof mediaUrl === 'string' && (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://'))) ? mediaUrl : null;
    const finalMediaType = finalMediaUrl ? (mediaType || 'image') : 'text';

    // Determine if this is an approved Meta template send
    const isMetaTemplate = isTemplateLocked && selectedMetaTemplate?.status === 'APPROVED';
    const metaTemplateName = selectedMetaTemplate?.name || null;
    // Meta stores language as 'en', 'en_US', etc. — use exactly what was synced from Meta
    const metaTemplateLanguage = selectedMetaTemplate?.language || 'en';

    const payload = {
      name: name.trim() || 'WhatsApp Broadcast Flow',
      // Store real template name in DB record
      template_name: metaTemplateName || 'Interactive Broadcast Flow',
      custom_message: customText,
      media_url: finalMediaUrl,
      media_type: finalMediaType,
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
        mediaUrl: finalMediaUrl,
        mediaType: finalMediaType,
        campaignDefaults: campaignVariables,
        interactiveButtons: isMetaTemplate ? [] : buttons, // no interactive buttons for Meta template sends
        buttonFlow: isMetaTemplate ? null : { buttons, automationMode },
        recipients: effectiveRecipients,
        // Template dispatch fields
        templateName: metaTemplateName,
        templateLanguage: metaTemplateLanguage,
        templateParams: null, // let server auto-build from recipient name + company
        // Pass the full template components so the Netlify function can dynamically
        // build the correct Meta API payload (header image, body params, etc.)
        templateComponents: isMetaTemplate ? (selectedMetaTemplate?.components || null) : null,
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* 1. Sync Templates from Meta */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSyncMeta}
            disabled={syncingMeta}
            style={{
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              borderColor: '#10b981',
              background: 'rgba(16, 185, 129, 0.08)',
              color: '#059669',
              fontWeight: 600,
            }}
            data-tooltip="Pull approved templates from Meta WhatsApp Business Account"
            data-tooltip-pos="bottom"
          >
            <RefreshCw size={14} className={syncingMeta ? 'animate-spin' : ''} />
            <span>{syncingMeta ? 'Syncing...' : `Sync Meta (${metaTemplates.length})`}</span>
          </button>

          {/* 2. Submit Template to Meta */}
          <button
            type="button"
            className="btn"
            disabled={!customText.trim()}
            onClick={() => {
              setSubmitMetaName((name || 'sobha_promo').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30));
              setSubmitMetaStatus(null);
              setShowSubmitMetaModal(true);
            }}
            style={{
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: customText.trim()
                ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                : 'var(--bg-tertiary)',
              color: customText.trim() ? '#ffffff' : 'var(--text-muted)',
              border: customText.trim() ? 'none' : '1px solid var(--border-color)',
              fontWeight: 700,
              boxShadow: customText.trim() ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'none',
              cursor: customText.trim() ? 'pointer' : 'not-allowed',
              opacity: customText.trim() ? 1 : 0.55,
            }}
            data-tooltip={customText.trim() ? 'Submit this design directly to Meta for official template approval' : 'Add message text first to enable this button'}
            data-tooltip-pos="bottom"
          >
            <Sparkles size={14} />
            <span>Submit to Meta 🚀</span>
          </button>

          {/* 3. Variables Customizer */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowVarSettings(p => !p)}
            style={{
              fontSize: '0.78rem',
              borderColor: showVarSettings ? 'var(--accent-primary)' : 'var(--border-color)',
              background: showVarSettings ? 'rgba(99,102,241,0.1)' : 'var(--bg-secondary)',
            }}
          >
            <Settings size={14} color="var(--accent-primary)" />
            <span>Variables ⚙️</span>
          </button>

          {/* 4. Launch Broadcast */}
          <button
            type="button"
            className="btn btn-whatsapp"
            disabled={isSubmitting || effectiveCount === 0 || (selectedMetaTemplate && templateModifiedAfterLock)}
            onClick={handleLaunchCampaign}
            title={selectedMetaTemplate && templateModifiedAfterLock ? 'Template was modified — re-apply or submit to Meta for approval before sending' : ''}
            style={{
              fontWeight: 700, fontSize: '0.82rem', padding: '0.5rem 1.1rem',
              opacity: (selectedMetaTemplate && templateModifiedAfterLock) ? 0.5 : 1,
              cursor: (selectedMetaTemplate && templateModifiedAfterLock) ? 'not-allowed' : 'pointer',
            }}
          >
            <Send size={15} /> {isSubmitting ? 'Launching...' : `Launch to ${effectiveCount} Contacts`}
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncToast && (
        <div className="animate-fade-in" style={{
          marginBottom: '1rem',
          padding: '0.65rem 1rem',
          borderRadius: 8,
          background: syncToast.startsWith('❌') ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
          border: syncToast.startsWith('❌') ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
          color: syncToast.startsWith('❌') ? '#dc2626' : '#059669',
          fontSize: '0.82rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>{syncToast}</span>
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 800 }}
          >
            ✕
          </button>
        </div>
      )}

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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', marginBottom: '0.85rem' }}>
                    {[
                      { id: 'sheet', label: `Sheet Customers (${validSheetCustomers.length})`, icon: <Users size={13} /> },
                      { id: 'contacts', label: 'CRM Checklist Multi-Select', icon: <CheckSquare size={13} /> },
                      { id: 'filter', label: 'Dynamic Lead Filter', icon: <Filter size={13} /> },
                      { id: 'paste', label: 'Paste Phone Numbers', icon: <FileText size={13} /> },
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setTargetMode(m.id)}
                        className="btn"
                        style={{
                          fontSize: '0.72rem', padding: '0.45rem 0.35rem',
                          background: targetMode === m.id ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                          color: targetMode === m.id ? 'white' : 'var(--text-secondary)',
                          fontWeight: targetMode === m.id ? 700 : 500,
                        }}
                      >
                        {m.icon} {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Sub-Panel: Sheet Customers Checklist */}
                  {targetMode === 'sheet' && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 8 }}>
                      <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Search customer name, company, or phone..."
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem 0.35rem 1.8rem' }}
                          value={sheetCustomerSearch}
                          onChange={e => setSheetCustomerSearch(e.target.value)}
                        />
                        <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                        {sheetCustomerSearch && (
                          <button
                            type="button"
                            onClick={() => setSheetCustomerSearch('')}
                            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem' }}
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Master Checkbox Button Bar for Selecting All Sheet Customers */}
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.45rem 0.65rem',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 6,
                        marginBottom: '0.5rem',
                        border: '1px solid var(--border-color)',
                      }}>
                        <label style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', userSelect: 'none'
                        }}>
                          <input
                            type="checkbox"
                            ref={sheetMasterCheckboxRef}
                            checked={allFilteredSheetSelected}
                            onChange={toggleSelectAllSheetCustomers}
                            style={{ cursor: 'pointer', width: 15, height: 15, accentColor: 'var(--accent-primary)' }}
                          />
                          <span>Select All Customer Numbers ({filteredSheetCustomers.length})</span>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--accent-primary)' }}>{selectedSheetCustomerIds.size}</strong> of {validSheetCustomers.length} selected
                          </span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}
                            onClick={toggleSelectAllSheetCustomers}
                          >
                            {allFilteredSheetSelected ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                      </div>

                      {/* Scrollable Customer List with Individual Checkboxes (Freedom to Deselect) */}
                      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                        {loadingSheetCustomers ? (
                          <div style={{ textAlign: 'center', padding: '1.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <RefreshCw size={14} className="animate-spin" /> Loading customer directory...
                          </div>
                        ) : filteredSheetCustomers.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '1.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            No matching sheet customers found.
                          </div>
                        ) : (
                          filteredSheetCustomers.map(cust => {
                            const isSelected = selectedSheetCustomerIds.has(cust.id);
                            const cleanName = extractMainName(cust.contact_person, cust.company_name);
                            return (
                              <div
                                key={cust.id}
                                onClick={() => toggleSheetCustomer(cust.id)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '0.55rem',
                                  padding: '0.45rem 0.65rem',
                                  borderBottom: '1px solid var(--border-color)',
                                  cursor: 'pointer',
                                  background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent',
                                  fontSize: '0.75rem',
                                  transition: 'background 0.15s',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--accent-primary)' }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                      {cleanName || cust.contact_person || cust.company_name || formatPhoneNumber(cust.contact_number) || 'Client'}
                                    </span>
                                    {cust.contact_person && cleanName !== cust.contact_person && (
                                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                        ({cust.contact_person})
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {cust.company_name}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {cust.contact_number}
                                  </div>
                                  <span className="badge badge-neutral" style={{ fontSize: '0.6rem', padding: '0.1rem 0.35rem' }}>
                                    Sheet Synced
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

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
                      <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Search contact name or phone..."
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem 0.35rem 1.8rem' }}
                          value={contactSearch}
                          onChange={e => setContactSearch(e.target.value)}
                        />
                        <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                        {contactSearch && (
                          <button
                            type="button"
                            onClick={() => setContactSearch('')}
                            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem' }}
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Master Checkbox Button Bar for CRM Leads */}
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.45rem 0.65rem',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 6,
                        marginBottom: '0.5rem',
                        border: '1px solid var(--border-color)',
                      }}>
                        <label style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', userSelect: 'none'
                        }}>
                          <input
                            type="checkbox"
                            ref={crmMasterCheckboxRef}
                            checked={allFilteredCrmSelected}
                            onChange={toggleSelectAllCrmContacts}
                            style={{ cursor: 'pointer', width: 15, height: 15, accentColor: 'var(--accent-primary)' }}
                          />
                          <span>Select All CRM Contacts ({filteredCrmLeads.length})</span>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--accent-primary)' }}>{selectedLeadIds.size}</strong> of {allCrmLeads.length} selected
                          </span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}
                            onClick={toggleSelectAllCrmContacts}
                          >
                            {allFilteredCrmSelected ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                      </div>

                      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                        {filteredCrmLeads.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '1.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            No matching CRM contacts found.
                          </div>
                        ) : (
                          filteredCrmLeads.map(l => (
                            <div
                              key={l.id}
                              onClick={() => toggleCrmLead(l.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.55rem',
                                padding: '0.45rem 0.65rem',
                                borderBottom: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                background: selectedLeadIds.has(l.id) ? 'rgba(99,102,241,0.08)' : 'transparent',
                                fontSize: '0.75rem',
                                transition: 'background 0.15s',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedLeadIds.has(l.id)}
                                onChange={() => {}}
                                style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--accent-primary)' }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600 }}>{l.name}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{l.phone}</div>
                              </div>
                              <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{l.status}</span>
                            </div>
                          ))
                        )}
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
                
                {/* ─── META APPROVED TEMPLATES LIBRARY (OFFICIAL META WABA SYNC) ─── */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
                  borderRadius: 12,
                  padding: '1rem',
                  border: '1.5px solid rgba(16, 185, 129, 0.45)',
                  boxShadow: '0 2px 10px rgba(16, 185, 129, 0.08)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>⚡</span>
                      <div>
                        <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          Meta Approved Templates Library
                          <span className="badge badge-whatsapp" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                            {metaTemplates.filter(t => t.status === 'APPROVED').length} Active
                          </span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Bypasses 24-hour window restriction for 100% guaranteed delivery to cold & inactive contacts
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleSyncMeta}
                        disabled={syncingMeta}
                        style={{
                          fontSize: '0.72rem',
                          padding: '0.25rem 0.6rem',
                          borderColor: '#10b981',
                          color: '#059669',
                          background: 'rgba(16, 185, 129, 0.12)',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}
                        title="Pull latest templates from Meta WhatsApp Business Account"
                      >
                        <RefreshCw size={12} className={syncingMeta ? 'animate-spin' : ''} />
                        <span>{syncingMeta ? 'Syncing...' : 'Sync from Meta'}</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setSubmitMetaName((name || 'sobha_promo').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30));
                          setSubmitMetaStatus(null);
                          setShowSubmitMetaModal(true);
                        }}
                        style={{
                          fontSize: '0.72rem',
                          padding: '0.25rem 0.65rem',
                          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                          color: 'white',
                          border: 'none',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          boxShadow: '0 2px 6px rgba(99, 102, 241, 0.35)',
                        }}
                        title="Submit this current message + buttons to Meta for approval"
                      >
                        <Sparkles size={12} />
                        <span>+ Register on Meta</span>
                      </button>
                    </div>
                  </div>

                  {/* Active / Synced Meta Templates Pill Grid */}
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                    {metaTemplates.length === 0 ? (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.4rem 0' }}>
                        No templates loaded yet. Click <strong>"Sync from Meta"</strong> above to fetch your approved templates.
                      </div>
                    ) : (
                      metaTemplates.map(tpl => {
                        const isSelected = selectedMetaTemplate?.name === tpl.name;
                        const isApproved = tpl.status === 'APPROVED';
                        return (
                          <div
                            key={tpl.id || tpl.name}
                            style={{
                              padding: '0.35rem 0.65rem',
                              borderRadius: 8,
                              background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-card)',
                              border: isSelected ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-color)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.45rem',
                              fontSize: '0.74rem',
                            }}
                          >
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: isApproved ? '#10b981' : '#f59e0b',
                              boxShadow: isApproved ? '0 0 6px #10b981' : 'none',
                              flexShrink: 0,
                            }} />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 700, color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                                {tpl.name}
                              </span>
                              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                {tpl.category} · {tpl.language}
                              </span>
                            </div>
                            <span style={{
                              fontSize: '0.62rem',
                              padding: '0.1rem 0.35rem',
                              borderRadius: 4,
                              background: isApproved ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                              color: isApproved ? '#059669' : '#d97706',
                              fontWeight: 700,
                            }}>
                              {isApproved ? 'Approved' : 'Pending'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSelectMetaTemplate(tpl)}
                              style={{
                                border: 'none',
                                background: isSelected ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                color: isSelected ? 'white' : 'var(--text-secondary)',
                                padding: '0.2rem 0.5rem',
                                borderRadius: 5,
                                cursor: 'pointer',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                              }}
                            >
                              {isSelected ? 'In Use ✓' : 'Apply'}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {selectedMetaTemplate && (
                    <div style={{
                      marginTop: '0.65rem',
                      padding: '0.35rem 0.65rem',
                      borderRadius: 6,
                      background: 'rgba(99, 102, 241, 0.1)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      fontSize: '0.72rem',
                      color: 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <span>
                        🎯 Broadcasting with Meta Template: <strong>{selectedMetaTemplate.name}</strong> ({selectedMetaTemplate.category})
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedMetaTemplate(null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 800, fontSize: '0.75rem' }}
                        title="Unlink Meta template and use custom text"
                      >
                        ✕ Unlink
                      </button>
                    </div>
                  )}
                </div>

                {/* Template Manager — Built-in Presets + Saved Templates */}
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '0.85rem', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <FolderOpen size={15} color="var(--accent-primary)" /> Campaign Templates
                    </span>
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                      {templateSaveSuccess && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                          <Check size={12} /> Template Saved!
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                        onClick={() => setShowSaveModal(true)}
                      >
                        <Save size={12} /> Save Current as Template
                      </button>
                    </div>
                  </div>

                  {/* Built-in Presets */}
                  <div style={{ marginBottom: '0.65rem' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>Built-in Presets:</span>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {DEFAULT_PRESETS.map(p => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => loadPresetFlow(p)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Saved Templates */}
                  {savedTemplates.length > 0 && (
                    <div>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                        📂 My Saved Templates ({savedTemplates.length}):
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {savedTemplates.map(tpl => (
                          <div key={tpl.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: 'var(--bg-primary)', padding: '0.45rem 0.65rem', borderRadius: 6,
                            border: '1px solid var(--border-color)', fontSize: '0.73rem'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                              <FileText size={13} color="var(--accent-primary)" />
                              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {tpl.name}
                              </span>
                              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                                {tpl.buttons?.length || 0} buttons · {tpl.createdAt ? new Date(tpl.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                onClick={() => handleLoadTemplate(tpl)}
                              >
                                <Copy size={11} /> Load
                              </button>
                              <button
                                type="button"
                                style={{
                                  fontSize: '0.65rem', padding: '0.15rem 0.35rem', display: 'flex', alignItems: 'center', gap: '0.15rem',
                                  background: 'none', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 4, cursor: 'pointer'
                                }}
                                onClick={() => handleDeleteTemplate(tpl.id)}
                              >
                                <Trash2 size={11} /> Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Save Template Modal Inline */}
                  {showSaveModal && (
                    <div style={{
                      marginTop: '0.65rem', padding: '0.75rem', background: 'var(--bg-primary)',
                      borderRadius: 8, border: '1px solid var(--accent-primary)', display: 'flex',
                      flexDirection: 'column', gap: '0.5rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Save size={14} color="var(--accent-primary)" /> Save Campaign as Reusable Template
                        </span>
                        <button type="button" onClick={() => setShowSaveModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                          <X size={16} />
                        </button>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Template Name *</label>
                        <input
                          type="text"
                          className="input-field"
                          value={templateName}
                          onChange={e => setTemplateName(e.target.value)}
                          placeholder="e.g. Sobha Product Launch Campaign"
                          autoFocus
                        />
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        Saves: message text, interactive buttons (with sub-buttons), media URL, automation mode, and campaign defaults.
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem' }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowSaveModal(false)} style={{ fontSize: '0.7rem' }}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleSaveTemplate}
                          disabled={!templateName.trim() || savingTemplate}
                          style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                        >
                          {savingTemplate ? <RefreshCw size={12} className="spin" /> : <Save size={12} />}
                          {savingTemplate ? 'Saving...' : 'Save Template'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Template Lifecycle Lock Banner */}
                {isTemplateLocked && selectedMetaTemplate && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem',
                    padding: '0.6rem 0.85rem', borderRadius: 8,
                    background: 'linear-gradient(90deg, rgba(16,185,129,0.12) 0%, rgba(99,102,241,0.08) 100%)',
                    border: '1.5px solid rgba(16,185,129,0.4)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <Shield size={15} color="#059669" />
                      <div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669' }}>
                          🔒 Locked — Meta Approved Template
                        </span>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          Fields are read-only. This template is approved and ready to send.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleUnlockTemplate}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        fontSize: '0.73rem', fontWeight: 700, padding: '0.3rem 0.7rem',
                        background: 'rgba(245,158,11,0.12)', border: '1.5px solid rgba(245,158,11,0.5)',
                        color: '#d97706', borderRadius: 6, cursor: 'pointer',
                      }}
                    >
                      <Edit3 size={12} /> Edit Template
                    </button>
                  </div>
                )}

                {/* Modified-after-lock warning */}
                {templateModifiedAfterLock && selectedMetaTemplate && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem',
                    padding: '0.6rem 0.85rem', borderRadius: 8,
                    background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.35)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <AlertTriangle size={15} color="#dc2626" />
                      <div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626' }}>
                          ⚠️ Template Modified — Cannot Send Campaign
                        </span>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          You edited an approved template. Re-apply the original or submit to Meta for new approval.
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        onClick={handleRelockTemplate}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.3rem',
                          fontSize: '0.73rem', fontWeight: 700, padding: '0.3rem 0.7rem',
                          background: 'rgba(16,185,129,0.12)', border: '1.5px solid rgba(16,185,129,0.5)',
                          color: '#059669', borderRadius: 6, cursor: 'pointer',
                        }}
                      >
                        <RotateCcw size={12} /> Re-apply Original
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSubmitMetaName((name || 'sobha_promo').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30));
                          setSubmitMetaStatus(null);
                          setShowSubmitMetaModal(true);
                        }}
                        disabled={!customText.trim()}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.3rem',
                          fontSize: '0.73rem', fontWeight: 700, padding: '0.3rem 0.7rem',
                          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                          border: 'none', color: 'white', borderRadius: 6, cursor: 'pointer',
                        }}
                      >
                        <Sparkles size={12} /> Submit New Version to Meta
                      </button>
                    </div>
                  </div>
                )}

                {/* Variable insertion tags */}
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    Dynamic Personalization Variables:
                    {isTemplateLocked && <span style={{ fontSize: '0.65rem', color: '#059669', marginLeft: '0.4rem', fontWeight: 600 }}>🔒 Read-only</span>}
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
                        onClick={() => !isTemplateLocked && insertVariable(v.tag)}
                        disabled={isTemplateLocked}
                        style={{
                          fontSize: '0.7rem',
                          background: isTemplateLocked ? 'var(--bg-tertiary)' : 'rgba(99,102,241,0.12)',
                          color: isTemplateLocked ? 'var(--text-muted)' : 'var(--accent-primary)',
                          border: isTemplateLocked ? '1px solid var(--border-color)' : '1px solid rgba(99,102,241,0.3)',
                          borderRadius: 5,
                          padding: '0.25rem 0.55rem',
                          cursor: isTemplateLocked ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          opacity: isTemplateLocked ? 0.5 : 1,
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
                    onChange={e => {
                      if (isTemplateLocked) return;
                      setCustomText(e.target.value);
                    }}
                    readOnly={isTemplateLocked}
                    style={{
                      fontSize: '0.82rem', lineHeight: 1.45,
                      cursor: isTemplateLocked ? 'not-allowed' : 'text',
                      background: isTemplateLocked ? 'var(--bg-tertiary)' : undefined,
                      color: isTemplateLocked ? 'var(--text-secondary)' : undefined,
                      borderColor: isTemplateLocked ? 'rgba(16,185,129,0.35)' : undefined,
                    }}
                  />

                  {/* Emoji Quick Picker */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.35rem', opacity: isTemplateLocked ? 0.4 : 1 }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Emojis:</span>
                    {EMOJIS.map(em => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => !isTemplateLocked && insertVariable(em)}
                        disabled={isTemplateLocked}
                        style={{ background: 'none', border: 'none', cursor: isTemplateLocked ? 'not-allowed' : 'pointer', fontSize: '0.9rem', padding: '0.1rem' }}
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
                <div style={{ opacity: isTemplateLocked ? 0.65 : 1, pointerEvents: isTemplateLocked ? 'none' : 'auto', position: 'relative' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <ImageIcon size={15} color="var(--accent-primary)" /> Header Media Attachment (Optional Image or PDF Catalog)
                    {isTemplateLocked && <span style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 600 }}>🔒 Locked</span>}
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
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                          <span>{(campaignFile.size / 1024).toFixed(0)} KB</span>
                          <span>·</span>
                          {uploadingMedia ? (
                            <span style={{ color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontWeight: 600 }}>
                              <RefreshCw size={11} className="animate-spin" /> Uploading to CDN...
                            </span>
                          ) : uploadedMediaUrl ? (
                            <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontWeight: 600 }}>
                              <CheckCircle2 size={11} /> Ready for broadcast
                            </span>
                          ) : (
                            <span>Attached</span>
                          )}
                        </div>
                      </div>
                      {!isTemplateLocked && (
                        <button
                          type="button"
                          onClick={() => { setCampaignFile(null); setCampaignFilePreview(null); setUploadedMediaUrl(null); setUploadedMediaType(null); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '1.1rem', padding: '0.2rem' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ) : (
                    <div
                      onDrop={!isTemplateLocked ? handleDrop : undefined}
                      onDragOver={!isTemplateLocked ? e => { e.preventDefault(); setIsDragOver(true); } : undefined}
                      onDragLeave={!isTemplateLocked ? () => setIsDragOver(false) : undefined}
                      onClick={!isTemplateLocked ? () => campaignFileRef.current?.click() : undefined}
                      style={{
                        border: `1.5px dashed ${isTemplateLocked ? 'var(--border-color)' : isDragOver ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        borderRadius: 8, padding: '1rem',
                        textAlign: 'center', cursor: isTemplateLocked ? 'not-allowed' : 'pointer',
                        background: isTemplateLocked ? 'var(--bg-tertiary)' : isDragOver ? 'rgba(99,102,241,0.06)' : 'var(--bg-secondary)',
                      }}
                    >
                      <UploadCloud size={22} color={isTemplateLocked ? 'var(--text-muted)' : 'var(--accent-primary)'} style={{ opacity: 0.6, marginBottom: 4 }} />
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isTemplateLocked ? 'var(--text-muted)' : undefined }}>
                        {isTemplateLocked ? '🔒 Media locked — click Edit to change' : 'Click or drag image (JPG/PNG) or PDF brochure'}
                      </div>
                      {!isTemplateLocked && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Max 15 MB · WhatsApp media compliance</div>}
                    </div>
                  )}
                  <input
                    ref={campaignFileRef}
                    type="file"
                    accept="image/*,.pdf,.mp4"
                    style={{ display: 'none' }}
                    onChange={e => !isTemplateLocked && handleFileSelect(e.target.files[0])}
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
                      {isTemplateLocked && <span style={{ fontSize: '0.65rem', color: '#059669', background: 'rgba(16,185,129,0.12)', padding: '0.15rem 0.4rem', borderRadius: 4, fontWeight: 700 }}>🔒 Locked</span>}
                    </h3>
                    <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                      {isTemplateLocked ? 'Buttons are locked because an approved Meta template is applied. Click "Edit Template" in Step 2 to modify.' : 'Predefine 1 to 3 action buttons attached to your broadcast. Configure multi-level follow-ups, catalogs, or human takeover.'}
                    </p>
                  </div>
                  {buttons.length < 3 && !isTemplateLocked && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addButton}>
                      <Plus size={13} /> Add Button ({buttons.length}/3)
                    </button>
                  )}
                </div>

                {/* Button Tabs List — or empty state when locked template has no buttons */}
                {isTemplateLocked && buttons.length === 0 ? (
                  <div style={{
                    padding: '1.25rem 1rem', borderRadius: 8, textAlign: 'center',
                    background: 'rgba(16,185,129,0.06)', border: '1.5px dashed rgba(16,185,129,0.35)',
                  }}>
                    <div style={{ fontSize: '1.6rem', marginBottom: '0.4rem' }}>🚫</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
                      No Reply Buttons in This Template
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto' }}>
                      The approved Meta template <strong style={{ color: 'var(--accent-primary)' }}>{selectedMetaTemplate?.name}</strong> does not include interactive buttons.
                      This campaign will be sent as a <strong>text/media-only broadcast</strong> — exactly as Meta approved it.
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#d97706', marginTop: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                      <AlertTriangle size={12} />
                      Adding buttons would require re-submitting a new template to Meta for approval.
                    </div>
                  </div>
                ) : (
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
                )}

                {/* Selected Button Configuration Card */}
                {buttons[editingButtonIndex] && (
                  <div style={{
                    background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 8,
                    border: isTemplateLocked ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border-color)',
                    display: 'flex', flexDirection: 'column', gap: '0.85rem',
                    opacity: isTemplateLocked ? 0.75 : 1,
                    pointerEvents: isTemplateLocked ? 'none' : 'auto',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                        {isTemplateLocked ? '🔒 ' : ''}Configure Button #{editingButtonIndex + 1}
                      </span>
                      {buttons.length > 1 && !isTemplateLocked && (
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

                    {/* SUB-BUTTONS / LEVEL-2 BRANCHING BUILDER — Full Configuration */}
                    {['reply', 'nested_message', 'media_or_link'].includes(buttons[editingButtonIndex].actionType) && (
                      <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '0.85rem', marginTop: '0.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <CornerDownRight size={14} color="var(--accent-primary)" />
                            <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Level-2 Sub-Buttons (Follow-up Options After Click)</span>
                            <span style={{ fontSize: '0.65rem', background: 'var(--bg-tertiary)', padding: '0.1rem 0.4rem', borderRadius: 8, color: 'var(--text-muted)', fontWeight: 600 }}>
                              {(buttons[editingButtonIndex].subButtons || []).length} / 3
                            </span>
                          </div>
                          {(buttons[editingButtonIndex].subButtons || []).length < 3 && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              onClick={() => addSubButton(editingButtonIndex)}
                            >
                              <Plus size={12} /> Add Sub-Button
                            </button>
                          )}
                        </div>

                        {(buttons[editingButtonIndex].subButtons || []).length === 0 ? (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: 6 }}>
                            No sub-buttons configured. When the customer taps Button #{editingButtonIndex + 1}, only the primary action above will execute. Add sub-buttons to create a multi-step decision tree.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {(buttons[editingButtonIndex].subButtons || []).map((subBtn, sIdx) => {
                              const actionLabel = subBtn.actionType === 'human_handoff' ? '👤 Creates Sales Callback Task → HUMAN ACTIVE'
                                : subBtn.actionType === 'media_or_link' ? '📄 Sends Document / Catalog PDF'
                                : subBtn.actionType === 'rate_list_pdf' ? '📊 Sends Rate List PDF + Sales Escalation'
                                : '💬 Sends Custom Reply Message';
                              return (
                                <div key={subBtn.id || sIdx} style={{ background: 'var(--bg-tertiary)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border-color)', position: 'relative' }}>
                                  {/* Sub-button header with level indicator */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-primary)', background: 'rgba(99,102,241,0.1)', padding: '0.1rem 0.4rem', borderRadius: 4 }}>
                                        L1 → L2 #{sIdx + 1}
                                      </span>
                                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                        {actionLabel}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeSubButton(editingButtonIndex, sIdx)}
                                      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
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
                                        maxLength={20}
                                        className="input-field"
                                        style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                                        value={subBtn.title}
                                        onChange={e => updateSubButtonField(editingButtonIndex, sIdx, 'title', e.target.value)}
                                        placeholder="e.g. 📊 Rate List PDF"
                                      />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: '0.68rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>
                                        Trigger Action on Click *
                                      </label>
                                      <select
                                        className="input-field"
                                        style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                                        value={subBtn.actionType}
                                        onChange={e => updateSubButtonField(editingButtonIndex, sIdx, 'actionType', e.target.value)}
                                      >
                                        <option value="reply">💬 Send Custom Reply Message</option>
                                        <option value="media_or_link">📄 Send Catalog / Document PDF</option>
                                        <option value="rate_list_pdf">📊 Send Rate List PDF + Sales Escalation</option>
                                        <option value="human_handoff">👤 Connect with Executive (Human Takeover)</option>
                                      </select>
                                    </div>
                                  </div>

                                  {/* Reply Text (for all non-handoff actions) */}
                                  {subBtn.actionType !== 'human_handoff' && (
                                    <div style={{ marginBottom: '0.45rem' }}>
                                      <label style={{ fontSize: '0.68rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>
                                        Automated Bot Response When Tapped:
                                      </label>
                                      <textarea
                                        className="input-field"
                                        rows={2}
                                        value={subBtn.replyText || ''}
                                        onChange={e => updateSubButtonField(editingButtonIndex, sIdx, 'replyText', e.target.value)}
                                        placeholder={
                                          subBtn.actionType === 'media_or_link' ? 'e.g. Here is our official product catalog PDF...'
                                          : subBtn.actionType === 'rate_list_pdf' ? 'e.g. Sending our latest official rate list. A sales executive will connect with you shortly...'
                                          : 'e.g. Thank you! Here are the details you requested...'
                                        }
                                        style={{ fontSize: '0.74rem', resize: 'vertical' }}
                                      />
                                    </div>
                                  )}

                                  {/* Link URL (for media/link actions) */}
                                  {subBtn.actionType === 'media_or_link' && (
                                    <div>
                                      <label style={{ fontSize: '0.68rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>
                                        Document / Catalog PDF URL:
                                      </label>
                                      <input
                                        type="url"
                                        className="input-field"
                                        style={{ fontSize: '0.74rem', padding: '0.35rem 0.5rem' }}
                                        value={subBtn.linkUrl || ''}
                                        onChange={e => updateSubButtonField(editingButtonIndex, sIdx, 'linkUrl', e.target.value)}
                                        placeholder="https://yoursite.com/catalog.pdf"
                                      />
                                    </div>
                                  )}

                                  {/* Human handoff notice */}
                                  {subBtn.actionType === 'human_handoff' && (
                                    <div style={{ padding: '0.5rem 0.65rem', background: 'rgba(245,158,11,0.08)', borderRadius: 5, border: '1px solid rgba(245,158,11,0.25)', fontSize: '0.7rem', color: 'var(--text-primary)' }}>
                                      👤 <strong>Effect:</strong> AI is paused, conversation mode → <code>HUMAN ACTIVE</code>, urgent callback task assigned to sales executive.
                                    </div>
                                  )}

                                  {/* Rate list notice */}
                                  {subBtn.actionType === 'rate_list_pdf' && (
                                    <div style={{ padding: '0.5rem 0.65rem', background: 'rgba(16,185,129,0.08)', borderRadius: 5, border: '1px solid rgba(16,185,129,0.25)', fontSize: '0.7rem', color: 'var(--text-primary)' }}>
                                      📊 <strong>Effect:</strong> Official Rate List PDF auto-attached (if uploaded) + high-priority sales escalation task created.
                                    </div>
                                  )}
                                </div>
                              );
                            })}
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
              <div
                ref={simCanvasRef}
                style={{
                  height: 440,
                  overflowY: 'auto',
                  padding: '0.85rem',
                  background: '#0b141a',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                }}
              >
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

                        {/* Document PDF Card Preview */}
                        {item.fileName && !item.mediaPreview && (
                          <a
                            href={item.mediaUrl || 'https://sobhainfra-erp.netlify.app/sobha-products.pdf'}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: '0.55rem 0.75rem',
                              background: '#182229',
                              borderBottom: '1px solid #2a3942',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.55rem',
                              textDecoration: 'none',
                              color: '#e9edef',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ fontSize: '1.3rem', flexShrink: 0 }}>📄</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.74rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.fileName}
                              </div>
                              <div style={{ fontSize: '0.62rem', color: '#00a884', fontWeight: 600 }}>
                                PDF Document · Click to View ↗
                              </div>
                            </div>
                          </a>
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

                {/* Handover / Escalation notification in simulator */}
                {simTakeoverFlagged && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    borderRadius: 8,
                    padding: '0.45rem 0.65rem',
                    textAlign: 'center',
                    fontSize: '0.68rem',
                    color: '#ef4444',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                  }}>
                    <span>🚨</span>
                    <span>Executive Callback Flagged in ERP · AI continues answering below!</span>
                  </div>
                )}

                {/* CLICKABLE QUICK REPLY BUTTONS IN SIMULATOR */}
                {simCurrentButtons && simCurrentButtons.length > 0 && (
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

              </div>

              {/* Phone Footer Input bar (Fully Interactive Customer Chat Simulator) */}
              <div style={{ background: '#202c33', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderTop: '1px solid #2a3942' }}>
                <input
                  type="text"
                  value={simInputText}
                  onChange={e => setSimInputText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSimulatorSendMessage(); }}
                  placeholder="Type message (e.g. Rate list, factory, Tile adhesive)..."
                  style={{
                    flex: 1,
                    background: '#2a3942',
                    border: '1px solid #3a4b56',
                    borderRadius: 20,
                    padding: '0.4rem 0.75rem',
                    color: '#e9edef',
                    fontSize: '0.74rem',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={handleSimulatorSendMessage}
                  title="Send simulated customer message"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: '#00a884',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '0.75rem',
                    flexShrink: 0,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  }}
                >
                  <Send size={13} />
                </button>
              </div>

            </div>

            <div style={{ textAlign: 'center', marginTop: '0.65rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Interactive Live Phone Simulator · Click buttons above to test decision branching
            </div>

          </div>

        </div>
      )}

      {/* ─── SUBMIT TEMPLATE TO META MODAL ─── */}
      {showSubmitMetaModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="glass-card animate-fade-in" style={{
            width: '100%', maxWidth: 540,
            background: 'var(--bg-primary)',
            border: '1.5px solid var(--accent-primary)',
            borderRadius: 14,
            padding: '1.5rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column', gap: '1rem',
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Submit Template to Meta WhatsApp API</h3>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Registers this design directly with Meta for official approval
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowSubmitMetaModal(false); setSubmitMetaStatus(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            {/* Status Alert if submitted */}
            {submitMetaStatus && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: 8,
                background: submitMetaStatus.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                border: submitMetaStatus.success ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
                color: submitMetaStatus.success ? '#059669' : '#dc2626',
                fontSize: '0.8rem',
                fontWeight: 600,
                lineHeight: 1.4,
              }}>
                {submitMetaStatus.message}
              </div>
            )}

            {/* Template Name & Category Inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                  Meta Template Name *
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="sobha_promo_broadcast_v1"
                  value={submitMetaName}
                  onChange={e => setSubmitMetaName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  disabled={submittingToMeta}
                  style={{ fontSize: '0.78rem', fontFamily: 'monospace' }}
                />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Only lowercase letters, numbers, and underscores</span>
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                  Category *
                </label>
                <select
                  className="input-field"
                  value={submitMetaCategory}
                  onChange={e => setSubmitMetaCategory(e.target.value)}
                  disabled={submittingToMeta}
                  style={{ fontSize: '0.78rem' }}
                >
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utility</option>
                </select>
              </div>
            </div>

            {/* Live Inspection / Meta Submission Payload Summary */}
            <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: '0.74rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
                Components being submitted to Meta:
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>• Header:</span>
                <strong>{uploadedMediaUrl || campaignFile ? 'Media (IMAGE Banner)' : 'Text ("Sobhainfra Tech")'}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>• Body Message:</span>
                <div style={{ marginTop: '0.25rem', padding: '0.45rem', background: 'var(--bg-tertiary)', borderRadius: 6, maxHeight: 85, overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                  {customText || '(No message entered)'}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>• Quick Reply Buttons ({Math.min(buttons.length, 3)} of max 3):</span>
                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                  {buttons.slice(0, 3).map((b, idx) => (
                    <span key={idx} style={{ padding: '0.15rem 0.45rem', borderRadius: 4, background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent-primary)', fontSize: '0.68rem', fontWeight: 600 }}>
                      🔘 {b.title || b.text || `Option ${idx + 1}`}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setShowSubmitMetaModal(false); setSubmitMetaStatus(null); }}
                disabled={submittingToMeta}
                style={{ fontSize: '0.78rem' }}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-whatsapp"
                onClick={handleSubmitToMeta}
                disabled={submittingToMeta || !submitMetaName.trim() || !customText.trim()}
                style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0.45rem 1.1rem', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: 'none' }}
              >
                <Sparkles size={14} className={submittingToMeta ? 'animate-spin' : ''} />
                <span>{submittingToMeta ? 'Submitting to Meta API...' : '🚀 Submit to Meta for Approval'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CampaignStudio;
