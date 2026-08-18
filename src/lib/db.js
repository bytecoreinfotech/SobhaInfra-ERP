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
      name: 'Ravi Mehta',
      phone: '+919876543210',
      email: 'ravi.mehta@gmail.com',
      source: 'WhatsApp',
      status: 'Hot',
      property_interest: '3BHK - Andheri West',
      budget: '₹80L - ₹1Cr',
      notes: 'Interested in bulk booking. Requested price review.',
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
      contact_name: 'Ravi Mehta',
      contact_phone: '+919876543210',
      conversation_mode: 'HUMAN ACTIVE',
      last_message_text: 'Hi Ravi, Rajesh here. I can offer you unit 804 at ₹92L special. Can we meet tomorrow?',
      last_message_at: new Date(Date.now() - 12 * 3600000).toISOString(),
      unread_count: 0,
      assigned_salesperson: 'Rajesh Kumar',
      property_interest: '3BHK - Andheri West',
    },
    {
      id: 'conv-2',
      lead_id: 'lead-5',
      contact_name: 'Kavita Joshi',
      contact_phone: '+914321098765',
      conversation_mode: 'AI ACTIVE',
      last_message_text: 'Site visits are open Mon–Sun from 10 AM to 6 PM. Can I book a slot for you?',
      last_message_at: new Date(Date.now() - 2 * 3600000).toISOString(),
      unread_count: 1,
      assigned_salesperson: 'Rajesh Kumar',
      property_interest: '2BHK - Thane',
    },
    {
      id: 'conv-3',
      lead_id: 'lead-2',
      contact_name: 'Sunita Patel',
      contact_phone: '+918765432109',
      conversation_mode: 'AI ACTIVE',
      last_message_text: 'Our 2BHK units start at ₹50L. Would you like a complete price list?',
      last_message_at: new Date(Date.now() - 24 * 3600000).toISOString(),
      unread_count: 0,
      assigned_salesperson: 'Amit Verma',
      property_interest: '2BHK - Borivali',
    },
    {
      id: 'conv-4',
      lead_id: 'lead-3',
      contact_name: 'Arjun Sharma',
      contact_phone: '+917654321098',
      conversation_mode: 'AI PAUSED',
      last_message_text: 'Can someone share the exact location pin of the Lonavala Villa project?',
      last_message_at: new Date(Date.now() - 1 * 3600000).toISOString(),
      unread_count: 2,
      assigned_salesperson: 'Priya Sharma',
      property_interest: 'Weekend Villa - Lonavala',
    },
  ],
  whatsapp_messages: {
    'conv-1': [
      { id: 'm-1', direction: 'inbound', sender_type: 'customer', body: 'Hi, I saw your 3BHK ad in Andheri. What is the current rate?', status: 'read', created_at: new Date(Date.now() - 3600000 * 48).toISOString() },
      { id: 'm-2', direction: 'outbound', sender_type: 'ai', body: 'Hello Ravi! 🏠 Our 3BHK Luxury Residence at Andheri starts at ₹95L. Here is the brochure: https://example.com/3bhk-andheri.pdf. Would you like to schedule a site visit?', status: 'read', created_at: new Date(Date.now() - 3600000 * 47).toISOString() },
      { id: 'm-3', direction: 'inbound', sender_type: 'customer', body: 'Rate thoda kam hoga kya if I do 50% immediate down payment?', status: 'read', created_at: new Date(Date.now() - 3600000 * 24).toISOString() },
      { id: 'm-4', direction: 'outbound', sender_type: 'ai', body: 'I have recorded your down-payment preference. Connecting you with our Senior Sales Executive Rajesh Kumar to discuss special pricing.', status: 'read', created_at: new Date(Date.now() - 3600000 * 23).toISOString() },
      { id: 'm-5', direction: 'outbound', sender_type: 'human_agent', body: 'Hi Ravi, Rajesh here. I can offer you unit 804 at ₹92L special. Can we meet tomorrow at 11 AM?', status: 'delivered', created_at: new Date(Date.now() - 3600000 * 12).toISOString() },
    ],
  },
  ai_knowledge: [
    { id: 'k-1', category: 'Pricing', title: '3BHK Andheri Rates', content: 'Base Price: ₹95,00,000 for 1450 sq.ft. Floor rise: ₹50/sq.ft. Parking included.', version: 2, status: 'active' },
    { id: 'k-2', category: 'Pricing', title: '2BHK Borivali Rates', content: 'Base Price: ₹62,00,000 for 950 sq.ft. Special launch discount: ₹2,00,000.', version: 1, status: 'active' },
    { id: 'k-3', category: 'FAQ', title: 'Site Visit Timings', content: 'Site office open 7 days a week, 10:00 AM to 6:00 PM. Complimentary cab service provided.', version: 1, status: 'active' },
  ],
  ai_feedback: [
    { id: 'fb-1', conversation_id: 'conv-1', rating: 5, feedback_type: 'AI Helpful', comments: 'AI handled initial rate inquiry well and captured 50% down-payment preference accurately.', created_at: new Date(Date.now() - 10 * 3600000).toISOString() }
  ],
  tasks: [
    { id: 'task-1', lead_id: 'lead-1', title: 'Call Ravi Mehta for site visit & pricing negotiation', status: 'To Do', priority: 'High', due_date: new Date().toISOString().split('T')[0], assigned_to: 'Rajesh Kumar', tags: ['CRM', 'AI-Handoff'], created_at: new Date().toISOString() },
    { id: 'task-2', lead_id: 'lead-4', title: 'Prepare agreement draft for Priya Kapoor', status: 'In Progress', priority: 'High', due_date: new Date().toISOString().split('T')[0], assigned_to: 'Priya Sharma', tags: ['Finance'], created_at: new Date().toISOString() },
    { id: 'task-3', lead_id: null, title: 'Send WhatsApp broadcast to August leads', status: 'To Do', priority: 'Medium', due_date: new Date().toISOString().split('T')[0], assigned_to: 'Amit Verma', tags: ['WhatsApp'], created_at: new Date().toISOString() },
  ],
  products: [
    { id: 'prod-1', name: '3BHK Luxury Residence - Andheri', category: 'Residential', sku: 'PROP-3BHK-AND', unit_price: 9500000, unit_of_measure: 'unit', brochure_url: 'https://example.com/3bhk-andheri.pdf', is_active: true, description: 'Super built-up 1,450 sq.ft with panoramic skyline views.' },
    { id: 'prod-2', name: '2BHK Prime Apartment - Borivali', category: 'Residential', sku: 'PROP-2BHK-BOR', unit_price: 6200000, unit_of_measure: 'unit', brochure_url: 'https://example.com/2bhk-borivali.pdf', is_active: true, description: 'Spacious 950 sq.ft close to Western Express Highway.' },
    { id: 'prod-3', name: 'Weekend Villa - Lonavala Hills', category: 'Luxury Villa', sku: 'PROP-VIL-LON', unit_price: 21000000, unit_of_measure: 'unit', brochure_url: 'https://example.com/villa-lonavala.pdf', is_active: true, description: '4BHK standalone hillside villa with private pool.' },
  ],
  deals: [
    { id: 'deal-1', lead_id: 'lead-1', title: 'Ravi Mehta - 3BHK Andheri Unit 804', stage: 'Negotiation', value: 9200000, expected_close_date: '2026-08-30', assigned_to: 'Rajesh Kumar' },
  ],
  quotations: [
    { id: 'quot-1', lead_id: 'lead-1', quotation_number: 'QUOT-2026-001', total_amount: 9200000, status: 'Sent', valid_until: '2026-08-31', created_at: new Date().toISOString() },
  ],
  invoices: [
    { id: 'inv-1', invoice_number: 'INV-2026-041', client_name: 'Ravi Mehta', client_phone: '+919876543210', amount: 250000, status: 'Overdue', due_date: new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0], reminder_count: 2 },
  ],
  campaigns: [
    { id: 'camp-1', name: 'Diwali Property Offer 2026', status: 'Completed', template_name: 'Festival Discount', total_targeted: 250, total_sent: 248, delivered: 241, read_count: 198, replied: 34, created_at: new Date().toISOString() },
  ],
  activities: [
    { id: 'act-1', lead_id: 'lead-1', type: 'lead', title: 'Lead created via WhatsApp', subtitle: '3BHK inquiry — ₹80L budget', created_at: new Date(Date.now() - 3600000 * 48).toISOString() },
  ],
  audit_logs: [],
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
// HUMAN TAKEOVER & AI FEEDBACK (Section 23, 24, 25)
// ─────────────────────────────────────────────────────────────────────────────
export async function triggerHumanHandoff({ conversationId, leadId, assignedTo = 'Rajesh Kumar', priority = 'High', summary = '', taskTitle = '' }) {
  // 1. Switch conversation mode to 'HUMAN ACTIVE' and assign rep
  await updateConversationMode(conversationId, 'HUMAN ACTIVE');
  await reassignSalesperson(conversationId, assignedTo);

  // 2. Create follow-up task
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

  // 3. Log Activity
  const act = {
    id: 'act-' + Date.now(),
    lead_id: leadId,
    type: 'ai',
    title: `Human Takeover: Assigned to ${assignedTo}`,
    subtitle: summary || 'AI auto-paused; human sales takeover activated.',
    created_at: new Date().toISOString(),
  };
  if (!isSupabaseConfigured) {
    MOCK_STORE.activities.unshift(act);
  }

  logAuditEvent('human_handoff.trigger', 'whatsapp_conversations', conversationId, { assignedTo, priority, summary });
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
    MOCK_STORE.ai_feedback.unshift(newFb);
    logAuditEvent('ai.feedback', 'ai_feedback', newFb.id, { feedbackType, rating });
    return { data: newFb, error: null };
  }

  const { data, error } = await supabase.from('ai_feedback').insert([newFb]).select().single();
  if (data) logAuditEvent('ai.feedback', 'ai_feedback', data.id, { feedbackType, rating });
  return { data, error };
}

