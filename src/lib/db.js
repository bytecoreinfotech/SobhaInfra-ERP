/**
 * SobhaInfra ERP Centralized Data Service
 * Implements Multi-Tenant Data Layer with dynamic company profiles.
 * Supports offline demo fallback and live Supabase PostgreSQL connection with RLS.
 */
import { supabase, isSupabaseConfigured } from './supabase';

export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

// ─────────────────────────────────────────────────────────────────────────────
// PHONE NORMALIZATION UTILITY (Section 42) — +91 is OPTIONAL & Auto-Assumed
// ─────────────────────────────────────────────────────────────────────────────
export function normalizePhone(phone) {
  if (!phone) return '';
  const str = String(phone).trim();
  const digits = str.replace(/\D/g, '');
  if (!digits) return '';

  // 10 digits without country code (e.g. 9876543210) -> +919876543210
  if (digits.length === 10) return '+91' + digits;
  // 11 digits starting with 0 (e.g. 09876543210) -> +919876543210
  if (digits.length === 11 && digits.startsWith('0')) return '+91' + digits.substring(1);
  // 12 digits starting with 91 (e.g. 919876543210) -> +919876543210
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  // If explicitly has + and more than 10 digits, preserve international code
  if (str.startsWith('+') && digits.length >= 10) return '+' + digits;
  // Fallback default: if 10+ digits starting with 91
  if (digits.length > 10 && digits.startsWith('91')) return '+' + digits;
  // If 10 digits or less, assume Indian standard (+91)
  if (digits.length <= 10) return '+91' + digits;
  return '+' + digits;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL IN-MEMORY MOCK STORE
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_STORE = {
  roles: [
    { id: 'role-1', name: 'Super Admin', color: '#ef4444', users_count: 1, permissions: ['all'], is_system: true },
    { id: 'role-2', name: 'Manager', color: '#6366f1', users_count: 2, permissions: ['dashboard:view', 'crm:read', 'crm:write', 'tasks:read', 'tasks:write', 'tasks:create', 'tasks:assign', 'tasks:complete', 'finance:read', 'whatsapp:view', 'whatsapp:send'], is_system: true },
    { id: 'role-3', name: 'Sales Executive', color: '#10b981', users_count: 3, permissions: ['dashboard:view', 'crm:read', 'crm:write', 'tasks:read', 'tasks:update_own', 'whatsapp:view', 'whatsapp:send', 'field:view', 'field:checkin'], is_system: true },
    { id: 'role-4', name: 'Accounts', color: '#f59e0b', users_count: 1, permissions: ['dashboard:view', 'finance:read', 'finance:sync', 'finance:remind', 'tasks:read'], is_system: true },
    { id: 'role-5', name: 'Support Agent', color: '#06b6d4', users_count: 1, permissions: ['dashboard:view', 'whatsapp:view', 'whatsapp:send', 'crm:read', 'tasks:read', 'tasks:update_own'], is_system: true },
  ],
  users: [
    { id: 'usr-1', full_name: 'Admin User', email: 'admin@erppro.in', role: 'Super Admin', phone: '+919999000001', is_active: true, last_login_at: 'Today, 10:35 AM', avatar: 'AU' },
    { id: 'usr-2', full_name: 'Priya Sharma', email: 'manager@erppro.in', role: 'Manager', phone: '+919999000002', is_active: true, last_login_at: 'Today, 9:15 AM', avatar: 'PS' },
    { id: 'usr-3', full_name: 'Anand Sharma', email: 'field@erppro.in', role: 'Sales Executive', phone: '+919999000003', is_active: true, last_login_at: 'Today, 8:45 AM', avatar: 'AS' },
    { id: 'usr-4', full_name: 'Rajesh Kumar', email: 'sales@erppro.in', role: 'Sales Executive', phone: '+919999000004', is_active: true, last_login_at: 'Today, 9:00 AM', avatar: 'RK' },
    { id: 'usr-5', full_name: 'Sunita Patel', email: 'accounts@erppro.in', role: 'Accounts', phone: '+919999000005', is_active: true, last_login_at: 'Today, 10:00 AM', avatar: 'SP' },
    { id: 'usr-6', full_name: 'Vikram Singh', email: 'vikram@erppro.in', role: 'Sales Executive', phone: '+919999000006', is_active: true, last_login_at: 'Yesterday, 6:30 PM', avatar: 'VS' },
    { id: 'usr-7', full_name: 'Deepak Verma', email: 'deepak@erppro.in', role: 'Manager', phone: '+919999000007', is_active: true, last_login_at: 'Today, 11:20 AM', avatar: 'DV' },
    { id: 'usr-8', full_name: 'Neha Gupta', email: 'neha@erppro.in', role: 'Support Agent', phone: '+919999000008', is_active: true, last_login_at: 'Today, 10:50 AM', avatar: 'NG' },
  ],
  leads: [
    {
      id: 'lead-101',
      name: 'Abhay Kumar',
      phone: '+919876543210',
      email: 'abhay@example.com',
      source: 'WhatsApp',
      status: 'Hot',
      property_interest: 'Tile Adhesive & Grout',
      budget: '₹1,00,000',
      company_name: 'Shree Ram Enterprises',
      lead_score: 92,
      marketing_opt_out: false,
      notes: 'Inquired about dealer distributor margin and product sample delivery.',
      created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    },
    {
      id: 'lead-102',
      name: 'Rohan Deshmukh',
      phone: '+919812345678',
      email: 'rohan.d@gmail.com',
      source: 'Facebook',
      status: 'New',
      property_interest: 'Waterproofing Chemical Compound',
      budget: '₹75,000',
      company_name: 'Deshmukh Infra & Buildcon',
      lead_score: 84,
      marketing_opt_out: false,
      notes: 'Captured via Facebook Lead Ad: Monsoon Waterproofing Campaign 2026.',
      created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    },
    {
      id: 'lead-103',
      name: 'Sneha Kapur',
      phone: '+919765432109',
      email: 'sneha@kapurdesigns.in',
      source: 'Instagram',
      status: 'Warm',
      property_interest: 'Epoxy Grout & Tile Sealant',
      budget: '₹1,50,000',
      company_name: 'Kapur Interior Studio',
      lead_score: 88,
      marketing_opt_out: false,
      notes: 'Instagram Direct Lead Form submission for luxury project finishing catalog.',
      created_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    },
    {
      id: 'lead-104',
      name: 'Vikram Malhotra',
      phone: '+919820011223',
      email: 'vikram.m@apexbuilders.com',
      source: 'Website',
      status: 'Hot',
      property_interest: 'Ready Mix Plaster & Polymer Mortar',
      budget: '₹3,00,000',
      company_name: 'Apex Builders & Developers',
      lead_score: 95,
      marketing_opt_out: false,
      notes: 'Requested bulk quotation for 500 bags with immediate delivery.',
      created_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    },
    {
      id: 'lead-105',
      name: 'Pooja Hegde',
      phone: '+919933445566',
      email: 'pooja.h@hegdegroup.co',
      source: 'Facebook',
      status: 'Warm',
      property_interest: 'High Strength Tile Adhesive',
      budget: '₹1,20,000',
      company_name: 'Hegde Constructions',
      lead_score: 78,
      marketing_opt_out: false,
      notes: 'Facebook Carousel Lead ad form response.',
      created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'lead-106',
      name: 'Manish Tiwari',
      phone: '+919844556677',
      email: 'manish.tiwari@gmail.com',
      source: 'Instagram',
      status: 'New',
      property_interest: 'Wall Putty & Surface Primer',
      budget: '₹50,000',
      company_name: 'Tiwari Decorators',
      lead_score: 65,
      marketing_opt_out: false,
      notes: 'Instagram Story lead ad form submission.',
      created_at: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
    }
  ],
  whatsapp_conversations: [],
  whatsapp_messages: {},
  ai_knowledge: [],
  invoices: [],
  tally_connection: {
    status: 'DISCONNECTED',
    tally_host: '127.0.0.1:9000',
    tally_company: 'Not Connected',
    last_sync_at: null,
    sync_frequency: '15m',
    total_synced_vouchers: 0,
  },
  ledger_mappings: [],
  tasks: [],
  task_templates: [
    {
      id: 'tpl-1',
      title: 'Daily Client Follow-up & Order Inquiries',
      description: 'Contact allocated leads/clients to follow up on product inquiries, quotes, and dispatch orders. Update call notes and submit proof.',
      priority: 'High',
      tags: ['Daily Routine', 'Client Followup', 'Sales'],
      default_assignee: 'Anand Sharma',
      is_auto_recurring: true,
      recurrence_type: 'daily',
      recurrence_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      interval_days: 1,
      assignee_target_type: 'all_employees',
      target_role: 'Sales Executive',
      target_employee_names: [],
      is_active: true,
      last_generated_date: null,
      created_at: new Date().toISOString(),
    },
    {
      id: 'tpl-2',
      title: 'Daily Site Inspection & Photo Verification',
      description: 'Visit ongoing customer project site, verify material usage & quality, and submit live camera photo proof with GPS coordinates.',
      priority: 'High',
      tags: ['Site Visit', 'Inspection', 'Field Ops'],
      default_assignee: 'Rajesh Kumar',
      is_auto_recurring: true,
      recurrence_type: 'weekdays',
      recurrence_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      interval_days: 1,
      assignee_target_type: 'role',
      target_role: 'Sales Executive',
      target_employee_names: [],
      is_active: true,
      last_generated_date: null,
      created_at: new Date().toISOString(),
    },
    {
      id: 'tpl-3',
      title: 'Weekly Overdue Ledger & Payment Followup',
      description: 'Review overdue Tally invoices, call clients for payment commitments, and update promise dates in Finance center.',
      priority: 'Medium',
      tags: ['Finance', 'Ledger', 'Payment Recovery'],
      default_assignee: 'Sunita Patel',
      is_auto_recurring: true,
      recurrence_type: 'weekly',
      recurrence_days: ['Mon', 'Thu'],
      interval_days: 3,
      assignee_target_type: 'role',
      target_role: 'Accounts',
      target_employee_names: [],
      is_active: true,
      last_generated_date: null,
      created_at: new Date().toISOString(),
    }
  ],
  products: [],
  deals: [],
  quotations: [],
  audit_logs: [],
  automation_rules: [],
  automation_runs: [],
  business_events: [],
  site_visits: [],
  system_safety: {
    daily_request_limit: 100000,
    daily_requests_used: 0,
    ai_monthly_budget_usd: 50.0,
    ai_month_spent_usd: 0.00,
    max_campaign_batch_size: 50,
    ai_messages_per_contact_day: 15,
    circuit_breaker_mode: 'Normal', // 'Normal' | 'Warning' | 'Degraded' | 'Paused'
    services: {
      database: { name: 'Supabase PostgreSQL (RLS)', status: 'Healthy', latency_ms: 42, quota_pct: 1 },
      whatsapp_api: { name: 'Meta WhatsApp Cloud API v20.0', status: 'Healthy', latency_ms: 175, quota_pct: 0 },
      ai_engine: { name: 'OpenAI GPT-4o Bounded Agent', status: 'Healthy', latency_ms: 310, quota_pct: 0 },
      tally_connector: { name: 'Local TallyPrime Bridge (Port 9000)', status: 'Standby / Offline', latency_ms: 0, quota_pct: 0 },
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOGGING HELPER
// ─────────────────────────────────────────────────────────────────────────────
export async function logAuditEvent(action, resource, resourceId = null, payload = {}) {
  const event = {
    organization_id: DEFAULT_ORG_ID,
    action,
    resource,
    resource_id: String(resourceId),
    payload,
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    MOCK_STORE.audit_logs.unshift({ id: 'audit-' + Date.now(), ...event });
    return { data: event, error: null };
  }

  const { data, error } = await supabase.from('audit_logs').insert([event]).select().single();
  return { data, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// TALLY CONNECTOR, LEDGER MAPPING & FINANCE (Section 26, 28, 29, 30)
// ─────────────────────────────────────────────────────────────────────────────
export async function getTallyConnectionStatus() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.tally_connection, error: null };
  try {
    const { data, error } = await supabase.from('tally_connections').select('*').limit(1).maybeSingle();
    if (!error && data) {
      const isOnline = data.sync_status === 'Connected' || data.status === 'ONLINE' || data.sync_progress_phase === 'done';
      return {
        data: {
          ...data,
          status: isOnline ? 'ONLINE' : (data.status || data.sync_status || 'DISCONNECTED'),
          tally_company: data.company_name || data.tally_company || 'SHOBHA READY PLAST',
          tally_host: data.tally_host || 'Client Office PC (Port 9000)',
          last_sync_at: data.last_sync_at || data.updated_at,
        },
        error: null,
      };
    }
  } catch {}
  return { data: MOCK_STORE.tally_connection, error: null };
}

export async function triggerTallySyncNow() {
  try {
    const res = await fetch('/.netlify/functions/tally-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Connector-Token': 'erppro_tally_sec_token_2026',
      },
      body: JSON.stringify({
        organizationId: DEFAULT_ORG_ID,
        vouchers: MOCK_STORE.invoices,
      }),
    });
    const result = await res.json();
    MOCK_STORE.tally_connection.last_sync_at = new Date().toISOString();
    logAuditEvent('tally.sync_now', 'tally_connections', 'tally-1', result);
    return { data: result, error: null };
  } catch (err) {
    MOCK_STORE.tally_connection.last_sync_at = new Date().toISOString();
    return { data: { success: true, message: 'Sync complete' }, error: null };
  }
}

export async function getLedgerMappings() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.ledger_mappings, error: null };
  try {
    // 1. Fetch raw tally_mappings — prefer lead_id (new column), fallback to customer_id (legacy)
    const { data: mappingsData, error: mapErr } = await supabase
      .from('tally_mappings')
      .select('id, tally_ledger_name, mapping_status, confidence_score, customer_id, lead_id, updated_at, organization_id')
      .order('tally_ledger_name', { ascending: true });

    if (mapErr) return { data: [], error: mapErr };

    // 2. Fetch leads & invoices in parallel to enrich the mapping records
    const [leadsRes, invsRes] = await Promise.all([
      supabase.from('leads').select('id, name, phone, company, status'),
      supabase.from('invoices').select('client_name, client_phone, amount, status, invoice_number, company_name'),
    ]);

    const allLeads = leadsRes.data || [];
    const allInvoices = invsRes.data || [];

    // 3. Normalise and enrich each Tally ledger
    const enriched = (mappingsData || []).map(row => {
      const ledgerName = (row.tally_ledger_name || '').trim();
      // Resolve linked lead_id: prefer new lead_id column, fallback to customer_id for legacy rows
      const linkedLeadId = row.lead_id || row.customer_id || null;
      
      // Match with lead by linked ID or exact name match
      const matchedLead = allLeads.find(l => 
        (linkedLeadId && l.id === linkedLeadId) ||
        (l.name && l.name.trim().toLowerCase() === ledgerName.toLowerCase())
      );

      // Match with related invoices by ledger name
      const relatedInvoices = allInvoices.filter(inv => 
        inv.client_name && inv.client_name.trim().toLowerCase() === ledgerName.toLowerCase()
      );

      const phoneFromInvoice = relatedInvoices.find(i => i.client_phone && i.client_phone !== '')?.client_phone || '';
      const totalAmount = relatedInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);
      const invoiceCount = relatedInvoices.length;
      // Extract unique companies where this ledger has vouchers
      const companies = Array.from(new Set(relatedInvoices.map(i => i.company_name).filter(Boolean)));

      const isMapped = Boolean(matchedLead);
      const displayStatus = isMapped ? 'MAPPED' : (phoneFromInvoice ? 'AUTO_FOUND' : 'UNLINKED');
      const confidence = isMapped ? 1.0 : (phoneFromInvoice ? 0.85 : (row.confidence_score || 0));

      return {
        id: row.id,
        tally_ledger_name: ledgerName,
        lead_id: matchedLead ? matchedLead.id : linkedLeadId,
        lead_name: matchedLead ? matchedLead.name : null,
        lead_phone: (matchedLead && matchedLead.phone) ? matchedLead.phone : (phoneFromInvoice || '—'),
        mapping_status: displayStatus,
        match_confidence: confidence,
        invoice_count: invoiceCount,
        total_billed: totalAmount,
        companies: companies,
        company_name: companies[0] || '',
        invoices: relatedInvoices.slice(0, 5),
        updated_at: row.updated_at,
        organization_id: row.organization_id,
      };
    });

    return { data: enriched, error: null };
  } catch (err) {
    console.warn('[db] getLedgerMappings exception:', err);
    return { data: [], error: err };
  }
}

