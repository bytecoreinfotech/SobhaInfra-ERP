/**
 * Meta WhatsApp Webhook Subscription Diagnostics & Fix
 * Checks current subscription state and re-subscribes if needed
 */

const TOKEN = 'EAAO5bP4en30BSechJ6djYxtfPtupXjDgsLW72pAnjZAcOykmIN7XHRj4bAp9WzuBWDFCMVgwhoY8xVKk3AxVAchmZA3VApLGAeiGj67FkXGevfsSJMftyN4jLuAwKz2haKRbx83Mp6hZCCFVFGrkTIS7tzVjmZCsSxIUsmxvfj5MGtLZCG4Vba4G8hP3FNulU4AZDZD';
const PHONE_ID = '1217775984755724';
const WABA_ID  = '1073768118438244';
const WEBHOOK_URL = 'https://erppro-crm-automation.netlify.app/.netlify/functions/whatsapp-webhook';
const VERIFY_TOKEN = 'erppro_wa_sec_9f8b2c4e1a7d6e5c8302';

async function gql(path, method = 'GET', body = null) {
  const url = `https://graph.facebook.com/v20.0${path}${path.includes('?') ? '&' : '?'}access_token=${TOKEN}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  return r.json();
}

async function diagnoseAndFix() {
  console.log('=== 1. Check WABA subscription status ===');
  const wabaInfo = await gql(`/${WABA_ID}/subscribed_apps`);
  console.log(JSON.stringify(wabaInfo, null, 2));

  console.log('\n=== 2. Check Phone Number info ===');
  const phoneInfo = await gql(`/${PHONE_ID}?fields=id,display_phone_number,verified_name,quality_rating,status`);
  console.log(JSON.stringify(phoneInfo, null, 2));

  console.log('\n=== 3. Get App ID from token ===');
  const me = await gql('/me?fields=id,name');
  console.log(JSON.stringify(me, null, 2));

  console.log('\n=== 4. Subscribe WABA to app (ensures webhook events flow) ===');
  const subResult = await gql(`/${WABA_ID}/subscribed_apps`, 'POST');
  console.log('Subscribe result:', JSON.stringify(subResult));

  console.log('\n=== 5. Check App webhook subscriptions ===');
  // Get app ID first
  const appId = me?.id;
  if (appId) {
    const appWebhooks = await gql(`/${appId}/subscriptions`);
    console.log('App subscriptions:', JSON.stringify(appWebhooks, null, 2));
  }

  console.log('\n=== DONE ===');
  console.log('Webhook URL to verify in Meta Portal:', WEBHOOK_URL);
  console.log('Verify token:', VERIFY_TOKEN);
}

diagnoseAndFix().catch(e => console.error('Error:', e.message));
