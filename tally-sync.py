#!/usr/bin/env python3
"""
Tally → Cloud Sync Script (Production-Ready)
=============================================
Runs on the client's office PC where Tally Prime is installed.
Routes ALL data through the cloud tally-sync serverless endpoint
(not directly to Supabase) so it benefits from ledger mapping,
error logging, and sync job tracking.

For TESTING: Point TALLY_HOST to localhost:9000 while running tally-mock-server.js
For PRODUCTION: Tally must have "Enable Tally as HTTP Server" turned ON (port 9000)

Setup:
  pip install requests
  python tally-sync.py

Auto-start on Windows:
  Create a scheduled task (Task Scheduler) to run this every hour at startup.
"""

import requests
import xml.etree.ElementTree as ET
import time
import logging
import json
import os
from datetime import datetime, timedelta

# ── Configuration (use environment variables or defaults) ──────────────────────
TALLY_HOST        = os.environ.get("TALLY_HOST", "http://localhost:9000")
CLOUD_URL         = os.environ.get("ERPPRO_CLOUD_URL", "http://localhost:5173/.netlify/functions/tally-sync")
CONNECTOR_TOKEN   = os.environ.get("TALLY_CONNECTOR_TOKEN", "erppro_tally_sec_token_2026")
ORGANIZATION_ID   = os.environ.get("ORGANIZATION_ID", "00000000-0000-0000-0000-000000000001")
SYNC_INTERVAL_SEC = int(os.environ.get("SYNC_INTERVAL_MINS", "60")) * 60

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("tally-sync.log"),
    ]
)
log = logging.getLogger("tally-sync")

