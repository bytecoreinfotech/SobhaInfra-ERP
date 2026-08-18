/**
 * Techma ERPPro Centralized Data Service
 * Implements Multi-Tenant Data Layer conforming to Master Spec v4.0.
 * Supports offline demo fallback and live Supabase PostgreSQL connection with RLS.
 */
import { supabase, isSupabaseConfigured } from './supabase';

export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL IN-MEMORY MOCK STORE (Used when Supabase is offline or not configured)
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
    { id: 'lead-1', name: 'Ravi Mehta', phone: '+91 98765 43210', email: 'ravi.mehta@gmail.com', source: 'WhatsApp', status: 'Hot', property_interest: '3BHK - Andheri West', budget: '₹80L - ₹1Cr', notes: 'Interested in bulk rate. Price objection noted.', lead_score: 85, created_at: new Date().toISOString() },
    { id: 'lead-2', name: 'Sunita Patel', phone: '+91 87654 32109', email: 'sunita.p@yahoo.com', source: 'Facebook', status: 'Warm', property_interest: '2BHK - Borivali', budget: '₹50L - ₹65L', notes: 'Budget constraints', lead_score: 55, created_at: new Date().toISOString() },
    { id: 'lead-3', name: 'Arjun Sharma', phone: '+91 76543 21098', email: null, source: 'Instagram', status: 'New', property_interest: 'Villa - Lonavala', budget: '₹2Cr+', notes: 'Weekend home inquiry', lead_score: 30, created_at: new Date().toISOString() },
    { id: 'lead-4', name: 'Priya Kapoor', phone: '+91 65432 10987', email: 'priya.k@outlook.com', source: 'Referral', status: 'Converted', property_interest: '2BHK - Goregaon', budget: '₹55L', notes: 'Booking advance cleared', lead_score: 100, created_at: new Date().toISOString() },
    { id: 'lead-5', name: 'Kavita Joshi', phone: '+91 43210 98765', email: null, source: 'WhatsApp', status: 'Hot', property_interest: '2BHK - Thane', budget: '₹60L', notes: 'Ready to book this month', lead_score: 80, created_at: new Date().toISOString() },
  ],
  products: [
    { id: 'prod-1', name: '3BHK Luxury Residence - Andheri', sku: 'PROP-3BHK-AND', unit_price: 9500000, brochure_url: 'https://example.com/3bhk-andheri.pdf', is_active: true },
    { id: 'prod-2', name: '2BHK Prime Apartment - Borivali', sku: 'PROP-2BHK-BOR', unit_price: 6200000, brochure_url: 'https://example.com/2bhk-borivali.pdf', is_active: true },
    { id: 'prod-3', name: 'Weekend Villa - Lonavala Hills', sku: 'PROP-VIL-LON', unit_price: 21000000, brochure_url: 'https://example.com/villa-lonavala.pdf', is_active: true },
  ],
  tasks: [
    { id: 'task-1', title: 'Call Ravi Mehta for site visit confirmation', status: 'To Do', priority: 'High', due_date: new Date().toISOString().split('T')[0], tags: ['CRM'], created_at: new Date().toISOString() },
    { id: 'task-2', title: 'Prepare agreement draft for Priya Kapoor', status: 'In Progress', priority: 'High', due_date: new Date().toISOString().split('T')[0], tags: ['Finance'], created_at: new Date().toISOString() },
    { id: 'task-3', title: 'Send WhatsApp broadcast to August leads', status: 'To Do', priority: 'Medium', due_date: new Date().toISOString().split('T')[0], tags: ['WhatsApp'], created_at: new Date().toISOString() },
    { id: 'task-4', title: 'Sync Tally invoices for July', status: 'Done', priority: 'Medium', due_date: new Date().toISOString().split('T')[0], tags: ['Finance'], created_at: new Date().toISOString() },
  ],
  invoices: [
    { id: 'inv-1', invoice_number: 'INV-2026-041', client_name: 'Ravi Mehta', client_phone: '+91 98765 43210', amount: 250000, status: 'Overdue', due_date: new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0], reminder_count: 2 },
    { id: 'inv-2', invoice_number: 'INV-2026-045', client_name: 'Priya Kapoor', client_phone: '+91 65432 10987', amount: 450000, status: 'Pending', due_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0], reminder_count: 0 },
    { id: 'inv-3', invoice_number: 'INV-2026-032', client_name: 'Kavita Joshi', client_phone: '+91 43210 98765', amount: 50000, status: 'Paid', due_date: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0], reminder_count: 1 },
    { id: 'inv-4', invoice_number: 'INV-2026-048', client_name: 'Arjun Sharma', client_phone: '+91 76543 21098', amount: 1000000, status: 'Overdue', due_date: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0], reminder_count: 4 },
    { id: 'inv-5', invoice_number: 'INV-2026-052', client_name: 'Manish Gupta', client_phone: '+91 32109 87654', amount: 500000, status: 'Pending', due_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0], reminder_count: 0 },
  ],
  campaigns: [
    { id: 'camp-1', name: 'Diwali Property Offer 2026', status: 'Completed', template_name: 'Festival Discount', total_sent: 248, delivered: 241, read_count: 198, replied: 34, created_at: new Date().toISOString() },
    { id: 'camp-2', name: '3BHK New Launch – Andheri', status: 'Running', template_name: 'Product Launch', total_sent: 85, delivered: 82, read_count: 67, replied: 12, created_at: new Date().toISOString() },
    { id: 'camp-3', name: 'Payment Reminder – July', status: 'Completed', template_name: 'Payment Follow-up', total_sent: 32, delivered: 32, read_count: 28, replied: 21, created_at: new Date().toISOString() },
    { id: 'camp-4', name: 'Site Visit Drive – August', status: 'Scheduled', template_name: 'Meeting Reminder', total_sent: 0, delivered: 0, read_count: 0, replied: 0, created_at: new Date().toISOString() },
  ],
  activity: [
    { id: 'act-1', type: 'lead', title: 'New lead: Ravi Mehta via WhatsApp', subtitle: '3BHK inquiry — ₹80L budget', icon_color: '#25d366', created_at: new Date(Date.now() - 5 * 60000).toISOString() },
    { id: 'act-2', type: 'whatsapp', title: 'Campaign "Diwali Offer" sent to 248 contacts', subtitle: '76% read rate achieved', icon_color: '#6366f1', created_at: new Date(Date.now() - 30 * 60000).toISOString() },
    { id: 'act-3', type: 'payment', title: 'Invoice INV-2026-041 is overdue by 14 days', subtitle: 'Ravi Mehta — ₹2.5L pending', icon_color: '#ef4444', created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
    { id: 'act-4', type: 'task', title: 'Site visit confirmed — Kavita Joshi', subtitle: 'Assigned to Rajesh Kumar', icon_color: '#f59e0b', created_at: new Date(Date.now() - 4 * 3600000).toISOString() },
    { id: 'act-5', type: 'payment', title: 'Payment received: ₹50,000 from Kavita Joshi', subtitle: 'Token amount cleared', icon_color: '#10b981', created_at: new Date(Date.now() - 6 * 3600000).toISOString() },
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
// ROLES & TEAM MEMBERS (RBAC)
// ─────────────────────────────────────────────────────────────────────────────
export async function getRoles() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.roles, error: null };
  const { data, error } = await supabase
    .from('roles')
    .select('*, permissions:role_permissions(permission:permissions(code, name, module))')
    .order('created_at', { ascending: true });
  return { data, error };
}

