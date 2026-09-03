import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Send, Users, Filter, CheckCircle2, AlertTriangle, Shield, Clock,
  RefreshCw, Zap, MessageCircle, UploadCloud, Paperclip, CheckSquare,
  Square, Search, Plus, Sparkles, FileText, Image as ImageIcon,
  Smile, Phone, Layers, Settings, SlidersHorizontal, HelpCircle, ExternalLink
} from 'lucide-react';
import { estimateCampaignAudience, queueCampaign, processCampaignBatch, getLeads, getCustomerMaster, normalizePhone } from '../lib/db';
import { uploadToWhatsAppMedia, getWhatsAppMediaType } from '../lib/storage';
import { extractMainName } from '../lib/nameHelper';

const STANDARD_TEMPLATES = [
  { id: 1, tag: 'Catalog', name: 'Sobha Product Range & Catalog', text: 'Namaste {name}! 🙏\n\nWelcome to *Sobhainfra Tech Private Limited* ("Har Nirman Ki Jaan").\n\nWe manufacture advanced dry mix building materials:\n• Sobha Block Fix (Thin Joint Mortar)\n• Sobha Plast (Ready Mix Plaster - IS 16777)\n• Tile Adhesives (Type 1 to 4)\n• Super Fine Flyash & GGBS Cement\n\n📄 Official product catalog PDF is attached. Would you like a callback or quotation?' },
  { id: 2, tag: 'Mortar & Plaster', name: 'Dry Mix Solutions Campaign', text: 'Dear {name}, 🚀\n\nLooking for certified, high-bond dry mix solutions for your projects? Sobhainfra Tech offers direct factory supply with 20,000+ bags/day capacity from Gujarat. Let us know if you would like product samples or our latest rate chart.' },
  { id: 3, tag: 'Payment', name: 'Payment Reminder', text: 'Dear {name}, gentle reminder regarding your outstanding invoice for {product}. Please clear at the earliest. Thank you! 🙏' },
  { id: 4, tag: 'Follow-up', name: 'Customer Follow-up', text: 'Namaste {name}, following up on your inquiry for *{product}*. Please let us know if you would like our sales engineer to assist you with technical specifications or site delivery.' },
];

const PRESET_MESSAGES = [
  {
    name: 'Sobha Catalog & Product Range',
    text: 'Namaste {name}! 🙏\n\nWelcome to *Sobhainfra Tech Private Limited* ("Har Nirman Ki Jaan") — manufacturing high-performance dry mix construction materials since 2003.\n\n🏗️ *Our Core Product Range:*\n• Sobha Block Fix (Thin Joint Mortar)\n• Sobha Plast (Ready Mix Plaster - IS 16777)\n• Sobha Tile Adhesives (Type 1 CE to Type 4 HF)\n• Super Fine Flyash & GGBS Cement\n\n📄 Please find our official product catalog attached in PDF format. Feel free to reply for rates or to speak with our sales executive!',
  },
  {
    name: 'Special Offer / Bulk Quotation',
    text: 'Hello {name}! 👋\n\nWe have an exclusive factory-direct volume offer on our *{product}* valid this week! 🎁\n\nDirect supply from {company} with 20,000+ bags/day capacity from Gujarat.\n\nWould you like us to share our technical specs and quotation?',
  },
  {
    name: 'New Product Launch',
    text: 'Dear {name}, 🚀\n\nExciting news! {company} has introduced our all-new *{product}*.\n\nCheck out the attached technical guide and let us know if you would like a free sample or site demonstration!',
  },
  {
    name: 'Payment Follow-up',
    text: 'Dear {name},\n\nGentle reminder regarding your pending invoice for *{product}* amounting to *{budget}*. Kindly arrange payment at your earliest convenience. Thank you! 🙏',
  },
];

const EMOJIS = ['👋', '🚀', '🎁', '💰', '📞', '✨', '🏢', '📦', '🔥', '✅', '🙏', '😊'];

const getSmartDefaultName = () => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `Broadcast - ${dateStr}, ${timeStr}`;
};

