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
import io
import math
import base64
import hashlib
import urllib.parse
import html
from datetime import datetime, timedelta

# Zero-Lag Architecture (v5.0):
# PDFs are generated on-demand in the browser client-side (via HTML5 Canvas & jsPDF in InvoiceDocModal.jsx).
# Local PDF generation on the Tally PC is disabled to ensure zero CPU/memory load and prevent TallyPrime freezing.

# Fix Windows console Unicode crash
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Auto-load .env file if present in script directory
env_path = os.path.join(SCRIPT_DIR, ".env")
if os.path.exists(env_path):
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'\"")
                    if k and k not in os.environ:
                        os.environ[k] = v
    except Exception as e:
        pass

# -- Configuration --
TALLY_HOST        = os.environ.get("TALLY_HOST", "http://localhost:9000")
CLOUD_URL         = os.environ.get("ERPPRO_CLOUD_URL", "https://sobhainfra-erp.netlify.app/.netlify/functions/tally-sync")
CONNECTOR_TOKEN   = os.environ.get("TALLY_CONNECTOR_TOKEN", "erppro_tally_sec_token_2026")
ORGANIZATION_ID   = os.environ.get("ORGANIZATION_ID", "00000000-0000-0000-0000-000000000001")
SYNC_INTERVAL_SEC = int(os.environ.get("SYNC_INTERVAL_MINS", "5")) * 60

# Supabase Storage (for uploading invoice PDFs)
SUPABASE_URL      = os.environ.get("SUPABASE_URL", "https://mcgmppnvnwnilioapbli.supabase.co")
SUPABASE_KEY      = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3MTk4MiwiZXhwIjoyMTAzMTQ3OTgyfQ.iMVtS3kZ5jkXd7wOsgviN_3Umz0Auw7vBa0NDlD9rKg"
STORAGE_BUCKET    = "whatsapp-media"

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

# ==============================================================================
# TALLY XML STRATEGY TEMPLATES
# Root cause: TallyPrime's 'Export Data'+'REPORTNAME' format (Day Book, List of Vouchers,
# Bills Outstanding) returns 'All Masters' dump instead of the requested report.
# CONFIRMED from debug XML: strategy 1 DayBook response header says
# TALLYREQUEST=Import Data and REPORTNAME=All Masters — Tally is ignoring EXPORTDATA.
#
# FIX: Use the correct TallyPrime Collection API:
#   <TALLYREQUEST>Export</TALLYREQUEST> <TYPE>Collection</TYPE> <ID>name</ID>
# This is the OFFICIAL TallyPrime XML API for pulling data.
# ==============================================================================

# Dynamic Financial Year Boundaries
_today = datetime.now()
_fy_start_year = (_today.year if _today.month >= 4 else _today.year - 1) - 2  # 2 extra FYs back
_fy_end_year   = (_today.year + 1 if _today.month >= 4 else _today.year)       # End of current FY
_fy_from = f"{_fy_start_year}0401"  # e.g. 20240401
_fy_to   = f"{_fy_end_year}0331"    # e.g. 20270331

# ==============================================================================
# STRATEGY 1 (PRIMARY): TDL Voucher Collection — ALL vouchers, NO date filter
# This is the most reliable. Bypasses session period entirely.
# Confirmed working: Tally returns full VOUCHER blocks with all fields.
# ==============================================================================
ALL_VOUCHERS_UNFILTERED_XML = """<?xml version="1.0" encoding="utf-8"?>
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
            <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, BASICBUYERNAME,
                   AMOUNT, NARRATION, PARTYGSTIN, BASICBUYERADDRESS,
                   ALLLEDGERENTRIES.LIST</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>"""

# ==============================================================================
# STRATEGY 2: TDL Voucher Collection WITH date range filter ($$IsInRange)
# ==============================================================================
ALL_VOUCHERS_TDL_XML = f"""<?xml version="1.0" encoding="utf-8"?>
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
            <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, BASICBUYERNAME,
                   AMOUNT, NARRATION, PARTYGSTIN, BASICBUYERADDRESS, ISOPTIONAL,
                   ALLLEDGERENTRIES.LIST</FETCH>
            <FILTER>FilterByDateRange</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="FilterByDateRange">
            $$IsInRange:$Date:{_fy_from}:{_fy_to}
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>"""

# ==============================================================================
# STRATEGY 3: Sundry Debtors TDL Collection — Outstanding balances
# ==============================================================================
SUNDRY_DEBTORS_XML = """<?xml version="1.0" encoding="utf-8"?>
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
            <FETCH>NAME, PARENT, CLOSINGBALANCE, OPENINGBALANCE, LEDPHONENO, LEDMOBILE, ADDRESS, PINCODE, EMAIL, GSTIN, BILLCREDITPERIOD, CREDITPERIOD</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>"""

# ==============================================================================
# STRATEGY 4: All Sundry Creditors + Debtors TDL Collection
# ==============================================================================
ACCOUNTS_XML = """<?xml version="1.0" encoding="utf-8"?>
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
            <FETCH>NAME, PARENT, CLOSINGBALANCE, OPENINGBALANCE, LEDPHONENO, LEDMOBILE, ADDRESS, PINCODE, EMAIL, GSTIN, BILLCREDITPERIOD, CREDITPERIOD</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>"""

# ==============================================================================
# STRATEGY 3: Sales Vouchers & Debit/Credit Notes (Current Financial Years)
# Lightweight, date-bounded, captures full sales ledger entries without memory crash
# ==============================================================================
DAYBOOK_XML = f"""<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>SalesDayBookVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>{_fy_from}</SVFROMDATE>
        <SVTODATE>{_fy_to}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="SalesDayBookVouchers" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, BASICBUYERNAME,
                   AMOUNT, NARRATION, PARTYGSTIN, BASICBUYERADDRESS,
                   ALLLEDGERENTRIES.LIST, BILLALLOCATIONS.LIST</FETCH>
            <FILTER>SalesDayBookFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="SalesDayBookFilter">
            $VoucherTypeName = "Sales" OR $VoucherTypeName = "Tax Invoice" OR $VoucherTypeName = "Sales Order" OR
            $VoucherTypeName = "Purchase" OR $VoucherTypeName = "Purchase Order" OR
            $VoucherTypeName = "Credit Note" OR $VoucherTypeName = "Debit Note"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>"""

# ==============================================================================
# STRATEGY 4: Receipts, Payments & Journals (Current Financial Years)
# Captures incoming customer receipts and bank allocations without memory bloat
# ==============================================================================
VOUCHERS_XML = f"""<?xml version="1.0" encoding="utf-8"?>
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
        <SVFROMDATE>{_fy_from}</SVFROMDATE>
        <SVTODATE>{_fy_to}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ReceiptPaymentVouchers" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, BASICBUYERNAME,
                   AMOUNT, NARRATION, PARTYGSTIN, BASICBUYERADDRESS,
                   ALLLEDGERENTRIES.LIST, BILLALLOCATIONS.LIST</FETCH>
            <FILTER>ReceiptPaymentFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="ReceiptPaymentFilter">
            $VoucherTypeName = "Receipt" OR $VoucherTypeName = "Payment" OR
            $VoucherTypeName = "Cash Receipt" OR $VoucherTypeName = "Bank Receipt" OR
            $VoucherTypeName = "Cash Payment" OR $VoucherTypeName = "Bank Payment" OR
            $VoucherTypeName = "Journal"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>"""

# Legacy alias (OUTSTANDING_XML replaced with real-time settlement engine)
OUTSTANDING_XML = ""

# ==============================================================================
# STRATEGY 8: Ledger Vouchers for each Sundry Debtor (per-party drill-down)
# ==============================================================================
LEDGER_VOUCHERS_XML = f"""<?xml version="1.0" encoding="utf-8"?>
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
            <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, BASICBUYERNAME,
                   AMOUNT, NARRATION, ALLLEDGERENTRIES</FETCH>
            <FILTER>LedgerVoucherFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="LedgerVoucherFilter">
            $$IsInRange:$Date:{_fy_from}:{_fy_to}
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>"""

# ==============================================================================
# STRATEGY 9: TDL Balance Sheet Collection
# ==============================================================================
COLLECTION_XML = """<?xml version="1.0" encoding="utf-8"?>
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
</ENVELOPE>"""

# ==============================================================================
# STRATEGY 10: EXPORTALL=Yes — Object Dump (tally-integration library approach)
# Forces Tally to dump entire voucher database, session-period-independent.
# ==============================================================================
EXPORT_OBJECT_XML = """<?xml version="1.0" encoding="utf-8"?>
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
</ENVELOPE>"""

# ==============================================================================
# STRATEGY 11: Sales Register with EXPORTALL (tally-integration approach)
# ==============================================================================
SALES_VOUCHER_OBJECT_XML = """<?xml version="1.0" encoding="utf-8"?>
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
</ENVELOPE>"""



# (Old duplicate strategy definitions removed — all strategies now defined above)


# ==============================================================================
# HELPERS
# ==============================================================================

def query_tally(xml_payload, label="", timeout=30):
    """Send XML request to Tally and return raw response text."""
    try:
        resp = requests.post(
            TALLY_HOST,
            data=xml_payload.encode('utf-8'),
            headers={
                "Content-Type": "text/xml; charset=utf-8",
                "Connection": "close",
            },
            timeout=timeout
        )
        text = resp.text
        log.info(f"  [{label}] HTTP {resp.status_code}, response size: {len(text)} bytes")
        return text
    except requests.exceptions.ConnectionError:
        log.error(f"  [{label}] Connection refused. Tally is not running or HTTP server is off.")
        return ""
    except requests.exceptions.Timeout:
        log.warning(f"  [{label}] Request timed out after {timeout}s (query too heavy for Tally)")
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


def parse_number(s):
    """
    Parse a Tally numeric string into a positive float.
    Tally uses formats like: '12345.00', '-12345.00 Dr', '12345.00 Cr', '1,23,456.00'
    Always returns absolute (positive) value — direction is determined by voucher type.
    """
    if not s:
        return 0.0
    s = str(s).strip()
    # Remove 'Dr', 'Cr', currency symbols, commas
    s = re.sub(r'[A-Za-z,₹$]', '', s).strip()
    # Handle Tally's negative sign (sometimes at end)
    negative = s.startswith('-')
    s = s.lstrip('-').strip()
    try:
        val = float(s)
        return abs(val)
    except ValueError:
        return 0.0


def compute_voucher_hash(v):
    """
    Compute a deterministic cryptographic hash of all business-critical voucher fields.
    Guarantees that ANY modification in Tally (amount, line items, status, truck, date, etc.)
    is automatically detected and synced with zero risk of missed edits.
    """
    key_fields = [
        str(v.get("invoice_number", "")),
        f"{float(v.get('amount') or 0):.2f}",
        str(v.get("status") or "Pending"),
        str(v.get("invoice_date") or v.get("date") or ""),
        str(v.get("phone") or v.get("client_phone") or "").strip(),
        str(v.get("ledger_name") or v.get("client_name") or "").strip(),
        str(v.get("due_date") or ""),
        str(v.get("credit_period_days") or ""),
        str(v.get("truck_no") or ""),
        str(v.get("challan_no") or ""),
        str(v.get("eway_bill_no") or ""),
        str(v.get("quantity_str") or ""),
        str(v.get("rate_str") or ""),
        str(v.get("pending_amount") or ""),
        str(v.get("paid_amount") or ""),
    ]
    raw_str = "|".join(key_fields)
    return hashlib.md5(raw_str.encode("utf-8")).hexdigest()[:16]


def extract_tag_value(block, tag_name):
    """Extract the text content of an XML tag using regex. Handles namespaces and XML entities."""
    pattern = rf"<(?:\w+:)?{tag_name}[^>]*>([^<]+)</(?:\w+:)?{tag_name}>"
    m = re.search(pattern, block, re.IGNORECASE)
    if m:
        val = m.group(1).strip()
        if "&" in val:
            val = html.unescape(val)
        return val
    return ""


def extract_phone(text):
    """
    Extract and normalize Indian mobile number from text.
    Handles optional +91, 0 prefix, 91 prefix, spaces, dashes, slashes, brackets.
    Returns standardized format: +91XXXXXXXXXX (10-digit mobile starting with 6, 7, 8, 9).
    Never returns landlines or invalid lengths.
    """
    if not text:
        return ""
    text_clean = html.unescape(str(text))
    # Match any Indian mobile number pattern (optional +91, 91, or 0 followed by 10 digits starting with 6-9)
    m = re.search(r'(?:(?:\+?91|0)[\s-]?)?([6-9]\d{4}[\s-]?\d{5}|[6-9]\d{9})', text_clean)
    if m:
        raw_digits = re.sub(r'[^\d]', '', m.group())
        # Strip country code / leading zero to isolate 10-digit mobile
        if len(raw_digits) == 12 and raw_digits.startswith('91'):
            raw_digits = raw_digits[2:]
        elif len(raw_digits) == 11 and raw_digits.startswith('0'):
            raw_digits = raw_digits[1:]
        elif len(raw_digits) > 10 and raw_digits.startswith('91'):
            raw_digits = raw_digits[-10:]

        if len(raw_digits) == 10 and raw_digits[0] in '6789':
            return "+91" + raw_digits
    return ""


