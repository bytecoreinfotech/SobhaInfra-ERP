import React, { useState, useEffect, useRef } from 'react';
import {
  Settings as SettingsIcon, Bell, Shield, Palette, MessageCircle,
  RefreshCw, Save, Check, Zap, Download, AlertTriangle, Activity,
  Server, Cpu, Database, Radio, ToggleLeft, ToggleRight, FileSpreadsheet, FileJson,
  Brain, Plus, Trash2, Edit3, BookOpen, CheckCircle2, Share2, Send, Copy, Sparkles,
  HardDrive, AlertOctagon, ShieldAlert, HelpCircle, Layers, CheckSquare,
  Building2, PlusCircle, Globe, ShieldCheck, Upload, Star, QrCode, Mail, Eye, EyeOff
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import {
  getSystemSafetyAndQuotas, updateSystemSafety, toggleCircuitBreaker, exportAllData,
  getRoles, createRole, updateRole, deleteRole, getPermissionMatrix, savePermissionMatrix, getTeamMembers,
  createLead, normalizePhone, getOrgSettings, updateOrgSetting,
  getStorageUsageSummary, purgeStorageCategory, purgeAllExpiredStorage, runAutoStorageCleanupIfDue,
  sendDirectEmail,
  getCustomerSheetUrl, saveCustomerSheetUrl, triggerSheetSync, getSheetSyncLog
} from '../lib/db';
import './Pages.css';

const KB_CATEGORIES = ['Products', 'Pricing', 'Policy', 'FAQ', 'Operations', 'Contact', 'Payment Terms'];
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

const Settings = () => {
  const { theme, toggleTheme } = useTheme();
  const { companyProfiles, activeCompanyId, setActiveCompanyId, saveCompany, deleteCompany, refreshCompanies } = useCompany();
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [safety, setSafety] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Email & Gmail SMTP State
  const [emailConfig, setEmailConfig] = useState({
    gmail_user: localStorage.getItem('erppro_gmail_user') || '',
    gmail_app_password: localStorage.getItem('erppro_gmail_app_password') || '',
    sender_name: localStorage.getItem('erppro_email_sender_name') || 'Sobha Infratech Pvt. Ltd.',
    smtp_host: 'smtp.gmail.com',
    smtp_port: '465',
  });
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState(null);
  const [emailConfigSaved, setEmailConfigSaved] = useState(false);

  // Multi-Company Profile Modal State
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState({
    id: '',
    company_name: '',
    alias_names: '',
    company_logo_url: '',
    company_address: '',
    gstin_number: '',
    company_udyam_reg: '',
    admin_email: '',
    contact_phone: '',
    bank_name: '',
    bank_account_no: '',
    bank_ifsc: '',
    upi_id: '',
    state_name: 'Gujarat',
    state_code: '24',
    jurisdiction: 'VALSAD / THANE',
    invoice_footer_notes: 'Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days. Goods Once Sold Will Not Be Taken Back.',
    is_default: false,
  });
  const [companyModalSaving, setCompanyModalSaving] = useState(false);
  const companyModalLogoRef = useRef(null);
  const companyModalQrRef = useRef(null);

  // Meta Leads Simulator state
  const [simLead, setSimLead] = useState({
    name: 'Rohit Kulkarni',
    phone: '9822334455',
    email: 'rohit.k@gmail.com',
    product: 'Tile Adhesive & Waterproofing Chemical',
    budget: '₹85,000',
    source: 'Facebook',
    notes: 'Captured via Meta Lead Ad Form: Monsoon Promo 2026',
  });
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // AI Knowledge Base state
  const [kbItems, setKbItems] = useState([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbSaving, setKbSaving] = useState(false);
  const [editingKb, setEditingKb] = useState(null); // null | 'new' | item
  const { user, canPerformAction } = useAuth();
  const [kbSuccess, setKbSuccess] = useState('');

  // Roles & Positions tab state (Super Admin)
  const [rolesList, setRolesList] = useState([]);
  const [teamMembersList, setTeamMembersList] = useState([]);
  const [settingsMatrix, setSettingsMatrix] = useState({});
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [showAddPositionModal, setShowAddPositionModal] = useState(false);
  const [newPositionForm, setNewPositionForm] = useState({ name: '', description: '', color: '#6366f1' });
  const [editingPosition, setEditingPosition] = useState(null);
  const [editPositionForm, setEditPositionForm] = useState({ name: '', description: '', color: '#6366f1' });
  const [confirmDisableRole, setConfirmDisableRole] = useState(null);
  const [posSuccessMsg, setPosSuccessMsg] = useState('');
  const [posLoading, setPosLoading] = useState(false);

  // Payment Automation Settings State
  const [paymentSettings, setPaymentSettings] = useState({
    reminder_interval_days: '3',
    max_reminders_per_invoice: '7',
    auto_pause_on_promise: 'true',
  });
  const [paySettingsSaving, setPaySettingsSaving] = useState(false);
  const [paySettingsSaved, setPaySettingsSaved] = useState(false);
  const [paySettingsLoading, setPaySettingsLoading] = useState(false);

  // General Business Settings State
  const [generalSettings, setGeneralSettings] = useState({
    org_name: localStorage.getItem('erppro_org_name') || 'SobhaInfra Tech',
    company_logo_url: '',
    company_qr_code_url: '',
    company_stamp_url: '',
    authorized_signature_url: '',
    company_udyam_reg: 'UDYAM-GJ-01-0012345',
    admin_email: 'contact@sobhainfratech.com',
    contact_phone: '+91 98765 43210',
    timezone: 'Asia/Kolkata (IST +05:30)',
    default_currency: 'INR',
    company_address: 'NH48, Near Kolei Khadi Sarodhi, Valsad, Gujarat - 396001',
    gstin_number: '24AGCPJ2785R1ZV',
    invoice_footer_notes: 'Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days. Goods Once Sold Will Not Be Taken Back.',
    bank_name: 'HDFC Bank Ltd.',
    bank_account_no: '50200088991122',
    bank_ifsc: 'HDFC0001234',
    upi_id: 'shobhareadyplast@okhdfcbank',
  });
  const [generalSaving, setGeneralSaving] = useState(false);
  const [generalSaved, setGeneralSaved] = useState(false);
  const [generalLoading, setGeneralLoading] = useState(false);
  const logoInputRef = useRef(null);
  const qrInputRef = useRef(null);
  const stampInputRef = useRef(null);
  const signatureInputRef = useRef(null);

  // Storage & Supabase Health State
  const [storageSummary, setStorageSummary] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageAutoCleanEnabled, setStorageAutoCleanEnabled] = useState(true);
  const [storageRetentionDays, setStorageRetentionDays] = useState(7);
  const [storageCatToggles, setStorageCatToggles] = useState({
    whatsapp_media: true,
    audit_logs: true,
    activities: true,
    site_visits: true,
    sync_errors: true,
    payment_reminders: true,
  });
  const [storageSaving, setStorageSaving] = useState(false);
  const [storageToast, setStorageToast] = useState(null);
  const [purgingKey, setPurgingKey] = useState(null);
  const [showRetentionWarningModal, setShowRetentionWarningModal] = useState(false);
  const [pendingRetentionDays, setPendingRetentionDays] = useState(7);
  const [purgeConfirmModal, setPurgeConfirmModal] = useState(null);

  // WhatsApp Config State
  const [whatsappConfig, setWhatsappConfig] = useState({
    phone_number_id: localStorage.getItem('erppro_wa_phone_id') || '1217775984755724',
    waba_id: localStorage.getItem('erppro_wa_waba_id') || '1073768118438244',
    access_token: localStorage.getItem('erppro_wa_access_token') || 'EAAO5bP4en30BSechJ6djYxtfPtupXj...',
    verify_token: localStorage.getItem('erppro_wa_verify_token') || 'erppro_wa_sec_9f8b2c4e1a7d6e5c8302',
  });
  const [waConfigSaved, setWaConfigSaved] = useState(false);
  const [waConfigSaving, setWaConfigSaving] = useState(false);

  // Tally Config State
  const [tallyConfig, setTallyConfig] = useState({
    host: localStorage.getItem('erppro_tally_host') || '127.0.0.1',
    port: localStorage.getItem('erppro_tally_port') || '9000',
    company_name: localStorage.getItem('erppro_tally_company') || 'SHOBHA READY PLAST',
    secret_token: localStorage.getItem('erppro_tally_token') || 'erppro_tally_sec_token_2026',
    auto_sync: localStorage.getItem('erppro_tally_autosync') || 'Every 15 minutes (Real-time)',
  });
  const [tallyConfigSaved, setTallyConfigSaved] = useState(false);
  const [tallyConfigSaving, setTallyConfigSaving] = useState(false);

  // Meta Leads Config State
  const [metaConfig, setMetaConfig] = useState({
    fb_page_id: localStorage.getItem('erppro_fb_page_id') || 'SobhaInfra Tech (Page ID: 1048293482)',
    ig_handle: localStorage.getItem('erppro_ig_handle') || '@sobhainfra_official',
    meta_token: localStorage.getItem('erppro_meta_token') || 'EAAGNO5bP4en30BSechJ6djYxtfPtupXj...',
    default_assignee: localStorage.getItem('erppro_meta_assignee') || 'Round Robin Distribution',
  });
  const [metaConfigSaved, setMetaConfigSaved] = useState(false);
  const [metaConfigSaving, setMetaConfigSaving] = useState(false);

  // Notification Preferences State
  const [notifPreferences, setNotifPreferences] = useState({
    new_lead: true,
    payment_overdue: true,
    campaign_complete: true,
    ai_handoff: true,
    tally_disconnect: true,
  });
  const [notifSaved, setNotifSaved] = useState(false);

  // Customer Master Google Sheet Config State
  const [sheetConfig, setSheetConfig] = useState({
    url: 'https://docs.google.com/spreadsheets/d/1phUUKnsQcWR9kIPjNsOGr4lzu7Torj8W1XMziRNuncw/edit',
    urlInput: '',
  });
  const [sheetSaving, setSheetSaving] = useState(false);
  const [sheetSaved, setSheetSaved] = useState(false);
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [sheetSyncMsg, setSheetSyncMsg] = useState('');
  const [sheetLastSynced, setSheetLastSynced] = useState(null);
  const [sheetRowCount, setSheetRowCount] = useState(null);

  useEffect(() => {
    loadSafety();
    loadGeneralSettings();
    runAutoStorageCleanupIfDue().catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'general') loadGeneralSettings();
    if (activeTab === 'ai_kb') loadKnowledgeBase();
    if (activeTab === 'roles_positions') loadRolesAndMatrix();
    if (activeTab === 'payment_automation') loadPaymentSettings();
    if (activeTab === 'storage') loadStorageData();
    if (activeTab === 'whatsapp') loadWhatsAppConfig();
    if (activeTab === 'tally') loadTallyConfig();
    if (activeTab === 'meta_leads') loadMetaConfig();
    if (activeTab === 'notifications') loadNotifPreferences();
    if (activeTab === 'customer_sheet') loadSheetConfig();
  }, [activeTab]);

  const loadSheetConfig = async () => {
    const [urlRes, logRes] = await Promise.all([getCustomerSheetUrl(), getSheetSyncLog()]);
    if (urlRes.data) setSheetConfig(prev => ({ ...prev, url: urlRes.data, urlInput: urlRes.data }));
    else setSheetConfig(prev => ({ ...prev, urlInput: prev.url }));
    if (logRes.data?.synced_at) setSheetLastSynced(logRes.data.synced_at);
    if (logRes.data?.row_count) setSheetRowCount(logRes.data.row_count);
  };

  const handleSaveSheetUrl = async () => {
    const url = sheetConfig.urlInput.trim();
    if (!url || !url.includes('docs.google.com/spreadsheets')) {
      setSheetSyncMsg('⚠ Please enter a valid Google Sheets URL');
      setTimeout(() => setSheetSyncMsg(''), 3000);
      return;
    }
    setSheetSaving(true);
    await saveCustomerSheetUrl(url);
    setSheetConfig(prev => ({ ...prev, url }));
    setSheetSaved(true);
    setSheetSyncMsg('✅ Google Sheet URL saved!');
    setTimeout(() => { setSheetSaved(false); setSheetSyncMsg(''); }, 3000);
    setSheetSaving(false);
  };

  const handleSyncSheet = async () => {
    setSheetSyncing(true);
    setSheetSyncMsg('Syncing customer list from Google Sheet...');
    const { data, error } = await triggerSheetSync();
    if (error || !data?.success) {
      setSheetSyncMsg('⚠ Sync via Netlify function not available in dev mode. Data already loaded.');
    } else {
      const count = data.synced || 0;
      setSheetRowCount(count);
      setSheetLastSynced(new Date().toISOString());
      setSheetSyncMsg(`✅ Synced ${count} verified customers from Google Sheet`);
    }
    setSheetSyncing(false);
    setTimeout(() => setSheetSyncMsg(''), 5000);
  };

  const loadMetaConfig = async () => {
    const { data } = await getOrgSettings();
    if (data) {
      setMetaConfig(prev => ({
        ...prev,
        fb_page_id: data.meta_fb_page_id || prev.fb_page_id,
        ig_handle: data.meta_ig_handle || prev.ig_handle,
        meta_token: data.meta_api_token || prev.meta_token,
        default_assignee: data.meta_default_assignee || prev.default_assignee,
      }));
    }
  };

  const handleSaveMetaConfig = async () => {
    setMetaConfigSaving(true);
    await Promise.all([
      updateOrgSetting('meta_fb_page_id', metaConfig.fb_page_id),
      updateOrgSetting('meta_ig_handle', metaConfig.ig_handle),
      updateOrgSetting('meta_api_token', metaConfig.meta_token),
      updateOrgSetting('meta_default_assignee', metaConfig.default_assignee),
    ]);
    localStorage.setItem('erppro_fb_page_id', metaConfig.fb_page_id);
    localStorage.setItem('erppro_ig_handle', metaConfig.ig_handle);
    localStorage.setItem('erppro_meta_token', metaConfig.meta_token);
    localStorage.setItem('erppro_meta_assignee', metaConfig.default_assignee);
    setMetaConfigSaving(false);
    setMetaConfigSaved(true);
    setTimeout(() => setMetaConfigSaved(false), 3000);
  };

  const loadWhatsAppConfig = async () => {
    const { data } = await getOrgSettings();
    if (data) {
      setWhatsappConfig(prev => ({
        ...prev,
        phone_number_id: data.wa_phone_number_id || prev.phone_number_id,
        waba_id: data.wa_waba_id || prev.waba_id,
        verify_token: data.wa_verify_token || prev.verify_token,
      }));
    }
  };

  const loadTallyConfig = async () => {
    const { data } = await getOrgSettings();
    if (data) {
      setTallyConfig(prev => ({
        ...prev,
        host: data.tally_host || prev.host,
        port: data.tally_port || prev.port,
        company_name: data.tally_company_name || prev.company_name,
        secret_token: data.tally_secret_token || prev.secret_token,
        auto_sync: data.tally_auto_sync || prev.auto_sync,
      }));
    }
  };

  const loadNotifPreferences = async () => {
    const { data } = await getOrgSettings();
    if (data) {
      setNotifPreferences({
        new_lead: data.notif_new_lead !== 'false',
        payment_overdue: data.notif_payment_overdue !== 'false',
        campaign_complete: data.notif_campaign_complete !== 'false',
        ai_handoff: data.notif_ai_handoff !== 'false',
        tally_disconnect: data.notif_tally_disconnect !== 'false',
      });
    }
  };

  const handleSaveWhatsAppConfig = async () => {
    setWaConfigSaving(true);
    await Promise.all([
      updateOrgSetting('wa_phone_number_id', whatsappConfig.phone_number_id),
      updateOrgSetting('wa_waba_id', whatsappConfig.waba_id),
      updateOrgSetting('wa_verify_token', whatsappConfig.verify_token),
    ]);
    localStorage.setItem('erppro_wa_phone_id', whatsappConfig.phone_number_id);
    localStorage.setItem('erppro_wa_waba_id', whatsappConfig.waba_id);
    localStorage.setItem('erppro_wa_access_token', whatsappConfig.access_token);
    localStorage.setItem('erppro_wa_verify_token', whatsappConfig.verify_token);
    setWaConfigSaving(false);
    setWaConfigSaved(true);
    setTimeout(() => setWaConfigSaved(false), 3000);
  };

  const handleSaveTallyConfig = async () => {
    setTallyConfigSaving(true);
    await Promise.all([
      updateOrgSetting('tally_host', tallyConfig.host),
      updateOrgSetting('tally_port', tallyConfig.port),
      updateOrgSetting('tally_company_name', tallyConfig.company_name),
      updateOrgSetting('tally_secret_token', tallyConfig.secret_token),
      updateOrgSetting('tally_auto_sync', tallyConfig.auto_sync),
    ]);
    localStorage.setItem('erppro_tally_host', tallyConfig.host);
    localStorage.setItem('erppro_tally_port', tallyConfig.port);
    localStorage.setItem('erppro_tally_company', tallyConfig.company_name);
    localStorage.setItem('erppro_tally_token', tallyConfig.secret_token);
    localStorage.setItem('erppro_tally_autosync', tallyConfig.auto_sync);
    setTallyConfigSaving(false);
    setTallyConfigSaved(true);
    setTimeout(() => setTallyConfigSaved(false), 3000);
  };

  const handleToggleNotif = async (key) => {
    const updated = { ...notifPreferences, [key]: !notifPreferences[key] };
    setNotifPreferences(updated);
    await updateOrgSetting(`notif_${key}`, String(updated[key]));
    try {
      localStorage.setItem(`erppro_notif_${key}`, String(updated[key]));
    } catch {}
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2000);
  };

  const loadGeneralSettings = async () => {
    setGeneralLoading(true);
    const { data } = await getOrgSettings();
    if (data) {
      setGeneralSettings(prev => ({
        ...prev,
        org_name: data.org_name || prev.org_name,
        company_logo_url: data.company_logo_url || prev.company_logo_url,
        company_qr_code_url: data.company_qr_code_url || prev.company_qr_code_url,
        company_stamp_url: data.company_stamp_url || prev.company_stamp_url,
        authorized_signature_url: data.authorized_signature_url || prev.authorized_signature_url,
        company_udyam_reg: data.company_udyam_reg || prev.company_udyam_reg,
        admin_email: data.admin_email || prev.admin_email,
        contact_phone: data.contact_phone || prev.contact_phone,
        timezone: data.timezone || prev.timezone,
        default_currency: data.default_currency || prev.default_currency,
        company_address: data.company_address || prev.company_address,
        gstin_number: data.gstin_number || prev.gstin_number,
        invoice_footer_notes: data.invoice_footer_notes || prev.invoice_footer_notes,
        bank_name: data.bank_name || prev.bank_name,
        bank_account_no: data.bank_account_no || prev.bank_account_no,
        bank_ifsc: data.bank_ifsc || prev.bank_ifsc,
        upi_id: data.upi_id || prev.upi_id,
      }));
    }
    setGeneralLoading(false);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo file size should be less than 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setGeneralSettings(prev => ({ ...prev, company_logo_url: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleQrUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('QR Code file size should be less than 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setGeneralSettings(prev => ({ ...prev, company_qr_code_url: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleStampUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Stamp image file size should be less than 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setGeneralSettings(prev => ({ ...prev, company_stamp_url: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Signature image file size should be less than 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setGeneralSettings(prev => ({ ...prev, authorized_signature_url: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveGeneralSettings = async () => {
    setGeneralSaving(true);
    await Promise.all([
      updateOrgSetting('org_name', generalSettings.org_name),
      updateOrgSetting('company_logo_url', generalSettings.company_logo_url),
      updateOrgSetting('company_qr_code_url', generalSettings.company_qr_code_url),
      updateOrgSetting('company_stamp_url', generalSettings.company_stamp_url),
      updateOrgSetting('authorized_signature_url', generalSettings.authorized_signature_url),
      updateOrgSetting('company_udyam_reg', generalSettings.company_udyam_reg),
      updateOrgSetting('admin_email', generalSettings.admin_email),
      updateOrgSetting('contact_phone', generalSettings.contact_phone),
      updateOrgSetting('timezone', generalSettings.timezone),
      updateOrgSetting('default_currency', generalSettings.default_currency),
      updateOrgSetting('company_address', generalSettings.company_address),
      updateOrgSetting('gstin_number', generalSettings.gstin_number),
      updateOrgSetting('invoice_footer_notes', generalSettings.invoice_footer_notes),
      updateOrgSetting('bank_name', generalSettings.bank_name),
      updateOrgSetting('bank_account_no', generalSettings.bank_account_no),
      updateOrgSetting('bank_ifsc', generalSettings.bank_ifsc),
      updateOrgSetting('upi_id', generalSettings.upi_id),
    ]);
    try {
      localStorage.setItem('erppro_org_name', generalSettings.org_name);
      if (generalSettings.company_logo_url) {
        localStorage.setItem('erppro_company_logo', generalSettings.company_logo_url);
      }
      if (generalSettings.company_qr_code_url) {
        localStorage.setItem('erppro_company_qr', generalSettings.company_qr_code_url);
      }
    } catch {}
    setGeneralSaving(false);
    setGeneralSaved(true);
    setPosSuccessMsg('✅ Business profile, Bank & QR settings saved safely!');
    setTimeout(() => { setGeneralSaved(false); setPosSuccessMsg(''); }, 3500);
  };

  // Multi-Company Profile Modal Handlers
  const handleOpenAddCompany = () => {
    setEditingCompany({
      id: '',
      company_name: '',
      alias_names: '',
      company_logo_url: '',
      company_qr_code_url: '',
      company_address: '',
      gstin_number: '',
      company_udyam_reg: '',
      admin_email: '',
      contact_phone: '',
      bank_name: '',
      bank_account_no: '',
      bank_ifsc: '',
      upi_id: '',
      state_name: 'Gujarat',
      state_code: '24',
      jurisdiction: 'VALSAD / THANE',
      invoice_footer_notes: 'Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days. Goods Once Sold Will Not Be Taken Back.',
      is_default: companyProfiles.length === 0,
    });
    setCompanyModalOpen(true);
  };

  const handleOpenEditCompany = (comp) => {
    setEditingCompany({
      id: comp.id || '',
      company_name: comp.company_name || '',
      alias_names: Array.isArray(comp.alias_names) ? comp.alias_names.join(', ') : (comp.alias_names || ''),
      company_logo_url: comp.company_logo_url || '',
      company_qr_code_url: comp.company_qr_code_url || '',
      company_address: comp.company_address || '',
      gstin_number: comp.gstin_number || '',
      company_udyam_reg: comp.company_udyam_reg || '',
      admin_email: comp.admin_email || '',
      contact_phone: comp.contact_phone || '',
      bank_name: comp.bank_name || '',
      bank_account_no: comp.bank_account_no || '',
      bank_ifsc: comp.bank_ifsc || '',
      upi_id: comp.upi_id || '',
      state_name: comp.state_name || 'Gujarat',
      state_code: comp.state_code || '24',
      jurisdiction: comp.jurisdiction || 'VALSAD / THANE',
      invoice_footer_notes: comp.invoice_footer_notes || '',
      is_default: Boolean(comp.is_default),
    });
    setCompanyModalOpen(true);
  };

  const handleCompanyLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo file size should be less than 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEditingCompany(prev => ({ ...prev, company_logo_url: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleCompanyQrUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('QR Code file size should be less than 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEditingCompany(prev => ({ ...prev, company_qr_code_url: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCompanyModal = async (e) => {
    e?.preventDefault();
    if (!editingCompany.company_name.trim()) {
      alert('Please enter a Company Name.');
      return;
    }
    setCompanyModalSaving(true);
    try {
      const aliasArray = editingCompany.alias_names
        ? editingCompany.alias_names.split(',').map(s => s.trim()).filter(Boolean)
        : [editingCompany.company_name.trim()];

      await saveCompany({
        ...editingCompany,
        alias_names: aliasArray,
      });
      setCompanyModalOpen(false);
      setPosSuccessMsg(`✅ Company profile for "${editingCompany.company_name}" saved successfully!`);
      setTimeout(() => setPosSuccessMsg(''), 3500);
    } catch (err) {
      alert('Error saving company profile: ' + err.message);
    } finally {
      setCompanyModalSaving(false);
    }
  };

  const handleDeleteCompanyClick = async (id, name) => {
    if (companyProfiles.length <= 1) {
      alert('You must have at least one active company profile.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete company profile "${name}"?`)) return;
    await deleteCompany(id);
    setPosSuccessMsg(`🗑️ Company profile "${name}" deleted.`);
    setTimeout(() => setPosSuccessMsg(''), 3500);
  };

  const handleSetDefaultCompany = async (comp) => {
    await saveCompany({ ...comp, is_default: true });
    // ✅ Also switch the active company in context so all pages filter immediately
    setActiveCompanyId(comp.id);
    setPosSuccessMsg(`⭐ "${comp.company_name}" is now the default primary company.`);
    setTimeout(() => setPosSuccessMsg(''), 3500);
  };


  const loadStorageData = async () => {
    setStorageLoading(true);
    const [summary, orgSetRes] = await Promise.all([
      getStorageUsageSummary(),
      getOrgSettings()
    ]);
    setStorageSummary(summary);
    const s = orgSetRes.data || {};
    setStorageAutoCleanEnabled(s.storage_auto_clean_enabled !== 'false');
    setStorageRetentionDays(Number(s.storage_retention_days) || 7);
    setStorageCatToggles({
      whatsapp_media: s.auto_clean_whatsapp_media !== 'false',
      audit_logs: s.auto_clean_audit_logs !== 'false',
      activities: s.auto_clean_activities !== 'false',
      site_visits: s.auto_clean_site_visits !== 'false',
      sync_errors: s.auto_clean_sync_errors !== 'false',
      payment_reminders: s.auto_clean_payment_reminders !== 'false',
    });
    setStorageLoading(false);
  };

  const handleRetentionDaysSliderChange = (newDays) => {
    const val = Number(newDays);
    if (val >= 8) {
      setPendingRetentionDays(val);
      setShowRetentionWarningModal(true);
    } else {
      setStorageRetentionDays(val);
    }
  };

  const handleConfirmHighRetention = () => {
    setStorageRetentionDays(pendingRetentionDays);
    setShowRetentionWarningModal(false);
  };

  const handleSaveStorageSettings = async () => {
    setStorageSaving(true);
    await Promise.all([
      updateOrgSetting('storage_auto_clean_enabled', String(storageAutoCleanEnabled)),
      updateOrgSetting('storage_retention_days', String(storageRetentionDays)),
      updateOrgSetting('auto_clean_whatsapp_media', String(storageCatToggles.whatsapp_media)),
      updateOrgSetting('auto_clean_audit_logs', String(storageCatToggles.audit_logs)),
      updateOrgSetting('auto_clean_activities', String(storageCatToggles.activities)),
      updateOrgSetting('auto_clean_site_visits', String(storageCatToggles.site_visits)),
      updateOrgSetting('auto_clean_sync_errors', String(storageCatToggles.sync_errors)),
      updateOrgSetting('auto_clean_payment_reminders', String(storageCatToggles.payment_reminders)),
    ]);
    setStorageSaving(false);
    setStorageToast('✅ Storage retention & auto-clear policies saved successfully!');
    setTimeout(() => setStorageToast(null), 4000);
  };

  const handleExecutePurge = async () => {
    if (!purgeConfirmModal) return;
    setPurgingKey(purgeConfirmModal.key);
    let deleted = 0;

    if (purgeConfirmModal.key === 'all') {
      const selectedKeys = Object.entries(storageCatToggles).filter(([_, v]) => v).map(([k]) => k);
      const res = await purgeAllExpiredStorage(storageRetentionDays, selectedKeys);
      deleted = res.totalDeleted || 0;
    } else {
      const res = await purgeStorageCategory(purgeConfirmModal.key, storageRetentionDays);
      deleted = res.deletedCount || 0;
    }

    setPurgeConfirmModal(null);
    setPurgingKey(null);
    await loadStorageData();
    setStorageToast(`🗑️ Successfully purged ${deleted} expired items from Supabase storage!`);
    setTimeout(() => setStorageToast(null), 4000);
  };

  const loadPaymentSettings = async () => {
    setPaySettingsLoading(true);
    const { data } = await getOrgSettings();
    setPaymentSettings({
      reminder_interval_days: data?.reminder_interval_days || '3',
      max_reminders_per_invoice: data?.max_reminders_per_invoice || '7',
      auto_pause_on_promise: data?.auto_pause_on_promise || 'true',
    });
    setPaySettingsLoading(false);
  };

  const handleSavePaymentSettings = async () => {
    setPaySettingsSaving(true);
    await Promise.all([
      updateOrgSetting('reminder_interval_days', paymentSettings.reminder_interval_days),
      updateOrgSetting('max_reminders_per_invoice', paymentSettings.max_reminders_per_invoice),
      updateOrgSetting('auto_pause_on_promise', paymentSettings.auto_pause_on_promise),
    ]);
    setPaySettingsSaving(false);
    setPaySettingsSaved(true);
    setTimeout(() => setPaySettingsSaved(false), 3000);
  };

  const loadRolesAndMatrix = async () => {
    setPosLoading(true);
    const [rolesRes, membersRes, matrixRes] = await Promise.all([
      getRoles(),
      getTeamMembers(),
      getPermissionMatrix()
    ]);
    setRolesList(rolesRes.data || []);
    setTeamMembersList(membersRes.data || []);
    setSettingsMatrix(matrixRes.data || {});
    setPosLoading(false);
  };

  const loadKnowledgeBase = async () => {
    setKbLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('ai_knowledge').select('*').order('category').order('created_at');
        if (!error && data) { setKbItems(data); setKbLoading(false); return; }
      }
      // Fallback: load from webhook proxy
      const res = await fetch('/.netlify/functions/get-conversations?kb=1');
      const json = await res.json();
      setKbItems(json.kb || []);
    } catch {}
    setKbLoading(false);
  };

  const handleKbSave = async () => {
    if (!kbForm.title.trim() || !kbForm.content.trim()) return;
    setKbSaving(true);
    try {
      if (editingKb && editingKb !== 'new') {
        // Update existing
        await supabase.from('ai_knowledge').update({
          ...kbForm, updated_at: new Date().toISOString()
        }).eq('id', editingKb.id);
        setKbItems(prev => prev.map(k => k.id === editingKb.id ? { ...k, ...kbForm } : k));
      } else {
        // Insert new
        const { data } = await supabase.from('ai_knowledge').insert([{
          organization_id: DEFAULT_ORG_ID, ...kbForm, version: 1
        }]).select().single();
        if (data) setKbItems(prev => [...prev, data]);
      }
      setKbSuccess('Knowledge item saved! AI will use this in next response.');
      setEditingKb(null);
      setKbForm({ category: 'Properties', title: '', content: '', status: 'active' });
      setTimeout(() => setKbSuccess(''), 4000);
    } catch (e) {
      setKbSuccess('Error: ' + e.message);
    }
    setKbSaving(false);
  };

  const handleKbDelete = async (id) => {
    if (!window.confirm('Delete this knowledge item? The AI will no longer use it.')) return;
    await supabase.from('ai_knowledge').delete().eq('id', id);
    setKbItems(prev => prev.filter(k => k.id !== id));
  };

  const handleKbEdit = (item) => {
    setEditingKb(item);
    setKbForm({ category: item.category, title: item.title, content: item.content, status: item.status });
  };

  const handleKbToggleStatus = async (item) => {
    const newStatus = item.status === 'active' ? 'inactive' : 'active';
    await supabase.from('ai_knowledge').update({ status: newStatus }).eq('id', item.id);
    setKbItems(prev => prev.map(k => k.id === item.id ? { ...k, status: newStatus } : k));
  };

  const loadSafety = async () => {
    const { data } = await getSystemSafetyAndQuotas();
    if (data) setSafety(data);
  };

  const handleSave = async () => {
    await Promise.all([
      handleSaveGeneralSettings(),
      safety ? updateSystemSafety(safety) : Promise.resolve(),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleCircuitChange = async (mode) => {
    const { data } = await toggleCircuitBreaker(mode);
    if (data) setSafety(data);
  };

  const handleDownloadFullExport = async () => {
    setDownloading(true);
    const { data } = await exportAllData();
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `erppro_full_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    }
    setDownloading(false);
  };

  const handleDownloadCsv = async (type) => {
    const { data: csvText } = await exportLiveTableCsv(type);
    if (csvText) {
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `erppro_${type}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleSimulateMetaLead = async (sourcePlatform) => {
    setSimulating(true);
    setSimResult(null);
    const leadPayload = {
      ...simLead,
      source: sourcePlatform,
    };
    try {
      const res = await fetch('/.netlify/functions/meta-leads-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadPayload),
      });
      const data = await res.json();
      if (data.success) {
        setSimResult({
          success: true,
          message: `✅ Test ${sourcePlatform} lead captured successfully! Normalized phone: ${data.leads?.[0]?.phone || normalizePhone(simLead.phone)}. Check CRM pipeline.`,
        });
      } else {
        await createLead(leadPayload);
        setSimResult({
          success: true,
          message: `✅ Test ${sourcePlatform} lead added to local CRM database successfully!`,
        });
      }
    } catch (err) {
      await createLead(leadPayload);
      setSimResult({
        success: true,
        message: `✅ Test ${sourcePlatform} lead added to CRM successfully (offline demo mode)!`,
      });
    }
    setSimulating(false);
  };

  const handleSaveEmailConfig = async () => {
    localStorage.setItem('erppro_gmail_user', emailConfig.gmail_user);
    localStorage.setItem('erppro_gmail_app_password', emailConfig.gmail_app_password);
    localStorage.setItem('erppro_email_sender_name', emailConfig.sender_name);

    if (isSupabaseConfigured) {
      await updateOrgSetting('gmail_user', emailConfig.gmail_user);
      await updateOrgSetting('email_sender_name', emailConfig.sender_name);
    }
    setEmailConfigSaved(true);
    setTimeout(() => setEmailConfigSaved(false), 3000);
  };

  const handleTestEmailDispatch = async (e) => {
    e.preventDefault();
    if (!testEmailRecipient || !testEmailRecipient.includes('@')) {
      setTestEmailResult({ success: false, message: 'Please enter a valid recipient email address for testing.' });
      return;
    }
    setTestingEmail(true);
    setTestEmailResult(null);

    const payload = {
      to: testEmailRecipient.trim(),
      recipientName: 'Test Recipient',
      subject: `[TEST] Gmail SMTP Connectivity Verification — ${emailConfig.sender_name || 'SobhaInfra ERP'}`,
      html: `<div style="font-family: sans-serif; padding: 15px;">
        <h2 style="color: #4f46e5; margin: 0 0 10px 0;">🎉 Gmail SMTP Verification Successful!</h2>
        <p>This is an official test email sent from your <strong>SobhaInfra ERP Panel</strong>.</p>
        <p>Your Gmail credentials and SMTP configurations are working properly.</p>
        <div style="background: #f1f5f9; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin: 15px 0;">
          <strong>Sender:</strong> ${emailConfig.sender_name} (${emailConfig.gmail_user || 'Default'})<br/>
          <strong>Timestamp:</strong> ${new Date().toLocaleString('en-IN')}
        </div>
      </div>`,
      senderName: emailConfig.sender_name,
      senderEmail: emailConfig.gmail_user,
      smtpConfig: {
        host: emailConfig.smtp_host,
        port: emailConfig.smtp_port,
        user: emailConfig.gmail_user,
        pass: emailConfig.gmail_app_password,
        fromName: emailConfig.sender_name,
      },
    };

    const res = await sendDirectEmail(payload);
    if (res.success) {
      setTestEmailResult({
        success: true,
        message: res.data?.simulated
          ? 'Simulation successful! Enter a live 16-character Google App Password for actual inbox delivery.'
          : `✅ Live email delivered successfully to ${testEmailRecipient}! Check your inbox.`,
      });
    } else {
      setTestEmailResult({
        success: false,
        message: `❌ Dispatch Failed: ${res.error || 'Check Gmail address and App Password.'}`,
      });
    }
    setTestingEmail(false);
  };

  const tabs = [
    { id: 'general', label: 'General', icon: <SettingsIcon size={16} /> },
    { id: 'customer_sheet', label: 'Customer Master Sheet', icon: <FileSpreadsheet size={16} /> },
    { id: 'email_smtp', label: 'Email & Gmail SMTP', icon: <Mail size={16} /> },
    { id: 'storage', label: 'Storage & Supabase Health', icon: <Database size={16} /> },
    { id: 'payment_automation', label: 'Payment Automation', icon: <Bell size={16} /> },
    { id: 'meta_leads', label: 'Meta Leads (FB & IG)', icon: <Share2 size={16} /> },
    { id: 'whatsapp', label: 'WhatsApp API', icon: <MessageCircle size={16} /> },
    { id: 'ai_kb', label: 'AI Knowledge Base', icon: <Brain size={16} /> },
    { id: 'safety', label: 'Free-Tier Safety & Quotas', icon: <Zap size={16} /> },
    { id: 'export', label: 'Data Portability & Export', icon: <Download size={16} /> },
    { id: 'roles_positions', label: 'Roles & Positions', icon: <Shield size={16} /> },
    { id: 'tally', label: 'Tally Config', icon: <RefreshCw size={16} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
    { id: 'security', label: 'Security', icon: <Shield size={16} /> },
  ];

  const circuitModeColors = {
    Normal: 'var(--success)',
    Warning: 'var(--warning)',
    Degraded: 'var(--accent-primary)',
    Paused: 'var(--danger)'
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Platform Settings & Operations</h1>
          <p className="page-subtitle">Configure integrations, free-tier rate limits, degraded modes, and zero-lockin data backups.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? <><Check size={15} /> Saved!</> : <><Save size={15} /> Save Changes</>}
          </button>
        </div>
      </div>

      <div className="settings-page-grid">

        {/* Sidebar / Horizontal Scrollable Tabs on Mobile */}
        <div className="glass-card settings-nav-card">
          <div className="settings-tabs-container">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`btn settings-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              >
                {tab.icon} <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="glass-card p-6 settings-content-card">

          {/* ══════════════════════════════════════════════════════════════
              TAB: CUSTOMER MASTER SHEET
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'customer_sheet' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Header */}
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileSpreadsheet size={18} color="var(--accent-primary)" /> Customer Master Contact Sheet
                </h3>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  This Google Sheet is the authoritative source for verified customers. Only parties present in this sheet will receive payment reminders. The Tally operator keeps this sheet updated.
                </p>
              </div>

              {/* Status Bar */}
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                {[
                  { label: 'Customers in Sheet', value: sheetRowCount != null ? sheetRowCount : '—', color: '#6366f1' },
                  { label: 'Last Synced', value: sheetLastSynced ? new Date(sheetLastSynced).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never', color: 'var(--success)' },
                ].map(s => (
                  <div key={s.label} style={{ padding: '0.85rem 1.25rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', minWidth: '160px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: s.color, marginTop: '0.2rem' }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Sheet URL input */}
              <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Google Sheet URL
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                    (must be publicly readable)
                  </span>
                </label>
                <input
                  type="url"
                  className="form-input"
                  value={sheetConfig.urlInput}
                  onChange={e => setSheetConfig(prev => ({ ...prev, urlInput: e.target.value }))}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
                />
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    className={`btn ${sheetSaved ? 'btn-success' : 'btn-primary'}`}
                    onClick={handleSaveSheetUrl}
                    disabled={sheetSaving}
                  >
                    {sheetSaved ? <><Check size={14} /> Saved</> : sheetSaving ? 'Saving...' : <><Save size={14} /> Save URL</>}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleSyncSheet}
                    disabled={sheetSyncing}
                    title="Re-sync the customer list from Google Sheet into the database now"
                  >
                    <RefreshCw size={14} className={sheetSyncing ? 'animate-spin' : ''} />
                    {sheetSyncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                  {sheetConfig.url && (
                    <a
                      href={sheetConfig.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Globe size={13} /> Open Sheet
                    </a>
                  )}
                  {sheetSyncMsg && (
                    <span style={{ fontSize: '0.78rem', color: sheetSyncMsg.includes('⚠') ? 'var(--warning)' : 'var(--success)', fontWeight: 500 }}>
                      {sheetSyncMsg}
                    </span>
                  )}
                </div>
              </div>

              {/* How it works */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: '0 0 0.75rem', color: 'var(--text-primary)' }}>
                  How the Smart Matching Works
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {[
                    { tier: 'Tier 1', desc: 'Exact name match (case-insensitive)' },
                    { tier: 'Tier 2', desc: 'Normalized match — strips Pvt Ltd, LLP, Traders, Co. etc.' },
                    { tier: 'Tier 3', desc: 'Phone cross-verification (Tally phone vs sheet phone)' },
                    { tier: 'Tier 4', desc: 'Fuzzy similarity ≥ 85% — auto-verified (e.g. minor typos)' },
                  ].map(t => (
                    <div key={t.tier} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '20px', background: 'rgba(99,102,241,0.12)', color: '#6366f1', whiteSpace: 'nowrap', marginTop: '0.05rem' }}>{t.tier}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.desc}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.6rem 0.85rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  ⚡ Parties NOT found in the sheet are <strong>never shown</strong> in Payment Follow-up and will never receive any reminder — zero risk.
                </div>
              </div>

              {/* Sheet schema reference */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: '0 0 0.75rem', color: 'var(--text-primary)' }}>
                  Expected Sheet Columns (Row 1 Headers)
                </h4>
                <table className="data-table" style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th>Column Name</th>
                      <th>Example</th>
                      <th>Used For</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { col: 'Company Name', ex: 'AAI EKVIRA ENTERPRISES', use: 'Primary match key (Priority 1)' },
                      { col: 'Customer Name', ex: 'PK PATIL', use: 'Contact person shown in Follow-up' },
                      { col: 'Contact Number', ex: '8907778383', use: 'Reference for matching (Priority 2)' },
                      { col: 'Email Address', ex: 'optional@email.com', use: 'Future email reminders (optional)' },
                    ].map(r => (
                      <tr key={r.col}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{r.col}</td>
                        <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.ex}</td>
                        <td>{r.use}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB: EMAIL & GMAIL SMTP CONFIGURATION
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'email_smtp' && (

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Mail size={20} color="var(--accent-primary)" /> Gmail & SMTP Outbound Mail Center
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                    Connect your official Gmail account to send quotations, brochures, site visit confirmations, and invoices directly to clients from the panel.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.25rem 0.65rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
                    background: (emailConfig.gmail_user && emailConfig.gmail_app_password) ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: (emailConfig.gmail_user && emailConfig.gmail_app_password) ? '#10b981' : '#f59e0b',
                    border: `1px solid ${(emailConfig.gmail_user && emailConfig.gmail_app_password) ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                  }}>
                    {(emailConfig.gmail_user && emailConfig.gmail_app_password) ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    {(emailConfig.gmail_user && emailConfig.gmail_app_password) ? 'Gmail SMTP Configured' : 'Credentials Needed'}
                  </span>
                </div>
              </div>

              {/* Step-by-Step Google App Password Guide */}
              <div style={{
                background: 'rgba(99, 102, 241, 0.05)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: '12px', padding: '1.25rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>🔐</span>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    How to generate your 16-character Google App Password (2 Minutes):
                  </strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <div style={{ background: 'rgba(0,0,0,0.15)', padding: '0.75rem', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--primary, #6366f1)', marginBottom: '0.2rem' }}>1. Security Page</div>
                    <div>Open <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', textDecoration: 'underline' }}>Google Account Security</a>.</div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.15)', padding: '0.75rem', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--primary, #6366f1)', marginBottom: '0.2rem' }}>2. 2-Step Verification</div>
                    <div>Ensure <strong>2-Step Verification</strong> is switched ON for your Google account.</div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.15)', padding: '0.75rem', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--primary, #6366f1)', marginBottom: '0.2rem' }}>3. App Passwords</div>
                    <div>Search <strong>"App passwords"</strong> in the top search bar of Google Account.</div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.15)', padding: '0.75rem', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--primary, #6366f1)', marginBottom: '0.2rem' }}>4. Create & Paste</div>
                    <div>Enter App Name <strong>SobhaInfra ERP</strong>, click Create, and copy the 16-letter password below.</div>
                  </div>
                </div>
              </div>

              {/* SMTP Credentials Form */}
              <div style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem'
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <SettingsIcon size={16} /> SMTP Account Credentials
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                      Official Gmail Address *
                    </label>
                    <input
                      type="email"
                      className="input-field"
                      placeholder="e.g. shobhainfra2026@gmail.com"
                      value={emailConfig.gmail_user}
                      onChange={e => setEmailConfig(p => ({ ...p, gmail_user: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                      Sender Display Name *
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. Sobha Infratech Pvt. Ltd."
                      value={emailConfig.sender_name}
                      onChange={e => setEmailConfig(p => ({ ...p, sender_name: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                      Google 16-Character App Password *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showAppPassword ? 'text' : 'password'}
                        className="input-field"
                        style={{ width: '100%', paddingRight: '2.5rem', fontFamily: showAppPassword ? 'monospace' : 'inherit' }}
                        placeholder="xxxx xxxx xxxx xxxx"
                        value={emailConfig.gmail_app_password}
                        onChange={e => setEmailConfig(p => ({ ...p, gmail_app_password: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowAppPassword(!showAppPassword)}
                        style={{
                          position: 'absolute', right: 8, top: 8, background: 'transparent',
                          border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px'
                        }}
                      >
                        {showAppPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                      SMTP Host & Port
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
                      <input
                        type="text"
                        className="input-field"
                        value={emailConfig.smtp_host}
                        onChange={e => setEmailConfig(p => ({ ...p, smtp_host: e.target.value }))}
                        placeholder="smtp.gmail.com"
                      />
                      <input
                        type="text"
                        className="input-field"
                        value={emailConfig.smtp_port}
                        onChange={e => setEmailConfig(p => ({ ...p, smtp_port: e.target.value }))}
                        placeholder="465"
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveEmailConfig}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                  >
                    {emailConfigSaved ? <><Check size={14} /> Saved!</> : <><Save size={14} /> Save Email Credentials</>}
                  </button>
                </div>
              </div>

              {/* Live SMTP Test Console */}
              <div style={{
                background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-color)',
                borderRadius: '12px', padding: '1.25rem'
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Send size={15} color="var(--primary, #6366f1)" /> Live SMTP Dispatch Tester
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
                  Test your configuration immediately by sending a verification email to your personal or client inbox.
                </p>

                {testEmailResult && (
                  <div style={{
                    padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.82rem',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    background: testEmailResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: testEmailResult.success ? '#10b981' : '#ef4444',
                    border: `1px solid ${testEmailResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                  }}>
                    {testEmailResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span>{testEmailResult.message}</span>
                  </div>
                )}

                <form onSubmit={handleTestEmailDispatch} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <input
                      type="email"
                      className="input-field"
                      style={{ width: '100%', fontSize: '0.85rem' }}
                      placeholder="Enter recipient email (e.g. your-email@gmail.com)"
                      value={testEmailRecipient}
                      onChange={e => setTestEmailRecipient(e.target.value)}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={testingEmail || !testEmailRecipient}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                  >
                    {testingEmail ? <RefreshCw size={14} className="spin" /> : <Send size={14} />}
                    {testingEmail ? 'Sending Test...' : '⚡ Send Test Email'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB: STORAGE & SUPABASE HEALTH
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'storage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Database size={18} color="var(--accent-primary)" /> Storage & Supabase Health Console
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                    Monitor live PostgreSQL tables, WhatsApp bucket assets, and configure automated retention policies to keep the system lean and fast.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={loadStorageData}
                    disabled={storageLoading}
                    title="Refresh live telemetry from Supabase"
                  >
                    <RefreshCw size={13} className={storageLoading ? 'animate-spin' : ''} />
                    <span>Refresh Telemetry</span>
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'var(--danger)', color: 'white', fontWeight: 700 }}
                    onClick={() => setPurgeConfirmModal({ key: 'all', name: 'All Selected Cleanable Storage', count: 'All Expired' })}
                  >
                    <Trash2 size={13} />
                    <span>⚡ Purge All Expired Data</span>
                  </button>
                </div>
              </div>

              {storageLoading && !storageSummary ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="animate-spin" />
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Querying live Supabase PostgreSQL & Storage buckets...</div>
                </div>
              ) : (
                <>
                  {/* KPI Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.85rem' }}>
                    <div className="glass-card" style={{ padding: '1rem', background: 'var(--bg-tertiary)' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                        Total Used Storage
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                        {((storageSummary?.totalUsedBytes || 0) / (1024 * 1024)).toFixed(2)} MB
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        of 500.0 MB Free Tier Quota ({storageSummary?.usedPercentage || 0}%)
                      </div>
                    </div>

                    <div className="glass-card" style={{ padding: '1rem', background: 'var(--bg-tertiary)' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                        Free Space Remaining
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)' }}>
                        {((storageSummary?.freeBytes || 0) / (1024 * 1024)).toFixed(2)} MB
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        Optimal headroom for smooth ops
                      </div>
                    </div>

                    <div className="glass-card" style={{ padding: '1rem', background: 'var(--bg-tertiary)' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                        Database Tables Size
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-secondary)' }}>
                        {((storageSummary?.dbBytes || 0) / (1024 * 1024)).toFixed(2)} MB
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        PostgreSQL schemas, logs & records
                      </div>
                    </div>

                    <div className="glass-card" style={{ padding: '1rem', background: 'var(--bg-tertiary)' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                        WhatsApp & Media Files
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--warning)' }}>
                        {((storageSummary?.storageBytes || 0) / (1024 * 1024)).toFixed(2)} MB
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        Bucket files (PDFs, images, proofs)
                      </div>
                    </div>
                  </div>

                  {/* Quota Progress Bar */}
                  <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Supabase Free-Tier Storage Utilization</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: (storageSummary?.usedPercentage || 0) > 85 ? 'var(--danger)' : 'var(--success)' }}>
                        {storageSummary?.usedPercentage || 0}% Used
                      </span>
                    </div>
                    <div className="progress-bar-wrap" style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${Math.max(2, storageSummary?.usedPercentage || 2)}%`,
                          background: (storageSummary?.usedPercentage || 0) > 85
                            ? 'var(--danger)'
                            : (storageSummary?.usedPercentage || 0) > 60
                            ? 'var(--warning)'
                            : 'var(--success)',
                          height: '100%',
                          transition: 'width 0.5s ease'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      <span>0 MB</span>
                      <span>Target: &lt; 350 MB (Healthy buffer)</span>
                      <span>500 MB (Hard Cap)</span>
                    </div>
                  </div>

                  {/* ───────────────────────────────────────────────────────────── */}
                  {/* AUTO-CLEAR & RETENTION SCHEDULER */}
                  {/* ───────────────────────────────────────────────────────────── */}
                  <div style={{ padding: '1.25rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(99,102,241,0.35)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-primary)' }}>
                          <Zap size={16} /> Automated Daily Storage Cleanup Engine
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          Automatically purges old logs, WhatsApp media, and temporary cache older than your configured retention window.
                        </div>
                      </div>

                      <div
                        onClick={() => setStorageAutoCleanEnabled(!storageAutoCleanEnabled)}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                      >
                        {storageAutoCleanEnabled ? (
                          <ToggleRight size={36} color="var(--success)" />
                        ) : (
                          <ToggleLeft size={36} color="var(--text-muted)" />
                        )}
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: storageAutoCleanEnabled ? 'var(--success)' : 'var(--text-muted)' }}>
                          {storageAutoCleanEnabled ? 'Auto-Clean ON' : 'Disabled'}
                        </span>
                      </div>
                    </div>

                    {storageAutoCleanEnabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                        {/* Retention Days Slider */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <div>
                              <label style={{ fontSize: '0.82rem', fontWeight: 700 }}>Data Retention Window</label>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                                (Keep data for this many days before auto-clearing)
                              </span>
                            </div>
                            <span style={{ fontWeight: 800, fontSize: '1.2rem', color: storageRetentionDays <= 7 ? 'var(--success)' : 'var(--warning)' }}>
                              {storageRetentionDays} Days {storageRetentionDays === 7 && <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>⭐ Recommended</span>}
                            </span>
                          </div>

                          <input
                            type="range"
                            min="1"
                            max="90"
                            value={storageRetentionDays}
                            onChange={e => handleRetentionDaysSliderChange(e.target.value)}
                            style={{ width: '100%', accentColor: storageRetentionDays <= 7 ? 'var(--success)' : 'var(--warning)', cursor: 'pointer' }}
                          />

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            <span>1 Day (Aggressive)</span>
                            <span style={{ color: 'var(--success)', fontWeight: 700 }}>7 Days (⭐ Supabase Free Tier Recommended)</span>
                            <span>90 Days (High Storage)</span>
                          </div>

                          {/* Quick Pills */}
                          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
                            {[
                              { label: '3 Days', val: 3 },
                              { label: '7 Days (Recommended ⭐)', val: 7 },
                              { label: '14 Days', val: 14 },
                              { label: '30 Days', val: 30 },
                              { label: '60 Days', val: 60 },
                              { label: '90 Days', val: 90 },
                            ].map(p => (
                              <button
                                key={p.val}
                                type="button"
                                className="btn btn-sm"
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '0.25rem 0.6rem',
                                  background: storageRetentionDays === p.val ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                  color: storageRetentionDays === p.val ? 'white' : 'var(--text-secondary)',
                                  border: `1px solid ${storageRetentionDays === p.val ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                  fontWeight: storageRetentionDays === p.val ? 700 : 400
                                }}
                                onClick={() => handleRetentionDaysSliderChange(p.val)}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Granular Category Checkboxes */}
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>
                            Included Auto-Purge Categories
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.5rem' }}>
                            {[
                              { key: 'whatsapp_media', label: 'WhatsApp & Invoice Media Files', desc: 'Cached images, audio & PDFs' },
                              { key: 'audit_logs', label: 'System Audit Trail Logs', desc: 'User action timestamps & updates' },
                              { key: 'activities', label: 'Activity Timeline Feeds', desc: 'Internal notes & automated events' },
                              { key: 'site_visits', label: 'Site Visit GPS Logs', desc: 'Field employee location pings' },
                              { key: 'sync_errors', label: 'Resolved Tally Sync Errors', desc: 'XML payload dumps & error logs' },
                              { key: 'payment_reminders', label: 'Payment Reminder Outbox', desc: 'Sent WhatsApp reminder records' },
                            ].map(cat => (
                              <label
                                key={cat.key}
                                style={{
                                  display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                                  padding: '0.6rem 0.75rem', background: 'var(--bg-secondary)',
                                  borderRadius: 8, border: '1px solid var(--border-color)',
                                  cursor: 'pointer'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={storageCatToggles[cat.key]}
                                  onChange={e => setStorageCatToggles(p => ({ ...p, [cat.key]: e.target.checked }))}
                                  style={{ marginTop: '0.15rem' }}
                                />
                                <div>
                                  <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>{cat.label}</div>
                                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{cat.desc}</div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Save Button */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                          <button
                            className="btn btn-primary"
                            onClick={handleSaveStorageSettings}
                            disabled={storageSaving}
                          >
                            {storageSaving ? (
                              <><RefreshCw size={14} className="animate-spin" /> Saving Policies...</>
                            ) : (
                              <><Save size={14} /> Save Auto-Clear Policies</>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ───────────────────────────────────────────────────────────── */}
                  {/* STORED DATA BREAKDOWN & MANUAL PURGE TABLE */}
                  {/* ───────────────────────────────────────────────────────────── */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0 }}>Live Stored Data Inventory (Supabase PostgreSQL & Buckets)</h4>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        All deletions permanently delete the actual records from Supabase
                      </span>
                    </div>

                    <div className="table-container glass-card" style={{ padding: 0 }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Data Category</th>
                            <th>Storage Type</th>
                            <th style={{ textAlign: 'center' }}>Stored Items</th>
                            <th style={{ textAlign: 'center' }}>Estimated Size</th>
                            <th style={{ textAlign: 'center' }}>Risk Level</th>
                            <th>Recommended Retention</th>
                            <th style={{ textAlign: 'right' }}>Manual Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(storageSummary?.categories || []).map(cat => (
                            <tr key={cat.key}>
                              <td>
                                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{cat.name}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', maxWidth: 280 }}>{cat.description}</div>
                              </td>
                              <td>
                                <span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>{cat.type}</span>
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                {cat.count.toLocaleString()} {cat.unit}
                              </td>
                              <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                {(cat.estimatedBytes / (1024 * 1024)).toFixed(2)} MB
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: '0.68rem',
                                    color: cat.riskLevel === 'Low' ? 'var(--success)' : cat.riskLevel === 'Medium' ? 'var(--warning)' : 'var(--accent-primary)',
                                    borderColor: cat.riskLevel === 'Low' ? 'var(--success)' : cat.riskLevel === 'Medium' ? 'var(--warning)' : 'var(--accent-primary)'
                                  }}
                                >
                                  {cat.riskLevel}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                {cat.recommendedRetention}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {cat.isCleanable ? (
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setPurgeConfirmModal({ key: cat.key, name: cat.name, count: `${cat.count} ${cat.unit}` })}
                                    disabled={cat.count === 0}
                                    style={{ fontSize: '0.72rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                    title={`Purge items older than ${storageRetentionDays} days`}
                                  >
                                    <Trash2 size={12} /> Purge ({storageRetentionDays}d+)
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '0.7rem', color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                    <Shield size={12} /> Protected
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB: PAYMENT AUTOMATION SETTINGS
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'payment_automation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Bell size={18} color="var(--accent-primary)" /> Payment Reminder Automation Settings
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  These settings apply to all active clients globally. Clients with a committed payment date
                  are automatically excluded from the reminder cycle until their date passes.
                </p>
              </div>

              {paySettingsLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  <RefreshCw size={20} className="animate-spin" /> Loading settings...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                  {/* Reminder Interval */}
                  <div style={{ padding: '1.25rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>🔔 Auto-Reminder Interval</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          How many days between automatic WhatsApp payment reminders
                        </div>
                      </div>
                      <span style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--accent-primary)' }}>
                        {paymentSettings.reminder_interval_days} days
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="30"
                      value={paymentSettings.reminder_interval_days}
                      onChange={e => setPaymentSettings(p => ({ ...p, reminder_interval_days: e.target.value }))}
                      style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      <span>1 day (aggressive)</span>
                      <span>7 days (recommended)</span>
                      <span>30 days (lenient)</span>
                    </div>
                    <div style={{ marginTop: '0.65rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {['1', '3', '5', '7', '14', '30'].map(d => (
                        <button
                          key={d}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', background: paymentSettings.reminder_interval_days === d ? 'var(--accent-primary)' : undefined, color: paymentSettings.reminder_interval_days === d ? 'white' : undefined }}
                          onClick={() => setPaymentSettings(p => ({ ...p, reminder_interval_days: d }))}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Max Reminders per Invoice */}
                  <div style={{ padding: '1.25rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>📊 Max Reminders per Invoice</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          Stop auto-reminders after this many attempts to avoid harassing clients
                        </div>
                      </div>
                      <span style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--accent-secondary)' }}>
                        {paymentSettings.max_reminders_per_invoice}×
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={paymentSettings.max_reminders_per_invoice}
                      onChange={e => setPaymentSettings(p => ({ ...p, max_reminders_per_invoice: e.target.value }))}
                      style={{ width: '100%', accentColor: 'var(--accent-secondary)', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      <span>1× (one-shot)</span>
                      <span>7× (recommended)</span>
                      <span>20× (persistent)</span>
                    </div>
                  </div>

                  {/* Auto-Pause on WhatsApp Promise */}
                  <div style={{ padding: '1.25rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>🤖 Auto-Pause on WhatsApp Promise</div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.2rem', maxWidth: 380 }}>
                        When a client replies "will pay in 15 days" or similar to a WhatsApp reminder, automatically pause their reminders until that committed date.
                      </div>
                    </div>
                    <div
                      onClick={() => setPaymentSettings(p => ({
                        ...p,
                        auto_pause_on_promise: p.auto_pause_on_promise === 'true' ? 'false' : 'true'
                      }))}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      {paymentSettings.auto_pause_on_promise === 'true' ? (
                        <ToggleRight size={36} color="var(--success)" />
                      ) : (
                        <ToggleLeft size={36} color="var(--text-muted)" />
                      )}
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: paymentSettings.auto_pause_on_promise === 'true' ? 'var(--success)' : 'var(--text-muted)' }}>
                        {paymentSettings.auto_pause_on_promise === 'true' ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  {/* Info box */}
                  <div style={{ padding: '0.85rem 1rem', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <strong>ℹ️ How Smart Pause Works:</strong>
                    <ul style={{ margin: '0.4rem 0 0 1rem', padding: 0 }}>
                      <li>Client replies "pay in 25 days" → auto-detected, reminders paused until that date</li>
                      <li>Client says "paid" → invoice auto-marked for verification</li>
                      <li>Admin can also manually pause/resume from <strong>Finance → Invoices</strong></li>
                      <li>When the promised date passes without payment, reminders auto-resume</li>
                      <li>Clients with <strong>automation off</strong> are never disturbed regardless of settings</li>
                    </ul>
                  </div>

                  {/* Save button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-primary"
                      onClick={handleSavePaymentSettings}
                      disabled={paySettingsSaving}
                    >
                      {paySettingsSaved ? (
                        <><Check size={15} /> Settings Saved!</>
                      ) : paySettingsSaving ? (
                        <><RefreshCw size={15} className="animate-spin" /> Saving...</>
                      ) : (
                        <><Save size={15} /> Save Payment Settings</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 1: GENERAL SETTINGS
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <SettingsIcon size={18} color="var(--accent-primary)" /> General Business Profile & Settings
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                    Configure organization branding, admin contact, business address, and invoice headers.
                  </p>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveGeneralSettings}
                  disabled={generalSaving}
                >
                  {generalSaved ? (
                    <><Check size={14} /> Saved!</>
                  ) : generalSaving ? (
                    <><RefreshCw size={14} className="animate-spin" /> Saving...</>
                  ) : (
                    <><Save size={14} /> Save Profile</>
                  )}
                </button>
              </div>

              {generalLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  <RefreshCw size={20} className="animate-spin" /> Loading business profile...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* ══════════════════════════════════════════════════════════
                      MULTI-COMPANY & MULTI-ENTITY REGISTRY
                     ══════════════════════════════════════════════════════════ */}
                  <div style={{
                    padding: '1.25rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1rem' }}>
                          <Building2 size={18} color="var(--accent-primary)" />
                          <span>Multi-Company Profiles Registry</span>
                          <span style={{ fontSize: '0.72rem', background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)', padding: '0.15rem 0.5rem', borderRadius: 12, fontWeight: 700 }}>
                            {companyProfiles.length} Companies Registered
                          </span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                          Each company maintains its own independent Logo, GSTIN, Address, Bank details, and Tally alias. Tally sync automatically matches the correct company for every invoice.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleOpenAddCompany}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                      >
                        <PlusCircle size={14} /> + Add New Company
                      </button>
                    </div>

                    {/* Company Profile Cards Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1rem' }}>
                      {companyProfiles.map((comp) => {
                        const isCurrentActive = activeCompanyId === comp.id;
                        return (
                          <div
                            key={comp.id}
                            style={{
                              border: isCurrentActive ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                              background: isCurrentActive ? 'rgba(99,102,241,0.03)' : 'var(--bg-tertiary)',
                              borderRadius: 12,
                              padding: '1rem',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              position: 'relative',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {/* Card Header */}
                            <div>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                  <div style={{
                                    width: 44, height: 44, borderRadius: 10, border: '1px solid var(--border-color)',
                                    background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    overflow: 'hidden', flexShrink: 0
                                  }}>
                                    {comp.company_logo_url ? (
                                      <img src={comp.company_logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                    ) : (
                                      <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--accent-primary)' }}>
                                        {comp.company_name.slice(0, 2)}
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                      {comp.company_name}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                      GSTIN: <strong>{comp.gstin_number || 'N/A'}</strong>
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                                  {comp.is_default && (
                                    <span style={{ fontSize: '0.65rem', background: '#f59e0b', color: '#000', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                      <Star size={10} fill="#000" /> Default
                                    </span>
                                  )}
                                  {isCurrentActive && (
                                    <span style={{ fontSize: '0.65rem', background: 'rgba(34,197,94,0.15)', color: 'var(--success)', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 6 }}>
                                      ● Active Workspace
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Details snippet */}
                              <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
                                <div>📍 {comp.company_address ? (comp.company_address.length > 60 ? comp.company_address.slice(0, 60) + '...' : comp.company_address) : 'No address set'}</div>
                                <div>🏦 {comp.bank_name ? `${comp.bank_name} · A/C: ••••${(comp.bank_account_no || '').slice(-4)}` : 'No bank account'}</div>
                                {comp.company_udyam_reg && <div>📜 UDYAM: {comp.company_udyam_reg}</div>}
                                {Array.isArray(comp.alias_names) && comp.alias_names.length > 0 && (
                                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                    🏷️ Tally Aliases: {comp.alias_names.join(', ')}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Card Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '0.65rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleOpenEditCompany(comp)}
                                style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                              >
                                <Edit3 size={12} /> Edit Profile
                              </button>

                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                {!comp.is_default && (
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => handleSetDefaultCompany(comp)}
                                    title="Set as primary default company"
                                    style={{ fontSize: '0.7rem' }}
                                  >
                                    Set Default
                                  </button>
                                )}
                                {companyProfiles.length > 1 && (
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => handleDeleteCompanyClick(comp.id, comp.company_name)}
                                    title="Delete this company profile"
                                    style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)', padding: '0.3rem 0.5rem' }}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Primary Organization Settings Form */}
                  <div style={{ padding: '1rem', background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 'var(--radius-md)' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                      🏢 Primary Organization Global Branding & Defaults
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                      <div style={{
                        width: 72, height: 72, borderRadius: 12, border: '2px dashed var(--border-color)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)',
                        overflow: 'hidden', position: 'relative'
                      }}>
                        {generalSettings.company_logo_url ? (
                          <img src={generalSettings.company_logo_url} alt="Brand Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : (
                          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                            <Building2 size={24} style={{ margin: '0 auto 2px', opacity: 0.6 }} />
                            <span>No Logo</span>
                          </div>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml,image/webp"
                            style={{ display: 'none' }}
                            onChange={handleLogoUpload}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => logoInputRef.current?.click()}
                          >
                            <Upload size={14} /> Upload Brand Logo
                          </button>
                          {generalSettings.company_logo_url && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}
                              onClick={() => setGeneralSettings(p => ({ ...p, company_logo_url: '' }))}
                            >
                              <Trash2 size={13} /> Remove
                            </button>
                          )}
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                          PNG, JPG, SVG or WebP (Max 2MB). Appears at the top-left of generated PDF Tax Invoices, e-Way bills, and client portals.
                        </span>
                        <div style={{ marginTop: '0.35rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', color: 'var(--success)', fontWeight: 600 }}>
                          <ShieldCheck size={13} /> Protected from auto-storage cleanup — Logo is permanently preserved.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Row 1: Company Name & Admin Email */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                        Company / Organization Name
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        value={generalSettings.org_name}
                        onChange={e => setGeneralSettings(p => ({ ...p, org_name: e.target.value }))}
                        placeholder="e.g. Acme Tech Solutions Pvt. Ltd."
                      />
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'block' }}>
                        Appears on customer invoices, reminders, and portal headers.
                      </span>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                        Primary Admin Email
                      </label>
                      <input
                        type="email"
                        className="input-field"
                        value={generalSettings.admin_email}
                        onChange={e => setGeneralSettings(p => ({ ...p, admin_email: e.target.value }))}
                        placeholder="admin@company.com"
                      />
                    </div>
                  </div>

                  {/* Row 2: Phone, Timezone & Currency */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                        Support / Operations Phone
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        value={generalSettings.contact_phone}
                        onChange={e => setGeneralSettings(p => ({ ...p, contact_phone: e.target.value }))}
                        placeholder="+91 98765 43210"
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                        Time Zone
                      </label>
                      <select
                        className="input-field"
                        value={generalSettings.timezone}
                        onChange={e => setGeneralSettings(p => ({ ...p, timezone: e.target.value }))}
                      >
                        <option value="Asia/Kolkata (IST +05:30)">Asia/Kolkata (IST +05:30)</option>
                        <option value="UTC (GMT +00:00)">UTC (GMT +00:00)</option>
                        <option value="Asia/Dubai (GST +04:00)">Asia/Dubai (GST +04:00)</option>
                        <option value="America/New_York (EST)">America/New_York (EST)</option>
                        <option value="Europe/London (BST)">Europe/London (BST)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                        Default Currency
                      </label>
                      <select
                        className="input-field"
                        value={generalSettings.default_currency}
                        onChange={e => setGeneralSettings(p => ({ ...p, default_currency: e.target.value }))}
                      >
                        <option value="INR">INR (₹) — Indian Rupee</option>
                        <option value="USD">USD ($) — US Dollar</option>
                        <option value="AED">AED (د.إ) — UAE Dirham</option>
                        <option value="EUR">EUR (€) — Euro</option>
                        <option value="GBP">GBP (£) — British Pound</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 3: Business Address, GSTIN & UDYAM */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                        Registered Business Address
                      </label>
                      <textarea
                        className="input-field"
                        rows={4}
                        value={generalSettings.company_address}
                        onChange={e => setGeneralSettings(p => ({ ...p, company_address: e.target.value }))}
                        placeholder="Factory / Office Address, City, State, PIN"
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                          GSTIN / Tax Registration No.
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          value={generalSettings.gstin_number}
                          onChange={e => setGeneralSettings(p => ({ ...p, gstin_number: e.target.value }))}
                          placeholder="e.g. 24AGCPJ2785R1ZV"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                          UDYAM / MSME Registration No.
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          value={generalSettings.company_udyam_reg}
                          onChange={e => setGeneralSettings(p => ({ ...p, company_udyam_reg: e.target.value }))}
                          placeholder="e.g. UDYAM-GJ-01-0012345"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 4: Bank Remittance Details (For Tax Invoices) */}
                  <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                      🏦 Bank Remittance Details (Printed on Invoices & QR Payments)
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Bank Name</label>
                        <input
                          type="text"
                          className="input-field"
                          value={generalSettings.bank_name}
                          onChange={e => setGeneralSettings(p => ({ ...p, bank_name: e.target.value }))}
                          placeholder="e.g. HDFC Bank Ltd."
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Account Number</label>
                        <input
                          type="text"
                          className="input-field"
                          value={generalSettings.bank_account_no}
                          onChange={e => setGeneralSettings(p => ({ ...p, bank_account_no: e.target.value }))}
                          placeholder="e.g. 50200088991122"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>IFSC Code</label>
                        <input
                          type="text"
                          className="input-field"
                          value={generalSettings.bank_ifsc}
                          onChange={e => setGeneralSettings(p => ({ ...p, bank_ifsc: e.target.value }))}
                          placeholder="e.g. HDFC0001234"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>UPI ID (Auto QR)</label>
                        <input
                          type="text"
                          className="input-field"
                          value={generalSettings.upi_id}
                          onChange={e => setGeneralSettings(p => ({ ...p, upi_id: e.target.value }))}
                          placeholder="e.g. shobhareadyplast@okhdfcbank"
                        />
                      </div>
                    </div>

                    {/* Custom QR Code Standee Upload for Primary Profile */}
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {generalSettings.company_qr_code_url ? (
                            <img src={generalSettings.company_qr_code_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          ) : (
                            <QrCode size={20} style={{ opacity: 0.5 }} />
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.76rem', fontWeight: 700 }}>Custom QR Code Standee Image (Optional)</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>If you already have a physical Paytm / PhonePe / BharatPe QR standee, upload its image here.</div>
                        </div>
                      </div>
                      <div>
                        <input
                          ref={qrInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml,image/webp"
                          style={{ display: 'none' }}
                          onChange={handleQrUpload}
                        />
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => qrInputRef.current?.click()}
                          >
                            <Upload size={13} /> {generalSettings.company_qr_code_url ? 'Change QR' : 'Upload Standee QR'}
                          </button>
                          {generalSettings.company_qr_code_url && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => setGeneralSettings(p => ({ ...p, company_qr_code_url: '' }))}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Digital Stamp & Authorized Signature Upload for Tax Invoices & Statements */}
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                      {/* Stamp Card */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', background: 'var(--bg-primary)', padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {generalSettings.company_stamp_url ? (
                              <img src={generalSettings.company_stamp_url} alt="Stamp" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                              <span style={{ fontSize: '1.2rem' }}>💮</span>
                            )}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700 }}>Company Stamp / Seal</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Printed on Invoices & Statements</div>
                          </div>
                        </div>
                        <div>
                          <input
                            ref={stampInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml,image/webp"
                            style={{ display: 'none' }}
                            onChange={handleStampUpload}
                          />
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => stampInputRef.current?.click()}
                              style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                            >
                              <Upload size={12} /> {generalSettings.company_stamp_url ? 'Change' : 'Upload'}
                            </button>
                            {generalSettings.company_stamp_url && (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                style={{ color: 'var(--danger)', fontSize: '0.72rem', padding: '0.2rem 0.4rem' }}
                                onClick={() => setGeneralSettings(p => ({ ...p, company_stamp_url: '' }))}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Signature Card */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', background: 'var(--bg-primary)', padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {generalSettings.authorized_signature_url ? (
                              <img src={generalSettings.authorized_signature_url} alt="Signature" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                              <span style={{ fontSize: '1.2rem' }}>✍️</span>
                            )}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700 }}>Authorized Signature</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Official signatory image</div>
                          </div>
                        </div>
                        <div>
                          <input
                            ref={signatureInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml,image/webp"
                            style={{ display: 'none' }}
                            onChange={handleSignatureUpload}
                          />
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => signatureInputRef.current?.click()}
                              style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                            >
                              <Upload size={12} /> {generalSettings.authorized_signature_url ? 'Change' : 'Upload'}
                            </button>
                            {generalSettings.authorized_signature_url && (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                style={{ color: 'var(--danger)', fontSize: '0.72rem', padding: '0.2rem 0.4rem' }}
                                onClick={() => setGeneralSettings(p => ({ ...p, authorized_signature_url: '' }))}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Row 5: Terms & Conditions */}
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                      Invoice Terms & Conditions / Footer Declaration
                    </label>
                    <textarea
                      className="input-field"
                      rows={2}
                      value={generalSettings.invoice_footer_notes}
                      onChange={e => setGeneralSettings(p => ({ ...p, invoice_footer_notes: e.target.value }))}
                      placeholder="Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days..."
                    />
                  </div>

                  {/* Interface Theme */}
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.75rem' }}>
                      Interface Theme Mode
                    </label>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      {['dark', 'light'].map(t => (
                        <div
                          key={t}
                          onClick={() => theme !== t && toggleTheme()}
                          style={{
                            flex: 1, padding: '1rem', borderRadius: 'var(--radius-md)',
                            border: `2px solid ${theme === t ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                            background: t === 'dark' ? '#0b0d1a' : '#f4f5fb',
                            cursor: 'pointer', textAlign: 'center', transition: 'var(--transition)'
                          }}
                        >
                          <div style={{ fontSize: '1.3rem', marginBottom: '0.2rem' }}>{t === 'dark' ? '🌙' : '☀️'}</div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: t === 'dark' ? 'white' : '#111', textTransform: 'capitalize' }}>
                            {t} Mode
                          </div>
                          {theme === t && (
                            <div style={{ marginTop: '0.3rem' }}>
                              <span className="badge badge-accent" style={{ fontSize: '0.62rem' }}>Active</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Save Action */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveGeneralSettings}
                      disabled={generalSaving}
                    >
                      {generalSaved ? (
                        <><Check size={15} /> Business Profile Saved!</>
                      ) : generalSaving ? (
                        <><RefreshCw size={15} className="animate-spin" /> Saving...</>
                      ) : (
                        <><Save size={15} /> Save General Settings</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 2: FREE-TIER SAFETY & QUOTAS (Section 5, 6, 50F)
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'safety' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Free-Tier Safety & Degraded Modes</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Master Specification Section 6 & 50F: Application-level safety caps to prevent free-tier exhaustion or accidental billing loops.
                  </p>
                </div>
                <span className="badge" style={{
                  background: `${circuitModeColors[safety?.circuit_breaker_mode || 'Normal']}15`,
                  color: circuitModeColors[safety?.circuit_breaker_mode || 'Normal'],
                  border: `1px solid ${circuitModeColors[safety?.circuit_breaker_mode || 'Normal']}40`,
                  fontSize: '0.8rem', fontWeight: 700
                }}>
                  Circuit: {safety?.circuit_breaker_mode || 'Normal'}
                </span>
              </div>

              {/* Circuit Breaker Controls */}
              <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <AlertTriangle size={16} color={circuitModeColors[safety?.circuit_breaker_mode || 'Normal']} /> Circuit Breaker & Resiliency State
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Set manual operating mode to throttle or pause automated jobs during upstream outages.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                  {[
                    { mode: 'Normal', desc: 'All AI & Background workers active' },
                    { mode: 'Warning', desc: 'Batch sizes throttled to 50%' },
                    { mode: 'Degraded', desc: 'AI paused; Human Inbox fallback' },
                    { mode: 'Paused', desc: 'All automated queues paused' },
                  ].map(item => (
                    <button
                      key={item.mode}
                      onClick={() => handleCircuitChange(item.mode)}
                      className="btn"
                      style={{
                        flexDirection: 'column', alignItems: 'flex-start', padding: '0.65rem 0.75rem',
                        border: `1px solid ${safety?.circuit_breaker_mode === item.mode ? circuitModeColors[item.mode] : 'var(--border-color)'}`,
                        background: safety?.circuit_breaker_mode === item.mode ? `${circuitModeColors[item.mode]}15` : 'var(--bg-primary)',
                        color: safety?.circuit_breaker_mode === item.mode ? circuitModeColors[item.mode] : 'var(--text-secondary)',
                        borderRadius: 'var(--radius-md)', cursor: 'pointer'
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{item.mode}</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Service Health Grid */}
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Activity size={16} color="var(--accent-primary)" /> Live Services Health Check (No Single Point of Failure)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  {safety?.services && Object.entries(safety.services).map(([k, s]) => (
                    <div key={k} style={{ padding: '0.85rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{s.name}</span>
                        <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>{s.status}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        <span>Latency: {s.latency_ms}ms</span>
                        <span>Quota: {s.quota_pct}% used</span>
                      </div>
                      <div className="progress-bar-wrap" style={{ height: 4, marginTop: '0.4rem' }}>
                        <div className="progress-bar-fill" style={{ width: `${s.quota_pct}%`, background: s.quota_pct > 80 ? 'var(--danger)' : 'var(--success)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quotas & Budget Config */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    Daily API Request Budget Cap
                  </label>
                  <input
                    type="number"
                    className="input-field"
                    value={safety?.daily_request_limit || 100000}
                    onChange={e => setSafety(p => ({ ...p, daily_request_limit: Number(e.target.value) }))}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Used today: {safety?.daily_requests_used || 0} reqs</span>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    Monthly OpenAI Cost Limit ($ USD)
                  </label>
                  <input
                    type="number"
                    step="5"
                    className="input-field"
                    value={safety?.ai_monthly_budget_usd || 50}
                    onChange={e => setSafety(p => ({ ...p, ai_monthly_budget_usd: Number(e.target.value) }))}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Current month spent: ${safety?.ai_month_spent_usd || 0} USD</span>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    Campaign Batch Size (Rate Pacing)
                  </label>
                  <input
                    type="number"
                    className="input-field"
                    value={safety?.max_campaign_batch_size || 50}
                    onChange={e => setSafety(p => ({ ...p, max_campaign_batch_size: Number(e.target.value) }))}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Recommended: 50-100 to avoid timeouts</span>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    Max AI Messages / Contact / Day
                  </label>
                  <input
                    type="number"
                    className="input-field"
                    value={safety?.ai_messages_per_contact_day || 15}
                    onChange={e => setSafety(p => ({ ...p, ai_messages_per_contact_day: Number(e.target.value) }))}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Auto-hands off to human when exceeded</span>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 3: DATA PORTABILITY & EXPORT (Section 50E Zero Lock-in)
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'export' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Data Portability & Complete Exit Plan</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Master Specification Section 50E: Zero vendor lock-in. You retain 100% ownership of your business data with one-click export at any time.
                </p>
              </div>

              {exportSuccess && (
                <div style={{ padding: '0.85rem', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 'var(--radius-md)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                  <Check size={16} /> Full system backup snapshot downloaded successfully!
                </div>
              )}

              {/* Full JSON Backup */}
              <div style={{ padding: '1.25rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <FileJson size={18} color="var(--accent-primary)" /> Full Business Database Snapshot (JSON)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Includes all CRM Leads, Customers, Deals, Invoices, Tasks, Campaigns, Products, Tally Mappings, and Audit Logs.
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleDownloadFullExport}
                    disabled={downloading}
                  >
                    {downloading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                    {downloading ? 'Exporting...' : 'Download Full Backup (.json)'}
                  </button>
                </div>
              </div>

              {/* Individual Table CSVs */}
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <FileSpreadsheet size={16} color="var(--whatsapp)" /> Modular Live CSV Exports (Spreadsheet Friendly)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  {[
                    { id: 'leads', label: 'CRM Leads & Contacts', desc: 'Name, phone, score, status, budget, intent' },
                    { id: 'customers', label: 'Customers Master', desc: 'Converted customer accounts & GST details' },
                    { id: 'deals', label: 'Deals & Pipeline', desc: 'Deal stages, quotation values, close dates' },
                    { id: 'invoices', label: 'Invoices & Financials', desc: 'Vouchers, amounts, due dates, statuses' },
                    { id: 'campaigns', label: 'WhatsApp Campaigns', desc: 'Broadcast performance & attribution logs' },
                    { id: 'tally_mappings', label: 'Tally Ledger Mappings', desc: 'Ledger names, confidence scores, customer IDs' },
                  ].map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{t.label}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.desc}</div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleDownloadCsv(t.id)}>
                        <Download size={12} /> CSV
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Google Sheets Formula Feed Guide */}
              <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <FileSpreadsheet size={16} color="var(--whatsapp)" /> Google Sheets =IMPORTDATA Direct Live Sync
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  You can paste these formulas into any Google Sheet to create live auto-refreshing tabs without writing scripts:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {[
                    { tab: 'campaign_summary', name: 'Campaign Summary Tab' },
                    { tab: 'qualified_leads', name: 'Qualified Leads Tab' },
                    { tab: 'hot_leads', name: 'Hot Leads Tab' },
                    { tab: 'daily_ai_activity', name: 'Daily AI Activity Tab' },
                  ].map(item => (
                    <div key={item.tab} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.65rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', fontSize: '0.74rem' }}>
                      <span style={{ fontWeight: 600 }}>{item.name}:</span>
                      <code style={{ background: 'none', padding: 0, color: 'var(--accent-primary)', fontSize: '0.7rem' }}>
                        =IMPORTDATA("{window.location.origin}/.netlify/functions/sheets-sync?tab={item.tab}&format=csv")
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB: META LEADS (FACEBOOK & INSTAGRAM LEAD ADS)
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'meta_leads' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#1877f2' }}>📘 Facebook</span> & <span style={{ color: '#e1306c' }}>📸 Instagram</span> Lead Ads Engine
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                    Real-time webhook ingestion for Instant Forms, Story Ads, Reels Lead Ads, and Meta Graph API.
                  </p>
                </div>
                <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
                  Meta Webhook Active
                </span>
              </div>

              {/* Webhook Connection Guide Card */}
              <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Share2 size={16} color="var(--accent-primary)" /> Meta Webhook Endpoints & Handshake Credentials
                </div>
                <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  In your <strong>Meta App Dashboard (developers.facebook.com)</strong> &gt; <strong>Webhooks</strong> &gt; Select <strong>Page</strong> &gt; Subscribe to <code>leadgen</code>:
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600 }}>CALLBACK / WEBHOOK URL:</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <code style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {window.location.origin}/.netlify/functions/meta-leads-webhook
                      </code>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.68rem', whiteSpace: 'nowrap' }}
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/.netlify/functions/meta-leads-webhook`);
                          setCopiedWebhook(true);
                          setTimeout(() => setCopiedWebhook(false), 2500);
                        }}
                      >
                        {copiedWebhook ? '✓ Copied' : 'Copy URL'}
                      </button>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600 }}>VERIFY TOKEN:</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <code style={{ fontSize: '0.72rem', color: 'var(--accent-primary)' }}>
                        erppro_meta_sec_token_2026
                      </code>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.68rem', whiteSpace: 'nowrap' }}
                        onClick={() => {
                          navigator.clipboard.writeText('erppro_meta_sec_token_2026');
                          setCopiedToken(true);
                          setTimeout(() => setCopiedToken(false), 2500);
                        }}
                      >
                        {copiedToken ? '✓ Copied' : 'Copy Token'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Meta Account Credentials Grid */}
              <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    Meta Ads Account Credentials
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleSaveMetaConfig}
                    disabled={metaConfigSaving}
                  >
                    {metaConfigSaved ? <><Check size={14} /> Saved!</> : metaConfigSaving ? <><RefreshCw size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> Save Meta Credentials</>}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Facebook Page ID / Name</label>
                    <input
                      type="text"
                      className="input-field"
                      value={metaConfig.fb_page_id}
                      onChange={e => setMetaConfig(p => ({ ...p, fb_page_id: e.target.value }))}
                      placeholder="e.g. SobhaInfra Tech (Page ID: 1048293482)"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Instagram Business Handle / ID</label>
                    <input
                      type="text"
                      className="input-field"
                      value={metaConfig.ig_handle}
                      onChange={e => setMetaConfig(p => ({ ...p, ig_handle: e.target.value }))}
                      placeholder="e.g. @sobhainfra_official"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Meta System User Graph API Token</label>
                    <input
                      type="password"
                      className="input-field"
                      value={metaConfig.meta_token}
                      onChange={e => setMetaConfig(p => ({ ...p, meta_token: e.target.value }))}
                      placeholder="••••••••••••••••••••••••••"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Default Lead Assignee for Social Ads</label>
                    <select
                      className="input-field"
                      value={metaConfig.default_assignee}
                      onChange={e => setMetaConfig(p => ({ ...p, default_assignee: e.target.value }))}
                    >
                      <option value="Round Robin Distribution">Round Robin Distribution</option>
                      <option value="Rajesh Kumar (Sales Executive)">Rajesh Kumar (Sales Executive)</option>
                      <option value="Priya Sharma (Manager)">Priya Sharma (Manager)</option>
                      <option value="Anand Sharma (Sales Executive)">Anand Sharma (Sales Executive)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* LIVE INTERACTIVE META LEAD SIMULATOR */}
              <div style={{
                padding: '1.25rem',
                background: 'linear-gradient(135deg, rgba(24,119,242,0.06) 0%, rgba(225,48,108,0.06) 100%)',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid rgba(24,119,242,0.3)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <Sparkles size={16} color="#1877f2" /> Interactive Facebook & Instagram Lead Simulator
                  </div>
                  <span className="badge badge-accent" style={{ fontSize: '0.65rem' }}>Instant CRM Push</span>
                </div>
                <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.9rem' }}>
                  Simulate an incoming lead submission from Facebook Instant Forms or Instagram Ads to test real-time capture and phone normalization.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '0.85rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Lead Name</label>
                    <input
                      type="text"
                      className="input-field"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
                      value={simLead.name}
                      onChange={e => setSimLead(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Rohit Kulkarni"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Phone (+91 is optional)</label>
                    <input
                      type="text"
                      className="input-field"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
                      value={simLead.phone}
                      onChange={e => setSimLead(p => ({ ...p, phone: e.target.value }))}
                      placeholder="9822334455 (or +91...)"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Email Address</label>
                    <input
                      type="email"
                      className="input-field"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
                      value={simLead.email}
                      onChange={e => setSimLead(p => ({ ...p, email: e.target.value }))}
                      placeholder="rohit@example.com"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Interested Product</label>
                    <input
                      type="text"
                      className="input-field"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
                      value={simLead.product}
                      onChange={e => setSimLead(p => ({ ...p, product: e.target.value }))}
                      placeholder="e.g. Waterproofing Compound"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Budget / Deal Size</label>
                    <input
                      type="text"
                      className="input-field"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
                      value={simLead.budget}
                      onChange={e => setSimLead(p => ({ ...p, budget: e.target.value }))}
                      placeholder="e.g. ₹85,000"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Ad Campaign Notes</label>
                    <input
                      type="text"
                      className="input-field"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
                      value={simLead.notes}
                      onChange={e => setSimLead(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Campaign name / Form details"
                    />
                  </div>
                </div>

                {/* Simulator Action Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={simulating}
                    onClick={() => handleSimulateMetaLead('Facebook')}
                    style={{
                      background: '#1877f2',
                      color: 'white',
                      fontSize: '0.78rem',
                      padding: '0.45rem 0.9rem',
                      fontWeight: 600,
                    }}
                  >
                    <Send size={13} /> {simulating ? 'Ingesting...' : '⚡ Send Test Facebook Lead'}
                  </button>

                  <button
                    type="button"
                    className="btn"
                    disabled={simulating}
                    onClick={() => handleSimulateMetaLead('Instagram')}
                    style={{
                      background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                      color: 'white',
                      fontSize: '0.78rem',
                      padding: '0.45rem 0.9rem',
                      fontWeight: 600,
                    }}
                  >
                    <Send size={13} /> {simulating ? 'Ingesting...' : '⚡ Send Test Instagram Lead'}
                  </button>

                  {simResult && (
                    <span style={{ fontSize: '0.76rem', color: simResult.success ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                      {simResult.message}
                    </span>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 4: WHATSAPP CONFIG
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'whatsapp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>WhatsApp Business API Configuration</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                    Configure Meta WhatsApp Cloud API credentials for automated templates, chatbots, and broadcast campaigns.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveWhatsAppConfig}
                  disabled={waConfigSaving}
                >
                  {waConfigSaved ? <><Check size={14} /> Saved!</> : waConfigSaving ? <><RefreshCw size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> Save WhatsApp Config</>}
                </button>
              </div>

              <div style={{ padding: '1rem', background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--warning)', fontSize: '0.82rem', color: 'var(--warning)' }}>
                ℹ️ <strong>Zero Cost Setup:</strong> Configured via Meta WhatsApp Cloud API free tier (1,000 free service conversations/month).
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Phone Number ID</label>
                <input
                  type="text"
                  className="input-field"
                  value={whatsappConfig.phone_number_id}
                  onChange={e => setWhatsappConfig(p => ({ ...p, phone_number_id: e.target.value }))}
                  placeholder="Meta Phone Number ID (e.g. 1217775984755724)"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>WhatsApp Business Account ID (WABA)</label>
                <input
                  type="text"
                  className="input-field"
                  value={whatsappConfig.waba_id}
                  onChange={e => setWhatsappConfig(p => ({ ...p, waba_id: e.target.value }))}
                  placeholder="WABA ID from Meta Business Suite"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Access Token (Permanent System User Token)</label>
                <input
                  type="password"
                  className="input-field"
                  value={whatsappConfig.access_token}
                  onChange={e => setWhatsappConfig(p => ({ ...p, access_token: e.target.value }))}
                  placeholder="••••••••••••••••••••••••••"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Webhook Verify Token</label>
                <input
                  type="text"
                  className="input-field"
                  value={whatsappConfig.verify_token}
                  onChange={e => setWhatsappConfig(p => ({ ...p, verify_token: e.target.value }))}
                  placeholder="Custom verify token for webhook"
                />
              </div>

              <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                📖 Webhook URL for Meta Dashboard: <code>{window.location.origin}/.netlify/functions/whatsapp-webhook</code>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 5: TALLY CONFIG
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'tally' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>TallyPrime On-Premise Integration Settings</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                    Configure local connector host, XML port, and authentication secret for Tally voucher synchronization.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveTallyConfig}
                  disabled={tallyConfigSaving}
                >
                  {tallyConfigSaved ? <><Check size={14} /> Saved!</> : tallyConfigSaving ? <><RefreshCw size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> Save Tally Config</>}
                </button>
              </div>

              <div style={{ padding: '1rem', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--info)', fontSize: '0.82rem', color: 'var(--info)' }}>
                ℹ️ <strong>Connector Status:</strong> Run <code>python tally-sync.py</code> or <code>start_sync.bat</code> on the Windows machine running TallyPrime (Port 9000).
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Tally Server Host</label>
                  <input
                    type="text"
                    className="input-field"
                    value={tallyConfig.host}
                    onChange={e => setTallyConfig(p => ({ ...p, host: e.target.value }))}
                    placeholder="127.0.0.1 or LAN IP"
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Tally XML Port</label>
                  <input
                    type="text"
                    className="input-field"
                    value={tallyConfig.port}
                    onChange={e => setTallyConfig(p => ({ ...p, port: e.target.value }))}
                    placeholder="9000"
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Default Company Name (in Tally)</label>
                  <input
                    type="text"
                    className="input-field"
                    value={tallyConfig.company_name}
                    onChange={e => setTallyConfig(p => ({ ...p, company_name: e.target.value }))}
                    placeholder="Exact company name in Tally"
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Connector Secret Token</label>
                  <input
                    type="text"
                    className="input-field"
                    value={tallyConfig.secret_token}
                    onChange={e => setTallyConfig(p => ({ ...p, secret_token: e.target.value }))}
                    placeholder="Secret auth token"
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Auto-Sync Frequency</label>
                <select
                  className="input-field"
                  value={tallyConfig.auto_sync}
                  onChange={e => setTallyConfig(p => ({ ...p, auto_sync: e.target.value }))}
                >
                  <option value="Every 5 minutes (Real-time)">Every 5 minutes (Real-time)</option>
                  <option value="Every 15 minutes">Every 15 minutes</option>
                  <option value="Every 1 hour">Every 1 hour</option>
                  <option value="Every 6 hours">Every 6 hours</option>
                  <option value="Manual only">Manual only</option>
                </select>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 6: NOTIFICATIONS
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Notification Preferences</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                    Control automated alert notifications across operational events.
                  </p>
                </div>
                {notifSaved && (
                  <span className="badge badge-success animate-fade-in" style={{ fontSize: '0.75rem' }}>
                    <Check size={12} /> Saved Automatically
                  </span>
                )}
              </div>

              {[
                { key: 'new_lead', label: 'New Lead Added', desc: 'Notify when a new lead is captured from WhatsApp, Web or Meta Ads' },
                { key: 'payment_overdue', label: 'Payment Overdue Alert', desc: 'Daily summary alert for overdue invoices synced from Tally' },
                { key: 'campaign_complete', label: 'WhatsApp Campaign Complete', desc: 'Notify when a broadcast batch finishes delivering to contacts' },
                { key: 'ai_handoff', label: 'AI Human Handoff Alert', desc: 'Instant alert when a client requests a human salesperson or discount' },
                { key: 'tally_disconnect', label: 'Tally Sync Disconnection Alert', desc: 'Alert if local connector fails its scheduled heartbeat check' },
              ].map(n => {
                const isEnabled = notifPreferences[n.key] !== false;
                return (
                  <div key={n.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.85rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{n.label}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{n.desc}</div>
                    </div>
                    <div
                      onClick={() => handleToggleNotif(n.key)}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      {isEnabled ? (
                        <ToggleRight size={36} color="var(--success)" />
                      ) : (
                        <ToggleLeft size={36} color="var(--text-muted)" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 7: SECURITY & AUTH
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Security, Access & Tenant Isolation</h3>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Current Password</label>
                <input type="password" className="input-field" placeholder="••••••••" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>New Password</label>
                <input type="password" className="input-field" placeholder="Minimum 8 characters" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Confirm New Password</label>
                <input type="password" className="input-field" placeholder="Repeat new password" />
              </div>
              <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.75rem' }}>Row-Level Security (RLS) Status</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  Tenant multi-tenancy isolation is enforced at the database layer via Supabase RLS on all 16 tables.
                </div>
                <span className="badge badge-success">RLS Active (Org ID Enforced)</span>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              TAB: AI KNOWLEDGE BASE (Section 17 — Dynamic AI context editor)
             ════════════════════════════════════════════════════════════════ */}
          {activeTab === 'ai_kb' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Brain size={18} color="var(--accent-primary)" /> AI Knowledge Base
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    All knowledge items below are used by the AI Sales Assistant to answer customer queries. The AI will never invent prices or policies — it only uses what you configure here.
                  </p>
                </div>
                <button className="btn btn-primary" onClick={() => { setEditingKb('new'); setKbForm({ category: 'Properties', title: '', content: '', status: 'active' }); }}>
                  <Plus size={14} /> Add Knowledge
                </button>
              </div>

              {kbSuccess && (
                <div style={{ padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.12)', border: '1px solid var(--success)', borderRadius: 8, color: 'var(--success)', fontSize: '0.82rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <CheckCircle2 size={15} /> {kbSuccess}
                </div>
              )}

              {/* Add / Edit Form */}
              {editingKb && (
                <div className="glass-card" style={{ border: '1px solid var(--accent-primary)', padding: '1.25rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--accent-primary)' }}>
                    {editingKb === 'new' ? '➕ Add New Knowledge Item' : '✏️ Edit Knowledge Item'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Category</label>
                      <select className="input-field" style={{ fontSize: '0.8rem' }} value={kbForm.category} onChange={e => setKbForm(p => ({ ...p, category: e.target.value }))}>
                        {KB_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Title</label>
                      <input className="input-field" style={{ fontSize: '0.8rem' }} placeholder="e.g. 3BHK Andheri Pricing" value={kbForm.title} onChange={e => setKbForm(p => ({ ...p, title: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Content (what the AI will say)</label>
                    <textarea
                      className="input-field"
                      style={{ fontSize: '0.8rem', minHeight: 100, resize: 'vertical' }}
                      placeholder="e.g. Base Price: ₹95 Lakhs for 1,450 sq.ft. Includes 1 parking. Floor rise: ₹50,000/floor. GST extra."
                      value={kbForm.content}
                      onChange={e => setKbForm(p => ({ ...p, content: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setEditingKb(null)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleKbSave} disabled={kbSaving || !kbForm.title || !kbForm.content}>
                      {kbSaving ? <><RefreshCw size={13} className="animate-spin" /> Saving…</> : <><Save size={13} /> Save Knowledge</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Knowledge Items Table */}
              {kbLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}><RefreshCw size={22} className="animate-spin" /></div>
              ) : kbItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <BookOpen size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                  <div style={{ fontWeight: 600 }}>No knowledge items yet</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Click "Add Knowledge" to configure what the AI knows about your business.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {kbItems.map(item => (
                    <div key={item.id} style={{ padding: '0.85rem 1rem', background: 'var(--bg-secondary)', borderRadius: 8, border: `1px solid ${item.status === 'active' ? 'rgba(16,185,129,0.2)' : 'var(--border-color)'}`, display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'start' }}>
                      <div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <span className="badge" style={{ fontSize: '0.6rem', background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)' }}>{item.category}</span>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{item.title}</span>
                          <span className={`badge ${item.status === 'active' ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.6rem' }}>{item.status}</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.content}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleKbToggleStatus(item)} title={item.status === 'active' ? 'Disable' : 'Enable'}>
                          {item.status === 'active' ? <ToggleRight size={14} color="var(--success)" /> : <ToggleLeft size={14} />}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleKbEdit(item)}><Edit3 size={13} /></button>
                        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleKbDelete(item.id)}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ padding: '0.75rem 1rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                💡 <strong>Tip:</strong> The AI refreshes its knowledge every 5 minutes. After saving, send a test WhatsApp message to verify the AI uses your new content.
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 9: ROLES & POSITIONS (Super Admin Organization Control)
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'roles_positions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Organization Roles & Positions</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                    Configure employee positions, custom designations, and grant/restrict module access.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary btn-sm" onClick={loadRolesAndMatrix}>
                    <RefreshCw size={13} className={posLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowAddPositionModal(true)}>
                    <Plus size={13} /> Add Position
                  </button>
                </div>
              </div>

              {/* Positions Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                {rolesList.map(role => {
                  const memberCount = teamMembersList.filter(m => m.role === role.name).length;
                  const isDisabled = Boolean(role.is_disabled);

                  return (
                    <div key={role.id || role.name} style={{
                      padding: '1rem', borderRadius: 10,
                      background: isDisabled ? 'rgba(255,255,255,0.02)' : 'var(--bg-secondary)',
                      border: `1px solid ${role.color || '#6366f1'}${isDisabled ? '15' : '40'}`,
                      opacity: isDisabled ? 0.6 : 1, transition: 'all 0.2s', position: 'relative'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: isDisabled ? 'var(--text-muted)' : (role.color || 'var(--text-primary)') }}>
                          {role.name}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          {/* Pencil Edit Icon */}
                          <button
                            className="btn-icon"
                            style={{ color: 'var(--accent-primary)', padding: 3 }}
                            title="Edit / Rename Position"
                            onClick={() => {
                              setEditingPosition(role);
                              setEditPositionForm({
                                name: role.name,
                                description: role.description || '',
                                color: role.color || '#6366f1'
                              });
                            }}
                          >
                            <Edit3 size={13} />
                          </button>

                          {/* Toggle Active / Disabled switch with Dual Confirmation */}
                          {role.name !== 'Super Admin' && (
                            <button
                              className="btn-icon"
                              style={{ color: isDisabled ? 'var(--text-muted)' : 'var(--success)', padding: 3 }}
                              title={isDisabled ? 'Activate Position' : 'Disable / Pause Position'}
                              onClick={async () => {
                                if (!isDisabled) {
                                  // Open dual confirmation modal before disabling
                                  setConfirmDisableRole(role);
                                } else {
                                  // Directly re-enable
                                  await updateRole(role.id, { is_disabled: false });
                                  setRolesList(prev => prev.map(r => r.id === role.id ? { ...r, is_disabled: false } : r));
                                  setPosSuccessMsg(`Position "${role.name}" activated!`);
                                  setTimeout(() => setPosSuccessMsg(''), 3500);
                                }
                              }}
                            >
                              {isDisabled ? <ToggleLeft size={16} /> : <ToggleRight size={16} />}
                            </button>
                          )}

                          {/* Delete Custom Position */}
                          {!role.is_system && role.name !== 'Super Admin' && (
                            <button
                              className="btn-icon"
                              style={{ color: 'var(--danger)', padding: 3 }}
                              title="Delete Position"
                              onClick={async () => {
                                if (!window.confirm(`Delete position "${role.name}"?`)) return;
                                await deleteRole(role.id);
                                setRolesList(prev => prev.filter(r => r.id !== role.id));
                                setSettingsMatrix(prev => { const copy = { ...prev }; delete copy[role.name]; return copy; });
                                setPosSuccessMsg(`Position "${role.name}" deleted.`);
                                setTimeout(() => setPosSuccessMsg(''), 3000);
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
                        {role.description || (role.is_system ? 'Standard System Position' : 'Custom Organization Position')}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="badge" style={{ fontSize: '0.62rem', background: (role.color || '#6366f1') + '22', color: role.color || '#6366f1' }}>
                          {memberCount} Active Member{memberCount === 1 ? '' : 's'}
                        </span>
                        <span className={`badge ${isDisabled ? 'badge-neutral' : 'badge-success'}`} style={{ fontSize: '0.6rem' }}>
                          {isDisabled ? 'Disabled' : 'Active'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Interactive Permission Matrix */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <h4 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0 }}>Role Permission Matrix</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Check or uncheck permissions to grant or revoke module access for each position.
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        const defaultMx = {
                          'Super Admin': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: true, Finance: true, Reports: true, Roles: true, FieldOps: true },
                          'Manager':     { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: true, Finance: true, Reports: true, Roles: false, FieldOps: true },
                          'Sales Executive': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: false, Finance: false, Reports: false, Roles: false, FieldOps: true },
                          'Accounts':    { Dashboard: true, WhatsApp: false, CRM: false, Tasks: false, Payments: true, Finance: true, Reports: true, Roles: false, FieldOps: false },
                          'Support Agent': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: false, Finance: false, Reports: false, Roles: false, FieldOps: false },
                        };
                        setSettingsMatrix(defaultMx);
                        await savePermissionMatrix(defaultMx);
                        setPosSuccessMsg('Permissions reset to defaults.');
                        setTimeout(() => setPosSuccessMsg(''), 3000);
                      }}
                    >
                      Reset Defaults
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={async () => {
                        await savePermissionMatrix(settingsMatrix);
                        setMatrixDirty(false);
                        setPosSuccessMsg('Permission matrix saved to cloud!');
                        setTimeout(() => setPosSuccessMsg(''), 4000);
                      }}
                    >
                      <Save size={13} /> Save Permissions {matrixDirty && '●'}
                    </button>
                  </div>
                </div>

                <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%', textAlign: 'center' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)' }}>
                        <th style={{ textAlign: 'left', minWidth: 140, padding: '0.65rem 0.85rem' }}>Module</th>
                        {rolesList.map(r => {
                          const isRoleDisabled = Boolean(r.is_disabled);
                          return (
                            <th key={r.id || r.name} style={{ padding: '0.65rem 0.5rem', minWidth: 110, opacity: isRoleDisabled ? 0.65 : 1 }}>
                              <div style={{ color: isRoleDisabled ? 'var(--text-muted)' : (r.color || 'var(--accent-primary)'), fontWeight: 700, fontSize: '0.78rem' }}>
                                {r.name}
                              </div>
                              {isRoleDisabled && (
                                <span className="badge badge-neutral" style={{ fontSize: '0.55rem', padding: '0.1rem 0.35rem', marginTop: '0.15rem' }}>
                                  PAUSED
                                </span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {['Dashboard', 'WhatsApp', 'CRM', 'Tasks', 'Payments', 'Finance', 'Reports', 'Roles', 'FieldOps'].map(mod => (
                        <tr key={mod}>
                          <td style={{ textAlign: 'left', fontWeight: 600, padding: '0.55rem 0.85rem', fontSize: '0.82rem' }}>
                            {mod}
                          </td>
                          {rolesList.map(r => {
                            const isSuperAdmin = r.name === 'Super Admin';
                            const currentRolePerms = settingsMatrix[r.name] || {};
                            const hasAccess = isSuperAdmin || Boolean(currentRolePerms[mod]);
                            return (
                              <td
                                key={r.id || r.name}
                                style={{ padding: '0.55rem 0.5rem', cursor: isSuperAdmin ? 'default' : 'pointer' }}
                                onClick={() => {
                                  if (isSuperAdmin) return;
                                  setSettingsMatrix(prev => {
                                    const updated = {
                                      ...prev,
                                      [r.name]: {
                                        ...(prev[r.name] || {}),
                                        [mod]: !hasAccess,
                                      }
                                    };
                                    setMatrixDirty(true);
                                    return updated;
                                  });
                                }}
                              >
                                {isSuperAdmin ? (
                                  <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 700 }}>Always</span>
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={hasAccess}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      setSettingsMatrix(prev => {
                                        const updated = {
                                          ...prev,
                                          [r.name]: {
                                            ...(prev[r.name] || {}),
                                            [mod]: e.target.checked,
                                          }
                                        };
                                        setMatrixDirty(true);
                                        return updated;
                                      });
                                    }}
                                    onClick={e => e.stopPropagation()}
                                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: r.color || 'var(--accent-primary)' }}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add Position Modal */}
              {showAddPositionModal && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddPositionModal(false); }}>
                  <div className="modal-content animate-fade-in" style={{ maxWidth: 440 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Add New Position / Role</h3>
                      <button className="modal-close-btn" onClick={() => setShowAddPositionModal(false)}>✕</button>
                    </div>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newPositionForm.name.trim()) return;
                      const { data } = await createRole(newPositionForm);
                      if (data) {
                        setRolesList(prev => [...prev, data]);
                        setSettingsMatrix(prev => ({
                          ...prev,
                          [data.name]: { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: false, Finance: false, Reports: false, Roles: false, FieldOps: false }
                        }));
                        setMatrixDirty(true);
                        setShowAddPositionModal(false);
                        setNewPositionForm({ name: '', description: '', color: '#6366f1' });
                        setPosSuccessMsg(`Position "${data.name}" created!`);
                        setTimeout(() => setPosSuccessMsg(''), 3000);
                      }
                    }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Position Title *</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="e.g. Senior Site Supervisor, Telecaller"
                          value={newPositionForm.name}
                          onChange={e => setNewPositionForm(p => ({ ...p, name: e.target.value }))}
                          required
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Badge Color</label>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899'].map(c => (
                            <div
                              key={c}
                              onClick={() => setNewPositionForm(p => ({ ...p, color: c }))}
                              style={{
                                width: 24, height: 24, borderRadius: '50%', background: c,
                                cursor: 'pointer', border: newPositionForm.color === c ? '2px solid white' : '2px solid transparent',
                                transform: newPositionForm.color === c ? 'scale(1.15)' : 'none', transition: 'all 0.15s'
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Description / Designation Scope</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="e.g. Handles on-site visits and client inspections"
                          value={newPositionForm.description}
                          onChange={e => setNewPositionForm(p => ({ ...p, description: e.target.value }))}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button type="button" className="btn btn-secondary" onClick={() => setShowAddPositionModal(false)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={!newPositionForm.name.trim()}>Create Position</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Edit Position Modal (Rename, Change Color & Description) */}
              {editingPosition && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditingPosition(null); }}>
                  <div className="modal-content animate-fade-in" style={{ maxWidth: 460 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Edit Position / Role</h3>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Customize title, color badge and description</div>
                      </div>
                      <button className="modal-close-btn" onClick={() => setEditingPosition(null)}>✕</button>
                    </div>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!editPositionForm.name.trim()) return;
                      const oldName = editingPosition.name;
                      const newName = editPositionForm.name.trim();

                      const { data } = await updateRole(editingPosition.id, {
                        name: newName,
                        description: editPositionForm.description,
                        color: editPositionForm.color
                      });

                      // Update local state
                      setRolesList(prev => prev.map(r => r.id === editingPosition.id ? { ...r, ...editPositionForm, name: newName } : r));

                      // If name changed, migrate matrix mapping
                      if (oldName !== newName) {
                        setSettingsMatrix(prev => {
                          const copy = { ...prev };
                          if (copy[oldName]) {
                            copy[newName] = copy[oldName];
                            delete copy[oldName];
                          }
                          return copy;
                        });
                        setMatrixDirty(true);
                      }

                      setPosSuccessMsg(`Position "${newName}" updated successfully!`);
                      setEditingPosition(null);
                      setTimeout(() => setPosSuccessMsg(''), 3000);
                    }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Position Title / Designation *</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="e.g. Senior Project Director"
                          value={editPositionForm.name}
                          onChange={e => setEditPositionForm(p => ({ ...p, name: e.target.value }))}
                          required
                        />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'block' }}>
                          Renaming this position will update it across team members and permissions.
                        </span>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Badge Color</label>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#3b82f6'].map(c => (
                            <div
                              key={c}
                              onClick={() => setEditPositionForm(p => ({ ...p, color: c }))}
                              style={{
                                width: 26, height: 26, borderRadius: '50%', background: c,
                                cursor: 'pointer', border: editPositionForm.color === c ? '3px solid white' : '2px solid transparent',
                                transform: editPositionForm.color === c ? 'scale(1.15)' : 'none', transition: 'all 0.15s'
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Responsibilities / Description</label>
                        <textarea
                          className="input-field textarea-field"
                          rows={2}
                          placeholder="e.g. Manages overall sales pipeline and field team"
                          value={editPositionForm.description}
                          onChange={e => setEditPositionForm(p => ({ ...p, description: e.target.value }))}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button type="button" className="btn btn-secondary" onClick={() => setEditingPosition(null)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={!editPositionForm.name.trim()}>Save Changes</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
              {/* Dual Confirmation Modal: Disable Role / Position */}
              {confirmDisableRole && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmDisableRole(null); }} style={{ zIndex: 9999 }}>
                  <div className="modal-content animate-fade-in" style={{ maxWidth: 440, padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%', background: 'rgba(239,68,68,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)'
                      }}>
                        <AlertTriangle size={20} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Disable "{confirmDisableRole.name}"?</h3>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Action confirmation required</span>
                      </div>
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                      Are you sure you want to temporarily disable the <strong>{confirmDisableRole.name}</strong> position? Active employees assigned to this role will have restricted module access until you re-enable it.
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setConfirmDisableRole(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ background: 'var(--danger)', color: 'white', borderColor: 'var(--danger)', fontWeight: 700 }}
                        onClick={async () => {
                          const targetRole = confirmDisableRole;
                          setConfirmDisableRole(null);
                          await updateRole(targetRole.id, { is_disabled: true });
                          setRolesList(prev => prev.map(r => r.id === targetRole.id ? { ...r, is_disabled: true } : r));
                          setPosSuccessMsg(`Position "${targetRole.name}" disabled / paused.`);
                          setTimeout(() => setPosSuccessMsg(''), 3500);
                        }}
                      >
                        Yes, Disable Position
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Fixed Floating Toast (Zero Layout Shift) ──────────────────── */}
      {(posSuccessMsg || storageToast) && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.96)', border: '1px solid rgba(16,185,129,0.5)',
          boxShadow: '0 15px 35px rgba(0,0,0,0.55), 0 0 20px rgba(16,185,129,0.15)',
          backdropFilter: 'blur(12px)', padding: '0.75rem 1.25rem', borderRadius: 10,
          color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.6rem',
          fontSize: '0.85rem', fontWeight: 600, animation: 'slideUp 0.25s ease'
        }}>
          <Check size={16} />
          <span>{posSuccessMsg || storageToast}</span>
          <button
            onClick={() => { setPosSuccessMsg(''); setStorageToast(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0 0 0.4rem', display: 'flex' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 8+ DAYS STORAGE RETENTION WARNING MODAL (As Requested by User) */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {showRetentionWarningModal && (
        <div className="modal-overlay" onClick={() => setShowRetentionWarningModal(false)} style={{ zIndex: 99999 }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 520, padding: '1.5rem', border: '1.5px solid var(--warning)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertOctagon size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--warning)' }}>
                  ⚠️ Storage Capacity Warning (8+ Days Retention)
                </h3>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Supabase Free-Tier Resource Quota Notice
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <p style={{ margin: 0 }}>
                You are setting your automated storage retention to <strong>{pendingRetentionDays} Days</strong>.
              </p>
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.08)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.78rem' }}>
                <strong>Critical System Impact:</strong>
                <ul style={{ margin: '0.35rem 0 0 1rem', padding: 0 }}>
                  <li>On the Supabase Free Tier (500 MB limit), retaining WhatsApp media, photos, and high-frequency audit logs for 8+ days can quickly exhaust your storage capacity.</li>
                  <li><strong>If storage fills up 100%</strong>, PostgreSQL will reject new database writes, causing incoming Meta WhatsApp leads, customer messages, and invoice syncs to fail.</li>
                  <li><strong>Recommended Setting:</strong> 7 Days provides continuous peak performance with zero risk of database lockouts.</li>
                </ul>
              </div>
              <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Do you still wish to proceed with {pendingRetentionDays} days retention?
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setStorageRetentionDays(7);
                  setShowRetentionWarningModal(false);
                }}
                style={{ fontWeight: 600 }}
              >
                Stick to 7 Days (Recommended)
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: 'var(--warning)', color: '#000', fontWeight: 800 }}
                onClick={handleConfirmHighRetention}
              >
                I Understand the Risks, Set to {pendingRetentionDays} Days
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* REAL STORAGE PURGE CONFIRMATION MODAL */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {purgeConfirmModal && (
        <div className="modal-overlay" onClick={() => !purgingKey && setPurgeConfirmModal(null)} style={{ zIndex: 99999 }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 480, padding: '1.5rem', border: '1.5px solid var(--danger)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--danger)' }}>
                  Confirm Permanent Storage Purge
                </h3>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Actual Deletion in Supabase PostgreSQL & Storage
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 0.5rem 0' }}>
                Are you sure you want to permanently delete records and files older than <strong>{storageRetentionDays} days</strong> from <strong>{purgeConfirmModal.name}</strong>?
              </p>
              <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.75rem', color: 'var(--danger)' }}>
                <strong>⚠️ Warning:</strong> This operation sends live DELETE queries to your Supabase tables and unlinks bucket objects. This action cannot be rolled back.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={Boolean(purgingKey)}
                onClick={() => setPurgeConfirmModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                disabled={Boolean(purgingKey)}
                style={{ background: 'var(--danger)', color: 'white', fontWeight: 800 }}
                onClick={handleExecutePurge}
              >
                {purgingKey ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>{purgingKey ? 'Executing Deletion...' : 'Yes, Purge Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          COMPANY PROFILE CREATE / EDIT MODAL
         ═════════════════════════════════════════════════════════════════════ */}
      {companyModalOpen && (
        <div className="modal-overlay" onClick={() => setCompanyModalOpen(false)} style={{ background: 'rgba(0,0,0,0.8)', zIndex: 9999 }}>
          <div
            style={{
              position: 'relative',
              maxWidth: 720,
              width: '92%',
              maxHeight: '90vh',
              background: 'var(--bg-secondary)',
              borderRadius: 14,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1rem' }}>
                <Building2 size={18} color="var(--accent-primary)" />
                <span>{editingCompany.id ? 'Edit Company Profile' : 'Add New Company Profile'}</span>
              </div>
              <button className="modal-close-btn" onClick={() => setCompanyModalOpen(false)}>✕</button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveCompanyModal} style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Logo Uploader */}
              <div style={{ padding: '0.85rem', background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>
                  Company Brand Logo
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{
                    width: 60, height: 60, borderRadius: 10, border: '2px dashed var(--border-color)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)',
                    overflow: 'hidden'
                  }}>
                    {editingCompany.company_logo_url ? (
                      <img src={editingCompany.company_logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <Building2 size={22} style={{ opacity: 0.5 }} />
                    )}
                  </div>
                  <div>
                    <input
                      ref={companyModalLogoRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      style={{ display: 'none' }}
                      onChange={handleCompanyLogoUpload}
                    />
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => companyModalLogoRef.current?.click()}
                      >
                        <Upload size={13} /> {editingCompany.company_logo_url ? 'Change Logo' : 'Upload Logo'}
                      </button>
                      {editingCompany.company_logo_url && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => setEditingCompany(p => ({ ...p, company_logo_url: '' }))}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Permanently protected from storage cleanup.
                    </div>
                  </div>
                </div>
              </div>

              {/* Company Legal Name & Tally Aliases */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                    Official Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="input-field"
                    value={editingCompany.company_name}
                    onChange={e => setEditingCompany(p => ({ ...p, company_name: e.target.value }))}
                    placeholder="e.g. SHOBHA ENTERPRISES"
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                    Tally Alias Names (comma-separated)
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingCompany.alias_names}
                    onChange={e => setEditingCompany(p => ({ ...p, alias_names: e.target.value }))}
                    placeholder="e.g. SHOBHA ENTERPRISES, SE, SRP"
                  />
                  <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Used by Tally sync to auto-match vouchers.</span>
                </div>
              </div>

              {/* GSTIN & UDYAM */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                    GSTIN Number
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingCompany.gstin_number}
                    onChange={e => setEditingCompany(p => ({ ...p, gstin_number: e.target.value }))}
                    placeholder="27AABCS9988P1Z3"
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                    UDYAM / MSME Reg. No.
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingCompany.company_udyam_reg}
                    onChange={e => setEditingCompany(p => ({ ...p, company_udyam_reg: e.target.value }))}
                    placeholder="UDYAM-MH-01-0098765"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                  Registered Business / Factory Address
                </label>
                <textarea
                  rows={2}
                  className="input-field"
                  value={editingCompany.company_address}
                  onChange={e => setEditingCompany(p => ({ ...p, company_address: e.target.value }))}
                  placeholder="Plot 12, Transport Nagar, Vapi, Gujarat - 396195"
                />
              </div>

              {/* Email & Phone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                    Official Email
                  </label>
                  <input
                    type="email"
                    className="input-field"
                    value={editingCompany.admin_email}
                    onChange={e => setEditingCompany(p => ({ ...p, admin_email: e.target.value }))}
                    placeholder="billing@shobhagroup.in"
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                    Contact Phone / WhatsApp
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingCompany.contact_phone}
                    onChange={e => setEditingCompany(p => ({ ...p, contact_phone: e.target.value }))}
                    placeholder="+91 98765 11223"
                  />
                </div>
              </div>

              {/* Bank Remittance Info */}
              <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                  🏦 Bank Account & UPI Details (For Invoices & QR Codes)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Bank Name</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editingCompany.bank_name}
                      onChange={e => setEditingCompany(p => ({ ...p, bank_name: e.target.value }))}
                      placeholder="ICICI Bank Ltd."
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Account Number</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editingCompany.bank_account_no}
                      onChange={e => setEditingCompany(p => ({ ...p, bank_account_no: e.target.value }))}
                      placeholder="001105009988"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>IFSC Code</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editingCompany.bank_ifsc}
                      onChange={e => setEditingCompany(p => ({ ...p, bank_ifsc: e.target.value }))}
                      placeholder="ICIC0000011"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>UPI ID (Auto QR)</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editingCompany.upi_id}
                      onChange={e => setEditingCompany(p => ({ ...p, upi_id: e.target.value }))}
                      placeholder="e.g. shobhareadyplast@okhdfcbank"
                    />
                  </div>
                </div>

                {/* Custom QR Code Standee Image Upload */}
                <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {editingCompany.company_qr_code_url ? (
                        <img src={editingCompany.company_qr_code_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <QrCode size={20} style={{ opacity: 0.5 }} />
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 700 }}>Custom QR Standee Image (Optional)</div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Upload physical Paytm / PhonePe / BharatPe QR standee image.</div>
                    </div>
                  </div>
                  <div>
                    <input
                      ref={companyModalQrRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      style={{ display: 'none' }}
                      onChange={handleCompanyQrUpload}
                    />
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem' }}
                        onClick={() => companyModalQrRef.current?.click()}
                      >
                        <Upload size={11} /> {editingCompany.company_qr_code_url ? 'Change QR' : 'Upload QR'}
                      </button>
                      {editingCompany.company_qr_code_url && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ color: 'var(--danger)', fontSize: '0.72rem', padding: '0.25rem 0.5rem' }}
                          onClick={() => setEditingCompany(p => ({ ...p, company_qr_code_url: '' }))}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* State & Jurisdiction */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>State</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingCompany.state_name}
                    onChange={e => setEditingCompany(p => ({ ...p, state_name: e.target.value }))}
                    placeholder="Gujarat"
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>State Code</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingCompany.state_code}
                    onChange={e => setEditingCompany(p => ({ ...p, state_code: e.target.value }))}
                    placeholder="24"
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Legal Jurisdiction</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingCompany.jurisdiction}
                    onChange={e => setEditingCompany(p => ({ ...p, jurisdiction: e.target.value }))}
                    placeholder="VALSAD / THANE"
                  />
                </div>
              </div>

              {/* Default checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  checked={editingCompany.is_default}
                  onChange={e => setEditingCompany(p => ({ ...p, is_default: e.target.checked }))}
                />
                <span style={{ fontWeight: 600 }}>Set as Primary Default Company</span>
              </label>

              {/* Modal Footer Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCompanyModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={companyModalSaving}
                >
                  {companyModalSaving ? (
                    <><RefreshCw size={14} className="animate-spin" /> Saving Profile...</>
                  ) : (
                    <><Save size={14} /> Save Company Profile</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;

