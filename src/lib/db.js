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
      assigned_salesperson: 'Unassigned',
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
      assigned_salesperson: 'Unassigned',
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
    'conv-2': [
      { id: 'm-6', direction: 'inbound', sender_type: 'customer', body: 'Hello! What time is the Thane site office open tomorrow?', status: 'delivered', created_at: new Date(Date.now() - 3600000 * 2.2).toISOString() },
      { id: 'm-7', direction: 'outbound', sender_type: 'ai', body: 'Site visits are open Mon–Sun from 10 AM to 6 PM. Can I book a slot for you?', status: 'sent', created_at: new Date(Date.now() - 3600000 * 2).toISOString() },
    ],
    'conv-3': [
      { id: 'm-8', direction: 'inbound', sender_type: 'customer', body: 'Please send pricing for 2BHK Borivali project.', status: 'read', created_at: new Date(Date.now() - 3600000 * 25).toISOString() },
      { id: 'm-9', direction: 'outbound', sender_type: 'ai', body: 'Our 2BHK units start at ₹50L. Would you like a complete price list?', status: 'read', created_at: new Date(Date.now() - 3600000 * 24).toISOString() },
    ],
    'conv-4': [
      { id: 'm-10', direction: 'inbound', sender_type: 'customer', body: 'Can someone share the exact location pin of the Lonavala Villa project?', status: 'delivered', created_at: new Date(Date.now() - 3600000 * 1).toISOString() },
    ],
  },
  products: [
    { id: 'prod-1', name: '3BHK Luxury Residence - Andheri', category: 'Residential', sku: 'PROP-3BHK-AND', unit_price: 9500000, unit_of_measure: 'unit', brochure_url: 'https://example.com/3bhk-andheri.pdf', is_active: true, description: 'Super built-up 1,450 sq.ft with panoramic skyline views.' },
    { id: 'prod-2', name: '2BHK Prime Apartment - Borivali', category: 'Residential', sku: 'PROP-2BHK-BOR', unit_price: 6200000, unit_of_measure: 'unit', brochure_url: 'https://example.com/2bhk-borivali.pdf', is_active: true, description: 'Spacious 950 sq.ft close to Western Express Highway.' },
    { id: 'prod-3', name: 'Weekend Villa - Lonavala Hills', category: 'Luxury Villa', sku: 'PROP-VIL-LON', unit_price: 21000000, unit_of_measure: 'unit', brochure_url: 'https://example.com/villa-lonavala.pdf', is_active: true, description: '4BHK standalone hillside villa with private pool.' },
    { id: 'prod-4', name: 'Commercial Retail Space - BKC', category: 'Commercial', sku: 'PROP-COM-BKC', unit_price: 35000000, unit_of_measure: 'unit', brochure_url: 'https://example.com/retail-bkc.pdf', is_active: true, description: 'Ground floor 2,200 sq.ft high footfall retail space.' },
  ],
  deals: [
    { id: 'deal-1', lead_id: 'lead-1', title: 'Ravi Mehta - 3BHK Andheri Unit 804', stage: 'Negotiation', value: 9200000, expected_close_date: '2026-08-30', assigned_to: 'Rajesh Kumar' },
    { id: 'deal-2', lead_id: 'lead-4', title: 'Priya Kapoor - 2BHK Goregaon Unit 302', stage: 'Won', value: 5500000, expected_close_date: '2026-08-15', assigned_to: 'Priya Sharma' },
    { id: 'deal-3', lead_id: 'lead-5', title: 'Kavita Joshi - 2BHK Thane Unit 1102', stage: 'Quotation', value: 5850000, expected_close_date: '2026-09-10', assigned_to: 'Rajesh Kumar' },
  ],
  quotations: [
    { id: 'quot-1', lead_id: 'lead-1', quotation_number: 'QUOT-2026-001', total_amount: 9200000, status: 'Sent', valid_until: '2026-08-31', created_at: new Date().toISOString() },
    { id: 'quot-2', lead_id: 'lead-5', quotation_number: 'QUOT-2026-002', total_amount: 5850000, status: 'Approved', valid_until: '2026-09-05', created_at: new Date().toISOString() },
  ],
  tasks: [
    { id: 'task-1', lead_id: 'lead-1', title: 'Call Ravi Mehta for site visit confirmation', status: 'To Do', priority: 'High', due_date: new Date().toISOString().split('T')[0], tags: ['CRM'], created_at: new Date().toISOString() },
    { id: 'task-2', lead_id: 'lead-4', title: 'Prepare agreement draft for Priya Kapoor', status: 'In Progress', priority: 'High', due_date: new Date().toISOString().split('T')[0], tags: ['Finance'], created_at: new Date().toISOString() },
    { id: 'task-3', lead_id: null, title: 'Send WhatsApp broadcast to August leads', status: 'To Do', priority: 'Medium', due_date: new Date().toISOString().split('T')[0], tags: ['WhatsApp'], created_at: new Date().toISOString() },
    { id: 'task-4', lead_id: null, title: 'Sync Tally invoices for July', status: 'Done', priority: 'Medium', due_date: new Date().toISOString().split('T')[0], tags: ['Finance'], created_at: new Date().toISOString() },
  ],
  invoices: [
    { id: 'inv-1', invoice_number: 'INV-2026-041', client_name: 'Ravi Mehta', client_phone: '+919876543210', amount: 250000, status: 'Overdue', due_date: new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0], reminder_count: 2 },
    { id: 'inv-2', invoice_number: 'INV-2026-045', client_name: 'Priya Kapoor', client_phone: '+916543210987', amount: 450000, status: 'Pending', due_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0], reminder_count: 0 },
    { id: 'inv-3', invoice_number: 'INV-2026-032', client_name: 'Kavita Joshi', client_phone: '+914321098765', amount: 50000, status: 'Paid', due_date: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0], reminder_count: 1 },
    { id: 'inv-4', invoice_number: 'INV-2026-048', client_name: 'Arjun Sharma', client_phone: '+917654321098', amount: 1000000, status: 'Overdue', due_date: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0], reminder_count: 4 },
  ],
  campaigns: [
    { id: 'camp-1', name: 'Diwali Property Offer 2026', status: 'Completed', template_name: 'Festival Discount', total_targeted: 250, total_sent: 248, delivered: 241, read_count: 198, replied: 34, created_at: new Date().toISOString() },
    { id: 'camp-2', name: '3BHK New Launch – Andheri', status: 'Running', template_name: 'Product Launch', total_targeted: 90, total_sent: 85, delivered: 82, read_count: 67, replied: 12, created_at: new Date().toISOString() },
  ],
  activities: [
    { id: 'act-1', lead_id: 'lead-1', type: 'lead', title: 'Lead created via WhatsApp', subtitle: '3BHK inquiry — ₹80L budget', created_at: new Date(Date.now() - 3600000 * 48).toISOString() },
    { id: 'act-2', lead_id: 'lead-1', type: 'ai', title: 'AI Qualified: HOT Lead', subtitle: 'Intent: Buying interest, Objection: Price negotiation', created_at: new Date(Date.now() - 3600000 * 24).toISOString() },
    { id: 'act-3', lead_id: 'lead-1', type: 'deal', title: 'Deal created: ₹92,00,000', subtitle: 'Unit 804 in Negotiation stage', created_at: new Date(Date.now() - 3600000 * 12).toISOString() },
    { id: 'act-4', lead_id: 'lead-1', type: 'payment', title: 'Tally invoice INV-2026-041 (₹2.5L) Overdue', subtitle: '14 days overdue — WhatsApp reminder sent', created_at: new Date(Date.now() - 3600000 * 2).toISOString() },
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
// CAMPAIGN ENGINE, SEGMENTATION & QUEUES (Section 13, 14, 15)
// ─────────────────────────────────────────────────────────────────────────────
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

  const { data, error } = await supabase
    .from('campaigns')
    .insert([newCampaign])
    .select()
    .single();

  if (data && eligible.length > 0) {
    // Insert into campaign_recipients table
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
    // Fallback simulation
    return { success: true, batchResults: { processed: batchSize, sent: batchSize, failed: 0 } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP LIVE INBOX & CONVERSATION SERVICES (Section 11, 12, 50A, 50B)
// ─────────────────────────────────────────────────────────────────────────────
export async function getWhatsAppConversations() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.whatsapp_conversations, error: null };
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('*, lead:leads(*)')
    .order('last_message_at', { ascending: false });
  return { data, error };
}

export async function getWhatsAppMessages(conversationId) {
  if (!isSupabaseConfigured) {
    const msgs = MOCK_STORE.whatsapp_messages[conversationId] || [];
    return { data: msgs, error: null };
  }
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
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
    if (!MOCK_STORE.whatsapp_messages[conversationId]) {
      MOCK_STORE.whatsapp_messages[conversationId] = [];
    }
    MOCK_STORE.whatsapp_messages[conversationId].push(newMsg);

    const convIdx = MOCK_STORE.whatsapp_conversations.findIndex(c => c.id === conversationId);
    if (convIdx !== -1) {
      MOCK_STORE.whatsapp_conversations[convIdx].last_message_text = text;
      MOCK_STORE.whatsapp_conversations[convIdx].last_message_at = newMsg.created_at;
      MOCK_STORE.whatsapp_conversations[convIdx].unread_count = 0;
    }

    logAuditEvent('whatsapp.send', 'whatsapp_messages', newMsg.id, { text, senderType });
    return { data: newMsg, error: null };
  }

  const { data, error } = await supabase
    .from('whatsapp_messages')
    .insert([{
      organization_id: DEFAULT_ORG_ID,
      conversation_id: conversationId,
      direction: 'outbound',
      sender_type: senderType,
      body: text,
      status: 'sent',
    }])
    .select()
    .single();

  if (data) {
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_text: text,
        last_message_at: new Date().toISOString(),
        unread_count: 0,
      })
      .eq('id', conversationId);

    logAuditEvent('whatsapp.send', 'whatsapp_messages', data.id, { text, senderType });
  }

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

  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .update({ conversation_mode: newMode })
    .eq('id', conversationId)
    .select()
    .single();

  if (data) logAuditEvent('whatsapp.mode_change', 'whatsapp_conversations', conversationId, { mode: newMode });
  return { data, error };
}

