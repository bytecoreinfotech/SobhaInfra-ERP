/**
 * ERPPro Data Services
 * All Supabase database operations are centralized here.
 * Pages import from this file instead of calling Supabase directly.
 */
import { supabase, isSupabaseConfigured } from './supabase';

// ─────────────────────────────────────────────
// MOCK DATA (used when Supabase is not configured)
// ─────────────────────────────────────────────
const MOCK = {
  leads: [
    { id: 1, name: 'Ravi Mehta', phone: '+91 98765 43210', email: 'ravi.mehta@gmail.com', source: 'WhatsApp', status: 'Hot', property_interest: '3BHK - Andheri West', budget: '₹80L - ₹1Cr', notes: 'Very interested', created_at: new Date().toISOString() },
    { id: 2, name: 'Sunita Patel', phone: '+91 87654 32109', email: 'sunita.p@yahoo.com', source: 'Facebook', status: 'Warm', property_interest: '2BHK - Borivali', budget: '₹50L - ₹65L', notes: 'Budget constraints', created_at: new Date().toISOString() },
    { id: 3, name: 'Arjun Sharma', phone: '+91 76543 21098', email: null, source: 'Instagram', status: 'New', property_interest: 'Villa - Lonavala', budget: '₹2Cr+', notes: 'Weekend home', created_at: new Date().toISOString() },
    { id: 4, name: 'Priya Kapoor', phone: '+91 65432 10987', email: 'priya.k@outlook.com', source: 'Referral', status: 'Converted', property_interest: '2BHK - Goregaon', budget: '₹55L', notes: 'Booking done', created_at: new Date().toISOString() },
    { id: 5, name: 'Kavita Joshi', phone: '+91 43210 98765', email: null, source: 'WhatsApp', status: 'Hot', property_interest: '2BHK - Thane', budget: '₹60L', notes: 'Ready to book', created_at: new Date().toISOString() },
  ],
  tasks: [
    { id: 1, title: 'Call Ravi Mehta for site visit confirmation', status: 'To Do', priority: 'High', due_date: new Date().toISOString().split('T')[0], tags: ['CRM'], created_at: new Date().toISOString() },
    { id: 2, title: 'Prepare agreement draft for Priya Kapoor', status: 'In Progress', priority: 'High', due_date: new Date().toISOString().split('T')[0], tags: ['Finance'], created_at: new Date().toISOString() },
    { id: 3, title: 'Send WhatsApp broadcast to August leads', status: 'To Do', priority: 'Medium', due_date: new Date().toISOString().split('T')[0], tags: ['WhatsApp'], created_at: new Date().toISOString() },
    { id: 4, title: 'Sync Tally invoices for July', status: 'Done', priority: 'Medium', due_date: new Date().toISOString().split('T')[0], tags: ['Finance'], created_at: new Date().toISOString() },
  ],
  invoices: [
    { id: 1, invoice_number: 'INV-2026-041', client_name: 'Ravi Mehta', client_phone: '+91 98765 43210', amount: 250000, status: 'Overdue', due_date: new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0], reminder_count: 2 },
    { id: 2, invoice_number: 'INV-2026-045', client_name: 'Priya Kapoor', client_phone: '+91 65432 10987', amount: 450000, status: 'Pending', due_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0], reminder_count: 0 },
    { id: 3, invoice_number: 'INV-2026-032', client_name: 'Kavita Joshi', client_phone: '+91 43210 98765', amount: 50000, status: 'Paid', due_date: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0], reminder_count: 1 },
    { id: 4, invoice_number: 'INV-2026-048', client_name: 'Arjun Sharma', client_phone: '+91 76543 21098', amount: 1000000, status: 'Overdue', due_date: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0], reminder_count: 4 },
    { id: 5, invoice_number: 'INV-2026-052', client_name: 'Manish Gupta', client_phone: '+91 32109 87654', amount: 500000, status: 'Pending', due_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0], reminder_count: 0 },
  ],
  campaigns: [
    { id: 1, name: 'Diwali Property Offer 2026', status: 'Completed', template_name: 'Festival Discount', total_sent: 248, delivered: 241, read_count: 198, replied: 34, created_at: new Date().toISOString() },
    { id: 2, name: '3BHK New Launch – Andheri', status: 'Running', template_name: 'Product Launch', total_sent: 85, delivered: 82, read_count: 67, replied: 12, created_at: new Date().toISOString() },
    { id: 3, name: 'Payment Reminder – July', status: 'Completed', template_name: 'Payment Follow-up', total_sent: 32, delivered: 32, read_count: 28, replied: 21, created_at: new Date().toISOString() },
    { id: 4, name: 'Site Visit Drive – August', status: 'Scheduled', template_name: 'Meeting Reminder', total_sent: 0, delivered: 0, read_count: 0, replied: 0, created_at: new Date().toISOString() },
  ],
  activity: [
    { id: 1, type: 'lead', title: 'New lead: Ravi Mehta via WhatsApp', subtitle: '3BHK inquiry — ₹80L budget', icon_color: '#25d366', created_at: new Date(Date.now() - 5 * 60000).toISOString() },
    { id: 2, type: 'whatsapp', title: 'Campaign "Diwali Offer" sent to 248 contacts', subtitle: '76% read rate achieved', icon_color: '#6366f1', created_at: new Date(Date.now() - 30 * 60000).toISOString() },
    { id: 3, type: 'payment', title: 'Invoice INV-2026-041 is overdue by 14 days', subtitle: 'Ravi Mehta — ₹2.5L pending', icon_color: '#ef4444', created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
    { id: 4, type: 'task', title: 'Site visit confirmed — Kavita Joshi', subtitle: 'Assigned to Rajesh Kumar', icon_color: '#f59e0b', created_at: new Date(Date.now() - 4 * 3600000).toISOString() },
    { id: 5, type: 'payment', title: 'Payment received: ₹50,000 from Kavita Joshi', subtitle: 'Token amount cleared', icon_color: '#10b981', created_at: new Date(Date.now() - 6 * 3600000).toISOString() },
  ],
};

