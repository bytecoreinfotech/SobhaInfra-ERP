#!/usr/bin/env python3
"""
Tally → Supabase Sync Script
=============================
Runs on the client's office PC where Tally Prime is installed.
Every hour, it reads pending invoices from Tally and pushes them to Supabase.

For TESTING: Point TALLY_HOST to localhost:9000 while running tally-mock-server.js
For PRODUCTION: Tally must have "Enable Tally as HTTP Server" turned ON (port 9000)

Setup:
  pip install requests supabase
  python tally-sync.py

Auto-start on Windows:
  Create a scheduled task (Task Scheduler) to run this every hour at startup.
"""

import requests
import xml.etree.ElementTree as ET
import time
import logging
from datetime import datetime
from supabase import create_client

# ── Configuration ──────────────────────────────────────────────────────────────
TALLY_HOST        = "http://localhost:9000"       # Change to Tally PC IP if running remotely
SUPABASE_URL      = "https://jbgkeeubevwopphekwfj.supabase.co"
SUPABASE_KEY      = "sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB"
SYNC_INTERVAL_SEC = 3600  # Every 1 hour

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
        resp = requests.post(TALLY_HOST, data=TALLY_REQUEST_XML.encode('utf-8'),
                             headers={"Content-Type": "text/xml"}, timeout=30)
        resp.raise_for_status()

        root = ET.fromstring(resp.text)
        vouchers = root.findall(".//VOUCHER")
        log.info(f"Tally returned {len(vouchers)} vouchers")
        return vouchers
    except requests.exceptions.ConnectionError:
        log.error("Could not connect to Tally. Is Tally Prime running with HTTP Server enabled?")
        return []
    except Exception as e:
        log.error(f"Tally fetch error: {e}")
        return []

def parse_voucher(voucher):
    """Parse a Tally XML voucher element into a dict."""
    def get(tag, default=""):
        el = voucher.find(tag)
        return el.text.strip() if el is not None and el.text else default

    inv_number = get("VOUCHERNUMBER")
    if not inv_number:
        return None

    amount_str = get("AMOUNT", "0")
    try:
        amount = abs(float(amount_str))
    except ValueError:
        amount = 0.0

    # Parse Tally date format: YYYYMMDD → YYYY-MM-DD
    raw_date = get("DATE", "20260101")
    try:
        due_date = datetime.strptime(raw_date, "%Y%m%d").strftime("%Y-%m-%d")
    except ValueError:
        due_date = None

    is_due = get("ISDUE", "No") == "Yes"
    status = "Overdue" if is_due else "Pending"

    return {
        "invoice_number": inv_number,
        "client_name": get("PARTYLEDGERNAME", "Unknown Client"),
        "amount": amount,
        "status": status,
        "due_date": due_date,
        "tally_voucher_id": inv_number,
    }

def push_to_supabase(invoices):
    """Upsert invoices into Supabase. Returns count of synced records."""
    if not invoices:
        return 0

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    synced = 0
    errors = 0

    for inv in invoices:
        try:
            # Upsert by invoice_number (update if exists, insert if new)
            result = supabase.table("invoices").upsert(
                inv, on_conflict="invoice_number"
            ).execute()
            synced += 1
        except Exception as e:
            log.warning(f"Failed to upsert {inv.get('invoice_number')}: {e}")
            errors += 1

    log.info(f"Synced {synced} invoices to Supabase. Errors: {errors}")

    # Log the sync event
    try:
        supabase.table("tally_sync_log").insert({
            "status": "success" if errors == 0 else "failed",
            "records_synced": synced,
            "error_message": f"{errors} errors" if errors > 0 else None,
        }).execute()
    except Exception as e:
        log.warning(f"Could not write sync log: {e}")

    return synced

def run_sync():
    """Execute one full Tally → Supabase sync cycle."""
    log.info("=== Starting Tally sync ===")
    start = time.time()

    vouchers = fetch_from_tally()
    if not vouchers:
        log.warning("No data from Tally. Skipping push.")
        return 0

    parsed = [parse_voucher(v) for v in vouchers]
    valid = [p for p in parsed if p is not None and p["amount"] > 0]
    log.info(f"Parsed {len(valid)} valid invoices from {len(vouchers)} vouchers")

    synced = push_to_supabase(valid)
    elapsed = round(time.time() - start, 2)
    log.info(f"=== Sync complete in {elapsed}s. {synced} records updated. ===\n")
    return synced

if __name__ == "__main__":
    log.info("Tally Sync Service started.")
    log.info(f"Tally host: {TALLY_HOST}")
    log.info(f"Supabase:   {SUPABASE_URL}")
    log.info(f"Interval:   every {SYNC_INTERVAL_SEC // 60} minutes\n")

    while True:
        try:
            run_sync()
        except Exception as e:
            log.error(f"Unexpected error during sync: {e}")

        log.info(f"Next sync in {SYNC_INTERVAL_SEC // 60} minutes...")
        time.sleep(SYNC_INTERVAL_SEC)