export async function toggleLeadOptOut(leadId, optOut, reason = 'Admin manual toggle') {
  if (!isSupabaseConfigured) {
    const lead = MOCK_STORE.leads.find(l => l.id === leadId);
    if (lead) {
      lead.marketing_opt_out = optOut;
      lead.marketing_opt_out_at = optOut ? new Date().toISOString() : null;
      lead.opt_out_reason = optOut ? reason : null;
      logAuditEvent('lead.opt_out_toggle', 'leads', leadId, { optOut, reason });
      return { data: lead, error: null };
    }
    return { data: null, error: { message: 'Lead not found' } };
  }

  const { data, error } = await supabase
    .from('leads')
    .update({
      marketing_opt_out: optOut,
      marketing_opt_out_at: optOut ? new Date().toISOString() : null,
      opt_out_reason: optOut ? reason : null,
    })
    .eq('id', leadId)
    .select()
    .single();

  if (data) logAuditEvent('lead.opt_out_toggle', 'leads', leadId, { optOut, reason });
  return { data, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER 360 COMPREHENSIVE AGGREGATOR (Section 10)
// ─────────────────────────────────────────────────────────────────────────────
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
        financials: {
          totalOutstanding,
          totalPaid,
          invoiceCount: invoices.length,
        },
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
      financials: {
        totalOutstanding,
        totalPaid,
        invoiceCount: invoices.length,
      },
    },
    error: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT CATALOG SERVICES
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// DEALS & PIPELINE
// ─────────────────────────────────────────────────────────────────────────────
export async function getDeals() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.deals, error: null };
  const { data, error } = await supabase.from('deals').select('*').order('created_at', { ascending: false });
  return { data, error };
}

