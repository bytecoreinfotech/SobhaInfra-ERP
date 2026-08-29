import React, { useState, useEffect, useRef } from 'react';
import {
  X, Mail, Send, Sparkles, FileText, CheckCircle2, AlertCircle,
  Eye, Edit3, Paperclip, RefreshCw, Building2, User, Phone, Check,
  Bold, Italic, List, Tag
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { DEFAULT_EMAIL_TEMPLATES, sendDirectEmail, recordLocalEmailLog, formatTextToEmailHtml } from '../lib/db';

const EmailComposeModal = ({ lead, defaultTo = '', onClose, onEmailSent }) => {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const textareaRef = useRef(null);

  const [to, setTo] = useState(lead?.email || defaultTo || '');
  const [recipientName, setRecipientName] = useState(lead?.name || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('custom');
  const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'preview'
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null); // { type: 'success' | 'error', text: '' }

  const companyName = activeCompany?.company_name || 'Sobha Infratech Pvt. Ltd.';
  const senderName = user?.full_name || 'Sales Team';
  const senderPhone = activeCompany?.contact_phone || user?.phone || '+91 98765 43210';

  // Apply template variables
  const applyTemplate = (tpl) => {
    if (!tpl || tpl.id === 'custom') {
      setSelectedTemplateId('custom');
      return;
    }
    setSelectedTemplateId(tpl.id);

    let compiledSub = tpl.subject
      .replace(/{{property_interest}}/g, lead?.property_interest || 'Products & Services')
      .replace(/{{company_name}}/g, companyName)
      .replace(/{{client_name}}/g, recipientName || 'Client');

    let compiledBody = tpl.body
      .replace(/{{client_name}}/g, recipientName || 'Valued Client')
      .replace(/{{client_phone}}/g, lead?.phone || 'Not Provided')
      .replace(/{{property_interest}}/g, lead?.property_interest || 'Tile Adhesives & Construction Chemicals')
      .replace(/{{budget}}/g, lead?.budget || 'As per quotation')
      .replace(/{{company_name}}/g, companyName)
      .replace(/{{sender_name}}/g, senderName)
      .replace(/{{sender_phone}}/g, senderPhone);

    setSubject(compiledSub);
    setBody(compiledBody);
  };

  useEffect(() => {
    if (lead) {
      setTo(lead.email || '');
      setRecipientName(lead.name || '');
      // Default to Quotation or Welcome template
      const defaultTpl = DEFAULT_EMAIL_TEMPLATES[0];
      if (defaultTpl) applyTemplate(defaultTpl);
    } else {
      setSubject(`Inquiry Follow-up — ${companyName}`);
      setBody(`Dear Valued Client,\n\nThank you for connecting with ${companyName}. Please let us know how we can assist you with your requirements.\n\nWarm regards,\n${senderName}\n${companyName}\nPhone: ${senderPhone}`);
    }
  }, [lead]);

  // Insert helper text at cursor
  const insertTextAtCursor = (prefix, suffix = '') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setBody(prev => prev + prefix + suffix);
      return;
    }
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const selected = body.substring(start, end);
    const replacement = prefix + (selected || 'text') + suffix;
    const newBody = body.substring(0, start) + replacement + body.substring(end);
    setBody(newBody);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selected ? selected.length : 4));
    }, 50);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!to || !to.includes('@')) {
      setStatusMsg({ type: 'error', text: 'Please enter a valid recipient email address.' });
      return;
    }
    if (!subject.trim()) {
      setStatusMsg({ type: 'error', text: 'Please provide an email subject.' });
      return;
    }
    if (!body.trim()) {
      setStatusMsg({ type: 'error', text: 'Email body cannot be empty.' });
      return;
    }

    setSending(true);
    setStatusMsg(null);

    // Convert plain text into professional HTML email
    const compiledHtml = formatTextToEmailHtml(body, companyName);

    const payload = {
      to: to.trim(),
      recipientName: recipientName.trim(),
      subject: subject.trim(),
      text: body,
      html: compiledHtml,
      leadId: lead?.id || null,
      templateUsed: DEFAULT_EMAIL_TEMPLATES.find(t => t.id === selectedTemplateId)?.name || 'Custom',
      senderName,
      senderEmail: user?.email || undefined,
    };

    const res = await sendDirectEmail(payload);

    if (res.success) {
      recordLocalEmailLog({
        recipient_email: to,
        recipient_name: recipientName,
        subject,
        body_html: compiledHtml,
        body_text: body,
        lead_id: lead?.id || null,
        sent_by_name: senderName,
        template_used: payload.templateUsed,
      });

      setStatusMsg({
        type: 'success',
        text: res.data?.simulated
          ? 'Email dispatched (Dev Mode: configure Gmail App Password in Settings for live inbox delivery).'
          : 'Email delivered successfully to client inbox!',
      });

      if (onEmailSent) {
        onEmailSent({ ...payload, timestamp: new Date().toISOString() });
      }

      setTimeout(() => {
        onClose();
      }, 1400);
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'Failed to send email. Verify your Gmail SMTP credentials in Settings.',
      });
    }

    setSending(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(11, 13, 26, 0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '1rem'
    }}>
      <div
        className="modal-container"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary, #13172b)',
          border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(99, 102, 241, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '10px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#ffffff'
            }}>
              <Mail size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Compose Email to Client
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Direct Gmail dispatch via SobhaInfra Cloud Engine (Plain Normal Text)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-outline btn-sm"
            style={{ padding: '0.4rem', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.05)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Status feedback */}
          {statusMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: statusMsg.type === 'success' ? '#10b981' : '#ef4444'
            }}>
              {statusMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Quick Template Selector */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
              ⚡ Choose Instant Template
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {DEFAULT_EMAIL_TEMPLATES.map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: selectedTemplateId === tpl.id ? 'var(--primary, #6366f1)' : 'rgba(255,255,255,0.05)',
                    color: selectedTemplateId === tpl.id ? '#ffffff' : 'var(--text-secondary)',
                    border: `1px solid ${selectedTemplateId === tpl.id ? 'var(--primary, #6366f1)' : 'rgba(255,255,255,0.1)'}`,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {tpl.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => applyTemplate({ id: 'custom' })}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: selectedTemplateId === 'custom' ? 'var(--primary, #6366f1)' : 'rgba(255,255,255,0.05)',
                  color: selectedTemplateId === 'custom' ? '#ffffff' : 'var(--text-secondary)',
                  border: `1px solid ${selectedTemplateId === 'custom' ? 'var(--primary, #6366f1)' : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                Custom Draft
              </button>
            </div>
          </div>

          {/* Recipient Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Recipient Email *
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  className="input-field"
                  style={{ paddingLeft: '2rem', width: '100%', fontSize: '0.85rem' }}
                  placeholder="client@example.com"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Client / Recipient Name
              </label>
              <div style={{ position: 'relative' }}>
                <User size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="input-field"
                  style={{ paddingLeft: '2rem', width: '100%', fontSize: '0.85rem' }}
                  placeholder="Abhay Sharma"
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Subject Line */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Subject Line *
            </label>
            <input
              type="text"
              className="input-field"
              style={{ width: '100%', fontSize: '0.85rem', fontWeight: 600 }}
              placeholder="e.g. Tile Adhesive Quotation & Technical Data Sheet"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              required
            />
          </div>

          {/* Editor Header / Formatting Toolbar & Preview Toggle */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Message Text:
                </span>
                {viewMode === 'edit' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => insertTextAtCursor('**', '**')}
                      title="Bold text"
                      style={{
                        padding: '0.2rem 0.45rem', borderRadius: '4px', fontSize: '0.75rem',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px'
                      }}
                    >
                      <Bold size={11} /> Bold
                    </button>
                    <button
                      type="button"
                      onClick={() => insertTextAtCursor('*', '*')}
                      title="Italic text"
                      style={{
                        padding: '0.2rem 0.45rem', borderRadius: '4px', fontSize: '0.75rem',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px'
                      }}
                    >
                      <Italic size={11} /> Italic
                    </button>
                    <button
                      type="button"
                      onClick={() => insertTextAtCursor('\n• ')}
                      title="Add bullet item"
                      style={{
                        padding: '0.2rem 0.45rem', borderRadius: '4px', fontSize: '0.75rem',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px'
                      }}
                    >
                      <List size={11} /> Bullet
                    </button>
                    <button
                      type="button"
                      onClick={() => insertTextAtCursor('{{client_name}}')}
                      title="Insert Client Name placeholder"
                      style={{
                        padding: '0.2rem 0.45rem', borderRadius: '4px', fontSize: '0.7rem',
                        background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                        color: '#818cf8', cursor: 'pointer'
                      }}
                    >
                      + Client Name
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  style={{
                    padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem',
                    background: viewMode === 'edit' ? 'rgba(99,102,241,0.2)' : 'transparent',
                    color: viewMode === 'edit' ? 'var(--primary, #6366f1)' : 'var(--text-muted)',
                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                    fontWeight: 600
                  }}
                >
                  <Edit3 size={12} /> Plain Text Editor
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  style={{
                    padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem',
                    background: viewMode === 'preview' ? 'rgba(99,102,241,0.2)' : 'transparent',
                    color: viewMode === 'preview' ? 'var(--primary, #6366f1)' : 'var(--text-muted)',
                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                    fontWeight: 600
                  }}
                >
                  <Eye size={12} /> Live Branded Preview
                </button>
              </div>
            </div>

            {viewMode === 'edit' ? (
              <textarea
                ref={textareaRef}
                className="input-field"
                rows={10}
                style={{
                  width: '100%',
                  fontSize: '0.88rem',
                  lineHeight: '1.6',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  padding: '0.85rem'
                }}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Type your message in normal plain text here (paragraphs and bullet points will automatically be styled into a clean email)..."
              />
            ) : (
              <div style={{
                minHeight: 220, maxHeight: 340, overflowY: 'auto',
                padding: '1.25rem', background: '#ffffff', color: '#1e293b',
                borderRadius: '8px', border: '1px solid var(--border-color)',
                fontSize: '0.9rem'
              }}>
                <div style={{
                  padding: '12px 16px', background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                  borderRadius: '6px', color: '#ffffff', marginBottom: '16px'
                }}>
                  <strong style={{ fontSize: '1rem' }}>{companyName}</strong>
                  <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: '2px' }}>Official Client Communication • {subject || 'Subject'}</div>
                </div>
                <div
                  style={{ color: '#334155', lineHeight: '1.65' }}
                  dangerouslySetInnerHTML={{ __html: formatTextToEmailHtml(body, companyName) || '<p style="color: #94a3b8; font-style: italic;">(Email body is empty)</p>' }}
                />
                <div style={{ marginTop: '24px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                  Sent via SobhaInfra ERP • {companyName}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Building2 size={14} /> Sending as: <strong>{senderName}</strong> ({companyName})
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
              disabled={sending}
              style={{ fontSize: '0.85rem' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              className="btn btn-primary"
              disabled={sending || !to}
              style={{
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1.25rem',
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
              }}
            >
              {sending ? (
                <>
                  <RefreshCw size={14} className="spin" /> Dispatching...
                </>
              ) : (
                <>
                  <Send size={14} /> Send Email Directly
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailComposeModal;
