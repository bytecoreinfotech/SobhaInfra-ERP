/**
 * Subscribe ERP Pro app to WhatsApp messages webhook field
 * Uses Graph API app subscriptions endpoint
 */
const https = require('https');

const SYSTEM_USER_TOKEN = 'EAAO5bP4en30BSechJ6djYxtfPtupXjDgsLW72pAnjZAcOykmIN7XHRj4bAp9WzuBWDFCMVgwhoY8xVKk3AxVAchmZA3VApLGAeiGj67FkXGevfsSJMftyN4jLuAwKz2haKRbx83Mp6hZCCFVFGrkTIS7tzVjmZCsSxIUsmxvfj5MGtLZCG4Vba4G8hP3FNulU4AZDZD';
const APP_ID  = '1048302701158269';
const WABA_ID = '1073768118438244';
const PHONE_ID = '1217775984755724';
const WEBHOOK_URL = 'https://erppro-crm-automation.netlify.app/.netlify/functions/whatsapp-webhook';
const VERIFY_TOKEN = 'erppro_wa_sec_9f8b2c4e1a7d6e5c8302';

function req(path, method = 'GET', params = {}) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ ...params, access_token: SYSTEM_USER_TOKEN }).toString();
    const fullPath = method === 'GET' 
      ? `/v20.0${path}?${qs}`
      : `/v20.0${path}`;
    
    const body = method !== 'GET' ? qs : null;
    const opts = {
      hostname: 'graph.facebook.com',
      path: fullPath,
      method,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    };
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);

    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

async function run() {
  // 1. Try subscribing app to WhatsApp messages field
  console.log('=== Try 1: POST /{APP_ID}/subscriptions with messages field ===');
  const r1 = await req(`/${APP_ID}/subscriptions`, 'POST', {
    object: 'whatsapp_business_account',
    callback_url: WEBHOOK_URL,
    verify_token: VERIFY_TOKEN,
    fields: 'messages',
    include_values: 'true',
  });
  console.log(JSON.stringify(r1, null, 2));

  // 2. Check current app subscriptions
  console.log('\n=== Try 2: GET app subscriptions ===');
  const r2 = await req(`/${APP_ID}/subscriptions`);
  console.log(JSON.stringify(r2, null, 2));

  // 3. WABA level - subscribe with specific fields
  console.log('\n=== Try 3: Subscribe WABA with fields ===');
  const r3 = await req(`/${WABA_ID}/subscribed_apps`, 'POST', {
    override_callback_uri: WEBHOOK_URL,
    verify_token: VERIFY_TOKEN,
  });
  console.log(JSON.stringify(r3, null, 2));

  // 4. Check what phone numbers can send to test number
  console.log('\n=== Try 4: Get test recipient numbers ===');
  const r4 = await req(`/${PHONE_ID}/to_recipients`);
  console.log(JSON.stringify(r4, null, 2));

  // 5. Verify our webhook URL responds correctly
  console.log('\n=== Try 5: Manually verify webhook URL with Meta ===');
  const challenge = 'test_verify_' + Date.now();
  const verifyUrl = `${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=${challenge}`;
  console.log('Verify URL:', verifyUrl);
  const r5 = await new Promise((resolve) => {
    const u = new URL(verifyUrl);
    https.get({ hostname: u.hostname, path: u.pathname + u.search }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', e => resolve('Error: ' + e.message));
  });
  console.log('Webhook verify response (should match challenge):', r5);
  console.log('Match:', r5.trim() === challenge ? '✅ YES' : '❌ NO');
}

run().catch(e => console.error('Fatal:', e.message));
