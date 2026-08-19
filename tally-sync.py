#!/usr/bin/env python3
"""
Tally -> Cloud Sync Script (v4.2 - Debug + Multi-Strategy)
===========================================================
Runs on the client's office PC where TallyPrime is installed.

Setup:
  pip install requests
  python tally-sync.py

DEBUG: Raw XML from Tally is saved to 'tally_debug_response.xml'
       in the same folder so you can inspect what Tally returns.
"""

import requests
import re
import time
import logging
import json
import os
import sys
from datetime import datetime, timedelta

# Fix Windows console Unicode crash
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# -- Configuration --
TALLY_HOST        = os.environ.get("TALLY_HOST", "http://localhost:9000")
CLOUD_URL         = os.environ.get("ERPPRO_CLOUD_URL", "http://localhost:5173/.netlify/functions/tally-sync")
CONNECTOR_TOKEN   = os.environ.get("TALLY_CONNECTOR_TOKEN", "erppro_tally_sec_token_2026")
ORGANIZATION_ID   = os.environ.get("ORGANIZATION_ID", "00000000-0000-0000-0000-000000000001")
SYNC_INTERVAL_SEC = int(os.environ.get("SYNC_INTERVAL_MINS", "60")) * 60
SCRIPT_DIR        = os.path.dirname(os.path.abspath(__file__))

# -- Logging (ASCII only for Windows) --
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(os.path.join(SCRIPT_DIR, "tally-sync.log"), encoding="utf-8"),
    ]
)
log = logging.getLogger("tally-sync")


# ==============================================================================
# TDL XML REQUEST TEMPLATES (5 different strategies)
# ==============================================================================

# Strategy 1: Day Book (captures ALL vouchers regardless of type)
DAYBOOK_XML = """<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Day Book</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>"""

# Strategy 2: List of Vouchers
VOUCHERS_XML = """<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>"""

# Strategy 3: Bills Outstanding
OUTSTANDING_XML = """<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Bills Outstanding</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>"""

# Strategy 4: List of Accounts (All Ledgers)
ACCOUNTS_XML = """<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>"""

# Strategy 5: TALLYMESSAGE Collection export (works on many Tally versions)
COLLECTION_XML = """<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
        <REPORTNAME>Balance Sheet</REPORTNAME>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>"""


# ==============================================================================
# HELPERS
# ==============================================================================

def query_tally(xml_payload, label=""):
    """Send XML request to Tally and return raw response text."""
    try:
        resp = requests.post(
            TALLY_HOST,
            data=xml_payload.encode('utf-8'),
            headers={"Content-Type": "text/xml; charset=utf-8"},
            timeout=30
        )
        text = resp.text
        log.info(f"  [{label}] HTTP {resp.status_code}, response size: {len(text)} bytes")
        return text
    except requests.exceptions.ConnectionError:
        log.error(f"  [{label}] Connection refused. Tally is not running or HTTP server is off.")
        return ""
    except Exception as e:
        log.warning(f"  [{label}] Error: {e}")
        return ""


def save_debug_xml(xml_text, label):
    """Save raw XML to a debug file for inspection."""
    debug_path = os.path.join(SCRIPT_DIR, f"tally_debug_{label}.xml")
    try:
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write(xml_text)
        log.info(f"  [DEBUG] Raw XML saved to: {debug_path}")
    except Exception as e:
        log.warning(f"  [DEBUG] Could not save debug file: {e}")


