/**
 * Use App Access Token to subscribe messages field + verify configuration
 */
const https = require('https');

const APP_ID     = '1048302701158269';
const APP_SECRET = '97b1161769233e4e6778f178a3dc108b';
const SYSTEM_TOKEN = 'EAAO5bP4en30BSechJ6djYxtfPtupXjDgsLW72pAnjZAcOykmIN7XHRj4bAp9WzuBWDFCMVgwhoY8xVKk3AxVAchmZA3VApLGAeiGj67FkXGevfsSJMftyN4jLuAwKz2haKRbx83Mp6hZCCFVFGrkTIS7tzVjmZCsSxIUsmxvfj5MGtLZCG4Vba4G8hP3FNulU4AZDZD';
const WABA_ID  = '1073768118438244';
const PHONE_ID = '1217775984755724';
const WEBHOOK_URL = 'https://erppro-crm-automation.netlify.app/.netlify/functions/whatsapp-webhook';
const VERIFY_TOKEN = 'erppro_wa_sec_9f8b2c4e1a7d6e5c8302';

// App Access Token = AppID|AppSecret
const APP_TOKEN = `${APP_ID}|${APP_SECRET}`;

function req(path, method = 'GET', params = {}, useAppToken = false) {
  return new Promise((resolve, reject) => {
    const token = useAppToken ? APP_TOKEN : SYSTEM_TOKEN;
    const qs = new URLSearchParams({ ...params, access_token: token }).toString();
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
  console.log('=== 1. Subscribe messages field via App Token ===');
  const r1 = await req(`/${APP_ID}/subscriptions`, 'POST', {
    object: 'whatsapp_business_account',
    callback_url: WEBHOOK_URL,
    verify_token: VERIFY_TOKEN,
    fields: 'messages',
    include_values: 'true',
  }, true); // use App Token
  console.log(JSON.stringify(r1, null, 2));

  console.log('\n=== 2. Check current app subscriptions ===');
  const r2 = await req(`/${APP_ID}/subscriptions`, 'GET', {}, true);
  console.log(JSON.stringify(r2, null, 2));

  console.log('\n=== 3. Re-subscribe WABA with override (refresh) ===');
  const r3 = await req(`/${WABA_ID}/subscribed_apps`, 'POST', {
    override_callback_uri: WEBHOOK_URL,
    verify_token: VERIFY_TOKEN,
  });
  console.log(JSON.stringify(r3, null, 2));

  console.log('\n=== 4. Check phone number registered test recipients ===');
  const r4 = await req(`/${PHONE_ID}?fields=id,display_phone_number,verified_name,name_status,quality_rating,status,certificate,code_verification_status`);
  console.log(JSON.stringify(r4, null, 2));

  console.log('\n=== 5. Check WABA subscriptions final state ===');
  const r5 = await req(`/${WABA_ID}/subscribed_apps`);
  console.log(JSON.stringify(r5, null, 2));
}

run().catch(e => console.error('Fatal:', e.message));
