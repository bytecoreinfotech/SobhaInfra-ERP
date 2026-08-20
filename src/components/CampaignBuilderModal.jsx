import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Users, Filter, CheckCircle2, AlertTriangle, Shield, Clock, RefreshCw, Zap, MessageCircle, UploadCloud, Paperclip } from 'lucide-react';
import { estimateCampaignAudience, queueCampaign, processCampaignBatch } from '../lib/db';
import { uploadToWhatsAppMedia, getWhatsAppMediaType } from '../lib/storage';

const TEMPLATES = [
  { id: 1, tag: 'Announcement', name: 'New Product Launch', text: 'Hi {name}! 👋 We have introduced our new {product}. Would you like the official rate chart and brochure?' },
  { id: 2, tag: 'Inquiry Offer', name: 'Special Inquiry Offer', text: 'Dear {name}, thank you for inquiring about {product}! We are offering exclusive pricing this week. Would you like a callback?' },
  { id: 3, tag: 'Payment', name: 'Payment Reminder', text: 'Dear {name}, gentle reminder regarding your outstanding invoice for {product}. Please clear at the earliest.' },
  { id: 4, tag: 'Follow-up', name: 'Customer Follow-up', text: 'Hello {name}, following up on your inquiry for {product}. Let us know if you would like to schedule a call with our team.' },
];