def extract_tag_value(block, tag_name):
    """Extract the text content of an XML tag using regex. Handles namespaces."""
    pattern = rf"<(?:\w+:)?{tag_name}[^>]*>([^<]+)</(?:\w+:)?{tag_name}>"
    m = re.search(pattern, block, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def extract_phone(text):
    """Extract Indian mobile number from text."""
    if not text:
        return ""
    m = re.search(r'(?:\+?91[\s-]?)?[6-9]\d{9}', text)
    if m:
        phone = m.group().replace(" ", "").replace("-", "")
        if len(phone) == 10:
            return "+91" + phone
        if not phone.startswith("+"):
            return "+" + phone
        return phone
    return ""


def parse_number(s):
    """Parse a number string, handling Tally's negative format and commas."""
    if not s:
        return 0.0
    # Remove commas and whitespace
    s = s.replace(",", "").strip()
    # Handle Tally negative: sometimes shown as -1234.56 or (1234.56)
    s = s.replace("(", "-").replace(")", "")
    try:
        return abs(float(s))
    except ValueError:
        return 0.0


# ==============================================================================
# PARSER: Extract records from ANY Tally XML response
# ==============================================================================

def parse_any_tally_xml(xml_text):
    """
    Universal parser that looks for ANY structured data in Tally XML.
    Searches for: VOUCHER, TALLYMESSAGE, BILL, LEDGER, DSPACCNAME blocks.
    """
    records = []

    if not xml_text or len(xml_text) < 50:
        return records

    # --- Pass 1: TALLYMESSAGE blocks (very common in TallyPrime exports) ---
    tallymsg_blocks = re.findall(
        r'<TALLYMESSAGE[^>]*>([\s\S]*?)</TALLYMESSAGE>',
        xml_text, re.IGNORECASE
    )
    log.info(f"  Parser: Found {len(tallymsg_blocks)} TALLYMESSAGE blocks")

    for block in tallymsg_blocks:
        # Inside TALLYMESSAGE, look for VOUCHER or LEDGER
        voucher_inner = re.findall(r'<VOUCHER[^>]*>([\s\S]*?)</VOUCHER>', block, re.IGNORECASE)
        for vblock in voucher_inner:
            rec = parse_voucher_block(vblock)
            if rec:
                records.append(rec)

        if not voucher_inner:
            ledger_inner = re.findall(r'<LEDGER[^>]*>([\s\S]*?)</LEDGER>', block, re.IGNORECASE)
            for lblock in ledger_inner:
                rec = parse_ledger_block(lblock)
                if rec:
                    records.append(rec)

    # --- Pass 2: Direct VOUCHER blocks (if not nested in TALLYMESSAGE) ---
    if not records:
        voucher_blocks = re.findall(r'<VOUCHER[^>]*>([\s\S]*?)</VOUCHER>', xml_text, re.IGNORECASE)
        log.info(f"  Parser: Found {len(voucher_blocks)} direct VOUCHER blocks")
        for vblock in voucher_blocks:
            rec = parse_voucher_block(vblock)
            if rec:
                records.append(rec)

    # --- Pass 3: BILL blocks (Bills Outstanding report) ---
    if not records:
        bill_blocks = re.findall(
            r'<(?:BILL|BILLCL|BILLFIXED)[^>]*>([\s\S]*?)</(?:BILL|BILLCL|BILLFIXED)>',
            xml_text, re.IGNORECASE
        )
        log.info(f"  Parser: Found {len(bill_blocks)} BILL blocks")
        for bblock in bill_blocks:
            name = (extract_tag_value(bblock, "NAME") or
                    extract_tag_value(bblock, "BILLREF") or
                    extract_tag_value(bblock, "BILLNAME"))
            parent = (extract_tag_value(bblock, "PARENT") or
                      extract_tag_value(bblock, "LEDGERNAME"))
            amount = parse_number(
                extract_tag_value(bblock, "CLOSINGBALANCE") or
                extract_tag_value(bblock, "OPENINGBALANCE") or
                extract_tag_value(bblock, "AMOUNT")
            )
            if (name or parent) and amount > 0:
                records.append({
                    "invoice_number": name or f"BILL-{len(records)+1}",
                    "ledger_name": parent or name or "Client",
                    "phone": extract_phone(bblock),
                    "amount": amount,
                    "status": "Overdue",
                    "due_date": datetime.now().strftime("%Y-%m-%d"),
                })

    # --- Pass 4: LEDGER blocks (from List of Accounts) ---
    if not records:
        ledger_blocks = re.findall(r'<LEDGER[^>]*>([\s\S]*?)</LEDGER>', xml_text, re.IGNORECASE)
        log.info(f"  Parser: Found {len(ledger_blocks)} LEDGER blocks")
        for lblock in ledger_blocks:
            rec = parse_ledger_block(lblock)
            if rec:
                records.append(rec)

    # --- Pass 5: DSPACCNAME (Balance Sheet display names with amounts) ---
    if not records:
        dsp_names = re.findall(r'<DSPACCNAME[^>]*>([^<]+)</DSPACCNAME>', xml_text, re.IGNORECASE)
        dsp_amounts = re.findall(r'<DSPCLAMT[^>]*>([^<]+)</DSPCLAMT>', xml_text, re.IGNORECASE)
        log.info(f"  Parser: Found {len(dsp_names)} DSPACCNAME entries (Balance Sheet)")
        for i, name in enumerate(dsp_names):
            name = name.strip()
            amount = parse_number(dsp_amounts[i]) if i < len(dsp_amounts) else 0.0
            # Skip group headers like "Capital Account", "Current Assets" etc.
            skip_keywords = ['capital', 'current assets', 'current liabilities',
                             'profit', 'loss', 'total', 'loans', 'opening',
                             'duties', 'taxes', 'closing stock', 'cash-in-hand',
                             'bank', 'fixed assets', 'investments']
            if any(kw in name.lower() for kw in skip_keywords):
                continue
            if name and amount > 0:
                records.append({
                    "invoice_number": f"BAL-{name.replace(' ', '')[:12]}",
                    "ledger_name": name,
                    "phone": "",
                    "amount": amount,
                    "status": "Pending",
                    "due_date": datetime.now().strftime("%Y-%m-%d"),
                })

    return records


def parse_voucher_block(block):
    """Parse a single VOUCHER XML block into a dict."""
    vch_number = (extract_tag_value(block, "VOUCHERNUMBER") or
                  extract_tag_value(block, "NUMBER") or
                  extract_tag_value(block, "VCHKEY"))
    party = (extract_tag_value(block, "PARTYLEDGERNAME") or
             extract_tag_value(block, "PARTYNAME") or
             extract_tag_value(block, "LEDGERNAME"))
    amount_str = (extract_tag_value(block, "AMOUNT") or
                  extract_tag_value(block, "CLOSINGBALANCE") or "0")
    raw_date = (extract_tag_value(block, "DATE") or
                extract_tag_value(block, "VOUCHERDATE") or "")
    vch_type = (extract_tag_value(block, "VOUCHERTYPENAME") or
                extract_tag_value(block, "VOUCHERTYPE") or "Sales")

    if not vch_number and not party:
        return None

    amount = parse_number(amount_str)

    # If amount is 0, check nested ALLLEDGERENTRIES / LEDGERENTRIES amounts
    if amount == 0:
        nested_amounts = re.findall(r'<AMOUNT[^>]*>([^<]+)</AMOUNT>', block, re.IGNORECASE)
        for ns in nested_amounts:
            val = parse_number(ns)
            if val > 0:
                amount = val
                break

    if amount == 0:
        return None

    due_date = datetime.now().strftime("%Y-%m-%d")
    if raw_date and len(raw_date) == 8:
        try:
            inv_date = datetime.strptime(raw_date, "%Y%m%d")
            due_date = (inv_date + timedelta(days=30)).strftime("%Y-%m-%d")
        except ValueError:
            pass

    status = "Paid" if "receipt" in vch_type.lower() else "Pending"

    return {
        "invoice_number": vch_number or f"VCH-{(party or 'X')[:8]}-{id(block) % 10000}",
        "ledger_name": party or "Client",
        "phone": extract_phone(block),
        "amount": amount,
        "status": status,
        "due_date": due_date,
    }


def parse_ledger_block(block):
    """Parse a single LEDGER XML block into a dict."""
    name = (extract_tag_value(block, "NAME") or
            extract_tag_value(block, "LEDGERNAME"))
    parent = extract_tag_value(block, "PARENT")
    closing = (extract_tag_value(block, "CLOSINGBALANCE") or
               extract_tag_value(block, "OPENINGBALANCE") or "0")

    amount = parse_number(closing)

    if not name or amount == 0:
        return None

    # Skip system/group ledgers
    skip = ['cash-in-hand', 'profit & loss', 'capital account',
            'duties & taxes', 'bank', 'stock-in-hand',
            'reserves', 'fixed assets', 'investments',
            'indirect expenses', 'direct expenses',
            'indirect incomes', 'direct incomes',
            'purchase accounts', 'sales accounts',
            'opening stock', 'closing stock']
    if name.lower() in skip or parent.lower() in ['primary', '']:
        return None

    return {
        "invoice_number": f"LEDGER-{name.replace(' ', '')[:12]}",
        "ledger_name": name,
        "phone": extract_phone(block),
        "amount": amount,
        "status": "Pending",
        "due_date": datetime.now().strftime("%Y-%m-%d"),
    }


# ==============================================================================
# MAIN SYNC LOGIC
# ==============================================================================

def fetch_from_tally():
    """Try 5 strategies to get data from Tally. Save debug XML."""
    log.info(f"Connecting to Tally at {TALLY_HOST}...")

    strategies = [
        ("1_DayBook",       DAYBOOK_XML),
        ("2_Vouchers",      VOUCHERS_XML),
        ("3_Outstanding",   OUTSTANDING_XML),
        ("4_Accounts",      ACCOUNTS_XML),
        ("5_BalanceSheet",  COLLECTION_XML),
    ]

    all_xml = ""
    for label, xml_payload in strategies:
        log.info(f"Strategy {label}...")
        xml_data = query_tally(xml_payload, label)

        if not xml_data or len(xml_data) < 50:
            log.info(f"  [{label}] Empty or too short response, skipping.")
            continue

        # Save first non-empty response for debugging
        if not all_xml:
            all_xml = xml_data

        save_debug_xml(xml_data, label)

        records = parse_any_tally_xml(xml_data)
        if records:
            log.info(f"  [{label}] SUCCESS: Extracted {len(records)} records!")
            return records, xml_data

        log.info(f"  [{label}] Got XML but parser found 0 matching records.")

    # If all strategies returned XML but 0 parsed, save combined debug
    if all_xml:
        save_debug_xml(all_xml, "LAST_ATTEMPT")
        log.warning("Tally responded but no records were parsed from any strategy.")
        log.warning(f"Please check the debug XML files in: {SCRIPT_DIR}")
        log.warning("Look for: tally_debug_1_DayBook.xml, tally_debug_2_Vouchers.xml, etc.")
    else:
        log.error("Tally did not respond to any request. Is Tally running with HTTP Server on port 9000?")

    return [], all_xml


def push_to_cloud(vouchers):
    """Push parsed records to the cloud tally-sync Netlify endpoint."""
    payload = {
        "organizationId": ORGANIZATION_ID,
        "timestamp": datetime.now().isoformat(),
        "connectorStatus": "Connected",
        "sourceParsed": True,
        "vouchers": vouchers,
    }

    try:
        resp = requests.post(
            CLOUD_URL,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-Connector-Token": CONNECTOR_TOKEN,
                "X-Organization-Id": ORGANIZATION_ID,
            },
            timeout=30,
        )
        result = resp.json()
        return result
    except Exception as e:
        log.error(f"Cloud push failed: {e}")
        return {"success": False, "error": str(e)}


