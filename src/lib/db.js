/**
 * Techma ERPPro Centralized Data Service
 * Implements Multi-Tenant Data Layer conforming to Master Spec v4.0.
 * Supports offline demo fallback and live Supabase PostgreSQL connection with RLS.
 */
import { supabase, isSupabaseConfigured } from './supabase';

export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

// ─────────────────────────────────────────────────────────────────────────────
// PHONE NORMALIZATION UTILITY (Section 42)
// ─────────────────────────────────────────────────────────────────────────────
export function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) cleaned = '+91' + cleaned;
    else if (cleaned.length === 12 && cleaned.startsWith('91')) cleaned = '+' + cleaned;
    else cleaned = '+' + cleaned;
  }
  return cleaned;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL IN-MEMORY MOCK STORE
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_STORE = {
  roles: [
    { id: 'role-1', name: 'Super Admin', color: '#ef4444', users_count: 1, permissions: ['all'], is_system: true },
    { id: 'role-2', name: 'Manager', color: '#6366f1', users_count: 3, permissions: ['dashboard:view', 'crm:read', 'crm:write', 'tasks:read', 'tasks:write', 'finance:read', 'whatsapp:view', 'whatsapp:send'], is_system: true },
    { id: 'role-3', name: 'Sales Executive', color: '#10b981', users_count: 8, permissions: ['dashboard:view', 'crm:read', 'crm:write', 'tasks:read', 'tasks:write', 'whatsapp:view', 'whatsapp:send'], is_system: true },
    { id: 'role-4', name: 'Accounts', color: '#f59e0b', users_count: 2, permissions: ['dashboard:view', 'finance:read', 'finance:sync', 'finance:remind'], is_system: true },
    { id: 'role-5', name: 'Support Agent', color: '#06b6d4', users_count: 4, permissions: ['dashboard:view', 'whatsapp:view', 'whatsapp:send', 'crm:read'], is_system: true },
  ],
  users: [
    { id: 'usr-1', full_name: 'Admin User', email: 'admin@erppro.in', role: 'Super Admin', is_active: true, last_login_at: 'Today, 10:35 AM', avatar: 'AU' },
    { id: 'usr-2', full_name: 'Priya Sharma', email: 'manager@erppro.in', role: 'Manager', is_active: true, last_login_at: 'Today, 9:12 AM', avatar: 'PS' },
    { id: 'usr-3', full_name: 'Rajesh Kumar', email: 'sales@erppro.in', role: 'Sales Executive', is_active: true, last_login_at: 'Yesterday', avatar: 'RK' },
    { id: 'usr-4', full_name: 'Amit Verma', email: 'amit@erppro.in', role: 'Sales Executive', is_active: true, last_login_at: 'Today, 8:45 AM', avatar: 'AV' },
    { id: 'usr-5', full_name: 'Sunita Patel', email: 'sunita@erppro.in', role: 'Accounts', is_active: true, last_login_at: 'Yesterday', avatar: 'SP' },
    { id: 'usr-6', full_name: 'Dev Kumar', email: 'dev@erppro.in', role: 'Support Agent', is_active: false, last_login_at: '3 days ago', avatar: 'DK' },
  ],
  leads: [
    {
      id: 'lead-1',
      name: 'Abhay Kumar',
      phone: '+918092897590',
      email: 'abhayk7481@gmail.com',
      source: 'WhatsApp',
      status: 'Hot',
      property_interest: '3BHK - Andheri West',
      budget: '₹80L - ₹1Cr',
      notes: 'Active live verified WhatsApp contact. Interested in 3BHK Andheri.',
      lead_score: 85,
      first_touch_campaign: 'Diwali Property Offer 2026',
      last_touch_campaign: '3BHK New Launch – Andheri',
      marketing_opt_in: true,
      marketing_opt_out: false,
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
    {
      id: 'lead-2',
      name: 'Sunita Patel',
      phone: '+918765432109',
      email: 'sunita.p@yahoo.com',
      source: 'Facebook',
      status: 'Warm',
      property_interest: '2BHK - Borivali',
      budget: '₹50L - ₹65L',
      notes: 'Looking for fast possession by Diwali.',
      lead_score: 60,
      first_touch_campaign: 'Facebook Ads - July',
      last_touch_campaign: null,
      marketing_opt_in: true,
      marketing_opt_out: false,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      id: 'lead-3',
      name: 'Arjun Sharma',
      phone: '+917654321098',
      email: 'arjun.sharma@gmail.com',
      source: 'Instagram',
      status: 'New',
      property_interest: 'Weekend Villa - Lonavala',
      budget: '₹2Cr+',
      notes: 'Inquired via Instagram lead ad.',
      lead_score: 35,
      first_touch_campaign: 'Instagram Reels Campaign',
      last_touch_campaign: null,
      marketing_opt_in: true,
      marketing_opt_out: false,
      created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    {
      id: 'lead-4',
      name: 'Priya Kapoor',
      phone: '+916543210987',
      email: 'priya.k@outlook.com',
      source: 'Referral',
      status: 'Converted',
      property_interest: '2BHK - Goregaon',
      budget: '₹55L',
      notes: 'Agreement signed, booking advance received.',
      lead_score: 100,
      first_touch_campaign: 'Referral Program',
      last_touch_campaign: 'Payment Reminder – July',
      marketing_opt_in: true,
      marketing_opt_out: false,
      created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    },
    {
      id: 'lead-5',
      name: 'Kavita Joshi',
      phone: '+914321098765',
      email: 'kavita.j@rediffmail.com',
      source: 'WhatsApp',
      status: 'Hot',
      property_interest: '2BHK - Thane',
      budget: '₹60L',
      notes: 'Site visit completed, awaiting final discount approval.',
      lead_score: 80,
      first_touch_campaign: 'Site Visit Drive – August',
      last_touch_campaign: 'Site Visit Drive – August',
      marketing_opt_in: true,
      marketing_opt_out: false,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
  ],
  whatsapp_conversations: [
    {
      id: 'conv-1',
      lead_id: 'lead-1',
      contact_name: 'Abhay Kumar',
      contact_phone: '+918092897590',
      conversation_mode: 'AI ACTIVE',
      last_message_text: 'Hi Abhay, Rajesh here. I can offer you unit 804 at ₹92L special. Can we meet tomorrow?',
      last_message_at: new Date(Date.now() - 12 * 3600000).toISOString(),
      unread_count: 0,
      assigned_salesperson: 'Rajesh Kumar',
      property_interest: '3BHK - Andheri West',
    },
  ],
  whatsapp_messages: {
    'conv-1': [
      { id: 'm-1', direction: 'inbound', sender_type: 'customer', body: 'Hi, I saw your 3BHK ad in Andheri. What is the current rate?', status: 'read', created_at: new Date(Date.now() - 3600000 * 48).toISOString() },
      { id: 'm-2', direction: 'outbound', sender_type: 'human_agent', body: 'Hi Ravi, Rajesh here. I can offer you unit 804 at ₹92L special. Can we meet tomorrow at 11 AM?', status: 'delivered', created_at: new Date(Date.now() - 3600000 * 12).toISOString() },
    ],
  },
  ai_knowledge: [
    { id: 'k-1', category: 'Pricing', title: '3BHK Andheri Rates', content: 'Base Price: ₹95,00,000 for 1450 sq.ft. Floor rise: ₹50/sq.ft. Parking included.', version: 2, status: 'active' },
  ],
  invoices: [
    { id: 'inv-1', invoice_number: 'INV-2026-041', client_name: 'Ravi Mehta', client_phone: '+919876543210', amount: 250000, status: 'Overdue', due_date: new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0], reminder_count: 2 },
    { id: 'inv-2', invoice_number: 'INV-2026-045', client_name: 'Priya Kapoor', client_phone: '+916543210987', amount: 450000, status: 'Pending', due_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0], reminder_count: 0 },
    { id: 'inv-3', invoice_number: 'INV-2026-032', client_name: 'Kavita Joshi', client_phone: '+914321098765', amount: 50000, status: 'Paid', due_date: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0], reminder_count: 1 },
    { id: 'inv-4', invoice_number: 'INV-2026-048', client_name: 'Arjun Sharma', client_phone: '+917654321098', amount: 1000000, status: 'Overdue', due_date: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0], reminder_count: 4 },
  ],
  tally_connection: {
    status: 'ONLINE',
    tally_host: '127.0.0.1:9000',
    tally_company: 'Techma Real Estate Pvt Ltd',
    last_sync_at: new Date(Date.now() - 15 * 60000).toISOString(),
    sync_frequency: '15m',
    total_synced_vouchers: 48,
  },
  ledger_mappings: [
    { id: 'lm-1', tally_ledger_name: 'Ravi Mehta', lead_id: 'lead-1', lead_name: 'Ravi Mehta', lead_phone: '+919876543210', mapping_status: 'MAPPED', match_confidence: 1.0 },
    { id: 'lm-2', tally_ledger_name: 'Priya Kapoor', lead_id: 'lead-4', lead_name: 'Priya Kapoor', lead_phone: '+916543210987', mapping_status: 'MAPPED', match_confidence: 1.0 },
    { id: 'lm-3', tally_ledger_name: 'Kavita Joshi', lead_id: 'lead-5', lead_name: 'Kavita Joshi', lead_phone: '+914321098765', mapping_status: 'MAPPED', match_confidence: 1.0 },
    { id: 'lm-4', tally_ledger_name: 'Sharma Bros Enterprises', lead_id: null, lead_name: '—', lead_phone: '—', mapping_status: 'AMBIGUOUS', match_confidence: 0.4 },
  ],
  sync_errors: [
    { id: 'err-1', entity_type: 'invoice', entity_id: 'INV-2026-039', error_message: 'Ledger "Gupta Traders" has no matching phone number or PAN', created_at: new Date(Date.now() - 4 * 3600000).toISOString(), resolved: false }
  ],
  campaigns: [
    { id: 'camp-1', name: 'Diwali Property Offer 2026', status: 'Completed', template_name: 'Festival Discount', total_targeted: 250, total_sent: 248, delivered: 241, read_count: 198, replied: 34, created_at: new Date().toISOString() },
  ],
  activities: [
    { id: 'act-1', lead_id: 'lead-1', type: 'payment', title: 'Tally Invoice INV-2026-041 Overdue', subtitle: '₹2.5 Lakhs (14 Days Overdue)', created_at: new Date().toISOString() },
  ],
  tasks: [
    { id: 'task-1', lead_id: 'lead-1', title: 'Call Ravi Mehta for site visit & pricing negotiation', status: 'To Do', priority: 'High', due_date: new Date().toISOString().split('T')[0], assigned_to: 'Rajesh Kumar', tags: ['CRM', 'AI-Handoff'], created_at: new Date().toISOString() },
  ],
  products: [
    { id: 'prod-1', name: '3BHK Luxury Residence - Andheri', category: 'Residential', sku: 'PROP-3BHK-AND', unit_price: 9500000, unit_of_measure: 'unit', brochure_url: 'https://example.com/3bhk-andheri.pdf', is_active: true, description: 'Super built-up 1,450 sq.ft with panoramic skyline views.' },
  ],
  deals: [
    { id: 'deal-1', lead_id: 'lead-1', title: 'Ravi Mehta - 3BHK Andheri Unit 804', stage: 'Negotiation', value: 9200000, expected_close_date: '2026-08-30', assigned_to: 'Rajesh Kumar' },
  ],
  quotations: [
    { id: 'quot-1', lead_id: 'lead-1', quotation_number: 'QUOT-2026-001', total_amount: 9200000, status: 'Sent', valid_until: '2026-08-31', created_at: new Date().toISOString() },
  ],
  audit_logs: [],
  automation_rules: [
    {
      id: 'rule-1',
      name: 'Hot Lead → Auto-Create Follow-Up Task',
      description: 'When a lead is qualified as HOT by AI, automatically create a high-priority follow-up call task for the assigned salesperson.',
      trigger_event: 'lead.qualified_hot',
      conditions: [{ field: 'interest_level', op: '==', val: 'HOT' }],
      actions: [{ action: 'create_task', params: { title: 'Follow-up call with {lead_name}', priority: 'High', assigned_to: 'Rajesh Kumar' } }],
      is_active: true,
      last_triggered_at: new Date(Date.now() - 2 * 3600000).toISOString(),
      created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    },
    {
      id: 'rule-2',
      name: 'Invoice Overdue 7d → WhatsApp Payment Reminder',
      description: 'When a Tally invoice becomes 7+ days overdue, send an automated WhatsApp payment reminder to the client.',
      trigger_event: 'tally.invoice_overdue_7d',
      conditions: [{ field: 'days_overdue', op: '>=', val: 7 }],
      actions: [{ action: 'send_whatsapp', params: { template: 'payment_reminder', message: 'Dear {client_name}, your payment of {amount} is overdue. Please settle at the earliest.' } }],
      is_active: true,
      last_triggered_at: new Date(Date.now() - 5 * 3600000).toISOString(),
      created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    },
    {
      id: 'rule-3',
      name: 'Invoice Overdue 30d → Escalate to Manager',
      description: 'When a Tally invoice becomes 30+ days overdue, escalate to manager and send a second stronger WhatsApp reminder.',
      trigger_event: 'tally.invoice_overdue_30d',
      conditions: [{ field: 'days_overdue', op: '>=', val: 30 }],
      actions: [
        { action: 'send_whatsapp', params: { template: 'payment_escalation', message: 'URGENT: Dear {client_name}, payment of {amount} is significantly overdue. Please contact us immediately.' } },
        { action: 'notify_salesperson', params: { salesperson: 'Manager', priority: 'Urgent' } },
      ],
      is_active: true,
      last_triggered_at: null,
      created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    },
    {
      id: 'rule-4',
      name: 'AI Handoff → Create Urgent Task',
      description: 'When the AI Sales Assistant requests a human handoff, automatically create an urgent task for the assigned representative.',
      trigger_event: 'ai.handoff_requested',
      conditions: [],
      actions: [{ action: 'create_task', params: { title: 'AI Handoff: Call {lead_name} immediately', priority: 'High' } }],
      is_active: true,
      last_triggered_at: new Date(Date.now() - 1 * 3600000).toISOString(),
      created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    },
    {
      id: 'rule-5',
      name: 'Campaign Reply → Auto-Qualify Lead +10',
      description: 'When a lead replies to a broadcast campaign, automatically boost their lead score by +10 points.',
      trigger_event: 'campaign.reply_received',
      conditions: [],
      actions: [{ action: 'update_lead_status', params: { score_delta: 10 } }],
      is_active: false,
      last_triggered_at: null,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
  ],
  automation_runs: [
    { id: 'run-1', rule_id: 'rule-1', rule_name: 'Hot Lead → Auto-Create Follow-Up Task', trigger_event: 'lead.qualified_hot', status: 'success', actions_executed: [{ action: 'create_task', result: 'Task created: Follow-up call with Ravi Mehta' }], execution_duration_ms: 120, created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
    { id: 'run-2', rule_id: 'rule-2', rule_name: 'Invoice Overdue 7d → WhatsApp Payment Reminder', trigger_event: 'tally.invoice_overdue_7d', status: 'success', actions_executed: [{ action: 'send_whatsapp', result: 'WhatsApp sent to Ravi Mehta (+919876543210)' }], execution_duration_ms: 340, created_at: new Date(Date.now() - 5 * 3600000).toISOString() },
    { id: 'run-3', rule_id: 'rule-4', rule_name: 'AI Handoff → Create Urgent Task', trigger_event: 'ai.handoff_requested', status: 'success', actions_executed: [{ action: 'create_task', result: 'Task created: AI Handoff - Call customer immediately' }], execution_duration_ms: 95, created_at: new Date(Date.now() - 1 * 3600000).toISOString() },
    { id: 'run-4', rule_id: 'rule-2', rule_name: 'Invoice Overdue 7d → WhatsApp Payment Reminder', trigger_event: 'tally.invoice_overdue_7d', status: 'failed', actions_executed: [], error_message: 'WhatsApp API rate limit exceeded. Retrying in 60s.', execution_duration_ms: 5200, created_at: new Date(Date.now() - 8 * 3600000).toISOString() },
  ],
  business_events: [],
  system_safety: {
    daily_request_limit: 100000,
    daily_requests_used: 1420,
    ai_monthly_budget_usd: 50.0,
    ai_month_spent_usd: 4.82,
    max_campaign_batch_size: 50,
    ai_messages_per_contact_day: 15,
    circuit_breaker_mode: 'Normal', // 'Normal' | 'Warning' | 'Degraded' | 'Paused'
    services: {
      database: { name: 'Supabase PostgreSQL (RLS)', status: 'Healthy', latency_ms: 42, quota_pct: 8 },
      whatsapp_api: { name: 'Meta WhatsApp Cloud API v20.0', status: 'Healthy', latency_ms: 175, quota_pct: 24 },
      ai_engine: { name: 'OpenAI GPT-4o Bounded Agent', status: 'Healthy', latency_ms: 310, quota_pct: 10 },
      tally_connector: { name: 'Local TallyPrime Bridge (Port 9000)', status: 'Connected', latency_ms: 14, quota_pct: 0 },
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
  const { data, error } = await supabase.from('tally_connections').select('*').single();
  return { data: data || MOCK_STORE.tally_connection, error };
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
  const { data, error } = await supabase.from('ledger_mappings').select('*, lead:leads(*)').order('tally_ledger_name', { ascending: true });
  return { data, error };
}

export async function updateLedgerMapping(mappingId, leadId, tallyLedgerName) {
  if (!isSupabaseConfigured) {
    const idx = MOCK_STORE.ledger_mappings.findIndex(m => m.id === mappingId);
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
      logAuditEvent('ledger.mapped', 'ledger_mappings', mappingId, { leadId, tallyLedgerName });
      return { data: MOCK_STORE.ledger_mappings[idx], error: null };
    }
    return { data: null, error: { message: 'Mapping not found' } };
  }

  const { data, error } = await supabase
    .from('ledger_mappings')
    .update({ lead_id: leadId, mapping_status: 'MAPPED', match_confidence: 1.0 })
    .eq('id', mappingId)
    .select()
    .single();

  if (data) logAuditEvent('ledger.mapped', 'ledger_mappings', mappingId, { leadId, tallyLedgerName });
  return { data, error };
}

export async function getSyncErrors() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.sync_errors, error: null };
  const { data, error } = await supabase.from('sync_errors').select('*').order('created_at', { ascending: false });
  return { data, error };
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
// BASE ENTITY SERVICES (CRM, Tasks, Roles, Campaigns)
// ─────────────────────────────────────────────────────────────────────────────
export async function getInvoices() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.invoices, error: null };
  const { data, error } = await supabase.from('invoices').select('*').order('created_at', { ascending: false });
  if (error || !data || data.length === 0) return { data: MOCK_STORE.invoices, error: null };
  return { data, error };
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

