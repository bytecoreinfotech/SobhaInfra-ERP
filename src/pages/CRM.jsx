import React, { useState, useEffect } from 'react';
import {
  MessageCircle, Mail, Phone, Plus, Search, Filter,
  X, CheckCircle2, Send, User, Building2, Star,
  ChevronRight, MoreVertical, RefreshCw, Trash2, Edit2,
  Columns, List, Eye, Zap, ArrowRight, FileSpreadsheet,
  CheckSquare, Square, Download
} from 'lucide-react';
import { getLeads, createLead, updateLead, deleteLead, normalizePhone } from '../lib/db';
import Customer360Modal from '../components/Customer360Modal';
import ProductCatalogModal from '../components/ProductCatalogModal';
import BulkImportModal from '../components/BulkImportModal';
import CampaignBuilderModal from '../components/CampaignBuilderModal';
import EmailComposeModal from '../components/EmailComposeModal';
import { Skeleton, SkeletonCard } from '../components/Skeleton';
import './Pages.css';

const statusConfig = {
  Hot:       { badge: 'badge-danger',   dot: '#ef4444' },
  Warm:      { badge: 'badge-warning',  dot: '#f59e0b' },
  New:       { badge: 'badge-neutral',  dot: '#94a3b8' },
  Cold:      { badge: 'badge-neutral',  dot: '#64748b' },
  Converted: { badge: 'badge-success',  dot: '#10b981' },
  Lost:      { badge: 'badge-neutral',  dot: '#475569' },
};

const sourceColors = {
  WhatsApp:  '#25d366', Facebook: '#1877f2', Instagram: '#e1306c',
  Website:   '#6366f1', Referral: '#f59e0b', 'Walk-in': '#10b981',
  'Import / CSV': '#8b5cf6',
};

const STAGES = ['New', 'Hot', 'Warm', 'Cold', 'Converted', 'Lost'];
const SOURCES = ['All', 'WhatsApp', 'Facebook', 'Instagram', 'Website', 'Referral', 'Walk-in', 'Import / CSV'];
const EMPTY_LEAD = { name: '', phone: '', email: '', source: 'WhatsApp', status: 'New', property_interest: '', budget: '', notes: '' };

