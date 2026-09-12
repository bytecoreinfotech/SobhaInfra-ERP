const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = {};
fs.readFileSync('.env', 'utf-8').split('\n').forEach(l => {
  const [k, ...v] = l.trim().split('=');
  if (k && v.length) env[k] = v.join('=').trim();
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log('Fetching all invoices...');
  let allInvs = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.from('invoices').select('id, invoice_number, client_name, amount, company_name, metadata').range(offset, offset + 999);
    if (error || !data || data.length === 0) break;
    allInvs.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log('Total fetched:', allInvs.length);

  const { data: cm } = await supabase.from('customer_master').select('*');
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const cmParties = new Set((cm || []).map(c => norm(c.company_name)));
  const salesParties = new Set();
  const purParties = new Set();

  allInvs.forEach(i => {
    const num = (i.invoice_number || '').toUpperCase();
    if (num.startsWith('LEDGER-') || num.startsWith('OP-')) return;
    const vtype = (i.metadata?.voucher_type || '').toLowerCase();
    const dir = (i.metadata?.direction || '').toLowerCase();
    const name = norm(i.client_name);
    if (!name) return;

    if (vtype.includes('sales') || /^(srp|sb)\//i.test(num) || /^(inv|tax)\//i.test(num) || dir === 'receivable') {
      salesParties.add(name);
    }
    if (vtype.includes('purchase') || /^(pur|po)-/i.test(num) || dir === 'payable') {
      purParties.add(name);
    }
  });

  const ledgers = allInvs.filter(i => (i.invoice_number || '').toUpperCase().startsWith('LEDGER-'));
  console.log('Total LEDGER- records to classify:', ledgers.length);

  let updatedCust = 0;
  let updatedVend = 0;
  let updatedOther = 0;

  const updateQueue = ledgers.map(l => async () => {
    const name = norm(l.client_name);
    let targetDir = 'other';
    if (salesParties.has(name) || cmParties.has(name)) {
      targetDir = 'receivable';
    } else if (purParties.has(name)) {
      targetDir = 'payable';
    }

    const curDir = l.metadata?.direction;
    if (curDir !== targetDir) {
      const newMeta = { ...(l.metadata || {}), direction: targetDir };
      const { error } = await supabase
        .from('invoices')
        .update({ metadata: newMeta })
        .eq('id', l.id);

      if (error) {
        console.error('Update error on', l.invoice_number, error);
      } else {
        if (targetDir === 'receivable') updatedCust++;
        else if (targetDir === 'payable') updatedVend++;
        else updatedOther++;
      }
    }
  });

  // Run in chunks of 20
  for (let i = 0; i < updateQueue.length; i += 20) {
    await Promise.all(updateQueue.slice(i, i + 20).map(fn => fn()));
  }

  console.log(`Migration complete! Updated ${updatedCust} customer ledgers, ${updatedVend} vendor ledgers, ${updatedOther} other ledgers.`);
}

run();