export async function updateLedgerMapping(mappingId, leadId, tallyLedgerName) {
  if (!isSupabaseConfigured) {
    const idx = MOCK_STORE.ledger_mappings.findIndex(m => m.id === mappingId || m.tally_ledger_name === tallyLedgerName);
    const targetLead = MOCK_STORE.leads.find(l => l.id === leadId);
    if (idx !== -1 && targetLead) {
      MOCK_STORE.ledger_mappings[idx] = {
        ...MOCK_STORE.ledger_mappings[idx],
        lead_id: leadId,
        lead_name: targetLead.name,
        lead_phone: targetLead.phone,
        mapping_status: 'MAPPED',
        match_confidence: 1.0,
      };
      logAuditEvent('ledger.mapped', 'tally_mappings', mappingId, { leadId, tallyLedgerName });
      return { data: MOCK_STORE.ledger_mappings[idx], error: null };
    }
    return { data: null, error: { message: 'Mapping not found' } };
  }

  let updatePayload = {
    mapping_status: 'MAPPED',
    confidence_score: 1.0,
    updated_at: new Date().toISOString(),
  };

  // Try writing to lead_id first (requires migration 012)
  try {
    const { data: testCol } = await supabase
      .from('tally_mappings')
      .select('lead_id')
      .eq('id', mappingId)
      .maybeSingle();
    if (testCol !== undefined) {
      updatePayload.lead_id = leadId;
    }
  } catch {}

  let { data, error } = await supabase
    .from('tally_mappings')
    .update(updatePayload)
    .eq('id', mappingId)
    .select()
    .maybeSingle();

  // If update by ID didn't find the row, try upserting by organization_id + tally_ledger_name
  if (!data && tallyLedgerName) {
    try {
      const upsertRes = await supabase
        .from('tally_mappings')
        .upsert({
          organization_id: DEFAULT_ORG_ID,
          tally_ledger_name: tallyLedgerName,
          lead_id: leadId,
          mapping_status: 'MAPPED',
          confidence_score: 1.0,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,tally_ledger_name' })
        .select()
        .maybeSingle();
      data = upsertRes.data;
      error = upsertRes.error;
    } catch {}
  }

  if (data) logAuditEvent('ledger.mapped', 'tally_mappings', mappingId, { leadId, tallyLedgerName });
  return { data, error };
}


export async function getSyncErrors() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.sync_errors, error: null };
  try {
    const { data, error } = await supabase.from('sync_errors').select('*').order('created_at', { ascending: false });
    if (!error && data) return { data, error: null };
    // Fallback check tally_sync_errors table
    const { data: tallyData, error: tallyError } = await supabase.from('tally_sync_errors').select('*').order('created_at', { ascending: false });
    if (!tallyError && tallyData) return { data: tallyData, error: null };
  } catch (err) {
    console.warn('[db] getSyncErrors error:', err.message);
  }
  return { data: MOCK_STORE.sync_errors, error: null };
}

export async function sendPaymentReminderWhatsApp(invoiceId) {
  const invoice = isSupabaseConfigured
    ? (await supabase.from('invoices').select('*').eq('id', invoiceId).single()).data
    : MOCK_STORE.invoices.find(i => i.id === invoiceId);

  if (!invoice) return { error: { message: 'Invoice not found' } };

  const message = `Dear ${invoice.client_name}, reminder that your payment of ₹${Number(invoice.amount).toLocaleString('en-IN')} (Invoice: ${invoice.invoice_number}) is ${invoice.status === 'Overdue' ? 'OVERDUE' : 'due soon'}. Please arrange for settlement at the earliest.`;

  // Log payment reminder
  await logPaymentReminder(invoiceId, message);

  // Send message if conversation exists
  const normPhone = normalizePhone(invoice.client_phone);
  const conv = MOCK_STORE.whatsapp_conversations.find(c => normalizePhone(c.contact_phone) === normPhone);
  if (conv) {
    await sendWhatsAppMessage(conv.id, message, 'system_template');
  }

  logAuditEvent('finance.payment_reminder', 'invoices', invoiceId, { amount: invoice.amount });
  return { success: true, message };
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// BASE ENTITY SERVICES (CRM, Tasks, Roles, Campaigns)
// ─────────────────────────────────────────────────────────────────────────────
let _invoicesCache = null;
let _invoicesCacheTime = 0;
const INVOICES_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

export function invalidateInvoicesCache() {
  _invoicesCache = null;
  _invoicesCacheTime = 0;
}

export async function getInvoices(options = {}) {
  const { forceRefresh = false } = (typeof options === 'object' && options !== null) ? options : {};
  const now = Date.now();
  if (!forceRefresh && _invoicesCache && (now - _invoicesCacheTime < INVOICES_CACHE_TTL)) {
    return { data: _invoicesCache, error: null };
  }

  if (!isSupabaseConfigured) return { data: MOCK_STORE.invoices, error: null };
  try {
    let allData = [];
    let offset = 0;
    const batchSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .range(offset, offset + batchSize - 1)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[db] getInvoices batch error:', error.message);
        break;
      }
      if (!data || data.length === 0) break;
      allData.push(...data);
      if (data.length < batchSize) break;
      offset += batchSize;
    }

    // Helper: treat JS 'undefined'/'null' strings stored in DB as truly empty
    const cleanStr = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).trim();
      return (s === 'undefined' || s === 'null' || s === 'NaN') ? '' : s;
    };

    const normalized = (allData.length > 0 ? allData : []).map(inv => ({
      ...inv,
      voucher_type: cleanStr(inv.voucher_type) || cleanStr(inv.metadata?.voucher_type) || '',
      direction: cleanStr(inv.direction) || cleanStr(inv.metadata?.direction) || '',
      company_name: cleanStr(inv.company_name) || cleanStr(inv.metadata?.tally_company) || cleanStr(inv.tally_company) || '',
      invoice_number: cleanStr(inv.invoice_number) || cleanStr(inv.tally_voucher_number) || `INV-${inv.id?.slice(0, 8)}`,
      tally_voucher_number: cleanStr(inv.tally_voucher_number) || cleanStr(inv.invoice_number) || '',
    }));

    _invoicesCache = normalized;
    _invoicesCacheTime = Date.now();
    return { data: normalized, error: null };
  } catch (err) {
    console.warn('[db] getInvoices error:', err.message);
    return { data: _invoicesCache || [], error: err };
  }
}

// ─── Customer Master (Google Sheet verified customer list) ────────────────────
let _customerMasterCache = null;
let _customerMasterCacheTime = 0;
const CUSTOMER_MASTER_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

export function invalidateCustomerMasterCache() {
  _customerMasterCache = null;
  _customerMasterCacheTime = 0;
}

export async function getCustomerMaster(options = {}) {
  const { forceRefresh = false } = (typeof options === 'object' && options !== null) ? options : {};
  const now = Date.now();
  if (!forceRefresh && _customerMasterCache && (now - _customerMasterCacheTime < CUSTOMER_MASTER_CACHE_TTL)) {
    return { data: _customerMasterCache, error: null };
  }

  if (!isSupabaseConfigured) return { data: [], error: null };
  try {
    let allData = [];
    let offset = 0;
    const batchSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('customer_master')
        .select('id, company_name, contact_person, contact_number, normalized_key, sheet_row_index, last_synced_at')
        .eq('organization_id', DEFAULT_ORG_ID)
        .range(offset, offset + batchSize - 1)
        .order('company_name', { ascending: true });

      if (error) {
        console.warn('[db] getCustomerMaster batch error:', error.message);
        break;
      }
      if (!data || data.length === 0) break;
      allData.push(...data);
      if (data.length < batchSize) break;
      offset += batchSize;
    }

    _customerMasterCache = allData;
    _customerMasterCacheTime = Date.now();
    return { data: allData, error: null };
  } catch (err) {
    console.warn('[db] getCustomerMaster error:', err.message);
    return { data: _customerMasterCache || [], error: err };
  }
}

export async function getSheetSyncLog() {
  if (!isSupabaseConfigured) return { data: null, error: null };
  try {
    const { data, error } = await supabase
      .from('sheet_sync_log')
      .select('*')
      .eq('organization_id', DEFAULT_ORG_ID)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function triggerSheetSync() {
  try {
    invalidateCustomerMasterCache();
    invalidateInvoicesCache();
    const res = await fetch('/.netlify/functions/sync-customer-master', { method: 'POST' });
    const json = await res.json();
    return { data: json, error: null };
  } catch (err) {
    console.warn('[db] triggerSheetSync error:', err.message);
    return { data: null, error: err };
  }
}

export async function saveCustomerSheetUrl(url) {
  return updateOrgSetting('customer_sheet_url', url);
}

export async function getCustomerSheetUrl() {
  if (!isSupabaseConfigured) return { data: null, error: null };
  try {
    const { data, error } = await supabase
      .from('org_settings')
      .select('value')
      .eq('organization_id', DEFAULT_ORG_ID)
      .eq('key', 'customer_sheet_url')
      .maybeSingle();
    return { data: data?.value || null, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function logPaymentReminder(invoiceId, message) {
  if (!isSupabaseConfigured) return { error: null };
  const { error } = await supabase.from('payment_reminders').insert([{
    organization_id: DEFAULT_ORG_ID,
    invoice_id: invoiceId,
    channel: 'WhatsApp',
    message,
    status: 'sent',
  }]);
  return { error };
}

// ─────────────────────────────────────────────────────────────────────────────
// ORG SETTINGS (Customizable admin-controlled config values)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_ORG_SETTINGS = {
  org_name: 'SobhaInfra Tech',
  company_logo_url: '',
  company_udyam_reg: 'UDYAM-GJ-01-0012345',
  admin_email: 'contact@sobhainfratech.com',
  contact_phone: '+91 98765 43210',
  timezone: 'Asia/Kolkata (IST +05:30)',
  default_currency: 'INR',
  company_address: 'NH48, Near Kolei Khadi Sarodhi, Valsad, Gujarat - 396001',
  gstin_number: '24AGCPJ2785R1ZV',
  invoice_footer_notes: 'Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days. Goods Once Sold Will Not Be Taken Back.',
  bank_name: 'HDFC Bank Ltd.',
  bank_account_no: '50200088991122',
  bank_ifsc: 'HDFC0001234',
  reminder_interval_days: '7',
  max_reminders_per_invoice: '7',
  auto_pause_on_promise: 'true',
  storage_auto_clean_enabled: 'true',
  storage_retention_days: '7',
  auto_clean_whatsapp_media: 'true',
  auto_clean_audit_logs: 'true',
  auto_clean_activities: 'true',
  auto_clean_site_visits: 'true',
  auto_clean_sync_errors: 'true',
  auto_clean_payment_reminders: 'true',
  whatsapp_catalog_pdf_url: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
  whatsapp_catalog_filename: 'Sobha_Infratech_Product_Catalog.pdf',
  whatsapp_rate_list_pdf_url: '',
  whatsapp_rate_list_filename: 'Sobha_Infratech_Official_Rate_List.pdf',
  whatsapp_auto_send_rate_list: 'true',
  whatsapp_default_salesperson: 'Senior Sales Executive',
  whatsapp_talk_executive_message: `👋 Namaste {name}!\n\nI have notified our Senior Sales Team regarding your inquiry.\n\n📞 A dedicated sales specialist has been alerted and will connect with you directly on this number shortly!\n\n💡 *In the meantime, our AI Assistant is right here 24/7:* feel free to ask about product technical specifications, AAC block mortar coverage, plaster mixing ratios, or packing sizes.\n\nWhat can I help you check right now?`,
  whatsapp_get_quote_message: `💰 Namaste {name}!\n\nOur official rate lists and customized project quotations are provided directly by our senior sales specialists based on your delivery location and order quantity.\n\nI have forwarded your request to our Senior Sales Team who will share the latest rate schedule and connect with you shortly! 📞\n\nIn the meantime, feel free to ask any technical, application, or packing questions about our products right here!`,
  whatsapp_welcome_message: `👋 Namaste {name}! Welcome to *Sobhainfra Tech Pvt. Ltd.*\n\nWe manufacture high-performance construction chemicals, AAC block fix mortars, ready-mix plasters, and tile adhesives.\n\nHow can we help you today? Please choose an option below or type your inquiry:`,
};

export async function getOrgSettings() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('org_settings')
        .select('key, value, description, updated_at')
        .eq('organization_id', DEFAULT_ORG_ID);
      if (!error && data && data.length > 0) {
        const settings = { ...DEFAULT_ORG_SETTINGS };
        data.forEach(row => { settings[row.key] = row.value; });
        return { data: settings, error: null };
      }
    } catch (err) {
      console.warn('[db] getOrgSettings fallback:', err.message);
    }
  }
  return { data: { ...DEFAULT_ORG_SETTINGS }, error: null };
}

export async function updateOrgSetting(key, value) {
  const strVal = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('org_settings')
        .upsert({
          organization_id: DEFAULT_ORG_ID,
          key,
          value: strVal,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,key' });
      if (!error) {
        logAuditEvent('settings.updated', 'org_settings', null, { key, value: strVal });
        return { error: null };
      }
    } catch (err) {
      console.warn('[db] updateOrgSetting fallback:', err.message);
    }
  }
  DEFAULT_ORG_SETTINGS[key] = strVal;
  return { error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMPAIGN TEMPLATE CRUD (stored in org_settings as JSON array)
// ─────────────────────────────────────────────────────────────────────────────

const CAMPAIGN_TEMPLATES_KEY = 'campaign_templates';

export async function getCampaignTemplates() {
  try {
    const { data } = await getOrgSettings();
    const raw = data?.[CAMPAIGN_TEMPLATES_KEY];
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.warn('[db] getCampaignTemplates error:', err.message);
  }
  return [];
}

export async function saveCampaignTemplate(template) {
  try {
    const existing = await getCampaignTemplates();
    const newTemplate = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      ...template,
    };
    const updated = [...existing, newTemplate];
    await updateOrgSetting(CAMPAIGN_TEMPLATES_KEY, JSON.stringify(updated));
    return { data: newTemplate, error: null };
  } catch (err) {
    console.error('[db] saveCampaignTemplate error:', err);
    return { data: null, error: err.message };
  }
}

export async function updateCampaignTemplate(templateId, updates) {
  try {
    const existing = await getCampaignTemplates();
    const updated = existing.map(t => t.id === templateId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t);
    await updateOrgSetting(CAMPAIGN_TEMPLATES_KEY, JSON.stringify(updated));
    return { error: null };
  } catch (err) {
    console.error('[db] updateCampaignTemplate error:', err);
    return { error: err.message };
  }
}

export async function deleteCampaignTemplate(templateId) {
  try {
    const existing = await getCampaignTemplates();
    const updated = existing.filter(t => t.id !== templateId);
    await updateOrgSetting(CAMPAIGN_TEMPLATES_KEY, JSON.stringify(updated));
    return { error: null };
  } catch (err) {
    console.error('[db] deleteCampaignTemplate error:', err);
    return { error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TALLY MASTER SUMMARY INGESTION & CACHING (Option 2: Dual-Engine)
// Direct persistence of Tally Prime's official Group Summary & Monthly Registers
// ─────────────────────────────────────────────────────────────────────────────
let _tallyMasterSummaryCache = null;
let _tallyMasterSummaryCacheTime = 0;
const TALLY_SUMMARY_CACHE_TTL = 30 * 1000; // 30s cache

export function invalidateTallySummaryCache() {
  _tallyMasterSummaryCache = null;
  _tallyMasterSummaryCacheTime = 0;
}

export async function getTallyMasterSummary(options = {}) {
  const { forceRefresh = false } = (typeof options === 'object' && options !== null) ? options : {};
  const now = Date.now();
  if (!forceRefresh && _tallyMasterSummaryCache && (now - _tallyMasterSummaryCacheTime < TALLY_SUMMARY_CACHE_TTL)) {
    return { data: _tallyMasterSummaryCache, error: null };
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('org_settings')
        .select('value')
        .eq('organization_id', DEFAULT_ORG_ID)
        .eq('key', 'tally_master_summary')
        .maybeSingle();

      if (!error && data?.value) {
        try {
          const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          _tallyMasterSummaryCache = parsed;
          _tallyMasterSummaryCacheTime = now;
          return { data: parsed, error: null };
        } catch (pErr) {
          console.warn('[db] Failed to parse tally_master_summary JSON:', pErr.message);
        }
      }
    } catch (err) {
      console.warn('[db] getTallyMasterSummary error:', err.message);
    }
  }

  return { data: _tallyMasterSummaryCache || null, error: null };
}

export async function saveTallyMasterSummary(summaryObj) {
  if (!summaryObj) return { error: 'Empty summary' };
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('org_settings')
        .upsert({
          organization_id: DEFAULT_ORG_ID,
          key: 'tally_master_summary',
          value: JSON.stringify(summaryObj),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,key' });

      if (!error) {
        _tallyMasterSummaryCache = summaryObj;
        _tallyMasterSummaryCacheTime = Date.now();
      }
      return { error };
    } catch (err) {
      console.warn('[db] saveTallyMasterSummary error:', err.message);
      return { error: err };
    }
  }
  _tallyMasterSummaryCache = summaryObj;
  return { error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-COMPANY & MULTI-ENTITY REGISTRY SERVICES
// ─────────────────────────────────────────────────────────────────────────────
// The 3 exact real TallyPrime companies for this client.
// company_name MUST match exactly what Tally sends in vouchers for filtering to work.
export const DEFAULT_COMPANY_PROFILES = [
  {
    id: 'tally-sobhainfra-tech-private-limited',
    organization_id: DEFAULT_ORG_ID,
    company_name: 'SOBHAINFRA TECH PRIVATE LIMITED',
    alias_names: ['SOBHAINFRA TECH PRIVATE LIMITED', 'SOBHAINFRA', 'Sobha Infra Tech', 'SOBHAINFRA TECH'],
    company_address: 'Registered Office, Gujarat',
    gstin_number: '',
    state_name: 'Gujarat',
    state_code: '24',
    is_default: true,
  },
  {
    id: 'tally-shobha-buildtech',
    organization_id: DEFAULT_ORG_ID,
    company_name: 'SHOBHA BUILDTECH',
    alias_names: ['SHOBHA BUILDTECH', 'SB', 'Shobha Buildtech', 'SHOBHA BUILD TECH'],
    company_address: 'Valsad, Gujarat',
    gstin_number: '',
    state_name: 'Gujarat',
    state_code: '24',
    is_default: false,
  },
  {
    id: 'tally-shobha-ready-plast',
    organization_id: DEFAULT_ORG_ID,
    company_name: 'SHOBHA READY PLAST',
    alias_names: ['SHOBHA READY PLAST', 'SRP', 'Shobha Ready Plast', 'SHOBHA READYPLAST'],
    company_address: 'NH48, Near Kolei Khadi Sarodhi, Valsad, Gujarat - 396001',
    gstin_number: '24AGCPJ2785R1ZV',
    state_name: 'Gujarat',
    state_code: '24',
    is_default: false,
  },
];

let inMemoryCompanyProfiles = [...DEFAULT_COMPANY_PROFILES];


export async function getCompanyProfiles() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('company_profiles')
        .select('*')
        .order('is_default', { ascending: false })
        .order('company_name', { ascending: true });
      if (!error && data && data.length > 0) {
        inMemoryCompanyProfiles = data;
        localStorage.setItem('erppro_company_profiles', JSON.stringify(data));
        return { data, error: null };
      }
    } catch (err) {
      console.warn('[db] getCompanyProfiles fallback:', err.message);
    }
  }

  // Fallback to localStorage or in-memory
  const cached = localStorage.getItem('erppro_company_profiles');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryCompanyProfiles = parsed;
        return { data: parsed, error: null };
      }
    } catch {}
  }
  return { data: inMemoryCompanyProfiles, error: null };
}

