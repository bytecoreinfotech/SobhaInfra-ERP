/**
 * SobhaInfra ERP — TallyPrime Secure Local Connector / Bridge
 * 
 * Runs locally on the Windows desktop where TallyPrime is running.
 * Communicates with Tally XML Server on port 9000 and synchronizes with Cloud API.
 *
 * Upgraded Features (All 11 Production Strategies):
 *  - Full Multi-Company Auto-Discovery
 *  - Master Ledger Phone Registry extraction directly from Tally TDL
 *  - 11 Robust XML & TDL Extraction Strategies (including EXPORTALL and Object collections)
 *  - Session-Period-Independent multi-year date range (2024 to 2027+)
 *  - Accurate party phone matching and scoped ledger extraction
 *
 * Usage:
 *   node scripts/tally-connector.js --port 9000 --cloudUrl https://your-domain.netlify.app
 */

const http = require('http');

const TALLY_HOST = process.env.TALLY_HOST || '127.0.0.1';
const TALLY_PORT = process.env.TALLY_PORT || 9000;
const CLOUD_URL  = process.env.ERPPRO_CLOUD_URL || 'http://localhost:5173/.netlify/functions/tally-sync';
const CONNECTOR_TOKEN = process.env.TALLY_CONNECTOR_TOKEN || 'erppro_tally_sec_token_2026';
const ORG_ID     = process.env.ORGANIZATION_ID || '00000000-0000-0000-0000-000000000001';
const POLL_INTERVAL_MS = (process.env.SYNC_INTERVAL_MINS || 15) * 60 * 1000;

// Dynamic Financial Year Boundaries (20240401 to 20270331)
const _now = new Date();
const _curYear = _now.getFullYear();
const _fyStartYear = (_now.getMonth() >= 3 ? _curYear : _curYear - 1) - 2; // 2 FYs back
const _fyEndYear = (_now.getMonth() >= 3 ? _curYear + 1 : _curYear);
const FY_FROM = `${_fyStartYear}0401`;
const FY_TO   = `${_fyEndYear}0331`;

