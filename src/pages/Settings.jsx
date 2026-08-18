import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, Bell, Shield, Palette, MessageCircle,
  RefreshCw, Save, Check, Zap, Download, AlertTriangle, Activity,
  Server, Cpu, Database, Radio, ToggleLeft, ToggleRight, FileSpreadsheet, FileJson
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { getSystemSafetyAndQuotas, updateSystemSafety, toggleCircuitBreaker, exportAllData } from '../lib/db';
import './Pages.css';

const Settings = () => {
  const { theme, toggleTheme } = useTheme();
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [safety, setSafety] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  useEffect(() => {
    loadSafety();
  }, []);

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

  const handleDownloadCsv = (type) => {
    const headers = type === 'leads'
      ? 'ID,Name,Phone,Source,Status,Property Interest,Budget\n'
      : 'ID,Voucher Number,Client Name,Phone,Amount,Status,Due Date\n';
    const sampleRows = type === 'leads'
      ? 'lead-1,Ravi Mehta,+919876543210,WhatsApp,Hot,3BHK - Andheri West,₹95L\nlead-2,Priya Kapoor,+916543210987,Website,Warm,2BHK - Borivali,₹62L'
      : 'inv-1,INV-2026-041,Ravi Mehta,+919876543210,250000,Overdue,2026-08-04\ninv-2,INV-2026-045,Priya Kapoor,+916543210987,450000,Pending,2026-08-23';
    const blob = new Blob([headers + sampleRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erppro_${type}_export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: 'general', label: 'General', icon: <SettingsIcon size={16} /> },
    { id: 'safety', label: 'Free-Tier Safety & Quotas', icon: <Zap size={16} /> },
    { id: 'export', label: 'Data Portability & Export', icon: <Download size={16} /> },
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
                  <FileSpreadsheet size={16} color="var(--whatsapp)" /> Modular CSV Exports (Spreadsheet Friendly)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>CRM Leads & Contacts</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Name, phone, status, budget, interest</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleDownloadCsv('leads')}>
                      <Download size={12} /> CSV
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Invoices & Financials</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Vouchers, client names, overdue amounts</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleDownloadCsv('invoices')}>
                      <Download size={12} /> CSV
                    </button>
                  </div>
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
                { label: 'WhatsApp Business Account ID', placeholder: 'WABA ID from Meta Business Suite', type: 'text', val: '107376818438244' },
                { label: 'Access Token (Permanent / System User)', placeholder: '••••••••••••••••••••••••••', type: 'password', val: 'EAAO5bP4en30BSKKS08uX7V1...' },
                { label: 'Webhook Verify Token', placeholder: 'Custom verify token for webhook', type: 'text', val: 'erppro_webhook_2026' },
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

        </div>
      </div>
    </div>
  );
};

export default Settings;
