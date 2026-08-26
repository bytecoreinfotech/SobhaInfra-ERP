import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Building2, Phone, FileText, CheckCircle2, AlertTriangle,
  Clock, TrendingDown, Send, MessageCircle, User, Link2,
  IndianRupee, Calendar, ChevronRight, Activity, Sparkles,
  ExternalLink, Download, ShieldCheck, RotateCcw
} from 'lucide-react';

const INR_SHORT = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

function daysOld(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000);
}

function agingBucket(dueDate) {
  const d = daysOld(dueDate);
  if (d <= 30) return { label: '0–30 days', color: '#10b981', bg: '#ecfdf5' };
  if (d <= 60) return { label: '31–60 days', color: '#f59e0b', bg: '#fffbeb' };
  if (d <= 90) return { label: '61–90 days', color: '#f97316', bg: '#fff7ed' };
  return { label: '90+ days', color: '#ef4444', bg: '#fef2f2' };
}

function StatusBadge({ status }) {
  const cfg = {
    Paid:    { bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0' },
    Pending: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
    Overdue: { bg: '#fef2f2', color: '#7f1d1d', border: '#fecaca' },
    Draft:   { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' },
  }[status] || { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {status === 'Paid' && <CheckCircle2 size={10} />}
      {status === 'Overdue' && <AlertTriangle size={10} />}
      {status === 'Pending' && <Clock size={10} />}
      {status}
    </span>
  );
}

export default function LedgerDetailDrawer({ mapping, allInvoices, onClose, onEditLink, supabaseClient }) {
  const [section, setSection] = useState('overview');
  const [waMessages, setWaMessages] = useState([]);
  const [waLoading, setWaLoading] = useState(false);

  const vouchers = (allInvoices || []).filter(
    inv => inv.client_name && inv.client_name.trim().toLowerCase() === (mapping?.tally_ledger_name || '').trim().toLowerCase()
  );

  const loadWaHistory = useCallback(async () => {
    const phone = mapping?.lead_phone && mapping.lead_phone !== '—' ? mapping.lead_phone : null;
    if (!phone || !supabaseClient) return;
    setWaLoading(true);
    try {
      const phoneDigits = phone.replace(/\D/g, '').slice(-10);
      const { data: convos } = await supabaseClient
        .from('whatsapp_conversations')
        .select('id, contact_phone, contact_name, last_message_at')
        .ilike('contact_phone', `%${phoneDigits}%`)
        .limit(3);
      if (convos && convos.length > 0) {
        const allMsgs = [];
        for (const c of convos) {
          const { data: msgs } = await supabaseClient
            .from('whatsapp_messages')
            .select('id, direction, message_type, text_content, created_at, status')
            .eq('conversation_id', c.id)
            .order('created_at', { ascending: false })
            .limit(20);
          if (msgs) allMsgs.push(...msgs.map(m => ({ ...m, contact_name: c.contact_name })));
        }
        setWaMessages(allMsgs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      }
    } catch (_) {}
    finally { setWaLoading(false); }
  }, [mapping, supabaseClient]);

  useEffect(() => {
    if (section === 'comms') loadWaHistory();
  }, [section, loadWaHistory]);

  if (!mapping) return null;

  const totalBilled  = vouchers.reduce((s, v) => s + Number(v.amount || 0), 0);
  const totalPaid    = vouchers.filter(v => v.status === 'Paid').reduce((s, v) => s + Number(v.amount || 0), 0);
  const totalPending = vouchers.filter(v => v.status === 'Pending').reduce((s, v) => s + Number(v.amount || 0), 0);
  const totalOverdue = vouchers.filter(v => v.status === 'Overdue').reduce((s, v) => s + Number(v.amount || 0), 0);
  const outstanding  = totalPending + totalOverdue;
  const agingVouchers = vouchers.filter(v => v.status !== 'Paid');
  const aging = {
    '0–30':  agingVouchers.filter(v => daysOld(v.due_date || v.invoice_date) <= 30).reduce((s, v) => s + Number(v.amount || 0), 0),
    '31–60': agingVouchers.filter(v => { const d = daysOld(v.due_date || v.invoice_date); return d > 30 && d <= 60; }).reduce((s, v) => s + Number(v.amount || 0), 0),
    '61–90': agingVouchers.filter(v => { const d = daysOld(v.due_date || v.invoice_date); return d > 60 && d <= 90; }).reduce((s, v) => s + Number(v.amount || 0), 0),
    '90+':   agingVouchers.filter(v => daysOld(v.due_date || v.invoice_date) > 90).reduce((s, v) => s + Number(v.amount || 0), 0),
  };
  const largestVoucher = [...vouchers].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
  const lastTxn = [...vouchers].sort((a, b) => new Date(b.invoice_date || b.created_at) - new Date(a.invoice_date || a.created_at))[0];
  const totalReminders = vouchers.reduce((s, v) => s + Number(v.reminder_count || 0), 0);

  const tabs = [
    { id: 'overview', label: 'Overview',           icon: <Activity size={14} /> },
    { id: 'vouchers', label: `Vouchers (${vouchers.length})`, icon: <FileText size={14} /> },
    { id: 'comms',    label: 'WhatsApp History',   icon: <MessageCircle size={14} /> },
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)', animation: 'fadeInDrawer 0.2s ease' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9001, width: 'min(680px, 95vw)', background: '#fff', borderLeft: '1px solid #e2e8f0', boxShadow: '-8px 0 40px rgba(15,23,42,0.12)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.28s cubic-bezier(0.16,1,0.3,1)', fontFamily: "'Inter', sans-serif", overflowY: 'auto' }}>
        
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(to right, #f8fafc, #ffffff)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
                <Building2 size={18} color="#fff" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mapping.tally_ledger_name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  {mapping.lead_name && <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}><User size={10} />{mapping.lead_name}</span>}
                  {mapping.lead_phone && mapping.lead_phone !== '—' && <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={10} />{mapping.lead_phone}</span>}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: mapping.mapping_status === 'MAPPED' ? '#ecfdf5' : '#fffbeb', color: mapping.mapping_status === 'MAPPED' ? '#065f46' : '#92400e', border: `1px solid ${mapping.mapping_status === 'MAPPED' ? '#a7f3d0' : '#fde68a'}` }}>
                    {mapping.mapping_status === 'MAPPED' ? '✓ MAPPED' : mapping.mapping_status === 'AUTO_FOUND' ? '⚡ AUTO DETECTED' : '⏳ PENDING'}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
              <button onClick={onEditLink} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#f0f4ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}><Link2 size={12} />Edit Link</button>
              <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: '1px solid #e2e8f0', cursor: 'pointer', color: '#64748b' }}><X size={15} /></button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setSection(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 13px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s', background: section === t.id ? '#6366f1' : 'transparent', color: section === t.id ? '#fff' : '#64748b', border: section === t.id ? '1px solid #6366f1' : '1px solid #e2e8f0' }}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── OVERVIEW ── */}
        {section === 'overview' && (
          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Total Billed', value: INR_SHORT(totalBilled), color: '#1e293b', bg: '#f8fafc', border: '#e2e8f0' },
                { label: 'Total Paid', value: INR_SHORT(totalPaid), color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
                { label: 'Outstanding', value: INR_SHORT(outstanding), color: outstanding > 0 ? '#7f1d1d' : '#065f46', bg: outstanding > 0 ? '#fef2f2' : '#ecfdf5', border: outstanding > 0 ? '#fecaca' : '#a7f3d0' },
                { label: 'Overdue', value: INR_SHORT(totalOverdue), color: '#7f1d1d', bg: '#fef2f2', border: '#fecaca' },
              ].map(k => (
                <div key={k.label} style={{ padding: '10px 8px', borderRadius: 10, background: k.bg, border: `1px solid ${k.border}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                <TrendingDown size={13} color="#ef4444" /> Ageing Breakdown (Outstanding Dues Only)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 7 }}>
                {[
                  { label: '0–30 days', value: aging['0–30'], color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', sub: 'Current' },
                  { label: '31–60 days', value: aging['31–60'], color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', sub: 'Slight Risk' },
                  { label: '61–90 days', value: aging['61–90'], color: '#f97316', bg: '#fff7ed', border: '#fed7aa', sub: 'Overdue' },
                  { label: '90+ days', value: aging['90+'], color: '#ef4444', bg: '#fef2f2', border: '#fecaca', sub: 'Critical' },
                ].map(b => (
                  <div key={b.label} style={{ borderRadius: 8, background: b.bg, border: `1px solid ${b.border}`, padding: '9px 7px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{b.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: b.color }}>{INR_SHORT(b.value)}</div>
                    <div style={{ fontSize: 9, color: b.color, opacity: 0.8, marginTop: 2 }}>{b.sub}</div>
                  </div>
                ))}
              </div>
              {outstanding === 0 && <div style={{ marginTop: 8, textAlign: 'center', padding: '7px', background: '#ecfdf5', borderRadius: 7, fontSize: 11, color: '#065f46', fontWeight: 600 }}>✅ All invoices settled — no outstanding dues</div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '13px' }}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 7 }}>Account Summary</div>
                {[
                  ['Total Vouchers', vouchers.length],
                  ['Paid', vouchers.filter(v => v.status === 'Paid').length],
                  ['Pending', vouchers.filter(v => v.status === 'Pending').length],
                  ['Overdue', vouchers.filter(v => v.status === 'Overdue').length],
                  ['WA Reminders', totalReminders],
                  ['Reminders Paused', vouchers.filter(v => v.reminder_paused).length],
                ].map(([lbl, val]) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #f1f5f9', fontSize: 11 }}>
                    <span style={{ color: '#64748b' }}>{lbl}</span>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{val}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {largestVoucher && (
                  <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '13px' }}>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Largest Voucher</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{largestVoucher.invoice_number}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#6366f1', marginTop: 2 }}>{INR_SHORT(largestVoucher.amount)}</div>
                    <div style={{ marginTop: 4 }}><StatusBadge status={largestVoucher.status} /></div>
                  </div>
                )}
                {lastTxn && (
                  <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '13px' }}>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Last Transaction</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{lastTxn.invoice_date ? new Date(lastTxn.invoice_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{lastTxn.invoice_number}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 3 }}>{INR_SHORT(lastTxn.amount)}</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: '#f0f4ff', borderRadius: 12, border: '1px solid #c7d2fe', padding: '13px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 9, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ShieldCheck size={12} />Tally Accounting Details
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['Tally Company', vouchers[0]?.metadata?.tally_company || vouchers[0]?.company_name || '—'],
                  ['Sync Source', 'TallyPrime XML Bridge'],
                  ['Client Phone (Tally)', vouchers[0]?.client_phone || mapping.lead_phone || '—'],
                  ['Last Sync', vouchers[0] ? new Date(vouchers[0].updated_at || vouchers[0].created_at).toLocaleDateString('en-IN') : '—'],
                  ['CRM Status', mapping.mapping_status || 'UNLINKED'],
                  ['Match Confidence', `${((mapping.match_confidence || 0) * 100).toFixed(0)}%`],
                ].map(([lbl, val]) => (
                  <div key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 9, color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{lbl}</span>
                    <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 11 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── VOUCHERS ── */}
        {section === 'vouchers' && (
          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { label: 'Total Billed', value: INR_SHORT(totalBilled), color: '#1e293b', bg: '#f8fafc' },
                { label: 'Paid', value: INR_SHORT(totalPaid), color: '#065f46', bg: '#ecfdf5' },
                { label: 'Outstanding', value: INR_SHORT(outstanding), color: outstanding > 0 ? '#7f1d1d' : '#065f46', bg: outstanding > 0 ? '#fef2f2' : '#ecfdf5' },
              ].map(k => (
                <div key={k.label} style={{ padding: '5px 12px', borderRadius: 7, background: k.bg, fontSize: 11 }}>
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}>{k.label}: </span>
                  <span style={{ fontWeight: 800, color: k.color }}>{k.value}</span>
                </div>
              ))}
            </div>
            {vouchers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: 13 }}>No vouchers found for this party.</div>
            ) : (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '85px 1fr 72px 85px 100px 60px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '7px 12px' }}>
                  {['DATE', 'VOUCHER NO.', 'TYPE', 'AMOUNT', 'STATUS', 'PDF'].map(h => (
                    <span key={h} style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</span>
                  ))}
                </div>
                <div style={{ maxHeight: 440, overflowY: 'auto' }}>
                  {[...vouchers].sort((a, b) => new Date(b.invoice_date || b.created_at) - new Date(a.invoice_date || a.created_at)).map((v, i) => {
                    const pdfUrl = v.pdf_url || v.metadata?.pdf_url;
                    const vType = v.tally_voucher_number?.startsWith('REC') ? 'Receipt' : v.tally_voucher_number?.startsWith('PAY') ? 'Payment' : 'Sales';
                    const bucket = v.status !== 'Paid' ? agingBucket(v.due_date || v.invoice_date) : null;
                    return (
                      <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '85px 1fr 72px 85px 100px 60px', padding: '9px 12px', borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafbfc', alignItems: 'center' }}>
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{v.invoice_date ? new Date(v.invoice_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>{v.invoice_number || '—'}</div>
                          {v.due_date && <div style={{ fontSize: 9, color: '#94a3b8' }}>Due: {new Date(v.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>}
                        </div>
                        <div><span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4, background: '#f0f4ff', color: '#4f46e5', fontWeight: 700 }}>{vType}</span></div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{INR_SHORT(v.amount)}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <StatusBadge status={v.status} />
                          {bucket && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: bucket.bg, color: bucket.color, fontWeight: 700 }}>{bucket.label}</span>}
                        </div>
                        <div>{pdfUrl ? <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '3px 6px', borderRadius: 5, fontSize: 9, fontWeight: 700, background: '#f0f4ff', color: '#4f46e5', border: '1px solid #c7d2fe', textDecoration: 'none' }}><Download size={9} />PDF</a> : <span style={{ fontSize: 9, color: '#94a3b8' }}>—</span>}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '85px 1fr 72px 85px 100px 60px', padding: '9px 12px', background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#1e293b', gridColumn: '1/4' }}>TOTAL ({vouchers.length} vouchers)</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>{INR_SHORT(totalBilled)}</div>
                  <div style={{ fontSize: 10, color: outstanding > 0 ? '#7f1d1d' : '#065f46', fontWeight: 700 }}>{outstanding > 0 ? `${INR_SHORT(outstanding)} due` : 'Settled ✓'}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── COMMS ── */}
        {section === 'comms' && (
          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'WA Reminders Sent', value: totalReminders, color: '#065f46', bg: '#ecfdf5' },
                { label: 'Paused Invoices', value: vouchers.filter(v => v.reminder_paused).length, color: '#92400e', bg: '#fffbeb' },
              ].map(s => (
                <div key={s.label} style={{ padding: '8px 14px', borderRadius: 8, background: s.bg, flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '13px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', marginBottom: 9, display: 'flex', alignItems: 'center', gap: 4 }}>
                <RotateCcw size={12} color="#6366f1" />Invoice-Level Reminder Tracker
              </div>
              {vouchers.filter(v => v.status !== 'Paid').length === 0
                ? <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '10px' }}>All invoices are settled.</div>
                : vouchers.filter(v => v.status !== 'Paid').map(v => (
                  <div key={v.id} style={{ padding: '8px 9px', borderRadius: 7, background: '#fff', border: '1px solid #e2e8f0', marginBottom: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>{v.invoice_number}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Due: {v.due_date ? new Date(v.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'N/A'} · {INR_SHORT(v.amount)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: '#f0f4ff', color: '#4f46e5', fontWeight: 700 }}>{v.reminder_count || 0} sent</span>
                      {v.reminder_paused && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: '#fffbeb', color: '#92400e', fontWeight: 700, border: '1px solid #fde68a' }}>⏸ PAUSED</span>}
                      <StatusBadge status={v.status} />
                    </div>
                  </div>
                ))
              }
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '13px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', marginBottom: 9, display: 'flex', alignItems: 'center', gap: 4 }}>
                <MessageCircle size={12} color="#25d366" />WhatsApp Conversation History
                {waLoading && <span style={{ fontSize: 10, color: '#94a3b8' }}>Loading...</span>}
              </div>
              {!mapping.lead_phone || mapping.lead_phone === '—'
                ? <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '14px', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>⚠️ Link this ledger to a CRM contact with a phone to see WhatsApp history.</div>
                : waLoading
                  ? <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '14px' }}>Searching for {mapping.lead_phone}...</div>
                  : waMessages.length === 0
                    ? <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: '14px', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>📭 No WhatsApp messages found for this contact yet.</div>
                    : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 280, overflowY: 'auto' }}>
                        {waMessages.map(msg => (
                          <div key={msg.id} style={{ padding: '7px 9px', borderRadius: 7, background: msg.direction === 'inbound' ? '#f0fdf4' : '#f0f4ff', border: `1px solid ${msg.direction === 'inbound' ? '#bbf7d0' : '#c7d2fe'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: msg.direction === 'inbound' ? '#065f46' : '#4f46e5', textTransform: 'uppercase' }}>
                                {msg.direction === 'inbound' ? '← Customer' : '→ System'}
                              </span>
                              <span style={{ fontSize: 9, color: '#94a3b8' }}>{new Date(msg.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#1e293b', lineHeight: 1.45 }}>{msg.text_content || `[${msg.message_type}]`}</div>
                            {msg.status && <span style={{ fontSize: 9, color: msg.status === 'read' ? '#10b981' : msg.status === 'delivered' ? '#6366f1' : '#94a3b8', fontWeight: 600 }}>{msg.status === 'read' ? '✓✓ Read' : msg.status === 'delivered' ? '✓ Delivered' : msg.status === 'failed' ? '✗ Failed' : msg.status}</span>}
                          </div>
                        ))}
                      </div>
                    )
              }
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0.5; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeInDrawer { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </>
  );
}