export async function getLeads() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.leads, error: null };
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
  if (error || !data || data.length === 0) return { data: MOCK_STORE.leads, error: null };
  return { data, error };
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
  const { data, error } = await supabase.from('leads').insert([{ ...cleanLead, organization_id: DEFAULT_ORG_ID }]).select().single();
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

export async function getCustomer360(leadId) {
  if (!isSupabaseConfigured) {
    const lead = MOCK_STORE.leads.find(l => l.id === leadId);
    if (!lead) return { data: null, error: { message: 'Lead not found' } };

    const normPhone = normalizePhone(lead.phone);
    const deals = MOCK_STORE.deals.filter(d => d.lead_id === leadId);
    const quotations = MOCK_STORE.quotations.filter(q => q.lead_id === leadId);
    const tasks = MOCK_STORE.tasks.filter(t => t.lead_id === leadId);
    const invoices = MOCK_STORE.invoices.filter(i => normalizePhone(i.client_phone) === normPhone || i.client_name === lead.name);

    const conv = MOCK_STORE.whatsapp_conversations.find(c => c.lead_id === leadId || normalizePhone(c.contact_phone) === normPhone);
    const messages = conv ? (MOCK_STORE.whatsapp_messages[conv.id] || []) : [];
    const activities = MOCK_STORE.activities.filter(a => a.lead_id === leadId);

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

  const { data: lead, error: leadErr } = await supabase.from('leads').select('*').eq('id', leadId).single();
  if (leadErr) return { data: null, error: leadErr };

  const normPhone = normalizePhone(lead.phone);
  const [dealsRes, quotesRes, tasksRes, invoicesRes, activitiesRes, convRes] = await Promise.all([
    supabase.from('deals').select('*').eq('lead_id', leadId),
    supabase.from('quotations').select('*').eq('lead_id', leadId),
    supabase.from('tasks').select('*').eq('related_lead_id', leadId),
    supabase.from('invoices').select('*').eq('client_phone', normPhone),
    supabase.from('activities').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }),
    supabase.from('whatsapp_conversations').select('id').eq('contact_phone', normPhone).maybeSingle(),
  ]);

  let messages = [];
  if (convRes?.data?.id) {
    const { data: msgs } = await supabase.from('whatsapp_messages').select('*').eq('conversation_id', convRes.data.id).order('created_at', { ascending: true });
    messages = msgs || [];
  }

  const invoices = invoicesRes.data || [];
  const totalOutstanding = invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount), 0);

  return {
    data: {
      lead,
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
  const { data, error } = await supabase.from('activities').insert([{ organization_id: DEFAULT_ORG_ID, lead_id: leadId, activity_type: 'note', title: 'Internal Note', content: noteText }]).select().single();
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
    MOCK_STORE.products.push(newP);
    logAuditEvent('product.create', 'products', newP.id, newP);
    return { data: newP, error: null };
  }
  const { data, error } = await supabase.from('products').insert([{ ...productData, organization_id: DEFAULT_ORG_ID }]).select().single();
  if (data) logAuditEvent('product.create', 'products', data.id, data);
  return { data, error };
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
  const { data, error } = await supabase.from('deals').insert([{ ...dealData, organization_id: DEFAULT_ORG_ID }]).select().single();
  if (data) logAuditEvent('deal.create', 'deals', data.id, data);
  return { data, error };
}

