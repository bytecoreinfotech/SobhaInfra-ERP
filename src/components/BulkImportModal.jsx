import React, { useState, useRef, useCallback } from 'react';
import {
  X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle,
  FileText, Download, ArrowRight, RefreshCw, Trash2, Users, Send
} from 'lucide-react';
import { bulkCreateLeads, normalizePhone } from '../lib/db';

const SAMPLE_CSV_CONTENT = `Name,Phone,Email,Status,Product,Budget,Company
Rahul Sharma,+919876543210,rahul@example.com,Hot,Tile Adhesive,50000,Apex Builders
Priya Verma,+919812345678,priya@sample.in,Warm,Waterproofing Chemicals,120000,Verma Constructions
Amit Patel,+919898989898,amit@patel.com,New,Epoxy Grout,25000,Patel Tiles & Marble
Suresh Kumar,9765432109,suresh@buildtech.com,Hot,Wall Putty,80000,BuildTech Ltd`;

function parseCSV(text) {
  if (!text || !text.trim()) return { headers: [], rows: [] };
  const lines = text.trim().split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect delimiter: comma, tab, or semicolon
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  let delimiter = ',';
  if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';
  else if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';

  const parseLine = (line) => {
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        values.push(cur.trim().replace(/^["']|["']$/g, ''));
        cur = '';
      } else {
        cur += char;
      }
    }
    values.push(cur.trim().replace(/^["']|["']$/g, ''));
    return values;
  };

  const headers = parseLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    if (vals.some(v => v.length > 0)) {
      const rowObj = {};
      headers.forEach((h, idx) => {
        rowObj[h] = vals[idx] || '';
      });
      rows.push(rowObj);
    }
  }

  return { headers, rows };
}

function autoDetectFieldMap(headers) {
  const map = {
    name: '',
    phone: '',
    email: '',
    status: '',
    product: '',
    budget: '',
    company: '',
  };

  headers.forEach(h => {
    const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!map.name && (lower.includes('name') || lower.includes('customer') || lower.includes('client'))) map.name = h;
    if (!map.phone && (lower.includes('phone') || lower.includes('mobile') || lower.includes('contact') || lower.includes('whatsapp') || lower.includes('cell') || lower.includes('number'))) map.phone = h;
    if (!map.email && (lower.includes('email') || lower.includes('mail'))) map.email = h;
    if (!map.status && (lower.includes('status') || lower.includes('stage'))) map.status = h;
    if (!map.product && (lower.includes('product') || lower.includes('interest') || lower.includes('property') || lower.includes('item'))) map.product = h;
    if (!map.budget && (lower.includes('budget') || lower.includes('amount') || lower.includes('price') || lower.includes('value'))) map.budget = h;
    if (!map.company && (lower.includes('company') || lower.includes('org') || lower.includes('firm') || lower.includes('business'))) map.company = h;
  });

  return map;
}

const BulkImportModal = ({ isOpen, onClose, onImportSuccess, onLaunchCampaignWithLeads }) => {
  const [tab, setTab] = useState('file'); // 'file' | 'paste'
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [parsedData, setParsedData] = useState({ headers: [], rows: [] });
  const [fieldMap, setFieldMap] = useState({ name: '', phone: '', email: '', status: '', product: '', budget: '', company: '' });
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const processTextContent = (text, name = 'Pasted Data') => {
    const { headers, rows } = parseCSV(text);
    setParsedData({ headers, rows });
    setFileName(name);
    setFieldMap(autoDetectFieldMap(headers));
    setImportResult(null);
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      processTextContent(e.target.result, file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'crm_contacts_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Compute processed lead records based on mapping
  const mappedRecords = parsedData.rows.map((row, idx) => {
    const rawPhone = fieldMap.phone ? row[fieldMap.phone] : (row.Phone || row.phone || row.Mobile || '');
    const normPhone = normalizePhone(rawPhone || '');
    const isValidPhone = normPhone.length >= 10;
    const name = fieldMap.name ? row[fieldMap.name] : (row.Name || row.name || `Contact ${idx + 1}`);
    const email = fieldMap.email ? row[fieldMap.email] : (row.Email || row.email || '');
    const status = fieldMap.status ? (row[fieldMap.status] || 'New') : (row.Status || row.status || 'New');
    const product = fieldMap.product ? row[fieldMap.product] : (row.Product || row.product || row.property_interest || '');
    const budget = fieldMap.budget ? row[fieldMap.budget] : (row.Budget || row.budget || '');
    const company = fieldMap.company ? row[fieldMap.company] : (row.Company || row.company || '');

    return {
      rawIndex: idx,
      name: String(name || '').trim(),
      phone: normPhone,
      rawPhone,
      email: String(email || '').trim(),
      status: ['Hot', 'Warm', 'New', 'Cold', 'Converted', 'Lost'].includes(status) ? status : 'New',
      property_interest: String(product || '').trim(),
      budget: String(budget || '').trim(),
      company_name: String(company || '').trim(),
      isValid: isValidPhone,
    };
  });

  const validCount = mappedRecords.filter(r => r.isValid).length;
  const invalidCount = mappedRecords.length - validCount;

  const handleExecuteImport = async () => {
    const validLeads = mappedRecords.filter(r => r.isValid);
    if (validLeads.length === 0) return;

    setIsImporting(true);
    try {
      const { count, data, error } = await bulkCreateLeads(validLeads);
      if (error) {
        setImportResult({ success: false, error: error.message });
      } else {
        setImportResult({
          success: true,
          count: count || validLeads.length,
          leads: data || validLeads,
        });
        if (onImportSuccess) onImportSuccess(data || validLeads);
      }
    } catch (err) {
      setImportResult({ success: false, error: err.message });
    }
    setIsImporting(false);
  };

  const handleLaunchCampaign = () => {
    if (importResult?.leads && onLaunchCampaignWithLeads) {
      onLaunchCampaignWithLeads(importResult.leads);
      onClose();
    }
  };

  const resetAll = () => {
    setParsedData({ headers: [], rows: [] });
    setRawText('');
    setFileName('');
    setImportResult(null);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content modal-lg animate-fade-in" style={{ maxWidth: 840 }}>
        <button
          className="modal-close-btn"
          onClick={onClose}
          title="Close Modal (Esc)"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileSpreadsheet size={22} color="var(--whatsapp)" /> Bulk Import Contacts & Leads
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                Upload CSV / Excel spreadsheets or paste raw contacts with automatic phone normalization (+91).
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDownloadSample}
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', gap: '0.35rem' }}
            >
              <Download size={13} /> Sample CSV Template
            </button>
          </div>
        </div>

        {/* SUCCESS RESULT SCREEN */}
        {importResult?.success ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--success)' }}>
              {importResult.count} Contacts Successfully Imported!
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.4rem', maxWidth: 450, margin: '0.4rem auto 0 auto' }}>
              All valid leads have been added to your CRM master with clean +91 phone formatting and default stages.
            </p>

            <div style={{ display: 'inline-flex', gap: '0.75rem', marginTop: '1.75rem' }}>
              <button className="btn btn-secondary" onClick={onClose}>
                View in CRM
              </button>
              {onLaunchCampaignWithLeads && (
                <button className="btn btn-whatsapp" onClick={handleLaunchCampaign}>
                  <Send size={15} /> Launch WhatsApp Broadcast to These Leads
                </button>
              )}
            </div>
          </div>
        ) : (
          <div>
            {/* STEP 1: INPUT FILE OR PASTE TEXT */}
            {parsedData.rows.length === 0 ? (
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setTab('file')}
                    style={{
                      background: tab === 'file' ? 'var(--accent-primary)' : 'transparent',
                      color: tab === 'file' ? 'white' : 'var(--text-secondary)',
                      fontSize: '0.8rem', padding: '0.4rem 0.85rem',
                    }}
                  >
                    <UploadCloud size={14} /> Upload CSV / Excel
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setTab('paste')}
                    style={{
                      background: tab === 'paste' ? 'var(--accent-primary)' : 'transparent',
                      color: tab === 'paste' ? 'white' : 'var(--text-secondary)',
                      fontSize: '0.8rem', padding: '0.4rem 0.85rem',
                    }}
                  >
                    <FileText size={14} /> Paste Contacts / Numbers
                  </button>
                </div>

                {tab === 'file' ? (
                  <div
                    onDrop={handleDrop}
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${isDragOver ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      borderRadius: 12,
                      padding: '3rem 1.5rem',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: isDragOver ? 'rgba(99,102,241,0.06)' : 'var(--bg-tertiary)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <UploadCloud size={38} color="var(--accent-primary)" style={{ marginBottom: '0.75rem', opacity: 0.8 }} />
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                      Drag and drop your contact spreadsheet here
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Supports .csv, .txt, .tsv files with Name, Phone, Email, Product, Stage columns
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt,.tsv"
                      style={{ display: 'none' }}
                      onChange={e => handleFileSelect(e.target.files[0])}
                    />
                  </div>
                ) : (
                  <div>
                    <textarea
                      className="input-field"
                      rows={7}
                      placeholder={`Paste CSV data or phone numbers here...\n\nExample:\nRahul Sharma, 9876543210, rahul@mail.com, Hot, Tile Adhesive\nPriya Verma, 9812345678, priya@mail.com, Warm, Waterproofing`}
                      value={rawText}
                      onChange={e => setRawText(e.target.value)}
                      style={{ fontFamily: 'monospace', fontSize: '0.78rem', width: '100%', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                      <button
                        type="button"
                        className="btn btn-whatsapp"
                        disabled={!rawText.trim()}
                        onClick={() => processTextContent(rawText, 'Pasted Contacts')}
                      >
                        Parse Contacts <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* STEP 2: COLUMN MAPPING & PREVIEW */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '0.65rem 1rem', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                    <FileText size={16} color="var(--accent-primary)" />
                    <strong>{fileName}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>({parsedData.rows.length} rows detected)</span>
                  </div>
                  <button
                    type="button"
                    onClick={resetAll}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <Trash2 size={13} /> Change File
                  </button>
                </div>

                {/* Column Mapping Selector */}
                <div className="glass-card p-6" style={{ padding: '0.9rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.6rem', color: 'var(--text-secondary)' }}>
                    Map CSV Columns to CRM Lead Fields:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem' }}>
                    {[
                      { key: 'phone', label: 'Phone / WhatsApp *', req: true },
                      { key: 'name', label: 'Contact Name' },
                      { key: 'email', label: 'Email' },
                      { key: 'status', label: 'Lead Stage' },
                      { key: 'product', label: 'Product / Interest' },
                      { key: 'budget', label: 'Budget / Amount' },
                    ].map(col => (
                      <div key={col.key}>
                        <label style={{ fontSize: '0.68rem', color: col.req ? 'var(--accent-primary)' : 'var(--text-muted)', display: 'block', marginBottom: '0.2rem', fontWeight: col.req ? 700 : 500 }}>
                          {col.label}
                        </label>
                        <select
                          className="input-field"
                          style={{ fontSize: '0.72rem', padding: '0.3rem 0.5rem' }}
                          value={fieldMap[col.key] || ''}
                          onChange={e => setFieldMap(p => ({ ...p, [col.key]: e.target.value }))}
                        >
                          <option value="">-- None / Default --</option>
                          {parsedData.headers.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Validation Stats Bar */}
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <CheckCircle2 size={14} /> <strong>{validCount}</strong> Valid Numbers Ready
                  </span>
                  {invalidCount > 0 && (
                    <span style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <AlertCircle size={14} /> <strong>{invalidCount}</strong> Invalid / Missing Phone (will be skipped)
                    </span>
                  )}
                </div>

                {/* Preview Table */}
                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                  <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                        <th style={{ padding: '0.45rem 0.6rem' }}>#</th>
                        <th style={{ padding: '0.45rem 0.6rem' }}>Name</th>
                        <th style={{ padding: '0.45rem 0.6rem' }}>Phone (+91 Formatted)</th>
                        <th style={{ padding: '0.45rem 0.6rem' }}>Stage</th>
                        <th style={{ padding: '0.45rem 0.6rem' }}>Product / Interest</th>
                        <th style={{ padding: '0.45rem 0.6rem' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappedRecords.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', opacity: r.isValid ? 1 : 0.6 }}>
                          <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600 }}>{r.name}</td>
                          <td style={{ padding: '0.45rem 0.6rem', fontFamily: 'monospace' }}>
                            {r.phone || r.rawPhone || '<empty>'}
                          </td>
                          <td style={{ padding: '0.45rem 0.6rem' }}>{r.status}</td>
                          <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-muted)' }}>{r.property_interest || '-'}</td>
                          <td style={{ padding: '0.45rem 0.6rem' }}>
                            {r.isValid ? (
                              <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Ready</span>
                            ) : (
                              <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>Invalid Phone</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {mappedRecords.length > 10 && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                            + {mappedRecords.length - 10} more records ready to import
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {importResult?.error && (
                  <div style={{ color: 'var(--danger)', fontSize: '0.75rem', padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
                    ⚠️ Import Error: {importResult.error}
                  </div>
                )}

                {/* Bottom Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-whatsapp"
                    disabled={isImporting || validCount === 0}
                    onClick={handleExecuteImport}
                  >
                    {isImporting ? (
                      <><RefreshCw size={14} className="animate-spin" /> Importing...</>
                    ) : (
                      <><Users size={14} /> Import {validCount} Leads to CRM</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkImportModal;
