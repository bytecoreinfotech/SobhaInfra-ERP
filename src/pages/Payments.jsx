import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard, Send, CheckCircle2, AlertTriangle, Clock,
  MessageCircle, Phone, RefreshCw, IndianRupee,
  ArrowUpRight, ArrowDownRight, FileText, ShieldCheck,
  RotateCcw, Search, AlertCircle, X, ExternalLink, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Users, Download, Printer,
  PauseCircle, PlayCircle, CalendarClock, MessageSquare
} from 'lucide-react';
import { getInvoices, getCustomerMaster, triggerSheetSync, getSheetSyncLog, invalidateInvoicesCache, invalidateCustomerMasterCache, pauseInvoiceReminder, resumeInvoiceReminder } from '../lib/db';
import { reconcileCustomerInvoices, isSalesVoucher } from '../lib/reconciliation';
import { buildCustomerIndex, matchCustomer } from '../lib/customerMatcher';
import { useCompany } from '../context/CompanyContext';
import InvoiceDocModal from '../components/InvoiceDocModal';
import PaymentReminderModal from '../components/PaymentReminderModal';
import ConsolidatedStatementModal from '../components/ConsolidatedStatementModal';
import { Skeleton, SkeletonTable, SkeletonStats } from '../components/Skeleton';
import './Pages.css';

/**
 * Direction classifier: If party is verified in Google Sheet, they are 1000% a CUSTOMER
 */