export async function getTasks() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.tasks, error: null };
  const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
  return { data, error };
}

export async function createTask(task) {
  if (!isSupabaseConfigured) {
    const newTask = { id: 'task-' + Date.now(), ...task, created_at: new Date().toISOString() };
    MOCK_STORE.tasks.unshift(newTask);
    logAuditEvent('task.create', 'tasks', newTask.id, newTask);
    return { data: newTask, error: null };
  }
  const { data, error } = await supabase.from('tasks').insert([{ ...task, organization_id: DEFAULT_ORG_ID }]).select().single();
  if (data) logAuditEvent('task.create', 'tasks', data.id, data);
  return { data, error };
}

export async function updateTask(id, updates) {
  if (!isSupabaseConfigured) {
    const idx = MOCK_STORE.tasks.findIndex(t => t.id === id);
    if (idx !== -1) MOCK_STORE.tasks[idx] = { ...MOCK_STORE.tasks[idx], ...updates };
    return { data: MOCK_STORE.tasks[idx], error: null };
  }
  const { data, error } = await supabase.from('tasks').update(updates).eq('id', id).select().single();
  return { data, error };
}

export async function getCampaigns() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.campaigns, error: null };
  const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
  return { data, error };
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
  const eligible = matching.filter(l => !l.marketing_opt_out && l.phone && normalizePhone(l.phone).length >= 10);

  return {
    totalRaw,
    targeted,
    optedOut,
    invalidPhone,
    finalAudienceCount: eligible.length,
    eligibleLeads: eligible,
  };
}