// ── 1. Helper: Query Local Tally Server ───────────────────────────────────────
function queryTally(xmlRequest, label = '') {
  return new Promise((resolve, reject) => {
    const postData = xmlRequest.trim();
    const options = {
      hostname: TALLY_HOST,
      port: TALLY_PORT,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=utf-8',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 30000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { resolve(data); });
    });

    req.on('error', (err) => { reject(err); });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Tally XML server timeout on port ${TALLY_PORT}`));
    });

    req.write(postData);
    req.end();
  });
}

// ── 2. Helper: Company Injection into XML ────────────────────────────────────
function injectCompany(xmlPayload, companyName) {
  if (!companyName) return xmlPayload;
  const companyTag = `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>`;

  const svRegex = /(<STATICVARIABLES>)([\s\S]*?)(<\/STATICVARIABLES>)/i;
  const match = xmlPayload.match(svRegex);
  if (match) {
    let inner = match[2].replace(/<SVCURRENTCOMPANY>[^<]*<\/SVCURRENTCOMPANY>/gi, '');
    const fmtMatch = inner.match(/(<\/SVEXPORTFORMAT>)/i);
    if (fmtMatch) {
      const idx = fmtMatch.index + fmtMatch[0].length;
      inner = inner.slice(0, idx) + `\n          ${companyTag}` + inner.slice(idx);
    } else {
      inner = inner.trimEnd() + `\n          ${companyTag}\n        `;
    }
    return xmlPayload.replace(svRegex, `<STATICVARIABLES>${inner}</STATICVARIABLES>`);
  }
  return xmlPayload;
}

// ── 3. Phone Extraction & Normalization ───────────────────────────────────────
function extractPhone(text) {
  if (!text) return '';
  const str = String(text).trim();
  const m = str.match(/(?:(?:\+?91|0)[\s-]?)?([6-9]\d{4}[\s-]?\d{5}|[6-9]\d{9})/);
  if (m) {
    let digits = m[0].replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    else if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(-10);

    if (digits.length === 10 && ['6','7','8','9'].includes(digits[0])) {
      return '+91' + digits;
    }
  }
  return '';
}

function extractTag(block, tagName) {
  const re = new RegExp(`<(?:\\w+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tagName}>`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

// ── 4. Master Ledger Phone Registry Fetcher ──────────────────────────────────
async function fetchMasterPhoneMap(companyName = '') {
  const phoneMap = {};
  const tdlXml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MasterLedgerPhoneList</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="MasterLedgerPhoneList" ISMODIFY="No">
            <TYPE>Ledger</TYPE>
            <FETCH>NAME, PARENT, LEDMOBILE, LEDPHONENO, MOBILENO, PHONENO, CONTACTNO, GSTIN</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  try {
    const payload = injectCompany(tdlXml, companyName);
    const resp = await queryTally(payload, 'MasterPhones');
    const ledgerBlocks = resp.match(/<LEDGER[^>]*>([\s\S]*?)<\/LEDGER>/gi) || [];
    for (const lb of ledgerBlocks) {
      const name = extractTag(lb, 'NAME') || extractTag(lb, 'LEDGERNAME');
      if (!name) continue;
      const phoneTags = ['LEDMOBILE', 'LEDPHONENO', 'MOBILENO', 'PHONENO', 'CONTACTNO'];
      let phone = '';
      for (const t of phoneTags) {
        const val = extractTag(lb, t);
        if (val) {
          phone = extractPhone(val);
          if (phone) break;
        }
      }
      if (phone) {
        phoneMap[name.trim().toLowerCase()] = phone;
      }
    }
  } catch (err) {
    console.warn(`[PhoneMap] Could not fetch TDL phone master: ${err.message}`);
  }
  return phoneMap;
}

// ── 5. XML Parser — Parse Vouchers with Scoped Party Phone ───────────────────
function parseTallyVouchers(xmlString, fallbackCompany = '', phoneMap = {}) {
  const vouchers = [];
  if (!xmlString || xmlString.length < 50) return vouchers;

  const voucherRegex = /<VOUCHER[^>]*>([\s\S]*?)<\/VOUCHER>/gi;
  let match;

  while ((match = voucherRegex.exec(xmlString)) !== null) {
    const block = match[1];

    const voucherNumber = extractTag(block, 'VOUCHERNUMBER') || extractTag(block, 'NUMBER') || extractTag(block, 'VCHKEY');
    const party = extractTag(block, 'BASICBUYERNAME') || extractTag(block, 'PARTYLEDGERNAME') || extractTag(block, 'PARTYNAME') || extractTag(block, 'LEDGERNAME');
    const amountStr = extractTag(block, 'AMOUNT') || extractTag(block, 'CLOSINGBALANCE') || '0';
    const date = extractTag(block, 'DATE') || extractTag(block, 'VOUCHERDATE') || '';
    const voucherType = extractTag(block, 'VOUCHERTYPENAME') || extractTag(block, 'VOUCHERTYPE') || 'Sales';
    const compName = extractTag(block, 'SVCURRENTCOMPANY') || extractTag(block, 'COMPANYNAME') || fallbackCompany || 'Tally Company';

    if (!voucherNumber && !party) continue;

    const rawAmt = parseFloat(amountStr.replace(/[^\d.-]/g, '')) || 0;
    const amount = Math.abs(rawAmt);
    if (amount === 0) continue;

    let invoiceDate = '';
    let dueDate = '';
    if (date && date.length === 8) {
      invoiceDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
      const d = new Date(invoiceDate);
      d.setDate(d.getDate() + 30);
      dueDate = d.toISOString().split('T')[0];
    } else if (date) {
      invoiceDate = date;
      dueDate = date;
    } else {
      invoiceDate = new Date().toISOString().split('T')[0];
      dueDate = invoiceDate;
    }

    const vchLower = voucherType.toLowerCase();
    const isReceipt = vchLower.includes('receipt');
    const isOutgoing = ['purchase', 'payment', 'credit note'].some(t => vchLower.includes(t));

    let status = 'Pending';
    let direction = 'receivable';
    if (isReceipt) {
      status = 'Paid';
      direction = 'received';
    } else if (isOutgoing) {
      status = 'Paid';
      direction = 'paid_out';
    }

    // Resolve party phone from Master Phone Map or XML block
    let phone = '';
    if (party && phoneMap[party.trim().toLowerCase()]) {
      phone = phoneMap[party.trim().toLowerCase()];
    }
    if (!phone) {
      const topBlock = block.split(/<(?:ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST/i)[0];
      for (const t of ['BASICBUYERPHONE', 'PARTYPHONE', 'LEDMOBILE', 'LEDPHONENO', 'MOBILENO', 'PHONENO']) {
        const val = extractTag(topBlock, t);
        if (val) {
          phone = extractPhone(val);
          if (phone) break;
        }
      }
    }

    vouchers.push({
      invoice_number: voucherNumber || `VCH-${(party || 'X').slice(0, 8)}`,
      ledger_name: party,
      client_name: party,
      phone: phone,
      amount: amount,
      invoice_date: invoiceDate,
      due_date: dueDate,
      status: status,
      voucher_type: voucherType,
      company_name: compName,
      metadata: { direction, voucher_type: voucherType },
    });
  }

  return vouchers;
}

// ── 6. ALL 11 TDL XML REQUEST TEMPLATES ───────────────────────────────────────
// ROOT CAUSE FIX: Previous strategies 1-5 used 'Export Data' + 'REPORTNAME' which
// Tally ignores and returns 'All Masters' instead. Strategies 6-9 use the correct
// TDL Collection API (Export + TYPE:Collection) which bypasses session period entirely.
const STRATEGIES = [
  // ─── Primary TDL Collection strategies (session-period-independent) ──────
  // 1. ALL vouchers, NO date filter — most comprehensive (entire company voucher DB)
  {
    name: '1_AllVouchersUnfiltered',
    xml: `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AllVouchersFull</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AllVouchersFull" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, BASICBUYERNAME, AMOUNT, NARRATION, PARTYGSTIN, BASICBUYERADDRESS, ALLLEDGERENTRIES, INVENTORYENTRIES.LIST</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`,
  },
  // 2. All vouchers with $$IsInRange date filter (current 3 FYs)
  {
    name: '2_AllVouchersTDL',
    xml: `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AllVouchersByDate</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AllVouchersByDate" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, BASICBUYERNAME, AMOUNT, NARRATION, PARTYGSTIN, BASICBUYERADDRESS, ISOPTIONAL, ALLLEDGERENTRIES, INVENTORYENTRIES.LIST</FETCH>
            <FILTER>FilterByDateRange</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="FilterByDateRange">
            $$IsInRange:$Date:${FY_FROM}:${FY_TO}
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`,
  },
  // 3. Sundry Debtors TDL Collection (party closing balances + contacts)
  {
    name: '3_SundryDebtors',
    xml: `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>Sundry Debtors List</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="Sundry Debtors List" ISMODIFY="No">
            <TYPE>Ledger</TYPE>
            <BELONGSTO>Sundry Debtors</BELONGSTO>
            <FETCH>NAME, PARENT, CLOSINGBALANCE, OPENINGBALANCE, LEDPHONENO, LEDMOBILE, ADDRESS, PINCODE, EMAIL, GSTIN</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`,
  },
  // 4. All Ledgers — Sundry Debtors + Creditors (all party masters)
  {
    name: '4_AllPartyLedgers',
    xml: `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AllPartyLedgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AllPartyLedgers" ISMODIFY="No">
            <TYPE>Ledger</TYPE>
            <FETCH>NAME, PARENT, CLOSINGBALANCE, OPENINGBALANCE, LEDPHONENO, LEDMOBILE, ADDRESS, PINCODE, EMAIL, GSTIN</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`,
  },
  // 5. Sales + Receipt vouchers type-filtered TDL
  {
    name: '5_SalesVouchers',
    xml: `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>SalesVouchersOnly</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="SalesVouchersOnly" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, BASICBUYERNAME, AMOUNT, NARRATION, PARTYGSTIN, BASICBUYERADDRESS, ALLLEDGERENTRIES, INVENTORYENTRIES.LIST</FETCH>
            <FILTER>SalesVouchersFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="SalesVouchersFilter">
            $VoucherTypeName = "Sales" OR $VoucherTypeName = "Sales Order" OR
            $VoucherTypeName = "Receipt" OR $VoucherTypeName = "Cash Receipt" OR
            $VoucherTypeName = "Bank Receipt" OR $VoucherTypeName = "Debit Note"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`,
  },
  // 6. Bills Outstanding TDL Collection
  {
    name: '6_BillsOutstanding',
    xml: `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AllBillsOutstanding</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AllBillsOutstanding" ISMODIFY="No">
            <TYPE>BillOutstanding</TYPE>
            <FETCH>NAME, BILLNAME, CLOSINGBALANCE, OPENINGBALANCE, PARENT, LEDGERNAME, BILLDATED, BILLCL</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`,
  },
  // 7. Receipt + Payment vouchers TDL type-filtered
  {
    name: '7_ReceiptPayment',
    xml: `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ReceiptPaymentVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ReceiptPaymentVouchers" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, BASICBUYERNAME, AMOUNT, NARRATION, ALLLEDGERENTRIES</FETCH>
            <FILTER>ReceiptPaymentFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="ReceiptPaymentFilter">
            $VoucherTypeName = "Receipt" OR $VoucherTypeName = "Payment" OR
            $VoucherTypeName = "Cash Receipt" OR $VoucherTypeName = "Bank Receipt" OR
            $VoucherTypeName = "Cash Payment" OR $VoucherTypeName = "Bank Payment"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`,
  },
  // 8. Ledger vouchers with date range (TDL)
  {
    name: '8_LedgerVouchers',
    xml: `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>LedgerVoucherEntries</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="LedgerVoucherEntries" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, BASICBUYERNAME, AMOUNT, NARRATION, ALLLEDGERENTRIES</FETCH>
            <FILTER>LedgerVoucherFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="LedgerVoucherFilter">
            $$IsInRange:$Date:${FY_FROM}:${FY_TO}
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`,
  },
  // 9. Sundry Debtor Balance TDL
  {
    name: '9_DebtorBalance',
    xml: `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>SundryDebtorBalance</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="SundryDebtorBalance" ISMODIFY="No">
            <TYPE>Ledger</TYPE>
            <BELONGSTO>Sundry Debtors</BELONGSTO>
            <FETCH>NAME, CLOSINGBALANCE, LEDPHONENO, LEDMOBILE, GSTIN</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`,
  },
  // ─── FALLBACK: ExportAll object dump ────────────────────────────────────────
  // 10. EXPORTALL=Yes — entire voucher object database dump
  {
    name: '10_ExportAllVouchers',
    xml: `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <EXPORTALL>Yes</EXPORTALL>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`,
  },
  // 11. Sales Register with EXPORTALL + max date range
  {
    name: '11_SalesRegisterFull',
    xml: `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Sales Register</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <EXPORTALL>Yes</EXPORTALL>
          <SVFROMDATE>19000101</SVFROMDATE>
          <SVTODATE>20501231</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`,
  },
];

