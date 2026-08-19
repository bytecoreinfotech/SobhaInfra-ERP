/**
 * Data Retention & Archival Worker — Netlify Function
 * Conforms to Techma Master Spec v4.0 (Section 50D)
 *
 * Handles automated cleanup of stale data:
 *  - Deletes integration_events older than retention period (default 90 days)
 *  - Clears raw_payload from old whatsapp_messages (default 180 days)
 *  - Archives old ai_runs data (default 180 days)
 *  - Purges old automation_runs logs (default 90 days)
 *
 * Can be triggered manually or by scheduled function.
 * URL: POST /.netlify/functions/data-retention
 * Body: { retentionDays?: number, dryRun?: boolean }
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_RETENTION_DAYS = 90;
const EXTENDED_RETENTION_DAYS = 180;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('placeholder')) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const retentionDays = body.retentionDays || DEFAULT_RETENTION_DAYS;
    const extendedRetentionDays = body.extendedRetentionDays || EXTENDED_RETENTION_DAYS;
    const dryRun = body.dryRun === true;

    const supabase = getSupabase();
    if (!supabase) {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ status: 'skipped', reason: 'no_supabase' }),
      };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffISO = cutoffDate.toISOString();

    const extendedCutoff = new Date();
    extendedCutoff.setDate(extendedCutoff.getDate() - extendedRetentionDays);
    const extendedCutoffISO = extendedCutoff.toISOString();

    const results = {
      dryRun,
      retentionDays,
      cutoffDate: cutoffISO,
      integrationEventsDeleted: 0,
      rawPayloadsCleared: 0,
      aiRunsArchived: 0,
      automationRunsDeleted: 0,
    };

    console.log(`[Retention] Starting cleanup. Cutoff: ${cutoffISO}, Dry run: ${dryRun}`);

    // 1. Delete old integration_events (webhook raw payloads)
    try {
      if (dryRun) {
        const { data, count } = await supabase
          .from('integration_events')
          .select('id', { count: 'exact', head: true })
          .lt('created_at', cutoffISO);
        results.integrationEventsDeleted = count || 0;
      } else {
        const { count } = await supabase
          .from('integration_events')
          .delete({ count: 'exact' })
          .lt('created_at', cutoffISO);
        results.integrationEventsDeleted = count || 0;
      }
    } catch (err) {
      console.warn('[Retention] integration_events cleanup error:', err.message);
    }

    // 2. Clear raw_payload from old whatsapp_messages (keep message body, clear raw webhook data)
    try {
      if (!dryRun) {
        const { count } = await supabase
          .from('whatsapp_messages')
          .update({ raw_payload: {} }, { count: 'exact' })
          .lt('created_at', extendedCutoffISO)
          .neq('raw_payload', '{}');
        results.rawPayloadsCleared = count || 0;
      } else {
        const { count } = await supabase
          .from('whatsapp_messages')
          .select('id', { count: 'exact', head: true })
          .lt('created_at', extendedCutoffISO)
          .neq('raw_payload', '{}');
        results.rawPayloadsCleared = count || 0;
      }
    } catch (err) {
      console.warn('[Retention] whatsapp_messages payload cleanup error:', err.message);
    }

    // 3. Delete old ai_runs (keep recent for observability)
    try {
      if (dryRun) {
        const { count } = await supabase
          .from('ai_runs')
          .select('id', { count: 'exact', head: true })
          .lt('created_at', extendedCutoffISO);
        results.aiRunsArchived = count || 0;
      } else {
        // First delete dependent ai_tool_calls
        const { data: oldRuns } = await supabase
          .from('ai_runs')
          .select('id')
          .lt('created_at', extendedCutoffISO);

        if (oldRuns && oldRuns.length > 0) {
          const runIds = oldRuns.map(r => r.id);
          // Delete in batches to avoid hitting limits
          for (let i = 0; i < runIds.length; i += 100) {
            const batch = runIds.slice(i, i + 100);
            await supabase.from('ai_tool_calls').delete().in('ai_run_id', batch);
          }
          const { count } = await supabase
            .from('ai_runs')
            .delete({ count: 'exact' })
            .lt('created_at', extendedCutoffISO);
          results.aiRunsArchived = count || 0;
        }
      }
    } catch (err) {
      console.warn('[Retention] ai_runs cleanup error:', err.message);
    }

    // 4. Delete old automation_runs
    try {
      if (dryRun) {
        const { count } = await supabase
          .from('automation_runs')
          .select('id', { count: 'exact', head: true })
          .lt('created_at', cutoffISO);
        results.automationRunsDeleted = count || 0;
      } else {
        const { count } = await supabase
          .from('automation_runs')
          .delete({ count: 'exact' })
          .lt('created_at', cutoffISO);
        results.automationRunsDeleted = count || 0;
      }
    } catch (err) {
      console.warn('[Retention] automation_runs cleanup error:', err.message);
    }

    console.log('[Retention] Completed:', JSON.stringify(results));

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        message: dryRun
          ? 'Dry run complete — no data was deleted'
          : 'Data retention cleanup completed',
        results,
      }),
    };
  } catch (err) {
    console.error('[Retention] Error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