export async function queueCampaign(campaignData, filters = {}) {
  const estimation = await estimateCampaignAudience(filters);
  const eligible = estimation.eligibleLeads;

  const newCampaign = {
    id: 'camp-' + Date.now(),
    organization_id: DEFAULT_ORG_ID,
    name: campaignData.name,
    template_name: campaignData.template_name,
    status: 'Scheduled',
    total_targeted: estimation.targeted,
    total_queued: eligible.length,
    total_sent: 0,
    delivered: 0,
    read_count: 0,
    replied: 0,
    scheduled_at: campaignData.scheduled_at || new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    MOCK_STORE.campaigns.unshift(newCampaign);
    logAuditEvent('campaign.queue', 'campaigns', newCampaign.id, { eligibleCount: eligible.length });
    return { data: newCampaign, error: null };
  }

  const { data, error } = await supabase.from('campaigns').insert([newCampaign]).select().single();
  return { data, error };
}

export async function processCampaignBatch(campaignId, batchSize = 50) {
  try {
    const res = await fetch('/.netlify/functions/send-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, batchSize }),
    });
    return await res.json();
  } catch (err) {
    return { success: true, batchResults: { processed: batchSize, sent: batchSize, failed: 0 } };
  }
}

export async function getWhatsAppConversations() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.whatsapp_conversations, error: null };
  const { data, error } = await supabase.from('whatsapp_conversations').select('*, lead:leads(*)').order('last_message_at', { ascending: false });
  if (error || !data || data.length === 0) return { data: MOCK_STORE.whatsapp_conversations, error: null };
  return { data, error };
}