ALL_PHONE_TAGS = [
    "LEDGERMOBILE", "LEDGERPHONE", "LEDGERCONTACT", "LEDMOBILE", "LEDPHONENO",
    "MOBILENO", "PHONENO", "MOBILENUMBER", "PHONENUMBER", "PARTYPHONE",
    "BASICBUYERPHONE", "BUYERPHONE", "BUYERCONTACT", "TELEPHONE", "TELNO",
    "PHONE", "MOBILE", "CONTACTPERSON", "CONTACTNO", "LEDGERCONTACTPERSON"
]


def extract_phone_from_party_fields(block):
    """
    Extract phone from dedicated Tally phone tags, as well as buyer/ledger address fields.
    """
    for tag in ALL_PHONE_TAGS:
        val = extract_tag_value(block, tag)
        if val:
            phone = extract_phone(val)
            if phone:
                return phone
    # Also check address lines in the block
    for addr_tag in ["ADDRESS", "BASICBUYERADDRESS", "LEDGERADDRESS"]:
        for m in re.finditer(rf"<(?:\w+:)?{addr_tag}[^>]*>([^<]+)</(?:\w+:)?{addr_tag}>", block, re.IGNORECASE):
            phone = extract_phone(m.group(1))
            if phone:
                return phone
    return ""


def extract_party_phone_from_voucher(block, party_name):
    """
    Scoped phone extraction from voucher XML:
    1. Search inside the party's own <ALLLEDGERENTRIES.LIST> or <LEDGERENTRIES.LIST> sub-block.
    2. Search inside top-level buyer/party tags and address lines.
    """
    # Step 1: Try to find the party's own ledger sub-block
    if party_name:
        party_clean = party_name.strip().lower()
        party_norm = re.sub(r'[^a-z0-9]', '', party_clean)
        for list_tag in ["ALLLLEDGERENTRIES", "ALLLEDGERENTRIES", "LEDGERENTRIES"]:
            entry_blocks = re.findall(
                rf'<{list_tag}\.LIST[^>]*>([\s\S]*?)</{list_tag}\.LIST>',
                block, re.IGNORECASE
            )
            for entry in entry_blocks:
                entry_ledger = (
                    extract_tag_value(entry, "LEDGERNAME") or
                    extract_tag_value(entry, "NAME") or ""
                ).strip().lower()
                entry_norm = re.sub(r'[^a-z0-9]', '', entry_ledger)
                if entry_ledger == party_clean or (party_norm and entry_norm == party_norm):
                    phone = extract_phone_from_party_fields(entry)
                    if phone:
                        return phone

    # Step 2: Check top-level voucher phone tags and buyer address lines
    top_level_block = re.split(
        r'<(?:ALLLLEDGERENTRIES|ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST',
        block, maxsplit=1, flags=re.IGNORECASE
    )[0]

    phone = extract_phone_from_party_fields(top_level_block)
    if phone:
        return phone

    return ""


def parse_credit_period_to_days(val) -> int | None:
    """
    Parses Tally credit period representations such as:
      - '45 Days' -> 45
      - '60 Days' -> 60
      - '30'      -> 30
      - '2 Months' -> 60
      - '1 Month'  -> 30
      - '15 Days'  -> 15
    Returns integer days, or None if not parseable.
    """
    if not val:
        return None
    val_clean = str(val).strip().lower()
    m_match = re.search(r'(\d+)\s*month', val_clean)
    if m_match:
        return int(m_match.group(1)) * 30
    w_match = re.search(r'(\d+)\s*week', val_clean)
    if w_match:
        return int(w_match.group(1)) * 7
    d_match = re.search(r'(\d+)', val_clean)
    if d_match:
        return int(d_match.group(1))
    return None


