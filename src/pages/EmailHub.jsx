import React, { useState, useEffect } from 'react';
import {
  Mail, Send, Sparkles, CheckCircle2, AlertCircle, Clock,
  Filter, Search, RefreshCw, FileText, Eye, Building2, User,
  Plus, ExternalLink, ShieldCheck, Settings as SettingsIcon,
  ChevronRight, Inbox, HelpCircle, Layers
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { DEFAULT_EMAIL_TEMPLATES, getEmailLogs, sendDirectEmail, recordLocalEmailLog } from '../lib/db';
import EmailComposeModal from '../components/EmailComposeModal';
import './Pages.css';

const EmailHub = () => {
  const { user } = useAuth();
  const { activeCompany } = useCompany();

  const [activeTab, setActiveTab] = useState('logs'); // 'logs' | 'templates' | 'quick-send'
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  // Compose modal state
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedLeadForEmail, setSelectedLeadForEmail] = useState(null);
  const [previewLog, setPreviewLog] = useState(null);

  // Quick Send State
  const [quickTo, setQuickTo] = useState('');
  const [quickName, setQuickName] = useState('');
  const [quickSubject, setQuickSubject] = useState('');
  const [quickBody, setQuickBody] = useState('');
  const [quickSending, setQuickSending] = useState(false);
  const [quickResult, setQuickResult] = useState(null);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoadingLogs(true);
    const { data } = await getEmailLogs({ limit: 100 });
    if (data) setLogs(data);
    setLoadingLogs(false);
  };

  const handleQuickSend = async (e) => {
    e.preventDefault();
    if (!quickTo || !quickSubject || !quickBody) return;
    setQuickSending(true);
    setQuickResult(null);

    const payload = {
      to: quickTo.trim(),
      recipientName: quickName.trim(),
      subject: quickSubject.trim(),
      html: quickBody,
      senderName: user?.full_name || 'Sobha Sales Team',
      templateUsed: 'Quick Compose',
    };

    const res = await sendDirectEmail(payload);

    if (res.success) {
      recordLocalEmailLog(payload);
      setQuickResult({ type: 'success', text: 'Email dispatched successfully via Gmail engine!' });
      setQuickTo('');
      setQuickName('');
      setQuickSubject('');
      setQuickBody('');
      loadLogs();
    } else {
      setQuickResult({ type: 'error', text: res.error || 'Failed to send email. Check SMTP settings.' });
    }
    setQuickSending(false);
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = !searchQuery ||
      (log.recipient_email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.recipient_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.subject || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || log.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalSent = logs.filter(l => l.status === 'SENT' || l.status === 'SIMULATED').length;
  const totalFailed = logs.filter(l => l.status === 'FAILED').length;

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{
              display: 'inline-flex', padding: '0.4rem', borderRadius: '10px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)', color: '#fff'
            }}>
              <Mail size={22} />
            </span>
            Gmail & Email Center
          </h1>
          <p className="page-subtitle">
            Directly communicate with leads, clients, and distributors via official Gmail SMTP
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={loadLogs}
            disabled={loadingLogs}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} className={loadingLogs ? 'spin' : ''} /> Refresh
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setSelectedLeadForEmail(null);
              setComposeOpen(true);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              fontSize: '0.85rem', fontWeight: 600,
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
            }}
          >
            <Plus size={16} /> Compose Email
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          background: 'var(--bg-secondary, #13172b)',
          border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          borderRadius: '12px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem'
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '10px',
            background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Send size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Emails Dispatched</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{totalSent}</div>
          </div>
        </div>

        <div style={{
          background: 'var(--bg-secondary, #13172b)',
          border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          borderRadius: '12px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem'
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.15)', color: '#10b981',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Delivery Rate</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
              {logs.length > 0 ? `${Math.round((totalSent / logs.length) * 100)}%` : '100%'}
            </div>
          </div>
        </div>

        <div style={{
          background: 'var(--bg-secondary, #13172b)',
          border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          borderRadius: '12px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem'
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '10px',
            background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <FileText size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Ready Templates</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{DEFAULT_EMAIL_TEMPLATES.length}</div>
          </div>
        </div>

        <div style={{
          background: 'var(--bg-secondary, #13172b)',
          border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          borderRadius: '12px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem'
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '10px',
            background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Connected Engine</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Gmail Cloud SMTP</div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div style={{
        display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)',
        marginBottom: '1.5rem', paddingBottom: '0.5rem'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className="btn"
          style={{
            background: activeTab === 'logs' ? 'var(--primary, #6366f1)' : 'transparent',
            color: activeTab === 'logs' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600, fontSize: '0.85rem', padding: '0.5rem 1rem', borderRadius: '8px',
            border: activeTab === 'logs' ? 'none' : '1px solid transparent'
          }}
        >
          Sent Communications Log ({filteredLogs.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className="btn"
          style={{
            background: activeTab === 'templates' ? 'var(--primary, #6366f1)' : 'transparent',
            color: activeTab === 'templates' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600, fontSize: '0.85rem', padding: '0.5rem 1rem', borderRadius: '8px',
            border: activeTab === 'templates' ? 'none' : '1px solid transparent'
          }}
        >
          ⚡ Real Estate Email Templates ({DEFAULT_EMAIL_TEMPLATES.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('quick-send')}
          className="btn"
          style={{
            background: activeTab === 'quick-send' ? 'var(--primary, #6366f1)' : 'transparent',
            color: activeTab === 'quick-send' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600, fontSize: '0.85rem', padding: '0.5rem 1rem', borderRadius: '8px',
            border: activeTab === 'quick-send' ? 'none' : '1px solid transparent'
          }}
        >
          ✉️ Quick Mail Composer
        </button>
      </div>

      {/* Tab 1: Sent Email Logs */}
      {activeTab === 'logs' && (
        <div style={{
          background: 'var(--bg-secondary, #13172b)',
          border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          borderRadius: '14px', overflow: 'hidden'
        }}>
          {/* Filter Bar */}
          <div style={{
            padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.08))',
            display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap'
          }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 260, maxWidth: 400 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="input-field"
                style={{ paddingLeft: '2.2rem', width: '100%', fontSize: '0.85rem' }}
                placeholder="Search by recipient, subject, or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status:</span>
              <select
                className="input-field"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="SENT">Sent Successfully</option>
                <option value="SIMULATED">Simulated (Dev)</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>
          </div>

          {/* Logs Table */}
          {filteredLogs.length === 0 ? (
            <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Inbox size={48} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>No Emails Dispatched Yet</h3>
              <p style={{ margin: '0.4rem 0 1.25rem', fontSize: '0.85rem' }}>
                Use the Compose Email button or click Email on any CRM Lead to start sending.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setComposeOpen(true)}
              >
                Compose First Email
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{
                    background: 'rgba(0,0,0,0.15)',
                    borderBottom: '1px solid var(--border-color)',
                    color: 'var(--text-muted)',
                    textAlign: 'left'
                  }}>
                    <th style={{ padding: '0.85rem 1.25rem', fontWeight: 600 }}>Recipient</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Subject Line</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Template Used</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Sent By</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Date & Time</th>
                    <th style={{ padding: '0.85rem 1.25rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => {
                    const isSuccess = log.status === 'SENT';
                    const isSimulated = log.status === 'SIMULATED';
                    const isFailed = log.status === 'FAILED';

                    return (
                      <tr
                        key={log.id}
                        style={{
                          borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.05))',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <td style={{ padding: '0.85rem 1.25rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {log.recipient_name || 'Client'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {log.recipient_email}
                          </div>
                        </td>

                        <td style={{ padding: '0.85rem 1rem', maxWidth: 260 }}>
                          <div style={{ fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {log.subject}
                          </div>
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem',
                            background: 'rgba(99,102,241,0.1)', color: '#818cf8', fontWeight: 600
                          }}>
                            {log.template_used || 'Custom'}
                          </span>
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '0.25rem 0.6rem', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
                            background: isSuccess ? 'rgba(16, 185, 129, 0.15)' : isSimulated ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: isSuccess ? '#10b981' : isSimulated ? '#3b82f6' : '#ef4444'
                          }}>
                            {isSuccess ? <CheckCircle2 size={12} /> : isSimulated ? <Clock size={12} /> : <AlertCircle size={12} />}
                            {log.status}
                          </span>
                        </td>

                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {log.sent_by_name || 'System Admin'}
                        </td>

                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                          {new Date(log.created_at).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                          })}
                        </td>

                        <td style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => setPreviewLog(log)}
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Eye size={12} /> View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Email Templates Gallery */}
      {activeTab === 'templates' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem'
        }}>
          {DEFAULT_EMAIL_TEMPLATES.map(tpl => (
            <div
              key={tpl.id}
              style={{
                background: 'var(--bg-secondary, #13172b)',
                border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                borderRadius: '14px', padding: '1.25rem', display: 'flex', flexDirection: 'column',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '20px',
                  background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8'
                }}>
                  {tpl.category}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Sobha Brand Standard</span>
              </div>

              <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {tpl.name}
              </h3>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                <strong>Subject:</strong> {tpl.subject}
              </p>

              <div style={{
                flex: 1, padding: '0.85rem', background: 'rgba(0,0,0,0.2)',
                borderRadius: '8px', border: '1px solid var(--border-color, rgba(255,255,255,0.05))',
                fontSize: '0.75rem', color: 'var(--text-secondary)', maxHeight: 150, overflowY: 'auto',
                marginBottom: '1rem', lineHeight: '1.5'
              }}>
                <div dangerouslySetInnerHTML={{ __html: tpl.body.slice(0, 300) + '...' }} />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setSelectedLeadForEmail(null);
                  setComposeOpen(true);
                }}
                style={{
                  width: '100%', fontSize: '0.85rem', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '0.5rem', fontWeight: 600
                }}
              >
                <Send size={14} /> Use This Template
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Quick Mail Composer */}
      {activeTab === 'quick-send' && (
        <div style={{
          background: 'var(--bg-secondary, #13172b)',
          border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          borderRadius: '14px', padding: '1.5rem', maxWidth: '760px'
        }}>
          <h3 style={{ margin: '0 0 0.3rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Direct Quick Mail
          </h3>
          <p style={{ margin: '0 0 1.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Quickly send an email to any client, engineer, or distributor without creating a full lead entry.
          </p>

          {quickResult && (
            <div style={{
              padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: quickResult.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: quickResult.type === 'success' ? '#10b981' : '#ef4444'
            }}>
              {quickResult.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{quickResult.text}</span>
            </div>
          )}

          <form onSubmit={handleQuickSend} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Recipient Email *
                </label>
                <input
                  type="email"
                  className="input-field"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  placeholder="client@buildcon.in"
                  value={quickTo}
                  onChange={e => setQuickTo(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Recipient Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  placeholder="Rohan Deshmukh"
                  value={quickName}
                  onChange={e => setQuickName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Subject Line *
              </label>
              <input
                type="text"
                className="input-field"
                style={{ width: '100%', fontSize: '0.85rem', fontWeight: 600 }}
                placeholder="Product Quotation & Technical Brochure — Sobha Infratech"
                value={quickSubject}
                onChange={e => setQuickSubject(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Message Body (HTML or Plain Text) *
              </label>
              <textarea
                className="input-field"
                rows={8}
                style={{ width: '100%', fontSize: '0.85rem', lineHeight: '1.5' }}
                placeholder="Type your email message..."
                value={quickBody}
                onChange={e => setQuickBody(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={quickSending || !quickTo || !quickSubject}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.5rem' }}
              >
                {quickSending ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
                Send Email Directly
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Email Compose Modal */}
      {composeOpen && (
        <EmailComposeModal
          lead={selectedLeadForEmail}
          onClose={() => {
            setComposeOpen(false);
            setSelectedLeadForEmail(null);
          }}
          onEmailSent={() => {
            loadLogs();
          }}
        />
      )}

      {/* Log Preview Modal */}
      {previewLog && (
        <div className="modal-overlay" onClick={() => setPreviewLog(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(11, 13, 26, 0.8)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '1rem'
        }}>
          <div
            className="modal-container"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary, #13172b)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px', width: '100%', maxWidth: '640px',
              maxHeight: '85vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)', overflow: 'hidden'
            }}
          >
            <div style={{
              padding: '1.25rem', borderBottom: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  {previewLog.subject}
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  To: <strong>{previewLog.recipient_name}</strong> ({previewLog.recipient_email})
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setPreviewLog(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, background: '#ffffff', color: '#1e293b' }}>
              <div dangerouslySetInnerHTML={{ __html: previewLog.body_html || previewLog.body_text }} />
            </div>

            <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border-color)', textAlign: 'right' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setPreviewLog(null)}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailHub;