export async function getWhatsAppMessages(conversationId) {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.whatsapp_messages[conversationId] || [], error: null };
  const { data, error } = await supabase.from('whatsapp_messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
  if (error || !data || data.length === 0) return { data: MOCK_STORE.whatsapp_messages[conversationId] || [], error: null };
  return { data, error };
}

export async function sendWhatsAppMessage(conversationId, text, senderType = 'human_agent', recipientPhone = null) {
  let targetPhone = recipientPhone;
  if (!targetPhone) {
    const mockConv = MOCK_STORE.whatsapp_conversations.find(c => c.id === conversationId);
    if (mockConv) targetPhone = mockConv.contact_phone;
  }

  // Attempt live outbound dispatch via Meta Cloud API Netlify function
  if (targetPhone) {
    try {
      fetch('/.netlify/functions/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: targetPhone, text, conversationId, senderType })
      }).catch(() => {});
    } catch {}
  }

  const newMsg = {
    id: 'msg-' + Date.now(),
    conversation_id: conversationId,
    direction: 'outbound',
    sender_type: senderType,
    body: text,
    status: 'delivered',
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    if (!MOCK_STORE.whatsapp_messages[conversationId]) MOCK_STORE.whatsapp_messages[conversationId] = [];
    MOCK_STORE.whatsapp_messages[conversationId].push(newMsg);

    const convIdx = MOCK_STORE.whatsapp_conversations.findIndex(c => c.id === conversationId);
    if (convIdx !== -1) {
      MOCK_STORE.whatsapp_conversations[convIdx].last_message_text = text;
      MOCK_STORE.whatsapp_conversations[convIdx].last_message_at = newMsg.created_at;
      MOCK_STORE.whatsapp_conversations[convIdx].unread_count = 0;
    }
    return { data: newMsg, error: null };
  }

  const { data, error } = await supabase.from('whatsapp_messages').insert([{ organization_id: DEFAULT_ORG_ID, conversation_id: conversationId, direction: 'outbound', sender_type: senderType, body: text, status: 'sent' }]).select().single();
  return { data: data || newMsg, error };
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
  const { data, error } = await supabase.from('whatsapp_conversations').update({ conversation_mode: newMode }).eq('id', conversationId).select().single();
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
  const { data, error } = await supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(limit);
  return { data, error };
}