const getDirection = (inv, customerIndex) => {
  const status   = inv?.status || '';
  const numUpper = (inv?.invoice_number || inv?.tally_voucher_number || '').toUpperCase().trim();

  // 1. Master Ledger Balances excluded
  if (numUpper.startsWith('LEDGER-')) return { isLedger: true, isVendor: false, canRemind: false };

  // 2. Google Sheet Verified Master Customer: Guaranteed 1000% CUSTOMER
  if (customerIndex) {
    const match = matchCustomer(inv, customerIndex);
    if (match.status === 'verified') {
      if (status === 'Paid') {
        return { label: 'Collected', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', canRemind: false, isVendor: false };
      }
      return { label: 'Receivable', ArrowIcon: ArrowDownRight, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', canRemind: true, isVendor: false };
    }
  }

  // 3. Fallback heuristic for standard invoices
  const dir     = (inv?.metadata?.direction || inv?.direction || '').toLowerCase().trim();
  const vtype   = (inv?.metadata?.voucher_type || inv?.voucher_type || '').toLowerCase().trim();
  const num     = (inv?.invoice_number || inv?.tally_voucher_number || '').toLowerCase().trim();

  const isSales = ['sales', 'sales order', 'tax invoice'].some(t => vtype.includes(t)) || /^(srp|sb)\//i.test(num) || /^(inv|tax)\//i.test(num);
  if (isSales) return status === 'Paid'
    ? { label: 'Collected', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', canRemind: false, isVendor: false }
    : { label: 'Receivable', ArrowIcon: ArrowDownRight, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', canRemind: true, isVendor: false };
  
  const isReceipt = ['receipt', 'bank receipt', 'cash receipt'].some(t => vtype.includes(t)) || /^(rec|rcpt|rct)-/.test(num) || /^sb-r/.test(num) || dir === 'received';
  if (isReceipt) return { label: 'Received', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', canRemind: false, isVendor: false };
  
  const isPurchase = ['purchase', 'purchase order'].some(t => vtype.includes(t)) || /^(pur|po)-/.test(num) || dir === 'payable';
  if (isPurchase) return status === 'Paid'
    ? { label: 'Paid Out', ArrowIcon: ArrowUpRight, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', canRemind: false, isVendor: true }
    : { label: 'Payable', ArrowIcon: ArrowUpRight, color: '#ef4444', bg: 'rgba(239,68,68,0.12)', canRemind: false, isVendor: true };

  if (status === 'Paid') return { label: 'Collected', ArrowIcon: ArrowDownRight, color: '#10b981', bg: 'rgba(16,185,129,0.12)', canRemind: false, isVendor: false };
  return { label: 'Receivable', ArrowIcon: ArrowDownRight, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', canRemind: true, isVendor: false };
};

const Payments = () => {
  const { activeCompany, isConsolidated, companyProfiles } = useCompany();
  const [allInvoices, setAllInvoices]         = useState([]);
  const [customerMaster, setCustomerMaster]   = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [syncing, setSyncing]                 = useState(false);
  const [syncMsg, setSyncMsg]                 = useState('');
  const [lastSynced, setLastSynced]           = useState(null);
  const [remindingId, setRemindingId]         = useState(null);
  const [sentIds, setSentIds]                 = useState([]);
  const [statusFilter, setStatusFilter]       = useState('All'); // 'All' | 'Overdue' | 'Pending' | 'Paid'
  const [phoneFilter, setPhoneFilter]         = useState('all'); // 'all' | 'verified' | 'missing'
  const [searchQuery, setSearchQuery]         = useState('');
  const [customerSortBy, setCustomerSortBy]   = useState('pending_desc'); // 'pending_desc' | 'newest_bill' | 'oldest_due' | 'name_asc' | 'amount_desc'
  const [invoiceSortBy, setInvoiceSortBy]     = useState('date_desc'); // 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
  
  // View mode: 'customer' (Group by Customer Summary) vs 'invoice' (All Invoices Detailed)
  const [viewMode, setViewMode]               = useState('customer');
  const [expandedCustomers, setExpandedCustomers] = useState({});

  // Modals
  const [docModalInv, setDocModalInv]                 = useState(null);
  const [reminderModalData, setReminderModalData]     = useState(null); // { invoice, customer, invoices, statementPdfUrl }
  const [statementModalData, setStatementModalData]   = useState(null); // { customer, invoices }

  // Pause Reminder State
  const [pauseModal, setPauseModal]                   = useState(null);
  const [pauseReason, setPauseReason]                 = useState('');
  const [pausePromisedDate, setPausePromisedDate]     = useState('');
  const [pauseNotes, setPauseNotes]                   = useState('');
  const [pausingSaving, setPausingSaving]             = useState(false);

  // Pagination state (prevents DOM lag)
  const [currentPage, setCurrentPage]         = useState(1);
  const [pageSize, setPageSize]               = useState(50); // 25, 50, 100, -1 (All)

  useEffect(() => { loadAll(); }, []);

  const handlePauseReminder = async (e) => {
    e.preventDefault();
    if (!pauseModal?.invoice) return;
    setPausingSaving(true);

    let committedBy = 'admin_manual';
    if (pauseReason?.includes('phone call')) committedBy = 'admin_phone_call';
    else if (pauseReason?.includes('in-person')) committedBy = 'admin_in_person';
    else if (pauseReason?.includes('WhatsApp message')) committedBy = 'admin_whatsapp_manual';
    else if (pauseReason?.includes('Email')) committedBy = 'admin_email';

    const { data } = await pauseInvoiceReminder(pauseModal.invoice.id, {
      reason: pauseReason || 'Paused by admin',
      promisedDate: pausePromisedDate || null,
      committedBy,
      notes: pauseNotes,
    });
    if (data) {
      setAllInvoices(prev => prev.map(i => i.id === pauseModal.invoice.id ? { ...i, ...data } : i));
    }
    setPauseModal(null);
    setPauseReason('');
    setPausePromisedDate('');
    setPauseNotes('');
    setPausingSaving(false);
  };

  const handleResumeReminder = async (inv) => {
    const { data } = await resumeInvoiceReminder(inv.id);
    if (data) {
      setAllInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, ...data } : i));
    }
  };

  const loadAll = async (forceRefresh = false) => {
    setLoading(true);
    const [invRes, masterRes, logRes] = await Promise.all([
      getInvoices({ forceRefresh }),
      getCustomerMaster({ forceRefresh }),
      getSheetSyncLog(),
    ]);
    setAllInvoices(invRes.data || []);
    setCustomerMaster(masterRes.data || []);
    if (logRes.data?.synced_at) setLastSynced(logRes.data.synced_at);
    setLoading(false);
  };

  // Build memoized customer index once per customerMaster update
  const customerIndex = useMemo(() => buildCustomerIndex(customerMaster), [customerMaster]);

  // Company filtering across active workspace
  const invoices = useMemo(() => {
    const reconciled = reconcileCustomerInvoices(allInvoices);
    if (isConsolidated) return reconciled;
    if (!activeCompany) return reconciled;
    const compName = (activeCompany.company_name || '').toUpperCase();
    const aliases = Array.isArray(activeCompany.alias_names) ? activeCompany.alias_names.map(a => a.toUpperCase()) : [];
    return reconciled.filter(inv => {
      const invCompany = (inv.company_name || inv.tally_company || '').toUpperCase();
      if (!invCompany) return false;
      return [compName, ...aliases].some(n => n && (invCompany.includes(n) || n.includes(invCompany)));
    });
  }, [allInvoices, activeCompany, isConsolidated]);

  // Exclude non-transactional ledger closing balance lines and OP- fake invoices; strictly sales vouchers
  const transactionalInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const num = (inv?.invoice_number || inv?.tally_voucher_number || '').toUpperCase();
      if (num.startsWith('LEDGER-') || num.startsWith('OP-')) return false;
      return isSalesVoucher(inv);
    });
  }, [invoices]);

  // Enriched Customer Invoices: All legitimate customer sales bills
  const enrichedInvoices = useMemo(() => {
    return transactionalInvoices
      .map(inv => {
        const match = matchCustomer(inv, customerIndex);
        const isSheetVerified = match.status === 'verified' && !!match.customer;
        const sheetCustomer = isSheetVerified ? match.customer : null;

        const sheetPhone = (sheetCustomer?.contact_number || '').trim();
        const tallyPhone = (inv.client_phone || '').trim();
        const activePhone = sheetPhone || tallyPhone;
        const digits = activePhone.replace(/\D/g, '');
        const hasVerifiedPhone = digits.length >= 10;

        return {
          ...inv,
          _sheet_customer: sheetCustomer,
          _is_sheet_customer: isSheetVerified,
          _has_verified_phone: hasVerifiedPhone,
          _verified_phone: hasVerifiedPhone ? activePhone : '',
          _contact_person: sheetCustomer?.contact_person || '',
        };
      })
      .filter(Boolean);
  }, [transactionalInvoices, customerIndex]);

  // Group enriched invoices by customer
  const allCustomerGroups = useMemo(() => {
    const groupMap = new Map();

    for (const inv of enrichedInvoices) {
      const key = (inv._sheet_customer?.id || inv._sheet_customer?.company_name || inv.client_name || '').trim().toUpperCase();
      if (!key) continue;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          key,
          customer: inv._sheet_customer || {
            customer_name: inv.client_name,
            company_name: inv.client_name,
            contact_number: inv._verified_phone,
            contact_person: inv._contact_person,
          },
          clientName: inv.client_name,
          contactPerson: inv._contact_person || '',
          phone: inv._verified_phone || '',
          hasPhone: inv._has_verified_phone,
          invoices: [],
          totalBilled: 0,
          totalPending: 0,
          totalPaid: 0,
          overdueCount: 0,
          pendingCount: 0,
          paidCount: 0,
          oldestDueDate: null,
          maxOverdueDays: 0,
          totalRemindersSent: 0,
        });
      }

      const grp = groupMap.get(key);
      grp.invoices.push(inv);

      const amt = Number(inv.amount || 0);
      const bal = Number(inv.pending_amount !== undefined && inv.status !== 'Paid' ? inv.pending_amount : (inv.status === 'Paid' ? 0 : amt));
      const paid = Math.max(0, amt - bal);

      grp.totalBilled += amt;
      grp.totalPending += bal;
      grp.totalPaid += paid;
      grp.totalRemindersSent += (inv.reminder_count || 0);

      if (inv.status === 'Overdue') {
        grp.overdueCount++;
      } else if (inv.status === 'Pending') {
        grp.pendingCount++;
      } else if (inv.status === 'Paid') {
        grp.paidCount++;
      }

      const days = inv.days_overdue || (inv.due_date ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date)) / 86400000)) : 0);
      if (days > grp.maxOverdueDays) {
        grp.maxOverdueDays = days;
      }
      if (inv.due_date && (!grp.oldestDueDate || new Date(inv.due_date) < new Date(grp.oldestDueDate))) {
        grp.oldestDueDate = inv.due_date;
      }

      const invT = new Date(inv.invoice_date || inv.created_at || 0).getTime();
      if (!grp.newestInvoiceTime || invT > grp.newestInvoiceTime) {
        grp.newestInvoiceTime = invT;
      }
    }

    return Array.from(groupMap.values()).sort((a, b) => {
      if (customerSortBy === 'newest_bill') {
        return (b.newestInvoiceTime || 0) - (a.newestInvoiceTime || 0);
      }
      if (customerSortBy === 'oldest_due') {
        return (b.maxOverdueDays || 0) - (a.maxOverdueDays || 0);
      }
      if (customerSortBy === 'name_asc') {
        return (a.clientName || '').localeCompare(b.clientName || '');
      }
      if (customerSortBy === 'amount_desc') {
        return b.totalBilled - a.totalBilled;
      }
      return b.totalPending - a.totalPending;
    });
  }, [enrichedInvoices, customerSortBy]);

  // Filtered Customer Groups
  const filteredCustomerGroups = useMemo(() => {
    return allCustomerGroups.filter(grp => {
      if (statusFilter === 'Overdue' && grp.overdueCount === 0) return false;
      if (statusFilter === 'Pending' && grp.pendingCount === 0) return false;
      if (statusFilter === 'Paid' && grp.totalPending > 0) return false;

      if (phoneFilter === 'verified' && !grp.hasPhone) return false;
      if (phoneFilter === 'missing' && grp.hasPhone) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const client = (grp.clientName || '').toLowerCase();
        const person = (grp.contactPerson || '').toLowerCase();
        const phone = (grp.phone || '').toLowerCase();
        const matchInvoice = grp.invoices.some(i => (i.invoice_number || '').toLowerCase().includes(q));
        if (!client.includes(q) && !person.includes(q) && !phone.includes(q) && !matchInvoice) {
          return false;
        }
      }

      return true;
    });
  }, [allCustomerGroups, statusFilter, phoneFilter, searchQuery]);

  // Multi-dimensional filtering & sorting (Detailed Invoices)
  const filtered = useMemo(() => {
    const list = enrichedInvoices.filter(inv => {
      if (statusFilter !== 'All' && inv.status !== statusFilter) return false;
      if (phoneFilter === 'verified' && !inv._has_verified_phone) return false;
      if (phoneFilter === 'missing' && inv._has_verified_phone) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const num = (inv.invoice_number || '').toLowerCase();
        const client = (inv.client_name || '').toLowerCase();
        const person = (inv._contact_person || '').toLowerCase();
        const phone = (inv._verified_phone || '').toLowerCase();
        if (!num.includes(q) && !client.includes(q) && !person.includes(q) && !phone.includes(q)) {
          return false;
        }
      }
      return true;
    });

    return list.sort((a, b) => {
      if (invoiceSortBy === 'date_asc') {
        const da = new Date(a.invoice_date || a.created_at || 0).getTime();
        const db = new Date(b.invoice_date || b.created_at || 0).getTime();
        return da - db;
      }
      if (invoiceSortBy === 'amount_desc') {
        return Number(b.amount || 0) - Number(a.amount || 0);
      }
      if (invoiceSortBy === 'amount_asc') {
        return Number(a.amount || 0) - Number(b.amount || 0);
      }
      // Default: date_desc (Newest First)
      const da = new Date(a.invoice_date || a.created_at || 0).getTime();
      const db = new Date(b.invoice_date || b.created_at || 0).getTime();
      return db - da;
    });
  }, [enrichedInvoices, statusFilter, phoneFilter, searchQuery, invoiceSortBy]);

  // Reset pagination on filter or view mode changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, phoneFilter, searchQuery, activeCompany, isConsolidated, viewMode, customerSortBy, invoiceSortBy]);

  // Paginated slices
  const totalInvoicePages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedInvoices = useMemo(() => {
    if (pageSize === -1) return filtered;
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const totalCustomerPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(filteredCustomerGroups.length / pageSize));
  const paginatedCustomerGroups = useMemo(() => {
    if (pageSize === -1) return filteredCustomerGroups;
    const start = (currentPage - 1) * pageSize;
    return filteredCustomerGroups.slice(start, start + pageSize);
  }, [filteredCustomerGroups, currentPage, pageSize]);

  const totalPages = viewMode === 'customer' ? totalCustomerPages : totalInvoicePages;
  const currentItemsCount = viewMode === 'customer' ? filteredCustomerGroups.length : filtered.length;

  const toggleCustomerExpand = (key) => {
    setExpandedCustomers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Metrics
  const totalOverdue = enrichedInvoices.filter(i => i.status === 'Overdue').reduce((s, i) => s + Number(i.pending_amount ?? i.amount), 0);
  const totalPending = enrichedInvoices.filter(i => i.status === 'Pending').reduce((s, i) => s + Number(i.pending_amount ?? i.amount), 0);
  const totalPaid    = enrichedInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount), 0);
  const totalWithPhone = enrichedInvoices.filter(i => i._has_verified_phone).length;
  const totalMissingPhone = enrichedInvoices.filter(i => !i._has_verified_phone).length;

  const fmtAmount = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const fmtCurrency = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const handleSheetSync = async () => {
    setSyncing(true);
    setSyncMsg('Fetching live customer directory from Google Sheet...');
    const { data, error } = await triggerSheetSync();
    if (error || !data?.success) {
      // Invalidate cache and reload directly
      invalidateCustomerMasterCache();
      const masterRes = await getCustomerMaster({ forceRefresh: true });
      setCustomerMaster(masterRes.data || []);
      setSyncMsg(`Refreshed ${masterRes.data?.length || 0} customers from database`);
    } else {
      setSyncMsg(`✅ Synced ${data.synced} customers live from Google Sheet! Numbers updated.`);
      invalidateCustomerMasterCache();
      const masterRes = await getCustomerMaster({ forceRefresh: true });
      setCustomerMaster(masterRes.data || []);
      setLastSynced(new Date().toISOString());
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 4500);
  };

  const handleRemindSingle = (inv) => {
    if (!inv._has_verified_phone) return;
    setReminderModalData({
      invoice: inv,
      customer: inv._sheet_customer,
      invoices: [inv],
    });
  };

  const handleRemindCustomer = (grp) => {
    if (!grp.hasPhone) return;
    // Route through Consolidated Statement modal to generate authentic 2-page PDF & dispatch with WhatsApp
    handleOpenStatement(grp);
  };

  const handleOpenStatement = (grp) => {
    setStatementModalData({
      customer: grp.customer,
      invoices: grp.invoices,
    });
  };

  const getDaysLabel = (inv) => {
    if (inv.status === 'Paid') return <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Settled</span>;
    if (inv.status === 'Overdue') {
      const diff = inv.days_overdue || Math.floor((Date.now() - new Date(inv.due_date)) / 86400000);
      return <span style={{ color: 'var(--danger)', fontWeight: 600 }}>⚠ {diff}d overdue</span>;
    }
    if (inv.status === 'Pending' && inv.due_date) {
      const diff = Math.ceil((new Date(inv.due_date) - Date.now()) / 86400000);
      return <span style={{ color: diff <= 2 ? 'var(--danger)' : 'var(--warning)', fontWeight: 600 }}>Due in {diff}d</span>;
    }
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  };

  const lastSyncedLabel = lastSynced
    ? new Date(lastSynced).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Payment Follow-up</h1>
          <p className="page-subtitle">
            Authoritative Google Sheet Customer Directory
            {lastSyncedLabel && (
              <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                · Sheet synced {lastSyncedLabel}
              </span>
            )}
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-secondary"
            onClick={handleSheetSync}
            disabled={syncing}
            data-tooltip="Fetch latest names & phone numbers from live Google Sheet"
            data-tooltip-pos="bottom"
          >
            <RotateCcw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : `Sync Sheet (${customerMaster.length})`}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => loadAll(true)}
            data-tooltip="Force reload all invoices from database"
            data-tooltip-pos="bottom"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Sync Notification Toast */}
      {syncMsg && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)', padding: '0.65rem 1rem',
          marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--text-primary)',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <ShieldCheck size={15} color="var(--success)" /> {syncMsg}
        </div>
      )}

      {/* Verification Summary Banner */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.75rem 1.1rem', marginBottom: '1.25rem',
        background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)',
        borderRadius: 'var(--radius-md)', fontSize: '0.8rem', flexWrap: 'wrap', gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldCheck size={16} color="#6366f1" />
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Skeleton width="160px" height="15px" borderRadius="4px" />
              <Skeleton width="220px" height="13px" borderRadius="4px" style={{ opacity: 0.6 }} />
            </div>
          ) : (
            <>
              <span style={{ color: '#6366f1', fontWeight: 700 }}>
                {enrichedInvoices.length} Verified Customer Invoices across {allCustomerGroups.length} Clients
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                · Matched against Google Sheet Master Directory ({customerMaster.length} Companies)
              </span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', fontSize: '0.75rem' }}>
          {loading ? (
            <Skeleton width="180px" height="14px" borderRadius="4px" />
          ) : (
            <>
              <span style={{ color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
                {totalWithPhone} Ready for WhatsApp
              </span>
              {totalMissingPhone > 0 && (
                <span
                  style={{ color: '#d97706', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}
                  onClick={() => setPhoneFilter('missing')}
                  data-tooltip="Click to view all customers with missing phone numbers in Google Sheet"
                  data-tooltip-pos="bottom"
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#d97706' }} />
                  {totalMissingPhone} Phone Missing in Sheet
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* KPI Stats Grid */}
      {loading ? (
        <SkeletonStats count={4} />
      ) : (
        <div className="stats-grid">
          {[
            { label: 'Overdue Amount', value: fmtAmount(totalOverdue), color: 'var(--danger)', bg: 'var(--danger-bg)', icon: <AlertTriangle size={20} />, count: enrichedInvoices.filter(i => i.status === 'Overdue').length + ' invoices' },
            { label: 'Not Yet Due', value: fmtAmount(totalPending), color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <Clock size={20} />, count: enrichedInvoices.filter(i => i.status === 'Pending').length + ' invoices' },
            { label: 'Collected (Paid)', value: fmtAmount(totalPaid), color: 'var(--success)', bg: 'var(--success-bg)', icon: <CheckCircle2 size={20} />, count: enrichedInvoices.filter(i => i.status === 'Paid').length + ' invoices' },
            { label: 'Reminders Sent', value: sentIds.length + enrichedInvoices.reduce((s, i) => s + (i.reminder_count || 0), 0), color: '#6366f1', bg: 'rgba(99,102,241,0.1)', icon: <MessageCircle size={20} />, count: 'total logged' },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ '--card-accent': s.color }}>
              <div className="stat-header">
                <div>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{s.value}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{s.count}</div>
                </div>
                <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Mode Segmented Switch: Group by Customer vs All Detailed Invoices */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem',
        padding: '0.45rem 0.65rem', background: 'var(--bg-tertiary)',
        borderRadius: '12px', border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'customer' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setViewMode('customer'); setCurrentPage(1); }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.8rem' }}
          >
            <Users size={14} /> Group by Customer ({allCustomerGroups.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'invoice' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setViewMode('invoice'); setCurrentPage(1); }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.8rem' }}
          >
            <FileText size={14} /> All Invoices Detailed ({enrichedInvoices.length})
          </button>
        </div>
        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span>
            {viewMode === 'customer'
              ? '✨ Showing 1 consolidated row per customer to avoid spamming multiple bills'
              : '📄 Showing all individual vouchers for detailed audits & e-Way bill downloads'}
          </span>
        </div>
      </div>

      {/* Search & Multi-filter Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {/* Status Filter Chips */}
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          {['All', 'Overdue', 'Pending', 'Paid'].map(f => {
            const count = viewMode === 'customer'
              ? (f === 'All' ? allCustomerGroups.length : f === 'Overdue' ? allCustomerGroups.filter(g => g.overdueCount > 0).length : f === 'Pending' ? allCustomerGroups.filter(g => g.pendingCount > 0).length : allCustomerGroups.filter(g => g.totalPending === 0).length)
              : (f === 'All' ? enrichedInvoices.length : enrichedInvoices.filter(i => i.status === f).length);

            return (
              <button
                key={f}
                className={`filter-chip ${statusFilter === f ? 'active' : ''}`}
                onClick={() => setStatusFilter(f)}
              >
                {f} ({count})
              </button>
            );
          })}
        </div>

        {/* Phone Verification Filter Chips */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginRight: '0.2rem' }}>
            Phone Filter:
          </span>
          {[
            { id: 'all', label: `All (${viewMode === 'customer' ? allCustomerGroups.length : enrichedInvoices.length})` },
            { id: 'verified', label: `📱 Verified Phone (${viewMode === 'customer' ? allCustomerGroups.filter(g => g.hasPhone).length : totalWithPhone})`, activeColor: '#10b981' },
            { id: 'missing', label: `⚠️ Missing Phone (${viewMode === 'customer' ? allCustomerGroups.filter(g => !g.hasPhone).length : totalMissingPhone})`, activeColor: '#d97706' },
          ].map(pf => {
            const isActive = phoneFilter === pf.id;
            return (
              <button
                key={pf.id}
                onClick={() => setPhoneFilter(pf.id)}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: isActive ? 700 : 500,
                  padding: '0.3rem 0.65rem',
                  borderRadius: '9999px',
                  border: isActive ? `1.5px solid ${pf.activeColor || 'var(--accent-primary)'}` : '1px solid var(--border-color)',
                  background: isActive ? (pf.activeColor ? `${pf.activeColor}18` : 'var(--accent-primary-bg, rgba(99,102,241,0.12))') : 'var(--bg-tertiary)',
                  color: isActive ? (pf.activeColor || 'var(--accent-primary)') : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {pf.label}
              </button>
            );
          })}
        </div>

        {/* Sort & Search Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {viewMode === 'customer' ? (
            <select
              className="input-field"
              style={{ padding: '0.35rem 0.55rem', fontSize: '0.78rem', height: '32px', minWidth: '170px' }}
              value={customerSortBy}
              onChange={e => setCustomerSortBy(e.target.value)}
            >
              <option value="pending_desc">⬇ Highest Balance Due</option>
              <option value="newest_bill">🕒 Newest Activity / Bill</option>
              <option value="oldest_due">⚠️ Oldest Due (Urgent)</option>
              <option value="name_asc">🔤 Customer Name (A-Z)</option>
              <option value="amount_desc">💰 Total Billed (High)</option>
            </select>
          ) : (
            <select
              className="input-field"
              style={{ padding: '0.35rem 0.55rem', fontSize: '0.78rem', height: '32px', minWidth: '150px' }}
              value={invoiceSortBy}
              onChange={e => setInvoiceSortBy(e.target.value)}
            >
              <option value="date_desc">⬇ Date (Newest)</option>
              <option value="date_asc">⬆ Date (Oldest)</option>
              <option value="amount_desc">⬇ Amount (High)</option>
              <option value="amount_asc">⬆ Amount (Low)</option>
            </select>
          )}

          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder={viewMode === 'customer' ? 'Search customer, phone...' : 'Search voucher, client...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px', fontSize: '0.78rem', height: '32px' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table: Grouped by Customer vs All Invoices */}
      {loading ? (
        <SkeletonTable
          columns={viewMode === 'customer'
            ? ['Client / Business', 'Total Invoices', 'Total Billed', 'Paid Amount', 'Pending Due', 'Oldest Due', 'Actions']
            : ['Invoice #', 'Client', 'Amount', 'Status', 'Due / Overdue', 'Reminders', 'Actions']}
          rows={8}
          paginationLabel={viewMode === 'customer' ? 'customers' : 'invoices'}
        />
      ) : (
        <div className="glass-card table-container">
          {viewMode === 'customer' ? (
            /* ═════════════════════════════════════════════════════════════════
               CUSTOMER-WISE GROUPED SUMMARY TABLE
               ═════════════════════════════════════════════════════════════════ */
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '35px' }}></th>
                  <th>Customer / Business</th>
                  <th>Invoices Breakdown</th>
                  <th style={{ textAlign: 'right' }}>Total Billed</th>
                  <th style={{ textAlign: 'right' }}>Paid Amount</th>
                  <th style={{ textAlign: 'right' }}>Total Outstanding Due</th>
                  <th style={{ textAlign: 'center' }}>Oldest Due</th>
                  <th>Follow-up Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomerGroups.map(grp => {
                  const isExpanded = Boolean(expandedCustomers[grp.key]);
                  const hasPhone = grp.hasPhone;
                  const isAllPaid = grp.totalPending === 0;

                  return (
                    <React.Fragment key={grp.key}>
                      <tr
                        style={{
                          background: isExpanded ? 'rgba(99,102,241,0.05)' : (hasPhone ? 'transparent' : 'rgba(248, 250, 252, 0.45)'),
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                        }}
                        onClick={() => toggleCustomerExpand(grp.key)}
                      >
                        {/* Expand Chevron */}
                        <td style={{ textAlign: 'center', padding: '0.6rem 0.4rem' }}>
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: 0 }}
                            onClick={(e) => { e.stopPropagation(); toggleCustomerExpand(grp.key); }}
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </td>

                        {/* Customer Info */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                              {grp.clientName}
                            </div>
                            {grp.invoices.length > 1 && (
                              <span className="badge badge-neutral" style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem' }}>
                                {grp.invoices.length} Bills
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                            {grp.contactPerson && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                👤 {grp.contactPerson}
                              </span>
                            )}
                            {hasPhone ? (
                              <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                📞 {grp.phone}
                              </span>
                            ) : (
                              <span
                                data-tooltip="Phone missing in Google Sheet. Add contact in Google Sheet & click Sync Sheet."
                                data-tooltip-pos="bottom"
                                style={{
                                  fontSize: '0.65rem',
                                  fontWeight: 600,
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  color: '#d97706',
                                  border: '1px solid rgba(245, 158, 11, 0.3)',
                                  padding: '0.12rem 0.5rem',
                                  borderRadius: '12px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}
                              >
                                ⚠️ No Phone in Sheet
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Invoices Breakdown Pills */}
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {grp.overdueCount > 0 && (
                              <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                                {grp.overdueCount} Overdue
                              </span>
                            )}
                            {grp.pendingCount > 0 && (
                              <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                                {grp.pendingCount} Pending
                              </span>
                            )}
                            {grp.paidCount > 0 && (
                              <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                                {grp.paidCount} Paid
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Financial Metrics */}
                        <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {fmtAmount(grp.totalBilled)}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--success)', fontWeight: 600 }}>
                          {fmtAmount(grp.totalPaid)}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: '0.95rem', fontWeight: 700, color: grp.totalPending > 0 ? 'var(--danger)' : 'var(--success)' }}>
                          {fmtAmount(grp.totalPending)}
                        </td>

                        {/* Oldest Overdue / Age */}
                        <td style={{ textAlign: 'center', fontSize: '0.82rem' }}>
                          {isAllPaid ? (
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Settled</span>
                          ) : grp.maxOverdueDays > 0 ? (
                            <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                              ⚠ {grp.maxOverdueDays}d overdue
                            </span>
                          ) : (
                            <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Current</span>
                          )}
                        </td>

                        {/* Consolidated Actions */}
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            {/* 2-Page Consolidated Statement PDF Preview */}
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.22rem 0.5rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              onClick={() => handleOpenStatement(grp)}
                              data-tooltip="View 2-Page Statement of Account PDF with Aging Ledger & Remittance Slip"
                              data-tooltip-pos="left"
                            >
                              <FileText size={12} color="var(--accent-primary)" /> Statement
                            </button>

                            {/* Consolidated WhatsApp Reminder Dispatch */}
                            {isAllPaid ? (
                              <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
                                ✓ Cleared
                              </span>
                            ) : !hasPhone ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled
                                style={{ opacity: 0.5, cursor: 'not-allowed', fontSize: '0.7rem', padding: '0.22rem 0.5rem' }}
                                data-tooltip="Disabled: Phone number is missing in Google Sheet."
                                data-tooltip-pos="left"
                              >
                                <AlertTriangle size={11} color="#d97706" /> No Phone
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-whatsapp btn-sm"
                                  style={{ padding: '0.22rem 0.55rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                  onClick={() => handleRemindCustomer(grp)}
                                  data-tooltip={`Send single consolidated WhatsApp reminder for ${grp.invoices.filter(i => i.status !== 'Paid').length} unpaid bills to ${grp.phone}`}
                                  data-tooltip-pos="left"
                                >
                                  <Send size={12} /> Send Reminder
                                </button>
                                <a
                                  href={`tel:${grp.phone}`}
                                  className="btn btn-secondary btn-sm"
                                  data-tooltip={`Call ${grp.phone}`}
                                  data-tooltip-pos="left"
                                  style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.4rem' }}
                                >
                                  <Phone size={12} />
                                </a>
                                <a
                                  href={`https://wa.me/91${String(grp.phone).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`Namaste ${grp.clientName}! Greetings from Sobhainfra Tech. Your total outstanding balance is ${fmtCurrency(grp.totalPending)} across ${grp.invoices.filter(i => i.status !== 'Paid').length} unpaid bills. Please release payment or share UTR. Thank you!`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-secondary btn-sm"
                                  data-tooltip={`Open directly in WhatsApp Web / Desktop for ${grp.phone}`}
                                  data-tooltip-pos="left"
                                  style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.4rem', color: '#10b981' }}
                                >
                                  <ExternalLink size={12} />
                                </a>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Individual Invoices Sub-table */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-tertiary)', borderTop: 'none' }}>
                            <div style={{
                              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                              borderRadius: '8px', padding: '0.75rem', overflowX: 'auto'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  Individual Invoices Breakdown for {grp.clientName} ({grp.invoices.length} Bills)
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}
                                  onClick={() => handleOpenStatement(grp)}
                                >
                                  <Printer size={11} /> Print / Save 2-Page SOA
                                </button>
                              </div>

                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Sr.</th>
                                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Invoice #</th>
                                    <th style={{ textAlign: 'center', padding: '4px 6px' }}>Invoice Date</th>
                                    <th style={{ textAlign: 'center', padding: '4px 6px' }}>Due Date</th>
                                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>Billed (₹)</th>
                                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>Paid (₹)</th>
                                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>Balance Due (₹)</th>
                                    <th style={{ textAlign: 'center', padding: '4px 6px' }}>Status</th>
                                    <th style={{ textAlign: 'center', padding: '4px 6px' }}>Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {grp.invoices.map((inv, idx) => {
                                    const invAmt = Number(inv.amount || 0);
                                    const balDue = Number(inv.pending_amount !== undefined && inv.status !== 'Paid' ? inv.pending_amount : (inv.status === 'Paid' ? 0 : invAmt));
                                    const paidAmt = Math.max(0, invAmt - balDue);

                                    return (
                                      <tr key={inv.id || idx} style={{ borderBottom: '1px dashed var(--border-color)' }}>
                                        <td style={{ padding: '5px 6px' }}>{idx + 1}</td>
                                        <td style={{ padding: '5px 6px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent-primary)' }}>
                                          {inv.invoice_number}
                                        </td>
                                        <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                                          {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                        </td>
                                        <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                                          {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                        </td>
                                        <td style={{ padding: '5px 6px', textAlign: 'right' }}>{fmtAmount(invAmt)}</td>
                                        <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--success)' }}>{fmtAmount(paidAmt)}</td>
                                        <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700, color: balDue > 0 ? 'var(--danger)' : 'var(--success)' }}>
                                          {fmtAmount(balDue)}
                                        </td>
                                        <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                                          <span className={`badge ${inv.status === 'Paid' ? 'badge-success' : inv.status === 'Overdue' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.66rem' }}>
                                            {inv.status}
                                          </span>
                                        </td>
                                        <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                                          <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                                            <button
                                              type="button"
                                              className="btn btn-secondary btn-sm"
                                              style={{ padding: '0.15rem 0.4rem', fontSize: '0.65rem' }}
                                              onClick={() => setDocModalInv(inv)}
                                              data-tooltip="View 2-Page Tax Invoice + e-Way Bill"
                                              data-tooltip-pos="left"
                                            >
                                              <FileText size={10} /> Bill
                                            </button>
                                            {inv.status !== 'Paid' && hasPhone && (
                                              <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                style={{ padding: '0.15rem 0.4rem', fontSize: '0.65rem', color: 'var(--whatsapp)' }}
                                                onClick={() => handleRemindSingle(inv)}
                                                data-tooltip="Send reminder for this single invoice only"
                                                data-tooltip-pos="left"
                                              >
                                                <Send size={10} /> Remind Single
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {filteredCustomerGroups.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                      <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        <ShieldCheck size={32} style={{ opacity: 0.35 }} />
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>No matching customers found</span>
                        <span style={{ fontSize: '0.75rem' }}>Try changing the status or phone filter above.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            /* ═════════════════════════════════════════════════════════════════
               ALL INVOICES DETAILED TABLE (Original Granular View)
               ═════════════════════════════════════════════════════════════════ */
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Due / Overdue</th>
                  <th>Reminders</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedInvoices.map(inv => {
                  const isSent = sentIds.includes(inv.id);
                  const isReminding = remindingId === inv.id;
                  const dirInfo = getDirection(inv, customerIndex);
                  const hasPhone = inv._has_verified_phone;

                  return (
                    <tr
                      key={inv.id}
                      style={{
                        opacity: hasPhone ? 1 : 0.75,
                        background: hasPhone ? 'transparent' : 'rgba(248, 250, 252, 0.45)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Invoice Number */}
                      <td style={{ fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {inv.invoice_number}
                      </td>

                      {/* Client & Phone Verified from Sheet */}
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: hasPhone ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {inv.client_name}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                          {inv._contact_person && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              👤 {inv._contact_person}
                            </span>
                          )}
                          {hasPhone ? (
                            <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                              📞 {inv._verified_phone}
                            </span>
                          ) : (
                            <span
                              data-tooltip="Phone missing in Google Sheet. Add contact number in Google Sheet & click 'Sync Sheet' to enable WhatsApp reminders."
                              data-tooltip-pos="bottom"
                              style={{
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                background: 'rgba(245, 158, 11, 0.12)',
                                color: '#d97706',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                padding: '0.12rem 0.5rem',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                            >
                              ⚠️ No Phone in Sheet
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Amount */}
                      <td style={{ fontWeight: 700, fontSize: '0.9rem', color: inv.status === 'Paid' ? 'var(--success)' : inv.status === 'Overdue' ? 'var(--danger)' : 'var(--text-primary)' }}>
                        <div>{fmtAmount(inv.pending_amount !== undefined && inv.status !== 'Paid' ? inv.pending_amount : inv.amount)}</div>
                        {inv.pending_amount !== undefined && inv.status !== 'Paid' && inv.pending_amount < inv.amount && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                            of {fmtAmount(inv.amount)} (₹{(inv.paid_amount || 0).toLocaleString('en-IN')} paid)
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        <span className={`badge ${inv.status === 'Paid' ? 'badge-success' : inv.status === 'Overdue' ? 'badge-danger' : 'badge-warning'}`}>
                          {inv.status}
                        </span>
                      </td>

                      {/* Due / Overdue */}
                      <td style={{ fontSize: '0.82rem' }}>{getDaysLabel(inv)}</td>

                      {/* Reminders Count */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span className="badge badge-neutral">
                            {(isSent ? (inv.reminder_count || 0) + 1 : (inv.reminder_count || 0))} sent
                          </span>
                          {(inv.reminder_paused === true || inv.reminder_paused === 'true') && (
                            <span
                              style={{
                                fontSize: '0.62rem',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: '#fffbeb',
                                color: '#92400e',
                                fontWeight: 700,
                                border: '1px solid #fde68a',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                                width: 'fit-content'
                              }}
                              data-tooltip={inv.payment_promised_date ? `Promised payment by ${new Date(inv.payment_promised_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : 'Indefinitely paused'}
                              data-tooltip-pos="top"
                            >
                              ⏸ Paused {inv.payment_promised_date && `until ${new Date(inv.payment_promised_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          {/* Bill Button — opens 2-page Tax Invoice & e-Way Bill modal with 100% pixel perfection */}
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.2rem 0.45rem', fontSize: '0.68rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                            onClick={() => setDocModalInv(inv)}
                            data-tooltip="View Exact 2-Page Tax Invoice & e-Way Bill"
                            data-tooltip-pos="left"
                          >
                            <FileText size={11} /> Bill
                          </button>

                          {!dirInfo.canRemind ? (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              {dirInfo.label === 'Paid Out' ? '✓ Paid' : dirInfo.label}
                            </span>
                          ) : inv.status === 'Paid' ? (
                            <span style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 600 }}>✓ Cleared</span>
                          ) : (inv.reminder_paused === true || inv.reminder_paused === 'true') ? (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', borderColor: 'rgba(16,185,129,0.4)' }}
                              onClick={() => handleResumeReminder(inv)}
                              data-tooltip="Resume automated payment reminders for this invoice"
                              data-tooltip-pos="left"
                            >
                              <PlayCircle size={12} /> Resume
                            </button>
                          ) : !hasPhone ? (
                            /* Disabled Remind Button when phone is missing in Google Sheet */
                            <span
                              data-tooltip="Disabled: Phone number is missing in Google Sheet. Add contact in sheet & click Sync Sheet."
                              data-tooltip-pos="left"
                              style={{ display: 'inline-flex' }}
                            >
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled
                                style={{
                                  padding: '0.2rem 0.5rem',
                                  fontSize: '0.7rem',
                                  opacity: 0.5,
                                  cursor: 'not-allowed',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  color: '#d97706',
                                  borderColor: 'rgba(245, 158, 11, 0.4)',
                                  pointerEvents: 'none',
                                }}
                              >
                                <AlertTriangle size={11} color="#d97706" /> No Phone
                              </button>
                            </span>
                          ) : (
                            /* Active WhatsApp Remind Button */
                            <>
                              <button
                                className={`btn btn-sm ${isSent ? 'btn-success' : isReminding ? 'btn-secondary' : 'btn-whatsapp'}`}
                                onClick={() => !isSent && !isReminding && handleRemindSingle(inv)}
                                disabled={isReminding || isSent}
                                data-tooltip={`Send payment reminder via WhatsApp to ${inv._verified_phone}`}
                                data-tooltip-pos="left"
                              >
                                {isSent ? <><CheckCircle2 size={13} /> Sent</> : isReminding ? 'Sending...' : <><Send size={13} /> Remind</>}
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.68rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}
                                onClick={() => { setPauseModal({ invoice: inv }); setPausePromisedDate(''); setPauseReason(''); setPauseNotes(''); }}
                                data-tooltip="Pause automatic reminders (set customer promised payment date)"
                                data-tooltip-pos="left"
                              >
                                <PauseCircle size={12} />
                              </button>
                              <a
                                href={`tel:${inv._verified_phone}`}
                                className="btn btn-secondary btn-sm"
                                data-tooltip={`Call ${inv._verified_phone}`}
                                data-tooltip-pos="left"
                                style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.4rem' }}
                              >
                                <Phone size={12} />
                              </a>
                              <a
                                href={`https://wa.me/91${String(inv._verified_phone).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`Namaste ${inv.client_name || 'Client'}! Payment reminder regarding Invoice ${inv.invoice_number || inv.tally_voucher_number} for ₹${Number(inv.amount || 0).toLocaleString('en-IN')}. Please release payment or share UTR. Thank you! - Sobhainfra Tech`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary btn-sm"
                                data-tooltip={`Open directly in WhatsApp Web / Desktop for ${inv._verified_phone}`}
                                data-tooltip-pos="left"
                                style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.4rem', color: '#10b981' }}
                              >
                                <ExternalLink size={12} />
                              </a>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                      <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        <ShieldCheck size={32} style={{ opacity: 0.35 }} />
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>No matching customer invoices found</span>
                        <span style={{ fontSize: '0.75rem' }}>
                          {phoneFilter === 'missing'
                            ? 'Great! All active customer invoices have verified phone numbers in Google Sheet.'
                            : 'Try changing the status or phone filter above.'}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* Pagination & Lazy Load Footer */}
          {currentItemsCount > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)',
              background: 'var(--bg-tertiary)', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.78rem'
            }}>
              <div style={{ color: 'var(--text-muted)' }}>
                Showing <strong>{pageSize === -1 ? 1 : Math.min((currentPage - 1) * pageSize + 1, currentItemsCount)}</strong> to <strong>{pageSize === -1 ? currentItemsCount : Math.min(currentPage * pageSize, currentItemsCount)}</strong> of <strong>{currentItemsCount}</strong> {viewMode === 'customer' ? 'customers' : 'invoices'}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Rows:</span>
                  {[25, 50, 100, -1].map(size => (
                    <button
                      key={size}
                      onClick={() => { setPageSize(size); setCurrentPage(1); }}
                      style={{
                        padding: '0.15rem 0.45rem',
                        fontSize: '0.72rem',
                        borderRadius: '4px',
                        border: pageSize === size ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                        background: pageSize === size ? 'var(--accent-primary)' : 'transparent',
                        color: pageSize === size ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      {size === -1 ? 'All' : size}
                    </button>
                  ))}
                </div>

                {pageSize !== -1 && totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      style={{ padding: '0.2rem 0.4rem', opacity: currentPage <= 1 ? 0.4 : 1 }}
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span style={{ padding: '0 0.4rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      style={{ padding: '0.2rem 0.4rem', opacity: currentPage >= totalPages ? 0.4 : 1 }}
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2-Page Pixel-Perfect Tax Invoice & e-Way Bill Modal */}
      {docModalInv && (
        <InvoiceDocModal
          invoice={docModalInv}
          activeCompany={activeCompany}
          onClose={() => setDocModalInv(null)}
          onSendSuccess={(invId, pdfUrl) => {
            setSentIds(prev => [...prev, invId]);
            setAllInvoices(prev => prev.map(i => i.id === invId ? {
              ...i,
              pdf_url: pdfUrl,
              reminder_count: (i.reminder_count || 0) + 1,
              last_reminder_at: new Date().toISOString(),
            } : i));
          }}
        />
      )}

      {/* 2-Page Consolidated Customer Statement of Account Modal */}
      {statementModalData && (
        <ConsolidatedStatementModal
          customer={statementModalData.customer}
          invoices={statementModalData.invoices}
          activeCompany={activeCompany || companyProfiles?.[0] || null}
          onClose={() => setStatementModalData(null)}
          onSendWhatsApp={(cust, invs, pdfUrl) => {
            setReminderModalData({
              customer: cust,
              invoices: invs,
              statementPdfUrl: pdfUrl,
            });
          }}
        />
      )}

      {/* Customizable WhatsApp Payment Reminder Modal (Supports Single & Consolidated Multi-Bill) */}
      {reminderModalData && (
        <PaymentReminderModal
          invoice={reminderModalData.invoice || null}
          customer={reminderModalData.customer || null}
          invoices={reminderModalData.invoices || []}
          statementPdfUrl={reminderModalData.statementPdfUrl || null}
          onClose={() => setReminderModalData(null)}
          onSendSuccess={(ids, message) => {
            const idList = Array.isArray(ids) ? ids : [ids];
            setSentIds(prev => [...prev, ...idList]);
            setAllInvoices(prev => prev.map(i => idList.includes(i.id) ? {
              ...i,
              reminder_count: (i.reminder_count || 0) + 1,
              last_reminder_at: new Date().toISOString(),
            } : i));
          }}
        />
      )}
      {/* ── Pause Reminder Modal ── */}
      {pauseModal?.invoice && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setPauseModal(null); }} style={{ zIndex: 9999 }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 500, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,165,0,0.15)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PauseCircle size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>Pause Auto-Reminders</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{pauseModal.invoice.client_name} — {pauseModal.invoice.invoice_number}</div>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setPauseModal(null)}>✕</button>
            </div>

            <div style={{ padding: '0.75rem 1rem', background: 'rgba(255,165,0,0.06)', border: '1px solid rgba(255,165,0,0.25)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Pausing will stop automatic WhatsApp reminders for this bill. If the client promised payment by a certain date (e.g. 10 days, 25th), set it below &mdash; reminders will <strong>automatically resume</strong> if unpaid after that date.
            </div>

            <form onSubmit={handlePauseReminder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  <MessageSquare size={13} style={{ display: 'inline', marginRight: 4 }} />
                  How was payment promise communicated? *
                </label>
                <select
                  className="input-field"
                  value={pauseReason}
                  onChange={e => setPauseReason(e.target.value)}
                  required
                >
                  <option value="">-- Select Channel --</option>
                  <option value="Client committed date on phone call">📞 Phone call with admin/manager</option>
                  <option value="Client in-person payment promise">🤝 In-person / Office visit promise</option>
                  <option value="Client committed via WhatsApp message">💬 WhatsApp message</option>
                  <option value="Email commitment received">📧 Email commitment received</option>
                  <option value="Partial payment received, balance pending">💰 Partial payment received — balance pending</option>
                  <option value="Payment arrangement under discussion">🗓️ Under payment arrangement discussion</option>
                  <option value="Client requested pause">📩 Client specifically requested pause</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  <CalendarClock size={13} style={{ display: 'inline', marginRight: 4 }} />
                  Payment Promised By (Date)
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={pausePromisedDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setPausePromisedDate(e.target.value)}
                />
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {pausePromisedDate
                    ? `⚡ Auto-reminders will resume on ${new Date(pausePromisedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} if payment is still pending.`
                    : 'Leave blank for indefinite pause (must manually resume).'}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Internal Notes (Optional)</label>
                <textarea
                  className="input-field textarea-field"
                  rows={2}
                  placeholder="e.g. Spoke with client, will clear balance by next week via RTGS..."
                  value={pauseNotes}
                  onChange={e => setPauseNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPauseModal(null)}>Cancel</button>
                <button
                  type="submit"
                  className="btn"
                  disabled={pausingSaving}
                  style={{ background: 'var(--warning)', color: 'black', fontWeight: 700 }}
                >
                  {pausingSaving ? 'Pausing...' : '⏸ Pause Auto-Reminders'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