const CampaignBuilderModal = ({ isOpen, onClose, onCampaignQueued, initialRecipients = null }) => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  
  // Targeting selection modes: 'sheet' | 'contacts' | 'filter' | 'paste'
  const [targetMode, setTargetMode] = useState(initialRecipients?.length ? 'contacts' : 'sheet');
  
  // 1. Filter state (Product based)
  const [filters, setFilters] = useState({ statusFilter: 'All', productFilter: 'All', minScore: 0 });
  const [estimation, setEstimation] = useState({ totalRaw: 0, targeted: 0, optedOut: 0, invalidPhone: 0, finalAudienceCount: 0, eligibleLeads: [] });
  const [estimating, setEstimating] = useState(false);

  // 2. Google Sheet Customer Master state
  const [customerMaster, setCustomerMaster] = useState([]);
  const [selectedSheetCustomerIds, setSelectedSheetCustomerIds] = useState(new Set());
  const [sheetCustomerSearch, setSheetCustomerSearch] = useState('');
  const [loadingSheetCustomers, setLoadingSheetCustomers] = useState(false);
  const sheetMasterCheckboxRef = useRef(null);
  const crmMasterCheckboxRef = useRef(null);

  // 3. CRM Contacts Multi-select state
  const [allCrmLeads, setAllCrmLeads] = useState([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState(new Set(initialRecipients ? initialRecipients.map(l => l.id) : []));
  const [contactSearch, setContactSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);

  // 4. Raw Paste / CSV state
  const [pastedNumbers, setPastedNumbers] = useState('');

  // 5. Custom Campaign Dynamic Variables & Fallbacks (Gear Icon)
  const [showVariablesPanel, setShowVariablesPanel] = useState(false);
  const [campaignVariables, setCampaignVariables] = useState({
    product: 'Sobha Block Fix & Tile Adhesive',
    budget: '₹1,50,000',
    company: 'Sobhainfra Tech Private Limited',
    phone: '+91 99990 00001',
    mode: 'fallback',
  });

  // Message compose mode: 'custom' | 'template'
  const [messageMode, setMessageMode] = useState('custom');
  const [customText, setCustomText] = useState(PRESET_MESSAGES[0].text);
  const [selectedTemplate, setSelectedTemplate] = useState(STANDARD_TEMPLATES[0]);

  // Campaign media attachment (image, pdf, video)
  const [campaignFile, setCampaignFile] = useState(null);
  const [campaignFilePreview, setCampaignFilePreview] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadedMediaUrl, setUploadedMediaUrl] = useState(null);
  const [uploadedMediaType, setUploadedMediaType] = useState(null);
  const campaignFileRef = useRef(null);
  const textareaRef = useRef(null);

  // Execution state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [batchResultDetails, setBatchResultDetails] = useState(null);

  // Load CRM leads and Customer Master on modal open & set default campaign name
  useEffect(() => {
    if (isOpen) {
      setName(getSmartDefaultName());
      loadCrmLeads();
      calculateAudience();
      setCampaignFile(null);
      setCampaignFilePreview(null);
      setUploadedMediaUrl(null);
      setUploadedMediaType(null);
      setBatchResultDetails(null);
      setBatchProgress(null);
      if (initialRecipients?.length) {
        setSelectedLeadIds(new Set(initialRecipients.map(l => l.id)));
        setTargetMode('contacts');
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && targetMode === 'filter') {
      calculateAudience();
    }
  }, [filters, targetMode, isOpen]);

  const loadCrmLeads = async () => {
    setLoadingContacts(true);
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

      // Pre-select all valid customer contact numbers from Google Sheet
      const valid = master.filter(c => (c.contact_number || '').replace(/\D/g, '').length >= 10);
      setSelectedSheetCustomerIds(new Set(valid.map(c => c.id)));
    } catch (err) {
      console.warn('[CampaignBuilderModal] load error:', err);
    } finally {
      setLoadingContacts(false);
      setLoadingSheetCustomers(false);
    }
  };

  const calculateAudience = async () => {
    setEstimating(true);
    const est = await estimateCampaignAudience(filters);
    setEstimation(est);
    setEstimating(false);
  };

  // Sheet Customers selection logic
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

  // Compute final effective audience list based on targetMode
  const getEffectiveRecipients = () => {
    if (targetMode === 'sheet') {
      return validSheetCustomers
        .filter(c => selectedSheetCustomerIds.has(c.id))
        .map(c => {
          const cleanName = extractMainName(c.contact_person, c.company_name) || c.contact_person || c.company_name || 'Customer';
          return {
            id: c.id,
            name: cleanName,
            full_name: c.contact_person || c.company_name,
            company_name: c.company_name || '',
            phone: normalizePhone(c.contact_number),
            contact_number: c.contact_number,
            property_interest: campaignVariables.product || 'Sobha Construction Solutions',
            budget: campaignVariables.budget || '₹1,50,000',
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
      // Split by comma, newline, semicolon, or spaces
      const rawTokens = pastedNumbers.split(/[\n,;\t]+/).map(s => s.trim()).filter(Boolean);
      const seen = new Set();
      const list = [];
      rawTokens.forEach((str, idx) => {
        const norm = normalizePhone(str);
        if (norm && norm.replace(/\D/g, '').length >= 10 && !seen.has(norm)) {
          seen.add(norm);
          list.push({
            id: `pasted-${idx}`,
            name: `Recipient ${list.length + 1}`,
            phone: norm,
            property_interest: campaignVariables.product || 'Products & Services',
            budget: campaignVariables.budget || '₹1,50,000',
            company_name: campaignVariables.company || 'Sobha Infratech Pvt. Ltd.',
          });
        }
      });

      // Fallback if space-separated on a single line
      if (list.length === 0 && pastedNumbers.trim()) {
        const spaceTokens = pastedNumbers.split(/\s+/).map(s => s.trim()).filter(Boolean);
        spaceTokens.forEach((str, idx) => {
          const norm = normalizePhone(str);
          if (norm && norm.replace(/\D/g, '').length >= 10 && !seen.has(norm)) {
            seen.add(norm);
            list.push({
              id: `pasted-space-${idx}`,
              name: `Recipient ${list.length + 1}`,
              phone: norm,
              property_interest: campaignVariables.product || 'Products & Services',
              budget: campaignVariables.budget || '₹1,50,000',
              company_name: campaignVariables.company || 'Sobha Infratech Pvt. Ltd.',
            });
          }
        });
      }

      return list;
    }

    return [];
  };

  const effectiveRecipients = getEffectiveRecipients();
  const effectiveCount = effectiveRecipients.length;
  const SENDER_NUMBER_DIGITS = '8850881761';
  const hasSenderNumber = effectiveRecipients.some(r => r.phone && r.phone.replace(/\D/g, '').endsWith(SENDER_NUMBER_DIGITS));

  // Insert variable tag into custom message textarea
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

  // Handle media file select
  const handleCampaignFileSelect = useCallback((file) => {
    if (!file) return;
    setCampaignFile(file);
    setUploadedMediaUrl(null);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => setCampaignFilePreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setCampaignFilePreview(null);
    }
  }, []);

  const handleCampaignDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleCampaignFileSelect(file);
  }, [handleCampaignFileSelect]);

  // Apply Quick Variable Preset
  const applyVariablePreset = (preset) => {
    if (preset === 'discount') {
      setCampaignVariables(p => ({ ...p, product: 'Premium Adhesive & Chemical Grout', budget: '₹49,999 Special Offer' }));
    } else if (preset === 'launch') {
      setCampaignVariables(p => ({ ...p, product: '2026 High-Strength Polymer Mortar', budget: '₹1,25,000 Intro Price' }));
    } else if (preset === 'wholesale') {
      setCampaignVariables(p => ({ ...p, product: 'Bulk Construction Supply Pack', budget: '₹2,50,000 Wholesale Quote' }));
    } else if (preset === 'payment') {
      setCampaignVariables(p => ({ ...p, product: 'Pending Invoice Clearance', budget: 'Outstanding Balance' }));
    }
  };

  // Launch Campaign
  const handleLaunchCampaign = async (e) => {
    if (e) e.preventDefault();
    if (effectiveCount === 0) return;

    const campaignName = name.trim() || getSmartDefaultName();

    setIsSubmitting(true);
    setBatchProgress({ sent: 0, total: effectiveCount, status: 'Preparing campaign batch...' });

    try {
      // Upload campaign media if attached
      let mediaUrl = uploadedMediaUrl;
      let mediaType = uploadedMediaType;
      if (campaignFile && !mediaUrl) {
        setUploadingMedia(true);
        setBatchProgress({ sent: 0, total: effectiveCount, status: 'Uploading campaign media attachment...' });
        try {
          mediaUrl = await uploadToWhatsAppMedia(campaignFile, 'campaigns');
          mediaType = getWhatsAppMediaType(campaignFile);
          setUploadedMediaUrl(mediaUrl);
          setUploadedMediaType(mediaType);
        } catch (err) {
          console.warn('[Campaign] Storage upload fallback:', err.message);
          if (campaignFilePreview) {
            mediaUrl = campaignFilePreview;
            mediaType = 'image';
          }
        }
        setUploadingMedia(false);
      }

      const messageText = messageMode === 'custom' ? customText : selectedTemplate.text;

      // Queue Campaign in DB with dynamic variables
      setBatchProgress({ sent: 0, total: effectiveCount, status: 'Queueing broadcast batch in database...' });
      
      const targetPayload = targetMode === 'filter'
        ? { filters, campaignDefaults: campaignVariables }
        : { customRecipients: effectiveRecipients, campaignDefaults: campaignVariables };

      const { data: cData } = await queueCampaign({
        name: campaignName,
        template_name: messageMode === 'custom' ? 'Custom Broadcast' : selectedTemplate.name,
        custom_message: messageText,
        media_url: mediaUrl || null,
        media_type: mediaType || null,
        campaignDefaults: campaignVariables,
      }, targetPayload);

      setBatchProgress({ sent: 0, total: effectiveCount, status: 'Dispatching messages via Meta WhatsApp Cloud API...' });

      // Trigger Batch Worker with customized parameters
      const batchRes = await processCampaignBatch(cData?.id || Date.now(), 50, {
        customMessage: messageText,
        templateText: messageText,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        campaignDefaults: campaignVariables,
        recipients: effectiveRecipients,
      });

      const actualSent = batchRes?.batchResults?.sent ?? effectiveCount;
      const actualFailed = batchRes?.batchResults?.failed ?? 0;
      const errors = batchRes?.batchResults?.errors || [];

      setBatchResultDetails({
        campaignName,
        total: effectiveCount,
        sent: actualSent,
        failed: actualFailed,
        errors,
        recipients: effectiveRecipients.map(r => {
          const matchedErr = errors.find(e => e.phone === r.phone || e.phone === r.phone?.replace('+', ''));
          return {
            name: r.name,
            phone: r.phone,
            status: matchedErr ? 'failed' : 'delivered',
            error: matchedErr ? matchedErr.error : null,
          };
        }),
      });

      if (onCampaignQueued) onCampaignQueued();
    } catch (err) {
      console.error('[Launch Campaign] Error:', err);
      setBatchResultDetails({
        campaignName,
        total: effectiveCount,
        sent: 0,
        failed: effectiveCount,
        errors: [{ phone: 'All', error: err.message || 'Dispatch error' }],
        recipients: effectiveRecipients.map(r => ({ name: r.name, phone: r.phone, status: 'failed', error: err.message })),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Contacts Checklist filtering
  const filteredContacts = allCrmLeads.filter(l => {
    if (!contactSearch.trim()) return true;
    const q = contactSearch.toLowerCase();
    return (l.name || '').toLowerCase().includes(q) ||
           (l.phone || '').includes(q) ||
           (l.status || '').toLowerCase().includes(q);
  });

  const allFilteredCrmSelected = filteredContacts.length > 0 &&
    filteredContacts.every(l => selectedLeadIds.has(l.id));
  const someFilteredCrmSelected = filteredContacts.some(l => selectedLeadIds.has(l.id));

  useEffect(() => {
    if (crmMasterCheckboxRef.current) {
      crmMasterCheckboxRef.current.indeterminate = !allFilteredCrmSelected && someFilteredCrmSelected;
    }
  }, [allFilteredCrmSelected, someFilteredCrmSelected]);

  const toggleSelectAllContacts = () => {
    const next = new Set(selectedLeadIds);
    if (allFilteredCrmSelected) {
      filteredContacts.forEach(l => next.delete(l.id));
    } else {
      filteredContacts.forEach(l => next.add(l.id));
    }
    setSelectedLeadIds(next);
  };

  const toggleLeadSelect = (id) => {
    const next = new Set(selectedLeadIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLeadIds(next);
  };

  // Compute live sample preview message using dynamic custom variables & recipient
  const isOverride = campaignVariables.mode === 'override';
  const sampleLead = effectiveRecipients[0] || {};
  
  const displayProduct = isOverride 
    ? campaignVariables.product 
    : (sampleLead.property_interest || sampleLead.product || campaignVariables.product || 'Products & Services');
    
  const displayBudget = isOverride 
    ? campaignVariables.budget 
    : (sampleLead.budget || campaignVariables.budget || '₹1,50,000');
    
  const displayCompany = isOverride 
    ? campaignVariables.company 
    : (sampleLead.company_name || campaignVariables.company || 'ERPPro Solutions Pvt. Ltd.');
    
  const displayPhone = sampleLead.phone || campaignVariables.phone || '+91 98765 43210';
  const displayName = sampleLead.name || 'Rahul Sharma';

  const sampleText = (messageMode === 'custom' ? customText : selectedTemplate.text)
    .replace(/{name}/g, displayName)
    .replace(/{product}/g, displayProduct)
    .replace(/{budget}/g, displayBudget)
    .replace(/{amount}/g, displayBudget)
    .replace(/{company}/g, displayCompany)
    .replace(/{phone}/g, displayPhone);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content modal-lg animate-fade-in" style={{ maxWidth: 980, maxHeight: '92vh', overflowY: 'auto' }}>
        <button
          className="modal-close-btn"
          onClick={onClose}
          title="Close Modal (Esc)"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ marginBottom: '1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageCircle size={22} color="var(--whatsapp)" /> WhatsApp Campaign & Broadcast Engine
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
              Send custom messages with media attachments, multi-channel targeting, and custom product/budget variable personalizations.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { onClose(); navigate('/campaign-studio'); }}
              style={{
                fontSize: '0.75rem',
                padding: '0.35rem 0.65rem',
                gap: '0.35rem',
                color: 'var(--accent-primary)',
                borderColor: 'var(--accent-primary)',
              }}
              title="Open Spacious Full-Page Campaign Studio"
            >
              <ExternalLink size={13} />
              <span>Full Studio ↗</span>
            </button>

            {/* Top Gear / Variables Settings Button */}
            <button
              type="button"
              className="btn"
              onClick={() => setShowVariablesPanel(p => !p)}
              style={{
                fontSize: '0.75rem',
                padding: '0.35rem 0.75rem',
                background: showVariablesPanel ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: showVariablesPanel ? 'white' : 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                borderRadius: 6,
                fontWeight: 600,
                boxShadow: showVariablesPanel ? '0 0 12px rgba(99,102,241,0.35)' : 'none',
                transition: 'all 0.2s',
              }}
              title="Configure custom Product, Budget, Company and dynamic variable defaults"
            >
              <Settings size={14} className={showVariablesPanel ? 'animate-spin' : ''} style={{ animationDuration: '6s' }} />
              <span>Variables ⚙️</span>
            </button>
          </div>
        </div>

        {/* =========================================================================
            CUSTOM VARIABLES & DEFAULTS DRAWER / PANEL (GEAR ICON)
           ========================================================================= */}
        {showVariablesPanel && (
          <div className="glass-card animate-fade-in" style={{
            padding: '1rem 1.1rem',
            marginBottom: '1.25rem',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.04) 100%)',
            border: '1.5px solid var(--accent-primary)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <SlidersHorizontal size={16} color="var(--accent-primary)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Dynamic Variable Customization & Fallbacks
                </span>
                <span className="badge badge-accent" style={{ fontSize: '0.65rem' }}>Live in Preview & Dispatch</span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Application Strategy:</span>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setCampaignVariables(p => ({ ...p, mode: 'fallback' }))}
                    style={{
                      fontSize: '0.68rem',
                      padding: '0.2rem 0.55rem',
                      border: 'none',
                      cursor: 'pointer',
                      background: campaignVariables.mode === 'fallback' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: campaignVariables.mode === 'fallback' ? 'white' : 'var(--text-secondary)',
                      fontWeight: 600,
                    }}
                  >
                    Smart Fallback
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampaignVariables(p => ({ ...p, mode: 'override' }))}
                    style={{
                      fontSize: '0.68rem',
                      padding: '0.2rem 0.55rem',
                      border: 'none',
                      cursor: 'pointer',
                      background: campaignVariables.mode === 'override' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: campaignVariables.mode === 'override' ? 'white' : 'var(--text-secondary)',
                      fontWeight: 600,
                    }}
                  >
                    Override All
                  </button>
                </div>
              </div>
            </div>

            {/* Form Inputs Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.65rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem', color: 'var(--text-secondary)' }}>
                  Custom Product / Offering *
                </label>
                <input
                  type="text"
                  className="input-field"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
                  placeholder="e.g. Tile Adhesive & Grout"
                  value={campaignVariables.product}
                  onChange={e => setCampaignVariables(p => ({ ...p, product: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem', color: 'var(--text-secondary)' }}>
                  Custom Budget / Offer Price
                </label>
                <input
                  type="text"
                  className="input-field"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
                  placeholder="e.g. ₹1,50,000 / ₹49,999"
                  value={campaignVariables.budget}
                  onChange={e => setCampaignVariables(p => ({ ...p, budget: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem', color: 'var(--text-secondary)' }}>
                  Company / Brand Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
                  placeholder="e.g. ERPPro Solutions Pvt. Ltd."
                  value={campaignVariables.company}
                  onChange={e => setCampaignVariables(p => ({ ...p, company: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem', color: 'var(--text-secondary)' }}>
                  Sender / Support Phone
                </label>
                <input
                  type="text"
                  className="input-field"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
                  placeholder="e.g. +91 99990 00001"
                  value={campaignVariables.phone}
                  onChange={e => setCampaignVariables(p => ({ ...p, phone: e.target.value }))}
                />
              </div>
            </div>

            {/* Quick Fill Preset Buttons & Helper Notice */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Quick Fill Presets:</span>
                <button
                  type="button"
                  onClick={() => applyVariablePreset('discount')}
                  style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  🎁 Special Discount
                </button>
                <button
                  type="button"
                  onClick={() => applyVariablePreset('launch')}
                  style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  🚀 Product Launch
                </button>
                <button
                  type="button"
                  onClick={() => applyVariablePreset('wholesale')}
                  style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  💼 B2B Wholesale
                </button>
                <button
                  type="button"
                  onClick={() => applyVariablePreset('payment')}
                  style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  🔔 Payment Reminder
                </button>
              </div>

              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                {campaignVariables.mode === 'override' 
                  ? '⚡ Override mode: Custom values are forced for all recipients in this broadcast.'
                  : '⚡ Fallback mode: Custom values will be used whenever a recipient lacks specific product/budget details.'}
              </div>
            </div>
          </div>
        )}

        {isSubmitting ? (
          <div style={{ textAlign: 'center', padding: '4rem 1.5rem', background: 'var(--bg-secondary)', borderRadius: 12 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', border: '4px solid rgba(37, 211, 102, 0.2)',
              borderTopColor: 'var(--whatsapp, #25d366)', animation: 'spin 0.8s linear infinite', margin: '0 auto 1.25rem auto'
            }} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
              Dispatching WhatsApp Broadcast...
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 460, margin: '0 auto' }}>
              {batchProgress?.status || 'Connecting to Meta WhatsApp Cloud API...'}
            </p>
          </div>
        ) : batchResultDetails ? (
          <div style={{ padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: batchResultDetails.failed === 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: batchResultDetails.failed === 0 ? '#10b981' : '#f59e0b', fontSize: '1.5rem'
              }}>
                {batchResultDetails.failed === 0 ? '🎉' : '⚠️'}
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                  {batchResultDetails.failed === 0 ? 'Broadcast Dispatched Successfully!' : 'Broadcast Completed with Notes'}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                  Campaign: <strong>{batchResultDetails.campaignName}</strong>
                </p>
              </div>
            </div>

            {/* Stat Badges */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Targeted Contacts</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{batchResultDetails.total}</div>
              </div>
              <div style={{ padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8, textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <div style={{ fontSize: '0.72rem', color: '#10b981' }}>Delivered to Meta</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{batchResultDetails.sent}</div>
              </div>
              <div style={{ padding: '0.75rem', background: batchResultDetails.failed > 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-tertiary)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: batchResultDetails.failed > 0 ? '#ef4444' : 'var(--text-muted)' }}>Delivery Notes / Failures</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: batchResultDetails.failed > 0 ? '#ef4444' : 'inherit' }}>{batchResultDetails.failed}</div>
              </div>
            </div>

            {/* Recipient Details Table */}
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem' }}>Recipient Delivery Breakdown:</div>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                <table className="data-table" style={{ margin: 0, fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th>Recipient</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchResultDetails.recipients.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td style={{ fontFamily: 'monospace' }}>{r.phone}</td>
                        <td>
                          <span className={`badge ${r.status === 'delivered' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem' }}>
                            {r.status === 'delivered' ? '✓ Delivered' : '✕ Rejected'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.72rem', color: r.status === 'delivered' ? 'var(--text-muted)' : 'var(--danger)' }}>
                          {r.status === 'delivered'
                            ? 'Accepted by Meta WhatsApp Cloud API'
                            : (r.phone && r.phone.replace(/\D/g, '').endsWith('8850881761')
                                ? 'Cannot message own business number (+91 88508 81761)'
                                : (r.error || 'Meta API error'))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setBatchResultDetails(null);
                  setBatchProgress(null);
                }}
              >
                🚀 Launch Another Broadcast
              </button>
              <button
                type="button"
                className="btn btn-whatsapp"
                onClick={onClose}
              >
                ✓ Done & View History
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLaunchCampaign} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            
            {/* =========================================================================
                LEFT COLUMN: CAMPAIGN NAME & TARGET AUDIENCE SELECTION
               ========================================================================= */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                  Campaign Name *
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Diwali Product Launch 2026"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>

              {/* AUDIENCE SELECTION TABS */}
              <div className="glass-card p-6" style={{ padding: '0.9rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Users size={15} color="var(--accent-primary)" /> Select Target Contacts
                  </span>
                  <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
                    {effectiveCount} Eligible
                  </span>
                </div>

                {/* Target Mode Buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem', marginBottom: '0.85rem' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setTargetMode('sheet')}
                    style={{
                      fontSize: '0.7rem', padding: '0.35rem 0.3rem',
                      background: targetMode === 'sheet' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                      color: targetMode === 'sheet' ? 'white' : 'var(--text-secondary)',
                      fontWeight: targetMode === 'sheet' ? 700 : 500,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem'
                    }}
                    title="Verified Customer Contact Numbers from live Google Sheet"
                  >
                    <Users size={12} /> Sheet ({validSheetCustomers.length})
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setTargetMode('contacts')}
                    style={{
                      fontSize: '0.7rem', padding: '0.35rem 0.3rem',
                      background: targetMode === 'contacts' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                      color: targetMode === 'contacts' ? 'white' : 'var(--text-secondary)',
                      fontWeight: targetMode === 'contacts' ? 700 : 500,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem'
                    }}
                  >
                    <CheckSquare size={12} /> CRM Contacts
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setTargetMode('filter')}
                    style={{
                      fontSize: '0.7rem', padding: '0.35rem 0.3rem',
                      background: targetMode === 'filter' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                      color: targetMode === 'filter' ? 'white' : 'var(--text-secondary)',
                      fontWeight: targetMode === 'filter' ? 700 : 500,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem'
                    }}
                  >
                    <Filter size={12} /> Dynamic
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setTargetMode('paste')}
                    style={{
                      fontSize: '0.7rem', padding: '0.35rem 0.3rem',
                      background: targetMode === 'paste' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                      color: targetMode === 'paste' ? 'white' : 'var(--text-secondary)',
                      fontWeight: targetMode === 'paste' ? 700 : 500,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem'
                    }}
                  >
                    <FileText size={12} /> Paste
                  </button>
                </div>

                {/* MODE 0: GOOGLE SHEET CUSTOMER MASTER CONTACTS */}
                {targetMode === 'sheet' && (
                  <div>
                    <div style={{ position: 'relative', marginBottom: '0.45rem' }}>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Search customer, company or phone..."
                        style={{ fontSize: '0.75rem', padding: '0.32rem 0.5rem 0.32rem 1.8rem' }}
                        value={sheetCustomerSearch}
                        onChange={e => setSheetCustomerSearch(e.target.value)}
                      />
                      <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
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
                      padding: '0.4rem 0.6rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: 6,
                      marginBottom: '0.5rem',
                      border: '1px solid var(--border-color)',
                    }}>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: '0.45rem',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          <strong style={{ color: 'var(--accent-primary)' }}>{selectedSheetCustomerIds.size}</strong> of {validSheetCustomers.length} selected
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}
                          onClick={toggleSelectAllSheetCustomers}
                        >
                          {allFilteredSheetSelected ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                    </div>

                    {/* Scrollable Customer List with Individual Checkboxes (Freedom to Deselect) */}
                    <div style={{ maxHeight: 185, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                      {loadingSheetCustomers ? (
                        <div style={{ textAlign: 'center', padding: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <RefreshCw size={14} className="animate-spin" /> Loading customer directory...
                        </div>
                      ) : filteredSheetCustomers.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
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
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.38rem 0.55rem',
                                borderBottom: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent',
                                fontSize: '0.75rem',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--accent-primary)' }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {cleanName || cust.contact_person || 'Customer'}
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
                                <span className="badge badge-neutral" style={{ fontSize: '0.6rem', padding: '0.08rem 0.35rem' }}>
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

                {/* MODE 1: DYNAMIC FILTER */}
                {targetMode === 'filter' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Lead Stage</label>
                        <select
                          className="input-field"
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                          value={filters.statusFilter}
                          onChange={e => setFilters(p => ({ ...p, statusFilter: e.target.value }))}
                        >
                          <option value="All">All Lead Stages</option>
                          <option value="Hot">Hot Leads Only</option>
                          <option value="Warm">Warm Leads Only</option>
                          <option value="New">New Inquiries</option>
                          <option value="Cold">Cold Leads</option>
                          <option value="Converted">Converted Clients</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Min. AI Lead Score</label>
                        <select
                          className="input-field"
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                          value={filters.minScore}
                          onChange={e => setFilters(p => ({ ...p, minScore: Number(e.target.value) }))}
                        >
                          <option value={0}>Any Score (0+)</option>
                          <option value={50}>Qualified (50+)</option>
                          <option value={80}>High Intent (80+)</option>
                        </select>
                      </div>
                    </div>

                    {/* Breakdown */}
                    <div style={{ background: 'var(--bg-tertiary)', padding: '0.6rem', borderRadius: 6, fontSize: '0.72rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-muted">Total Filter Matches:</span>
                        <strong>{estimation.targeted}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
                        <span>- Opted-Out Contacts:</span>
                        <strong>-{estimation.optedOut}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--warning)' }}>
                        <span>- Missing / Invalid Phone:</span>
                        <strong>-{estimation.invalidPhone}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODE 2: CRM CONTACTS CHECKLIST */}
                {targetMode === 'contacts' && (
                  <div>
                    <div style={{ position: 'relative', marginBottom: '0.45rem' }}>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Search CRM lead name or phone..."
                        style={{ fontSize: '0.75rem', padding: '0.32rem 0.5rem 0.32rem 1.8rem' }}
                        value={contactSearch}
                        onChange={e => setContactSearch(e.target.value)}
                      />
                      <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                    </div>

                    {/* Master Checkbox Button Bar for CRM Contacts */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.4rem 0.6rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: 6,
                      marginBottom: '0.5rem',
                      border: '1px solid var(--border-color)',
                    }}>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: '0.45rem',
                        cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', userSelect: 'none'
                      }}>
                        <input
                          type="checkbox"
                          ref={crmMasterCheckboxRef}
                          checked={allFilteredCrmSelected}
                          onChange={toggleSelectAllContacts}
                          style={{ cursor: 'pointer', width: 15, height: 15, accentColor: 'var(--accent-primary)' }}
                        />
                        <span>Select All CRM Contacts ({filteredContacts.length})</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          <strong style={{ color: 'var(--accent-primary)' }}>{selectedLeadIds.size}</strong> of {allCrmLeads.length} selected
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}
                          onClick={toggleSelectAllContacts}
                        >
                          {allFilteredCrmSelected ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                    </div>

                    <div style={{ maxHeight: 185, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                      {loadingContacts ? (
                        <div style={{ textAlign: 'center', padding: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <RefreshCw size={14} className="animate-spin" /> Loading contacts...
                        </div>
                      ) : filteredContacts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          No matching contacts found.
                        </div>
                      ) : (
                        filteredContacts.map(l => {
                          const isSelected = selectedLeadIds.has(l.id);
                          return (
                            <div
                              key={l.id}
                              onClick={() => toggleLeadSelect(l.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.38rem 0.55rem',
                                borderBottom: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent',
                                fontSize: '0.75rem',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--accent-primary)' }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{l.phone}</div>
                              </div>
                              <span className={`badge ${l.status === 'Hot' ? 'badge-danger' : l.status === 'Warm' ? 'badge-warning' : 'badge-neutral'}`} style={{ fontSize: '0.65rem' }}>
                                {l.status}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* MODE 3: PASTE NUMBERS (+91 IS FULLY OPTIONAL) */}
                {targetMode === 'paste' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        Enter Mobile Numbers (Comma / Newline Separated):
                      </label>
                      <span className="badge badge-accent" style={{ fontSize: '0.62rem' }}>
                        +91 is Optional
                      </span>
                    </div>
                    <textarea
                      className="input-field"
                      rows={4}
                      placeholder={`9876543210, 9812345678\n+919765432109\n09898989898`}
                      value={pastedNumbers}
                      onChange={e => setPastedNumbers(e.target.value)}
                      style={{ fontSize: '0.75rem', fontFamily: 'monospace', lineHeight: 1.4 }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.35rem' }}>
                      <div style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: effectiveCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                        <CheckCircle2 size={13} color={effectiveCount > 0 ? 'var(--success)' : 'var(--text-muted)'} />
                        <span><strong>{effectiveCount > 0 ? `✅ Detected ${effectiveCount} valid recipient number${effectiveCount > 1 ? 's' : ''}` : '+91 is optional. Enter 10-digit mobile numbers.'}</strong></span>
                      </div>

                      {hasSenderNumber && (
                        <div style={{
                          padding: '0.4rem 0.6rem', background: 'rgba(245, 158, 11, 0.15)',
                          border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 6,
                          fontSize: '0.72rem', color: '#f59e0b', display: 'flex', alignItems: 'flex-start', gap: '0.35rem'
                        }}>
                          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                          <span>
                            <strong>Note:</strong> <code>+91 88508 81761</code> is your own WhatsApp Business Sender number. Meta does not allow a business to message itself. Please enter a different personal mobile number to test delivery.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* MEDIA ATTACHMENT SECTION */}
              <div className="glass-card p-6" style={{ padding: '0.9rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <ImageIcon size={15} color="var(--accent-primary)" /> Attach Campaign Media (Image / Brochure)
                </label>

                {campaignFile ? (
                  <div style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {campaignFilePreview ? (
                      <img src={campaignFilePreview} alt="preview" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 6, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                        📄
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {campaignFile.name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {(campaignFile.size / 1024).toFixed(0)} KB · Sent with caption to each lead
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCampaignFile(null); setCampaignFilePreview(null); setUploadedMediaUrl(null); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', padding: '0.2rem' }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div
                    onDrop={handleCampaignDrop}
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onClick={() => campaignFileRef.current?.click()}
                    style={{
                      border: `1.5px dashed ${isDragOver ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      borderRadius: 8, padding: '0.85rem',
                      textAlign: 'center', cursor: 'pointer',
                      background: isDragOver ? 'rgba(99,102,241,0.06)' : 'var(--bg-tertiary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <UploadCloud size={20} color="var(--accent-primary)" style={{ opacity: 0.6, marginBottom: 4 }} />
                    <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>Click or drag image (JPG/PNG) or PDF brochure</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>Max 15 MB · WhatsApp media compliance</div>
                  </div>
                )}
                <input
                  ref={campaignFileRef}
                  type="file"
                  accept="image/*,.pdf,.mp4"
                  style={{ display: 'none' }}
                  onChange={e => handleCampaignFileSelect(e.target.files[0])}
                />
              </div>

            </div>

            {/* =========================================================================
                RIGHT COLUMN: MESSAGE COMPOSER & WHATSAPP LIVE PREVIEW
               ========================================================================= */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Message Mode Switcher */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setMessageMode('custom')}
                    style={{
                      borderRadius: 0,
                      background: messageMode === 'custom' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: messageMode === 'custom' ? 'white' : 'var(--text-secondary)',
                      fontSize: '0.75rem', padding: '0.35rem 0.75rem',
                    }}
                  >
                    <Sparkles size={13} /> Custom Message
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setMessageMode('template')}
                    style={{
                      borderRadius: 0,
                      background: messageMode === 'template' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: messageMode === 'template' ? 'white' : 'var(--text-secondary)',
                      fontSize: '0.75rem', padding: '0.35rem 0.75rem',
                    }}
                  >
                    <FileText size={13} /> Meta Templates
                  </button>
                </div>
                
                {messageMode === 'custom' && (
                  <select
                    className="input-field"
                    style={{ fontSize: '0.72rem', padding: '0.3rem 0.5rem', width: 'auto', maxWidth: 170 }}
                    onChange={e => {
                      const preset = PRESET_MESSAGES.find(p => p.name === e.target.value);
                      if (preset) setCustomText(preset.text);
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>Load Preset Copy...</option>
                    {PRESET_MESSAGES.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* CUSTOM MESSAGE EDITOR */}
              {messageMode === 'custom' ? (
                <div>
                  {/* Dynamic Variable Chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.45rem' }}>
                    {[
                      { tag: '{name}', label: '+ Name' },
                      { tag: '{product}', label: '+ Product' },
                      { tag: '{budget}', label: '+ Budget' },
                      { tag: '{company}', label: '+ Company' },
                      { tag: '{phone}', label: '+ Phone' },
                    ].map(v => (
                      <button
                        key={v.tag}
                        type="button"
                        onClick={() => insertVariable(v.tag)}
                        style={{
                          fontSize: '0.68rem',
                          background: 'rgba(99,102,241,0.12)',
                          color: 'var(--accent-primary)',
                          border: '1px solid rgba(99,102,241,0.3)',
                          borderRadius: 4,
                          padding: '0.2rem 0.45rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>

                  {/* Textarea */}
                  <textarea
                    ref={textareaRef}
                    className="input-field"
                    rows={5}
                    placeholder="Write your custom WhatsApp message here... (Use {name}, {product}, {budget} tags)"
                    value={customText}
                    onChange={e => setCustomText(e.target.value)}
                    style={{ fontSize: '0.8rem', lineHeight: 1.4, resize: 'vertical' }}
                    required
                  />

                  {/* Emoji Quick Picker */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.35rem' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Emojis:</span>
                    {EMOJIS.map(em => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => insertVariable(em)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0.1rem' }}
                      >
                        {em}
                      </button>
                    ))}
                    <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {customText.length} chars
                    </span>
                  </div>
                </div>
              ) : (
                /* META APPROVED TEMPLATE SELECTOR */
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                    Select Approved Meta Template
                  </label>
                  <select
                    className="input-field"
                    value={selectedTemplate.id}
                    onChange={e => setSelectedTemplate(STANDARD_TEMPLATES.find(t => t.id === Number(e.target.value)))}
                  >
                    {STANDARD_TEMPLATES.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.tag})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* WHATSAPP REAL LIVE CHAT PREVIEW */}
              <div className="glass-card p-6" style={{ padding: '0.85rem', background: '#e5ddd5', borderRadius: 10, border: '1px solid #d1d7db' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#075e54', marginBottom: '0.4rem', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>📱 Live WhatsApp Preview</span>
                  <span style={{ color: '#54656f', fontWeight: 500, fontSize: '0.68rem' }}>
                    Recipient: {displayName}
                  </span>
                </div>

                {/* Chat Bubble Container */}
                <div style={{
                  background: '#ffffff',
                  borderRadius: '8px 8px 8px 0',
                  boxShadow: '0 1px 1.5px rgba(0,0,0,0.13)',
                  overflow: 'hidden',
                  maxWidth: '92%',
                  color: '#111b21',
                }}>
                  {/* Image Attachment in Bubble */}
                  {campaignFilePreview && (
                    <div style={{ position: 'relative', width: '100%', maxHeight: 160, overflow: 'hidden', background: '#f0f2f5' }}>
                      <img
                        src={campaignFilePreview}
                        alt="Campaign media"
                        style={{ width: '100%', height: 160, objectFit: 'cover' }}
                      />
                    </div>
                  )}

                  {/* Document / PDF Attachment in Bubble */}
                  {campaignFile && !campaignFilePreview && (
                    <div style={{ padding: '0.6rem 0.75rem', background: '#f0f2f5', borderBottom: '1px solid #e9edef', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ fontSize: '1.4rem' }}>📄</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {campaignFile.name}
                      </div>
                    </div>
                  )}

                  {/* Caption & Message Body */}
                  <div style={{ padding: '0.65rem 0.75rem', fontSize: '0.8rem', lineHeight: 1.45, whiteSpace: 'pre-wrap', color: '#111b21' }}>
                    {sampleText}
                    <div style={{ textAlign: 'right', fontSize: '0.65rem', color: '#667781', marginTop: '0.3rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3 }}>
                      11:45 AM <span style={{ color: '#53bdeb' }}>✓✓</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-whatsapp"
                  disabled={isSubmitting || effectiveCount === 0}
                  style={{
                    cursor: (isSubmitting || effectiveCount === 0) ? 'not-allowed' : 'pointer',
                    opacity: (isSubmitting || effectiveCount === 0) ? 0.6 : 1,
                  }}
                >
                  <Send size={15} /> {isSubmitting ? 'Queueing Broadcast...' : `Launch to ${effectiveCount} Contacts`}
                </button>
              </div>

            </div>

          </form>
        )}

      </div>
    </div>
  );
};

export default CampaignBuilderModal;
