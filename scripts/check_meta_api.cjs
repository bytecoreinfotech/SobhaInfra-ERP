const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

async function checkWhatsApp() {
  const token = env.WHATSAPP_TOKEN;
  const phoneId = env.WHATSAPP_PHONE_ID;
  console.log('Phone ID:', phoneId);
  console.log('Token prefix:', token.slice(0, 15) + '...');

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();
    console.log('Meta API Response:', data);
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

checkWhatsApp();