const CRM = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'kanban'
  
  // Email Compose State
  const [emailModalLead, setEmailModalLead] = useState(null);

  // Multi-select for bulk actions
  const [selectedLeadIds, setSelectedLeadIds] = useState(new Set());

  // Modals
  const [selected360LeadId, setSelected360LeadId] = useState(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showCampaignBuilder, setShowCampaignBuilder] = useState(false);
  const [campaignRecipients, setCampaignRecipients] = useState(null);
  const [editLead, setEditLead] = useState(null);
  const [form, setForm] = useState(EMPTY_LEAD);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => { loadLeads(); }, []);

  const loadLeads = async () => {
    setLoading(true);
    const { data } = await getLeads();
    setLeads(data || []);
    setLoading(false);
  };

  const showToast = (msg, isError = false) => {
    setToastMessage({ text: msg, isError });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const normSearch = search.trim().toLowerCase();
  const filtered = leads.filter(l => {
    const matchStage = activeFilter === 'All' || l.status === activeFilter;
    const matchSource = sourceFilter === 'All' || l.source === sourceFilter;
    const matchSearch = !normSearch ||
      (l.name && l.name.toLowerCase().includes(normSearch)) ||
      (l.phone && l.phone.includes(normSearch)) ||
      (l.property_interest && l.property_interest.toLowerCase().includes(normSearch)) ||
      (l.source && l.source.toLowerCase().includes(normSearch));
    return matchStage && matchSource && matchSearch;
  });

  const openAdd = () => { setForm(EMPTY_LEAD); setEditLead(null); setShowForm(true); };
  const openEdit = (lead, e) => {
    e?.stopPropagation();
    setForm({
      name: lead.name,
      phone: lead.phone || '',
      email: lead.email || '',
      source: lead.source,
      status: lead.status,
      property_interest: lead.property_interest || '',
      budget: lead.budget || '',
      notes: lead.notes || '',
    });
    setEditLead(lead);
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      showToast('Name and Phone number are required', true);
      return;
    }
    setSaving(true);
    try {
      if (editLead) {
        const { error } = await updateLead(editLead.id, form);
        if (error) {
          showToast('Failed to update lead: ' + error.message, true);
        } else {
          showToast('Lead updated successfully!');
          await loadLeads();
          setShowForm(false);
          setEditLead(null);
        }
      } else {
        const { error } = await createLead(form);
        if (error) {
          showToast('Failed to create lead: ' + error.message, true);
        } else {
          showToast('Lead added successfully!');
          await loadLeads();
          setShowForm(false);
          setEditLead(null);
          setForm(EMPTY_LEAD);
        }
      }
    } catch (err) {
      showToast('Error: ' + err.message, true);
    }
    setSaving(false);
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    await deleteLead(id);
    setLeads(prev => prev.filter(l => l.id !== id));
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    showToast('Lead deleted.');
  };

  const handleStageChange = async (leadId, newStatus) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
    await updateLead(leadId, { status: newStatus });
  };

  // Multi-select handlers
  const toggleSelectAll = () => {
    if (selectedLeadIds.size === filtered.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(filtered.map(l => l.id)));
    }
  };

  const toggleLeadCheckbox = (id, e) => {
    e?.stopPropagation();
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Bulk Actions
  const handleLaunchCampaignWithSelected = () => {
    const selectedLeads = leads.filter(l => selectedLeadIds.has(l.id));
    if (selectedLeads.length === 0) return;
    setCampaignRecipients(selectedLeads);
    setShowCampaignBuilder(true);
  };

  const handleBulkStageChange = async (newStatus) => {
    const ids = Array.from(selectedLeadIds);
    setLeads(prev => prev.map(l => selectedLeadIds.has(l.id) ? { ...l, status: newStatus } : l));
    for (const id of ids) {
      await updateLead(id, { status: newStatus });
    }
    showToast(`Updated ${ids.length} leads to ${newStatus}`);
    setSelectedLeadIds(new Set());
  };

  const handleExportSelectedCSV = () => {
    const selected = leads.filter(l => selectedLeadIds.has(l.id));
    if (selected.length === 0) return;

    const headers = ['Name', 'Phone', 'Email', 'Status', 'Product', 'Budget', 'Source'];
    const rows = selected.map(l => [
      `"${l.name || ''}"`,
      `"${normalizePhone(l.phone || '')}"`,
      `"${l.email || ''}"`,
      `"${l.status || ''}"`,
      `"${l.property_interest || ''}"`,
      `"${l.budget || ''}"`,
      `"${l.source || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `crm_export_${Date.now()}.csv`;
    link.click();
  };

  const counts = STAGES.reduce((acc, f) => ({ ...acc, [f]: leads.filter(l => l.status === f).length }), {});

  return (
    <div className="page-container animate-fade-in" style={{ position: 'relative', paddingBottom: selectedLeadIds.size > 0 ? '5rem' : '2rem' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">CRM & Customer 360</h1>
          <p className="page-subtitle">Unified sales pipeline, WhatsApp lead qualification, and bulk contact management.</p>
        </div>
        <div className="page-actions">
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button
              className="btn"
              onClick={() => setViewMode('table')}
              style={{
                borderRadius: 0,
                background: viewMode === 'table' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: viewMode === 'table' ? 'white' : 'var(--text-secondary)',
                padding: '0.4rem 0.75rem',
              }}
            >
              <List size={14} /> Table
            </button>
            <button
              className="btn"
              onClick={() => setViewMode('kanban')}
              style={{
                borderRadius: 0,
                background: viewMode === 'kanban' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: viewMode === 'kanban' ? 'white' : 'var(--text-secondary)',
                padding: '0.4rem 0.75rem',
              }}
            >
              <Columns size={14} /> Pipeline
            </button>
          </div>

          <button className="btn btn-secondary" onClick={() => setShowCatalog(true)}>
            <Building2 size={15} /> Catalog
          </button>

          <button className="btn btn-secondary" onClick={() => setShowBulkImport(true)} style={{ color: 'var(--whatsapp)' }}>
            <FileSpreadsheet size={15} /> Import CSV / Excel
          </button>

          <button className="btn btn-secondary" onClick={loadLeads}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={15} /> Add Lead
          </button>
        </div>
      </div>

      {/* Pipeline Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        {STAGES.map(s => (
          <div
            key={s}
            className="glass-card"
            style={{
              padding: '0.85rem 1rem',
              textAlign: 'center',
              cursor: 'pointer',
              border: activeFilter === s ? `2px solid ${statusConfig[s]?.dot}` : '1px solid var(--border-color)',
              transition: 'all 0.2s',
            }}
            onClick={() => setActiveFilter(activeFilter === s ? 'All' : s)}
          >
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <Skeleton width="45px" height="24px" borderRadius="4px" />
                <Skeleton width="50px" height="11px" borderRadius="3px" style={{ opacity: 0.6 }} />
              </div>
            ) : (
              <>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: statusConfig[s]?.dot, fontFamily: 'Outfit, sans-serif' }}>
                  {counts[s] || 0}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{s}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Search and Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <div className="input-group" style={{ flex: 1, minWidth: 240 }}>
          <Search size={15} className="input-icon" />
          <input
            type="text"
            className="input-field"
            placeholder="Search by name, phone (+91 optional), product, source..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Source Dropdown Filter */}
        <select
          className="input-field"
          style={{ width: 'auto', fontSize: '0.75rem', padding: '0.4rem 0.65rem' }}
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
        >
          <option value="All">All Channels (Meta / WA / Web)</option>
          <option value="Facebook">📘 Facebook Leads</option>
          <option value="Instagram">📸 Instagram Leads</option>
          <option value="WhatsApp">💬 WhatsApp Inquiries</option>
          <option value="Website">🌐 Website Leads</option>
          <option value="Import / CSV">📁 Import / CSV</option>
          <option value="Referral">👥 Referral</option>
          <option value="Walk-in">🏢 Walk-in</option>
        </select>

        <div className="filter-bar" style={{ margin: 0 }}>
          <button className={`filter-chip ${activeFilter === 'All' ? 'active' : ''}`} onClick={() => setActiveFilter('All')}>
            All Stages ({leads.length})
          </button>
          {STAGES.map(f => (
            <button key={f} className={`filter-chip ${activeFilter === f ? 'active' : ''}`} onClick={() => setActiveFilter(f)}>
              {f} <span style={{ opacity: 0.7, fontSize: '0.68rem' }}>({counts[f] || 0})</span>
            </button>
          ))}
        </div>
      </div>

      {/* View: Table Mode */}
      {viewMode === 'table' && (
        <div className="glass-card table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedLeadIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer' }}
                    title="Select / Deselect All"
                  />
                </th>
                <th>Lead / Contact</th>
                <th>Phone (Normalized)</th>
                <th>Status</th>
                <th>AI Score</th>
                <th>Product Interest</th>
                <th>Budget</th>
                <th>Source</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, rIdx) => (
                  <tr key={rIdx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '0.75rem 0.5rem' }}>
                      <Skeleton width="16px" height="16px" borderRadius="3px" />
                    </td>
                    <td style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Skeleton width="28px" height="28px" borderRadius="50%" style={{ flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <Skeleton width={`${110 + (rIdx % 3) * 20}px`} height="14px" borderRadius="4px" />
                          <Skeleton width={`${70 + (rIdx % 2) * 15}px`} height="11px" borderRadius="3px" style={{ opacity: 0.6 }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                      <Skeleton width="105px" height="13px" borderRadius="4px" />
                    </td>
                    <td style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                      <Skeleton width="65px" height="22px" borderRadius="9999px" />
                    </td>
                    <td style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                      <Skeleton width="45px" height="20px" borderRadius="4px" />
                    </td>
                    <td style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                      <Skeleton width="110px" height="13px" borderRadius="4px" />
                    </td>
                    <td style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                      <Skeleton width="75px" height="14px" borderRadius="4px" />
                    </td>
                    <td style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                      <Skeleton width="65px" height="20px" borderRadius="9999px" />
                    </td>
                    <td style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <Skeleton width="26px" height="26px" borderRadius="4px" />
                        <Skeleton width="26px" height="26px" borderRadius="4px" />
                        <Skeleton width="26px" height="26px" borderRadius="4px" />
                        <Skeleton width="26px" height="26px" borderRadius="4px" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                      {leads.length === 0 ? 'No leads in your database yet.' : 'No leads match your search criteria.'}
                    </div>
                    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <button className="btn btn-primary btn-sm" onClick={openAdd}>
                        <Plus size={14} /> Add First Lead
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkImport(true)}>
                        <FileSpreadsheet size={14} /> Import CSV
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(lead => {
                  const isSelected = selectedLeadIds.has(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setSelected360LeadId(lead.id)}
                      style={{ cursor: 'pointer', background: isSelected ? 'rgba(99,102,241,0.06)' : undefined }}
                      className="hover-row"
                    >
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleLeadCheckbox(lead.id, e)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div className="mini-avatar" style={{ background: `${statusConfig[lead.status]?.dot}22`, color: statusConfig[lead.status]?.dot, border: `1.5px solid ${statusConfig[lead.status]?.dot}` }}>
                            {lead.name ? lead.name.slice(0, 2).toUpperCase() : 'LE'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{lead.name}</div>
                            {lead.notes && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.notes}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'monospace' }}>
                          <Phone size={11} color="var(--text-muted)" />{normalizePhone(lead.phone)}
                        </div>
                      </td>
                      <td><span className={`badge ${statusConfig[lead.status]?.badge}`}>{lead.status}</span></td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontWeight: 700, color: lead.lead_score >= 80 ? 'var(--danger)' : lead.lead_score >= 50 ? 'var(--warning)' : 'var(--text-muted)' }}>
                          ⚡ {lead.lead_score || 0}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.property_interest || '—'}</td>
                      <td style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--success)' }}>{lead.budget || '—'}</td>
                      <td>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: sourceColors[lead.source] || 'var(--text-muted)', background: (sourceColors[lead.source] || '#666') + '18', padding: '0.2rem 0.5rem', borderRadius: 99 }}>
                          {lead.source}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem' }} onClick={e => e.stopPropagation()}>
                          <button className="btn-icon" title="View Customer 360" onClick={() => setSelected360LeadId(lead.id)}>
                            <Eye size={14} color="var(--accent-primary)" />
                          </button>
                          <button
                            className="btn-icon"
                            title={lead.email ? `Send Email to ${lead.email}` : "Send Direct Email"}
                            onClick={e => {
                              e.stopPropagation();
                              setEmailModalLead(lead);
                            }}
                            style={{ color: lead.email ? 'var(--primary, #6366f1)' : 'var(--text-muted)' }}
                          >
                            <Mail size={14} />
                          </button>
                          <button className="btn-icon" title="Edit" onClick={e => openEdit(lead, e)}>
                            <Edit2 size={14} />
                          </button>
                          <button className="btn-icon" title="Delete" onClick={e => handleDelete(lead.id, e)}>
                            <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Table Footer with lead counts */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-tertiary)', fontSize: '0.78rem', color: 'var(--text-muted)'
          }}>
            <div>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Showing</span>
                  <Skeleton width="40px" height="14px" borderRadius="3px" />
                  <span>leads</span>
                </div>
              ) : (
                <span>Showing <strong>{filtered.length}</strong> of <strong>{leads.length}</strong> total leads</span>
              )}
            </div>
            {selectedLeadIds.size > 0 && (
              <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                {selectedLeadIds.size} leads selected
              </span>
            )}
          </div>
        </div>
      )}

      {/* View: Pipeline Kanban Board Mode */}
      {viewMode === 'kanban' && (
        <div className="kanban-board" style={{ overflowX: 'auto' }}>
          {STAGES.map(stage => {
            const stageLeads = filtered.filter(l => l.status === stage);
            return (
              <div key={stage} className="kanban-col" style={{ minWidth: 250 }}>
                <div className="kanban-col-header">
                  <span className="kanban-col-title" style={{ color: statusConfig[stage]?.dot }}>{stage}</span>
                  <span className="kanban-count">{loading ? '—' : stageLeads.length}</span>
                </div>
                <div className="kanban-cards">
                  {loading ? (
                    <>
                      <SkeletonCard height="105px" />
                      <SkeletonCard height="105px" />
                    </>
                  ) : (
                    stageLeads.map(lead => (
                    <div
                      key={lead.id}
                      className="kanban-card"
                      onClick={() => setSelected360LeadId(lead.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                        <div className="kanban-card-title">{lead.name}</div>
                        <span className="badge badge-neutral" style={{ fontSize: '0.62rem', fontWeight: 700 }}>
                          ⚡ {lead.lead_score || 0}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                        {lead.property_interest || 'General Inquiry'}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--success)' }}>{lead.budget || '—'}</span>
                        <span style={{ color: sourceColors[lead.source] || 'var(--text-muted)', fontWeight: 600 }}>{lead.source}</span>
                      </div>
                      {/* Move stage buttons */}
                      <div style={{ display: 'flex', gap: '0.2rem', marginTop: '0.6rem', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                        {STAGES.filter(s => s !== stage).slice(0, 2).map(nextS => (
                          <button
                            key={nextS}
                            onClick={() => handleStageChange(lead.id, nextS)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.58rem', padding: '0.15rem 0.35rem' }}
                          >
                            → {nextS}
                          </button>
                        ))}
                      </div>
                    </div>
                  )))}
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed' }}
                    onClick={() => { setForm({ ...EMPTY_LEAD, status: stage }); setShowForm(true); }}
                  >
                    <Plus size={13} /> Add
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* STICKY FLOATING BULK ACTIONS BAR */}
      {selectedLeadIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '1.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 900,
          background: 'var(--bg-primary, #0f172a)',
          border: '1px solid var(--accent-primary, #6366f1)',
          borderRadius: 50,
          padding: '0.6rem 1.25rem',
          boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          backdropFilter: 'blur(16px)',
          animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
            <span style={{ background: 'var(--accent-primary)', color: 'white', borderRadius: 99, padding: '0.15rem 0.55rem', fontSize: '0.75rem' }}>
              {selectedLeadIds.size}
            </span>
            Leads Selected
          </div>

          <div style={{ height: 20, width: 1, background: 'var(--border-color)' }} />

          <button
            className="btn btn-whatsapp btn-sm"
            onClick={handleLaunchCampaignWithSelected}
            style={{ borderRadius: 99, padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
          >
            <Send size={14} /> Launch WhatsApp Broadcast
          </button>

          {/* Bulk Stage Dropdown */}
          <select
            className="input-field"
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem', width: 'auto', borderRadius: 99 }}
            onChange={e => { if (e.target.value) handleBulkStageChange(e.target.value); }}
            defaultValue=""
          >
            <option value="" disabled>Move Stage...</option>
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportSelectedCSV}
            style={{ borderRadius: 99, padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
            title="Export selected contacts to CSV"
          >
            <Download size={13} /> Export CSV
          </button>

          <button
            type="button"
            onClick={() => setSelectedLeadIds(new Set())}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.2rem' }}
            title="Clear selection"
          >
            ✕
          </button>
        </div>
      )}

      {/* Customer 360 Full Modal */}
      {selected360LeadId && (
        <Customer360Modal
          leadId={selected360LeadId}
          onClose={() => setSelected360LeadId(null)}
          onLeadUpdated={loadLeads}
        />
      )}

      {/* Product Catalog Modal */}
      {showCatalog && (
        <ProductCatalogModal
          isOpen={showCatalog}
          onClose={() => setShowCatalog(false)}
        />
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <BulkImportModal
          isOpen={showBulkImport}
          onClose={() => setShowBulkImport(false)}
          onImportSuccess={(imported) => {
            loadLeads();
            showToast(`${imported.length} contacts imported successfully!`);
          }}
          onLaunchCampaignWithLeads={(importedLeads) => {
            setCampaignRecipients(importedLeads);
            setShowCampaignBuilder(true);
          }}
        />
      )}

      {/* Campaign Builder Modal */}
      {showCampaignBuilder && (
        <CampaignBuilderModal
          isOpen={showCampaignBuilder}
          onClose={() => {
            setShowCampaignBuilder(false);
            setCampaignRecipients(null);
          }}
          initialRecipients={campaignRecipients}
          onCampaignQueued={() => {
            showToast('Campaign successfully queued and dispatched!');
            setSelectedLeadIds(new Set());
          }}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '1.5rem',
          right: '1.5rem',
          zIndex: 9999,
          background: toastMessage.isError ? 'var(--danger, #ef4444)' : 'var(--success, #10b981)',
          color: 'white',
          padding: '0.75rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.2s ease',
          fontSize: '0.85rem',
          fontWeight: 600
        }}>
          <CheckCircle2 size={16} /> {toastMessage.text}
        </div>
      )}

      {/* Add / Edit Lead Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal-content modal-lg animate-fade-in">
            <button
              className="modal-close-btn"
              onClick={() => setShowForm(false)}
              title="Close Modal (Esc)"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', paddingRight: '2.5rem' }}>
              {editLead ? 'Edit Lead Profile' : 'Add New Lead to CRM'}
            </h2>
            <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Full Name *</label>
                <input type="text" className="input-field" placeholder="e.g. Rajesh Kumar" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Phone Number (+91 is optional) *</label>
                <input type="text" className="input-field" placeholder="9876543210 (or +91...)" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} required />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Email Address</label>
                <input type="email" className="input-field" placeholder="customer@example.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Target Budget</label>
                <input type="text" className="input-field" placeholder="₹1,00,000" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Interested Product / Requirement</label>
                <input type="text" className="input-field" placeholder="e.g. Product Name, Requirement, or Service" value={form.property_interest} onChange={e => setForm(p => ({ ...p, property_interest: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Lead Source</label>
                <select className="input-field" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}>
                  {['WhatsApp','Facebook','Instagram','Website','Walk-in','Referral','Import / CSV'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Pipeline Status</label>
                <select className="input-field" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  {STAGES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Internal Notes</label>
                <textarea className="input-field textarea-field" rows={2} placeholder="Any specific requirements or notes..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editLead ? 'Update Lead' : 'Add Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Email Compose Modal */}
      {emailModalLead && (
        <EmailComposeModal
          lead={emailModalLead}
          onClose={() => setEmailModalLead(null)}
          onEmailSent={() => {
            fetchLeads();
          }}
        />
      )}
    </div>
  );
};

export default CRM;
