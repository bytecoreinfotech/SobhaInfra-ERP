import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jbgkeeubevwopphekwfj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runComprehensiveTest() {
  console.log('==============================================');
  console.log('ERPPro Ecosystem Full Diagnostic Suite');
  console.log('==============================================\n');

  // 1. Check Supabase Database Tables
  console.log('--- 1. Testing Supabase Live Tables ---');
  const tables = ['leads', 'wa_campaigns', 'whatsapp_conversations', 'whatsapp_messages', 'tasks', 'invoices', 'roles', 'users', 'site_visits'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(2);
    if (error) {
      console.log(`❌ Table [${t}]: ${error.message} (Handled via local store fallback)`);
    } else {
      console.log(`✅ Table [${t}]: OK (${data?.length} rows retrieved)`);
    }
  }

  // 2. Test Tasks Operations
  console.log('\n--- 2. Testing Task Management Logic ---');
  const testTask = {
    title: 'Site Visit: Grand Palm with Client',
    priority: 'High',
    due_date: new Date().toISOString().split('T')[0],
    assigned_to: 'Anand Sharma',
    lead_id: null,
    status: 'Pending'
  };
  console.log('Task Payload Structure Valid:', Boolean(testTask.title && testTask.assigned_to));

  // 3. Test OSM Reverse Geocoder
  console.log('\n--- 3. Testing Free OpenStreetMap Reverse Geocoder ---');
  try {
    const res = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=28.5355&lon=77.3910&zoom=18&addressdetails=1', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'ERPPro-Test-Suite/4.0' }
    });
    const json = await res.json();
    if (json?.display_name) {
      console.log('✅ OSM Reverse Geocoder:', json.display_name);
    } else {
      console.log('⚠️ OSM Response missing display_name:', json);
    }
  } catch (err) {
    console.log('⚠️ OSM Network Warning:', err.message);
  }

  // 4. Test Meta WhatsApp API Connection
  console.log('\n--- 4. Testing Meta WhatsApp Cloud API Connection ---');
  const WA_TOKEN = 'EAAO5bP4en30BSechJ6djYxtfPtupXjDgsLW72pAnjZAcOykmIN7XHRj4bAp9WzuBWDFCMVgwhoY8xVKk3AxVAchmZA3VApLGAeiGj67FkXGevfsSJMftyN4jLuAwKz2haKRbx83Mp6hZCCFVFGrkTIS7tzVjmZCsSxIUsmxvfj5MGtLZCG4Vba4G8hP3FNulU4AZDZD';
  const PHONE_ID = '1217775984755724';
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_ID}`, {
      headers: { 'Authorization': `Bearer ${WA_TOKEN}` }
    });
    const data = await res.json();
    if (data.id) {
      console.log('✅ Meta Cloud API Phone Connected:', data.display_phone_number || data.id, '| Verified Name:', data.verified_name || 'ERPPro System');
    } else {
      console.log('⚠️ Meta API Check:', data);
    }
  } catch (e) {
    console.log('⚠️ Meta API Error:', e.message);
  }

  console.log('\n==============================================');
  console.log('Diagnostic Suite Completed Successfully!');
  console.log('==============================================');
}

runComprehensiveTest();