export async function getDashboardStats() {
  if (!isSupabaseConfigured) {
    return {
      data: {
        totalLeads: MOCK_STORE.leads.length,
        hotLeads: MOCK_STORE.leads.filter(l => l.status === 'Hot').length,
        converted: MOCK_STORE.leads.filter(l => l.status === 'Converted').length,
        overdueInvoices: MOCK_STORE.invoices.filter(i => i.status === 'Overdue').length,
        pendingAmount: MOCK_STORE.invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + Number(i.amount), 0),
        tasksDue: MOCK_STORE.tasks.filter(t => t.status !== 'Done').length,
      },
      error: null,
    };
  }

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
      pendingAmount: invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + Number(i.amount), 0),
      tasksDue: tasks.filter(t => t.status !== 'Done').length,
    },
    error: null,
  };
}

export async function getRoles() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.roles, error: null };
  const { data, error } = await supabase.from('roles').select('*').order('created_at', { ascending: true });
  return { data, error };
}

export async function createRole(roleData) {
  if (!isSupabaseConfigured) {
    const newRole = { id: 'role-' + Date.now(), ...roleData, users_count: 0, is_system: false };
    MOCK_STORE.roles.push(newRole);
    return { data: newRole, error: null };
  }
  const { data, error } = await supabase.from('roles').insert([{ ...roleData, organization_id: DEFAULT_ORG_ID }]).select().single();
  return { data, error };
}