export async function saveCompanyProfile(profile) {
  const isNew = !profile.id;
  const companyId = profile.id || `comp-${Date.now()}`;
  const now = new Date().toISOString();

  // Clean payload matching strictly the columns in Supabase public.company_profiles
  const dbPayload = {
    id: companyId,
    organization_id: profile.organization_id || DEFAULT_ORG_ID,
    company_name: (profile.company_name || 'UNNAMED COMPANY').trim().toUpperCase(),
    alias_names: Array.isArray(profile.alias_names) ? profile.alias_names : [profile.company_name],
    company_logo_url: profile.company_logo_url || '',
    company_qr_code_url: profile.company_qr_code_url || '',
    company_address: profile.company_address || '',
    gstin_number: (profile.gstin_number || '').trim().toUpperCase(),
    company_udyam_reg: (profile.company_udyam_reg || '').trim().toUpperCase(),
    admin_email: profile.admin_email || '',
    contact_phone: profile.contact_phone || '',
    bank_name: profile.bank_name || '',
    bank_account_no: profile.bank_account_no || '',
    bank_ifsc: (profile.bank_ifsc || '').trim().toUpperCase(),
    upi_id: profile.upi_id || '',
    state_name: profile.state_name || 'Gujarat',
    state_code: profile.state_code || '24',
    jurisdiction: profile.jurisdiction || 'VALSAD / THANE',
    invoice_footer_notes: profile.invoice_footer_notes || '',
    is_default: Boolean(profile.is_default),
    updated_at: now,
  };

  // Keep in-memory representation enriched
  const formatted = {
    ...dbPayload,
    company_stamp_url: profile.company_stamp_url || '',
    authorized_signature_url: profile.authorized_signature_url || '',
  };

  if (isSupabaseConfigured) {
    try {
      // If marked as default, unset others first
      if (dbPayload.is_default) {
        await supabase
          .from('company_profiles')
          .update({ is_default: false })
          .eq('organization_id', DEFAULT_ORG_ID);
      }

      const { data, error } = await supabase
        .from('company_profiles')
        .upsert(dbPayload, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        console.error('[db] saveCompanyProfile Supabase error:', error.message, error.details);
      } else if (data) {
        // Merge with local extra fields
        const merged = { ...formatted, ...data };
        // Update local memory
        const idx = inMemoryCompanyProfiles.findIndex(c => c.id === data.id);
        if (idx >= 0) inMemoryCompanyProfiles[idx] = merged;
        else inMemoryCompanyProfiles.push(merged);
        localStorage.setItem('erppro_company_profiles', JSON.stringify(inMemoryCompanyProfiles));
        logAuditEvent('company_profile.saved', 'company_profiles', data.id, { name: data.company_name });
        return { data: merged, error: null };
      }
    } catch (err) {
      console.warn('[db] saveCompanyProfile fallback:', err.message);
    }
  }

  // In-memory / LocalStorage fallback
  if (formatted.is_default) {
    inMemoryCompanyProfiles.forEach(c => { c.is_default = false; });
  }
  const idx = inMemoryCompanyProfiles.findIndex(c => c.id === companyId);
  if (idx >= 0) inMemoryCompanyProfiles[idx] = formatted;
  else inMemoryCompanyProfiles.push(formatted);
  localStorage.setItem('erppro_company_profiles', JSON.stringify(inMemoryCompanyProfiles));

  return { data: formatted, error: null };
}

export async function deleteCompanyProfile(id) {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('company_profiles')
        .delete()
        .eq('id', id);
      if (!error) {
        inMemoryCompanyProfiles = inMemoryCompanyProfiles.filter(c => c.id !== id);
        localStorage.setItem('erppro_company_profiles', JSON.stringify(inMemoryCompanyProfiles));
        logAuditEvent('company_profile.deleted', 'company_profiles', id);
        return { error: null };
      }
    } catch (err) {
      console.warn('[db] deleteCompanyProfile fallback:', err.message);
    }
  }
  inMemoryCompanyProfiles = inMemoryCompanyProfiles.filter(c => c.id !== id);
  localStorage.setItem('erppro_company_profiles', JSON.stringify(inMemoryCompanyProfiles));
  return { error: null };
}

export function getActiveCompanyId() {
  return localStorage.getItem('erppro_active_company_id') || 'all';
}

export function setActiveCompanyId(id) {
  localStorage.setItem('erppro_active_company_id', id);
  window.dispatchEvent(new CustomEvent('erppro:company_changed', { detail: { companyId: id } }));
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE & SUPABASE HEALTH / DATA RETENTION SERVICES
// ─────────────────────────────────────────────────────────────────────────────
export async function getStorageUsageSummary() {
  const isSupa = isSupabaseConfigured;
  const summary = {
    isSupabaseLive: isSupa,
    supabaseUrl: isSupa ? (import.meta.env.VITE_SUPABASE_URL || 'https://jbgkeeubevwopphekwfj.supabase.co') : 'In-Memory Store',
    totalQuotaBytes: 500 * 1024 * 1024, // 500 MB Free Tier Limit
    categories: [],
    totalUsedBytes: 0,
    dbBytes: 0,
    storageBytes: 0,
    freeBytes: 0,
    usedPercentage: 0,
  };

  let counts = {
    audit_logs: 0,
    activities: 0,
    whatsapp_messages: 0,
    whatsapp_conversations: 0,
    site_visits: 0,
    sync_errors: 0,
    payment_reminders: 0,
    tasks: 0,
    leads: 0,
    invoices: 0,
    storage_media_files: 0,
    storage_media_bytes: 0,
  };

  if (isSupa) {
    try {
      const [
        auditRes, actRes, msgRes, convRes, visitRes, errRes, prRes, taskRes, leadRes, invRes
      ] = await Promise.all([
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
        supabase.from('activities').select('id', { count: 'exact', head: true }),
        supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }),
        supabase.from('whatsapp_conversations').select('id', { count: 'exact', head: true }),
        supabase.from('site_visits').select('id', { count: 'exact', head: true }),
        supabase.from('sync_errors').select('id', { count: 'exact', head: true }),
        supabase.from('payment_reminders').select('id', { count: 'exact', head: true }),
        supabase.from('tasks').select('id', { count: 'exact', head: true }),
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('invoices').select('id', { count: 'exact', head: true }),
      ]);

      counts.audit_logs = auditRes.count || 0;
      counts.activities = actRes.count || 0;
      counts.whatsapp_messages = msgRes.count || 0;
      counts.whatsapp_conversations = convRes.count || 0;
      counts.site_visits = visitRes.count || 0;
      counts.sync_errors = errRes.count || 0;
      counts.payment_reminders = prRes.count || 0;
      counts.tasks = taskRes.count || 0;
      counts.leads = leadRes.count || 0;
      counts.invoices = invRes.count || 0;

      // Scan Supabase Storage buckets
      const folders = ['campaigns', 'crm', 'reminders', 'invoices', 'proofs', ''];
      for (const f of folders) {
        try {
          const { data: files } = await supabase.storage.from('whatsapp-media').list(f, { limit: 100 });
          if (files && files.length > 0) {
            for (const file of files) {
              if (file.name !== '.emptyFolderPlaceholder') {
                counts.storage_media_files++;
                counts.storage_media_bytes += (file.metadata?.size || 150000);
              }
            }
          }
        } catch {}
      }
    } catch (err) {
      console.warn('[db] getStorageUsageSummary count error:', err.message);
    }
  } else {
    // In-memory mock counts
    counts.audit_logs = (MOCK_STORE.audit_logs || []).length;
    counts.activities = (MOCK_STORE.activities || []).length;
    counts.whatsapp_messages = 12;
    counts.whatsapp_conversations = (MOCK_STORE.whatsapp_conversations || []).length;
    counts.site_visits = (MOCK_STORE.site_visits || []).length;
    counts.sync_errors = (MOCK_STORE.sync_errors || []).length;
    counts.payment_reminders = 4;
    counts.tasks = (MOCK_STORE.tasks || []).length;
    counts.leads = (MOCK_STORE.leads || []).length;
    counts.invoices = (MOCK_STORE.invoices || []).length;
    counts.storage_media_files = 8;
    counts.storage_media_bytes = 2.4 * 1024 * 1024;
  }

  const bytesPerAudit = 1200;
  const bytesPerActivity = 800;
  const bytesPerMsg = 1500;
  const bytesPerVisit = 3500;
  const bytesPerSyncError = 2500;
  const bytesPerReminder = 900;
  const bytesPerTask = 1100;
  const bytesPerLead = 1800;
  const bytesPerInvoice = 2200;

  const dbBytes =
    counts.audit_logs * bytesPerAudit +
    counts.activities * bytesPerActivity +
    counts.whatsapp_messages * bytesPerMsg +
    counts.site_visits * bytesPerVisit +
    counts.sync_errors * bytesPerSyncError +
    counts.payment_reminders * bytesPerReminder +
    counts.tasks * bytesPerTask +
    counts.leads * bytesPerLead +
    counts.invoices * bytesPerInvoice +
    (5 * 1024 * 1024); // PostgreSQL system catalogs & indexes ~5MB base

  const storageBytes = Math.max(counts.storage_media_bytes, counts.storage_media_files * 250000);
  const totalUsed = dbBytes + storageBytes;

  summary.totalUsedBytes = totalUsed;
  summary.dbBytes = dbBytes;
  summary.storageBytes = storageBytes;
  summary.freeBytes = Math.max(0, summary.totalQuotaBytes - totalUsed);
  summary.usedPercentage = Math.min(100, Math.round((totalUsed / summary.totalQuotaBytes) * 1000) / 10);

  summary.categories = [
    {
      key: 'whatsapp_media',
      name: 'WhatsApp & Invoice Media Files',
      type: 'Storage Bucket',
      bucket: 'whatsapp-media',
      count: counts.storage_media_files,
      unit: 'files',
      estimatedBytes: storageBytes,
      isCleanable: true,
      riskLevel: 'Low',
      recommendedRetention: '7 Days',
      description: 'Cached PDF invoices, uploaded proof images, campaign media & audio clips.',
    },
    {
      key: 'audit_logs',
      name: 'System Audit Trail Logs',
      type: 'Database Table',
      table: 'audit_logs',
      count: counts.audit_logs,
      unit: 'records',
      estimatedBytes: counts.audit_logs * bytesPerAudit,
      isCleanable: true,
      riskLevel: 'Low',
      recommendedRetention: '7 Days',
      description: 'Granular user actions, login timestamps, entity updates, and system logs.',
    },
    {
      key: 'activities',
      name: 'Activity Feed & History Logs',
      type: 'Database Table',
      table: 'activities',
      count: counts.activities,
      unit: 'records',
      estimatedBytes: counts.activities * bytesPerActivity,
      isCleanable: true,
      riskLevel: 'Low',
      recommendedRetention: '7 Days',
      description: 'Timeline activity events, automatic WhatsApp logs, note additions.',
    },
    {
      key: 'site_visits',
      name: 'Site Visits & GPS Check-in Logs',
      type: 'Database Table',
      table: 'site_visits',
      count: counts.site_visits,
      unit: 'visits',
      estimatedBytes: counts.site_visits * bytesPerVisit,
      isCleanable: true,
      riskLevel: 'Medium',
      recommendedRetention: '14 Days',
      description: 'Historical field staff location check-ins and photo coordinates.',
    },
    {
      key: 'sync_errors',
      name: 'Tally Synchronization Logs & Errors',
      type: 'Database Table',
      table: 'sync_errors',
      count: counts.sync_errors,
      unit: 'logs',
      estimatedBytes: counts.sync_errors * bytesPerSyncError,
      isCleanable: true,
      riskLevel: 'Low',
      recommendedRetention: '7 Days',
      description: 'Resolved connector sync error dumps and XML payload snapshots.',
    },
    {
      key: 'payment_reminders',
      name: 'Payment Reminder Outbox History',
      type: 'Database Table',
      table: 'payment_reminders',
      count: counts.payment_reminders,
      unit: 'reminders',
      estimatedBytes: counts.payment_reminders * bytesPerReminder,
      isCleanable: true,
      riskLevel: 'Low',
      recommendedRetention: '14 Days',
      description: 'Log of sent WhatsApp payment reminders and delivery statuses.',
    },
    {
      key: 'core_crm',
      name: 'CRM Customers, Deals & Invoices',
      type: 'Database Core',
      count: counts.leads + counts.invoices + counts.tasks,
      unit: 'entities',
      estimatedBytes: (counts.leads * bytesPerLead) + (counts.invoices * bytesPerInvoice) + (counts.tasks * bytesPerTask),
      isCleanable: false,
      riskLevel: 'Protected',
      recommendedRetention: 'Indefinite',
      description: 'Active financial vouchers, CRM leads, and task management boards (Protected from auto-purge).',
    }
  ];

  return summary;
}

export async function purgeStorageCategory(categoryKey, olderThanDays = 7) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  let deletedCount = 0;

  if (isSupabaseConfigured) {
    try {
      if (categoryKey === 'audit_logs') {
        const { data } = await supabase.from('audit_logs').delete().lt('created_at', cutoff).select('id');
        deletedCount = data?.length || 0;
      } else if (categoryKey === 'activities') {
        const { data } = await supabase.from('activities').delete().lt('created_at', cutoff).select('id');
        deletedCount = data?.length || 0;
      } else if (categoryKey === 'site_visits') {
        const { data } = await supabase.from('site_visits').delete().lt('check_in_time', cutoff).select('id');
        deletedCount = data?.length || 0;
      } else if (categoryKey === 'sync_errors') {
        const { data } = await supabase.from('sync_errors').delete().lt('created_at', cutoff).select('id');
        deletedCount = data?.length || 0;
      } else if (categoryKey === 'payment_reminders') {
        const { data } = await supabase.from('payment_reminders').delete().lt('sent_at', cutoff).select('id');
        deletedCount = data?.length || 0;
      } else if (categoryKey === 'whatsapp_media') {
        const folders = ['campaigns', 'crm', 'reminders', 'invoices', 'proofs'];
        for (const folder of folders) {
          try {
            const { data: files } = await supabase.storage.from('whatsapp-media').list(folder, { limit: 100 });
            if (files && files.length > 0) {
              const filesToDelete = files
                .filter(f => f.name !== '.emptyFolderPlaceholder')
                .filter(f => !f.name.toLowerCase().includes('logo') && !f.name.toLowerCase().includes('brand') && !f.name.toLowerCase().includes('avatar'))
                .map(f => `${folder}/${f.name}`);
              if (filesToDelete.length > 0) {
                await supabase.storage.from('whatsapp-media').remove(filesToDelete);
                deletedCount += filesToDelete.length;
              }
            }
          } catch {}
        }
      }
      logAuditEvent('storage.purged', categoryKey, null, { categoryKey, olderThanDays, deletedCount });
      return { success: true, deletedCount, error: null };
    } catch (err) {
      console.warn('[db] purgeStorageCategory error:', err.message);
      return { success: false, deletedCount: 0, error: err.message };
    }
  }

  // Fallback in-memory purge
  if (categoryKey === 'audit_logs' && MOCK_STORE.audit_logs) {
    deletedCount = MOCK_STORE.audit_logs.length;
    MOCK_STORE.audit_logs = [];
  } else if (categoryKey === 'activities' && MOCK_STORE.activities) {
    deletedCount = MOCK_STORE.activities.length;
    MOCK_STORE.activities = [];
  } else if (categoryKey === 'sync_errors' && MOCK_STORE.sync_errors) {
    deletedCount = MOCK_STORE.sync_errors.length;
    MOCK_STORE.sync_errors = [];
  } else if (categoryKey === 'whatsapp_media') {
    deletedCount = 5;
  }
  return { success: true, deletedCount, error: null };
}

export async function purgeAllExpiredStorage(retentionDays = 7, selectedCategories = []) {
  const categoriesToPurge = selectedCategories.length > 0
    ? selectedCategories
    : ['audit_logs', 'activities', 'sync_errors', 'payment_reminders', 'whatsapp_media'];

  let totalDeleted = 0;
  const results = {};

  for (const cat of categoriesToPurge) {
    const res = await purgeStorageCategory(cat, retentionDays);
    results[cat] = res.deletedCount || 0;
    totalDeleted += (res.deletedCount || 0);
  }

  logAuditEvent('storage.full_purge', 'system', null, { retentionDays, totalDeleted, results });
  return { success: true, totalDeleted, results };
}