// ── 7. Multi-Company Auto-Discovery ──────────────────────────────────────────
async function discoverCompanies() {
  const companyXml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>OpenCompanies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="OpenCompanies" ISMODIFY="No">
            <TYPE>Company</TYPE>
            <FETCH>NAME</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  try {
    const resp = await queryTally(companyXml, 'DiscoverCompanies');
    const compMatches = resp.match(/<COMPANY[^>]+NAME="([^"]+)"/gi) || [];
    const names = [];
    for (const cm of compMatches) {
      const m = cm.match(/NAME="([^"]+)"/i);
      if (m && m[1] && !names.includes(m[1])) {
        names.push(m[1].trim());
      }
    }
    return names.length > 0 ? names : [''];
  } catch (err) {
    return [''];
  }
}

// ── 8. Helper: Push Clean Data to Cloud Backend ────────────────────────────────
async function pushToCloud(payload) {
  try {
    const res = await fetch(CLOUD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Connector-Token': CONNECTOR_TOKEN,
        'X-Organization-Id': ORG_ID,
      },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.error('[Tally Bridge] Failed to push data to cloud:', err.message);
    return { success: false, error: err.message };
  }
}

// ── 9. Main Synchronization Cycle ─────────────────────────────────────────────
async function runSyncCycle() {
  console.log(`\n🔄 [${new Date().toLocaleTimeString()}] Starting TallyPrime Multi-Strategy Sync Cycle...`);

  try {
    console.log(`📡 Connecting to Tally XML Server at http://${TALLY_HOST}:${TALLY_PORT}...`);
    const companies = await discoverCompanies();
    console.log(`🏢 Detected ${companies.length} company context(s): ${companies.join(', ') || 'Default Active'}`);

    const allVouchers = [];
    const seenKeys = new Set();

    for (const comp of companies) {
      console.log(`\n--- Querying Tally Company: [${comp || 'Default'}] ---`);
      const phoneMap = await fetchMasterPhoneMap(comp);
      console.log(`  📞 Master Ledger Phone Registry: ${Object.keys(phoneMap).length} contacts loaded`);

      for (let i = 0; i < STRATEGIES.length; i++) {
        const strat = STRATEGIES[i];
        try {
          const payload = injectCompany(strat.xml, comp);
          const xmlResp = await queryTally(payload, strat.name);
          if (xmlResp && xmlResp.length > 50) {
            const parsed = parseTallyVouchers(xmlResp, comp, phoneMap);
            let newCount = 0;
            for (const v of parsed) {
              const key = `${v.company_name}_${v.invoice_number}`;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                allVouchers.push(v);
                newCount++;
              }
            }
            console.log(`  [Strategy ${i+1}/11] ${strat.name}: +${newCount} new vouchers (total: ${allVouchers.length})`);
          }
        } catch (stratErr) {
          // Continue to next strategy
        }
      }
    }

    if (allVouchers.length > 0) {
      console.log(`\n☁️ Pushing ${allVouchers.length} clean vouchers to cloud endpoint...`);
      const syncPayload = {
        organizationId: ORG_ID,
        timestamp: new Date().toISOString(),
        connectorStatus: 'ONLINE',
        sourceParsed: true,
        vouchers: allVouchers,
      };
      const cloudRes = await pushToCloud(syncPayload);
      console.log('☁️ Cloud Sync Result:', JSON.stringify(cloudRes));
    } else {
      console.warn('⚠️ No vouchers collected across all 11 strategies. Ensure Tally is open and port 9000 is active.');
    }
  } catch (err) {
    console.error('❌ Sync Cycle Exception:', err.message);
  }
}

// ── 10. Daemon Loop ───────────────────────────────────────────────────────────
console.log('════════════════════════════════════════════════════════════');
console.log('  SOBHAINFRA ERP — TALLYPRIME LOCAL CONNECTOR BRIDGE (JS)');
console.log('  Version: 5.0 (All 11 Production Strategies Enabled)');
console.log('════════════════════════════════════════════════════════════');
console.log(`  Target Tally: http://${TALLY_HOST}:${TALLY_PORT}`);
console.log(`  Cloud URL   : ${CLOUD_URL}`);
console.log(`  Interval    : Every ${POLL_INTERVAL_MS / 60000} mins`);
console.log('════════════════════════════════════════════════════════════\n');

runSyncCycle();
setInterval(runSyncCycle, POLL_INTERVAL_MS);
