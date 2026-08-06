/**
 * TALLY MOCK SERVER — for development & testing ONLY
 * 
 * Tally does NOT have a test/sandbox API. It runs locally on port 9000.
 * This script simulates Tally's XML responses so you can test the integration
 * logic BEFORE you have access to the client's Tally Prime PC.
 * 
 * Run: node tally-mock-server.js
 * The real Tally sync script (tally-sync.py) will talk to this instead of Tally.
 */

const http = require('http');

// Simulated Tally data (real estate invoice data)
const MOCK_TALLY_INVOICES = [
  { voucherNumber: 'INV-2026-041', partyName: 'Ravi Mehta', amount: 250000, date: '20260722', isDue: true, ledger: 'Sales Advance' },
  { voucherNumber: 'INV-2026-045', partyName: 'Priya Kapoor', amount: 450000, date: '20260811', isDue: false, ledger: 'Agreement Amount' },
  { voucherNumber: 'INV-2026-032', partyName: 'Kavita Joshi', amount: 50000, date: '20260727', isDue: false, ledger: 'Token Amount' },
  { voucherNumber: 'INV-2026-048', partyName: 'Arjun Sharma', amount: 1000000, date: '20260706', isDue: true, ledger: 'Booking Advance' },
  { voucherNumber: 'INV-2026-052', partyName: 'Manish Gupta', amount: 500000, date: '20260808', isDue: false, ledger: 'Booking Amount' },
  { voucherNumber: 'INV-2026-055', partyName: 'Neha Reddy', amount: 175000, date: '20260815', isDue: false, ledger: 'EMI Payment' },
];

// Generate Tally-format XML response
function generateTallyXML(invoices) {
  const items = invoices.map(inv => `
    <VOUCHER REMOTEID="${inv.voucherNumber}" VCHTYPE="Sales" ACTION="Create">
      <VOUCHERNUMBER>${inv.voucherNumber}</VOUCHERNUMBER>
      <DATE>${inv.date}</DATE>
      <PARTYLEDGERNAME>${inv.partyName}</PARTYLEDGERNAME>
      <AMOUNT>${inv.amount}</AMOUNT>
      <LEDGERNAME>${inv.ledger}</LEDGERNAME>
      <ISDUE>${inv.isDue ? 'Yes' : 'No'}</ISDUE>
    </VOUCHER>`).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <SUBTYPE>Vouchers</SUBTYPE>
    <REPORTNAME>List of Vouchers</REPORTNAME>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>Demo Real Estate Co.</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <COLLECTION>${items}
          </COLLECTION>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    console.log(`[Tally Mock] ${new Date().toISOString()} — ${req.method} ${req.url}`);

    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // All requests return our mock XML (real Tally does this on POST to /)
    const xml = generateTallyXML(MOCK_TALLY_INVOICES);
    res.writeHead(200);
    res.end(xml);
    console.log(`[Tally Mock] Returned ${MOCK_TALLY_INVOICES.length} mock invoices`);
  });
});

const PORT = 9000;
server.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║      TALLY MOCK SERVER — RUNNING           ║');
  console.log(`║      http://localhost:${PORT}                 ║`);
  console.log('║                                            ║');
  console.log('║  Simulates Tally Prime XML API             ║');
  console.log('║  Use this to test tally-sync.py            ║');
  console.log('║  without a real Tally installation         ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
  console.log('Serving', MOCK_TALLY_INVOICES.length, 'mock invoices.');
  console.log('Press Ctrl+C to stop.\n');
});
