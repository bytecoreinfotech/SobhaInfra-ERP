/**
 * Fix Meta webhook subscription using node https module
 */
const https = require('https');

const TOKEN = 'EAAO5bP4en30BSechJ6djYxtfPtupXjDgsLW72pAnjZAcOykmIN7XHRj4bAp9WzuBWDFCMVgwhoY8xVKk3AxVAchmZA3VApLGAeiGj67FkXGevfsSJMftyN4jLuAwKz2haKRbx83Mp6hZCCFVFGrkTIS7tzVjmZCsSxIUsmxvfj5MGtLZCG4Vba4G8hP3FNulU4AZDZD';
const PHONE_ID = '1217775984755724';
const WABA_ID  = '1073768118438244';
const WEBHOOK_URL = 'https://erppro-crm-automation.netlify.app/.netlify/functions/whatsapp-webhook';
const VERIFY_TOKEN = 'erppro_wa_sec_9f8b2c4e1a7d6e5c8302';

function request(path, method = 'GET', postData = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://graph.facebook.com/v20.0${path}`);
    if (method === 'GET') url.searchParams.set('access_token', TOKEN);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const body = postData
      ? JSON.stringify({ ...postData, access_token: TOKEN })
      : null;

    if (body) options.headers['Content-Length'] = Buffer.byteLength(body);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  console.log('=== 1. Current WABA subscriptions ===');
  const subs = await request(`/${WABA_ID}/subscribed_apps`);
  console.log(JSON.stringify(subs, null, 2));

  console.log('\n=== 2. Phone number info ===');
  const phone = await request(`/${PHONE_ID}?fields=id,display_phone_number,verified_name,status,quality_rating`);
  console.log(JSON.stringify(phone, null, 2));

  console.log('\n=== 3. Subscribe our app to WABA with webhook override ===');
  const sub = await request(`/${WABA_ID}/subscribed_apps`, 'POST', {
    override_callback_uri: WEBHOOK_URL,
    verify_token: VERIFY_TOKEN,
  });
  console.log('Subscription result:', JSON.stringify(sub));

  console.log('\n=== 4. Check subscription again ===');
  const subs2 = await request(`/${WABA_ID}/subscribed_apps`);
  console.log(JSON.stringify(subs2, null, 2));
}

run().catch(e => console.error('Error:', e.message));
