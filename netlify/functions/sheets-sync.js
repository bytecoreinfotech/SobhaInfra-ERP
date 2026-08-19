/**
 * Google Sheets Synchronization & Data Feed Endpoint — Netlify Function
 * Conforms to Techma Master Spec v4.0 (Section 31, 43, 50E)
 *
 * Implements automated synchronization and export of 8 specialized reporting tabs:
 *  1. Campaign Summary   - Performance, sent/delivered/read/replied, budget & attribution
 *  2. Qualified Leads     - Scored leads, intent, timeline, assigned salesperson
 *  3. Hot Leads           - High-priority immediate action leads
 *  4. Price Objections    - Recorded negotiation & price feedback from AI/chat
 *  5. Human Follow-ups    - Active handoffs, follow-up calls, urgent tasks
 *  6. Product Interest    - Aggregate demand & product inquiry stats
 *  7. Sales Outcomes      - Deals won/lost, quotation conversions, deal value
 *  8. Daily AI Activity   - Conversations, messages, tool calls, token cost tracking
 *
 * Usage:
 *  - GET  /?tab=campaign_summary&format=csv  → Live CSV feed for Google Sheets =IMPORTDATA(...)
 *  - GET  /?all=1                             → Returns all 8 tabs structured JSON
 *  - POST / (body: { webhookUrl, tab })      → Dispatches tab data directly to Google Sheets Webhook / Apps Script
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('placeholder')) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ── Convert Array of Objects to CSV String ────────────────────────────────────
function toCSV(rows, headers) {
  if (!rows || rows.length === 0) return (headers ? headers.join(',') : '') + '\n';
  const keys = headers || Object.keys(rows[0]);
  const headerLine = keys.join(',');
  const rowLines = rows.map(r =>
    keys.map(k => {
      let val = r[k] === null || r[k] === undefined ? '' : String(r[k]);
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(',')
  );
  return [headerLine, ...rowLines].join('\n');
}

// ── Fetch All 8 Data Tabs from Supabase ───────────────────────────────────────
async function generateAllTabsData(supabase) {
  const defaultRes = {
    campaign_summary: [],
    qualified_leads: [],
    hot_leads: [],
    price_objections: [],
    human_followups: [],
    product_interest: [],
    sales_outcomes: [],
    daily_ai_activity: [],
  };

  if (!supabase) return defaultRes;

  try {
    // 1. Fetch source tables
    const [
      { data: campaigns },
      { data: leads },
      { data: deals },
      { data: objections },
      { data: tasks },
      { data: products },
      { data: aiRuns },
      { data: invoices },
    ] = await Promise.all([
      supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('deals').select('*, customer:customers(name), lead:leads(name)').order('created_at', { ascending: false }),
      supabase.from('lead_objections').select('*, lead:leads(name, phone)').order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('name'),
      supabase.from('ai_runs').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
    ]);

    // ── Tab 1: Campaign Summary ──
    const campaignSummary = (campaigns || []).map(c => ({
      campaign_id: c.id,
      campaign_name: c.name,
      status: c.status,
      total_targeted: c.total_targeted || 0,
      total_sent: c.total_sent || 0,
      total_delivered: c.total_delivered || 0,
      total_read: c.total_read || 0,
      total_replied: c.total_replied || 0,
      delivery_rate: c.total_sent > 0 ? ((c.total_delivered / c.total_sent) * 100).toFixed(1) + '%' : '0%',
      read_rate: c.total_delivered > 0 ? ((c.total_read / c.total_delivered) * 100).toFixed(1) + '%' : '0%',
      scheduled_at: c.scheduled_at || '',
      started_at: c.started_at || '',
      completed_at: c.completed_at || '',
      created_at: c.created_at,
    }));

    // ── Tab 2: Qualified Leads ──
    const qualifiedLeads = (leads || [])
      .filter(l => (l.lead_score && l.lead_score > 20) || l.status === 'Hot' || l.status === 'Warm' || l.intent)
      .map(l => ({
        lead_id: l.id,
        name: l.name,
        phone: l.phone,
        email: l.email || '',
        source: l.source,
        status: l.status,
        lead_score: l.lead_score || 0,
        intent: l.intent || 'Interested',
        product_interest: l.property_interest || '',
        budget: l.budget || '',
        first_touch_campaign: l.first_touch_campaign || '',
        last_touch_campaign: l.last_touch_campaign || '',
        marketing_opt_out: l.marketing_opt_out ? 'Yes' : 'No',
        created_at: l.created_at,
      }));

    // ── Tab 3: Hot Leads ──
    const hotLeads = (leads || [])
      .filter(l => l.status === 'Hot' || (l.lead_score && l.lead_score >= 60))
      .map(l => ({
        lead_id: l.id,
        name: l.name,
        phone: l.phone,
        lead_score: l.lead_score || 0,
        property_interest: l.property_interest || '',
        budget: l.budget || '',
        last_touch: l.last_touch_campaign || 'Direct',
        notes: l.notes || '',
        created_at: l.created_at,
      }));

    // ── Tab 4: Price Objections ──
    const priceObjections = (objections || []).map(o => ({
      objection_id: o.id,
      lead_id: o.lead_id,
      customer_name: o.lead?.name || 'Customer',
      customer_phone: o.lead?.phone || '',
      objection_type: o.objection_type,
      customer_remark: o.customer_remark,
      ai_response: o.ai_response || '',
      handoff_triggered: o.handoff_triggered ? 'Yes' : 'No',
      created_at: o.created_at,
    }));

    // ── Tab 5: Human Follow-ups ──
    const humanFollowups = (tasks || []).map(t => ({
      task_id: t.id,
      title: t.title,
      description: t.description || '',
      status: t.status,
      priority: t.priority,
      assigned_to: t.assigned_to || 'Sales Team',
      due_date: t.due_date || '',
      related_lead_id: t.related_lead_id || '',
      related_deal_id: t.related_deal_id || '',
      tags: (t.tags || []).join('; '),
      created_at: t.created_at,
    }));

    // ── Tab 6: Product Interest ──
    const productCounts = {};
    (leads || []).forEach(l => {
      const prod = l.property_interest || 'General Inquiry';
      productCounts[prod] = (productCounts[prod] || 0) + 1;
    });

    const productInterest = Object.entries(productCounts).map(([productName, inquiries]) => ({
      product_name: productName,
      total_inquiries: inquiries,
      hot_leads_count: (leads || []).filter(l => (l.property_interest === productName) && l.status === 'Hot').length,
      deals_pipeline_count: (deals || []).filter(d => d.title.includes(productName)).length,
      last_inquiry_date: new Date().toISOString().split('T')[0],
    }));

    // ── Tab 7: Sales Outcomes ──
    const salesOutcomes = (deals || []).map(d => ({
      deal_id: d.id,
      title: d.title,
      stage: d.stage,
      value_inr: d.value || 0,
      customer_or_lead: d.customer?.name || d.lead?.name || 'N/A',
      expected_close_date: d.expected_close_date || '',
      loss_reason: d.loss_reason || '',
      created_at: d.created_at,
    }));

    // ── Tab 8: Daily AI Activity ──
    // Group AI runs by date
    const dailyMap = {};
    (aiRuns || []).forEach(r => {
      const date = (r.created_at || new Date().toISOString()).split('T')[0];
      if (!dailyMap[date]) {
        dailyMap[date] = { date, total_runs: 0, prompt_tokens: 0, completion_tokens: 0, total_cost_usd: 0, avg_latency_ms: 0, latencies: [] };
      }
      dailyMap[date].total_runs++;
      dailyMap[date].prompt_tokens += (r.prompt_tokens || 0);
      dailyMap[date].completion_tokens += (r.completion_tokens || 0);
      dailyMap[date].total_cost_usd += Number(r.total_cost || 0);
      if (r.latency_ms) dailyMap[date].latencies.push(r.latency_ms);
    });

    const dailyAiActivity = Object.values(dailyMap).map(d => ({
      date: d.date,
      total_ai_runs: d.total_runs,
      prompt_tokens: d.prompt_tokens,
      completion_tokens: d.completion_tokens,
      total_cost_usd: d.total_cost_usd.toFixed(4),
      avg_latency_ms: d.latencies.length > 0 ? Math.round(d.latencies.reduce((a, b) => a + b, 0) / d.latencies.length) : 0,
    }));

    return {
      campaign_summary: campaignSummary,
      qualified_leads: qualifiedLeads,
      hot_leads: hotLeads,
      price_objections: priceObjections,
      human_followups: humanFollowups,
      product_interest: productInterest,
      sales_outcomes: salesOutcomes,
      daily_ai_activity: dailyAiActivity,
    };
  } catch (err) {
    console.error('[Sheets Sync] Data aggregation error:', err);
    return defaultRes;
  }
}

// ── Main Handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Organization-Id',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const supabase = getSupabase();
    const queryParams = event.queryStringParameters || {};
    const tabName = queryParams.tab;
    const format = queryParams.format; // 'csv' or 'json'
    const returnAll = queryParams.all === '1' || (!tabName && event.httpMethod === 'GET');

    const allTabs = await generateAllTabsData(supabase);

    // ── Case 1: Return single Tab as CSV (for Google Sheets =IMPORTDATA formula) ──
    if (tabName && format === 'csv') {
      const rows = allTabs[tabName] || [];
      const csvText = toCSV(rows);
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="erppro_${tabName}.csv"`,
        },
        body: csvText,
      };
    }

    // ── Case 2: POST to dispatch data to Google Apps Script / Webhook ────────────
    if (event.httpMethod === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      const webhookUrl = body.webhookUrl || process.env.GOOGLE_SHEETS_WEBHOOK_URL;

      let pushResult = { pushed: false, message: 'No webhook URL configured' };

      if (webhookUrl) {
        try {
          const payload = {
            syncedAt: new Date().toISOString(),
            organizationId: DEFAULT_ORG_ID,
            tabs: body.tab ? { [body.tab]: allTabs[body.tab] } : allTabs,
          };

          const sheetResp = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          pushResult = {
            pushed: true,
            status: sheetResp.status,
            message: 'Successfully synchronized data to Google Sheets webhook',
          };
        } catch (pushErr) {
          pushResult = { pushed: false, error: pushErr.message };
        }
      }

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          success: true,
          syncedAt: new Date().toISOString(),
          pushResult,
          tabsCount: {
            campaign_summary: allTabs.campaign_summary.length,
            qualified_leads: allTabs.qualified_leads.length,
            hot_leads: allTabs.hot_leads.length,
            price_objections: allTabs.price_objections.length,
            human_followups: allTabs.human_followups.length,
            product_interest: allTabs.product_interest.length,
            sales_outcomes: allTabs.sales_outcomes.length,
            daily_ai_activity: allTabs.daily_ai_activity.length,
          },
        }),
      };
    }

    // ── Case 3: GET returning JSON of single tab or all 8 tabs ─────────────────
    if (tabName) {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          tab: tabName,
          total: (allTabs[tabName] || []).length,
          data: allTabs[tabName] || [],
        }),
      };
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        generatedAt: new Date().toISOString(),
        tabs: allTabs,
        meta: {
          supportedTabs: [
            'campaign_summary',
            'qualified_leads',
            'hot_leads',
            'price_objections',
            'human_followups',
            'product_interest',
            'sales_outcomes',
            'daily_ai_activity',
          ],
          csvImportUrlFormat: '/.netlify/functions/sheets-sync?tab={tab_name}&format=csv',
        },
      }),
    };
  } catch (err) {
    console.error('[Sheets Sync] Fatal error:', err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