// ─────────────────────────────────────────────
// LEADS
// ─────────────────────────────────────────────
export async function getLeads() {
  if (!isSupabaseConfigured) return { data: MOCK.leads, error: null };
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function createLead(lead) {
  if (!isSupabaseConfigured) {
    const newLead = { id: Date.now(), ...lead, created_at: new Date().toISOString() };
    MOCK.leads.unshift(newLead);
    return { data: newLead, error: null };
  }
  const { data, error } = await supabase.from('leads').insert([lead]).select().single();
  return { data, error };
}

export async function updateLead(id, updates) {
  if (!isSupabaseConfigured) {
    const idx = MOCK.leads.findIndex(l => l.id === id);
    if (idx !== -1) MOCK.leads[idx] = { ...MOCK.leads[idx], ...updates };
    return { data: MOCK.leads[idx], error: null };
  }
  const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single();
  return { data, error };
}

export async function deleteLead(id) {
  if (!isSupabaseConfigured) {
    const idx = MOCK.leads.findIndex(l => l.id === id);
    if (idx !== -1) MOCK.leads.splice(idx, 1);
    return { error: null };
  }
  const { error } = await supabase.from('leads').delete().eq('id', id);
  return { error };
}

// ─────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────
export async function getTasks() {
  if (!isSupabaseConfigured) return { data: MOCK.tasks, error: null };
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function createTask(task) {
  if (!isSupabaseConfigured) {
    const newTask = { id: Date.now(), ...task, created_at: new Date().toISOString() };
    MOCK.tasks.unshift(newTask);
    return { data: newTask, error: null };
  }
  const { data, error } = await supabase.from('tasks').insert([task]).select().single();
  return { data, error };
}

export async function updateTask(id, updates) {
  if (!isSupabaseConfigured) {
    const idx = MOCK.tasks.findIndex(t => t.id === id);
    if (idx !== -1) MOCK.tasks[idx] = { ...MOCK.tasks[idx], ...updates };
    return { data: MOCK.tasks[idx], error: null };
  }
  const { data, error } = await supabase.from('tasks').update(updates).eq('id', id).select().single();
  return { data, error };
}

// ─────────────────────────────────────────────
// INVOICES / FINANCE
// ─────────────────────────────────────────────
export async function getInvoices() {
  if (!isSupabaseConfigured) return { data: MOCK.invoices, error: null };
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function logPaymentReminder(invoiceId, message) {
  if (!isSupabaseConfigured) return { error: null };
  // Increment reminder count
  await supabase.rpc('increment_reminder', { row_id: invoiceId });
  const { error } = await supabase.from('payment_reminders').insert([{
    invoice_id: invoiceId,
    channel: 'WhatsApp',
    message,
    status: 'sent'
  }]);
  return { error };
}

// ─────────────────────────────────────────────
// WHATSAPP CAMPAIGNS
// ─────────────────────────────────────────────
export async function getCampaigns() {
  if (!isSupabaseConfigured) return { data: MOCK.campaigns, error: null };
  const { data, error } = await supabase
    .from('wa_campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function createCampaign(campaign) {
  if (!isSupabaseConfigured) {
    const newC = { id: Date.now(), ...campaign, created_at: new Date().toISOString() };
    MOCK.campaigns.unshift(newC);
    return { data: newC, error: null };
  }
  const { data, error } = await supabase.from('wa_campaigns').insert([campaign]).select().single();
  return { data, error };
}

// ─────────────────────────────────────────────
// DASHBOARD — activity feed & KPI stats
// ─────────────────────────────────────────────
export async function getActivityFeed(limit = 10) {
  if (!isSupabaseConfigured) return { data: MOCK.activity, error: null };
  const { data, error } = await supabase
    .from('activity_feed')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data, error };
}

export async function getDashboardStats() {
  if (!isSupabaseConfigured) {
    return {
      data: {
        totalLeads: MOCK.leads.length,
        hotLeads: MOCK.leads.filter(l => l.status === 'Hot').length,
        converted: MOCK.leads.filter(l => l.status === 'Converted').length,
        overdueInvoices: MOCK.invoices.filter(i => i.status === 'Overdue').length,
        pendingAmount: MOCK.invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + i.amount, 0),
        tasksDue: MOCK.tasks.filter(t => t.status !== 'Done').length,
      },
      error: null
    };
  }
  // Parallel queries for performance
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

// ─────────────────────────────────────────────
// CHATBOT RULES
// ─────────────────────────────────────────────
export async function getChatbotRules() {
  if (!isSupabaseConfigured) return { data: [], error: null };
  const { data, error } = await supabase
    .from('chatbot_rules')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false });
  return { data, error };
}

export function matchChatbotRule(rules, message) {
  const lower = message.toLowerCase();
  for (const rule of rules) {
    if (rule.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return rule.response;
    }
  }
  return '😊 Thanks for your message! Our team will get back to you shortly.\n\nFor immediate assistance, call us at +91 98765 43210.';
}
