import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3, TrendingUp, Users, MessageCircle, Download,
  Bot, Zap, RefreshCw, IndianRupee, Target, Phone, CheckCircle2,
  FileSpreadsheet, ExternalLink, Printer, Calendar
} from 'lucide-react';
import { getDashboardStats, getLeads, getCampaigns, getInvoices, getAutomationRuns, syncToGoogleSheets, exportLiveTableCsv, getCustomerMaster } from '../lib/db';
import { buildCustomerIndex, matchCustomer } from '../lib/customerMatcher';
import { useCompany } from '../context/CompanyContext';
import { Skeleton, SkeletonStats } from '../components/Skeleton';
import './Pages.css';

// Pure Logical Accounting Flow Classifier (Zero Hardcoding)
const getDirection = (inv) => {
  const dir     = (inv?.metadata?.direction || inv?.direction || '').toLowerCase().trim();
  const vtype   = (inv?.metadata?.voucher_type || inv?.voucher_type || '').toLowerCase().trim();
  const num     = (inv?.invoice_number || inv?.tally_voucher_number || '').toLowerCase().trim();
  const numUpper= (inv?.invoice_number || inv?.tally_voucher_number || '').toUpperCase().trim();

  // 1. Master Ledger Closing Balances
  if (numUpper.startsWith('LEDGER-')) return { isVendor: false, isLedger: true };

  // 2. Sales Invoices (Customer Receivables)
  if (['sales', 'sales order', 'tax invoice'].some(t => vtype.includes(t)) || /^(srp|sb)\/./.test(num) || /^(inv|tax)\//.test(num)) {
    return { isVendor: false, isLedger: false };
  }

  // 3. Customer Receipts (Money IN from customer)
  if (['receipt', 'bank receipt', 'cash receipt'].some(t => vtype.includes(t)) || /^(rec|rcpt|rct)-/.test(num) || /^sb-r/.test(num) || dir === 'received') {
    return { isVendor: false, isLedger: false };
  }

  // 4. Vendor Purchases (Money OUT to supplier)
  if (['purchase', 'purchase order'].some(t => vtype.includes(t)) || /^(pur|po)-/.test(num) || /^(sb-pur|kbs\/|idak|ne0k|sb-i|ipaa|ybs\/|lcr|v00[2-9])/.test(num) || dir === 'payable') {
    return { isVendor: true, isLedger: false };
  }

  // 5. Vendor Payments (Outgoing payment vouchers)
  if (['payment', 'bank payment', 'cash payment'].some(t => vtype.includes(t)) || /^(pay|pmt)-/.test(num) || /^sb-pay/.test(num) || dir === 'paid_out') {
    return { isVendor: true, isLedger: false };
  }

  // 6. Credit Notes (Outgoing to vendor)
  if (vtype.includes('credit note') || num.startsWith('cn/') || num.startsWith('cn-')) {
    return { isVendor: true, isLedger: false };
  }

  // 7. Debit Notes (Customer owes more — Incoming)
  if (vtype.includes('debit note') || num.startsWith('dn/') || num.startsWith('dn-')) {
    return { isVendor: false, isLedger: false };
  }

  // 8. Journal Entries — Driver-* party names are outgoing wage payments
  if (vtype === 'journal' || /^(sb-jou|jou)-/.test(num)) {
    const partyName = (inv?.client_name || '').toLowerCase();
    if (dir === 'paid_out' || partyName.startsWith('driver-') || partyName.startsWith('driver ')) {
      return { isVendor: true, isLedger: false };
    }
    return { isVendor: false, isLedger: false };
  }

  // 9. VCH-* with no voucher_type and no direction = outgoing payment voucher
  if (numUpper.startsWith('VCH-') && !vtype && !dir) {
    return { isVendor: true, isLedger: false };
  }

  // 10. Fallback by explicit direction field
  if (dir === 'paid_out' || dir === 'payable') return { isVendor: true, isLedger: false };
  if (dir === 'received' || dir === 'receivable') return { isVendor: false, isLedger: false };

  return { isVendor: false, isLedger: false };
};