def run_sync():
    """Execute one full Tally -> Cloud sync cycle."""
    log.info("=== Starting Tally sync cycle ===")
    start = time.time()

    records, raw_xml = fetch_from_tally()

    if not records:
        log.warning("No records extracted. Nothing to push to cloud.")
        return 0

    log.info(f"Pushing {len(records)} records to cloud...")
    result = push_to_cloud(records)

    if result.get("success"):
        stats = result.get("stats", {})
        log.info(
            f"SUCCESS: {stats.get('upsertedInvoices', len(records))} invoices synced, "
            f"{stats.get('mappedLedgers', 0)} mapped, "
            f"{stats.get('unmappedLedgers', 0)} unmapped"
        )
        # Show DB errors if any upserts failed
        errors = stats.get("errors", [])
        if errors:
            log.warning(f"DB ERRORS on {len(errors)} record(s):")
            for err in errors[:5]:
                log.warning(f"  - {err.get('voucher', '?')}: {err.get('error', '?')} (code: {err.get('code', '?')})")
    else:
        log.error(f"Cloud error: {result.get('error', 'Unknown')}")
        log.error(f"Full response: {json.dumps(result, indent=2)}")

    elapsed = round(time.time() - start, 2)
    log.info(f"=== Sync complete in {elapsed}s. {len(records)} records. ===\n")
    return len(records)


# ==============================================================================
# ENTRY POINT
# ==============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("  TECHMA ERPPRO - TALLYPRIME CONNECTOR (v4.2 Debug)")
    print("=" * 60)
    print(f"  Tally host: {TALLY_HOST}")
    print(f"  Cloud URL:  {CLOUD_URL}")
    print(f"  Interval:   every {SYNC_INTERVAL_SEC // 60} minutes")
    print(f"  Debug dir:  {SCRIPT_DIR}")
    print("=" * 60)
    print()

    while True:
        try:
            run_sync()
        except Exception as e:
            log.error(f"Unexpected error: {e}")

        log.info(f"Next auto-sync in {SYNC_INTERVAL_SEC // 60} minutes... (Press Ctrl+C to stop)")
        time.sleep(SYNC_INTERVAL_SEC)