# ── Tally XML Request ──────────────────────────────────────────────────────────
TALLY_REQUEST_XML = """<?xml version="1.0" encoding="utf-8"?>
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

VOUCHER_REQUEST_XML = """<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <SUBTYPE>Vouchers</SUBTYPE>
    <REPORTNAME>List of Vouchers</REPORTNAME>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>"""


def fetch_from_tally():
    """Send XML request to Tally and return parsed vouchers."""
    try:
        log.info(f"Connecting to Tally at {TALLY_HOST}...")
        resp = requests.post(
            TALLY_HOST,
            data=TALLY_REQUEST_XML.encode('utf-8'),
            headers={"Content-Type": "text/xml"},
            timeout=30
        )
        resp.raise_for_status()

        root = ET.fromstring(resp.text)
        vouchers = root.findall(".//VOUCHER")

        # If no VOUCHER elements, try BILL elements
        if not vouchers:
            vouchers = root.findall(".//BILL")

        log.info(f"Tally returned {len(vouchers)} vouchers/bills")
        return vouchers, resp.text
    except requests.exceptions.ConnectionError:
        log.error("Could not connect to Tally. Is Tally Prime running with HTTP Server enabled?")
        return [], ""
    except Exception as e:
        log.error(f"Tally fetch error: {e}")
        return [], ""


def extract_phone(voucher):
    """Try to extract phone number from voucher address/phone fields."""
    phone_tags = ["PHONENUMBER", "MOBILENUMBER", "LEDGERPHONE"]
    for tag in phone_tags:
        el = voucher.find(f".//{tag}")
        if el is not None and el.text:
            # Extract Indian phone number pattern
            import re
            match = re.search(r'(?:\+?91[\s-]?)?[6-9]\d{9}', el.text)
            if match:
                phone = match.group().replace(" ", "").replace("-", "")
                if len(phone) == 10:
                    return "+91" + phone
                if not phone.startswith("+"):
                    return "+" + phone
                return phone

    # Try address fields
    for addr in voucher.findall(".//ADDRESS"):
        if addr.text:
            import re
            match = re.search(r'(?:\+?91[\s-]?)?[6-9]\d{9}', addr.text)
            if match:
                phone = match.group().replace(" ", "").replace("-", "")
                if len(phone) == 10:
                    return "+91" + phone
                return phone

    return ""


def parse_voucher(voucher):
    """Parse a Tally XML voucher element into a dict."""
    def get(tag, default=""):
        el = voucher.find(tag)
        if el is None:
            # Try case-insensitive search
            for child in voucher.iter():
                if child.tag.upper() == tag.upper() and child.text:
                    return child.text.strip()
            return default
        return el.text.strip() if el.text else default

    inv_number = get("VOUCHERNUMBER") or get("NUMBER") or get("NAME")
    if not inv_number:
        return None

    amount_str = get("AMOUNT") or get("CLOSINGBALANCE") or get("OPENINGBALANCE") or "0"
    try:
        amount = abs(float(amount_str))
    except ValueError:
        amount = 0.0

    ledger_name = get("PARTYLEDGERNAME") or get("LEDGERNAME") or get("PARTYNAME") or "Unknown Client"

    # Parse Tally date format: YYYYMMDD → YYYY-MM-DD
    raw_date = get("DATE") or get("VOUCHERDATE") or ""
    due_date = None
    if raw_date and len(raw_date) == 8:
        try:
            invoice_date = datetime.strptime(raw_date, "%Y%m%d")
            due_date = (invoice_date + timedelta(days=30)).strftime("%Y-%m-%d")
        except ValueError:
            due_date = None
    elif raw_date:
        due_date = raw_date

    # Determine status
    is_due = get("ISDUE", "No") == "Yes"
    voucher_type = get("VOUCHERTYPENAME") or get("VOUCHERTYPE") or ""
    if amount == 0 or "receipt" in voucher_type.lower():
        status = "Paid"
    elif is_due or (due_date and due_date < datetime.now().strftime("%Y-%m-%d")):
        status = "Overdue"
    else:
        status = "Pending"

    phone = extract_phone(voucher)

    return {
        "invoice_number": inv_number,
        "ledger_name": ledger_name,
        "phone": phone,
        "amount": amount,
        "status": status,
        "due_date": due_date or datetime.now().strftime("%Y-%m-%d"),
    }


def push_to_cloud(vouchers, is_live_tally):
    """
    Push parsed vouchers to the cloud tally-sync endpoint.
    This ensures data goes through the proper ledger mapping,
    error logging, and sync job tracking pipeline.
    """
    payload = {
        "organizationId": ORGANIZATION_ID,
        "timestamp": datetime.now().isoformat(),
        "connectorStatus": "ONLINE" if is_live_tally else "STANDBY",
        "sourceParsed": is_live_tally,
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
        log.error(f"Failed to push data to cloud: {e}")
        return {"success": False, "error": str(e)}


def run_sync():
    """Execute one full Tally → Cloud sync cycle."""
    log.info("=== Starting Tally sync ===")
    start = time.time()

    vouchers_xml, raw_xml = fetch_from_tally()
    is_live_tally = len(vouchers_xml) > 0

    if not vouchers_xml:
        log.warning("No data from Tally. Skipping push.")
        return 0

    parsed = [parse_voucher(v) for v in vouchers_xml]
    valid = [p for p in parsed if p is not None and p["amount"] > 0]
    log.info(f"Parsed {len(valid)} valid invoices from {len(vouchers_xml)} vouchers")

    if not valid:
        log.warning("No valid invoices to sync.")
        return 0

    # Push through cloud endpoint (not directly to Supabase)
    result = push_to_cloud(valid, is_live_tally)

    if result.get("success"):
        stats = result.get("stats", {})
        log.info(
            f"Cloud sync success: {stats.get('upsertedInvoices', 0)} invoices, "
            f"{stats.get('mappedLedgers', 0)} mapped, "
            f"{stats.get('unmappedLedgers', 0)} unmapped"
        )
    else:
        log.error(f"Cloud sync failed: {result.get('error', 'Unknown error')}")

    elapsed = round(time.time() - start, 2)
    log.info(f"=== Sync complete in {elapsed}s. {len(valid)} records processed. ===\n")
    return len(valid)


if __name__ == "__main__":
    log.info("════════════════════════════════════════════════════════════")
    log.info("  TECHMA ERPPRO — TALLYPRIME PYTHON CONNECTOR")
    log.info("  Version: 4.0 (Production-Ready)")
    log.info("════════════════════════════════════════════════════════════")
    log.info(f"  Tally host: {TALLY_HOST}")
    log.info(f"  Cloud URL:  {CLOUD_URL}")
    log.info(f"  Interval:   every {SYNC_INTERVAL_SEC // 60} minutes")
    log.info("════════════════════════════════════════════════════════════\n")

    while True:
        try:
            run_sync()
        except Exception as e:
            log.error(f"Unexpected error during sync: {e}")

        log.info(f"Next sync in {SYNC_INTERVAL_SEC // 60} minutes...")
        time.sleep(SYNC_INTERVAL_SEC)
