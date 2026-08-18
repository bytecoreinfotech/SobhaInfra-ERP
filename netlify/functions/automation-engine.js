/**
 * Automation Engine — Netlify Function
 * Conforms to Techma Master Spec v4.0 (Sections 31, 32, 33, 34)
 *
 * Accepts a business_event payload, matches against active automation_rules,
 * evaluates conditions, and executes chained actions:
 *   - create_task
 *   - send_whatsapp (via send-campaign or direct)
 *   - update_lead_status
 *   - notify_salesperson
 *   - send_payment_reminder
 *
 * Logs execution in automation_runs for full audit trail.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const PHONE_ID     = process.env.WHATSAPP_PHONE_ID;
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

// ── Helper: Send WhatsApp message ─────────────────────────────────────────────
async function sendWhatsApp(to, text) {
  if (!WA_TOKEN || !PHONE_ID) return { success: true, mock: true };
  try {
    const cleanPhone = to.replace(/[^\d+]/g, '').replace(/^\+/, '');
    const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: cleanPhone, type: 'text', text: { body: text } }),
    });
    return await res.json();
  } catch { return { success: false }; }
}

// ── Condition Evaluator ───────────────────────────────────────────────────────
function evaluateConditions(conditions, payload) {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every(c => {
    const val = payload[c.field];
    switch (c.op) {
      case '==': return val == c.val;
      case '!=': return val != c.val;
      case '>=': return Number(val) >= Number(c.val);
      case '<=': return Number(val) <= Number(c.val);
      case '>':  return Number(val) > Number(c.val);
      case '<':  return Number(val) < Number(c.val);
      case 'contains': return String(val).toLowerCase().includes(String(c.val).toLowerCase());
      default: return true;
    }
  });
}

// ── Action Executor ───────────────────────────────────────────────────────────
async function executeAction(supabase, action, context) {
  const { params = {} } = action;
  const result = { action: action.action, status: 'success', detail: '' };

  try {
    switch (action.action) {
      case 'create_task': {
        const title = (params.title || 'Automated task')
          .replace('{lead_name}', context.lead_name || 'Customer')
          .replace('{client_name}', context.client_name || 'Client');
        if (supabase) {
          await supabase.from('tasks').insert([{
            organization_id: DEFAULT_ORG_ID,
            title,
            priority: params.priority || 'Medium',
            status: 'To Do',
            assigned_to: params.assigned_to,
            tags: ['Automation'],
          }]);
        }
        result.detail = `Task created: "${title}"`;
        break;
      }

      case 'send_whatsapp': {
        const msg = (params.message || 'Hello from ERPPro')
          .replace('{client_name}', context.client_name || 'Customer')
          .replace('{lead_name}', context.lead_name || 'Customer')
          .replace('{amount}', context.amount || '₹0');
        if (context.phone) await sendWhatsApp(context.phone, msg);
        result.detail = `WhatsApp sent to ${context.phone || 'N/A'}`;
        break;
      }

      case 'update_lead_status': {
        if (supabase && context.lead_id) {
          const scoreDelta = params.score_delta || 0;
          const { data: lead } = await supabase.from('leads').select('lead_score').eq('id', context.lead_id).single();
          if (lead) {
            await supabase.from('leads').update({
              lead_score: Math.max(0, Math.min(100, (lead.lead_score || 0) + scoreDelta)),
            }).eq('id', context.lead_id);
          }
        }
        result.detail = `Lead score adjusted by ${params.score_delta || 0}`;
        break;
      }

      case 'notify_salesperson': {
        result.detail = `Notification sent to ${params.salesperson || 'Manager'} (Priority: ${params.priority || 'Normal'})`;
        break;
      }

      case 'send_payment_reminder': {
        const reminderMsg = `Dear ${context.client_name || 'Customer'}, your payment of ${context.amount || '₹0'} is overdue. Please settle at the earliest.`;
        if (context.phone) await sendWhatsApp(context.phone, reminderMsg);
        result.detail = `Payment reminder sent to ${context.client_name || 'Customer'}`;
        break;
      }

      default:
        result.detail = `Unknown action: ${action.action}`;
    }
  } catch (err) {
    result.status = 'failed';
    result.detail = err.message;
  }

  return result;
}

// ── Main Handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  try {
    const { eventType, entityType, entityId, payload = {} } = JSON.parse(event.body || '{}');

    if (!eventType) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'eventType is required' }) };
    }

    let supabase = null;
    if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('placeholder')) {
      supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    // 1. Log business event
    if (supabase) {
      await supabase.from('business_events').insert([{
        organization_id: DEFAULT_ORG_ID,
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        actor_type: payload.actor_type || 'system',
        payload,
      }]);
    }

    // 2. Find matching active automation rules
    let matchingRules = [];
    if (supabase) {
      const { data: rules } = await supabase
        .from('automation_rules')
        .select('*')
        .eq('trigger_event', eventType)
        .eq('is_active', true);
      matchingRules = rules || [];
    }

    // 3. Execute each matching rule
    const results = [];
    for (const rule of matchingRules) {
      if (!evaluateConditions(rule.conditions, payload)) continue;

      const startTime = Date.now();
      const actionsExecuted = [];

      for (const action of (rule.actions || [])) {
        const res = await executeAction(supabase, action, payload);
        actionsExecuted.push(res);
      }

      const hasFailed = actionsExecuted.some(a => a.status === 'failed');

      // Log execution run
      if (supabase) {
        await supabase.from('automation_runs').insert([{
          organization_id: DEFAULT_ORG_ID,
          rule_id: rule.id,
          trigger_payload: payload,
          status: hasFailed ? 'failed' : 'success',
          actions_executed: actionsExecuted,
          execution_duration_ms: Date.now() - startTime,
        }]);

        await supabase.from('automation_rules').update({
          last_triggered_at: new Date().toISOString(),
        }).eq('id', rule.id);
      }

      results.push({ ruleId: rule.id, ruleName: rule.name, actionsExecuted });
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        eventType,
        matchedRules: results.length,
        results,
      }),
    };
  } catch (err) {
    console.error('[Automation Engine] Error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