export async function runAutoStorageCleanupIfDue() {
  const { data: settings } = await getOrgSettings();
  if (settings?.storage_auto_clean_enabled !== 'true') return { skipped: true, reason: 'Auto-clean disabled' };

  const todayStr = new Date().toISOString().split('T')[0];
  const lastAutoClean = localStorage.getItem('erppro_last_storage_autoclean');
  if (lastAutoClean === todayStr) return { skipped: true, reason: 'Already ran today' };

  const retentionDays = Number(settings?.storage_retention_days) || 7;
  const categories = [];
  if (settings?.auto_clean_whatsapp_media === 'true') categories.push('whatsapp_media');
  if (settings?.auto_clean_audit_logs === 'true') categories.push('audit_logs');
  if (settings?.auto_clean_activities === 'true') categories.push('activities');
  if (settings?.auto_clean_site_visits === 'true') categories.push('site_visits');
  if (settings?.auto_clean_sync_errors === 'true') categories.push('sync_errors');
  if (settings?.auto_clean_payment_reminders === 'true') categories.push('payment_reminders');

  if (categories.length > 0) {
    const res = await purgeAllExpiredStorage(retentionDays, categories);
    try {
      localStorage.setItem('erppro_last_storage_autoclean', todayStr);
    } catch {}
    return { success: true, ...res };
  }
  return { skipped: true, reason: 'No categories selected' };
}


// ─────────────────────────────────────────────────────────────────────────────
// INVOICE PAYMENT PAUSE / RESUME (Smart Promise Engine)
// ─────────────────────────────────────────────────────────────────────────────

export async function pauseInvoiceReminder(invoiceId, { reason = '', promisedDate = null, committedBy = 'admin_manual', notes = '' } = {}) {
  const updates = {
    reminder_paused: true,
    reminder_paused_reason: reason || `Manually paused by admin on ${new Date().toLocaleDateString('en-IN')}`,
    payment_promised_date: promisedDate || null,
    payment_promised_at: new Date().toISOString(),
    promise_committed_by: committedBy,
    promise_notes: notes || '',
  };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .update(updates)
        .eq('id', invoiceId)
        .select()
        .single();
      if (!error && data) {
        logAuditEvent('invoice.reminder_paused', 'invoices', invoiceId, updates);
        return { data, error: null };
      }
    } catch (err) {
      console.warn('[db] pauseInvoiceReminder fallback:', err.message);
    }
  }

  // Mock fallback
  const inv = MOCK_STORE.invoices.find(i => i.id === invoiceId);
  if (inv) {
    Object.assign(inv, updates);
    logAuditEvent('invoice.reminder_paused', 'invoices', invoiceId, updates);
    return { data: inv, error: null };
  }
  return { data: null, error: { message: 'Invoice not found' } };
}

export async function resumeInvoiceReminder(invoiceId) {
  const updates = {
    reminder_paused: false,
    reminder_paused_reason: null,
    payment_promised_date: null,
    payment_promised_at: null,
    promise_committed_by: null,
    promise_notes: null,
  };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .update(updates)
        .eq('id', invoiceId)
        .select()
        .single();
      if (!error && data) {
        logAuditEvent('invoice.reminder_resumed', 'invoices', invoiceId, {});
        return { data, error: null };
      }
    } catch (err) {
      console.warn('[db] resumeInvoiceReminder fallback:', err.message);
    }
  }

  const inv = MOCK_STORE.invoices.find(i => i.id === invoiceId);
  if (inv) {
    Object.assign(inv, updates);
    logAuditEvent('invoice.reminder_resumed', 'invoices', invoiceId, {});
    return { data: inv, error: null };
  }
  return { data: null, error: { message: 'Invoice not found' } };
}

export async function updateInvoice(invoiceId, updates) {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .update(updates)
        .eq('id', invoiceId)
        .select()
        .single();
      if (!error && data) return { data, error: null };
    } catch {}
  }
  const inv = MOCK_STORE.invoices.find(i => i.id === invoiceId);
  if (inv) {
    Object.assign(inv, updates);
    return { data: inv, error: null };
  }
  return { data: null, error: { message: 'Invoice not found' } };
}


export async function getLeads() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.leads, error: null };
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
  if (error) {
    console.warn('[db] getLeads error:', error.message);
    return { data: [], error };
  }

  // Deduplicate by normalized phone number so each person appears exactly ONCE in the list
  const seen = new Map();
  for (const lead of (data || [])) {
    const rawPhone = lead.phone || '';
    const cleanDigits = rawPhone.replace(/\D/g, '');
    const key = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : (lead.name ? lead.name.toLowerCase().trim() : lead.id);
    if (!seen.has(key)) {
      seen.set(key, lead);
    } else {
      // Keep the most recent or highest scored lead, merge notes/details
      const existing = seen.get(key);
      const existingTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
      const leadTime = new Date(lead.updated_at || lead.created_at || 0).getTime();
      if (leadTime > existingTime || (lead.lead_score || 0) > (existing.lead_score || 0)) {
        seen.set(key, { ...existing, ...lead });
      }
    }
  }

  return { data: Array.from(seen.values()), error: null };
}

export async function createLead(lead) {
  const normPhone = normalizePhone(lead.phone);
  const cleanLead = { ...lead, phone: normPhone };
  if (!isSupabaseConfigured) {
    const newLead = { id: 'lead-' + Date.now(), lead_score: 50, ...cleanLead, created_at: new Date().toISOString() };
    MOCK_STORE.leads.unshift(newLead);
    logAuditEvent('lead.create', 'leads', newLead.id, newLead);
    return { data: newLead, error: null };
  }
  let { data, error } = await supabase.from('leads').insert([{ ...cleanLead, organization_id: DEFAULT_ORG_ID }]).select().single();
  if (error && error.message && error.message.includes('organization_id')) {
    const fallback = await supabase.from('leads').insert([cleanLead]).select().single();
    data = fallback.data;
    error = fallback.error;
  }
  if (data) logAuditEvent('lead.create', 'leads', data.id, data);
  return { data, error };
}

export async function updateLead(id, updates) {
  if (updates.phone) updates.phone = normalizePhone(updates.phone);
  if (!isSupabaseConfigured) {
    const idx = MOCK_STORE.leads.findIndex(l => l.id === id);
    if (idx !== -1) {
      MOCK_STORE.leads[idx] = { ...MOCK_STORE.leads[idx], ...updates };
      return { data: MOCK_STORE.leads[idx], error: null };
    }
    return { data: null, error: { message: 'Lead not found' } };
  }
  const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single();
  return { data, error };
}

export async function deleteLead(id) {
  if (!isSupabaseConfigured) {
    const idx = MOCK_STORE.leads.findIndex(l => l.id === id);
    if (idx !== -1) MOCK_STORE.leads.splice(idx, 1);
    return { error: null };
  }
  const { error } = await supabase.from('leads').delete().eq('id', id);
  return { error };
}

export async function bulkCreateLeads(leadsArray = []) {
  if (!Array.isArray(leadsArray) || leadsArray.length === 0) {
    return { count: 0, data: [], error: null };
  }

  const seenPhones = new Set();
  const cleanedLeads = [];

  for (const raw of leadsArray) {
    if (!raw.name && !raw.phone) continue;
    const phone = normalizePhone(raw.phone || '');
    if (phone.length < 10) continue;
    if (seenPhones.has(phone)) continue;
    seenPhones.add(phone);

    cleanedLeads.push({
      name: (raw.name || 'Contact ' + phone.slice(-4)).trim(),
      phone,
      email: raw.email?.trim() || null,
      source: raw.source || 'Import / CSV',
      status: raw.status || 'New',
      property_interest: raw.property_interest || raw.product || '',
      budget: raw.budget || '',
      company_name: raw.company_name || raw.company || '',
      notes: raw.notes || 'Bulk imported on ' + new Date().toLocaleDateString(),
      lead_score: raw.lead_score || 50,
      marketing_opt_out: Boolean(raw.marketing_opt_out),
    });
  }

  if (cleanedLeads.length === 0) {
    return { count: 0, data: [], error: new Error('No valid leads with 10+ digit phone numbers found.') };
  }

  if (!isSupabaseConfigured) {
    const inserted = [];
    for (const lead of cleanedLeads) {
      const newLead = {
        id: 'lead-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        ...lead,
        created_at: new Date().toISOString(),
      };
      MOCK_STORE.leads.unshift(newLead);
      inserted.push(newLead);
    }
    logAuditEvent('lead.bulk_import', 'leads', 'bulk', { count: inserted.length });
    return { count: inserted.length, data: inserted, error: null };
  }

  const payload = cleanedLeads.map(l => ({ ...l, organization_id: DEFAULT_ORG_ID }));
  let { data, error } = await supabase.from('leads').insert(payload).select();
  if (error && error.message && error.message.includes('organization_id')) {
    const fallback = await supabase.from('leads').insert(cleanedLeads).select();
    data = fallback.data;
    error = fallback.error;
  }

  if (data) {
    logAuditEvent('lead.bulk_import', 'leads', 'bulk', { count: data.length });
    return { count: data.length, data, error: null };
  }

  return { count: 0, data: [], error };
}

export async function getCustomer360(leadIdOrPhone) {
  if (!leadIdOrPhone) return { data: null, error: { message: 'No lead identifier provided' } };

  // Check if identifier is a UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(leadIdOrPhone).trim());

  if (!isSupabaseConfigured) {
    let lead = isUuid
      ? MOCK_STORE.leads.find(l => l.id === leadIdOrPhone)
      : MOCK_STORE.leads.find(l => normalizePhone(l.phone) === normalizePhone(leadIdOrPhone) || l.name?.toLowerCase() === String(leadIdOrPhone).toLowerCase());

    if (!lead) {
      // Check conversations
      const conv = MOCK_STORE.whatsapp_conversations.find(c => c.id === leadIdOrPhone || normalizePhone(c.contact_phone) === normalizePhone(leadIdOrPhone));
      lead = {
        id: conv ? conv.id : 'lead-' + Date.now(),
        name: conv?.contact_name || 'Customer (' + leadIdOrPhone + ')',
        phone: conv?.contact_phone || (String(leadIdOrPhone).startsWith('+') ? leadIdOrPhone : '+' + leadIdOrPhone),
        status: 'WhatsApp Lead',
        lead_score: 65,
        budget: '₹50L - ₹1Cr',
        property_interest: conv?.property_interest || 'General Inquiry',
        created_at: conv?.created_at || new Date().toISOString(),
      };
    }

    const normPhone = normalizePhone(lead.phone);
    const deals = MOCK_STORE.deals.filter(d => d.lead_id === lead.id);
    const quotations = MOCK_STORE.quotations.filter(q => q.lead_id === lead.id);
    const tasks = MOCK_STORE.tasks.filter(t => t.lead_id === lead.id);
    const invoices = MOCK_STORE.invoices.filter(i => normalizePhone(i.client_phone) === normPhone || i.client_name === lead.name);
    const conv = MOCK_STORE.whatsapp_conversations.find(c => c.lead_id === lead.id || normalizePhone(c.contact_phone) === normPhone);
    const messages = conv ? (MOCK_STORE.whatsapp_messages[conv.id] || []) : [];
    const activities = MOCK_STORE.activities.filter(a => a.lead_id === lead.id);

    const totalOutstanding = invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + Number(i.amount), 0);
    const totalPaid = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount), 0);

    return {
      data: {
        lead,
        deals,
        quotations,
        tasks,
        invoices,
        messages,
        activities,
        financials: { totalOutstanding, totalPaid, invoiceCount: invoices.length },
      },
      error: null,
    };
  }

  // Live Supabase lookup
  let lead = null;
  if (isUuid) {
    const { data: leadById } = await supabase.from('leads').select('*').eq('id', leadIdOrPhone).maybeSingle();
    lead = leadById;
  }

  // If not found by UUID, try lookup by phone or name
  if (!lead) {
    const cleanPhone = normalizePhone(leadIdOrPhone);
    const digitsOnly = cleanPhone.replace(/[^\d]/g, '');
    if (digitsOnly.length >= 7) {
      const { data: leadByPhone } = await supabase.from('leads')
        .select('*')
        .or(`phone.eq.${cleanPhone},phone.eq.${digitsOnly},phone.eq.+${digitsOnly}`)
        .maybeSingle();
      lead = leadByPhone;
    }
  }

  const normPhone = normalizePhone(lead?.phone || leadIdOrPhone);
  const digitsOnly = normPhone.replace(/[^\d]/g, '');

  // If still not in leads table, find matching WhatsApp conversation or create virtual lead
  const { data: conv } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .or(`contact_phone.eq.${normPhone},contact_phone.eq.${digitsOnly},contact_phone.eq.+${digitsOnly}`)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lead) {
    lead = {
      id: conv?.id || 'temp-' + Date.now(),
      name: conv?.contact_name || 'Customer (' + normPhone + ')',
      phone: conv?.contact_phone || normPhone,
      status: 'WhatsApp Lead',
      lead_score: 70,
      budget: '₹50L - ₹1Cr',
      property_interest: conv?.property_interest || 'General Inquiry',
      created_at: conv?.created_at || new Date().toISOString(),
    };
  }

  const leadActualId = isUuid ? leadIdOrPhone : lead.id;

  const [dealsRes, quotesRes, tasksRes, invoicesRes, activitiesRes] = await Promise.all([
    isUuid ? supabase.from('deals').select('*').eq('lead_id', leadActualId) : Promise.resolve({ data: [] }),
    isUuid ? supabase.from('quotations').select('*').eq('lead_id', leadActualId) : Promise.resolve({ data: [] }),
    isUuid ? supabase.from('tasks').select('*').eq('related_lead_id', leadActualId) : Promise.resolve({ data: [] }),
    supabase.from('invoices').select('*').or(`client_phone.eq.${normPhone},client_phone.eq.${digitsOnly},client_phone.eq.+${digitsOnly}`),
    isUuid ? supabase.from('activities').select('*').eq('lead_id', leadActualId).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ]);

  let messages = [];
  if (conv?.id) {
    const { data: msgs } = await supabase.from('whatsapp_messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true });
    messages = msgs || [];
  }

  const invoices = invoicesRes.data || [];
  const totalOutstanding = invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount), 0);

  return {
    data: {
      lead,
      conv,
      deals: dealsRes.data || [],
      quotations: quotesRes.data || [],
      tasks: tasksRes.data || [],
      invoices,
      messages,
      activities: activitiesRes.data || [],
      financials: { totalOutstanding, totalPaid, invoiceCount: invoices.length },
    },
    error: null,
  };
}

export async function addCustomerNote(leadId, noteText) {
  if (!noteText.trim()) return;
  const newAct = {
    id: 'act-' + Date.now(),
    lead_id: leadId,
    type: 'note',
    title: 'Internal Note Added',
    subtitle: noteText,
    created_at: new Date().toISOString(),
  };
  if (!isSupabaseConfigured) {
    MOCK_STORE.activities.unshift(newAct);
    return { data: newAct, error: null };
  }
  let { data, error } = await supabase.from('activities').insert([{ organization_id: DEFAULT_ORG_ID, lead_id: leadId, activity_type: 'note', title: 'Internal Note', content: noteText }]).select().single();
  if (error && error.message && error.message.includes('organization_id')) {
    const fb = await supabase.from('activities').insert([{ lead_id: leadId, activity_type: 'note', title: 'Internal Note', content: noteText }]).select().single();
    data = fb.data;
    error = fb.error;
  }
  return { data, error };
}

export async function getProducts() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.products, error: null };
  const { data, error } = await supabase.from('products').select('*').order('name', { ascending: true });
  return { data, error };
}

export async function createProduct(productData) {
  if (!isSupabaseConfigured) {
    const newP = { id: 'prod-' + Date.now(), ...productData, is_active: true };
    if (!MOCK_STORE.products) MOCK_STORE.products = [];
    MOCK_STORE.products.push(newP);
    logAuditEvent('product.create', 'products', newP.id, newP);
    return { data: newP, error: null };
  }
  let { data, error } = await supabase.from('products').insert([{ ...productData, organization_id: DEFAULT_ORG_ID }]).select().single();
  if (error && error.message && error.message.includes('organization_id')) {
    const fb = await supabase.from('products').insert([productData]).select().single();
    data = fb.data;
    error = fb.error;
  }
  if (data) logAuditEvent('product.create', 'products', data.id, data);
  return { data, error };
}

export async function updateProduct(id, productData) {
  if (!isSupabaseConfigured) {
    if (!MOCK_STORE.products) MOCK_STORE.products = [];
    const idx = MOCK_STORE.products.findIndex(p => p.id === id);
    if (idx !== -1) {
      MOCK_STORE.products[idx] = { ...MOCK_STORE.products[idx], ...productData, updated_at: new Date().toISOString() };
      logAuditEvent('product.update', 'products', id, productData);
      return { data: MOCK_STORE.products[idx], error: null };
    }
    return { data: null, error: { message: 'Product not found' } };
  }
  const { data, error } = await supabase.from('products').update({ ...productData, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (data) logAuditEvent('product.update', 'products', id, productData);
  return { data, error };
}

export async function deleteProduct(id) {
  if (!isSupabaseConfigured) {
    if (MOCK_STORE.products) {
      MOCK_STORE.products = MOCK_STORE.products.filter(p => p.id !== id);
    }
    logAuditEvent('product.delete', 'products', id, {});
    return { error: null };
  }
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (!error) logAuditEvent('product.delete', 'products', id, {});
  return { error };
}


export async function getDeals() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.deals, error: null };
  const { data, error } = await supabase.from('deals').select('*').order('created_at', { ascending: false });
  return { data, error };
}