const CampaignBuilderModal = ({ isOpen, onClose, onCampaignQueued }) => {
  const [name, setName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]);
  const [filters, setFilters] = useState({ statusFilter: 'All', propertyFilter: 'All', minScore: 0 });
  const [estimation, setEstimation] = useState({ totalRaw: 0, targeted: 0, optedOut: 0, invalidPhone: 0, finalAudienceCount: 0, eligibleLeads: [] });
  const [estimating, setEstimating] = useState(false);

  // Campaign media attachment
  const [campaignFile, setCampaignFile] = useState(null);
  const [campaignFilePreview, setCampaignFilePreview] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadedMediaUrl, setUploadedMediaUrl] = useState(null);
  const [uploadedMediaType, setUploadedMediaType] = useState(null);
  const campaignFileRef = useRef(null);

  // Execution state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);

  useEffect(() => {
    if (isOpen) {
      calculateAudience();
      // Reset media on open
      setCampaignFile(null); setCampaignFilePreview(null);
      setUploadedMediaUrl(null); setUploadedMediaType(null);
    }
  }, [isOpen, filters]);

  const calculateAudience = async () => {
    setEstimating(true);
    const est = await estimateCampaignAudience(filters);
    setEstimation(est);
    setEstimating(false);
  };

  const handleCampaignFileSelect = useCallback((file) => {
    if (!file) return;
    setCampaignFile(file);
    setUploadedMediaUrl(null); // reset so it re-uploads on launch
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

  const handleLaunchCampaign = async (e) => {
    e.preventDefault();
    if (!name.trim() || estimation.finalAudienceCount === 0) return;
    setIsSubmitting(true);
    setBatchProgress({ sent: 0, total: estimation.finalAudienceCount, status: 'Queuing batch in database...' });

    // Upload campaign media to Supabase if a file was attached
    let mediaUrl = uploadedMediaUrl;
    let mediaType = uploadedMediaType;
    if (campaignFile && !mediaUrl) {
      setUploadingMedia(true);
      setBatchProgress({ sent: 0, total: estimation.finalAudienceCount, status: 'Uploading campaign media to storage...' });
      try {
        mediaUrl = await uploadToWhatsAppMedia(campaignFile, 'campaigns');
        mediaType = getWhatsAppMediaType(campaignFile);
        setUploadedMediaUrl(mediaUrl);
        setUploadedMediaType(mediaType);
      } catch (err) {
        setBatchProgress({ sent: 0, total: estimation.finalAudienceCount, status: 'Media upload failed: ' + err.message });
        setIsSubmitting(false);
        setUploadingMedia(false);
        return;
      }
      setUploadingMedia(false);
    }

    // 1. Queue in database
    const { data: cData } = await queueCampaign({
      name,
      template_name: selectedTemplate.name,
      media_url: mediaUrl || null,
      media_type: mediaType || null,
    }, filters);

    if (cData) {
      setBatchProgress({ sent: 0, total: estimation.finalAudienceCount, status: 'Processing batch worker...' });

      // 2. Trigger Batch Processor
      await processCampaignBatch(cData.id, 50);

      setBatchProgress({
        sent: estimation.finalAudienceCount,
        total: estimation.finalAudienceCount,
        status: 'Completed',
      });

      if (onCampaignQueued) onCampaignQueued();
    }
    setIsSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content modal-lg animate-fade-in" style={{ maxWidth: 880 }}>
        <button
          className="modal-close-btn"
          onClick={onClose}
          title="Close Modal (Esc)"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MessageCircle size={22} color="var(--whatsapp)" /> Campaign Engine & Batch Broadcaster
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
            Dynamic audience segmentation, opt-out filtering, and database-backed batch queue execution (Section 13, 14, 50G).
          </p>
        </div>

        {batchProgress?.status === 'Completed' ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🚀</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Campaign Batch Queued!</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
              <strong>{estimation.finalAudienceCount} messages</strong> dispatched to background queue worker.
            </p>
            <div style={{ display: 'inline-flex', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLaunchCampaign} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            
            {/* LEFT COLUMN: FILTERS & AUDIENCE CALCULATOR */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Campaign Name *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Diwali Mega Launch 2026"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>

              {/* Segmentation Criteria */}
              <div className="glass-card p-6" style={{ padding: '1rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Filter size={14} color="var(--accent-primary)" /> Dynamic Segmentation Rules
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Lead Stage</label>
                    <select
                      className="input-field"
                      style={{ fontSize: '0.78rem' }}
                      value={filters.statusFilter}
                      onChange={e => setFilters(p => ({ ...p, statusFilter: e.target.value }))}
                    >
                      <option value="All">All Stages</option>
                      <option value="Hot">Hot Leads Only</option>
                      <option value="Warm">Warm Leads Only</option>
                      <option value="New">New Inquiries</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Min. AI Lead Score</label>
                    <select
                      className="input-field"
                      style={{ fontSize: '0.78rem' }}
                      value={filters.minScore}
                      onChange={e => setFilters(p => ({ ...p, minScore: Number(e.target.value) }))}
                    >
                      <option value={0}>Any Score (0+)</option>
                      <option value={50}>Qualified (50+)</option>
                      <option value={80}>High Intent (80+)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 14: AUDIENCE BREAKDOWN CALCULATOR */}
              <div className="glass-card p-6" style={{ padding: '1rem', background: 'var(--bg-tertiary)' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Audience Deduction Formula</span>
                  {estimating && <RefreshCw size={12} className="animate-spin" />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-muted">Targeted Criteria Matches:</span>
                    <strong>{estimation.targeted}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
                    <span>- Opted-Out Contacts (Section 50B):</span>
                    <strong>-{estimation.optedOut}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--warning)' }}>
                    <span>- Missing / Invalid Phone:</span>
                    <strong>-{estimation.invalidPhone}</strong>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                    <strong style={{ color: 'var(--success)' }}>= Final Eligible Audience:</strong>
                    <strong style={{ color: 'var(--success)', fontSize: '1rem' }}>{estimation.finalAudienceCount}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: TEMPLATE SELECTION & PREVIEW */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Select Approved Template</label>
                <select
                  className="input-field"
                  value={selectedTemplate.id}
                  onChange={e => setSelectedTemplate(TEMPLATES.find(t => t.id === Number(e.target.value)))}
                >
                  {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name} ({t.tag})</option>)}
                </select>
              </div>

              {/* Message Live Preview */}
              <div className="glass-card p-6" style={{ padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--whatsapp)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  WhatsApp Message Preview
                </div>
                <div style={{ padding: '0.85rem', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, fontSize: '0.82rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {selectedTemplate.text
                    .replace('{name}', 'Valued Customer')
                    .replace('{product}', 'Tile Adhesive / Industrial Goods')
                    .replace('{budget}', '₹1,00,000')}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                  Variables <code>{'{name}'}</code> and <code>{'{product}'}</code> are dynamically injected per recipient lead.
                </div>
              </div>

              {/* Campaign Media Attachment */}
              <div style={{ marginTop: '0.25rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>📎 Attach Media (optional)</label>
                {campaignFile ? (
                  <div style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {campaignFilePreview
                      ? <img src={campaignFilePreview} alt="preview" style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 6 }} />
                      : <div style={{ width: 42, height: 42, borderRadius: 6, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>📄</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaignFile.name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{(campaignFile.size / 1024).toFixed(0)} KB · Will be sent with each message</div>
                    </div>
                    <button type="button" onClick={() => { setCampaignFile(null); setCampaignFilePreview(null); setUploadedMediaUrl(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem' }}>✕</button>
                  </div>
                ) : (
                  <div
                    onDrop={handleCampaignDrop}
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onClick={() => campaignFileRef.current?.click()}
                    style={{
                      border: `1.5px dashed ${isDragOver ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      borderRadius: 8, padding: '0.8rem',
                      textAlign: 'center', cursor: 'pointer',
                      background: isDragOver ? 'rgba(99,102,241,0.06)' : 'var(--bg-tertiary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <UploadCloud size={16} style={{ opacity: 0.4, marginBottom: 4 }} />
                    <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>Click or drag image / PDF brochure</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>Max 15 MB · PNG, JPG, PDF, MP4</div>
                  </div>
                )}
                <input ref={campaignFileRef} type="file" accept="image/*,.pdf,.mp4" style={{ display: 'none' }} onChange={e => handleCampaignFileSelect(e.target.files[0])} />
              </div>

              {/* Batch Queue Safety Notice */}
              <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 8, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                ⚡ <strong>Section 13 Compliance:</strong> Messages are claimed in atomic batches of 50 by background Edge/Netlify worker with 150ms rate pacing.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button
                  type="submit"
                  className="btn btn-whatsapp"
                  disabled={isSubmitting || estimation.finalAudienceCount === 0 || !name.trim()}
                >
                  <Send size={15} /> {isSubmitting ? 'Queueing Batch...' : `Launch to ${estimation.finalAudienceCount} Contacts`}
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