export async function createRole(roleData) {
  if (!isSupabaseConfigured) {
    const newRole = { id: 'role-' + Date.now(), ...roleData, users_count: 0, is_system: false };
    MOCK_STORE.roles.push(newRole);
    logAuditEvent('role.create', 'roles', newRole.id, newRole);
    return { data: newRole, error: null };
  }
  const { data, error } = await supabase
    .from('roles')
    .insert([{ ...roleData, organization_id: DEFAULT_ORG_ID }])
    .select()
    .single();
  if (data) logAuditEvent('role.create', 'roles', data.id, data);
  return { data, error };
}

export async function getTeamMembers() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.users, error: null };
  const { data, error } = await supabase
    .from('users')
    .select('*, user_roles(role:roles(name, color))')
    .order('created_at', { ascending: false });
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
  const { data, error } = await supabase
    .from('users')
    .insert([{ ...userData, organization_id: DEFAULT_ORG_ID }])
    .select()
    .single();
  if (data) logAuditEvent('user.invite', 'users', data.id, { email: data.email });
  return { data, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADS & CRM PIPELINE
// ─────────────────────────────────────────────────────────────────────────────
export async function getLeads() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.leads, error: null };
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function createLead(lead) {
  if (!isSupabaseConfigured) {
    const newLead = { id: 'lead-' + Date.now(), lead_score: 50, ...lead, created_at: new Date().toISOString() };
    MOCK_STORE.leads.unshift(newLead);
    logAuditEvent('lead.create', 'leads', newLead.id, newLead);
    return { data: newLead, error: null };
  }
  const { data, error } = await supabase
    .from('leads')
    .insert([{ ...lead, organization_id: DEFAULT_ORG_ID }])
    .select()
    .single();
  if (data) logAuditEvent('lead.create', 'leads', data.id, data);
  return { data, error };
}

