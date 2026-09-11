import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data } = await supabase.from('invoices').select('id, invoice_number, client_name, client_phone, amount, status, due_date, pdf_url, metadata').in('invoice_number', ['SRP-SALES-12', 'SRP-SALES-23', 'SRP-SALES-632']);
  console.log(JSON.stringify(data, null, 2));
}
check();
