import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, Bell, Shield, Palette, MessageCircle,
  RefreshCw, Save, Check, Zap, Download, AlertTriangle, Activity,
  Server, Cpu, Database, Radio, ToggleLeft, ToggleRight, FileSpreadsheet, FileJson,
  Brain, Plus, Trash2, Edit3, BookOpen, CheckCircle2
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  getSystemSafetyAndQuotas, updateSystemSafety, toggleCircuitBreaker, exportAllData,
  getRoles, createRole, updateRole, deleteRole, getPermissionMatrix, savePermissionMatrix, getTeamMembers
} from '../lib/db';
import './Pages.css';

const KB_CATEGORIES = ['Properties', 'Pricing', 'Policy', 'FAQ', 'Operations', 'Contact', 'Payment Terms'];
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

const Settings = () => {
  const { theme, toggleTheme } = useTheme();
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [safety, setSafety] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

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

  useEffect(() => {
    loadSafety();
  }, []);

  useEffect(() => {
    if (activeTab === 'ai_kb') loadKnowledgeBase();
    if (activeTab === 'roles_positions') loadRolesAndMatrix();
  }, [activeTab]);

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
    if (safety) {
      await updateSystemSafety(safety);
    }
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

  const tabs = [
    { id: 'general', label: 'General', icon: <SettingsIcon size={16} /> },
    { id: 'ai_kb', label: 'AI Knowledge Base', icon: <Brain size={16} /> },
    { id: 'safety', label: 'Free-Tier Safety & Quotas', icon: <Zap size={16} /> },
    { id: 'export', label: 'Data Portability & Export', icon: <Download size={16} /> },
    { id: 'roles_positions', label: 'Roles & Positions', icon: <Shield size={16} /> },
    { id: 'whatsapp', label: 'WhatsApp API', icon: <MessageCircle size={16} /> },
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

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* Sidebar tabs */}
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="btn"
              style={{
                width: '100%', justifyContent: 'flex-start', gap: '0.65rem',
                borderRadius: 0, padding: '0.875rem 1.25rem',
                background: activeTab === tab.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                borderLeft: activeTab === tab.id ? '3px solid var(--accent-primary)' : '3px solid transparent',
                fontWeight: activeTab === tab.id ? 600 : 400,
                fontSize: '0.82rem'
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="glass-card p-6">

          {/* ══════════════════════════════════════════════════════════════
              TAB 1: GENERAL SETTINGS
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>General Business Settings</h3>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Company / Organization Name</label>
                <input type="text" className="input-field" defaultValue="ERPPro Real Estate Solutions Pvt. Ltd." />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Primary Admin Email</label>
                <input type="email" className="input-field" defaultValue="admin@erppro.in" />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Time Zone</label>
                <select className="input-field">
                  <option>Asia/Kolkata (IST +05:30)</option>
                  <option>UTC</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.75rem' }}>Interface Theme</label>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {['dark', 'light'].map(t => (
                    <div
                      key={t}
                      onClick={() => theme !== t && toggleTheme()}
                      style={{
                        flex: 1, padding: '1.25rem', borderRadius: 'var(--radius-md)',
                        border: `2px solid ${theme === t ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        background: t === 'dark' ? '#0b0d1a' : '#f4f5fb',
                        cursor: 'pointer', textAlign: 'center', transition: 'var(--transition)'
                      }}
                    >
                      <div style={{ fontSize: '1.4rem', marginBottom: '0.3rem' }}>{t === 'dark' ? '🌙' : '☀️'}</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: t === 'dark' ? 'white' : '#111', textTransform: 'capitalize' }}>
                        {t} Mode
                      </div>
                      {theme === t && (
                        <div style={{ marginTop: '0.4rem' }}>
                          <span className="badge badge-accent" style={{ fontSize: '0.62rem' }}>Active</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Currency</label>
                <select className="input-field">
                  <option>INR (₹) — Indian Rupee</option>
                  <option>USD ($) — US Dollar</option>
                </select>
              </div>
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
              TAB 4: WHATSAPP CONFIG
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'whatsapp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>WhatsApp Business API Configuration</h3>
              <div style={{ padding: '1rem', background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--warning)', fontSize: '0.82rem', color: 'var(--warning)' }}>
                ℹ️ <strong>Zero Cost Setup:</strong> Configured via Meta WhatsApp Cloud API free tier (1,000 free service conversations/month).
              </div>
              {[
                { label: 'Phone Number ID', placeholder: 'Meta Phone Number ID (e.g. 1217775984755724)', type: 'text', val: '1217775984755724' },
                { label: 'WhatsApp Business Account ID', placeholder: 'WABA ID from Meta Business Suite', type: 'text', val: '1073768118438244' },
                { label: 'Access Token (Permanent / System User)', placeholder: '••••••••••••••••••••••••••', type: 'password', val: 'EAAO5bP4en30BSechJ6djYxtfPtupXj...' },
                { label: 'Webhook Verify Token', placeholder: 'Custom verify token for webhook', type: 'text', val: 'erppro_wa_sec_9f8b2c4e1a7d6e5c8302' },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>{f.label}</label>
                  <input type={f.type} className="input-field" defaultValue={f.val} placeholder={f.placeholder} />
                </div>
              ))}
              <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                📖 Webhook URL for Meta Dashboard: <code>https://your-domain.netlify.app/.netlify/functions/whatsapp-webhook</code>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 5: TALLY CONFIG
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'tally' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>TallyPrime On-Premise Integration Settings</h3>
              <div style={{ padding: '1rem', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--info)', fontSize: '0.82rem', color: 'var(--info)' }}>
                ℹ️ <strong>Connector Status:</strong> Run <code>node scripts/tally-connector.js</code> on the Windows machine running TallyPrime (Port 9000).
              </div>
              {[
                { label: 'Tally Server Host', placeholder: '127.0.0.1 or LAN IP', val: '127.0.0.1' },
                { label: 'Tally XML Port', placeholder: '9000', val: '9000' },
                { label: 'Company Name (in Tally)', placeholder: 'Exact company name in Tally', val: 'Techma Real Estate Pvt Ltd' },
                { label: 'Connector Secret Token', placeholder: 'Secret auth token', val: 'erppro_tally_sec_token_2026' },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>{f.label}</label>
                  <input type="text" className="input-field" defaultValue={f.val} placeholder={f.placeholder} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Auto-Sync Frequency</label>
                <select className="input-field">
                  <option>Every 15 minutes (Real-time)</option>
                  <option>Every 1 hour</option>
                  <option>Every 6 hours</option>
                  <option>Manual only</option>
                </select>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 6: NOTIFICATIONS
             ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Notification Preferences</h3>
              {[
                { label: 'New Lead Added', desc: 'Notify when a new lead is created in CRM', enabled: true },
                { label: 'Payment Overdue Alert', desc: 'Daily summary of overdue invoices from Tally', enabled: true },
                { label: 'WhatsApp Campaign Complete', desc: 'Notify when a broadcast finishes delivering', enabled: true },
                { label: 'AI Human Handoff Alert', desc: 'Instant alert when customer requests salesperson', enabled: true },
                { label: 'Tally Sync Disconnection Alert', desc: 'Alert if local connector fails health check', enabled: true },
              ].map(n => (
                <div key={n.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{n.label}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{n.desc}</div>
                  </div>
                  <div
                    style={{
                      width: 44, height: 24, borderRadius: 12, flexShrink: 0,
                      background: n.enabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center',
                      padding: '0 3px', transition: 'var(--transition)'
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', background: 'white',
                      transform: n.enabled ? 'translateX(20px)' : 'translateX(0)',
                      transition: 'transform 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }} />
                  </div>
                </div>
              ))}
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
      {posSuccessMsg && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.96)', border: '1px solid rgba(16,185,129,0.5)',
          boxShadow: '0 15px 35px rgba(0,0,0,0.55), 0 0 20px rgba(16,185,129,0.15)',
          backdropFilter: 'blur(12px)', padding: '0.75rem 1.25rem', borderRadius: 10,
          color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.6rem',
          fontSize: '0.85rem', fontWeight: 600, animation: 'slideUp 0.25s ease'
        }}>
          <Check size={16} />
          <span>{posSuccessMsg}</span>
          <button
            onClick={() => setPosSuccessMsg('')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0 0 0.4rem', display: 'flex' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default Settings;