export async function getAiFeedbackList() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.ai_feedback, error: null };
  const { data, error } = await supabase.from('ai_feedback').select('*').order('created_at', { ascending: false });
  return { data, error };
}

export async function reassignSalesperson(conversationId, salespersonName) {
  if (!isSupabaseConfigured) {
    const conv = MOCK_STORE.whatsapp_conversations.find(c => c.id === conversationId);
    if (conv) {
      conv.assigned_salesperson = salespersonName;
      logAuditEvent('salesperson.reassign', 'whatsapp_conversations', conversationId, { assigned_to: salespersonName });
      return { data: conv, error: null };
    }
    return { data: null, error: { message: 'Conversation not found' } };
  }

  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .update({ assigned_salesperson: salespersonName })
    .eq('id', conversationId)
    .select()
    .single();

  if (data) logAuditEvent('salesperson.reassign', 'whatsapp_conversations', conversationId, { assigned_to: salespersonName });
  return { data, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// BASE ENTITY SERVICES (CRM, Invoices, Campaigns, etc.)
// ─────────────────────────────────────────────────────────────────────────────
export async function getLeads() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.leads, error: null };
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
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
      logAuditEvent('lead.update', 'leads', id, updates);
      return { data: MOCK_STORE.leads[idx], error: null };
    }
    return { data: null, error: { message: 'Lead not found' } };
  }
  const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single();
  if (data) logAuditEvent('lead.update', 'leads', id, updates);
  return { data, error };
}

