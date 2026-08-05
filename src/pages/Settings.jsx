import React, { useState } from 'react';
import { Settings as SettingsIcon, Bell, Shield, Palette, MessageCircle, RefreshCw, Save, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import './Pages.css';

const Settings = () => {
  const { theme, toggleTheme } = useTheme();
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const tabs = [
    { id: 'general', label: 'General', icon: <SettingsIcon size={16} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
    { id: 'whatsapp', label: 'WhatsApp API', icon: <MessageCircle size={16} /> },
    { id: 'tally', label: 'Tally Config', icon: <RefreshCw size={16} /> },
    { id: 'security', label: 'Security', icon: <Shield size={16} /> },
  ];

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure your ERPPro platform preferences and integrations.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? <><Check size={15} /> Saved!</> : <><Save size={15} /> Save Changes</>}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem', alignItems: 'start' }}>

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
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="glass-card p-6">

          {activeTab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>General Settings</h3>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Company Name</label>
                <input type="text" className="input-field" defaultValue="ERPPro Solutions Pvt. Ltd." />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Business Email</label>
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

          {activeTab === 'whatsapp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>WhatsApp Business API Configuration</h3>
              <div style={{ padding: '1rem', background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--warning)', fontSize: '0.82rem', color: 'var(--warning)' }}>
                ⚠️ <strong>Demo Mode:</strong> WhatsApp API credentials will be configured here in production. API keys are not required for this demo.
              </div>
              {[
                { label: 'Phone Number ID', placeholder: 'Meta Phone Number ID (e.g. 123456789...)', type: 'text' },
                { label: 'WhatsApp Business Account ID', placeholder: 'WABA ID from Meta Business Suite', type: 'text' },
                { label: 'Access Token (Permanent)', placeholder: '••••••••••••••••••••••••••', type: 'password' },
                { label: 'Webhook Verify Token', placeholder: 'Custom verify token for webhook', type: 'text' },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>{f.label}</label>
                  <input type={f.type} className="input-field" placeholder={f.placeholder} disabled />
                </div>
              ))}
              <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                📖 Setup guide: Obtain API keys from <strong>business.facebook.com → WhatsApp → API Setup</strong>. Requires verified Meta Business Account.
              </div>
            </div>
          )}

          {activeTab === 'tally' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Tally Integration Settings</h3>
              <div style={{ padding: '1rem', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--info)', fontSize: '0.82rem', color: 'var(--info)' }}>
                ℹ️ <strong>Demo Mode:</strong> Tally sync will use live data in production. Ensure Tally.ERP 9 or TallyPrime is running with ODBC/API enabled.
              </div>
              {[
                { label: 'Tally Server Host', placeholder: 'localhost or server IP', val: 'localhost' },
                { label: 'Tally Port', placeholder: '9000', val: '9000' },
                { label: 'Company Name (in Tally)', placeholder: 'Exact company name in Tally', val: 'ERPPro Solutions Pvt. Ltd.' },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>{f.label}</label>
                  <input type="text" className="input-field" defaultValue={f.val} placeholder={f.placeholder} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Auto-Sync Frequency</label>
                <select className="input-field">
                  <option>Every 2 hours</option>
                  <option>Every 6 hours</option>
                  <option>Daily at midnight</option>
                  <option>Manual only</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Notification Preferences</h3>
              {[
                { label: 'New Lead Added', desc: 'Notify when a new lead is created in CRM', enabled: true },
                { label: 'Payment Overdue Alert', desc: 'Daily summary of overdue invoices', enabled: true },
                { label: 'WhatsApp Campaign Complete', desc: 'Notify when a campaign finishes sending', enabled: true },
                { label: 'Task Assignment', desc: 'Notify when a task is assigned to me', enabled: true },
                { label: 'Tally Sync Errors', desc: 'Alert if Tally sync fails', enabled: false },
                { label: 'Weekly Report Summary', desc: 'Email weekly performance summary', enabled: false },
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

          {activeTab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Security & Authentication</h3>
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
                <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.75rem' }}>Two-Factor Authentication (2FA)</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  Secure your account with 2FA via SMS or Authenticator app.
                </div>
                <button className="btn btn-primary btn-sm">Enable 2FA</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Settings;