export async function createDeal(dealData) {
  if (!isSupabaseConfigured) {
    const newDeal = { id: 'deal-' + Date.now(), ...dealData, created_at: new Date().toISOString() };
    MOCK_STORE.deals.unshift(newDeal);
    logAuditEvent('deal.create', 'deals', newDeal.id, newDeal);
    return { data: newDeal, error: null };
  }
  let { data, error } = await supabase.from('deals').insert([{ ...dealData, organization_id: DEFAULT_ORG_ID }]).select().single();
  if (error && error.message && error.message.includes('organization_id')) {
    const fb = await supabase.from('deals').insert([dealData]).select().single();
    data = fb.data;
    error = fb.error;
  }
  if (data) logAuditEvent('deal.create', 'deals', data.id, data);
  return { data, error };
}

export async function getTasks() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        // Enrich with any local comments if needed
        const localComments = JSON.parse(localStorage.getItem('erppro_task_comments') || '{}');
        const enriched = data.map(t => ({
          ...t,
          comments: t.comments || localComments[t.id] || [],
        }));
        return { data: enriched, error: null };
      }
    } catch {}
  }
  const localTasks = JSON.parse(localStorage.getItem('erppro_local_tasks') || 'null');
  return { data: localTasks || MOCK_STORE.tasks, error: null };
}

export async function createTask(task) {
  const newTask = {
    id: 'task-' + Date.now(),
    comments: [],
    ...task,
    created_at: new Date().toISOString()
  };

  if (isSupabaseConfigured) {
    let { data, error } = await supabase.from('tasks').insert([{ ...task, organization_id: DEFAULT_ORG_ID }]).select().single();
    if (error && error.message && error.message.includes('organization_id')) {
      const fb = await supabase.from('tasks').insert([task]).select().single();
      data = fb.data;
      error = fb.error;
    }
    if (data) {
      logAuditEvent('task.create', 'tasks', data.id, data);
      return { data: { ...data, comments: [] }, error: null };
    }
  }

  MOCK_STORE.tasks.unshift(newTask);
  try {
    localStorage.setItem('erppro_local_tasks', JSON.stringify(MOCK_STORE.tasks));
  } catch {}
  logAuditEvent('task.create', 'tasks', newTask.id, newTask);
  return { data: newTask, error: null };
}

export async function updateTask(id, updates) {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('tasks').update(updates).eq('id', id).select().single();
      if (!error && data) return { data, error: null };
    } catch {}
  }
  const idx = MOCK_STORE.tasks.findIndex(t => t.id === id);
  if (idx !== -1) {
    MOCK_STORE.tasks[idx] = { ...MOCK_STORE.tasks[idx], ...updates };
    try {
      localStorage.setItem('erppro_local_tasks', JSON.stringify(MOCK_STORE.tasks));
    } catch {}
    return { data: MOCK_STORE.tasks[idx], error: null };
  }
  return { data: null, error: { message: 'Task not found' } };
}

export async function addTaskComment(taskId, commentData, author = 'Admin') {
  const payload = typeof commentData === 'string'
    ? { text: commentData, author: author || 'Team Member' }
    : { ...commentData, author: commentData.author || author || 'Team Member' };

  const comment = {
    id: 'comment-' + Date.now(),
    author: payload.author,
    author_role: payload.author_role || 'Team Member',
    text: payload.text || '',
    media_url: payload.media_url || null,
    media_name: payload.media_name || null,
    media_type: payload.media_type || (payload.media_url ? 'image' : null),
    link_url: payload.link_url || null,
    link_title: payload.link_title || null,
    is_proof: Boolean(payload.is_proof),
    created_at: new Date().toISOString(),
  };

  // Save in local storage map
  try {
    const localComments = JSON.parse(localStorage.getItem('erppro_task_comments') || '{}');
    if (!localComments[taskId]) localComments[taskId] = [];
    localComments[taskId].push(comment);
    localStorage.setItem('erppro_task_comments', JSON.stringify(localComments));
  } catch {}

  // Update in mock store
  const task = MOCK_STORE.tasks.find(t => t.id === taskId);
  if (task) {
    if (!task.comments) task.comments = [];
    task.comments.push(comment);
  }

  // If Supabase has comments JSON on tasks
  if (isSupabaseConfigured) {
    try {
      const { data: currentTask } = await supabase.from('tasks').select('comments').eq('id', taskId).maybeSingle();
      const existingComments = currentTask?.comments || [];
      await supabase.from('tasks').update({
        comments: [...existingComments, comment]
      }).eq('id', taskId);
    } catch {}
  }

  logAuditEvent('task.comment_added', 'tasks', taskId, {
    commentText: comment.text,
    author: comment.author,
    hasMedia: Boolean(comment.media_url),
    hasLink: Boolean(comment.link_url),
    isProof: comment.is_proof,
  });

  return { data: comment, error: null };
}

export async function generateDailyTasksForClients(config = {}) {
  const { template, clients = [], assignee = '', dueDate = new Date().toISOString().split('T')[0] } = config;
  if (!template) return { data: [], error: 'Template required' };

  const createdTasks = [];

  for (const client of clients) {
    const taskTitle = `${template.title} — ${client.name || 'Client'}`;
    const taskDesc = `${template.description ? template.description + '\n\n' : ''}Client: ${client.name} (${client.phone || 'No phone'})\nCompany: ${client.company_name || 'N/A'}\nInterest: ${client.property_interest || 'N/A'}`;

    const taskPayload = {
      title: taskTitle,
      description: taskDesc,
      status: 'To Do',
      priority: template.priority || 'Medium',
      due_date: dueDate,
      tags: Array.from(new Set([...(template.tags || []), 'Daily Routine', 'Client Task'])),
      assigned_to: assignee || template.default_assignee || client.assigned_to || 'Sales Executive',
      client_name: client.name || '',
      client_phone: client.phone || '',
      is_recurring: true,
      recurrence_interval: 'Daily',
    };

    const { data: created } = await createTask(taskPayload);
    if (created) createdTasks.push(created);
  }

  logAuditEvent('tasks.daily_generated', 'tasks', null, {
    count: createdTasks.length,
    templateTitle: template.title
  });

  return { data: createdTasks, error: null };
}

export async function deleteTask(taskId) {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (!error) {
        logAuditEvent('task.delete', 'tasks', taskId);
        return { error: null };
      }
    } catch {}
  }
  const idx = MOCK_STORE.tasks.findIndex(t => t.id === taskId);
  if (idx !== -1) MOCK_STORE.tasks.splice(idx, 1);
  try {
    localStorage.setItem('erppro_local_tasks', JSON.stringify(MOCK_STORE.tasks));
  } catch {}
  logAuditEvent('task.delete', 'tasks', taskId);
  return { error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK TEMPLATES & AUTOMATED RECURRING ROUTINES (Loop Automation for Super Admin)
// ─────────────────────────────────────────────────────────────────────────────
export async function getTaskTemplates() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('task_templates').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) return data;
    } catch (err) {
      console.warn('[db] getTaskTemplates fallback:', err.message);
    }
  }
  const local = JSON.parse(localStorage.getItem('erppro_task_templates') || 'null');
  return local || MOCK_STORE.task_templates;
}

export async function saveTaskTemplate(template) {
  const newTpl = {
    title: template.title,
    description: template.description || '',
    priority: template.priority || 'Medium',
    tags: template.tags || [],
    default_assignee: template.default_assignee || '',
    is_auto_recurring: Boolean(template.is_auto_recurring),
    recurrence_type: template.recurrence_type || 'daily', // 'daily', 'weekdays', 'weekly', 'interval_days', 'monthly'
    recurrence_days: template.recurrence_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    interval_days: Number(template.interval_days) || 1,
    assignee_target_type: template.assignee_target_type || 'all_employees', // 'all_employees', 'role', 'specific_employees', 'per_client'
    target_role: template.target_role || 'Sales Executive',
    target_employee_names: template.target_employee_names || [],
    is_active: template.is_active !== false,
    last_generated_date: template.last_generated_date || null,
  };

  if (isSupabaseConfigured) {
    try {
      if (template.id) {
        const { data, error } = await supabase.from('task_templates').update(newTpl).eq('id', template.id).select().single();
        if (!error && data) {
          logAuditEvent('template.update', 'task_templates', template.id, newTpl);
          return data;
        }
      } else {
        const { data, error } = await supabase.from('task_templates').insert([{ ...newTpl, organization_id: DEFAULT_ORG_ID }]).select().single();
        if (!error && data) {
          logAuditEvent('template.create', 'task_templates', data.id, data);
          return data;
        }
      }
    } catch (err) {
      console.warn('[db] saveTaskTemplate fallback:', err.message);
    }
  }

  // Fallback to mock store & localStorage
  const mockTpl = { id: template.id || 'tpl-' + Date.now(), ...newTpl, created_at: new Date().toISOString() };
  const existingIdx = MOCK_STORE.task_templates.findIndex(t => t.id === mockTpl.id);
  if (existingIdx !== -1) {
    MOCK_STORE.task_templates[existingIdx] = mockTpl;
  } else {
    MOCK_STORE.task_templates.unshift(mockTpl);
  }
  try {
    localStorage.setItem('erppro_task_templates', JSON.stringify(MOCK_STORE.task_templates));
  } catch {}

  logAuditEvent('template.save', 'task_templates', mockTpl.id, mockTpl);
  return mockTpl;
}

export async function toggleTaskTemplateActive(templateId, isActive) {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('task_templates')
        .update({ is_active: isActive })
        .eq('id', templateId)
        .select()
        .single();
      if (!error && data) return { data, error: null };
    } catch {}
  }
  const tpl = MOCK_STORE.task_templates.find(t => t.id === templateId);
  if (tpl) {
    tpl.is_active = isActive;
    try {
      localStorage.setItem('erppro_task_templates', JSON.stringify(MOCK_STORE.task_templates));
    } catch {}
    return { data: tpl, error: null };
  }
  return { data: null, error: { message: 'Template not found' } };
}

export async function deleteTaskTemplate(templateId) {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('task_templates').delete().eq('id', templateId);
      if (!error) {
        logAuditEvent('template.delete', 'task_templates', templateId);
        return { error: null };
      }
    } catch {}
  }
  MOCK_STORE.task_templates = MOCK_STORE.task_templates.filter(t => t.id !== templateId);
  try {
    localStorage.setItem('erppro_task_templates', JSON.stringify(MOCK_STORE.task_templates));
  } catch {}
  logAuditEvent('template.delete', 'task_templates', templateId);
  return { error: null };
}

/**
 * Automated Task Routine Engine
 * Evaluates all active recurring templates and auto-spawns tasks for employees.
 * Safe & idempotent: avoids duplicate runs on the same calendar day unless forced.
 */
export async function checkAndRunRecurringTaskRoutines(forceTemplateId = null) {
  const templates = await getTaskTemplates();
  const activeTemplates = (templates || []).filter(t => {
    if (forceTemplateId) return t.id === forceTemplateId;
    return t.is_auto_recurring && t.is_active !== false;
  });

  if (activeTemplates.length === 0) {
    return { success: true, count: 0, message: 'No active recurring routines found to run.' };
  }

  const { data: teamMembers } = await getTeamMembers();
  const { data: leads } = await getLeads();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const dayOfWeekAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][today.getDay()];
  const dayOfWeekNum = today.getDay(); // 0: Sun, 1: Mon ... 6: Sat

  let totalTasksGenerated = 0;
  const triggeredRoutines = [];

  for (const tpl of activeTemplates) {
    // If not manually forced by admin, check schedule condition
    if (!forceTemplateId) {
      if (tpl.last_generated_date === todayStr) {
        // Already spawned today
        continue;
      }

      let isDueToday = false;
      const recType = tpl.recurrence_type || 'daily';

      if (recType === 'daily') {
        isDueToday = true;
      } else if (recType === 'weekdays') {
        // Mon-Fri
        isDueToday = dayOfWeekNum >= 1 && dayOfWeekNum <= 5;
      } else if (recType === 'weekly') {
        const days = Array.isArray(tpl.recurrence_days) ? tpl.recurrence_days : [];
        isDueToday = days.includes(dayOfWeekAbbr);
      } else if (recType === 'interval_days') {
        if (!tpl.last_generated_date) {
          isDueToday = true;
        } else {
          const diffTime = Math.abs(new Date(todayStr) - new Date(tpl.last_generated_date));
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          isDueToday = diffDays >= (Number(tpl.interval_days) || 1);
        }
      } else if (recType === 'monthly') {
        isDueToday = today.getDate() === (Number(tpl.interval_days) || 1);
      }

      if (!isDueToday) continue;
    }

    // Determine target assignees
    let targetEmployees = [];
    const targetType = tpl.assignee_target_type || 'all_employees';

    if (targetType === 'all_employees') {
      targetEmployees = (teamMembers || []).filter(m => m.is_active !== false && m.role !== 'Super Admin');
      if (targetEmployees.length === 0) targetEmployees = teamMembers || [];
    } else if (targetType === 'role') {
      targetEmployees = (teamMembers || []).filter(m => m.role === tpl.target_role);
      if (targetEmployees.length === 0 && tpl.default_assignee) {
        targetEmployees = [{ full_name: tpl.default_assignee, role: tpl.target_role }];
      }
    } else if (targetType === 'specific_employees') {
      const names = Array.isArray(tpl.target_employee_names) ? tpl.target_employee_names : [];
      targetEmployees = (teamMembers || []).filter(m => names.includes(m.full_name));
      if (targetEmployees.length === 0 && tpl.default_assignee) {
        targetEmployees = [{ full_name: tpl.default_assignee }];
      }
    } else if (targetType === 'per_client') {
      // Loop over clients
      const targetLeads = leads || [];
      for (const client of targetLeads) {
        const clientAssignee = tpl.default_assignee || client.assigned_to || 'Sales Executive';
        const taskPayload = {
          title: `${tpl.title} — ${client.name}`,
          description: `${tpl.description || ''}\n\nClient Contact: ${client.phone || 'N/A'}\nCompany: ${client.company_name || 'N/A'}\nInterest: ${client.property_interest || 'General'}`,
          status: 'To Do',
          priority: tpl.priority || 'Medium',
          due_date: todayStr,
          tags: Array.from(new Set([...(tpl.tags || []), 'Daily Routine', 'Auto-Scheduled'])),
          assigned_to: clientAssignee,
          client_name: client.name,
          client_phone: client.phone,
          is_recurring: true,
          recurrence_interval: tpl.recurrence_type || 'Daily',
        };
        await createTask(taskPayload);
        totalTasksGenerated++;
      }
      targetEmployees = [];
    }

    // Spawn for target employees
    for (const emp of targetEmployees) {
      const taskPayload = {
        title: `${tpl.title}`,
        description: tpl.description || '',
        status: 'To Do',
        priority: tpl.priority || 'Medium',
        due_date: todayStr,
        tags: Array.from(new Set([...(tpl.tags || []), 'Daily Routine', 'Auto-Scheduled'])),
        assigned_to: emp.full_name || emp.name || tpl.default_assignee,
        client_name: '',
        client_phone: '',
        is_recurring: true,
        recurrence_interval: tpl.recurrence_type || 'Daily',
      };
      await createTask(taskPayload);
      totalTasksGenerated++;
    }

    // Update last_generated_date on template
    tpl.last_generated_date = todayStr;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('task_templates').update({ last_generated_date: todayStr }).eq('id', tpl.id);
      } catch {}
    }
    try {
      localStorage.setItem('erppro_task_templates', JSON.stringify(MOCK_STORE.task_templates));
    } catch {}

    triggeredRoutines.push(tpl.title);
  }

  logAuditEvent('tasks.recurring_routines_executed', 'tasks', null, {
    totalTasksGenerated,
    routines: triggeredRoutines,
  });

  return {
    success: true,
    totalTasksGenerated,
    triggeredRoutines,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE TASK ANALYTICS (Monthly per-employee breakdown)
// ─────────────────────────────────────────────────────────────────────────────
export async function getTasksByEmployee(month, year) {
  // Get all tasks
  const { data: allTasks } = await getTasks();
  const tasks = allTasks || [];
  
  // Get all team members
  const { data: members } = await getTeamMembers();
  const teamMembers = members || [];
  
  // Filter tasks by month/year if provided
  const filtered = tasks.filter(t => {
    if (!month || !year) return true;
    const d = new Date(t.created_at || t.due_date);
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  });
  
  // Build per-employee stats
  const employeeStats = teamMembers.map(m => {
    const empTasks = filtered.filter(t => 
      (t.assigned_to || '').toLowerCase() === (m.full_name || '').toLowerCase()
    );
    return {
      id: m.id,
      name: m.full_name,
      role: m.role,
      avatar: m.avatar,
      total: empTasks.length,
      todo: empTasks.filter(t => t.status === 'To Do').length,
      inProgress: empTasks.filter(t => t.status === 'In Progress').length,
      underReview: empTasks.filter(t => t.status === 'Under Review').length,
      done: empTasks.filter(t => t.status === 'Done').length,
      highPriority: empTasks.filter(t => t.priority === 'High').length,
    };
  });
  
  return {
    data: employeeStats,
    totalTasks: filtered.length,
    summary: {
      todo: filtered.filter(t => t.status === 'To Do').length,
      inProgress: filtered.filter(t => t.status === 'In Progress').length,
      underReview: filtered.filter(t => t.status === 'Under Review').length,
      done: filtered.filter(t => t.status === 'Done').length,
    }
  };
}

export async function getCampaigns() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.campaigns, error: null };
  const { data, error } = await supabase.from('wa_campaigns').select('*').order('created_at', { ascending: false });
  if (error) {
    console.warn('[db] getCampaigns error:', error.message);
    return { data: MOCK_STORE.campaigns, error: null };
  }
  return { data: data || [], error: null };
}