export async function updateLead(id, updates) {
  if (!isSupabaseConfigured) {
    const idx = MOCK_STORE.leads.findIndex(l => l.id === id);
    if (idx !== -1) {
      MOCK_STORE.leads[idx] = { ...MOCK_STORE.leads[idx], ...updates };
      logAuditEvent('lead.update', 'leads', id, updates);
      return { data: MOCK_STORE.leads[idx], error: null };
    }
    return { data: null, error: { message: 'Lead not found' } };
  }
  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
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

// ─────────────────────────────────────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────────────────────────────────────
export async function getTasks() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.tasks, error: null };
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function createTask(task) {
  if (!isSupabaseConfigured) {
    const newTask = { id: 'task-' + Date.now(), ...task, created_at: new Date().toISOString() };
    MOCK_STORE.tasks.unshift(newTask);
    logAuditEvent('task.create', 'tasks', newTask.id, newTask);
    return { data: newTask, error: null };
  }
  const { data, error } = await supabase
    .from('tasks')
    .insert([{ ...task, organization_id: DEFAULT_ORG_ID }])
    .select()
    .single();
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

// ─────────────────────────────────────────────────────────────────────────────
// INVOICES / FINANCE
// ─────────────────────────────────────────────────────────────────────────────
export async function getInvoices() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.invoices, error: null };
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function logPaymentReminder(invoiceId, message) {
  if (!isSupabaseConfigured) return { error: null };
  await supabase.rpc('increment_reminder', { row_id: invoiceId }).catch(() => {});
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
// CAMPAIGNS & BROADCASTS
// ─────────────────────────────────────────────────────────────────────────────
export async function getCampaigns() {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.campaigns, error: null };
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function createCampaign(campaign) {
  if (!isSupabaseConfigured) {
    const newC = { id: 'camp-' + Date.now(), ...campaign, created_at: new Date().toISOString() };
    MOCK_STORE.campaigns.unshift(newC);
    logAuditEvent('campaign.create', 'campaigns', newC.id, newC);
    return { data: newC, error: null };
  }
  const { data, error } = await supabase
    .from('campaigns')
    .insert([{ ...campaign, organization_id: DEFAULT_ORG_ID }])
    .select()
    .single();
  if (data) logAuditEvent('campaign.create', 'campaigns', data.id, data);
  return { data, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD & ACTIVITY
// ─────────────────────────────────────────────────────────────────────────────
export async function getActivityFeed(limit = 10) {
  if (!isSupabaseConfigured) return { data: MOCK_STORE.activity.slice(0, limit), error: null };
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
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

// ─────────────────────────────────────────────────────────────────────────────
// CHATBOT / AI KNOWLEDGE RULES
// ─────────────────────────────────────────────────────────────────────────────
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
  const { data, error } = await supabase
    .from('ai_knowledge')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
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
