/**
 * WhatsApp Template Sync — Netlify Function
 * Conforms to Techma Master Spec v4.0 (Section 50A)
 *
 * Fetches approved message templates from Meta Graph API
 * and upserts them into the whatsapp_templates table.
 *
 * URL: POST /.netlify/functions/sync-templates
 * Body: { wabaId?: string } — optional override for WABA ID
 */

const { createClient } = require('@supabase/supabase-js');

const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const WABA_ID      = process.env.WHATSAPP_WABA_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const wabaId = body.wabaId || WABA_ID;

    if (!wabaId) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: 'WHATSAPP_WABA_ID environment variable or wabaId in request body is required' }),
      };
    }

    if (!WA_TOKEN) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: 'WHATSAPP_TOKEN environment variable is required' }),
      };
    }

    // 1. Fetch templates from Meta Graph API
    const url = `https://graph.facebook.com/v20.0/${wabaId}/message_templates?limit=100`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${WA_TOKEN}` },
    });

    const data = await response.json();

    if (data.error) {
      console.error('[Template Sync] Meta API error:', JSON.stringify(data.error));
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: data.error.message }),
      };
    }

    const templates = data.data || [];
    console.log(`[Template Sync] Fetched ${templates.length} templates from Meta.`);

    // 2. Upsert into Supabase
    let supabase = null;
    if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('placeholder')) {
      supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    const results = {
      fetched: templates.length,
      synced: 0,
      errors: [],
    };

    if (supabase) {
      for (const tpl of templates) {
        try {
          // Extract body text and variables from components
          let bodyText = '';
          let variablesSchema = [];

          if (tpl.components) {
            const bodyComponent = tpl.components.find(c => c.type === 'BODY');
            if (bodyComponent) {
              bodyText = bodyComponent.text || '';
              // Extract variable placeholders like {{1}}, {{2}}
              const varMatches = bodyText.match(/\{\{\d+\}\}/g);
              if (varMatches) {
                variablesSchema = varMatches.map((v, i) => ({
                  index: i + 1,
                  placeholder: v,
                  example: bodyComponent.example?.body_text?.[0]?.[i] || '',
                }));
              }
            }
          }

          await supabase.from('whatsapp_templates').upsert([{
            organization_id: DEFAULT_ORG_ID,
            provider_template_id: tpl.id,
            name: tpl.name,
            language: tpl.language || 'en_US',
            category: tpl.category || 'MARKETING',
            status: tpl.status || 'APPROVED',
            body_text: bodyText,
            variables_schema: variablesSchema,
            campaign_eligible: tpl.category === 'MARKETING',
            last_synced_at: new Date().toISOString(),
          }], { onConflict: 'organization_id,name' });

          results.synced++;
        } catch (err) {
          results.errors.push({ template: tpl.name, error: err.message });
        }
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        message: `Synced ${results.synced} of ${results.fetched} templates from Meta`,
        results,
      }),
    };
  } catch (err) {
    console.error('[Template Sync] Error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