export async function createDeal(dealData) {
  if (!isSupabaseConfigured) {
    const newDeal = { id: 'deal-' + Date.now(), ...dealData, created_at: new Date().toISOString() };
    MOCK_STORE.deals.unshift(newDeal);
    if (dealData.lead_id) {
      MOCK_STORE.activities.unshift({
        id: 'act-' + Date.now(),
        lead_id: dealData.lead_id,
        type: 'deal',
        title: `Deal created: ₹${Number(dealData.value || 0).toLocaleString('en-IN')}`,
        subtitle: dealData.title,
        created_at: new Date().toISOString(),
      });
    }
    logAuditEvent('deal.create', 'deals', newDeal.id, newDeal);
    return { data: newDeal, error: null };
  }
  const { data, error } = await supabase.from('deals').insert([{ ...dealData, organization_id: DEFAULT_ORG_ID }]).select().single();
  if (data) logAuditEvent('deal.create', 'deals', data.id, data);
  return { data, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADS & CRM
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
    MOCK_STORE.activities.unshift({
      id: 'act-' + Date.now(),
      lead_id: newLead.id,
      type: 'lead',
      title: `Lead added: ${newLead.name}`,
      subtitle: `${newLead.property_interest || 'General'} · ${newLead.source}`,
      created_at: new Date().toISOString(),
    });
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

// ─────────────────────────────────────────────────────────────────────────────
// TASKS, FINANCE, CAMPAIGNS & ROLES
// ─────────────────────────────────────────────────────────────────────────────
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

export async function getChatbotRules() {
  if (!isSupabaseConfigured) {
    return {
      data: [
        { id: 1, keywords: ['price', 'cost', 'rate', 'budget'], response: 'Our 2BHK units start at ₹50L and 3BHK units start at ₹80L. Would you like a complete price list?', is_active: true },
        { id: 2, keywords: ['visit', 'site visit', 'location', 'where'], response: 'Site visits are open Mon–Sun from 10 AM to 6 PM. Can I book a slot for you this weekend?', is_active: true },
        { id: 3, keywords: ['brochure', 'floor plan', 'pdf', 'catalog'], response: 'Sure! I am sending our latest brochure and floor plans to this WhatsApp number right away.', is_active: true },
        { id: 4, keywords: ['agent', 'call', 'human', 'talk', 'sales'], response: 'I am connecting you with our Senior Sales Executive immediately. One moment please!', is_active: true },
      ],
      error: null,
    };
  }
  const { data, error } = await supabase.from('ai_knowledge').select('*').eq('status', 'active').order('created_at', { ascending: false });
  return { data, error };
}

export function matchChatbotRule(rules, message) {
  const lower = (message || '').toLowerCase();
  for (const rule of rules) {
    if (rule.keywords && rule.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return rule.response;
    }
  }
  return '😊 Thanks for reaching out! Our sales team will get back to you shortly.\n\nFor immediate assistance, call us at +91 98765 43210.';
}