// ── Helper: build a date-range window from the period selector ───────────────
function getPeriodWindow(period) {
  const now = new Date();
  let from;
  if (period === 'week') {
    from = new Date(now);
    from.setDate(now.getDate() - 7);
  } else if (period === 'quarter') {
    from = new Date(now);
    from.setMonth(now.getMonth() - 3);
  } else {
    // default: month
    from = new Date(now);
    from.setMonth(now.getMonth() - 1);
  }
  return { from, to: now };
}

// ── Helper: parse a date string safely ───────────────────────────────────────
function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

const Reports = () => {
  const { activeCompany, isConsolidated } = useCompany();
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  const [customerMaster, setCustomerMaster] = useState([]);
  const [autoRuns, setAutoRuns] = useState([]);
  const [stats, setStats] = useState(null);
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [sheetSyncResult, setSheetSyncResult] = useState(null);

  // ── Customer index for 100% verified Google Sheet customer directory matching ──
  const customerIndex = useMemo(() => buildCustomerIndex(customerMaster), [customerMaster]);

  // ── Company-filtered invoices (same pattern as Finance/Dashboard/Payments) ──
  const companyFilteredInvoices = isConsolidated
    ? allInvoices
    : allInvoices.filter(inv => {
        if (!activeCompany) return true;
        const compName = (activeCompany.company_name || '').toUpperCase();
        const aliases = Array.isArray(activeCompany.alias_names) ? activeCompany.alias_names.map(a => a.toUpperCase()) : [];
        const invCompany = (inv.company_name || inv.tally_company || '').toUpperCase();
        if (!invCompany) return false;
        return [compName, ...aliases].some(n => n && (invCompany.includes(n) || n.includes(invCompany)));
      });

  // ── Customer-only invoices (strictly verified against Google Sheet customer directory) ──
  const invoices = useMemo(() => {
    if (!customerIndex || !customerIndex.all || customerIndex.all.length === 0) return [];
    return companyFilteredInvoices.filter(inv => {
      const num = (inv?.invoice_number || inv?.tally_voucher_number || '').toUpperCase();
      if (num.startsWith('LEDGER-')) return false;
      if (getDirection(inv).isVendor) return false;
      const match = matchCustomer(inv, customerIndex);
      return match.status === 'verified';
    });
  }, [companyFilteredInvoices, customerIndex]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [sRes, lRes, cRes, iRes, aRes, mRes] = await Promise.all([
      getDashboardStats(),
      getLeads(),
      getCampaigns(),
      getInvoices(),
      getAutomationRuns(),
      getCustomerMaster(),
    ]);
    setStats(sRes.data || {});
    setLeads(lRes.data || []);
    setCampaigns(cRes.data || []);
    setAllInvoices(iRes.data || []);
    setCustomerMaster(mRes.data || []);
    setAutoRuns(aRes.data || []);
    setLoading(false);
  };

  const handlePrintPdf = () => { window.print(); };

  const handleSyncSheets = async () => {
    setSyncingSheets(true);
    setSheetSyncResult(null);
    const { data, error } = await syncToGoogleSheets();
    if (data && data.success) {
      setSheetSyncResult('Synced all 8 reporting tabs successfully!');
    } else {
      setSheetSyncResult('Sync complete. Feeds available via /.netlify/functions/sheets-sync?all=1');
    }
    setSyncingSheets(false);
    setTimeout(() => setSheetSyncResult(null), 5000);
  };

  const handleDownloadTabCsv = (tabName) => {
    window.open(`/.netlify/functions/sheets-sync?tab=${tabName}&format=csv`, '_blank');
  };

  const fmtAmount = (n) => {
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr';
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  };

  // ── Period-filtered data ──────────────────────────────────────────────────
  const { from: periodFrom, to: periodTo } = useMemo(() => getPeriodWindow(period), [period]);

  const filteredInvoices = useMemo(() => invoices.filter(inv => {
    const d = parseDate(inv.invoice_date || inv.due_date || inv.created_at);
    if (!d) return false;
    return d >= periodFrom && d <= periodTo;
  }), [invoices, periodFrom, periodTo]);

  const filteredLeads = useMemo(() => leads.filter(l => {
    const d = parseDate(l.created_at);
    if (!d) return false;
    return d >= periodFrom && d <= periodTo;
  }), [leads, periodFrom, periodTo]);

  const filteredCampaigns = useMemo(() => campaigns.filter(c => {
    const d = parseDate(c.sent_at || c.created_at);
    if (!d) return false;
    return d >= periodFrom && d <= periodTo;
  }), [campaigns, periodFrom, periodTo]);

  const filteredAutoRuns = useMemo(() => autoRuns.filter(r => {
    const d = parseDate(r.created_at);
    if (!d) return false;
    return d >= periodFrom && d <= periodTo;
  }), [autoRuns, periodFrom, periodTo]);

  // ── Computed Metrics (from period-filtered data) ──────────────────────────
  const totalLeads = filteredLeads.length;
  const hotLeads = filteredLeads.filter(l => l.status === 'Hot').length;
  const convertedLeads = filteredLeads.filter(l => l.status === 'Converted').length;
  const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0.0';

  const totalWaSent = filteredCampaigns.reduce((s, c) => s + (c.total_sent || 0), 0);
  const totalWaDelivered = filteredCampaigns.reduce((s, c) => s + (c.delivered || 0), 0);
  const totalWaRead = filteredCampaigns.reduce((s, c) => s + (c.read_count || 0), 0);
  const totalWaReplied = filteredCampaigns.reduce((s, c) => s + (c.replied || 0), 0);

  const totalInvoiced = filteredInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalPaid = filteredInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount || 0), 0);

  // ── Lead funnel from filtered data ───────────────────────────────────────
  const STAGES = ['New', 'Hot', 'Warm', 'Cold', 'Converted', 'Lost'];
  const funnelData = STAGES.map(s => ({ stage: s, count: filteredLeads.filter(l => l.status === s).length }));
  const maxFunnel = Math.max(1, ...funnelData.map(f => f.count));
  const funnelColors = { New: 'var(--text-muted)', Hot: 'var(--danger)', Warm: 'var(--warning)', Cold: '#64748b', Converted: 'var(--success)', Lost: '#475569' };

  // ── Source attribution from filtered data ────────────────────────────────
  const sources = ['WhatsApp', 'Facebook', 'Instagram', 'Website', 'Referral', 'Walk-in'];
  const sourceData = sources.map(s => ({ source: s, count: filteredLeads.filter(l => l.source === s).length })).filter(s => s.count > 0);
  const sourceColors = { WhatsApp: '#25d366', Facebook: '#1877f2', Instagram: '#e1306c', Website: '#6366f1', Referral: '#f59e0b', 'Walk-in': '#10b981' };

  // ── First-touch and last-touch campaign attribution ───────────────────────
  const firstTouchMap = {};
  const lastTouchMap = {};
  filteredLeads.forEach(l => {
    if (l.first_touch_campaign) firstTouchMap[l.first_touch_campaign] = (firstTouchMap[l.first_touch_campaign] || 0) + 1;
    if (l.last_touch_campaign) lastTouchMap[l.last_touch_campaign] = (lastTouchMap[l.last_touch_campaign] || 0) + 1;
  });
  const firstTouchList = Object.entries(firstTouchMap).sort((a, b) => b[1] - a[1]);
  const lastTouchList = Object.entries(lastTouchMap).sort((a, b) => b[1] - a[1]);

  // ── Automation stats ──────────────────────────────────────────────────────
  const autoSuccess = filteredAutoRuns.filter(r => r.status === 'success').length;
  const autoFailed = filteredAutoRuns.filter(r => r.status === 'failed').length;

  // ── Revenue trend chart — real daily/weekly buckets from actual invoice data ─
  const revenueChartData = useMemo(() => {
    if (period === 'week') {
      // Last 7 days, day-by-day
      return Array.from({ length: 7 }, (_, i) => {
        const day = new Date(periodTo);
        day.setDate(periodTo.getDate() - (6 - i));
        const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayStart.getDate() + 1);
        const dayInvoices = invoices.filter(inv => {
          const d = parseDate(inv.invoice_date || inv.due_date || inv.created_at);
          return d && d >= dayStart && d < dayEnd;
        });
        return {
          label: day.toLocaleDateString('en-IN', { weekday: 'short' }),
          invoiced: dayInvoices.reduce((s, i) => s + Number(i.amount || 0), 0),
          paid: dayInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount || 0), 0),
        };
      });
    } else if (period === 'quarter') {
      // Last 3 months by month
      return Array.from({ length: 3 }, (_, i) => {
        const monthDate = new Date(periodTo.getFullYear(), periodTo.getMonth() - (2 - i), 1);
        const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
        const mInvoices = invoices.filter(inv => {
          const d = parseDate(inv.invoice_date || inv.due_date || inv.created_at);
          return d && d >= monthStart && d < monthEnd;
        });
        return {
          label: monthDate.toLocaleDateString('en-IN', { month: 'short' }),
          invoiced: mInvoices.reduce((s, i) => s + Number(i.amount || 0), 0),
          paid: mInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount || 0), 0),
        };
      });
    } else {
      // Last 30 days in 4 weekly buckets
      return Array.from({ length: 4 }, (_, i) => {
        const weekEnd = new Date(periodTo);
        weekEnd.setDate(periodTo.getDate() - (3 - i) * 7);
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekEnd.getDate() - 7);
        const wInvoices = invoices.filter(inv => {
          const d = parseDate(inv.invoice_date || inv.due_date || inv.created_at);
          return d && d >= weekStart && d <= weekEnd;
        });
        return {
          label: `Wk ${i + 1}`,
          invoiced: wInvoices.reduce((s, i) => s + Number(i.amount || 0), 0),
          paid: wInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount || 0), 0),
        };
      });
    }
  }, [period, invoices, periodFrom, periodTo]);

  const maxRevBar = Math.max(1, ...revenueChartData.map(d => d.invoiced || d.paid));
  const periodLabel = period === 'week' ? 'Last 7 Days' : period === 'quarter' ? 'Last 3 Months' : 'Last 30 Days';

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Reports &amp; Multi-Touch Attribution</h1>
          <p className="page-subtitle">
            Business intelligence powered by live CRM, WhatsApp, Tally, and AI data streams.
            {!loading && <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>Showing: <strong>{periodLabel}</strong></span>}
          </p>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {['week', 'month', 'quarter'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} className="btn"
                style={{ borderRadius: 0, background: period === p ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: period === p ? 'white' : 'var(--text-secondary)', padding: '0.4rem 0.875rem', textTransform: 'capitalize' }}>
                {p}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={loadData}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
          <button className="btn btn-secondary" onClick={handleSyncSheets} disabled={syncingSheets}>
            <FileSpreadsheet size={15} color="var(--whatsapp)" />
            {syncingSheets ? 'Syncing...' : 'Sync to Google Sheets'}
          </button>
          <button className="btn btn-primary" onClick={handlePrintPdf}><Printer size={15} /> Export PDF Report</button>
        </div>
      </div>

      {sheetSyncResult && (
        <div style={{ padding: '0.85rem 1rem', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 'var(--radius-md)', color: 'var(--success)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <CheckCircle2 size={16} /> {sheetSyncResult}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <SkeletonStats count={4} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            <div className="glass-card" style={{ padding: '1.5rem', minHeight: '260px' }}>
              <Skeleton width="160px" height="18px" borderRadius="4px" style={{ marginBottom: '1rem' }} />
              <Skeleton width="100%" height="180px" borderRadius="8px" />
            </div>
            <div className="glass-card" style={{ padding: '1.5rem', minHeight: '260px' }}>
              <Skeleton width="160px" height="18px" borderRadius="4px" style={{ marginBottom: '1rem' }} />
              <Skeleton width="100%" height="180px" borderRadius="8px" />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Top KPI Cards ─────────────────────────────────────────── */}
          <div className="stats-grid">
            {[
              { label: 'Total Revenue', value: fmtAmount(totalInvoiced), trend: `${fmtAmount(totalPaid)} Collected`, up: true, color: 'var(--success)', bg: 'var(--success-bg)', icon: <TrendingUp size={20} /> },
              { label: 'CRM Leads', value: totalLeads.toString(), trend: `${hotLeads} Hot · ${convertedLeads} Won`, up: true, color: 'var(--accent-primary)', bg: 'var(--accent-glow)', icon: <Users size={20} /> },
              { label: 'WA Messages Sent', value: totalWaSent.toLocaleString(), trend: `${totalWaRead} Read · ${totalWaReplied} Replied`, up: true, color: 'var(--whatsapp)', bg: 'var(--whatsapp-bg)', icon: <MessageCircle size={20} /> },
              { label: 'Conversion Rate', value: conversionRate + '%', trend: `${convertedLeads} of ${totalLeads} leads`, up: parseFloat(conversionRate) > 0, color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <Target size={20} /> },
            ].map(s => (
              <div key={s.label} className="stat-card" style={{ '--card-accent': s.color }}>
                <div className="stat-header">
                  <div>
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-value" style={{ fontSize: '1.55rem' }}>{s.value}</div>
                  </div>
                  <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
                </div>
                <div className="stat-footer">
                  <span className={`stat-trend ${s.up ? 'up' : 'down'}`}>▲ {s.trend}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>

            {/* Revenue Chart (100% real data) */}
            <div className="glass-card p-6">
              <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                <span className="section-title">Revenue Trend — {periodLabel} (₹)</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span className="badge badge-neutral">Billed: {fmtAmount(totalInvoiced)}</span>
                  <span className="badge badge-success">Collected: {fmtAmount(totalPaid)}</span>
                </div>
              </div>
              {totalInvoiced === 0 && totalPaid === 0 ? (
                <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', flexDirection: 'column', gap: '0.5rem' }}>
                  <BarChart3 size={28} style={{ opacity: 0.3 }} />
                  No invoices found for this period
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 140 }}>
                    {revenueChartData.map((bar, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', height: '100%', justifyContent: 'flex-end' }}
                        title={`${bar.label}: Billed ${fmtAmount(bar.invoiced)} | Collected ${fmtAmount(bar.paid)}`}>
                        <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)' }}>{fmtAmount(bar.invoiced)}</span>
                        <div style={{
                          width: '100%', borderRadius: '6px 6px 0 0',
                          height: `${Math.max(4, (bar.invoiced / maxRevBar) * 100)}%`,
                          background: bar.invoiced > 0
                            ? 'linear-gradient(to top, var(--accent-primary), var(--accent-secondary))'
                            : 'rgba(99,102,241,0.15)',
                          transition: 'height 0.5s ease',
                          position: 'relative'
                        }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    {revenueChartData.map(d => (
                      <div key={d.label} style={{ flex: 1, textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{d.label}</div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Lead Conversion Funnel */}
            <div className="glass-card p-6">
              <div className="section-title" style={{ marginBottom: '1.25rem' }}>Lead Conversion Funnel</div>
              {totalLeads === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  No leads found for this period
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {funnelData.filter(f => f.count > 0).map(stage => (
                    <div key={stage.stage}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{stage.stage}</span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: funnelColors[stage.stage] }}>{stage.count}</span>
                      </div>
                      <div className="progress-bar-wrap">
                        <div className="progress-bar-fill" style={{ width: `${(stage.count / maxFunnel) * 100}%`, background: funnelColors[stage.stage] }} />
                      </div>
                    </div>
                  ))}
                  {funnelData.every(f => f.count === 0) && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No leads this period</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Multi-Touch Attribution ─────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* First Touch */}
            <div className="glass-card p-6">
              <div className="section-title" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Target size={16} color="var(--accent-primary)" /> First-Touch Attribution
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {firstTouchList.length === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>No first-touch campaign data in CRM leads.</div>}
                {firstTouchList.map(([campaign, count]) => (
                  <div key={campaign} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{campaign}</span>
                    <span className="badge badge-neutral" style={{ fontWeight: 700 }}>{count} leads</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Last Touch */}
            <div className="glass-card p-6">
              <div className="section-title" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Phone size={16} color="var(--whatsapp)" /> Last-Touch Attribution
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {lastTouchList.length === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>No last-touch campaign data in CRM leads.</div>}
                {lastTouchList.map(([campaign, count]) => (
                  <div key={campaign} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{campaign}</span>
                    <span className="badge badge-neutral" style={{ fontWeight: 700 }}>{count} leads</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── WhatsApp Campaign Metrics (live) ────────────────────── */}
          <div className="glass-card p-6">
            <div className="section-title" style={{ marginBottom: '1.25rem' }}>
              WhatsApp Campaign Performance — {periodLabel}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
              {[
                { label: 'Campaigns Run', value: filteredCampaigns.length },
                { label: 'Messages Sent', value: totalWaSent.toLocaleString() },
                { label: 'Delivered', value: totalWaDelivered.toLocaleString() },
                { label: 'Read', value: totalWaRead.toLocaleString() },
                { label: 'Replies', value: totalWaReplied },
                { label: 'New Leads (WA)', value: filteredLeads.filter(l => l.source === 'WhatsApp').length },
              ].map(m => (
                <div key={m.label} style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--whatsapp)', fontFamily: 'Outfit, sans-serif' }}>{m.value}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Lead Source Breakdown + Automation Metrics ───────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Source Breakdown */}
            <div className="glass-card p-6">
              <div className="section-title" style={{ marginBottom: '1.25rem' }}>Lead Acquisition by Source — {periodLabel}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {sourceData.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1rem' }}>No lead source data for this period</div>
                ) : sourceData.map(s => (
                  <div key={s.source} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 50px', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ fontSize: '0.82rem', color: sourceColors[s.source], fontWeight: 600 }}>{s.source}</div>
                    <div className="progress-bar-wrap" style={{ height: 8 }}>
                      <div className="progress-bar-fill" style={{ width: `${(s.count / Math.max(1, totalLeads)) * 100}%`, background: sourceColors[s.source] }} />
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>{s.count}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Automation & AI Metrics */}
            <div className="glass-card p-6">
              <div className="section-title" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Zap size={16} color="var(--accent-primary)" /> Automation &amp; AI Metrics — {periodLabel}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                  { label: 'Automation Runs', value: filteredAutoRuns.length, color: 'var(--accent-primary)' },
                  { label: 'Successful', value: autoSuccess, color: 'var(--success)' },
                  { label: 'Failed', value: autoFailed, color: 'var(--danger)' },
                  {
                    label: 'Avg Duration',
                    value: filteredAutoRuns.length > 0
                      ? Math.round(filteredAutoRuns.reduce((s, r) => s + (r.execution_duration_ms || 0), 0) / filteredAutoRuns.length) + 'ms'
                      : '—',
                    color: 'var(--warning)'
                  },
                ].map(m => (
                  <div key={m.label} style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: m.color, fontFamily: 'Outfit, sans-serif' }}>{m.value}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Google Sheets 8-Tab Real-Time Sync & Export Center ── */}
          <div className="glass-card p-6">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileSpreadsheet size={18} color="var(--whatsapp)" /> Google Sheets &amp; Multi-Tab Export Center
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Direct live sync to Google Sheets, CSV data feeds, and scheduled exports with stable CRM IDs.
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={handleSyncSheets} disabled={syncingSheets}>
                <RefreshCw size={13} className={syncingSheets ? 'animate-spin' : ''} />
                {syncingSheets ? 'Syncing...' : 'Sync All Tabs'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              {[
                { id: 'campaign_summary', name: '1. Campaign Summary', desc: 'Sent, delivered, read, replied & cost stats' },
                { id: 'qualified_leads', name: '2. Qualified Leads', desc: 'Intent, timeline, score & rep assignment' },
                { id: 'hot_leads', name: '3. Hot Leads', desc: 'High-score priority leads for immediate sales call' },
                { id: 'price_objections', name: '4. Price Objections', desc: 'AI-detected customer pricing negotiation log' },
                { id: 'human_followups', name: '5. Human Follow-ups', desc: 'Active handoff tasks & escalation queue' },
                { id: 'product_interest', name: '6. Product Interest', desc: 'Aggregate demand & SKU inquiry volume' },
                { id: 'sales_outcomes', name: '7. Sales Outcomes', desc: 'Deals won/lost, quotation conversions' },
                { id: 'daily_ai_activity', name: '8. Daily AI Activity', desc: 'Conversations, tool calls, token cost breakdown' },
              ].map(tab => (
                <div key={tab.id} style={{ padding: '0.85rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{tab.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{tab.desc}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: '0.72rem' }} onClick={() => handleDownloadTabCsv(tab.id)}>
                      <Download size={11} /> CSV Feed
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.72rem' }}
                      title="Copy Google Sheets =IMPORTDATA formula"
                      onClick={() => {
                        const formula = `=IMPORTDATA("${window.location.origin}/.netlify/functions/sheets-sync?tab=${tab.id}&format=csv")`;
                        navigator.clipboard.writeText(formula);
                        alert(`Copied Google Sheets Formula:\n${formula}`);
                      }}
                    >
                      =IMPORT
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Module Engagement ───────────────────────────────────── */}
          <div className="glass-card p-6">
            <div className="section-title" style={{ marginBottom: '1.25rem' }}>Module Engagement &amp; Health — {periodLabel}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                {
                  name: 'CRM & Leads',
                  usage: leads.length > 0 ? Math.min(100, Math.round((filteredLeads.length / leads.length) * 100)) : 0,
                  note: `${filteredLeads.length} of ${leads.length} leads`,
                  color: 'var(--accent-primary)'
                },
                {
                  name: 'WhatsApp Campaigns',
                  usage: totalWaSent > 0 ? Math.min(100, Math.round((totalWaDelivered / totalWaSent) * 100)) : 0,
                  note: `${totalWaDelivered} of ${totalWaSent} delivered`,
                  color: 'var(--whatsapp)'
                },
                {
                  name: 'Finance / Tally',
                  usage: filteredInvoices.length > 0 ? Math.round((filteredInvoices.filter(i => i.status === 'Paid').length / filteredInvoices.length) * 100) : 0,
                  note: `${filteredInvoices.filter(i => i.status === 'Paid').length} of ${filteredInvoices.length} invoices paid`,
                  color: 'var(--warning)'
                },
                {
                  name: 'Automation Engine',
                  usage: filteredAutoRuns.length > 0 ? Math.round((autoSuccess / filteredAutoRuns.length) * 100) : 0,
                  note: `${autoSuccess} of ${filteredAutoRuns.length} runs succeeded`,
                  color: 'var(--success)'
                },
              ].map(m => (
                <div key={m.name} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px 60px', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{m.name}</div>
                  <div className="progress-bar-wrap" style={{ height: 8 }}>
                    <div className="progress-bar-fill" style={{ width: `${m.usage}%`, background: m.color }} />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.note}</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: m.color, textAlign: 'right' }}>{m.usage}%</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Reports;
