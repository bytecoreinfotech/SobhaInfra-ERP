const https = require('https');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Parse .env
const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = (match[2] || '').trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1]] = val;
  }
});

const SUPABASE_URL = env.SUPABASE_URL || 'https://mcgmppnvnwnilioapbli.supabase.co';
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
const WA_TOKEN = env.WHATSAPP_TOKEN;
const PHONE_ID = env.WHATSAPP_PHONE_ID;
const WABA_ID = env.VITE_WHATSAPP_BUSINESS_ID;

function api(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, raw: data }); }
      });
    }).on('error', err => resolve({ error: err.message }));
  });
}

async function run() {
  console.log('====================================================');
  console.log('        SOBHAINFRA ERP COMPLETE SYSTEM AUDIT        ');
  console.log('====================================================\n');

  // 1. Database Check
  console.log('[1/4] Supabase Database Tables Check:');
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const tables = ['whatsapp_contacts', 'whatsapp_conversations', 'whatsapp_messages', 'ai_knowledge', 'leads'];
    for (const t of tables) {
      const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
      if (error) console.log(`  ❌ ${t}: ${error.message}`);
      else console.log(`  ✅ ${t}: OK (Current rows: ${count})`);
    }
  } catch (e) {
    console.log('  ❌ Database error:', e.message);
  }

  // 2. Meta WhatsApp API Check
  console.log('\n[2/4] Meta WhatsApp Cloud API Check:');
  const phoneRes = await api(`https://graph.facebook.com/v20.0/${PHONE_ID}?fields=id,display_phone_number,verified_name,code_verification_status,status&access_token=${WA_TOKEN}`);
  if (phoneRes.data && phoneRes.data.id) {
    console.log(`  ✅ Phone ID: ${phoneRes.data.id}`);
    console.log(`  ✅ Number: ${phoneRes.data.display_phone_number}`);
    console.log(`  ✅ Verified Name: ${phoneRes.data.verified_name}`);
    console.log(`  ✅ Code Status: ${phoneRes.data.code_verification_status}`);
    console.log(`  ℹ️ Phone Status: ${phoneRes.data.status}`);
  } else {
    console.log('  ❌ Phone API Error:', phoneRes);
  }

  // 3. WABA Subscribed Apps Check
  console.log('\n[3/4] WABA Webhook Subscription Check:');
  const subRes = await api(`https://graph.facebook.com/v20.0/${WABA_ID}/subscribed_apps?access_token=${WA_TOKEN}`);
  if (subRes.data && Array.isArray(subRes.data.data) && subRes.data.data.length > 0) {
    console.log(`  ✅ App Linked: ${subRes.data.data[0].whatsapp_business_api_data.name} (App ID: ${subRes.data.data[0].whatsapp_business_api_data.id})`);
  } else {
    console.log('  ⚠️ WABA Subscriptions:', subRes);
  }

  // 4. Live Netlify Webhook Check
  console.log('\n[4/4] Live Netlify Webhook Handshake Check:');
  const whRes = await api(`https://sobhainfra-erp.netlify.app/.netlify/functions/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=erppro_webhook_2026&hub.challenge=VERIFIED_200`);
  if (whRes.raw === 'VERIFIED_200' || (whRes.data && whRes.data === 'VERIFIED_200')) {
    console.log('  ✅ Live Webhook: 200 OK (Handshake challenge verified successfully)');
  } else {
    console.log('  ⚠️ Webhook response:', whRes);
  }

  console.log('\n====================================================');
  console.log('             SYSTEM AUDIT COMPLETED                 ');
  console.log('====================================================');
}

run();