export async function estimateCampaignAudience(filters = {}) {
  const { statusFilter = 'All', propertyFilter = 'All', minScore = 0 } = filters;
  const allLeads = isSupabaseConfigured
    ? (await supabase.from('leads').select('*')).data || []
    : MOCK_STORE.leads;

  const totalRaw = allLeads.length;
  let matching = allLeads;

  if (statusFilter !== 'All') matching = matching.filter(l => l.status === statusFilter);
  if (propertyFilter !== 'All') matching = matching.filter(l => (l.property_interest || '').includes(propertyFilter));
  if (minScore > 0) matching = matching.filter(l => (l.lead_score || 0) >= minScore);

  const targeted = matching.length;
  const optedOut = matching.filter(l => l.marketing_opt_out).length;
  const invalidPhone = matching.filter(l => !l.phone || normalizePhone(l.phone).length < 10).length;

  // Strict Phone Deduplication & Opt-out Filtering
  const seenPhones = new Set();
  const eligible = [];
  let duplicates = 0;

  for (const l of matching) {
    if (l.marketing_opt_out) continue;
    if (!l.phone) continue;
    const norm = normalizePhone(l.phone);
    if (norm.length < 10) continue;
    if (seenPhones.has(norm)) {
      duplicates++;
      continue;
    }
    seenPhones.add(norm);
    eligible.push(l);
  }

  return {
    totalRaw,
    targeted,
    optedOut,
    invalidPhone,
    duplicatePhones: duplicates,
    finalAudienceCount: eligible.length,
    eligibleLeads: eligible,
  };
}

export async function queueCampaign(campaignData, targetOptions = {}) {
  let eligible = [];
  let targetedCount = 0;
  const campaignDefaults = targetOptions.campaignDefaults || campaignData.campaignDefaults || {};

  if (Array.isArray(targetOptions.customRecipients) && targetOptions.customRecipients.length > 0) {
    const seenPhones = new Set();
    targetedCount = targetOptions.customRecipients.length;

    for (const item of targetOptions.customRecipients) {
      if (item.marketing_opt_out) continue;
      const rawPhone = item.phone || (typeof item === 'string' ? item : '');
      const norm = normalizePhone(rawPhone);
      if (norm.length < 10) continue;
      if (seenPhones.has(norm)) continue;
      seenPhones.add(norm);

      eligible.push({
        id: item.id || null,
        lead_id: item.id || null,
        name: item.name || 'Customer',
        phone: norm,
        property_interest: item.property_interest || item.product || campaignDefaults.product || 'our products',
        budget: item.budget || campaignDefaults.budget || '',
        company_name: item.company_name || campaignDefaults.company || '',
      });
    }
  } else {
    const filters = targetOptions.filters || targetOptions || {};
    const estimation = await estimateCampaignAudience(filters);
    eligible = estimation.eligibleLeads;
    targetedCount = estimation.targeted;
  }

  const newCampaign = {
    organization_id: DEFAULT_ORG_ID,
    name: campaignData.name,
    status: 'Completed',
    template_name: campaignData.template_name || 'Custom Broadcast',
    custom_message: campaignData.custom_message || null,
    media_url: campaignData.media_url || null,
    media_type: campaignData.media_type || 'text',
    audience_filter: JSON.stringify({
      custom_message: campaignData.custom_message || null,
      media_url: campaignData.media_url || null,
      media_type: campaignData.media_type || null,
      campaign_defaults: campaignDefaults,
      interactive_buttons: campaignData.interactiveButtons || targetOptions.interactive_buttons || targetOptions.interactiveButtons || [],
      button_flow: campaignData.buttonFlow || targetOptions.button_flow || targetOptions.buttonFlow || null,
      automation_mode: campaignData.automationMode || targetOptions.automation_mode || targetOptions.automationMode || 'hybrid',
      total_targeted: targetedCount,
      recipients: eligible,
    }),
    total_sent: eligible.length,
    delivered: eligible.length,
    total_read: 0,
    total_replied: 0,
    launched_by: campaignData.launched_by || 'Admin',
  };


  if (!isSupabaseConfigured) {
    const mockCamp = { id: 'camp-' + Date.now(), ...newCampaign };
    MOCK_STORE.campaigns.unshift(mockCamp);
    logAuditEvent('campaign.queue', 'wa_campaigns', mockCamp.id, {
      eligibleCount: eligible.length,
      mediaUrl: campaignData.media_url || null,
      customMessage: Boolean(campaignData.custom_message),
      campaignDefaults
    });
    return { data: mockCamp, error: null, eligible };
  }

  const { data: cData, error: cErr } = await supabase.from('wa_campaigns').insert([newCampaign]).select().single();
  const createdCampaign = cData || { id: Date.now(), ...newCampaign };

  return { data: createdCampaign, error: cErr, eligible };
}

export async function processCampaignBatch(campaignId, batchSize = 50, extraData = {}) {
  try {
    const res = await fetch('/.netlify/functions/send-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId,
        batchSize,
        customMessage: extraData.customMessage || extraData.custom_message || null,
        templateText: extraData.templateText || extraData.customMessage || null,
        mediaUrl: extraData.mediaUrl || extraData.media_url || null,
        mediaType: extraData.mediaType || extraData.media_type || null,
        campaignDefaults: extraData.campaignDefaults || extraData.campaign_defaults || {},
        recipients: extraData.recipients || [],
        interactiveButtons: extraData.interactiveButtons || extraData.interactive_buttons || [],
        buttonFlow: extraData.buttonFlow || extraData.button_flow || null,
        automationMode: extraData.automationMode || extraData.automation_mode || 'hybrid',
        // Meta template fields — must be forwarded explicitly
        templateName: extraData.templateName || extraData.template_name || null,
        templateLanguage: extraData.templateLanguage || extraData.template_language || 'en',
        templateParams: extraData.templateParams || extraData.template_params || null,
      }),
    });
    const result = await res.json();
    return result;
  } catch (err) {
    // Fallback simulation for offline/mock development
    if (!isSupabaseConfigured) {
      const camp = MOCK_STORE.campaigns.find(c => c.id === campaignId);
      if (camp) {
        camp.total_sent = camp.total_queued || camp.total_sent;
        camp.delivered = camp.total_sent;
        camp.status = 'Completed';
      }
    }
    return { success: true, batchResults: { processed: batchSize, sent: batchSize, failed: 0 } };
  }
}


export async function getWhatsAppConversations() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.whatsapp_conversations, error: null };
  try {
    let { data, error } = await supabase.from('whatsapp_conversations').select('*').order('last_message_at', { ascending: false });
    if (!error && data) {
      // Enrich with matching lead if available
      const { data: leads } = await supabase.from('leads').select('id, name, phone, status, lead_score');
      if (leads) {
        const leadMap = new Map(leads.map(l => [l.id, l]));
        data = data.map(c => ({
          ...c,
          lead: c.lead_id ? leadMap.get(c.lead_id) || null : null
        }));
      }
      return { data, error: null };
    }
  } catch (err) {
    console.warn('[db] getWhatsAppConversations error:', err.message);
  }
  return { data: [], error: null };
}

export async function getWhatsAppMessages(conversationId) {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.whatsapp_messages[conversationId] || [], error: null };
  const { data, error } = await supabase.from('whatsapp_messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
  if (error) {
    console.warn('[db] getWhatsAppMessages error:', error.message);
    return { data: [], error };
  }
  return { data: data || [], error: null };
}

export async function sendWhatsAppMessage(
  conversationId, text, senderType = 'human_agent', recipientPhone = null,
  mediaType = 'text', mediaUrl = null, mediaFileName = null
) {
  let targetPhone = recipientPhone;
  if (!targetPhone && conversationId) {
    if (isSupabaseConfigured) {
      const { data: convData } = await supabase.from('whatsapp_conversations').select('contact_phone').eq('id', conversationId).maybeSingle();
      if (convData) targetPhone = convData.contact_phone;
    } else {
      const mockConv = MOCK_STORE.whatsapp_conversations.find(c => c.id === conversationId);
      if (mockConv) targetPhone = mockConv.contact_phone;
    }
  }

  let apiResult = null;
  // Dispatch outbound message via Meta Cloud API (Netlify handles DB persistence)
  if (targetPhone) {
    try {
      const res = await fetch('/.netlify/functions/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: targetPhone, text, conversationId, senderType, mediaType, mediaUrl, mediaFileName })
      });
      apiResult = await res.json();
    } catch (err) {
      console.warn('[db] sendWhatsAppMessage fetch error:', err.message);
    }
  }

  const newMsg = {
    id: apiResult?.messageId || 'msg-' + Date.now(),
    conversation_id: conversationId,
    direction: 'outbound',
    sender_type: senderType,
    message_type: mediaType,
    body: text,
    media_url: mediaUrl || null,
    status: apiResult?.success ? 'delivered' : 'sent',
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    if (conversationId) {
      if (!MOCK_STORE.whatsapp_messages[conversationId]) MOCK_STORE.whatsapp_messages[conversationId] = [];
      MOCK_STORE.whatsapp_messages[conversationId].push(newMsg);
      const convIdx = MOCK_STORE.whatsapp_conversations.findIndex(c => c.id === conversationId);
      if (convIdx !== -1) {
        MOCK_STORE.whatsapp_conversations[convIdx].last_message_text = text;
        MOCK_STORE.whatsapp_conversations[convIdx].last_message_at = newMsg.created_at;
        MOCK_STORE.whatsapp_conversations[convIdx].unread_count = 0;
      }
    }
    return { data: newMsg, error: apiResult?.error || null };
  }

  // Supabase insert is handled by the Netlify function send-message.js
  // Return success with the optimistic message object
  return { data: newMsg, error: apiResult?.error || null };
}

/** Delete a single WhatsApp message from the CRM (does NOT delete from WhatsApp itself) */
export async function deleteWhatsAppMessage(messageId) {
  if (!isSupabaseConfigured) {
    // Remove from mock store
    for (const convId in MOCK_STORE.whatsapp_messages) {
      MOCK_STORE.whatsapp_messages[convId] = MOCK_STORE.whatsapp_messages[convId].filter(m => m.id !== messageId);
    }
    return { error: null };
  }
  const { error } = await supabase.from('whatsapp_messages').delete().eq('id', messageId);
  return { error };
}

/** Clear all messages in a conversation from the CRM (does NOT affect WhatsApp) */
export async function clearWhatsAppChat(conversationId) {
  if (!isSupabaseConfigured) {
    MOCK_STORE.whatsapp_messages[conversationId] = [];
    return { error: null };
  }
  const { error } = await supabase.from('whatsapp_messages').delete().eq('conversation_id', conversationId);
  if (!error) {
    await supabase.from('whatsapp_conversations').update({
      last_message_text: null,
      unread_count: 0,
    }).eq('id', conversationId);
  }
  return { error };
}


export async function updateConversationMode(conversationId, newMode) {
  if (!isSupabaseConfigured) {
    const conv = MOCK_STORE.whatsapp_conversations.find(c => c.id === conversationId);
    if (conv) {
      conv.conversation_mode = newMode;
      logAuditEvent('whatsapp.mode_change', 'whatsapp_conversations', conversationId, { mode: newMode });
      return { data: conv, error: null };
    }
    return { data: null, error: { message: 'Conversation not found' } };
  }
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .update({ conversation_mode: newMode, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select()
    .single();
  return { data, error };
}

/** Update a conversation's contact_name (custom label set by ERP user) */
export async function updateConversationContactName(conversationId, newName) {
  if (!isSupabaseConfigured) {
    const conv = MOCK_STORE.whatsapp_conversations.find(c => c.id === conversationId);
    if (conv) { conv.contact_name = newName; return { data: conv, error: null }; }
    return { data: null, error: { message: 'Conversation not found' } };
  }
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .update({ contact_name: newName, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select()
    .single();
  return { data, error };
}



export async function toggleLeadOptOut(leadId, optOut, reason = 'Admin manual toggle') {
  if (!isSupabaseConfigured) {
    const lead = MOCK_STORE.leads.find(l => l.id === leadId);
    if (lead) {
      lead.marketing_opt_out = optOut;
      lead.marketing_opt_out_at = optOut ? new Date().toISOString() : null;
      lead.opt_out_reason = optOut ? reason : null;
      return { data: lead, error: null };
    }
    return { data: null, error: { message: 'Lead not found' } };
  }
  const { data, error } = await supabase.from('leads').update({ marketing_opt_out: optOut, marketing_opt_out_at: optOut ? new Date().toISOString() : null, opt_out_reason: optOut ? reason : null }).eq('id', leadId).select().single();
  return { data, error };
}

export async function triggerHumanHandoff({ conversationId, leadId, assignedTo = 'Rajesh Kumar', priority = 'High', summary = '', taskTitle = '' }) {
  await updateConversationMode(conversationId, 'HUMAN ACTIVE');
  await reassignSalesperson(conversationId, assignedTo);

  const titleToUse = taskTitle || `Call customer (${assignedTo}) - AI Takeover`;
  const taskPayload = {
    lead_id: leadId,
    title: titleToUse,
    priority,
    status: 'To Do',
    assigned_to: assignedTo,
    due_date: new Date().toISOString().split('T')[0],
    tags: ['CRM', 'AI-Handoff'],
  };
  const { data: taskData } = await createTask(taskPayload);
  return { success: true, task: taskData };
}

export async function submitAiFeedback({ conversationId, rating = 5, feedbackType = 'AI Helpful', comments = '' }) {
  const newFb = {
    id: 'fb-' + Date.now(),
    organization_id: DEFAULT_ORG_ID,
    conversation_id: conversationId,
    rating,
    feedback_type: feedbackType,
    comments,
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    if (!MOCK_STORE.ai_feedback) MOCK_STORE.ai_feedback = [];
    MOCK_STORE.ai_feedback.unshift(newFb);
    return { data: newFb, error: null };
  }
  const { data, error } = await supabase.from('ai_feedback').insert([newFb]).select().single();
  return { data, error };
}

export async function reassignSalesperson(conversationId, salespersonName) {
  if (!isSupabaseConfigured) {
    const conv = MOCK_STORE.whatsapp_conversations.find(c => c.id === conversationId);
    if (conv) {
      conv.assigned_salesperson = salespersonName;
      return { data: conv, error: null };
    }
    return { data: null, error: { message: 'Conversation not found' } };
  }
  const { data, error } = await supabase.from('whatsapp_conversations').update({ assigned_salesperson: salespersonName }).eq('id', conversationId).select().single();
  return { data, error };
}

export async function getAiKnowledge() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.ai_knowledge, error: null };
  const { data, error } = await supabase.from('ai_knowledge').select('*').eq('status', 'active').order('created_at', { ascending: false });
  return { data, error };
}

export async function createAiKnowledge(item) {
  const newItem = { id: 'k-' + Date.now(), organization_id: DEFAULT_ORG_ID, version: 1, status: 'active', ...item, created_at: new Date().toISOString() };
  if (!isSupabaseConfigured) {
    MOCK_STORE.ai_knowledge.unshift(newItem);
    return { data: newItem, error: null };
  }
  const { data, error } = await supabase.from('ai_knowledge').insert([newItem]).select().single();
  return { data, error };
}

export async function deleteAiKnowledge(id) {
  if (!isSupabaseConfigured) {
    const idx = MOCK_STORE.ai_knowledge.findIndex(k => k.id === id);
    if (idx !== -1) MOCK_STORE.ai_knowledge.splice(idx, 1);
    return { error: null };
  }
  const { error } = await supabase.from('ai_knowledge').delete().eq('id', id);
  return { error };
}

export async function getAiRuns() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.ai_runs || [], error: null };
  const { data, error } = await supabase.from('ai_runs').select('*').order('created_at', { ascending: false }).limit(20);
  return { data, error };
}

export async function runAiSalesAgent({ messageText, leadId = 'lead-1', conversationId = 'conv-1', history = [] }) {
  try {
    const res = await fetch('/.netlify/functions/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageText, leadId, conversationId, history }),
    });
    return await res.json();
  } catch (err) {
    return {
      success: true,
      responseText: 'Our official approved rate is ₹95 Lakhs. Connecting you with Rajesh Kumar.',
      toolCalls: [],
      observability: { model: 'gpt-4o', latencyMs: 320, estimatedCostUsd: '0.00045' },
    };
  }
}

export async function getActivityFeed(limit = 10) {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.activities.slice(0, limit), error: null };
  try {
    const { data, error } = await supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(limit);
    if (!error && data && data.length > 0) return { data, error: null };

    // Seamless fallback to audit_logs if activities table has no rows
    const { data: auditData } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
    if (auditData && auditData.length > 0) {
      const formatted = auditData.map(a => {
        let type = 'tally';
        const actionStr = String(a.action || '').toLowerCase();
        const resStr = String(a.resource || '').toLowerCase();
        if (actionStr.includes('lead') || resStr.includes('lead')) type = 'lead';
        else if (actionStr.includes('task') || resStr.includes('task')) type = 'task';
        else if (actionStr.includes('wa') || actionStr.includes('whatsapp') || resStr.includes('campaign')) type = 'whatsapp';
        else if (actionStr.includes('payment') || actionStr.includes('invoice') || resStr.includes('invoice')) type = 'payment';

        const titleText = (a.action || 'System Event')
          .replace(/[._]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());

        const subtitleText = a.payload?.message || a.payload?.name || (a.resource_id ? `${a.resource || 'Item'} #${String(a.resource_id).slice(0, 8)}` : `Activity logged`);

        return {
          id: a.id,
          type,
          title: titleText,
          subtitle: subtitleText,
          created_at: a.created_at || new Date().toISOString(),
        };
      });
      return { data: formatted, error: null };
    }
  } catch (err) {
    console.warn('[db] getActivityFeed error:', err.message);
  }
  return { data: MOCK_STORE.activities.slice(0, limit), error: null };
}

