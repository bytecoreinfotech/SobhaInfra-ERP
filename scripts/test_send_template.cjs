const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

const WA_TOKEN = env.WHATSAPP_TOKEN;
const PHONE_ID = env.WHATSAPP_PHONE_ID;
const BASE_URL = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;

const waHeaders = {
  'Authorization': `Bearer ${WA_TOKEN}`,
  'Content-Type': 'application/json'
};

async function sendTemplate() {
  const payload = {
    messaging_product: 'whatsapp',
    to: '919472697849',
    type: 'template',
    template: {
      name: 'invoice_dispatch_v1',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'VIE WIN ENTERPRISES' },
            { type: 'text', text: 'SRP-SALES-12' },
            { type: 'text', text: 'SHOBHA READY PLAST' },
            { type: 'text', text: '11-Sep-2026' },
            { type: 'text', text: 'Rs. 85,050.00' },
            { type: 'text', text: 'Pending' }
          ]
        }
      ]
    }
  };

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: waHeaders,
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  console.log('Template send response:', JSON.stringify(data, null, 2));
}

sendTemplate();