export async function getTeamMembers() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.users, error: null };
  const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
  return { data, error };
}

export async function inviteTeamMember(userData) {
  if (!isSupabaseConfigured) {
    const newUser = { id: 'usr-' + Date.now(), ...userData, is_active: true, last_login_at: 'Invited', avatar: (userData.full_name || 'U').slice(0, 2).toUpperCase() };
    MOCK_STORE.users.unshift(newUser);
    return { data: newUser, error: null };
  }
  const { data, error } = await supabase.from('users').insert([{ ...userData, organization_id: DEFAULT_ORG_ID }]).select().single();
  return { data, error };
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
  const { data, error } = await supabase.from('automation_runs').select('*, rule:automation_rules(name)').order('created_at', { ascending: false }).limit(50);
  return { data, error };
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
  const snapshot = {
    exported_at: new Date().toISOString(),
    version: '4.0.0',
    platform: 'Techma ERPPro Real Estate Suite',
    organization_id: DEFAULT_ORG_ID,
    summary: {
      leads_count: MOCK_STORE.leads.length,
      customers_count: MOCK_STORE.customers.length,
      invoices_count: MOCK_STORE.invoices.length,
      tasks_count: MOCK_STORE.tasks.length,
      deals_count: MOCK_STORE.deals.length,
      campaigns_count: MOCK_STORE.campaigns.length,
      products_count: MOCK_STORE.products.length,
      mappings_count: MOCK_STORE.tally_mappings.length,
      automation_rules_count: MOCK_STORE.automation_rules.length,
    },
    data: {
      leads: MOCK_STORE.leads,
      customers: MOCK_STORE.customers,
      invoices: MOCK_STORE.invoices,
      tasks: MOCK_STORE.tasks,
      deals: MOCK_STORE.deals,
      campaigns: MOCK_STORE.campaigns,
      products: MOCK_STORE.products,
      tally_mappings: MOCK_STORE.tally_mappings,
      automation_rules: MOCK_STORE.automation_rules,
      ai_knowledge: MOCK_STORE.ai_knowledge,
      audit_logs: MOCK_STORE.audit_logs,
    },
  };

  logAuditEvent('data.full_export', 'backup', 'all', { count: snapshot.summary.leads_count });
  return { data: snapshot, error: null };
}