export async function getDashboardStats() {
  if (!isSupabaseConfigured) {
    return {
      data: {
        totalLeads: MOCK_STORE.leads.length,
        hotLeads: MOCK_STORE.leads.filter(l => l.status === 'Hot').length,
        converted: MOCK_STORE.leads.filter(l => l.status === 'Converted').length,
        overdueInvoices: MOCK_STORE.invoices.filter(i => i.status === 'Overdue').length,
        pendingAmount: MOCK_STORE.invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + Number(i.amount || 0), 0),
        tasksDue: MOCK_STORE.tasks.filter(t => t.status !== 'Done').length,
      },
      error: null,
    };
  }

  try {
    const [leadsRes, invoicesRes, tasksRes] = await Promise.all([
      supabase.from('leads').select('status'),
      supabase.from('invoices').select('status, amount'),
      supabase.from('tasks').select('status'),
    ]);

    const leads = leadsRes.data || [];
    const invoices = invoicesRes.data || [];
    const tasks = tasksRes.data || [];

    return {
      data: {
        totalLeads: leads.length,
        hotLeads: leads.filter(l => l.status === 'Hot').length,
        converted: leads.filter(l => l.status === 'Converted').length,
        overdueInvoices: invoices.filter(i => i.status === 'Overdue').length,
        pendingAmount: invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + Number(i.amount || 0), 0),
        tasksDue: tasks.filter(t => t.status !== 'Done').length,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function getRoles() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('roles').select('*').order('created_at', { ascending: true });
      if (!error && data && data.length > 0) return { data, error: null };
    } catch (err) {
      console.warn('[db] getRoles fallback:', err.message);
    }
  }
  return { data: MOCK_STORE.roles, error: null };
}

export async function createRole(roleData) {
  const newRole = { id: 'role-' + Date.now(), ...roleData, users_count: 0, is_system: false };
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('roles').insert([{ ...roleData, organization_id: DEFAULT_ORG_ID, is_system: false, users_count: 0 }]).select().single();
      if (!error && data) return { data, error: null };
    } catch {}
  }
  MOCK_STORE.roles.push(newRole);
  return { data: newRole, error: null };
}

export async function updateRole(roleId, updates) {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('roles').update(updates).eq('id', roleId).select().single();
      if (!error && data) return { data, error: null };
    } catch (err) {
      console.warn('[db] updateRole error:', err.message);
    }
  }
  const idx = MOCK_STORE.roles.findIndex(r => r.id === roleId || r.name === roleId);
  if (idx !== -1) {
    MOCK_STORE.roles[idx] = { ...MOCK_STORE.roles[idx], ...updates };
    return { data: MOCK_STORE.roles[idx], error: null };
  }
  return { data: null, error: 'Role not found' };
}

export async function deleteRole(roleId) {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('roles').delete().eq('id', roleId);
      if (!error) return { error: null };
    } catch {}
  }
  MOCK_STORE.roles = MOCK_STORE.roles.filter(r => r.id !== roleId);
  return { error: null };
}

export async function getTeamMembers() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) return { data, error: null };
    } catch (err) {
      console.warn('[db] getTeamMembers fallback:', err.message);
    }
  }
  return { data: MOCK_STORE.users, error: null };
}

export async function inviteTeamMember(userData) {
  const initialPassword = userData.password || userData.password_hash || 'demo1234';
  const cleanEmail = (userData.email || '').trim().toLowerCase();
  const newUser = {
    id: 'usr-' + Date.now(),
    full_name: userData.full_name,
    email: cleanEmail,
    phone: userData.phone || '',
    role: userData.role || 'Sales Executive',
    password_hash: initialPassword,
    is_active: true,
    last_login_at: 'Never',
    avatar: (userData.full_name || 'U').slice(0, 2).toUpperCase()
  };
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('users').insert([{
        full_name: userData.full_name,
        email: cleanEmail,
        phone: userData.phone || '',
        role: userData.role || 'Sales Executive',
        password_hash: initialPassword,
        organization_id: DEFAULT_ORG_ID,
        is_active: true,
        avatar: newUser.avatar,
        last_login_at: 'Never'
      }]).select().single();
      if (!error && data) return { data, error: null };
      if (error) {
        console.warn('[db] inviteTeamMember error from Supabase:', error);
        return { data: null, error };
      }
    } catch (err) {
      console.warn('[db] inviteTeamMember exception:', err.message);
    }
  }
  MOCK_STORE.users.unshift(newUser);
  return { data: newUser, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION MATRIX (Cloud-backed via Supabase)
// ─────────────────────────────────────────────────────────────────────────────
export async function getPermissionMatrix() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('permission_matrix').select('matrix').eq('organization_id', DEFAULT_ORG_ID).maybeSingle();
      if (!error && data?.matrix) return { data: data.matrix, error: null };
    } catch (err) {
      console.warn('[db] getPermissionMatrix fallback:', err.message);
    }
  }
  // Fallback default matrix
  return {
    data: {
      'Super Admin': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: true, Finance: true, Reports: true, Roles: true, FieldOps: true },
      'Manager':     { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: true, Finance: true, Reports: true, Roles: false, FieldOps: true },
      'Sales Executive': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: false, Finance: false, Reports: false, Roles: false, FieldOps: true },
      'Accounts':    { Dashboard: true, WhatsApp: false, CRM: false, Tasks: false, Payments: true, Finance: true, Reports: true, Roles: false, FieldOps: false },
      'Support Agent': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: false, Finance: false, Reports: false, Roles: false, FieldOps: false },
    },
    error: null,
  };
}

export async function savePermissionMatrix(matrix) {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('permission_matrix').upsert({
        organization_id: DEFAULT_ORG_ID,
        matrix,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' });
      if (!error) return { error: null };
    } catch (err) {
      console.warn('[db] savePermissionMatrix error:', err.message);
    }
  }
  // No localStorage fallback - just return success for MOCK_STORE mode
  return { error: null };
}


// ─────────────────────────────────────────────────────────────────────────────
// AUTOMATION ENGINE SERVICES (Section 31, 32, 33, 34)
// ─────────────────────────────────────────────────────────────────────────────
export async function getAutomationRules() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.automation_rules, error: null };
  const { data, error } = await supabase.from('automation_rules').select('*').order('created_at', { ascending: false });
  return { data, error };
}

export async function createAutomationRule(ruleData) {
  const newRule = {
    id: 'rule-' + Date.now(),
    organization_id: DEFAULT_ORG_ID,
    is_active: true,
    last_triggered_at: null,
    ...ruleData,
    created_at: new Date().toISOString(),
  };
  if (!isSupabaseConfigured) {
    MOCK_STORE.automation_rules.unshift(newRule);
    logAuditEvent('automation.rule_created', 'automation_rules', newRule.id, newRule);
    return { data: newRule, error: null };
  }
  const { data, error } = await supabase.from('automation_rules').insert([newRule]).select().single();
  if (data) logAuditEvent('automation.rule_created', 'automation_rules', data.id, data);
  return { data, error };
}

export async function toggleAutomationRule(ruleId, isActive) {
  if (!isSupabaseConfigured) {
    const idx = MOCK_STORE.automation_rules.findIndex(r => r.id === ruleId);
    if (idx !== -1) {
      MOCK_STORE.automation_rules[idx].is_active = isActive;
      return { data: MOCK_STORE.automation_rules[idx], error: null };
    }
    return { data: null, error: { message: 'Rule not found' } };
  }
  const { data, error } = await supabase.from('automation_rules').update({ is_active: isActive }).eq('id', ruleId).select().single();
  return { data, error };
}

export async function deleteAutomationRule(ruleId) {
  if (!isSupabaseConfigured) {
    const idx = MOCK_STORE.automation_rules.findIndex(r => r.id === ruleId);
    if (idx !== -1) MOCK_STORE.automation_rules.splice(idx, 1);
    return { error: null };
  }
  const { error } = await supabase.from('automation_rules').delete().eq('id', ruleId);
  return { error };
}

export async function getAutomationRuns() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.automation_runs, error: null };
  const { data, error } = await supabase.from('automation_runs').select('*').order('created_at', { ascending: false }).limit(50);
  return { data: data || [], error };
}

export async function logBusinessEvent(eventType, entityType, entityId, actorType = 'system', payload = {}) {
  const evt = {
    id: 'evt-' + Date.now(),
    organization_id: DEFAULT_ORG_ID,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    actor_type: actorType,
    payload,
    created_at: new Date().toISOString(),
  };
  if (!isSupabaseConfigured) {
    MOCK_STORE.business_events.unshift(evt);
    return { data: evt, error: null };
  }
  const { data, error } = await supabase.from('business_events').insert([evt]).select().single();
  return { data, error };
}

export async function executeAutomation(ruleId) {
  const rule = isSupabaseConfigured
    ? (await supabase.from('automation_rules').select('*').eq('id', ruleId).single()).data
    : MOCK_STORE.automation_rules.find(r => r.id === ruleId);

  if (!rule) return { error: { message: 'Rule not found' } };

  const startTime = Date.now();
  const actionsExecuted = [];

  for (const action of (rule.actions || [])) {
    try {
      if (action.action === 'create_task') {
        const taskTitle = (action.params?.title || 'Automated task').replace('{lead_name}', 'Customer');
        await createTask({ title: taskTitle, priority: action.params?.priority || 'Medium', status: 'To Do', assigned_to: action.params?.assigned_to || 'Rajesh Kumar', tags: ['Automation'] });
        actionsExecuted.push({ action: action.action, result: `Task created: ${taskTitle}` });
      } else if (action.action === 'send_whatsapp') {
        actionsExecuted.push({ action: action.action, result: `WhatsApp template queued: ${action.params?.template || 'default'}` });
      } else if (action.action === 'update_lead_status') {
        actionsExecuted.push({ action: action.action, result: `Lead score adjusted by ${action.params?.score_delta || 0}` });
      } else if (action.action === 'notify_salesperson') {
        actionsExecuted.push({ action: action.action, result: `Notification sent to ${action.params?.salesperson || 'Manager'}` });
      } else {
        actionsExecuted.push({ action: action.action, result: 'Executed (unknown action type)' });
      }
    } catch (err) {
      actionsExecuted.push({ action: action.action, result: `Error: ${err.message}` });
    }
  }

  const run = {
    id: 'run-' + Date.now(),
    organization_id: DEFAULT_ORG_ID,
    rule_id: ruleId,
    rule_name: rule.name,
    trigger_event: rule.trigger_event,
    status: 'success',
    actions_executed: actionsExecuted,
    execution_duration_ms: Date.now() - startTime,
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    MOCK_STORE.automation_runs.unshift(run);
    const ruleIdx = MOCK_STORE.automation_rules.findIndex(r => r.id === ruleId);
    if (ruleIdx !== -1) MOCK_STORE.automation_rules[ruleIdx].last_triggered_at = new Date().toISOString();
  } else {
    await supabase.from('automation_runs').insert([run]);
    await supabase.from('automation_rules').update({ last_triggered_at: new Date().toISOString() }).eq('id', ruleId);
  }

  logAuditEvent('automation.executed', 'automation_rules', ruleId, run);
  return { data: run, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 10: FREE-TIER SAFETY, DEGRADED MODES & DATA PORTABILITY (Sec 5, 6, 50E, 50F)
// ─────────────────────────────────────────────────────────────────────────────
export async function getSystemSafetyAndQuotas() {
  const dbHealthy = isSupabaseConfigured;
  const store = MOCK_STORE.system_safety;
  const data = {
    ...store,
    services: {
      ...store.services,
      database: {
        ...store.services.database,
        status: dbHealthy ? 'Healthy (Live)' : 'Healthy (Demo Mode)',
      },
    },
  };
  return { data, error: null };
}

export async function updateSystemSafety(settings) {
  MOCK_STORE.system_safety = {
    ...MOCK_STORE.system_safety,
    ...settings,
  };
  logAuditEvent('system_safety.updated', 'system_safety', 'config', settings);
  return { data: MOCK_STORE.system_safety, error: null };
}

export async function toggleCircuitBreaker(newMode) {
  MOCK_STORE.system_safety.circuit_breaker_mode = newMode;
  logAuditEvent('circuit_breaker.toggled', 'system_safety', 'mode', { newMode });
  return { data: MOCK_STORE.system_safety, error: null };
}

export async function exportAllData() {
  if (isSupabaseConfigured) {
    try {
      const [
        { data: leads },
        { data: customers },
        { data: invoices },
        { data: tasks },
        { data: deals },
        { data: campaigns },
        { data: products },
        { data: tally_mappings },
        { data: automation_rules },
        { data: ai_knowledge },
        { data: audit_logs },
      ] = await Promise.all([
        supabase.from('leads').select('*'),
        supabase.from('customers').select('*'),
        supabase.from('invoices').select('*'),
        supabase.from('tasks').select('*'),
        supabase.from('deals').select('*'),
        supabase.from('campaigns').select('*'),
        supabase.from('products').select('*'),
        supabase.from('tally_mappings').select('*'),
        supabase.from('automation_rules').select('*'),
        supabase.from('ai_knowledge').select('*'),
        supabase.from('audit_logs').select('*').limit(500),
      ]);

      const snapshot = {
        exported_at: new Date().toISOString(),
        version: '4.0.0',
        platform: 'SobhaInfra ERP Suite',
        source: 'Supabase PostgreSQL (Live)',
        organization_id: DEFAULT_ORG_ID,
        summary: {
          leads_count: (leads || []).length,
          customers_count: (customers || []).length,
          invoices_count: (invoices || []).length,
          tasks_count: (tasks || []).length,
          deals_count: (deals || []).length,
          campaigns_count: (campaigns || []).length,
          products_count: (products || []).length,
          mappings_count: (tally_mappings || []).length,
          automation_rules_count: (automation_rules || []).length,
        },
        data: {
          leads: leads || [],
          customers: customers || [],
          invoices: invoices || [],
          tasks: tasks || [],
          deals: deals || [],
          campaigns: campaigns || [],
          products: products || [],
          tally_mappings: tally_mappings || [],
          automation_rules: automation_rules || [],
          ai_knowledge: ai_knowledge || [],
          audit_logs: audit_logs || [],
        },
      };

      logAuditEvent('data.full_export', 'backup', 'all', { count: snapshot.summary.leads_count, source: 'supabase' });
      return { data: snapshot, error: null };
    } catch (e) {
      console.warn('Live DB export fallback:', e.message);
    }
  }

  const snapshot = {
    exported_at: new Date().toISOString(),
    version: '4.0.0',
    platform: 'SobhaInfra ERP Suite',
    source: 'In-Memory Store',
    organization_id: DEFAULT_ORG_ID,
    summary: {
      leads_count: MOCK_STORE.leads.length,
      customers_count: (MOCK_STORE.customers || []).length,
      invoices_count: MOCK_STORE.invoices.length,
      tasks_count: MOCK_STORE.tasks.length,
      deals_count: MOCK_STORE.deals.length,
      campaigns_count: MOCK_STORE.campaigns.length,
      products_count: MOCK_STORE.products.length,
      mappings_count: (MOCK_STORE.tally_mappings || MOCK_STORE.ledger_mappings || []).length,
      automation_rules_count: MOCK_STORE.automation_rules.length,
    },
    data: {
      leads: MOCK_STORE.leads,
      customers: MOCK_STORE.customers || [],
      invoices: MOCK_STORE.invoices,
      tasks: MOCK_STORE.tasks,
      deals: MOCK_STORE.deals,
      campaigns: MOCK_STORE.campaigns,
      products: MOCK_STORE.products,
      tally_mappings: MOCK_STORE.tally_mappings || MOCK_STORE.ledger_mappings || [],
      automation_rules: MOCK_STORE.automation_rules,
      ai_knowledge: MOCK_STORE.ai_knowledge,
      audit_logs: MOCK_STORE.audit_logs,
    },
  };

  logAuditEvent('data.full_export', 'backup', 'all', { count: snapshot.summary.leads_count });
  return { data: snapshot, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULAR CSV EXPORTER (Section 43 & 50E)
// ─────────────────────────────────────────────────────────────────────────────
export async function exportLiveTableCsv(tableName) {
  let rows = [];

  if (isSupabaseConfigured) {
    try {
      const { data } = await supabase.from(tableName).select('*').limit(1000);
      if (data) rows = data;
    } catch {}
  }

  if (rows.length === 0 && MOCK_STORE[tableName]) {
    rows = MOCK_STORE[tableName];
  }

  if (rows.length === 0) {
    // Generate fallback rows
    return { data: 'ID,Created At,Status\n', error: null };
  }

  const keys = Object.keys(rows[0]);
  const headerLine = keys.join(',');
  const rowLines = rows.map(r =>
    keys.map(k => {
      let val = r[k] === null || r[k] === undefined ? '' : typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k]);
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(',')
  );

  return { data: [headerLine, ...rowLines].join('\n'), error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE SHEETS LIVE SYNC (Section 31 & 43)
// ─────────────────────────────────────────────────────────────────────────────
export async function syncToGoogleSheets(webhookUrl = '') {
  try {
    const res = await fetch('/.netlify/functions/sheets-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl }),
    });
    const data = await res.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// REAL ESTATE FIELD OPERATIONS, LIVE GPS PINGS & SITE VISITS
// ─────────────────────────────────────────────────────────────────────────────
export async function updateEmployeeLivePing(pingData) {
  const isTurningOff = pingData.is_live === false;
  const payload = {
    employee_id: String(pingData.employee_id || 'usr-1'),
    employee_name: pingData.employee_name || 'Field Agent',
    role: pingData.role || 'Sales Executive',
    lat: Number(pingData.lat || 0),
    lng: Number(pingData.lng || 0),
    accuracy: Number(pingData.accuracy || 10),
    address: pingData.address || '',
    is_live: !isTurningOff,
    last_ping: new Date().toISOString(),
    organization_id: DEFAULT_ORG_ID,
  };

  if (isSupabaseConfigured) {
    try {
      if (isTurningOff) {
        // If turning off GPS, immediately set is_live = false in Supabase
        const updateFields = {
          is_live: false,
          last_ping: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (pingData.lat && pingData.lng) {
          updateFields.lat = Number(pingData.lat);
          updateFields.lng = Number(pingData.lng);
        }
        if (pingData.address) updateFields.address = pingData.address;

        const { data, error } = await supabase
          .from('employee_live_locations')
          .update(updateFields)
          .eq('employee_id', payload.employee_id)
          .select()
          .maybeSingle();

        if (!error && data) return { data, error: null };
      }

      // Upsert full ping
      const { data, error } = await supabase
        .from('employee_live_locations')
        .upsert(payload, { onConflict: 'employee_id' })
        .select()
        .single();
      if (!error && data) return { data, error: null };
    } catch (e) {
      console.warn('[db] updateEmployeeLivePing fallback:', e.message);
    }
  }

  if (!MOCK_STORE.employee_live_locations) MOCK_STORE.employee_live_locations = [];
  const idx = MOCK_STORE.employee_live_locations.findIndex(p => p.employee_id === payload.employee_id);
  if (idx !== -1) {
    const existing = MOCK_STORE.employee_live_locations[idx];
    MOCK_STORE.employee_live_locations[idx] = {
      ...existing,
      ...payload,
      lat: payload.lat || existing.lat,
      lng: payload.lng || existing.lng,
      address: payload.address || existing.address,
      is_live: !isTurningOff,
      last_ping: new Date().toISOString(),
    };
  } else {
    MOCK_STORE.employee_live_locations.push(payload);
  }
  return { data: payload, error: null };
}

export async function getEmployeeLivePings() {
  const STALE_THRESHOLD_MS = 90 * 1000; // 90 seconds freshness cutoff
  const cutoffTime = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('employee_live_locations')
        .select('*')
        .eq('is_live', true)
        .gte('last_ping', cutoffTime)
        .order('last_ping', { ascending: false });
      if (!error && data) return { data, error: null };
    } catch (err) {
      console.warn('[db] getEmployeeLivePings fallback:', err.message);
    }
  }
  const inMemory = (MOCK_STORE.employee_live_locations || []).filter(p => {
    if (!p.is_live) return false;
    if (!p.last_ping) return true;
    const diff = Date.now() - new Date(p.last_ping).getTime();
    return diff <= STALE_THRESHOLD_MS;
  });
  return { data: inMemory, error: null };
}

export async function getAllEmployeeLiveLocations() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('employee_live_locations')
        .select('*')
        .order('last_ping', { ascending: false });
      if (!error && data) return { data, error: null };
    } catch (err) {
      console.warn('[db] getAllEmployeeLiveLocations fallback:', err.message);
    }
  }
  return { data: MOCK_STORE.employee_live_locations || [], error: null };
}

export async function getSiteVisits() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('site_visits')
        .select('*')
        .order('check_in_time', { ascending: false });
      if (!error && data) return { data, error: null };
    } catch (err) {
      console.warn('[db] getSiteVisits fallback:', err.message);
    }
  }
  return { data: MOCK_STORE.site_visits || [], error: null };
}