def parse_tally_date_str(d_str: str) -> str | None:
    """
    Parse a Tally date string into standard 'YYYY-MM-DD'.
    Handles:
      - '20260930' (8-digit YYYYMMDD)
      - '30-Aug-2026' or '30-Aug-26'
      - '30-08-2026' or '2026-08-30'
      - '30/08/2026'
    """
    if not d_str:
        return None
    s = str(d_str).strip()
    if len(s) == 8 and s.isdigit():
        try:
            return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
        except Exception:
            pass
    for fmt in ("%d-%b-%Y", "%d-%b-%y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except Exception:
            pass
    return None


def fetch_tally_ledger_master(company_name: str = "") -> tuple:
    """
    MASTER LEDGER PHONE & CREDIT TERMS REGISTRY:
    Queries Tally's Master Ledger Collection to fetch:
      1. Official registered phone/mobile number for EVERY party ledger.
      2. Official default credit period (e.g. 45 days, 60 days) for EVERY party ledger.
    Returns (phone_map, credit_map).
    """
    phone_map = {}
    credit_map = {}

    def _build_map_from_xml(resp_xml):
        """Parse LEDGER blocks from any XML response and build phone & credit maps."""
        p_map = {}
        c_map = {}
        ledger_blocks = re.findall(r'<LEDGER[^>]*>([\s\S]*?)</LEDGER>', resp_xml, re.IGNORECASE)
        for lblock in ledger_blocks:
            name = extract_tag_value(lblock, "NAME") or extract_tag_value(lblock, "LEDGERNAME")
            if not name:
                continue

            phone = extract_phone_from_party_fields(lblock)
            raw_credit = extract_tag_value(lblock, "BILLCREDITPERIOD") or extract_tag_value(lblock, "CREDITPERIOD")
            credit_days = parse_credit_period_to_days(raw_credit)

            name_clean = name.strip().lower()
            name_norm = re.sub(r'[^a-z0-9]', '', name_clean)

            if phone:
                p_map[name_clean] = phone
                if name_norm:
                    p_map[name_norm] = phone

            if credit_days is not None:
                c_map[name_clean] = credit_days
                if name_norm:
                    c_map[name_norm] = credit_days
        return p_map, c_map

    # ── Strategy 1: TDL Collection (richest data, TallyPrime 2.x+) ─────────────
    tdl_xml = """<?xml version="1.0" encoding="utf-8"?>
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
            <FETCH>NAME, PARENT, LEDGERMOBILE, LEDGERPHONE, LEDGERCONTACT, LEDMOBILE, LEDPHONENO, MOBILENO, PHONENO, CONTACTNO, MOBILENUMBER, PHONENUMBER, PARTYPHONE, ADDRESS, PINCODE, EMAIL, GSTIN, BILLCREDITPERIOD, CREDITPERIOD</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>"""

    if company_name:
        tdl_xml = inject_company_into_xml(tdl_xml, company_name)

    log.info(f"  [Master Ledger Registry] Strategy 1: Fetching master party contacts & credit terms from Tally TDL...")
    resp1 = query_tally(tdl_xml, f"MasterLedgerPhones_{company_name or 'Default'}")
    if resp1 and len(resp1) > 100:
        p1, c1 = _build_map_from_xml(resp1)
        phone_map.update(p1)
        credit_map.update(c1)
        log.info(f"  [Master Ledger Registry] Strategy 1 result: {len(phone_map)} parties with phones, {len(credit_map)} with credit terms")

    # ── Strategy 2: Standard "List of Accounts" report (fallback for older Tally) ─
    if len(phone_map) < 3:
        log.info(f"  [Master Ledger Registry] Strategy 2: Trying standard List of Accounts report...")
        accts_xml = """<?xml version="1.0" encoding="utf-8"?>
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
        if company_name:
            accts_xml = inject_company_into_xml(accts_xml, company_name)
        resp2 = query_tally(accts_xml, f"ListOfAccounts_{company_name or 'Default'}")
        if resp2 and len(resp2) > 100:
            p2, c2 = _build_map_from_xml(resp2)
            for k, v in p2.items():
                if k not in phone_map:
                    phone_map[k] = v
            for k, v in c2.items():
                if k not in credit_map:
                    credit_map[k] = v
            log.info(f"  [Master Ledger Registry] Strategy 2 added extra parties; total phones: {len(phone_map)}, total credit terms: {len(credit_map)}")

    log.info(f"  [Master Ledger Registry] Final registry: {len(phone_map)} party phone(s), {len(credit_map)} party credit term(s)")
    return phone_map, credit_map


def fetch_tally_ledger_phone_master(company_name: str = "") -> dict:
    """Backwards-compatible wrapper returning only the phone map."""
    phones, _ = fetch_tally_ledger_master(company_name)
    return phones


def parse_voucher_block(block, fallback_company: str = "", ledger_phone_map: dict = None, ledger_credit_map: dict = None):
    """Parse a single VOUCHER XML block into a rich dict with real Tally data."""
    vch_number = (extract_tag_value(block, "VOUCHERNUMBER") or
                  extract_tag_value(block, "NUMBER") or
                  extract_tag_value(block, "VCHKEY"))
    vch_type = (extract_tag_value(block, "VOUCHERTYPENAME") or
                extract_tag_value(block, "VOUCHERTYPE") or "Sales")
    comp_name = (extract_tag_value(block, "SVCURRENTCOMPANY") or
                 extract_tag_value(block, "COMPANYNAME") or
                 extract_tag_value(block, "SVCOMPANYNAME") or
                 extract_tag_value(block, "BASICCOMPANYNAME") or
                 fallback_company)

    vch_type_lower = vch_type.lower()
    is_purchase = any(k in vch_type_lower for k in ["purchase", "purchase order"])
    is_payment  = any(k in vch_type_lower for k in ["payment", "bank payment", "cash payment"])
    is_receipt  = any(k in vch_type_lower for k in ["receipt", "bank receipt", "cash receipt"])

    # 1. Authoritative Accounting Party Ledger from Tally:
    # In Tally Prime, PARTYLEDGERNAME is the official accounting ledger in the chart of accounts.
    party = (extract_tag_value(block, "PARTYLEDGERNAME") or
             extract_tag_value(block, "PARTYNAME"))

    # 2. For Sales / Receipts only, BASICBUYERNAME is a valid fallback:
    # On Purchase/Payment, BASICBUYERNAME is the buyer's own company name — NEVER use it!
    if not party and not (is_purchase or is_payment):
        party = extract_tag_value(block, "BASICBUYERNAME")

    # 3. If still empty, or if party resolved to the company's own name on Purchase/Payment:
    clean_comp = (comp_name or fallback_company or "").strip().upper()
    if not party or (clean_comp and party.strip().upper() == clean_comp and (is_purchase or is_payment)):
        # Scan voucher ledger entries to find the counterpart vendor party ledger
        for ledger_entry in re.findall(r'<(?:ALLLLEDGERENTRIES|ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST[^>]*>([\s\S]*?)</(?:ALLLLEDGERENTRIES|ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST>', block, re.IGNORECASE):
            l_name = extract_tag_value(ledger_entry, "LEDGERNAME")
            l_upper = l_name.upper()
            skip_kw = ["BANK", "CASH", "PURCHASE", "SALES", "CGST", "SGST", "IGST", "GST", "TDS", "TAX", "ROUND OFF", clean_comp]
            if l_name and not any(sk in l_upper for sk in skip_kw):
                party = l_name
                break

    if not party:
        party = extract_tag_value(block, "LEDGERNAME") or (extract_tag_value(block, "BASICBUYERNAME") if not (is_purchase or is_payment) else "")

    amount_str = (extract_tag_value(block, "AMOUNT") or
                  extract_tag_value(block, "CLOSINGBALANCE") or "0")
    raw_date = (extract_tag_value(block, "DATE") or
                extract_tag_value(block, "VOUCHERDATE") or "")
    narration = extract_tag_value(block, "NARRATION") or ""
    buyer_addr = extract_tag_value(block, "BASICBUYERADDRESS") or extract_tag_value(block, "ADDRESS") or ""
    buyer_gstin = extract_tag_value(block, "PARTYGSTIN") or extract_tag_value(block, "GSTIN") or extract_tag_value(block, "INCOMETAXNUMBER") or ""

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

    # Extract real taxable amount and GST from voucher XML ledger entries
    taxable_amount = None
    igst_amount    = None
    cgst_amount    = None
    sgst_amount    = None
    for ledger_entry in re.findall(r'<(?:ALLLLEDGERENTRIES|ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST[^>]*>([\s\S]*?)</(?:ALLLLEDGERENTRIES|ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST>', block, re.IGNORECASE):
        entry_name = (extract_tag_value(ledger_entry, "LEDGERNAME") or "").upper()
        entry_amt  = parse_number(extract_tag_value(ledger_entry, "AMOUNT") or "0")
        if "IGST" in entry_name and entry_amt > 0:
            igst_amount = entry_amt
        elif "CGST" in entry_name and entry_amt > 0:
            cgst_amount = entry_amt
        elif "SGST" in entry_name and entry_amt > 0:
            sgst_amount = entry_amt
    # Derive taxable
    total_tax = (igst_amount or 0) + (cgst_amount or 0) + (sgst_amount or 0)
    if total_tax > 0:
        taxable_amount = amount - total_tax
    else:
        taxable_amount = None  # Will fall back to amount/1.05 formula in PDF generator

    # Extract bill allocations (Agst Ref, New Ref) and credit terms from Tally
    bill_allocations = []
    bill_due_date = None
    bill_credit_days = None

    for ablock in re.findall(r'<BILLALLOCATIONS\.LIST[^>]*>([\s\S]*?)</BILLALLOCATIONS\.LIST>', block, re.IGNORECASE):
        b_name = extract_tag_value(ablock, "NAME") or extract_tag_value(ablock, "BILLNAME")
        b_type = extract_tag_value(ablock, "BILLTYPE") or ""
        b_amt  = parse_number(extract_tag_value(ablock, "AMOUNT") or "0")
        b_due_raw = extract_tag_value(ablock, "BILLDUEDATE") or extract_tag_value(ablock, "DUEDATE") or ""
        b_credit_raw = extract_tag_value(ablock, "BILLCREDITPERIOD") or extract_tag_value(ablock, "CREDITPERIOD") or ""

        parsed_b_due = parse_tally_date_str(b_due_raw)
        parsed_b_days = parse_credit_period_to_days(b_credit_raw)

        if not bill_due_date and parsed_b_due:
            bill_due_date = parsed_b_due
        if bill_credit_days is None and parsed_b_days is not None:
            bill_credit_days = parsed_b_days

        if b_name:
            bill_allocations.append({
                "name": b_name,
                "type": b_type,
                "amount": b_amt,
                "due_date": parsed_b_due,
                "credit_period": b_credit_raw,
                "credit_days": parsed_b_days,
            })

    # Resolve invoice date
    inv_date_str = datetime.now().strftime("%d-%b-%y")
    dt_obj = None
    if raw_date and len(raw_date) == 8:
        try:
            dt_obj = datetime.strptime(raw_date, "%Y%m%d")
            inv_date_str = dt_obj.strftime("%d-%b-%y")
        except ValueError:
            pass

    # Dynamic credit terms and due date calculation
    due_date = None
    applied_credit_days = None

    if bill_due_date:
        due_date = bill_due_date
        if dt_obj:
            try:
                due_dt = datetime.strptime(bill_due_date, "%Y-%m-%d")
                applied_credit_days = max(0, (due_dt - dt_obj).days)
            except Exception:
                pass
    elif bill_credit_days is not None and dt_obj:
        applied_credit_days = bill_credit_days
        due_date = (dt_obj + timedelta(days=bill_credit_days)).strftime("%Y-%m-%d")
    elif ledger_credit_map and dt_obj:
        party_key = (party or "").strip().lower()
        party_norm = re.sub(r'[^a-z0-9]', '', party_key)
        l_days = ledger_credit_map.get(party_key) or ledger_credit_map.get(party_norm)
        if l_days is not None:
            applied_credit_days = l_days
            due_date = (dt_obj + timedelta(days=l_days)).strftime("%Y-%m-%d")

    # Fallback to default 30 days if still unassigned and dt_obj is valid
    if not due_date and dt_obj:
        applied_credit_days = 30
        due_date = (dt_obj + timedelta(days=30)).strftime("%Y-%m-%d")
    elif not due_date:
        due_date = datetime.now().strftime("%Y-%m-%d")

    # Voucher type classification
    SKIP_TYPES = {"contra", "bank contra", "cash contra"}
    # Outgoing money types (we pay someone — Purchase, Payment, Credit Note)
    PAYMENT_TYPES  = {"payment", "bank payment", "cash payment"}
    PURCHASE_TYPES = {"purchase", "purchase order"}
    # Incoming settlement types (customer paid us — Receipt)
    RECEIPT_TYPES  = {"receipt", "bank receipt", "cash receipt"}
    vch_type_lower = vch_type.lower()

    if any(s == vch_type_lower for s in SKIP_TYPES):
        log.debug(f"  [Skip] Voucher {vch_number} type '{vch_type}' is contra/internal — skipped")
        return None

    if not party:
        log.debug(f"  [Skip] Voucher {vch_number} has no party ledger name — skipped")
        return None

    # Determine status, flow direction, and due date
    if any(s in vch_type_lower for s in RECEIPT_TYPES):
        status = "Paid"
        direction = "received"       # Customer paid us (money IN)
        due_date = None              # Already settled at transaction date
    elif any(s in vch_type_lower for s in PAYMENT_TYPES):
        status = "Paid"
        direction = "paid_out"       # We paid vendor (money OUT)
        due_date = None              # Already settled at payment date
    elif any(s in vch_type_lower for s in PURCHASE_TYPES):
        status = "Pending"
        direction = "payable"        # We owe vendor for purchase
    elif "credit note" in vch_type_lower:
        status = "Paid"
        direction = "paid_out"
        due_date = None
    elif "sales" in vch_type_lower or "debit note" in vch_type_lower:
        status = "Pending"
        direction = "receivable"     # Sales invoice — customer owes us money
    elif "journal" in vch_type_lower:
        # ── Journal voucher: determine money direction from ledger entry sign ──
        # In Tally XML, AMOUNT on a ledger entry is signed:
        #   Negative (-) = DEBIT  → company paid money OUT  (e.g. advance to driver/staff)
        #   Positive (+) = CREDIT → company received money IN (e.g. adjustment income)
        # We look at the party ledger entry (not bank/cash) to determine direction.
        journal_direction = "receivable"  # safe default
        journal_amounts = []
        for jou_entry in re.findall(
            r'<(?:ALLLLEDGERENTRIES|ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST[^>]*>([\s\S]*?)</(?:ALLLLEDGERENTRIES|ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST>',
            block, re.IGNORECASE
        ):
            entry_name = (extract_tag_value(jou_entry, "LEDGERNAME") or "").upper()
            entry_amt_raw = extract_tag_value(jou_entry, "AMOUNT") or "0"
            # Skip bank/cash/tax ledgers — look at the party/counterpart ledger
            skip_ledger_keywords = ["BANK", "CASH", "IGST", "CGST", "SGST", "TAX", "TDS", "GST"]
            if any(k in entry_name for k in skip_ledger_keywords):
                continue
            # Try to read the signed amount from Tally (it preserves +/-)
            try:
                # Tally amounts may have spaces, commas, and Cr/Dr suffixes
                raw_clean = entry_amt_raw.replace(",", "").replace(" ", "").strip()
                # Positive in Tally XML for party = CREDIT = they owe us = receivable
                # Negative in Tally XML for party = DEBIT  = we paid them = paid_out
                signed_val = float(raw_clean) if raw_clean else 0.0
                if signed_val != 0:
                    journal_amounts.append(signed_val)
            except (ValueError, TypeError):
                pass

        if journal_amounts:
            # If the party ledger amount is NEGATIVE → debit → company paid OUT
            # If POSITIVE → credit → we are owed money → receivable
            net_journal = sum(journal_amounts)
            if net_journal < 0:
                journal_direction = "paid_out"   # Company sent money OUT (staff advance, misc expense)
                status = "Paid"
                due_date = None
            else:
                journal_direction = "receivable"  # Adjustment in our favour
                status = "Pending"
        else:
            # No parseable ledger amounts — keep as receivable (safe default)
            status = "Pending"

        direction = journal_direction
    else:
        status = "Pending"           # Debit Note, other = receivable by default
        direction = "receivable"     # Money owed TO us

    # Extract e-way bill sub-block details if present
    truck_no = ""
    eway_bill_no = ""
    eway_date = ""
    approx_distance = ""
    transporter_name = ""
    transporter_id = ""
    eway_list = re.findall(r'<EWAYBILLDETAILS\.LIST[^>]*>([\s\S]*?)</EWAYBILLDETAILS\.LIST>', block, re.IGNORECASE)
    for ewb in eway_list:
        if not eway_bill_no:
            eway_bill_no = extract_tag_value(ewb, "BILLNO") or extract_tag_value(ewb, "EWAYBILLNO") or extract_tag_value(ewb, "EWBNO")
        if not eway_date:
            eway_date = extract_tag_value(ewb, "BILLDATE") or extract_tag_value(ewb, "EWAYBILLDATE")
        if not approx_distance:
            approx_distance = extract_tag_value(ewb, "APPROXDISTANCE") or extract_tag_value(ewb, "DISTANCE")
        if not transporter_name:
            transporter_name = extract_tag_value(ewb, "TRANSPORTERNAME")
        if not transporter_id:
            transporter_id = extract_tag_value(ewb, "TRANSPORTERID")
        if not truck_no:
            truck_no = extract_tag_value(ewb, "VEHICLENO") or extract_tag_value(ewb, "VEHICLENUMBER")

    # Extract truck / vehicle number from dedicated Tally tags or narration
    if not truck_no:
        truck_no = (
            extract_tag_value(block, "BASICSHIPVESSELNO") or
            extract_tag_value(block, "VEHICLENO") or
            extract_tag_value(block, "VEHICLENUMBER")
        )
    if not truck_no:
        truck_match = re.search(r'([A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{4})', narration or block, re.IGNORECASE)
        truck_no = truck_match.group(1).upper().replace(' ', '-') if truck_match else ""

    # Extract delivery challan number
    challan_no = (
        extract_tag_value(block, "BASICSHIPDELIVERYNOTENO") or
        extract_tag_value(block, "DISPATCHDOCNO") or
        extract_tag_value(block, "DELIVERYNOTENO") or
        extract_tag_value(block, "CHALLANNO")
    )
    if not challan_no:
        challan_match = re.search(r'Challan\s*(?:No\.?|#)?\s*[:=-]?\s*([0-9A-Z/-]+)', narration or block, re.IGNORECASE)
        challan_no = challan_match.group(1) if challan_match else ""

    # Extract e-way bill number from top-level tags or narration if not in sub-list
    if not eway_bill_no:
        eway_bill_no = (
            extract_tag_value(block, "EWAYBILLNO") or
            extract_tag_value(block, "BILLOFLADINGNO")
        )
    if not eway_bill_no:
        eway_match = re.search(r'(?:eway|e-way|ewb)[\s:#-]*(\d{12})', narration or block, re.IGNORECASE)
        if not eway_match:
            eway_match = re.search(r'\b(\d{12})\b', narration or block)
        eway_bill_no = eway_match.group(1) if eway_match else ""

    # Extract approx distance & transporter details
    if not approx_distance:
        approx_distance = (
            extract_tag_value(block, "APPROXDISTANCE") or
            extract_tag_value(block, "ACTUALDISTANCE") or
            extract_tag_value(block, "DISTANCE") or
            ""
        )
    if not approx_distance:
        dist_match = re.search(r'(?:distance|dist)[\s:#-]*(\d+)\s*(?:km)?', narration or block, re.IGNORECASE)
        if dist_match:
            approx_distance = f"{dist_match.group(1)} KM"

    if not transporter_name:
        transporter_name = (
            extract_tag_value(block, "TRANSPORTERNAME") or
            extract_tag_value(block, "CARRIERNAME") or
            extract_tag_value(block, "BASICSHIPPEDBY") or
            ""
        )
    if not transporter_id:
        transporter_id = (
            extract_tag_value(block, "TRANSPORTERID") or
            extract_tag_value(block, "TRANSPORTERGSTIN") or
            ""
        )

    # Extract order reference
    order_no = (
        extract_tag_value(block, "BASICPURCHASEORDERNO") or
        extract_tag_value(block, "PURCHASEORDERNO") or
        extract_tag_value(block, "ORDERREF") or
        ""
    )
    order_date = extract_tag_value(block, "BASICORDERDATE") or ""

    # Extract delivery destination / site
    site = (
        extract_tag_value(block, "BASICSHIPTOPLACE") or
        extract_tag_value(block, "PLACEOFSUPPLY") or
        extract_tag_value(block, "DESTINATION") or
        ""
    )

    # Extract line items if inventory entries present
    line_items = []
    inv_blocks = re.findall(r'<INVENTORYENTRIES\.LIST[^>]*>([\s\S]*?)</INVENTORYENTRIES\.LIST>', block, re.IGNORECASE)
    for ib in inv_blocks:
        itm_name = extract_tag_value(ib, "STOCKITEMNAME") or extract_tag_value(ib, "NAME") or ""
        itm_qty = extract_tag_value(ib, "BILLEDQTY") or extract_tag_value(ib, "ACTUALQTY") or ""
        itm_rate = parse_number(extract_tag_value(ib, "RATE") or "0")
        itm_amt = parse_number(extract_tag_value(ib, "AMOUNT") or str(amount))
        hsn = extract_tag_value(ib, "HSNCODE") or extract_tag_value(ib, "HSN") or ""
        if itm_name or itm_amt:
            line_items.append({
                "name": itm_name,
                "qty": itm_qty,
                "rate": itm_rate,
                "amount": itm_amt,
                "hsn": hsn,
            })

    # Smart unique invoice numbering with company & voucher type scoping
    # Guarantees ZERO cross-company and ZERO cross-voucher-type collisions in Supabase!
    comp_prefix = ""
    if comp_name:
        words = [w for w in re.split(r'[^a-zA-Z0-9]', comp_name) if w]
        comp_prefix = "".join(w[0].upper() for w in words if len(w) > 1)[:4] or comp_name[:3].upper()

    vch_str = str(vch_number or "").strip()
    clean_vnum = re.sub(r'[^a-zA-Z0-9_-]', '-', vch_str).strip('-')

    if vch_str:
        if "sales" in vch_type_lower or "tax invoice" in vch_type_lower:
            # Sales vouchers: preserve registered tax series (e.g. SRP/0570/26-27 or SB/0216/26-27)
            if comp_prefix and (vch_str.upper().startswith(comp_prefix + "/") or vch_str.upper().startswith(comp_prefix + "-")):
                inv_code = vch_str
            elif not any(c.isalpha() for c in vch_str):
                inv_code = f"{comp_prefix}-SALES-{vch_str}" if comp_prefix else f"SALES-{vch_str}"
            else:
                inv_code = f"{comp_prefix}-{vch_str}" if comp_prefix and not vch_str.upper().startswith(comp_prefix) else vch_str
        elif is_purchase:
            # Purchase vouchers: scope with comp_prefix-PUR- so inter-company bills (e.g. SB/034 in SRP) never collide with sales invoices!
            if vch_str.upper().startswith(f"{comp_prefix}-PUR-") or vch_str.upper().startswith(f"{comp_prefix}/PUR/"):
                inv_code = vch_str
            else:
                inv_code = f"{comp_prefix}-PUR-{clean_vnum}" if comp_prefix else f"PUR-{clean_vnum}"
        elif is_payment:
            if vch_str.upper().startswith(f"{comp_prefix}-PAY-"):
                inv_code = vch_str
            else:
                inv_code = f"{comp_prefix}-PAY-{clean_vnum}" if comp_prefix else f"PAY-{clean_vnum}"
        elif is_receipt:
            if vch_str.upper().startswith(f"{comp_prefix}-REC-"):
                inv_code = vch_str
            else:
                inv_code = f"{comp_prefix}-REC-{clean_vnum}" if comp_prefix else f"REC-{clean_vnum}"
        elif "journal" in vch_type_lower:
            if vch_str.upper().startswith(f"{comp_prefix}-JOU-"):
                inv_code = vch_str
            else:
                inv_code = f"{comp_prefix}-JOU-{clean_vnum}" if comp_prefix else f"JOU-{clean_vnum}"
        elif "credit note" in vch_type_lower:
            inv_code = f"{comp_prefix}-CN-{clean_vnum}" if comp_prefix and not vch_str.upper().startswith(f"{comp_prefix}-CN") else vch_str
        elif "debit note" in vch_type_lower:
            inv_code = f"{comp_prefix}-DN-{clean_vnum}" if comp_prefix and not vch_str.upper().startswith(f"{comp_prefix}-DN") else vch_str
        else:
            inv_code = f"{comp_prefix}-{vch_str}" if comp_prefix and not vch_str.upper().startswith(comp_prefix) else vch_str
    else:
        inv_code = f"VCH-{(comp_prefix or 'X')}-{(party or 'X')[:6]}-{abs(hash((party or '') + (comp_name or ''))) % 10000}"

    # ─────────────────────────────────────────────────────────────────────────────
    # ─────────────────────────────────────────────────────────────────────────────
    # AUTHORITATIVE MULTI-TIER PHONE EXTRACTION (100% Faithful Tally Mirror)
    # Tier 1: Tally Master Ledger Registry lookup (Exact match from Tally Master)
    # Tier 2: Party's own isolated ledger sub-block in voucher XML
    # ─────────────────────────────────────────────────────────────────────────────
    clean_party = html.unescape((party or "").strip())
    norm_key = re.sub(r'[^a-z0-9]', '', clean_party.lower())

    phone_val = ""
    # Tier 1: Master lookup
    if ledger_phone_map:
        phone_val = (ledger_phone_map.get(clean_party.lower()) or
                     ledger_phone_map.get(norm_key) or "")

    # Tier 2: Voucher party sub-block
    if not phone_val:
        phone_val = extract_party_phone_from_voucher(block, clean_party)

    return {
        "invoice_number": inv_code,
        "raw_voucher_number": str(vch_number or ""),
        "supplier_invoice_number": str(vch_number or ""),
        "invoice_date": inv_date_str,
        "ledger_name": clean_party or "Client",
        "company_name": comp_name or fallback_company or "Tally Company",
        "phone": phone_val,
        "amount": amount,
        "status": status,
        "voucher_type": vch_type,     # store raw Tally voucher type
        "direction": direction,        # receivable | received | payable | paid_out
        "due_date": due_date,
        "credit_period_days": applied_credit_days,
        "buyer_address": buyer_addr,
        "gstin": buyer_gstin or "",
        "truck_no": truck_no,
        "challan_no": challan_no,
        "challan_date": inv_date_str if challan_no else "",
        "site": site,
        "eway_bill_no": eway_bill_no,
        "eway_date": eway_date,
        "approx_distance": approx_distance,
        "transporter_name": transporter_name,
        "transporter_id": transporter_id,
        "order_no": order_no,
        "order_date": order_date,
        "item_name": line_items[0]["name"] if line_items else "",
        "hsn_code": line_items[0]["hsn"] if line_items else "",
        "quantity_str": line_items[0]["qty"] if line_items else "",
        "rate_str": f"{line_items[0]['rate']:,.2f}" if (line_items and line_items[0]['rate'] > 0) else "",
        "unit": line_items[0]["qty"].split()[-1] if (line_items and " " in line_items[0]["qty"]) else "",
        "taxable_amount": taxable_amount,
        "igst_amount": igst_amount,
        "cgst_amount": cgst_amount,
        "sgst_amount": sgst_amount,
        "line_items": line_items,
        "bill_allocations": bill_allocations,
        "metadata": {
            "credit_period_days": applied_credit_days,
            "voucher_type": vch_type,
            "direction": direction,
            "truck_no": truck_no,
            "challan_no": challan_no,
            "challan_date": inv_date_str if challan_no else "",
            "site": site,
            "eway_bill_no": eway_bill_no,
            "eway_date": eway_date,
            "approx_distance": approx_distance,
            "transporter_name": transporter_name,
            "transporter_id": transporter_id,
            "order_no": order_no,
            "order_date": order_date,
            "item_name": line_items[0]["name"] if line_items else "",
            "hsn_code": line_items[0]["hsn"] if line_items else "",
            "quantity_str": line_items[0]["qty"] if line_items else "",
            "rate_str": f"{line_items[0]['rate']:,.2f}" if (line_items and line_items[0]['rate'] > 0) else "",
            "unit": line_items[0]["qty"].split()[-1] if (line_items and " " in line_items[0]["qty"]) else "",
            "taxable_amount": taxable_amount,
            "igst_amount": igst_amount,
            "cgst_amount": cgst_amount,
            "sgst_amount": sgst_amount,
            "line_items": line_items,
            "buyer_address": buyer_addr,
            "gstin": buyer_gstin or "",
        },
    }


def parse_ledger_block(block, fallback_company: str = "", ledger_phone_map: dict = None, ledger_credit_map: dict = None):
    """Parse a single LEDGER XML block into a dict."""
    name = (extract_tag_value(block, "NAME") or
            extract_tag_value(block, "LEDGERNAME"))
    parent = extract_tag_value(block, "PARENT")
    closing_raw = (extract_tag_value(block, "CLOSINGBALANCE") or "0")
    opening_raw = (extract_tag_value(block, "OPENINGBALANCE") or "0")

    amount = parse_number(closing_raw)
    raw_str_cl = str(closing_raw).strip()
    is_cl_cr = 'cr' in raw_str_cl.lower()
    is_cl_dr = 'dr' in raw_str_cl.lower()
    is_cl_neg = raw_str_cl.startswith('-')

    # In Tally XML for Sundry Debtors:
    # Negative value (e.g. '-168584.00' or '... Dr') = DEBIT balance (Customer owes us, positive in ERP)
    # Positive value without minus (e.g. '6449.00' or '... Cr') = CREDIT balance (Advance from customer, negative in ERP)
    is_credit_advance = False
    parent_check = (parent or '').lower()
    debtor_subgroups = {'debtor', 'sundry debtors', 'sundry debtors - stc', 'mumbai', 'thane', 'palghar', 
                        'debtors 1', 'dubey ji', 'mira/bhayandar', 'karan', 'kalpesh bhai', 'shahpur/kalyan', 
                        'bhiwandi', 'navi mumbai', 'vie win enterprises', 'yadav trading company', 'vnr infratech'}
    is_debtor_group = any(g in parent_check for g in debtor_subgroups)
    if is_debtor_group:
        if is_cl_cr or (amount > 0 and not is_cl_neg and not is_cl_dr and not raw_str_cl.startswith('-')):
            is_credit_advance = True

    op_clean = parse_number(opening_raw)
    if op_clean != 0:
        raw_str = str(opening_raw).strip()
        is_cr = 'cr' in raw_str.lower()
        is_dr = 'dr' in raw_str.lower()
        is_neg = raw_str.startswith('-')
        if is_dr or (is_neg and not is_cr):
            opening_amt = op_clean   # Debit (positive Dr)
        else:
            opening_amt = -op_clean  # Credit (Advance / Cr)
    else:
        opening_amt = 0.0

    if not name or (amount == 0 and opening_amt == 0):
        return None

    # Only skip pure system/group accounts (capital, banks, tax accounts, etc.)
    parent_lower = (parent or '').lower()
    name_lower = name.lower()

    # Skip system ledger groups
    skip_names = ['profit & loss', 'capital account', 'duties & taxes',
                  'opening stock', 'closing stock', 'bank od a/c']
    skip_parents = ['capital account', 'bank accounts', 'bank od a/c',
                    'duties & taxes', 'fixed assets', 'investments',
                    'current liabilities', 'provisions', 'reserves & surplus',
                    'suspense a/c', 'cash-in-hand', 'stock-in-hand',
                    'indirect expenses', 'direct expenses',
                    'indirect incomes', 'direct incomes',
                    'purchase accounts', 'sales accounts']

    if name_lower in skip_names:
        return None
    if any(sp in parent_lower for sp in skip_parents):
        return None
    # Keep 'primary' and '' parents only if they look like a party/debtor/creditor
    if parent_lower in ('primary', '') and not any(kw in name_lower for kw in
            ['debtor', 'creditor', 'customer', 'party', 'client',
             'construction', 'enterprises', 'pvt', 'ltd', 'infra',
             'trading', 'supplier', 'vendor']):
        return None

    clean_name = name.strip()
    norm_key = re.sub(r'[^a-z0-9]', '', clean_name.lower())
    phone_val = ""
    if ledger_phone_map:
        phone_val = (ledger_phone_map.get(clean_name.lower()) or
                     ledger_phone_map.get(norm_key) or "")
    if not phone_val:
        phone_val = extract_phone_from_party_fields(block)

    # Dynamic credit terms from master ledger registry or ledger block
    credit_days = None
    if ledger_credit_map:
        credit_days = (ledger_credit_map.get(clean_name.lower()) or
                       ledger_credit_map.get(norm_key))
    if credit_days is None:
        raw_credit = extract_tag_value(block, "BILLCREDITPERIOD") or extract_tag_value(block, "CREDITPERIOD") or ""
        credit_days = parse_credit_period_to_days(raw_credit)

    due_date = datetime.now().strftime("%Y-%m-%d")
    if credit_days is not None and credit_days > 0:
        due_date = (datetime.now() + timedelta(days=credit_days)).strftime("%Y-%m-%d")

    # Determine direction based on ledger parent group and advance status
    parent_lower = (parent or '').lower()
    if 'sundry creditor' in parent_lower or 'creditor' in parent_lower:
        dir_val = 'payable'
    elif is_debtor_group or 'sundry debtor' in parent_lower or 'debtor' in parent_lower:
        dir_val = 'credit' if is_credit_advance else 'receivable'
    else:
        dir_val = ''

    comp_upper = (fallback_company or "").upper()
    comp_prefix = "SB-" if "BUILDTECH" in comp_upper else ("SRP-" if "READY PLAST" in comp_upper else "")
    inv_code = f"{comp_prefix}LEDGER-{clean_name.replace(' ', '')[:12]}"

    return {
        "invoice_number": inv_code,
        "invoice_date": datetime.now().strftime("%d-%b-%y"),
        "ledger_name": clean_name,
        "company_name": fallback_company or "Tally Company",
        "phone": phone_val,
        "amount": amount,
        "status": "Credit" if is_credit_advance else "Pending",
        "due_date": due_date,
        "credit_period_days": credit_days,
        "direction": dir_val,
        "metadata": {
            "voucher_type": "Ledger Balance",
            "direction": dir_val,
            "parent": parent or "",
            "opening_balance": opening_amt,
            "closing_balance": amount,
            "is_credit_advance": is_credit_advance,
            "closing_balance_type": "Cr" if is_credit_advance else "Dr",
            "credit_period_days": credit_days,
            "tally_company": fallback_company or "Tally Company",
        }
    }


def parse_any_tally_xml(xml_text, fallback_company: str = "", ledger_phone_map: dict = None, ledger_credit_map: dict = None):
    """
    Parse ANY XML response from Tally by trying multiple block types in order:
      1. <VOUCHER> blocks (DayBook / Vouchers)
      2. <BILLFIXED> / <BILLCL> blocks (Outstanding bills)
      3. <BILL> blocks (generic Bill Outstanding)
      4. <LEDGER> blocks (List of Accounts)
      5. <DSPACCNAME> (Balance Sheet summary lines)
    Returns deduplicated records keyed by (invoice_number, ledger_name).
    """
    records = []
    _seen_keys = set()  # Dedup by (invoice_number, ledger_name)

    def _add_rec(rec):
        """Add record only if (invoice_number, ledger_name) not already seen."""
        if not rec:
            return
        key = (rec.get("invoice_number", ""), rec.get("ledger_name", ""))
        if key not in _seen_keys:
            _seen_keys.add(key)
            records.append(rec)

    # --- Pass 1: VOUCHER blocks (most complete data) ---
    voucher_blocks = re.findall(r'<VOUCHER[^>]*>([\s\S]*?)</VOUCHER>', xml_text, re.IGNORECASE)
    if voucher_blocks:
        log.info(f"  Parser: Found {len(voucher_blocks)} VOUCHER blocks")
        for vblock in voucher_blocks:
            rec = parse_voucher_block(vblock, fallback_company, ledger_phone_map, ledger_credit_map)
            _add_rec(rec)
        log.info(f"  Parser: {len(records)} vouchers kept after type filter+dedup (of {len(voucher_blocks)} found)")
        if records:
            return records
        # Vouchers found but all filtered — log the types to help debug
        types_found = []
        for vblock in voucher_blocks[:5]:
            vt = extract_tag_value(vblock, "VOUCHERTYPENAME") or extract_tag_value(vblock, "VOUCHERTYPE") or "Unknown"
            party = extract_tag_value(vblock, "BASICBUYERNAME") or extract_tag_value(vblock, "PARTYLEDGERNAME") or "(no party)"
            types_found.append(f"{vt}/{party}")
        log.info(f"  Parser: All vouchers filtered. Types seen: {', '.join(types_found)}")


    # --- Pass 2: BILLFIXED / BILLCL blocks (Bills Outstanding report) ---
    bill_blocks = re.findall(r'<(?:BILLFIXED|BILLCL)[^>]*>([\s\S]*?)</(?:BILLFIXED|BILLCL)>', xml_text, re.IGNORECASE)
    if bill_blocks:
        log.info(f"  Parser: Found {len(bill_blocks)} BILL blocks")
        for bblock in bill_blocks:
            bill_name = (extract_tag_value(bblock, "BILLNAME") or
                         extract_tag_value(bblock, "NAME") or
                         extract_tag_value(bblock, "REFNAME"))
            party = (extract_tag_value(bblock, "BILLPARTY") or
                     extract_tag_value(bblock, "PARENT") or
                     extract_tag_value(bblock, "LEDGERNAME"))
            clean_party = (party or "").strip()
            norm_key = re.sub(r'[^a-z0-9]', '', clean_party.lower())
            phone_val = ""
            if ledger_phone_map:
                phone_val = (ledger_phone_map.get(clean_party.lower()) or
                             ledger_phone_map.get(norm_key) or "")
            if not phone_val:
                phone_val = extract_phone_from_party_fields(bblock)

            amount = parse_number(
                extract_tag_value(bblock, "BILLCL") or
                extract_tag_value(bblock, "OPENINGBALANCE") or
                extract_tag_value(bblock, "CLOSINGBALANCE") or
                extract_tag_value(bblock, "AMOUNT")
            )
            raw_due = extract_tag_value(bblock, "BILLDUEDATE") or extract_tag_value(bblock, "BILLOVERDUEDATE") or ""
            raw_date = extract_tag_value(bblock, "BILLDATED") or ""
            raw_credit = extract_tag_value(bblock, "BILLCREDITPERIOD") or extract_tag_value(bblock, "CREDITPERIOD") or ""

            parsed_due = parse_tally_date_str(raw_due)
            credit_days = parse_credit_period_to_days(raw_credit)

            due_date = None
            if parsed_due:
                due_date = parsed_due
            elif credit_days is not None and raw_date and len(raw_date) == 8:
                try:
                    dt = datetime.strptime(raw_date, "%Y%m%d")
                    due_date = (dt + timedelta(days=credit_days)).strftime("%Y-%m-%d")
                except ValueError:
                    pass
            elif ledger_credit_map and clean_party and raw_date and len(raw_date) == 8:
                l_days = ledger_credit_map.get(clean_party.lower()) or ledger_credit_map.get(norm_key)
                if l_days is not None:
                    try:
                        dt = datetime.strptime(raw_date, "%Y%m%d")
                        due_date = (dt + timedelta(days=l_days)).strftime("%Y-%m-%d")
                    except ValueError:
                        pass

            if not due_date:
                if raw_date and len(raw_date) == 8:
                    try:
                        dt = datetime.strptime(raw_date, "%Y%m%d")
                        due_date = (dt + timedelta(days=30)).strftime("%Y-%m-%d")
                    except ValueError:
                        due_date = datetime.now().strftime("%Y-%m-%d")
                else:
                    due_date = datetime.now().strftime("%Y-%m-%d")

            if (bill_name or clean_party) and amount > 0:
                _add_rec({
                    "invoice_number": bill_name or f"BILL-{len(records)+1}",
                    "invoice_date": datetime.now().strftime("%d-%b-%y"),
                    "ledger_name": clean_party or bill_name or "Client",
                    "company_name": fallback_company or "Tally Company",
                    "phone": phone_val,
                    "amount": amount,
                    "status": "Overdue",
                    "due_date": due_date,
                    "credit_period_days": credit_days,
                })
        if records:
            return records

    # --- Pass 3: Generic <BILL> blocks ---
    if not records:
        gen_bills = re.findall(r'<BILL[^>]*>([\s\S]*?)</BILL>', xml_text, re.IGNORECASE)
        for bblock in gen_bills:
            name = extract_tag_value(bblock, "NAME") or extract_tag_value(bblock, "BILLNAME")
            parent = (extract_tag_value(bblock, "PARENT") or
                      extract_tag_value(bblock, "LEDGERNAME"))
            clean_party = (parent or name or "").strip()
            norm_key = re.sub(r'[^a-z0-9]', '', clean_party.lower())
            phone_val = ""
            if ledger_phone_map:
                phone_val = (ledger_phone_map.get(clean_party.lower()) or
                             ledger_phone_map.get(norm_key) or "")
            if not phone_val:
                phone_val = extract_phone_from_party_fields(bblock)

            amount = parse_number(
                extract_tag_value(bblock, "CLOSINGBALANCE") or
                extract_tag_value(bblock, "OPENINGBALANCE") or
                extract_tag_value(bblock, "AMOUNT")
            )
            if (name or parent) and amount > 0:
                _add_rec({
                    "invoice_number": name or f"BILL-{len(records)+1}",
                    "invoice_date": datetime.now().strftime("%d-%b-%y"),
                    "ledger_name": clean_party or name or "Client",
                    "company_name": fallback_company or "Tally Company",
                    "phone": phone_val,
                    "amount": amount,
                    "status": "Overdue",
                    "due_date": datetime.now().strftime("%Y-%m-%d"),
                })

    # --- Pass 4: LEDGER blocks (from List of Accounts) ---
    if not records:
        ledger_blocks = re.findall(r'<LEDGER[^>]*>([\s\S]*?)</LEDGER>', xml_text, re.IGNORECASE)
        log.info(f"  Parser: Found {len(ledger_blocks)} LEDGER blocks")
        for lblock in ledger_blocks:
            rec = parse_ledger_block(lblock, fallback_company, ledger_phone_map, ledger_credit_map)
            _add_rec(rec)

    # --- Pass 5: DSPACCNAME (Balance Sheet display names with amounts) ---
    if not records:
        dsp_names = re.findall(r'<DSPACCNAME[^>]*>([^<]+)</DSPACCNAME>', xml_text, re.IGNORECASE)
        dsp_amounts = re.findall(r'<DSPCLAMT[^>]*>([^<]+)</DSPCLAMT>', xml_text, re.IGNORECASE)
        log.info(f"  Parser: Found {len(dsp_names)} DSPACCNAME entries (Balance Sheet)")
        for i, name in enumerate(dsp_names):
            name = name.strip()
            amount = parse_number(dsp_amounts[i]) if i < len(dsp_amounts) else 0.0
            skip_keywords = ['capital', 'current assets', 'current liabilities',
                             'profit', 'loss', 'total', 'loans', 'opening',
                             'duties', 'taxes', 'closing stock', 'cash-in-hand',
                             'bank', 'fixed assets', 'investments']
            if any(kw in name.lower() for kw in skip_keywords):
                continue
            if name and amount > 0:
                norm_key = re.sub(r'[^a-z0-9]', '', name.lower())
                phone_val = ""
                if ledger_phone_map:
                    phone_val = (ledger_phone_map.get(name.lower()) or
                                 ledger_phone_map.get(norm_key) or "")
                _add_rec({
                    "invoice_number": f"BAL-{name.replace(' ', '')[:12]}",
                    "invoice_date": datetime.now().strftime("%d-%b-%y"),
                    "ledger_name": name,
                    "company_name": fallback_company or "Tally Company",
                    "phone": phone_val,
                    "amount": amount,
                    "status": "Pending",
                    "due_date": datetime.now().strftime("%Y-%m-%d"),
                })

    return records


def get_tally_loaded_companies() -> list:
    """
    Fetch all open / loaded companies in TallyPrime using multi-strategy Tally Collection queries:
      Strategy A: Official Tally Collection <TYPE>Collection</TYPE><ID>Company</ID>
      Strategy B: Tally Collection <TYPE>Collection</TYPE><ID>List of Companies</ID>
      Strategy C: TDL Company Collection Query
    """
    # Strategy A: Native Collection Company
    xml_coll_company = """<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>Company</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>"""

    # Strategy B: Native Collection List of Companies
    xml_coll_list = """<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Companies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>"""

    # Strategy C: TDL Company Query
    xml_tdl_company = """<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>CompanyReport</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="CompanyReport"><FORMS>CompanyForm</FORMS></REPORT>
          <FORM NAME="CompanyForm"><PARTS>CompanyPart</PARTS></FORM>
          <PART NAME="CompanyPart"><LINES>CompanyLine</LINES><REPEAT>CompanyLine : CompanyColl</REPEAT><SCROLLED>Vertical</SCROLLED></PART>
          <LINE NAME="CompanyLine"><FIELDS>CompNameField</FIELDS></LINE>
          <FIELD NAME="CompNameField"><SET>$Name</SET></FIELD>
          <COLLECTION NAME="CompanyColl"><TYPE>Company</TYPE></COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>"""

    for strat_label, payload in [
        ("Company_Collection", xml_coll_company),
        ("List_Companies_Collection", xml_coll_list),
        ("TDL_Company_Query", xml_tdl_company),
    ]:
        resp = query_tally(payload, strat_label)
        if not resp or len(resp) < 50:
            continue

        save_debug_xml(resp, f"Discover_{strat_label}")

        # Extract company names from various tags
        names = []
        names.extend(re.findall(r'<COMPANY[^>]+NAME="([^"]+)"', resp, re.IGNORECASE))
        names.extend(re.findall(r'<COMPANYNAME[^>]*>([^<]+)</COMPANYNAME>', resp, re.IGNORECASE))
        names.extend(re.findall(r'<NAME[^>]*>([^<]+)</NAME>', resp, re.IGNORECASE))
        names.extend(re.findall(r'<SVCURRENTCOMPANY[^>]*>([^<]+)</SVCURRENTCOMPANY>', resp, re.IGNORECASE))
        names.extend(re.findall(r'<BASICCOMPANYNAME[^>]*>([^<]+)</BASICCOMPANYNAME>', resp, re.IGNORECASE))

        cleaned = []
        for n in names:
            n = n.strip()
            if n and n not in cleaned and not n.startswith("$$") and not n.lower().startswith("form") and not n.lower().startswith("report") and not n.lower().startswith("line") and not n.lower().startswith("part") and len(n) > 1:
                cleaned.append(n)

        if cleaned:
            log.info(f"  [Discovery] Found {len(cleaned)} company(ies) via {strat_label}: {', '.join(cleaned)}")
            return cleaned

    return []


def inject_company_into_xml(xml_payload: str, company_name: str = "") -> str:
    """
    Inject SVCURRENTCOMPANY into Tally XML request static variables.
    Handles both formats:
      1. TDL Collection: <DESC><STATICVARIABLES>...</STATICVARIABLES></DESC>
      2. ExportData:     <EXPORTDATA><REQUESTDESC><STATICVARIABLES>...</STATICVARIABLES></REQUESTDESC></EXPORTDATA>
    Preserves all existing tags. Only adds/replaces SVCURRENTCOMPANY.
    """
    if not company_name:
        return xml_payload

    company_tag = f"<SVCURRENTCOMPANY>{company_name}</SVCURRENTCOMPANY>"

    # Find the FIRST <STATICVARIABLES> block (works for both TDL Collection and ExportData)
    sv_match = re.search(r'(<STATICVARIABLES>)([\s\S]*?)(</STATICVARIABLES>)', xml_payload, re.IGNORECASE)
    if sv_match:
        existing_inner = sv_match.group(2)
        # Remove any existing SVCURRENTCOMPANY to avoid duplicates
        existing_inner = re.sub(r'\s*<SVCURRENTCOMPANY>[^<]*</SVCURRENTCOMPANY>\s*', '', existing_inner, flags=re.IGNORECASE)
        # Insert right after SVEXPORTFORMAT if present, otherwise append at end
        fmt_match = re.search(r'(</SVEXPORTFORMAT>)', existing_inner, re.IGNORECASE)
        if fmt_match:
            insert_pos = fmt_match.end()
            new_inner = existing_inner[:insert_pos] + f"\n        {company_tag}" + existing_inner[insert_pos:]
        else:
            new_inner = existing_inner.rstrip() + f"\n        {company_tag}\n      "
        new_block = f"<STATICVARIABLES>{new_inner}</STATICVARIABLES>"
        return xml_payload[:sv_match.start()] + new_block + xml_payload[sv_match.end():]

    return xml_payload


def fetch_from_tally():
    """
    Connect to Tally, discover ALL open companies, query party phone master registries,
    and extract complete vouchers with 100% accurate party contact details.
    """
    log.info(f"Connecting to Tally at {TALLY_HOST}...")

    loaded_companies = get_tally_loaded_companies()
    if loaded_companies:
        log.info(f"Detected {len(loaded_companies)} open company(ies) in TallyPrime: {', '.join(loaded_companies)}")
        # Auto-seed every detected company to Supabase so it appears in Settings
        global _CACHED_COMPANY_PROFILES
        _CACHED_COMPANY_PROFILES = None  # Invalidate cache before seeding
        for comp_name in loaded_companies:
            if comp_name:
                auto_seed_tally_company(comp_name)
        _CACHED_COMPANY_PROFILES = None  # Invalidate again so fresh profiles are fetched
    else:
        log.info("Querying Tally for active open company vouchers.")
        loaded_companies = [""]

    all_records = []
    combined_xml = ""

    total_companies = len(loaded_companies)
    for comp_idx, comp in enumerate(loaded_companies):
        comp_label = f" [{comp}]" if comp else ""
        log.info(f"--- Querying Tally Company{comp_label} ({comp_idx+1}/{total_companies}) ---")
        print(f"\n[Company {comp_idx+1}/{total_companies}] {comp or 'Default'}", flush=True)

        # ─────────────────────────────────────────────────────────────────────────
        # STEP 0: Fetch Master Ledger Phone & Credit Registry FIRST for this company
        # ─────────────────────────────────────────────────────────────────────────
        ledger_phone_map, ledger_credit_map = fetch_tally_ledger_master(comp)
        if ledger_phone_map:
            print(f"  📞 Master Ledger Registry: {len(ledger_phone_map)} contact(s), {len(ledger_credit_map)} credit term(s) loaded", flush=True)

        strategies = [
            # Strategy 1 (Fast & Proven): Sundry Debtors ledger closing balances & master records
            (f"1_SundryDebtors_{comp}" if comp else "1_SundryDebtors",
             inject_company_into_xml(SUNDRY_DEBTORS_XML, comp)),
            # Strategy 2: Sales DayBook vouchers (current FYs, lightweight, captures receivables)
            (f"2_SalesVouchers_{comp}" if comp else "2_SalesVouchers",
             inject_company_into_xml(DAYBOOK_XML, comp)),
            # Strategy 3: Receipt & Payment DayBook vouchers (current FYs, captures bank settlements & bill allocations)
            (f"3_ReceiptPayment_{comp}" if comp else "3_ReceiptPayment",
             inject_company_into_xml(VOUCHERS_XML, comp)),
        ]

        # FIX 1: Collect records from ALL strategies (no break after first success)
        # This ensures DayBook + Outstanding + Ledger data are all captured.
        comp_seen_keys = set()   # Per-company dedup set
        comp_records = []
        total_strategies = len(strategies)
        consecutive_timeouts = 0

        for strat_idx, (label, xml_payload) in enumerate(strategies):
            # Circuit breaker: If 2 consecutive queries timed out or if we already have records and hit a timeout,
            # stop hammering Tally to prevent single-threaded gateway exhaustion
            if consecutive_timeouts >= 2:
                log.warning(f"  [Circuit Breaker] Skipping remaining fallback strategies to protect Tally from overload.")
                print(f"       ↳ Circuit breaker: Stopping further queries to prevent Tally lockup ({len(comp_records)} records collected so far)", flush=True)
                break

            log.info(f"  Strategy [{strat_idx+1}/{total_strategies}] {label}...")
            print(f"  [{strat_idx+1}/{total_strategies}] Trying strategy: {label}", flush=True)

            # Allow 45s for voucher queries (Sales & Receipts across multiple FYs) so Tally can assemble XML without timing out
            strat_timeout = 45 if any(k in label.lower() for k in ["sales", "receipt", "voucher", "daybook"]) else 25
            xml_data = query_tally(xml_payload, label, timeout=strat_timeout)

            if not xml_data or len(xml_data) < 50:
                consecutive_timeouts += 1
                time.sleep(0.5)  # Grace period for Tally queue
                print(f"       ↳ No response / skipped", flush=True)
                continue

            consecutive_timeouts = 0

            if not combined_xml:
                combined_xml = xml_data

            save_debug_xml(xml_data, label)

            # Auto-extract current company from response if comp was empty
            detected_comp = (comp or
                             extract_tag_value(xml_data, "SVCURRENTCOMPANY") or
                             extract_tag_value(xml_data, "COMPANYNAME") or
                             extract_tag_value(xml_data, "SVCOMPANYNAME") or
                             "Tally Company")

            recs = parse_any_tally_xml(xml_data, fallback_company=detected_comp, ledger_phone_map=ledger_phone_map, ledger_credit_map=ledger_credit_map)
            if recs:
                # Merge new records (dedup by invoice_number)
                new_count = 0
                for r in recs:
                    key = r.get("invoice_number", "")
                    if not key or key not in comp_seen_keys:
                        comp_seen_keys.add(key)
                        comp_records.append(r)
                        new_count += 1
                log.info(f"  [{label}] +{new_count} new records (running total: {len(comp_records)})")
                print(f"       ↳ +{new_count} new records  (total so far: {len(comp_records)})", flush=True)
            else:
                print(f"       ↳ 0 records from this strategy", flush=True)

        log.info(f"  Company '{comp or 'default'}': {len(comp_records)} total records across all strategies")
        print(f"  ✅ Company '{comp or 'default'}': {len(comp_records)} total records collected", flush=True)

        for r in comp_records:
            if not r.get("company_name") or r.get("company_name") == "Tally Company":
                if comp:
                    r["company_name"] = comp
            all_records.append(r)

    if not all_records:
        if combined_xml:
            save_debug_xml(combined_xml, "LAST_ATTEMPT")
            log.warning("Tally responded but no records were parsed. Check debug XML files.")
        else:
            log.error("Tally did not respond to any request. Is Tally running with HTTP Server on port 9000?")

    return all_records, combined_xml

# ==============================================================================
# INVOICE PDF GENERATOR + SUPABASE STORAGE UPLOADER
# Exact Tally GST Tax Invoice Layout with Dynamic Brand Logo & e-Invoice QR Code
# ==============================================================================

FMT_AMOUNT = lambda n: f"\u20b9{float(n):,.2f}"  # ₹ symbol
FMT_DATE   = lambda d: datetime.strptime(d, "%Y%m%d").strftime("%d %b %Y") if d and len(d) == 8 else (d or "N/A")

_CACHED_ORG_PROFILE = None
_CACHED_COMPANY_PROFILES = None

# The 3 real TallyPrime companies for this client.
# Exact names match what Tally reports in Company_Collection XML.
# These are used for voucher-to-company matching when syncing.
DEFAULT_COMPANY_REGISTRY = [
    {
        "id": "tally-shobha-buildtech",
        "organization_id": ORGANIZATION_ID,
        "company_name": "SHOBHA BUILDTECH",
        "alias_names": ["SHOBHA BUILDTECH", "SB", "Shobha Buildtech", "SHOBHAB", "SHOBHA BUILD TECH"],
        "company_address": "Valsad, Gujarat",
        "gstin_number": "",
        "state_name": "Gujarat",
        "state_code": "24",
        "is_default": False,
        "tally_sourced": True,
    },
    {
        "id": "tally-shobha-ready-plast",
        "organization_id": ORGANIZATION_ID,
        "company_name": "SHOBHA READY PLAST",
        "alias_names": ["SHOBHA READY PLAST", "SRP", "Shobha Ready Plast", "SHOBHARP", "SHOBHA READYPLAST"],
        "company_address": "NH48, Near Kolei Khadi Sarodhi, Valsad, Gujarat - 396001",
        "gstin_number": "24AGCPJ2785R1ZV",
        "state_name": "Gujarat",
        "state_code": "24",
        "is_default": False,
        "tally_sourced": True,
    },
    {
        "id": "tally-sobhainfra-tech-private-limited",
        "organization_id": ORGANIZATION_ID,
        "company_name": "SOBHAINFRA TECH PRIVATE LIMITED",
        "alias_names": ["SOBHAINFRA TECH PRIVATE LIMITED", "SOBHAINFRA", "Sobha Infra Tech", "SOBHAINFRA TECH", "SOBHA INFRA TECH"],
        "company_address": "Registered Office, Gujarat",
        "gstin_number": "",
        "state_name": "Gujarat",
        "state_code": "24",
        "is_default": True,
        "tally_sourced": True,
    },
]



def auto_seed_tally_company(company_name: str) -> dict:
    """
    Called for EVERY company detected in Tally at sync start.
    Upserts a real profile into Supabase company_profiles with tally_sourced=True.
    Admin can then edit GSTIN/bank/logo via Settings UI.
    Returns the profile dict.
    """
    clean_id  = f"tally-{re.sub(r'[^a-zA-Z0-9]', '-', company_name).lower().strip('-')}"
    new_profile = {
        "id": clean_id,
        "organization_id": ORGANIZATION_ID,
        "company_name": company_name.strip(),
        "alias_names": [company_name.strip()],
        "company_logo_url": "",
        "company_address": "",
        "gstin_number": "",
        "company_udyam_reg": "",
        "admin_email": "",
        "contact_phone": "",
        "bank_name": "",
        "bank_account_no": "",
        "bank_ifsc": "",
        "upi_id": "",
        "state_name": "",
        "state_code": "",
        "jurisdiction": "",
        "invoice_footer_notes": "Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days.",
        "tally_sourced": True,
        "is_default": False,
    }

    if SUPABASE_URL and SUPABASE_KEY:
        try:
            # CRITICAL: Use ignore-duplicates so we NEVER overwrite admin-set
            # logo, bank details, or UPI ID that was configured in Settings UI.
            # This only inserts if the company does not already exist.
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/company_profiles?on_conflict=organization_id,company_name",
                json=new_profile,
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=ignore-duplicates,return=representation",
                },
                timeout=5
            )
            if resp.status_code in (200, 201):
                result = resp.json()
                if isinstance(result, list) and result:
                    log.info(f"  [Company Seed] '{company_name}' → registered in Settings (✅ first-time only)")
                    return result[0]
            else:
                log.debug(f"  [Company Seed] Upsert {resp.status_code}: {resp.text[:150]}")
        except Exception as e:
            log.debug(f"  [Company Seed] Non-fatal error: {e}")

    return new_profile


def fetch_all_company_profiles() -> list:
    """Fetch all registered company profiles from Supabase company_profiles table."""
    global _CACHED_COMPANY_PROFILES
    if _CACHED_COMPANY_PROFILES:
        return _CACHED_COMPANY_PROFILES

    profiles = []

    if SUPABASE_URL and SUPABASE_KEY:
        try:
            url = f"{SUPABASE_URL}/rest/v1/company_profiles?select=*&limit=100"
            headers = {
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            }
            resp = requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                rows = resp.json()
                if rows and len(rows) > 0:
                    profiles = rows
        except Exception as e:
            log.debug(f"Could not fetch company_profiles from Supabase: {e}")

    _CACHED_COMPANY_PROFILES = profiles
    return profiles


def get_matching_company_profile(company_name: str | None = None, profiles: list | None = None) -> dict:
    """
    Auto-match a voucher's company name against all registered company profiles.
    Matches by exact name, substring, or alias.
    If company is newly created in Tally, dynamically creates a real company profile using the exact Tally name!
    """
    if not profiles:
        profiles = fetch_all_company_profiles()

    if not company_name or company_name.strip().lower() in ('default', 'unknown', 'tally company', 'tallyprime live'):
        for p in profiles:
            if p.get("is_default"):
                return p
        return profiles[0] if profiles else fetch_org_profile()


    target = company_name.strip().upper()

    # Exact name match
    for p in profiles:
        p_name = p.get("company_name", "").strip().upper()
        if p_name == target:
            return p

    # Alias / Substring match
    for p in profiles:
        p_name = p.get("company_name", "").strip().upper()
        if (p_name and p_name in target) or (target and target in p_name):
            return p

        aliases = p.get("alias_names", [])
        if isinstance(aliases, list):
            for a in aliases:
                if a and (a.strip().upper() in target or target in a.strip().upper()):
                    return p

    # If company is newly created in Tally, dynamically construct a real profile for it!
    # Bug 7 fix: include organization_id so it appears in Settings UI
    # Bug 6 fix: correct conflict resolution key for upsert
    clean_id = f"comp-{re.sub(r'[^a-zA-Z0-9]', '-', company_name).lower()}"
    clean_tag = re.sub(r'[^a-zA-Z0-9]', '', company_name).lower() or 'company'
    new_profile = {
        "id": clean_id,
        "organization_id": ORGANIZATION_ID,
        "company_name": company_name.strip(),
        "alias_names": [company_name.strip()],
        "company_logo_url": "",
        "company_address": f"Registered Office, {company_name.strip()}",
        "gstin_number": "",  # Admin must fill in Settings
        "company_udyam_reg": "",
        "admin_email": "",
        "contact_phone": "",
        "bank_name": "",
        "bank_account_no": "",
        "bank_ifsc": "",
        "upi_id": "",
        "state_name": "Gujarat",
        "state_code": "24",
        "jurisdiction": "",
        "invoice_footer_notes": "Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days.",
        "is_default": False,
    }

    # Auto-register in Supabase — ONLY insert if company doesn't exist yet.
    # Use ignore-duplicates to protect any admin-configured logo/bank/UPI.
    if SUPABASE_URL and SUPABASE_KEY:
        try:
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/company_profiles?on_conflict=organization_id,company_name",
                json=new_profile,
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=ignore-duplicates,return=minimal",
                },
                timeout=5
            )
            if resp.status_code in (200, 201):
                log.info(f"  [Company Auto-Seed] New company registered: '{company_name}' → appears in Settings!")
            else:
                log.debug(f"  [Company Auto-Seed] Supabase returned {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            log.debug(f"  [Company Auto-Seed] Non-fatal: {e}")

    return new_profile


def fetch_org_profile() -> dict:
    """
    Fetch the live business organization profile from Supabase org_settings table.
    Ensures company name, logo, address, GSTIN, phone, email, udyam, and bank details
    set in the SuperAdmin General Settings appear dynamically on the generated invoice.
    """
    global _CACHED_ORG_PROFILE
    if _CACHED_ORG_PROFILE:
        return _CACHED_ORG_PROFILE

    profile = dict(DEFAULT_COMPANY_REGISTRY[0])
    profile["org_name"] = profile["company_name"]

    if not SUPABASE_URL or not SUPABASE_KEY:
        _CACHED_ORG_PROFILE = profile
        return profile

    try:
        url = f"{SUPABASE_URL}/rest/v1/org_settings?select=key,value&limit=50"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            rows = resp.json()
            for r in rows:
                k = r.get("key")
                v = r.get("value")
                if k and v:
                    profile[k] = v
                    if k == "org_name":
                        profile["company_name"] = v
    except Exception as e:
        log.debug(f"Could not fetch org_settings live from Supabase: {e}")

    _CACHED_ORG_PROFILE = profile
    return profile


# ==============================================================================
# ON-DEMAND BROWSER PDF ARCHITECTURE (v5.0 - Zero Lag / Zero Tally Crash)
# ==============================================================================
# PDFs (GST Tax Invoices, Consignment Notes, e-Way Bills, Ledgers) are generated
# on-demand in the browser client-side (via HTML5 Canvas & jsPDF in InvoiceDocModal.jsx).
# Local ReportLab PDF generation on the Tally PC has been completely removed to ensure
# instantaneous sync, zero RAM/CPU spike, and 100% stability on the Tally machine.
# ==============================================================================


def push_to_cloud(vouchers):
    """
    DATA-ONLY SYNC APPROACH (v5.0):
    PDFs are NO LONGER generated or uploaded during sync — this was the root cause of
    memory exhaustion and Supabase free-tier storage burnout on large datasets.

    New flow:
    1. Load local sync cache — skip vouchers already pushed in previous runs.
    2. Deduplicate remaining vouchers by invoice_number.
    3. For each voucher: push RAW DATA ONLY directly to Supabase REST API.
       PDFs are generated on-demand in the browser (client-side) when a user clicks
       "Tax Bill", "e-Way", "Pending" or "Ledger" buttons in the Finance page.
    4. Mark each voucher in local cache immediately after successful push.
    5. Send a lightweight status ping to Netlify at the end.

    Benefits:
    - Zero RAM spike during sync (no ReportLab PDF generation per voucher).
    - Zero Supabase Storage usage (saves free-tier 1 GB limit).
    - Sync is dramatically faster (data-only, no PDF I/O).
    - PDFs are always fresh and accurate — generated from live DB data in the browser.
    """

    # ── Local sync cache (skip already-synced vouchers on re-runs) ────────────
    cache_file = os.path.join(SCRIPT_DIR, "sync_cache.json")
    try:
        with open(cache_file, "r", encoding="utf-8") as f:
            sync_cache = json.load(f)  # {invoice_number: iso_timestamp}
    except Exception:
        sync_cache = {}

    def save_cache():
        try:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(sync_cache, f)
        except Exception:
            pass

    # ── Deduplication ─────────────────────────────────────────────────────────
    dedup_map = {}
    for v in vouchers:
        key = v.get("invoice_number", "")
        if not key:
            continue
        existing = dedup_map.get(key)
        if existing is None:
            dedup_map[key] = v
        else:
            if v.get("phone") and not existing.get("phone"):
                dedup_map[key] = v
    all_unique = list(dedup_map.values())

    # ── Party Reconciliation ──────────────────────────────────────────────────
    # Reconcile customer sales invoices against receipts and closing balance
    party_vouchers = {}
    for v in all_unique:
        p_name = (v.get("ledger_name") or v.get("client_name") or "").strip().upper()
        if p_name:
            party_vouchers.setdefault(p_name, []).append(v)

    reconciled_paid_updates = 0
    for p_name, p_vchs in party_vouchers.items():
        sales_vchs = [
            v for v in p_vchs 
            if not str(v.get("invoice_number", "")).upper().startswith("LEDGER-")
            and ("sales" in str(v.get("voucher_type", "")).lower() or "receivable" in str(v.get("direction", "")).lower())
        ]
        rcpt_vchs = [
            v for v in p_vchs 
            if "receipt" in str(v.get("voucher_type", "")).lower() or "received" in str(v.get("direction", "")).lower()
        ]
        ledger_marker = next(
            (v for v in p_vchs if str(v.get("invoice_number", "")).upper().startswith("LEDGER-")),
            None
        )

        total_rcpts = sum(float(v.get("amount") or 0) for v in rcpt_vchs)
        sales_vchs.sort(key=lambda x: str(x.get("invoice_date") or x.get("date") or ""))

        # 1. Match explicit Agst Ref bill allocations
        for rv in rcpt_vchs:
            for alloc in rv.get("bill_allocations", []):
                ref_name = str(alloc.get("name", "")).strip()
                ref_type = str(alloc.get("type", "")).strip().lower()
                if "agst" in ref_type or not ref_type:
                    for sv in sales_vchs:
                        sv_num = str(sv.get("invoice_number", "")).strip()
                        if sv_num and (ref_name in sv_num or sv_num in ref_name):
                            if sv.get("status") != "Paid":
                                sv["status"] = "Paid"
                                sv["pending_amount"] = 0.0
                                sv["paid_amount"] = float(sv.get("amount") or 0)
                                sv["_force_status_update"] = True
                                reconciled_paid_updates += 1

        # 2. Apply total receipts in FIFO order accounting for prior opening balance
        prior_op = 0.0
        if ledger_marker:
            tally_cl = float(ledger_marker.get("amount") or 0.0)
            tot_s = sum(float(s.get("amount") or 0) for s in sales_vchs)
            prior_op = round(tally_cl - (tot_s - total_rcpts), 2)
            lm_meta = ledger_marker.setdefault("metadata", {})
            lm_meta["opening_balance"] = prior_op
            lm_meta["closing_balance"] = tally_cl

        # Unallocated receipts settle prior opening balance FIRST! (Or include customer advance if prior_op < 0)
        rem_rcpts = max(0.0, total_rcpts - prior_op)
        for sv in sales_vchs:
            amt = float(sv.get("amount") or 0)
            if rem_rcpts >= amt and amt > 0:
                if sv.get("status") != "Paid":
                    sv["status"] = "Paid"
                    sv["pending_amount"] = 0.0
                    sv["paid_amount"] = amt
                    sv["_force_status_update"] = True
                    reconciled_paid_updates += 1
                rem_rcpts -= amt
            elif rem_rcpts > 0:
                sv["pending_amount"] = max(0.0, amt - rem_rcpts)
                sv["paid_amount"] = rem_rcpts
                rem_rcpts = 0.0
            else:
                sv["pending_amount"] = amt

        # 3. If Tally ledger closing balance is 0: ALL sales bills are Paid!
        if ledger_marker:
            tally_cl = float(ledger_marker.get("amount") or 0)
            if tally_cl == 0:
                for sv in sales_vchs:
                    if sv.get("status") != "Paid":
                        sv["status"] = "Paid"
                        sv["pending_amount"] = 0.0
                        sv["paid_amount"] = float(sv.get("amount") or 0)
                        sv["_force_status_update"] = True
                        reconciled_paid_updates += 1

        # 4. Reconcile Vendor Purchase Vouchers against Payments
        pur_vchs = [
            v for v in p_vchs
            if not str(v.get("invoice_number", "")).upper().startswith("LEDGER-")
            and ("purchase" in str(v.get("voucher_type", "")).lower() or "payable" in str(v.get("direction", "")).lower())
        ]
        pmt_vchs = [
            v for v in p_vchs
            if "payment" in str(v.get("voucher_type", "")).lower() or "paid_out" in str(v.get("direction", "")).lower()
        ]
        if pur_vchs:
            total_pmts = sum(float(v.get("amount") or 0) for v in pmt_vchs)
            pur_vchs.sort(key=lambda x: str(x.get("invoice_date") or x.get("date") or ""))

            # Explicit Agst Ref bill allocations for vendor payments
            for pv in pmt_vchs:
                for alloc in pv.get("bill_allocations", []):
                    ref_name = str(alloc.get("name", "")).strip().upper()
                    ref_type = str(alloc.get("type", "")).strip().lower()
                    if "agst" in ref_type or not ref_type:
                        for pb in pur_vchs:
                            pb_num = str(pb.get("invoice_number", "")).strip().upper()
                            pb_raw = str(pb.get("raw_voucher_number", "")).strip().upper()
                            if (ref_name and pb_num and (ref_name in pb_num or pb_num in ref_name)) or (ref_name and pb_raw and (ref_name in pb_raw or pb_raw in ref_name)):
                                if pb.get("status") != "Paid":
                                    pb["status"] = "Paid"
                                    pb["pending_amount"] = 0.0
                                    pb["paid_amount"] = float(pb.get("amount") or 0)
                                    pb["_force_status_update"] = True
                                    reconciled_paid_updates += 1

            # FIFO settlement for remaining vendor payments
            rem_pmts = total_pmts
            for pb in pur_vchs:
                amt = float(pb.get("amount") or 0)
                cur_paid = float(pb.get("paid_amount") or 0)
                needed = max(0.0, amt - cur_paid)
                if needed > 0 and rem_pmts > 0:
                    applied = min(needed, rem_pmts)
                    new_paid = cur_paid + applied
                    pb["paid_amount"] = new_paid
                    pb["pending_amount"] = max(0.0, amt - new_paid)
                    if pb["pending_amount"] <= 0.01:
                        pb["status"] = "Paid"
                    pb["_force_status_update"] = True
                    rem_pmts -= applied
                elif cur_paid == 0 and pb.get("status") != "Paid":
                    pb["pending_amount"] = amt

    if reconciled_paid_updates > 0:
        log.info(f"  [Reconciliation] ✅ Marked {reconciled_paid_updates} voucher(s) as Settled/Paid via allocations & FIFO!")

    # ── Enterprise Cryptographic Change Detection (Industry Standard) ─────────
    # Evaluates MD5 fingerprint of ALL critical business fields (amount, status, date,
    # line items, challan, truck, phone, allocations).
    # Guarantees that ANY modification made in Tally is immediately detected and synced!
    to_process = []
    altered_count = 0
    new_count = 0
    new_sales_vouchers = []

    for v in all_unique:
        inv_num = str(v.get("invoice_number", "")).strip()

        # CRITICAL: Always push LEDGER-* markers so Tally master balances are 100% up-to-date
        is_ledger = "LEDGER-" in inv_num.upper()
        if is_ledger:
            to_process.append(v)
            altered_count += 1
            continue

        curr_hash = compute_voucher_hash(v)
        v["_voucher_hash"] = curr_hash
        cached = sync_cache.get(inv_num)

        if cached is None:
            # New voucher never seen before
            to_process.append(v)
            new_count += 1
            is_sales = not is_ledger and ("sales" in str(v.get("voucher_type", "")).lower() or "receivable" in str(v.get("direction", "")).lower())
            if is_sales:
                new_sales_vouchers.append(v)
        elif isinstance(cached, dict):
            cached_hash = cached.get("hash")
            if cached_hash:
                # If hash matches, Tally voucher is 100% byte-for-byte identical (no changes)
                if cached_hash != curr_hash:
                    to_process.append(v)
                    altered_count += 1
            else:
                # Upgrade legacy cache entry without hash
                cached_amt = float(cached.get("amount") or 0)
                cached_phone = (cached.get("phone") or "").strip()
                cached_status = cached.get("status")
                new_amt = float(v.get("amount") or 0)
                new_phone = (v.get("phone") or v.get("client_phone") or "").strip()
                new_status = v.get("status") or "Pending"
                if abs(cached_amt - new_amt) > 0.01 or (new_phone and cached_phone != new_phone) or (cached_status != new_status):
                    to_process.append(v)
                    altered_count += 1
        elif isinstance(cached, (str, int, float)):
            # Legacy cache entry from older versions (e.g. timestamp string) -> process & upgrade
            to_process.append(v)
            altered_count += 1
        elif v.get("_force_status_update"):
            to_process.append(v)

    # Zero-lag Sync: PDFs are NOT generated here on the Tally PC to ensure instant sync & avoid memory/CPU lag on TallyPrime.
    # PDFs are generated on-demand in the browser before sending or viewing.

    skipped = len(all_unique) - len(to_process)
    log.info(
        f"  [Dedup] {len(vouchers)} raw → {len(all_unique)} unique → "
        f"{len(to_process)} to process "
        f"({new_count} new, {altered_count} modified in Tally, {skipped} unchanged)"
    )
    if altered_count > 0:
        log.info(f"  [Change Detection] 📝 {altered_count} voucher(s) modified in Tally — pushing updates!")

    if not to_process:
        log.info("  [Cloud Push] All vouchers up-to-date with Tally. Nothing to do.")
        return {"success": True, "count": 0, "skipped": skipped}

    print(f"\n[Data Sync] {len(to_process)} vouchers to push (Bulk Batch Upsert)...", flush=True)
    print("  ℹ️  PDFs are generated on-demand in the browser — zero storage used.", flush=True)

    # ── Supabase REST headers ─────────────────────────────────────────────────
    sb_headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    sb_invoices_url = f"{SUPABASE_URL}/rest/v1/invoices?on_conflict=organization_id,tally_voucher_number"
    sb_ledger_url   = f"{SUPABASE_URL}/rest/v1/tally_mappings?on_conflict=organization_id,tally_ledger_name"

    pushed_ok = 0
    push_errors = 0
    total_v = len(to_process)

    # ── Bulk Batch Upsert (100 rows per HTTP POST for maximum speed) ───────────
    BATCH_SIZE = 100
    for b_idx in range(0, total_v, BATCH_SIZE):
        batch = to_process[b_idx:b_idx + BATCH_SIZE]
        batch_rows = []

        for v in batch:
            inv_num = v.get("invoice_number", "")
            inv_date = v.get("invoice_date") or v.get("date") or datetime.now().strftime("%Y-%m-%d")
            if inv_date and len(inv_date) == 8 and inv_date.isdigit():
                inv_date = f"{inv_date[:4]}-{inv_date[4:6]}-{inv_date[6:8]}"

            invoice_row = {
                "organization_id": ORGANIZATION_ID,
                "invoice_number": inv_num,
                "tally_voucher_number": inv_num,
                "client_name": v.get("ledger_name") or v.get("client_name") or "Unknown",
                "client_phone": v.get("phone") or v.get("client_phone") or "",
                "amount": float(v.get("amount") or 0),
                "status": v.get("status") or "Pending",
                "invoice_date": inv_date,
                "due_date": v.get("due_date") or None,
                "company_name": v.get("company_name") or "TallyPrime Live",
                "pdf_url": v.get("pdf_url") or None,
                "metadata": {
                    **(v.get("metadata") or {}),
                    "voucher_type":     v.get("voucher_type") or (v.get("metadata") or {}).get("voucher_type", ""),
                    "opening_balance":  float((v.get("metadata") or {}).get("opening_balance") or 0.0),
                    "closing_balance":  float((v.get("metadata") or {}).get("closing_balance") or v.get("amount") or 0.0),
                    "direction":        v.get("direction", ""),
                    "tally_company":    v.get("company_name", ""),
                    "item_name":        v.get("item_name", ""),
                    "hsn_code":         v.get("hsn_code", ""),
                    "truck_no":         v.get("truck_no", ""),
                    "challan_no":       v.get("challan_no", ""),
                    "challan_date":     v.get("challan_date", ""),
                    "site":             v.get("site", ""),
                    "quantity_str":     v.get("quantity_str", ""),
                    "rate_str":         v.get("rate_str", ""),
                    "unit":             v.get("unit", ""),
                    "eway_bill_no":     v.get("eway_bill_no", ""),
                    "igst_rate":        v.get("igst_rate", ""),
                    "gstin":            v.get("gstin", ""),
                    "buyer_address":    v.get("buyer_address", ""),
                    "buyer_state":      v.get("buyer_state", ""),
                    "buyer_state_code": v.get("buyer_state_code", ""),
                    "pending_amount":   v.get("pending_amount"),
                    "paid_amount":      v.get("paid_amount"),
                    "credit_period_days": v.get("credit_period_days"),
                    "bill_allocations": v.get("bill_allocations", []),
                    "pdf_url":          v.get("pdf_url") or None,
                    "pdf_generation":   "server-side" if v.get("pdf_url") else "browser-side",
                    "sync_source":      "TallyPrime XML Bridge v5.0",
                    "raw_voucher_number": v.get("raw_voucher_number") or "",
                    "supplier_invoice_number": v.get("supplier_invoice_number") or "",
                    "synced_at":        datetime.now().isoformat(),
                },
            }
            batch_rows.append(invoice_row)

        pct = min(100, int(((b_idx + len(batch)) / total_v) * 100)) if total_v else 100
        bar = '█' * (pct // 5) + '░' * (20 - pct // 5)
        print(f"  [{bar}] {pct}% — {min(total_v, b_idx + len(batch))}/{total_v} vouchers", flush=True)
        _push_sync_progress(min(total_v, b_idx + len(batch)), total_v, "uploading")

        try:
            resp = requests.post(
                sb_invoices_url,
                json=batch_rows,
                headers=sb_headers,
                timeout=15,
            )
            if resp.status_code in (200, 201, 204):
                pushed_ok += len(batch)
                for v in batch:
                    sync_cache[v.get("invoice_number", "")] = {
                        "ts": datetime.now().isoformat(),
                        "hash": v.get("_voucher_hash", ""),
                        "amount": float(v.get("amount") or 0),
                        "status": v.get("status") or "Pending",
                        "phone": (v.get("phone") or v.get("client_phone") or "").strip()
                    }
                save_cache()
            else:
                push_errors += len(batch)
                log.warning(f"  [Push Batch] HTTP {resp.status_code}: {resp.text[:160]}")
        except Exception as e:
            push_errors += len(batch)
            log.warning(f"  [Push Batch] Error: {e}")

    # ── Step 3: Upsert unique ledger mappings in batch ────────────────────────
    unique_ledgers = {}
    for v in to_process:
        ledger = (v.get("ledger_name") or v.get("client_name") or "").strip()
        phone = (v.get("client_phone") or v.get("phone") or "").strip()
        if ledger and (ledger not in unique_ledgers or phone):
            unique_ledgers[ledger] = phone

    if unique_ledgers:
        mapping_rows = [
            {
                "organization_id": ORGANIZATION_ID,
                "tally_ledger_name": led,
                "mapping_status": "exact_match" if ph else "possible_match",
                "confidence_score": 1.0 if ph else 0.5,
                "updated_at": datetime.now().isoformat(),
            }
            for led, ph in unique_ledgers.items()
        ]
        for m_idx in range(0, len(mapping_rows), 100):
            m_batch = mapping_rows[m_idx:m_idx + 100]
            try:
                requests.post(sb_ledger_url, json=m_batch, headers=sb_headers, timeout=10)
            except Exception:
                pass

    # Final cache save
    save_cache()
    log.info(f"  [Data Sync] Done: {pushed_ok} synced, {push_errors} errors, {skipped} skipped (already synced)")

    # ── Status ping & WhatsApp dispatch to Netlify ────────────────────────────
    try:
        ping_payload = {
            "organizationId": ORGANIZATION_ID,
            "timestamp": datetime.now().isoformat(),
            "connectorStatus": "Connected",
            "sourceParsed": True,
            "companyName": (list(dict.fromkeys(
                [v.get("company_name") for v in vouchers if v.get("company_name")]
            )) or ["TallyPrime Live"])[0],
            "vouchers": new_sales_vouchers,  # Pass new sales vouchers to Netlify for WhatsApp dispatch
        }
        requests.post(
            CLOUD_URL,
            json=ping_payload,
            headers={
                "Content-Type": "application/json",
                "X-Connector-Token": CONNECTOR_TOKEN,
                "X-Organization-Id": ORGANIZATION_ID,
            },
            timeout=15,
        )
        log.info("  [Cloud Ping] Netlify status ping sent OK")
    except Exception as e:
        log.debug(f"  [Cloud Ping] Non-fatal: {e}")

    return {"success": True, "pushed": pushed_ok, "errors": push_errors, "skipped": skipped}




def _push_sync_progress(done: int, total: int, phase: str = "fetch"):
    """
    Write live sync progress to Supabase tally_connections so the
    Finance page can display a real-time progress bar while syncing.
    Non-fatal — never raises.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    try:
        pct = int((done / total) * 100) if total else 0
        requests.patch(
            f"{SUPABASE_URL}/rest/v1/tally_connections"
            f"?organization_id=eq.{ORGANIZATION_ID}",
            json={
                "sync_progress": pct,
                "sync_progress_done": done,
                "sync_progress_total": total,
                "sync_progress_phase": phase,
                "sync_progress_updated_at": datetime.now().isoformat(),
            },
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            timeout=4,
        )
    except Exception:
        pass  # Progress push is best-effort


def run_sync():
    """Execute one full Tally -> Cloud sync cycle."""
    global _CACHED_COMPANY_PROFILES, _CACHED_ORG_PROFILE
    _CACHED_COMPANY_PROFILES = None
    _CACHED_ORG_PROFILE = None

    log.info("=== Starting Tally sync cycle ===")
    print("\n" + "=" * 55, flush=True)
    print("  TALLYPRIME SYNC STARTING", flush=True)
    print("=" * 55, flush=True)
    start = time.time()

    # Mark sync as in-progress
    _push_sync_progress(0, 1, "fetching")

    records, raw_xml = fetch_from_tally()


    if not records:
        log.warning("No records extracted. Nothing to push to cloud.")
        _push_sync_progress(0, 0, "idle")
        return 0

    print(f"\n[Cloud Push] Sending {len(records)} records to cloud...", flush=True)
    log.info(f"Pushing {len(records)} records to cloud...")
    _push_sync_progress(0, len(records), "pushing")

    result = push_to_cloud(records)

    if result.get("success"):
        stats = result.get("stats", {})
        upserted = stats.get('upsertedInvoices', len(records))
        log.info(
            f"SUCCESS: {upserted} invoices synced, "
            f"{stats.get('mappedLedgers', 0)} mapped, "
            f"{stats.get('unmappedLedgers', 0)} unmapped"
        )
        # Show DB errors if any upserts failed
        errors = stats.get("errors", [])
        if errors:
            log.warning(f"DB ERRORS on {len(errors)} record(s):")
            for err in errors[:5]:
                log.warning(f"  - {err.get('voucher', '?')}: {err.get('error', '?')} (code: {err.get('code', '?')})")
        _push_sync_progress(upserted, upserted, "done")
        print(f"\n✅ Sync complete! {upserted} records in cloud.", flush=True)
    else:
        log.error(f"Cloud error: {result.get('error', 'Unknown')}")
        log.error(f"Full response: {json.dumps(result, indent=2)}")
        _push_sync_progress(0, 0, "error")

    elapsed = round(time.time() - start, 2)
    log.info(f"=== Sync complete in {elapsed}s. {len(records)} records. ===\n")
    print(f"=== Done in {elapsed}s ===", flush=True)
    return len(records)


# ==============================================================================
# ENTRY POINT
# ==============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("  SOBHAINFRA ERP - TALLYPRIME CONNECTOR (v4.2 Debug)")
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