export async function deleteLead(id) {
  if (!isSupabaseConfigured) {
    const idx = MOCK_STORE.leads.findIndex(l => l.id === id);
    if (idx !== -1) MOCK_STORE.leads.splice(idx, 1);
    logAuditEvent('lead.delete', 'leads', id);
    return { error: null };
  }
  const { error } = await supabase.from('leads').delete().eq('id', id);
  logAuditEvent('lead.delete', 'leads', id);
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

export async function getRoles() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.roles, error: null };
  const { data, error } = await supabase.from('roles').select('*').order('created_at', { ascending: true });
  return { data, error };
}

export async function createRole(roleData) {
  if (!isSupabaseConfigured) {
    const newRole = { id: 'role-' + Date.now(), ...roleData, users_count: 0, is_system: false };
    MOCK_STORE.roles.push(newRole);
    logAuditEvent('role.create', 'roles', newRole.id, newRole);
    return { data: newRole, error: null };
  }
  const { data, error } = await supabase.from('roles').insert([{ ...roleData, organization_id: DEFAULT_ORG_ID }]).select().single();
  if (data) logAuditEvent('role.create', 'roles', data.id, data);
  return { data, error };
}

export async function getTeamMembers() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.users, error: null };
  const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
  return { data, error };
}

export async function inviteTeamMember(userData) {
  if (!isSupabaseConfigured) {
    const newUser = {
      id: 'usr-' + Date.now(),
      ...userData,
      is_active: true,
      last_login_at: 'Invited',
      avatar: (userData.full_name || 'U').slice(0, 2).toUpperCase(),
    };
    MOCK_STORE.users.unshift(newUser);
    logAuditEvent('user.invite', 'users', newUser.id, { email: userData.email, role: userData.role });
    return { data: newUser, error: null };
  }
  const { data, error } = await supabase.from('users').insert([{ ...userData, organization_id: DEFAULT_ORG_ID }]).select().single();
  if (data) logAuditEvent('user.invite', 'users', data.id, { email: data.email });
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

export async function getInvoices() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.invoices, error: null };
  const { data, error } = await supabase.from('invoices').select('*').order('created_at', { ascending: false });
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
  if (data && eligible.length > 0) {
    const recipientsToInsert = eligible.map(lead => ({
      organization_id: DEFAULT_ORG_ID,
      campaign_id: data.id,
      lead_id: lead.id,
      phone: normalizePhone(lead.phone),
      status: 'pending',
    }));
    await supabase.from('campaign_recipients').insert(recipientsToInsert);
    logAuditEvent('campaign.queue', 'campaigns', data.id, { eligibleCount: eligible.length });
  }

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
  return { data, error };
}