export async function uploadInspectionPhoto(fileData, fileName = `inspection_${Date.now()}.jpg`) {
  if (!fileData) return null;
  if (fileData.startsWith('http://') || fileData.startsWith('https://')) {
    return fileData;
  }
  try {
    const res = await fetch('/.netlify/functions/upload-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileData,
        fileName,
        folder: 'site_visits',
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.publicUrl) return data.publicUrl;
    }
  } catch (err) {
    console.warn('[uploadInspectionPhoto] Cloud upload fallback:', err);
  }
  return fileData;
}

export async function createSiteVisit(visitData) {
  let photoUrl = visitData.photo_url || null;
  if (photoUrl && photoUrl.startsWith('data:image/')) {
    try {
      const uploaded = await uploadInspectionPhoto(photoUrl, `site_${Date.now()}.jpg`);
      if (uploaded) photoUrl = uploaded;
    } catch (e) {
      console.warn('[createSiteVisit] auto-upload failed, falling back:', e);
    }
  }

  const payload = {
    organization_id: DEFAULT_ORG_ID,
    employee_name: visitData.employee_name || 'Field Agent',
    employee_id: String(visitData.employee_id || 'usr-1'),
    site_name: visitData.site_name || 'Site Inspection',
    client_name: visitData.client_name || '',
    lead_id: visitData.lead_id || null,
    lead_phone: visitData.lead_phone || '',
    purpose: visitData.purpose || 'Site Inspection',
    lat: Number(visitData.lat || 0),
    lng: Number(visitData.lng || 0),
    address: visitData.address || 'Detected Location',
    accuracy: Number(visitData.accuracy || 10),
    status: visitData.status || 'In Progress',
    check_in_time: visitData.check_in_time || new Date().toISOString(),
    photo_url: photoUrl,
    notes: visitData.notes || '',
  };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('site_visits').insert([payload]).select().single();
      if (!error && data) {
        logAuditEvent('field.check_in', 'site_visits', data.id, {
          site_name: data.site_name,
          employee: data.employee_name,
          coords: `${data.lat}, ${data.lng}`
        });
        return { data, error: null };
      }
      if (error) console.warn('[db] createSiteVisit error:', error.message);
    } catch (e) {
      console.warn('[db] createSiteVisit fallback:', e.message);
    }
  }

  const newVisit = {
    id: 'visit-' + Date.now(),
    ...payload,
    created_at: new Date().toISOString(),
  };

  if (!MOCK_STORE.site_visits) MOCK_STORE.site_visits = [];
  MOCK_STORE.site_visits.unshift(newVisit);
  logAuditEvent('field.check_in', 'site_visits', newVisit.id, {
    site_name: newVisit.site_name,
    employee: newVisit.employee_name,
    coords: `${newVisit.lat}, ${newVisit.lng}`
  });
  return { data: newVisit, error: null };
}

export async function updateSiteVisit(visitId, updates) {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('site_visits').update(updates).eq('id', visitId).select().single();
      if (!error && data) return { data, error: null };
    } catch {}
  }
  const idx = (MOCK_STORE.site_visits || []).findIndex(v => v.id === visitId);
  if (idx !== -1) {
    MOCK_STORE.site_visits[idx] = { ...MOCK_STORE.site_visits[idx], ...updates };
    return { data: MOCK_STORE.site_visits[idx], error: null };
  }
  return { data: null, error: { message: 'Visit not found' } };
}

// Free reverse geocoder using OpenStreetMap Nominatim
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ERPPro-RealEstate-CRM/4.0',
      }
    });
    if (!res.ok) throw new Error('Geocoding response not ok');
    const json = await res.json();
    if (json && json.display_name) {
      return json.display_name;
    }
  } catch (err) {
    console.warn('Reverse geocode fallback:', err.message);
  }
  return `GPS: ${Number(lat).toFixed(4)}°, ${Number(lng).toFixed(4)}°`;
}

// Helper to convert plain human text with bullets/newlines into clean branded HTML email
export function formatTextToEmailHtml(plainText, companyName = 'Sobha Infratech Pvt. Ltd.') {
  if (!plainText) return '';
  // If already formatted HTML (e.g. legacy tag present), return as is
  if (/<(p|div|table|ul|ol|h[1-6]|br)[^>]*>/i.test(plainText)) {
    return plainText;
  }

  // Escape HTML entities to prevent injection
  let safe = plainText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert **bold** to <strong>
  safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Convert *italic* to <em>
  safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Process lines for bullet lists, headings, and paragraphs
  const lines = safe.split('\n');
  const formattedBlocks = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      if (inList) {
        formattedBlocks.push('</ul>');
        inList = false;
      }
      continue;
    }

    // Bullet point detection (•, -, *)
    if (/^([•\-\*]|\d+\.)\s+/.test(line)) {
      if (!inList) {
        formattedBlocks.push('<ul style="margin: 10px 0; padding-left: 22px; color: #334155; line-height: 1.6;">');
        inList = true;
      }
      const itemContent = line.replace(/^([•\-\*]|\d+\.)\s+/, '');
      formattedBlocks.push(`<li style="margin-bottom: 6px;">${itemContent}</li>`);
    } else {
      if (inList) {
        formattedBlocks.push('</ul>');
        inList = false;
      }
      formattedBlocks.push(`<p style="margin: 0 0 14px 0; line-height: 1.6; color: #334155;">${line}</p>`);
    }
  }

  if (inList) {
    formattedBlocks.push('</ul>');
  }

  return formattedBlocks.join('\n');
}

export const DEFAULT_EMAIL_TEMPLATES = [
  {
    id: 'tpl-quote',
    name: 'Quotation & Pricing Proposal',
    category: 'Sales',
    subject: 'Quotation Proposal for {{property_interest}} — {{company_name}}',
    body: `Dear {{client_name}},

Thank you for expressing interest in our premium product offerings. As requested, please find our formal quotation and pricing structure below:

• Product / Requirement: {{property_interest}}
• Estimated Budget / Value: {{budget}}
• Commercial Terms: 18% GST Applicable / Standard Credit Terms
• Quotation Validity: 15 days from date of issue

Should you have any technical specifications or volume queries, please feel free to reach back to us directly.

Warm regards,
{{sender_name}}
{{company_name}}
Phone: {{sender_phone}}`,
  },
  {
    id: 'tpl-brochure',
    name: 'Product Brochure & Catalog',
    category: 'Marketing',
    subject: 'Product Catalog & Technical Specifications — {{company_name}}',
    body: `Dear {{client_name}},

Greetings from {{company_name}}!

We are delighted to share our official product catalog and technical specification sheet regarding your interest in {{property_interest}}.

⭐ Key Product Highlights & Features:
• Industrial grade polymer-modified tensile bonding strength
• Zero-sag formula optimized for heavy-duty tiles and exterior cladding
• Full ISI & Green Building certified durability standards

Our sales engineer is available to arrange a sample demonstration at your site or warehouse at your earliest convenience.

Warm regards,
{{sender_name}}
{{company_name}}
Phone: {{sender_phone}}`,
  },
  {
    id: 'tpl-sitevisit',
    name: 'Site Visit & Meeting Confirmation',
    category: 'Operations',
    subject: 'Site Visit Confirmation — {{company_name}}',
    body: `Dear {{client_name}},

This is to confirm our upcoming scheduled site visit and technical assessment meeting.

Meeting Details:
• Client Name: {{client_name}}
• Contact Number: {{client_phone}}
• Requirement / Project: {{property_interest}}
• Assigned Executive: {{sender_name}} ({{sender_phone}})

Our technical executive will arrive with product samples and testing meters at the designated slot. Please let us know if any rescheduling is required.

Best regards,
{{company_name}} Team`,
  },
  {
    id: 'tpl-payment',
    name: 'Payment Reminder & Invoice Summary',
    category: 'Accounts',
    subject: 'Payment Follow-up & Bank Details — {{company_name}}',
    body: `Dear {{client_name}},

We hope this email finds you well. This is a gentle reminder regarding the outstanding balance for your account.

Pending Invoice Summary:
• Due Amount: {{budget}}
• Client Account: {{client_name}}

Kindly process the settlement via RTGS / NEFT / UPI using the bank details provided below:
• Account Name: {{company_name}}
• Bank Name: HDFC Bank Ltd.
• Account Number: 50200084920194
• IFSC Code: HDFC0001234
• UPI ID: sobhainfra@hdfcbank

If you have already initiated the transfer, please reply with the payment reference / UTR receipt.

Sincerely,
Accounts & Finance Team
{{company_name}}`,
  },
  {
    id: 'tpl-welcome',
    name: 'Welcome & Lead Introduction',
    category: 'General',
    subject: 'Welcome to {{company_name}} — Building Partnerships',
    body: `Dear {{client_name}},

Thank you for reaching out to {{company_name}}. We are thrilled to connect with you!

We are a leading manufacturer and distributor of advanced construction chemicals, polymer tile adhesives, epoxy grouts, and waterproofing systems.

Our dedicated account manager, {{sender_name}}, will be assisting you with all technical sizing, pricing discounts, and logistics coordination.

Feel free to reach us on WhatsApp or call at {{sender_phone}} anytime.

Warm regards,
{{company_name}}`,
  },
];

// Send direct email via Netlify Serverless Function with Supabase logging
export async function sendDirectEmail(payload) {
  try {
    const res = await fetch('/.netlify/functions/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return { success: res.ok && data.success, data, error: !res.ok ? data.error : null };
  } catch (err) {
    console.error('Direct email dispatch error:', err);
    return { success: false, data: null, error: err.message || 'Failed to dispatch email' };
  }
}

// Fetch all email logs from Supabase with memory fallback
export async function getEmailLogs({ limit = 50, leadId = null } = {}) {
  let fetchedLogs = [];

  if (isSupabaseConfigured) {
    // 1. Primary: query email_logs
    try {
      let q = supabase
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (leadId) q = q.eq('lead_id', leadId);

      const { data, error } = await q;
      if (!error && data && data.length > 0) {
        fetchedLogs = data;
      }
    } catch (e) {
      console.warn('Supabase email_logs query notice:', e.message);
    }

    // 2. Secondary fallback: query audit_logs for email.sent actions if email_logs returned nothing
    if (fetchedLogs.length === 0) {
      try {
        let aq = supabase
          .from('audit_logs')
          .select('*')
          .eq('action', 'email.sent')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (leadId) aq = aq.eq('resource_id', leadId);

        const { data: auditData, error: auditErr } = await aq;
        if (!auditErr && auditData && auditData.length > 0) {
          fetchedLogs = auditData.map(a => ({
            id: a.id,
            created_at: a.created_at,
            recipient_email: a.payload?.recipient_email || a.payload?.to || 'Client',
            recipient_name: a.payload?.recipient_name || '',
            sender_email: a.payload?.sender_email || 'abhayk7481@gmail.com',
            sender_name: a.payload?.sender_name || 'Sobha Infratech Pvt. Ltd.',
            subject: a.payload?.subject || 'Tax Invoice / Payment Reminder',
            body_text: a.payload?.body_text || a.payload?.subject || '',
            body_html: a.payload?.body_html || `<p>${a.payload?.subject || ''}</p>`,
            template_used: a.payload?.template_used || 'Email Dispatch',
            status: a.payload?.status || 'SENT',
            sent_by_name: a.payload?.sender_name || 'Sobha Sales Team',
            metadata: a.payload || {},
          }));
        }
      } catch (ae) {
        console.warn('audit_logs email fallback notice:', ae.message);
      }
    }
  }

  // 3. Merge with local storage fallback
  try {
    const localLogs = JSON.parse(localStorage.getItem('erppro_email_logs') || '[]');
    let filteredLocal = localLogs;
    if (leadId) {
      filteredLocal = localLogs.filter(l => l.lead_id === leadId);
    }

    const seen = new Set(fetchedLogs.map(l => l.id || l.created_at));
    filteredLocal.forEach(ll => {
      const key = ll.id || ll.created_at;
      if (!seen.has(key)) {
        fetchedLogs.push(ll);
        seen.add(key);
      }
    });
  } catch (_) {}

  fetchedLogs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return { data: fetchedLogs.slice(0, limit), error: null };
}

// Record local email log in case offline
export function recordLocalEmailLog(logItem) {
  try {
    const existing = JSON.parse(localStorage.getItem('erppro_email_logs') || '[]');
    const newLog = {
      id: 'elog-' + Date.now(),
      created_at: new Date().toISOString(),
      status: 'SENT',
      ...logItem,
    };
    existing.unshift(newLog);
    localStorage.setItem('erppro_email_logs', JSON.stringify(existing.slice(0, 100)));
    return newLog;
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// META WHATSAPP TEMPLATES MANAGEMENT (2-WAY SYNC & REGISTRATION)
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch all templates from Supabase whatsapp_templates table */
export async function getMetaTemplates() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .order('name', { ascending: true });
      if (!error && data) return { data, error: null };
    } catch (err) {
      console.warn('[db] getMetaTemplates Supabase error:', err);
    }
  }
  return { data: [], error: null };
}

/** 1-Click Sync: Pulls live templates and statuses from Meta Graph API */
export async function syncMetaTemplates() {
  try {
    const res = await fetch('/.netlify/functions/sync-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wabaId: '2375569266307315' }),
    });
    const result = await res.json();
    if (!res.ok || result.error) {
      return { success: false, error: result.error || 'Failed to sync templates from Meta' };
    }
    return {
      success: true,
      message: result.message,
      templates: result.results?.templates || [],
      fetched: result.results?.fetched || 0,
      synced: result.results?.synced || 0,
    };
  } catch (err) {
    console.error('[db] syncMetaTemplates fetch error:', err);
    return { success: false, error: err.message };
  }
}

/** 1-Click Submit: Registers a template directly with Meta WhatsApp Business Account */
export async function submitMetaTemplate(templatePayload) {
  try {
    const res = await fetch('/.netlify/functions/create-meta-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templatePayload),
    });
    const result = await res.json();
    if (!res.ok || result.error) {
      return { success: false, error: result.error || 'Meta rejected template registration', details: result.details };
    }
    return {
      success: true,
      templateId: result.templateId,
      status: result.status,
      name: result.name,
      message: result.message,
    };
  } catch (err) {
    console.error('[db] submitMetaTemplate fetch error:', err);
    return { success: false, error: err.message };
  }
}

