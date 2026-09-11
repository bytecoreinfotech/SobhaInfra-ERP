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

const items = [
  {
    to: '918092897590',
    client: 'VNR INFRATECH',
    invNum: 'SRP-SALES-23',
    company: 'SHOBHA READY PLAST',
    date: '11-Sep-2026',
    amt: 'Rs. 85,050.00'
  },
  {
    to: '919472697849',
    client: 'YADAV TRADING COMPANY',
    invNum: 'SRP-SALES-632',
    company: 'SHOBHA READY PLAST',
    date: '11-Sep-2026',
    amt: 'Rs. 80,325.00'
  }
];

async function sendRemaining() {
  for (const it of items) {
    const payload = {
      messaging_product: 'whatsapp',
      to: it.to,
      type: 'template',
      template: {
        name: 'invoice_dispatch_v1',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: it.client },
              { type: 'text', text: it.invNum },
              { type: 'text', text: it.company },
              { type: 'text', text: it.date },
              { type: 'text', text: it.amt },
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
    console.log(`Sent ${it.invNum} to ${it.to}:`, JSON.stringify(data));
  }
}

sendRemaining();
