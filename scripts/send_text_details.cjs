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

const texts = [
  {
    phone: '919472697849',
    body: `🧾 *Tax Invoice Dispatched from SHOBHA READY PLAST*\n\nNamaste VIE WIN ENTERPRISES! 🙏\nYour order under Invoice *SRP-SALES-12* has been generated and dispatched from our plant.\n\n📋 *Invoice No:* SRP-SALES-12\n📅 *Date:* 11-Sep-2026\n💰 *Total Amount:* *₹85,050.00*\n📌 *Status:* Pending\n\nYour official 2-Page GST Tax Invoice is attached above as a PDF. Kindly review and share confirmation once received. Thank you for your valued business! 🙏\n_SHOBHA READY PLAST_`
  },
  {
    phone: '918092897590',
    body: `🧾 *Tax Invoice Dispatched from SHOBHA READY PLAST*\n\nNamaste VNR INFRATECH! 🙏\nYour order under Invoice *SRP-SALES-23* has been generated and dispatched from our plant.\n\n📋 *Invoice No:* SRP-SALES-23\n📅 *Date:* 11-Sep-2026\n💰 *Total Amount:* *₹85,050.00*\n📌 *Status:* Pending\n\nYour official 2-Page GST Tax Invoice is attached above as a PDF. Kindly review and share confirmation once received. Thank you for your valued business! 🙏\n_SHOBHA READY PLAST_`
  },
  {
    phone: '919472697849',
    body: `🧾 *Tax Invoice Dispatched from SHOBHA READY PLAST*\n\nNamaste YADAV TRADING COMPANY! 🙏\nYour order under Invoice *SRP-SALES-632* has been generated and dispatched from our plant.\n\n📋 *Invoice No:* SRP-SALES-632\n📅 *Date:* 11-Sep-2026\n💰 *Total Amount:* *₹80,325.00*\n📌 *Status:* Pending\n\nYour official 2-Page GST Tax Invoice is attached above as a PDF. Kindly review and share confirmation once received. Thank you for your valued business! 🙏\n_SHOBHA READY PLAST_`
  }
];

async function sendTexts() {
  for (const t of texts) {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: waHeaders,
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: t.phone,
        type: 'text',
        text: { body: t.body }
      })
    });
    const d = await res.json();
    console.log('Text result to', t.phone, ':', JSON.stringify(d));
  }
}
sendTexts();
