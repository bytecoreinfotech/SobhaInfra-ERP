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

const targets = [
  {
    invNum: 'SRP-SALES-12',
    client: 'VIE WIN ENTERPRISES',
    phone: '919472697849',
    amount: '₹85,050.00',
    date: '11-Sep-2026',
    pdfUrl: 'https://mcgmppnvnwnilioapbli.supabase.co/storage/v1/object/public/whatsapp-media/invoices/SRP_SALES_12_1789112981.pdf'
  },
  {
    invNum: 'SRP-SALES-23',
    client: 'VNR INFRATECH',
    phone: '918092897590',
    amount: '₹85,050.00',
    date: '11-Sep-2026',
    pdfUrl: 'https://mcgmppnvnwnilioapbli.supabase.co/storage/v1/object/public/whatsapp-media/invoices/SRP_SALES_23_1789112986.pdf'
  },
  {
    invNum: 'SRP-SALES-632',
    client: 'YADAV TRADING COMPANY',
    phone: '919472697849',
    amount: '₹80,325.00',
    date: '11-Sep-2026',
    pdfUrl: 'https://mcgmppnvnwnilioapbli.supabase.co/storage/v1/object/public/whatsapp-media/invoices/SRP_SALES_632_1789112994.pdf'
  }
];

async function dispatchAll() {
  for (const t of targets) {
    console.log(`\n=== Dispatching ${t.invNum} to ${t.client} (${t.phone}) ===`);

    // 1. Try sending document directly
    console.log('1. Attempting direct PDF document send...');
    const docRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: waHeaders,
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: t.phone,
        type: 'document',
        document: {
          link: t.pdfUrl,
          filename: `Invoice_${t.invNum}.pdf`,
          caption: `🧾 Tax Invoice ${t.invNum} | ${t.amount} | SHOBHA READY PLAST`
        }
      })
    });
    const docData = await docRes.json();
    console.log('Document send result:', JSON.stringify(docData));

    // 2. If document send failed due to 24h window (code 131047)
    if (docData.error && docData.error.code === 131047) {
      console.log('2. Customer is outside 24h window. Sending approved Meta template invoice_dispatch_v1...');
      const tplRes = await fetch(BASE_URL, {
        method: 'POST',
        headers: waHeaders,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: t.phone,
          type: 'template',
          template: {
            name: 'invoice_dispatch_v1',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: t.client },
                  { type: 'text', text: t.invNum },
                  { type: 'text', text: 'SHOBHA READY PLAST' },
                  { type: 'text', text: t.date },
                  { type: 'text', text: t.amount },
                  { type: 'text', text: 'Pending' }
                ]
              }
            ]
          }
        })
      });
      const tplData = await tplRes.json();
      console.log('Template send result:', JSON.stringify(tplData));
    }
  }
}

dispatchAll();