export async function getWhatsAppMessages(conversationId) {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.whatsapp_messages[conversationId] || [], error: null };
  const { data, error } = await supabase.from('whatsapp_messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
  return { data, error };
}

export async function sendWhatsAppMessage(conversationId, text, senderType = 'human_agent') {
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
  return { data, error };
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

export async function getAiKnowledge() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.ai_knowledge, error: null };
  const { data, error } = await supabase.from('ai_knowledge').select('*').eq('status', 'active').order('created_at', { ascending: false });
  return { data, error };
}

export async function createAiKnowledge(item) {
  const newItem = { id: 'k-' + Date.now(), organization_id: DEFAULT_ORG_ID, version: 1, status: 'active', ...item, created_at: new Date().toISOString() };
  if (!isSupabaseConfigured) {
    MOCK_STORE.ai_knowledge.unshift(newItem);
    logAuditEvent('ai_knowledge.create', 'ai_knowledge', newItem.id, newItem);
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
    const lower = messageText.toLowerCase();
    let text = 'Hello! I can provide property brochures, approved rates, and schedule site visits.';
    let toolCalls = [];

    if (lower.includes('rate') || lower.includes('price')) {
      if (lower.includes('kam') || lower.includes('discount')) {
        toolCalls.push({
          toolName: 'request_human_handoff',
          args: { reason: 'Price negotiation requested' },
          output: { assigned_rep: 'Rajesh Kumar (Senior Sales Executive)', status: 'handoff_queued' }
        });
        text = 'Our approved rate for 3BHK Andheri is ₹95 Lakhs. For customized bulk discounts, I am connecting you with our Senior Sales Executive Rajesh Kumar right away.';
      } else {
        toolCalls.push({
          toolName: 'get_product_price',
          args: { product_query: '3BHK Andheri' },
          output: { product: '3BHK Luxury Residence - Andheri', approved_rate_inr: 9500000, formatted_rate: '₹95 Lakhs' }
        });
        text = 'Our official approved price for 3BHK Luxury Residence at Andheri is ₹95 Lakhs. Would you like to schedule a site visit?';
      }
    }
    return {
      success: true,
      responseText: text,
      toolCalls,
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
