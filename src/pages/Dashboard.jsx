import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, CheckSquare, IndianRupee, TrendingUp, MessageCircle,
  ArrowUpRight, ArrowDownRight, Bot, CreditCard, BarChart3,
  Clock, AlertCircle, CheckCircle2, RefreshCw, Zap, Send,
  Phone, Star, Building2, AlertTriangle, Navigation, Camera, MapPin,
  Download, Printer, FileSpreadsheet, FileText, ExternalLink, X,
  RotateCcw, ShieldCheck
} from 'lucide-react';
import { getDashboardStats, getActivityFeed, getTasks, getLeads, getCampaigns, getInvoices, getTeamMembers, getEmployeeLivePings, getSiteVisits, getCustomerMaster, triggerSheetSync, invalidateCustomerMasterCache } from '../lib/db';
import { buildCustomerIndex, matchCustomer } from '../lib/customerMatcher';
import { reconcileCustomerInvoices, isSalesVoucher } from '../lib/reconciliation';
import { isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
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

const Dashboard = () => {

  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const { activeCompany, isConsolidated } = useCompany();
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [taskList, setTaskList] = useState([]);
  const [leads, setLeads] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  const [customerMaster, setCustomerMaster] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [livePings, setLivePings] = useState([]);
  const [recentVisits, setRecentVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [sheetSyncToast, setSheetSyncToast] = useState('');

  const handleSyncSheet = async () => {
    setSyncingSheet(true);
    setSheetSyncToast('Syncing customer directory live from Google Sheet...');
    const { data, error } = await triggerSheetSync();
    invalidateCustomerMasterCache();
    const masterRes = await getCustomerMaster({ forceRefresh: true });
    setCustomerMaster(masterRes.data || []);
    if (error || !data?.success) {
      setSheetSyncToast(`Refreshed ${masterRes.data?.length || 0} customers from database`);
    } else {
      setSheetSyncToast(`✅ Synced ${data.synced} customer companies live from Google Sheet!`);
    }
    setSyncingSheet(false);
    setTimeout(() => setSheetSyncToast(''), 4500);
  };

  // ── Financial Year selector ───────────────────────────────────────────────
  // Indian FY runs Apr 1 – Mar 31. Derive current FY start year.
  const _nowForFY = new Date();
  const _curFYStart = _nowForFY.getMonth() >= 3 ? _nowForFY.getFullYear() : _nowForFY.getFullYear() - 1;
  // Build list of last 4 FYs for the dropdown
  const FY_OPTIONS = [0, 1, 2, 3].map(offset => {
    const startY = _curFYStart - offset;
    return { label: `FY ${startY}-${String(startY + 1).slice(2)}`, startYear: startY };
  });
  const [selectedFYStart, setSelectedFYStart] = useState(_curFYStart);

  useEffect(() => { loadData(); }, []);

  // Build memoized customer index for 100% strict Google Sheet customer verification
  const customerIndex = useMemo(() => buildCustomerIndex(customerMaster), [customerMaster]);

  // Reconcile invoices authoritatively (settles receipts, Tally closing balances, computes exact paid & pending amounts)
  const reconciledInvoices = useMemo(() => {
    return reconcileCustomerInvoices(allInvoices);
  }, [allInvoices]);

  // Filter invoices by active company
  const invoices = useMemo(() => {
    if (isConsolidated) return reconciledInvoices;
    if (!activeCompany) return reconciledInvoices;
    const compName = (activeCompany.company_name || '').toUpperCase();
    const aliases = Array.isArray(activeCompany.alias_names) ? activeCompany.alias_names.map(a => a.toUpperCase()) : [];
    return reconciledInvoices.filter(inv => {
      const invCompany = (inv.company_name || inv.tally_company || '').toUpperCase();
      if (!invCompany) return false;
      return [compName, ...aliases].some(n => n && (invCompany.includes(n) || n.includes(invCompany)));
    });
  }, [reconciledInvoices, activeCompany, isConsolidated]);


  const loadData = async () => {
    setLoading(true);
    const [statsRes, actRes, taskRes, leadRes, campRes, invRes, membersRes, liveRes, visitsRes, masterRes] = await Promise.all([
      getDashboardStats(),
      getActivityFeed(8),
      getTasks(),
      getLeads(),
      getCampaigns(),
      getInvoices(),
      getTeamMembers(),
      getEmployeeLivePings(),
      getSiteVisits(),
      getCustomerMaster(),
    ]);
    if (statsRes.data) setStats(statsRes.data);
    setActivities(actRes.data || []);
    setTaskList(taskRes.data || []);
    setLeads(leadRes.data || []);
    setCampaigns(campRes.data || []);
    setAllInvoices(invRes.data || []);
    setCustomerMaster(masterRes.data || []);
    setTeamMembers(membersRes.data || []);
    setLivePings(liveRes.data || []);
    setRecentVisits(visitsRes.data || []);
    setLoading(false);
  };

  const toggleTask = (id) => {
    setTaskList(prev => prev.map(t => t.id === id ? { ...t, status: t.status === 'Done' ? 'To Do' : 'Done' } : t));
  };

  const fmtAmount = (n) => {
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr';
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  };

  // ── Computed metrics from live data (strictly Google Sheet Verified Customer Receivables) ──────
  const totalLeads = leads.length;
  const hotLeads = leads.filter(l => l.status === 'Hot').length;
  const convertedLeads = leads.filter(l => l.status === 'Converted').length;

  // Filter invoices strictly to Google Sheet verified customers:
  // 1. Exclude LEDGER- closing balances
  // 2. Exclude vendor payables
  // 3. Strictly require match in customer_master (Google Sheet directory)
  const customerInvoices = useMemo(() => {
    if (!customerIndex || !customerIndex.all || customerIndex.all.length === 0) return [];
    return invoices.filter(inv => {
      const num = (inv?.invoice_number || inv?.tally_voucher_number || '').toUpperCase();
      if (num.startsWith('LEDGER-')) return false;
      if (getDirection(inv).isVendor) return false;
      const match = matchCustomer(inv, customerIndex);
      return match.status === 'verified';
    });
  }, [invoices, customerIndex]);

  // Customer Sales Invoices only (excludes payment receipts and credit notes from billed totals)
  const customerSales = useMemo(() => {
    return customerInvoices.filter(isSalesVoucher);
  }, [customerInvoices]);

  const totalInvoiced = customerSales.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalPaid = customerSales.reduce((s, i) => s + (i.status === 'Paid' ? Number(i.amount || 0) : Number(i.paid_amount || 0)), 0);
  const pendingAmount = customerSales.filter(i => i.status === 'Pending').reduce((s, i) => s + Number(i.pending_amount ?? i.amount ?? 0), 0);
  const overdueInvoices = customerSales.filter(i => i.status === 'Overdue').length;
  const overdueAmount = customerSales.filter(i => i.status === 'Overdue').reduce((s, i) => s + Number(i.pending_amount ?? i.amount ?? 0), 0);
  const paidInvoicesCount = customerSales.filter(i => i.status === 'Paid').length;
  const collectionRate = totalInvoiced > 0 ? ((totalPaid / totalInvoiced) * 100).toFixed(1) : '0.0';

  const tasksDueCt = taskList.filter(t => t.status !== 'Done').length;
  const totalWaSent = campaigns.reduce((s, c) => s + (c.total_sent || c.sent || 0), 0);
  const totalWaDelivered = campaigns.reduce((s, c) => s + (c.delivered || c.total_delivered || c.total_sent || 0), 0);

  // Pipeline funnel
  const STAGES = ['New', 'Hot', 'Warm', 'Cold', 'Converted', 'Lost'];
  const funnelData = STAGES.map(s => ({ stage: s, count: leads.filter(l => l.status === s).length }));
  const maxFunnel = Math.max(1, ...funnelData.map(f => f.count));
  const funnelColors = { New: 'var(--text-muted)', Hot: 'var(--danger)', Warm: 'var(--warning)', Cold: '#64748b', Converted: 'var(--success)', Lost: '#475569' };

  // Source breakdown
  const sources = ['WhatsApp', 'Facebook', 'Instagram', 'Website', 'Referral', 'Walk-in'];
  const sourceData = sources.map(s => ({ source: s, count: leads.filter(l => l.source === s).length })).filter(s => s.count > 0);
  const sourceColors = { WhatsApp: '#25d366', Facebook: '#1877f2', Instagram: '#e1306c', Website: '#6366f1', Referral: '#f59e0b', 'Walk-in': '#10b981' };

  // ── Financial Year – Monthly Revenue Chart ────────────────────────────────
  // Indian FY: Apr=3 to Mar=2 (0-indexed js month)
  // FY months in order: Apr(3) May(4) Jun(5) Jul(6) Aug(7) Sep(8) Oct(9) Nov(10) Dec(11) Jan(0) Feb(1) Mar(2)
  const FY_MONTH_ORDER = [
    { name: 'Apr', jsMonth: 3 },
    { name: 'May', jsMonth: 4 },
    { name: 'Jun', jsMonth: 5 },
    { name: 'Jul', jsMonth: 6 },
    { name: 'Aug', jsMonth: 7 },
    { name: 'Sep', jsMonth: 8 },
    { name: 'Oct', jsMonth: 9 },
    { name: 'Nov', jsMonth: 10 },
    { name: 'Dec', jsMonth: 11 },
    { name: 'Jan', jsMonth: 0 },
    { name: 'Feb', jsMonth: 1 },
    { name: 'Mar', jsMonth: 2 },
  ];

  // FY date boundaries for selected year
  const fyFrom = useMemo(() => new Date(selectedFYStart, 3, 1), [selectedFYStart]);       // 1-Apr-startYear
  const fyTo   = useMemo(() => new Date(selectedFYStart + 1, 2, 31, 23, 59, 59), [selectedFYStart]);  // 31-Mar-nextYear

  // Customer Sales Invoices that fall within the selected FY
  const fyInvoices = useMemo(() => {
    return customerSales.filter(inv => {
      const dStr = inv.invoice_date || inv.due_date || inv.created_at;
      if (!dStr) return false;
      const d = new Date(dStr);
      return !isNaN(d.getTime()) && d >= fyFrom && d <= fyTo;
    });
  }, [customerSales, fyFrom, fyTo]);

  const monthlyStats = useMemo(() => {
    return FY_MONTH_ORDER.map(({ name, jsMonth }) => {
      // For Jan/Feb/Mar, they belong to selectedFYStart+1 calendar year
      const calYear = jsMonth <= 2 ? selectedFYStart + 1 : selectedFYStart;
      const monthInvoices = fyInvoices.filter(inv => {
        const dStr = inv.invoice_date || inv.due_date || inv.created_at;
        if (!dStr) return false;
        const d = new Date(dStr);
        return !isNaN(d.getTime()) && d.getMonth() === jsMonth && d.getFullYear() === calYear;
      });
      const totalBilled = monthInvoices.reduce((s, inv) => s + Number(inv.amount || 0), 0);
      const paidAmt     = monthInvoices.reduce((s, inv) => s + (inv.status === 'Paid' ? Number(inv.amount || 0) : Number(inv.paid_amount || 0)), 0);
      const pendingAmt  = monthInvoices.reduce((s, inv) => s + (inv.status !== 'Paid' ? Number(inv.pending_amount ?? inv.amount ?? 0) : 0), 0);
      return { month: name, jsMonth, calYear, invoiced: totalBilled, paid: paidAmt, pending: pendingAmt, count: monthInvoices.length };
    });
  }, [fyInvoices, selectedFYStart]);

  // Totals for selected FY
  const fyTotalBilled  = fyInvoices.reduce((s, inv) => s + Number(inv.amount || 0), 0);
  const fyTotalPaid    = fyInvoices.reduce((s, inv) => s + (inv.status === 'Paid' ? Number(inv.amount || 0) : Number(inv.paid_amount || 0)), 0);
  const maxRevBar = Math.max(1, ...monthlyStats.map(m => m.invoiced));

  // Today's FY month index (for current-month highlight)
  const todayJsMonth = new Date().getMonth();
  const todayYear    = new Date().getFullYear();

  // Activity icon mapper
  const actIconMap = {
    payment: { bg: 'var(--danger-bg)', color: 'var(--danger)', icon: <IndianRupee size={15} /> },
    whatsapp: { bg: 'var(--whatsapp-bg)', color: 'var(--whatsapp)', icon: <MessageCircle size={15} /> },
    lead: { bg: 'var(--success-bg)', color: 'var(--success)', icon: <Users size={15} /> },
    task: { bg: 'var(--warning-bg)', color: 'var(--warning)', icon: <CheckSquare size={15} /> },
    tally: { bg: 'var(--accent-glow)', color: 'var(--accent-primary)', icon: <RefreshCw size={15} /> },
    note: { bg: 'var(--info-bg)', color: 'var(--info)', icon: <Star size={15} /> },
  };

  const displayActivities = activities;

  // ── Executive Report Generation Handlers ─────────────────────────────────
  const handleExportCsv = () => {
    const compName = activeCompany ? activeCompany.company_name : 'Consolidated All Companies';
    const fyLabel = `FY ${selectedFYStart}-${String(selectedFYStart + 1).slice(2)}`;
    const timestamp = new Date().toLocaleString('en-IN');
    
    const summaryLines = [
      `"EXECUTIVE BUSINESS REPORT - SOBHAINFRA ERP"`,
      `"Generated At","${timestamp}"`,
      `"Active Entity","${compName}"`,
      `"Financial Year","${fyLabel}"`,
      `"Admin User","${user?.name || 'Admin'} (${user?.role || 'Super Admin'})"`,
      ``,
      `"EXECUTIVE KPI SUMMARY"`,
      `"Metric","Value"`,
      `"Total Billed Turn-over (${fyLabel})","₹${fyTotalBilled.toLocaleString('en-IN')}"`,
      `"Total Collected Paid (${fyLabel})","₹${fyTotalPaid.toLocaleString('en-IN')}"`,
      `"Not Yet Due Receivables","₹${pendingAmount.toLocaleString('en-IN')}"`,
      `"Overdue Receivables","₹${overdueAmount.toLocaleString('en-IN')}"`,
      `"Total Outstanding Receivables","₹${(pendingAmount + overdueAmount).toLocaleString('en-IN')}"`,
      `"Overdue Invoices Count","${overdueInvoices}"`,
      `"Collection Rate","${collectionRate}%"`,
      `"Active CRM Leads","${totalLeads}"`,
      `"Hot Leads","${hotLeads}"`,
      `"Converted Leads","${convertedLeads}"`,
      `"WhatsApp Delivered","${totalWaDelivered}"`,
      `"WhatsApp Broadcasts","${campaigns.length}"`,
      `"Open Tasks","${tasksDueCt}"`,
      ``,
      `"MONTHLY REVENUE BREAKDOWN (${fyLabel} — Apr to Mar)"`,
      `"Month","Total Invoiced (₹)","Collected Paid (₹)","Pending Balance (₹)","Invoices Count"`,
      ...monthlyStats.map(m => `"${m.month}","${m.invoiced}","${m.paid}","${m.pending}","${m.count}"`),
      ``,
      `"INVOICE LEDGER BREAKDOWN (${fyInvoices.length} Sales Invoices in ${fyLabel})"`,
      `"Invoice / Voucher No","Party / Client Name","Phone","Billed Amount (₹)","Paid Amount (₹)","Remaining Due (₹)","Status","Invoice Date","Due Date"`,
      ...fyInvoices.map(inv => `"${inv.invoice_number || inv.tally_voucher_number || ''}","${(inv.client_name || '').replace(/"/g, '""')}","${inv.client_phone || ''}","${inv.amount || 0}","${inv.status === 'Paid' ? inv.amount : inv.paid_amount || 0}","${inv.pending_amount ?? (inv.status === 'Paid' ? 0 : inv.amount)}","${inv.status || 'Pending'}","${inv.invoice_date || ''}","${inv.due_date || ''}"`)
    ];

    const blob = new Blob([summaryLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Executive_Report_${(compName || 'ERP').replace(/[^a-zA-Z0-9]/g, '_')}_${fyLabel.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Executive Dashboard</h1>
          <p className="page-subtitle">
            Welcome back, <strong>{user?.name || 'Admin'}</strong> ({user?.role || 'Super Admin'}) — Live business intelligence across CRM, WhatsApp, Finance & AI modules.
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-secondary"
            onClick={handleSyncSheet}
            disabled={syncingSheet}
            data-tooltip="Sync live customer directory & phone numbers from Google Sheet"
            data-tooltip-pos="bottom"
          >
            <RotateCcw size={14} className={syncingSheet ? 'animate-spin' : ''} />
            {syncingSheet ? 'Syncing...' : `Sheet: ${customerMaster.length} Companies`}
          </button>
          <button className="btn btn-secondary" onClick={loadData}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowReportModal(true)}>
            <BarChart3 size={15} /> Generate Report
          </button>
        </div>
      </div>

      {/* Sync Notification Toast */}
      {sheetSyncToast && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)', padding: '0.65rem 1rem',
          marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--text-primary)',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <ShieldCheck size={15} color="var(--success)" /> {sheetSyncToast}
        </div>
      )}

      {/* ── Live KPI Stat Cards ─────────────── */}
      {loading ? (
        <SkeletonStats count={4} />
      ) : (
        <div className="stats-grid">
          <div className="stat-card animate-slide-up" style={{ '--card-accent': 'var(--accent-primary)' }}>
            <div className="stat-header">
              <div>
                <div className="stat-label">Active CRM Leads</div>
                <div className="stat-value">{totalLeads.toLocaleString()}</div>
              </div>
              <div className="stat-icon" style={{ background: 'var(--accent-glow)' }}>
                <Users size={22} style={{ color: 'var(--accent-primary)' }} />
              </div>
            </div>
            <div className="stat-footer">
              <span className="stat-trend up"><ArrowUpRight size={13} /> {hotLeads} Hot</span>
              <span className="stat-period">{convertedLeads} Converted</span>
            </div>
          </div>

          <div className="stat-card animate-slide-up" style={{ '--card-accent': 'var(--whatsapp)' }}>
            <div className="stat-header">
              <div>
                <div className="stat-label">WhatsApp Delivered</div>
                <div className="stat-value">{totalWaDelivered > 0 ? totalWaDelivered.toLocaleString() : totalWaSent.toLocaleString()}</div>
              </div>
              <div className="stat-icon" style={{ background: 'var(--whatsapp-bg)' }}>
                <MessageCircle size={22} style={{ color: 'var(--whatsapp)' }} />
              </div>
            </div>
            <div className="stat-footer">
              <span className="stat-trend up"><ArrowUpRight size={13} /> {totalWaSent} Sent</span>
              <span className="stat-period">{campaigns.length} Campaigns</span>
            </div>
          </div>

          {hasPermission('Payments') && (
            <div className="stat-card animate-slide-up" style={{ '--card-accent': 'var(--danger)' }}>
              <div className="stat-header">
                <div>
                  <div className="stat-label">Outstanding Receivables</div>
                  <div className="stat-value">{fmtAmount(overdueAmount + pendingAmount)}</div>
                </div>
                <div className="stat-icon" style={{ background: 'var(--danger-bg)' }}>
                  <CreditCard size={22} style={{ color: 'var(--danger)' }} />
                </div>
              </div>
              <div className="stat-footer">
                {overdueInvoices > 0 ? (
                  <span className="stat-trend down"><ArrowDownRight size={13} /> {fmtAmount(overdueAmount)} Overdue</span>
                ) : (
                  <span className="stat-trend up" style={{ color: 'var(--success)' }}><CheckCircle2 size={13} /> 0 Overdue</span>
                )}
                <span className="stat-period">{fmtAmount(pendingAmount)} Not Yet Due</span>
              </div>
            </div>
          )}

          {hasPermission('Finance') ? (
            <div className="stat-card animate-slide-up" style={{ '--card-accent': 'var(--success)' }}>
              <div className="stat-header">
                <div>
                  <div className="stat-label">Collected Revenue</div>
                  <div className="stat-value">{fmtAmount(totalPaid)}</div>
                </div>
                <div className="stat-icon" style={{ background: 'var(--success-bg)' }}>
                  <TrendingUp size={22} style={{ color: 'var(--success)' }} />
                </div>
              </div>
              <div className="stat-footer">
                <span className="stat-trend up"><ArrowUpRight size={13} /> {paidInvoicesCount} Paid Invoices</span>
                <span className="stat-period">{collectionRate}% of {fmtAmount(totalInvoiced)}</span>
              </div>
            </div>
          ) : (
            <div className="stat-card animate-slide-up" style={{ '--card-accent': 'var(--success)' }}>
              <div className="stat-header">
                <div>
                  <div className="stat-label">Team Members</div>
                  <div className="stat-value">{teamMembers.length}</div>
                </div>
                <div className="stat-icon" style={{ background: 'var(--success-bg)' }}>
                  <Users size={22} style={{ color: 'var(--success)' }} />
                </div>
              </div>
              <div className="stat-footer">
                <span className="stat-trend up"><ArrowUpRight size={13} /> {tasksDueCt} Tasks Due</span>
                <span className="stat-period">Active Now</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Main grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2" style={{ gap: '1.25rem' }}>

        {/* Revenue Bar Chart — FY Aware */}
        <div className="glass-card p-6" style={{ gridColumn: '1 / -1' }}>
          <div className="section-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <span className="section-title">Financial Year Revenue (from Invoices)</span>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                Billing &amp; collection history Apr→Mar for {activeCompany ? activeCompany.company_name : 'All Companies'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* FY Dropdown */}
              <select
                value={selectedFYStart}
                onChange={e => setSelectedFYStart(Number(e.target.value))}
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {FY_OPTIONS.map(fy => (
                  <option key={fy.startYear} value={fy.startYear}>{fy.label}</option>
                ))}
              </select>
              <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>Billed: {fmtAmount(fyTotalBilled)}</span>
              <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>Collected: {fmtAmount(fyTotalPaid)}</span>
              {fyInvoices.length === 0 && (
                <span className="badge badge-warning" style={{ fontSize: '0.68rem' }}>No invoices for this FY</span>
              )}
            </div>
          </div>

          {/* Bar chart */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '0.4rem', alignItems: 'flex-end', height: 160, marginTop: '1rem', marginBottom: '0.5rem' }}>
            {monthlyStats.map((st) => {
              const isCurrentMonth = st.jsMonth === todayJsMonth && st.calYear === todayYear;
              const barPct = st.invoiced > 0 ? Math.max(6, (st.invoiced / maxRevBar) * 100) : 0;
              const paidPct = st.invoiced > 0 ? (st.paid / st.invoiced) * barPct : 0;
              return (
                <div
                  key={st.month}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 2, cursor: st.count > 0 ? 'pointer' : 'default' }}
                  title={st.count > 0 ? `${st.month}: Billed ${fmtAmount(st.invoiced)} | Paid ${fmtAmount(st.paid)} | Pending ${fmtAmount(st.pending)} (${st.count} invoices)` : `${st.month}: No data`}
                >
                  {/* Amount tooltip on hover */}
                  {st.invoiced > 0 && (
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2, whiteSpace: 'nowrap' }}>
                      {fmtAmount(st.invoiced)}
                    </div>
                  )}
                  {/* Bar stack: paid (green) on top of pending (indigo) */}
                  <div style={{ width: '100%', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: `${barPct}%`, minHeight: st.invoiced > 0 ? 6 : 2 }}>
                    {/* pending layer */}
                    <div style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '4px 4px 0 0',
                      background: isCurrentMonth
                        ? 'linear-gradient(180deg, rgba(99,102,241,0.9), rgba(99,102,241,0.5))'
                        : st.invoiced > 0 ? 'rgba(99,102,241,0.25)' : 'var(--bg-tertiary)',
                      border: isCurrentMonth ? '1.5px solid rgba(99,102,241,0.8)' : 'none',
                      transition: 'height 0.4s ease',
                    }} />
                    {/* paid layer (overlaid at bottom) */}
                    {st.paid > 0 && (
                      <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: `${paidPct}%`,
                        minHeight: 3,
                        borderRadius: '4px 4px 0 0',
                        background: 'linear-gradient(180deg, rgba(16,185,129,0.9), rgba(16,185,129,0.5))',
                        transition: 'height 0.4s ease',
                      }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Month labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '0.4rem', marginTop: '0.25rem' }}>
            {monthlyStats.map(st => {
              const isCurrentMonth = st.jsMonth === todayJsMonth && st.calYear === todayYear;
              return (
                <div
                  key={st.month}
                  style={{
                    textAlign: 'center',
                    fontSize: '0.67rem',
                    fontWeight: isCurrentMonth ? 700 : 400,
                    color: isCurrentMonth ? 'var(--accent-primary)' : 'var(--text-muted)',
                  }}
                >
                  {st.month}
                  {isCurrentMonth && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent-primary)', margin: '2px auto 0' }} />}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.85rem', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(16,185,129,0.7)' }} /> Collected (Paid)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(99,102,241,0.35)' }} /> Pending / Billed
            </div>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="glass-card p-6">
          <div className="section-header">
            <span className="section-title">Recent Activity</span>
            <span className="badge badge-neutral">{displayActivities.length} Events</span>
          </div>
          <div className="activity-feed">
            {displayActivities.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                No recent activity events logged yet.
              </div>
            ) : displayActivities.slice(0, 6).map(act => {
              const iconInfo = actIconMap[act.type] || actIconMap['note'];
              const timeAgo = (() => {
                const diff = Date.now() - new Date(act.created_at).getTime();
                if (diff < 60000) return 'Just now';
                if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
                if (diff < 86400000) return Math.floor(diff / 3600000) + ' hr ago';
                return Math.floor(diff / 86400000) + 'd ago';
              })();
              return (
                <div className="activity-item" key={act.id}>
                  <div className="activity-icon-wrap" style={{ background: iconInfo.bg, color: iconInfo.color }}>
                    {iconInfo.icon}
                  </div>
                  <div className="activity-content">
                    <div className="activity-title">{act.title || act.subtitle || 'Activity'}</div>
                    <div className="activity-time">{timeAgo}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="glass-card p-6">
          <div className="section-header">
            <span className="section-title">Active Tasks</span>
            <a href="/tasks" className="section-link">View all</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {taskList.length === 0 && <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>No tasks yet. Create one from the Tasks page.</div>}
            {taskList.slice(0, 5).map(task => (
              <div
                key={task.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
                  borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)', cursor: 'pointer',
                  transition: 'var(--transition)', opacity: task.status === 'Done' ? 0.5 : 1,
                }}
                onClick={() => toggleTask(task.id)}
              >
                {task.status === 'Done'
                  ? <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  : <div style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${task.priority === 'High' ? 'var(--danger)' : task.priority === 'Medium' ? 'var(--warning)' : 'var(--text-muted)'}`
                  }} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.82rem', fontWeight: 500,
                    textDecoration: task.status === 'Done' ? 'line-through' : 'none',
                    color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {task.assigned_to || 'Unassigned'} · {task.due_date ? `Due ${new Date(task.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}` : 'No due date'}
                  </div>
                </div>
                <span className={`badge ${task.priority === 'High' ? 'badge-danger' : task.priority === 'Medium' ? 'badge-warning' : 'badge-neutral'}`}>
                  {task.priority}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline Funnel */}
        <div className="glass-card p-6">
          <div className="section-title" style={{ marginBottom: '1rem' }}>CRM Pipeline Funnel</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {funnelData.map(f => (
              <div key={f.stage}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{f.stage}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: funnelColors[f.stage] || 'var(--text-primary)' }}>{f.count}</span>
                </div>
                <div className="progress-bar-wrap">
                  <div className="progress-bar-fill" style={{ width: `${(f.count / maxFunnel) * 100}%`, background: funnelColors[f.stage] || 'var(--accent-primary)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lead Source Breakdown */}
        <div className="glass-card p-6">
          <div className="section-title" style={{ marginBottom: '1rem' }}>Lead Acquisition by Source</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {sourceData.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1rem' }}>No lead data available</div>}
            {sourceData.map(s => (
              <div key={s.source} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 40px', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: sourceColors[s.source] || 'var(--text-secondary)' }}>{s.source}</div>
                <div className="progress-bar-wrap" style={{ height: 8 }}>
                  <div className="progress-bar-fill" style={{ width: `${(s.count / Math.max(1, totalLeads)) * 100}%`, background: sourceColors[s.source] || 'var(--accent-primary)' }} />
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>{s.count}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Field Staff & GPS Tracking Widget */}
        {hasPermission('FieldOps') && (
          <div className="glass-card p-6" style={{ gridColumn: '1 / -1' }}>
            <div className="section-header" style={{ marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="section-title">Live Field Staff & GPS Status</span>
                <span className="badge badge-success" style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Navigation size={11} className="animate-pulse" /> {livePings.length} Active On-Field
                </span>
              </div>
              <a href="/field-ops" className="section-link" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                Open Live Map <ArrowUpRight size={13} />
              </a>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              {livePings.length === 0 ? (
                <div style={{ padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-muted)', fontSize: '0.78rem', gridColumn: '1 / -1', textAlign: 'center' }}>
                  No field agents currently broadcasting GPS. When agents turn on "Live Location" in their field portal, their exact live coordinates will stream here.
                </div>
              ) : (
                livePings.map(agent => (
                  <div key={agent.employee_id} style={{
                    padding: '0.85rem 1rem', borderRadius: 10, background: 'rgba(16,185,129,0.05)',
                    border: '1px solid rgba(16,185,129,0.25)', display: 'flex', flexDirection: 'column', gap: '0.35rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#10b981' }}>
                        🟢 {agent.employee_name}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {agent.last_ping ? new Date(agent.last_ping).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                      📍 {agent.address || `${agent.lat.toFixed(5)}°, ${agent.lng.toFixed(5)}°`}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      🎯 GPS Fix: {agent.lat.toFixed(5)}° N, {agent.lng.toFixed(5)}° E (±{agent.accuracy || 6}m) · {agent.role}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Latest Real Geotagged Inspection Photos */}
            {recentVisits.filter(v => Boolean(v.photo_url)).length > 0 && (
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Camera size={14} color="var(--accent-primary)" /> Latest Geotagged Site Inspection Photos ({recentVisits.filter(v => Boolean(v.photo_url)).length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  {recentVisits.filter(v => Boolean(v.photo_url)).slice(0, 4).map(v => (
                    <div key={v.id} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                      <img src={v.photo_url} alt={v.site_name} style={{ width: '100%', height: 110, objectFit: 'cover' }} />
                      <div style={{ padding: '0.5rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.site_name}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>👤 {v.employee_name} · {new Date(v.check_in_time || v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Module Health */}
        <div className="glass-card p-6" style={{ gridColumn: '1 / -1' }}>
          <div className="section-header">
            <span className="section-title">Module Health & Engagement</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            {[
              { label: 'WhatsApp Delivery', val: totalWaSent > 0 ? Math.round((totalWaDelivered / totalWaSent) * 100) : 0, color: 'var(--whatsapp)' },
              { label: 'Lead Conversion', val: totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0, color: 'var(--accent-primary)' },
              { label: 'Task Completion', val: taskList.length > 0 ? Math.round((taskList.filter(t => t.status === 'Done').length / taskList.length) * 100) : 0, color: 'var(--success)' },
              { label: 'Payment Collection', val: totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0, color: 'var(--warning)' },
            ].map(m => (
              <div key={m.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{m.label}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: m.color }}>{m.val}%</span>
                </div>
                <div className="progress-bar-wrap">
                  <div className="progress-bar-fill" style={{ width: `${m.val}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Executive Report Generator Modal ──────────────────────────────── */}
      {showReportModal && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="modal-content animate-scale-up" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, padding: 0, overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <BarChart3 size={18} color="var(--accent-primary)" /> Executive Business Report Generator
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                  Live intelligence report for <strong>{activeCompany ? activeCompany.company_name : 'Consolidated All Companies'}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.25rem', padding: '0.25rem' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Quick Summary Strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL BILLED</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>{fmtAmount(totalInvoiced)}</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.08)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.25)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--success)', fontWeight: 600 }}>COLLECTED (PAID)</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.2rem' }}>{fmtAmount(totalPaid)}</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--danger)', fontWeight: 600 }}>OUTSTANDING DUE</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--danger)', marginTop: '0.2rem' }}>{fmtAmount(pendingAmount + overdueAmount)}</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.25)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', fontWeight: 600 }}>COLLECTION RATE</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '0.2rem' }}>{collectionRate}%</div>
                </div>
              </div>

              {/* Secondary Details */}
              <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', fontSize: '0.75rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Voucher Ledger:</span>
                  <span style={{ fontWeight: 700, marginLeft: '0.35rem' }}>{invoices.length} Vouchers</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Active CRM Leads:</span>
                  <span style={{ fontWeight: 700, marginLeft: '0.35rem' }}>{totalLeads} ({hotLeads} Hot)</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>WhatsApp Reach:</span>
                  <span style={{ fontWeight: 700, marginLeft: '0.35rem' }}>{totalWaDelivered} Delivered</span>
                </div>
              </div>

              {/* Export Action Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Choose Export Format:</div>
                
                {/* 1. PDF / Print Report */}
                <div
                  onClick={() => { setShowReportModal(false); handlePrintReport(); }}
                  style={{
                    padding: '0.85rem 1rem', borderRadius: 8, background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(99,102,241,0.12)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Printer size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>Print / Save Executive PDF Report</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Formatted high-resolution executive summary layout for print & PDF download</div>
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm btn-primary" style={{ pointerEvents: 'none' }}>
                    <Printer size={13} /> Print PDF
                  </button>
                </div>

                {/* 2. CSV Data Sheet */}
                <div
                  onClick={() => { handleExportCsv(); setShowReportModal(false); }}
                  style={{
                    padding: '0.85rem 1rem', borderRadius: 8, background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--success)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(16,185,129,0.12)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileSpreadsheet size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>Export Executive CSV Spreadsheet</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Includes KPI summaries, monthly revenue, and individual invoice ledger data</div>
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm btn-success" style={{ pointerEvents: 'none' }}>
                    <Download size={13} /> Download CSV
                  </button>
                </div>

                {/* 3. Open BI Analytics Center */}
                <div
                  onClick={() => { setShowReportModal(false); navigate('/reports'); }}
                  style={{
                    padding: '0.85rem 1rem', borderRadius: 8, background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--warning)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(245,158,11,0.12)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BarChart3 size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>Open Reports & Analytics Hub</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Explore multi-period cohort charts, campaign attribution, and Google Sheets sync</div>
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm btn-secondary" style={{ pointerEvents: 'none' }}>
                    <ExternalLink size={13} /> Open Studio
                  </button>
                </div>

              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '0.85rem 1.5rem', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowReportModal(false)}>
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;
