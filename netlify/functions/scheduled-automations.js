/**
 * Scheduled Automations Runner — Netlify Scheduled Function
 * Conforms to Techma Master Spec v4.0 (Sections 30, 40, 41)
 *
 * Runs on a cron schedule to:
 *  1. Mark overdue invoices (calls mark_overdue_invoices DB function)
 *  2. Scan for overdue invoices at 7-day and 30-day thresholds
 *  3. Dispatch business events to the automation engine
 *  4. Process scheduled campaigns whose scheduled_at has passed
 *  5. Evaluate time-based automation rules
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const SITE_URL     = process.env.URL || 'http://localhost:8888';
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('placeholder')) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ─── 1. Mark Overdue Invoices ────────────────────────────────────────────────
async function markOverdueInvoices(supabase) {
  try {
    const { data: overdueList, error } = await supabase.rpc('mark_overdue_invoices');
    if (error) {
      console.warn('[Scheduler] mark_overdue_invoices RPC error:', error.message);
      return [];
    }
    console.log(`[Scheduler] Marked ${(overdueList || []).length} invoices as overdue.`);
    return overdueList || [];
  } catch (err) {
    console.warn('[Scheduler] mark_overdue_invoices exception:', err.message);
    return [];
  }
}

// ─── 2. Scan Overdue Invoices and Dispatch Events ────────────────────────────
async function scanOverdueThresholds(supabase) {
  try {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 7-day overdue invoices
    const { data: overdue7 } = await supabase
      .from('invoices')
      .select('id, client_name, client_phone, amount, due_date, customer_id')
      .eq('status', 'Overdue')
      .lte('due_date', sevenDaysAgo.toISOString().split('T')[0])
      .gt('due_date', thirtyDaysAgo.toISOString().split('T')[0]);

    for (const inv of (overdue7 || [])) {
      const daysOverdue = Math.floor((today - new Date(inv.due_date)) / (1000 * 60 * 60 * 24));
      await dispatchAutomationEvent(supabase, {
        eventType: 'tally.invoice_overdue_7d',
        entityType: 'invoice',
        entityId: inv.id,
        payload: {
          client_name: inv.client_name,
          phone: inv.client_phone,
          amount: inv.amount,
          days_overdue: daysOverdue,
          customer_id: inv.customer_id,
        },
      });
    }

    // 30-day overdue invoices (escalation)
    const { data: overdue30 } = await supabase
      .from('invoices')
      .select('id, client_name, client_phone, amount, due_date, customer_id')
      .eq('status', 'Overdue')
      .lte('due_date', thirtyDaysAgo.toISOString().split('T')[0]);

    for (const inv of (overdue30 || [])) {
      const daysOverdue = Math.floor((today - new Date(inv.due_date)) / (1000 * 60 * 60 * 24));
      await dispatchAutomationEvent(supabase, {
        eventType: 'tally.invoice_overdue_30d',
        entityType: 'invoice',
        entityId: inv.id,
        payload: {
          client_name: inv.client_name,
          phone: inv.client_phone,
          amount: inv.amount,
          days_overdue: daysOverdue,
          customer_id: inv.customer_id,
        },
      });
    }

    console.log(`[Scheduler] Dispatched events: ${(overdue7 || []).length} at 7d, ${(overdue30 || []).length} at 30d.`);
  } catch (err) {
    console.warn('[Scheduler] scanOverdueThresholds error:', err.message);
  }
}

// ─── 3. Dispatch Event to Automation Engine ──────────────────────────────────
async function dispatchAutomationEvent(supabase, { eventType, entityType, entityId, payload }) {
  try {
    // Try calling the automation engine function
    const automationUrl = `${SITE_URL}/.netlify/functions/automation-engine`;
    await fetch(automationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, entityType, entityId, payload }),
    });
  } catch (err) {
    // Fallback: log the event directly
    try {
      await supabase.from('business_events').insert([{
        organization_id: DEFAULT_ORG_ID,
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        actor_type: 'system',
        payload,
      }]);
    } catch {}
    console.warn('[Scheduler] dispatchEvent fallback:', err.message);
  }
}

// ─── 4. Process Scheduled Campaigns ──────────────────────────────────────────
async function processScheduledCampaigns(supabase) {
  try {
    const now = new Date().toISOString();

    // Find campaigns whose scheduled_at has passed and are still in 'Scheduled' status
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name, scheduled_at')
      .eq('status', 'Scheduled')
      .lte('scheduled_at', now);

    if (!campaigns || campaigns.length === 0) {
      console.log('[Scheduler] No scheduled campaigns ready to execute.');
      return;
    }

    console.log(`[Scheduler] Found ${campaigns.length} scheduled campaigns to execute.`);

    for (const campaign of campaigns) {
      try {
        // Update status to Running
        await supabase.from('campaigns').update({
          status: 'Running',
          started_at: now,
        }).eq('id', campaign.id);

        // Trigger the campaign worker
        const campaignUrl = `${SITE_URL}/.netlify/functions/send-campaign`;
        await fetch(campaignUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: campaign.id, batchSize: 50 }),
        });

        console.log(`[Scheduler] Triggered campaign: ${campaign.name} (${campaign.id})`);
      } catch (err) {
        console.warn(`[Scheduler] Failed to trigger campaign ${campaign.id}:`, err.message);
      }
    }
  } catch (err) {
    console.warn('[Scheduler] processScheduledCampaigns error:', err.message);
  }
}

// ─── 5. Main Handler ─────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  console.log(`[Scheduler] Running scheduled automations at ${new Date().toISOString()}`);

  const supabase = getSupabase();
  if (!supabase) {
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ status: 'skipped', reason: 'no_supabase' }),
    };
  }

  const results = {
    timestamp: new Date().toISOString(),
    overdueMarked: 0,
    eventsDispatched: 0,
    campaignsTriggered: 0,
  };

  // Step 1: Mark overdue invoices
  const overdueList = await markOverdueInvoices(supabase);
  results.overdueMarked = overdueList.length;

  // Step 2: Scan and dispatch overdue events to automation engine
  await scanOverdueThresholds(supabase);

  // Step 3: Process scheduled campaigns
  await processScheduledCampaigns(supabase);

  // Step 3.5: Auto-fetch live changes from Google Sheet before payment reminder run
  try {
    console.log('[Scheduler] Auto-fetching latest customer master & emails from Google Sheet...');
    const { syncCustomerMaster } = require('./sync-customer-master');
    if (typeof syncCustomerMaster === 'function') {
      const sheetSyncRes = await syncCustomerMaster(supabase);
      results.sheetSync = sheetSyncRes;
      console.log(`[Scheduler] Google Sheet auto-sync complete: ${sheetSyncRes.synced} customers synced.`);
    }
  } catch (sheetErr) {
    console.warn('[Scheduler] Google Sheet auto-sync notice:', sheetErr.message);
    results.sheetSync = { error: sheetErr.message };
  }

  // Step 4: Bill-by-Bill Automated Payment Reminders (1-day before due date + interval loop)
  try {
    const { runAutomatedPaymentReminders } = require('./send-reminder');
    if (typeof runAutomatedPaymentReminders === 'function') {
      results.paymentReminders = await runAutomatedPaymentReminders(supabase);
    } else {
      throw new Error('runAutomatedPaymentReminders is not a function');
    }
  } catch (err) {
    console.warn('[Scheduler] Direct require notice, falling back to HTTP fetch:', err.message);
    try {
      const res = await fetch(`${SITE_URL}/.netlify/functions/send-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCronTrigger: true }),
      });
      results.paymentReminders = await res.json();
    } catch (httpErr) {
      console.warn('[Scheduler] HTTP fallback failed:', httpErr.message);
      results.paymentReminders = { error: httpErr.message };
    }
  }

  console.log('[Scheduler] Completed:', JSON.stringify(results));

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ success: true, results }),
  };
};
