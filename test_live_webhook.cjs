// Simulate exactly what Meta sends when you reply from your phone
const payload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: '1073768118438244',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15550543626', phone_number_id: '1217775984755724' },
        contacts: [{ profile: { name: 'Abhay Kumar' }, wa_id: '918092897590' }],
        messages: [{
          from: '918092897590',
          id: 'wamid.live_test_' + Date.now(),
          timestamp: Math.floor(Date.now() / 1000).toString(),
          text: { body: 'Test live reply from phone - ' + new Date().toLocaleTimeString() },
          type: 'text'
        }]
      },
      field: 'messages'
    }]
  }]
};

async function test() {
  console.log('Sending test webhook POST to live Netlify...');
  const res = await fetch('https://erppro-crm-automation.netlify.app/.netlify/functions/whatsapp-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
}

test().catch(console.error);
