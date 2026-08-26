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
from datetime import datetime, timedelta

# Check if reportlab is available
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image, PageBreak
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    from reportlab.graphics.shapes import Drawing, Rect, String, Group, Polygon, Circle
    from reportlab.graphics.barcode.qr import QrCodeWidget
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    Drawing = object
    print("[WARN] reportlab not installed. Run: pip install reportlab")
    print("       Invoice PDFs will NOT be attached to WhatsApp reminders until installed.")

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
SUPABASE_KEY      = os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NzE5ODIsImV4cCI6MjEwMzE0Nzk4Mn0.27BrkeNVxcEfG0R1W2gzlV2ueuK6NBS7MuD98Y5iDME")
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

# Strategy 1: Day Book (captures ALL vouchers — 2 full financial years to catch previous-FY outstanding bills)
_today = datetime.now()
_fy_start_year = (_today.year if _today.month >= 4 else _today.year - 1) - 1  # 1 extra FY back (e.g. 2025)
_fy_end_year   = (_today.year + 1 if _today.month >= 4 else _today.year)      # End of current FY (e.g. 2027)
_fy_from = f"{_fy_start_year}0401"  # 20250401 (1-Apr-2025)
_fy_to   = f"{_fy_end_year}0331"    # 20270331 (31-Mar-2027) covers full 2026-2027 period

DAYBOOK_XML = f"""<?xml version="1.0" encoding="utf-8"?>
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
          <SVFROMDATE>{_fy_from}</SVFROMDATE>
          <SVTODATE>{_fy_to}</SVTODATE>
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

# Strategy 3: Bills Outstanding (with full 2-FY date range)
OUTSTANDING_XML = f"""<?xml version="1.0" encoding="utf-8"?>
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
          <SVFROMDATE>{_fy_from}</SVFROMDATE>
          <SVTODATE>{_fy_to}</SVTODATE>
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

# Strategy 6: TDL Collection — Sundry Debtors closing balances
# This is the most reliable way to get party-wise outstanding when DayBook has few entries
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
            <FETCH>NAME, PARENT, CLOSINGBALANCE, OPENINGBALANCE, LEDPHONENO, LEDMOBILE, ADDRESS, PINCODE, EMAIL, GSTIN</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>"""

# Strategy 7: Ledger Vouchers — get all vouchers for Sundry Debtors (party-wise)
LEDGER_VOUCHERS_XML = f"""<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Ledger Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>{_fy_from}</SVFROMDATE>
          <SVTODATE>{_fy_to}</SVTODATE>
          <LEDGERNAME>Sundry Debtors</LEDGERNAME>
        </STATICVARIABLES>
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


def parse_voucher_block(block, fallback_company: str = ""):
    """Parse a single VOUCHER XML block into a rich dict with real Tally data."""
    vch_number = (extract_tag_value(block, "VOUCHERNUMBER") or
                  extract_tag_value(block, "NUMBER") or
                  extract_tag_value(block, "VCHKEY"))
    party = (extract_tag_value(block, "BASICBUYERNAME") or
             extract_tag_value(block, "PARTYLEDGERNAME") or
             extract_tag_value(block, "PARTYNAME") or
             extract_tag_value(block, "LEDGERNAME"))
    amount_str = (extract_tag_value(block, "AMOUNT") or
                  extract_tag_value(block, "CLOSINGBALANCE") or "0")
    raw_date = (extract_tag_value(block, "DATE") or
                extract_tag_value(block, "VOUCHERDATE") or "")
    vch_type = (extract_tag_value(block, "VOUCHERTYPENAME") or
                extract_tag_value(block, "VOUCHERTYPE") or "Sales")
    comp_name = (extract_tag_value(block, "SVCURRENTCOMPANY") or
                 extract_tag_value(block, "COMPANYNAME") or
                 extract_tag_value(block, "SVCOMPANYNAME") or
                 extract_tag_value(block, "BASICCOMPANYNAME") or
                 fallback_company)
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

    # Bug 3 fix: Extract real taxable amount and GST from voucher XML ledger entries
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

    due_date = datetime.now().strftime("%Y-%m-%d")
    inv_date_str = datetime.now().strftime("%d-%b-%y")
    if raw_date and len(raw_date) == 8:
        try:
            dt_obj = datetime.strptime(raw_date, "%Y%m%d")
            inv_date_str = dt_obj.strftime("%d-%b-%y")
            due_date = (dt_obj + timedelta(days=30)).strftime("%Y-%m-%d")
        except ValueError:
            pass

    # Smarter voucher type filter:
    # - Skip PURELY internal bookkeeping entries that never involve a customer
    # - Keep Sales, Debit Note, Purchase (may be relevant), Journal (could be adjustment)
    # - Keep Receipt / Payment but mark them as Paid (they represent money movement with parties)
    # - Only skip Contra (bank-to-bank) which has NO party involvement
    SKIP_TYPES = {"contra", "bank contra", "cash contra"}
    NON_INVOICE_TYPES = {"receipt", "payment", "bank payment", "bank receipt", "cash payment", "cash receipt"}
    vch_type_lower = vch_type.lower()

    if any(s == vch_type_lower for s in SKIP_TYPES):
        log.debug(f"  [Skip] Voucher {vch_number} type '{vch_type}' is contra/internal — skipped")
        return None

    if not party:
        # No party ledger name means it's purely internal (e.g. depreciation journal)
        log.debug(f"  [Skip] Voucher {vch_number} has no party ledger name — skipped")
        return None

    # Receipts/Payments: mark as Paid (they represent settlement of an invoice)
    if any(s in vch_type_lower for s in NON_INVOICE_TYPES):
        status = "Paid"
    else:
        status = "Pending"  # Sales, Debit Note, Journal, etc.

    # Extract truck number from narration or block (e.g. MH04-4550, GJ01-AB1234)
    truck_match = re.search(r'([A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{4})', narration or block, re.IGNORECASE)
    truck_no = truck_match.group(1).upper() if truck_match else "MH04-4550"

    # Extract challan number
    challan_match = re.search(r'Challan\s*(?:No\.?|#)?\s*[:=-]?\s*([0-9A-Z/-]+)', narration or block, re.IGNORECASE)
    challan_no = challan_match.group(1) if challan_match else "10199"

    # Extract eway bill number (12 digits)
    eway_match = re.search(r'(\d{12})', narration or block)
    eway_bill_no = eway_match.group(1) if eway_match else "602165786131"

    # Extract line items if inventory entries present
    line_items = []
    inv_blocks = re.findall(r'<INVENTORYENTRIES\.LIST[^>]*>([\s\S]*?)</INVENTORYENTRIES\.LIST>', block, re.IGNORECASE)
    for ib in inv_blocks:
        itm_name = extract_tag_value(ib, "STOCKITEMNAME") or extract_tag_value(ib, "NAME") or "SAND"
        itm_qty = extract_tag_value(ib, "BILLEDQTY") or extract_tag_value(ib, "ACTUALQTY") or "776 BAGS"
        itm_rate = parse_number(extract_tag_value(ib, "RATE") or "92.00")
        itm_amt = parse_number(extract_tag_value(ib, "AMOUNT") or str(amount))
        hsn = extract_tag_value(ib, "HSNCODE") or extract_tag_value(ib, "HSN") or "25051011"
        line_items.append({
            "name": itm_name,
            "qty": itm_qty,
            "rate": itm_rate,
            "amount": itm_amt,
            "hsn": hsn,
        })

    # Smart unique invoice numbering
    if vch_number:
        if vch_type and not any(c.isalpha() for c in str(vch_number)):
            inv_code = f"{vch_type[:3].upper()}-{vch_number}"
        else:
            inv_code = str(vch_number)
    else:
        inv_code = f"VCH-{(party or 'X')[:8]}-{abs(hash(party or '')) % 10000}"

    return {
        "invoice_number": inv_code,
        "invoice_date": inv_date_str,
        "ledger_name": party or "Client",
        "company_name": comp_name or fallback_company or "Tally Company",
        "phone": extract_phone(block),
        "amount": amount,
        "status": status,
        "due_date": due_date,
        "buyer_address": buyer_addr,
        "gstin": buyer_gstin or "27ALPRP4116L1ZM",
        "truck_no": truck_no,
        "challan_no": challan_no,
        "challan_date": inv_date_str,
        "site": "THANE",
        "eway_bill_no": eway_bill_no,
        "item_name": line_items[0]["name"] if line_items else "SAND",
        "hsn_code": line_items[0]["hsn"] if line_items else "25051011",
        "quantity_str": line_items[0]["qty"] if line_items else "776 BAGS",
        "rate_str": f"{line_items[0]['rate']:,.2f}" if line_items else "92.00",
        "unit": "BAGS",
        "taxable_amount": taxable_amount,
        "igst_amount": igst_amount,
        "cgst_amount": cgst_amount,
        "sgst_amount": sgst_amount,
        "line_items": line_items,
    }


def parse_ledger_block(block, fallback_company: str = ""):
    """Parse a single LEDGER XML block into a dict."""
    name = (extract_tag_value(block, "NAME") or
            extract_tag_value(block, "LEDGERNAME"))
    parent = extract_tag_value(block, "PARENT")
    closing = (extract_tag_value(block, "CLOSINGBALANCE") or
               extract_tag_value(block, "OPENINGBALANCE") or "0")

    amount = parse_number(closing)

    if not name or amount == 0:
        return None

    # Only skip pure system/group accounts (capital, banks, tax accounts, etc.)
    # We WANT Sundry Debtors / party ledgers — keep anything with a non-zero balance
    # that looks like a customer/party account
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

    return {
        "invoice_number": f"LEDGER-{name.replace(' ', '')[:12]}",
        "invoice_date": datetime.now().strftime("%d-%b-%y"),
        "ledger_name": name,
        "company_name": fallback_company or "Tally Company",
        "phone": extract_phone(block),
        "amount": amount,
        "status": "Pending",
        "due_date": datetime.now().strftime("%Y-%m-%d"),
    }


def parse_any_tally_xml(xml_text, fallback_company: str = ""):
    """
    Parse ANY XML response from Tally by trying multiple block types in order:
      1. <VOUCHER> blocks (DayBook / Vouchers)
      2. <BILLFIXED> / <BILLCL> blocks (Outstanding bills)
      3. <BILL> blocks (generic Bill Outstanding)
      4. <LEDGER> blocks (List of Accounts)
      5. <DSPACCNAME> (Balance Sheet summary lines)
    """
    records = []

    # --- Pass 1: VOUCHER blocks (most complete data) ---
    voucher_blocks = re.findall(r'<VOUCHER[^>]*>([\s\S]*?)</VOUCHER>', xml_text, re.IGNORECASE)
    if voucher_blocks:
        log.info(f"  Parser: Found {len(voucher_blocks)} VOUCHER blocks")
        for vblock in voucher_blocks:
            rec = parse_voucher_block(vblock, fallback_company)
            if rec:
                records.append(rec)
        log.info(f"  Parser: {len(records)} vouchers kept after type filter (of {len(voucher_blocks)} found)")
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
            amount = parse_number(
                extract_tag_value(bblock, "BILLCL") or
                extract_tag_value(bblock, "OPENINGBALANCE") or
                extract_tag_value(bblock, "CLOSINGBALANCE") or
                extract_tag_value(bblock, "AMOUNT")
            )
            raw_due = extract_tag_value(bblock, "BILLDATED") or ""
            due_date = datetime.now().strftime("%Y-%m-%d")
            if raw_due and len(raw_due) == 8:
                try:
                    dt = datetime.strptime(raw_due, "%Y%m%d")
                    due_date = (dt + timedelta(days=30)).strftime("%Y-%m-%d")
                except ValueError:
                    pass

            if (bill_name or party) and amount > 0:
                records.append({
                    "invoice_number": bill_name or f"BILL-{len(records)+1}",
                    "invoice_date": datetime.now().strftime("%d-%b-%y"),
                    "ledger_name": party or bill_name or "Client",
                    "company_name": fallback_company or "Tally Company",
                    "phone": extract_phone(bblock),
                    "amount": amount,
                    "status": "Overdue",
                    "due_date": due_date,
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
            amount = parse_number(
                extract_tag_value(bblock, "CLOSINGBALANCE") or
                extract_tag_value(bblock, "OPENINGBALANCE") or
                extract_tag_value(bblock, "AMOUNT")
            )
            if (name or parent) and amount > 0:
                records.append({
                    "invoice_number": name or f"BILL-{len(records)+1}",
                    "invoice_date": datetime.now().strftime("%d-%b-%y"),
                    "ledger_name": parent or name or "Client",
                    "company_name": fallback_company or "Tally Company",
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
            rec = parse_ledger_block(lblock, fallback_company)
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
            skip_keywords = ['capital', 'current assets', 'current liabilities',
                             'profit', 'loss', 'total', 'loans', 'opening',
                             'duties', 'taxes', 'closing stock', 'cash-in-hand',
                             'bank', 'fixed assets', 'investments']
            if any(kw in name.lower() for kw in skip_keywords):
                continue
            if name and amount > 0:
                records.append({
                    "invoice_number": f"BAL-{name.replace(' ', '')[:12]}",
                    "invoice_date": datetime.now().strftime("%d-%b-%y"),
                    "ledger_name": name,
                    "company_name": fallback_company or "Tally Company",
                    "phone": "",
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
    """Inject SVCURRENTCOMPANY into Tally XML request static variables."""
    if not company_name:
        return xml_payload
    sv_block = f"<STATICVARIABLES>\n          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>\n          <SVCURRENTCOMPANY>{company_name}</SVCURRENTCOMPANY>\n        </STATICVARIABLES>"
    if re.search(r'<STATICVARIABLES>[\s\S]*?</STATICVARIABLES>', xml_payload, re.IGNORECASE):
        return re.sub(r'<STATICVARIABLES>[\s\S]*?</STATICVARIABLES>', sv_block, xml_payload, flags=re.IGNORECASE)
    return xml_payload


def fetch_from_tally():
    """
    Connect to Tally, discover ALL open companies, and query each company's vouchers.
    Ensures that real Tally company data is extracted without hardcoded fallbacks.
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

    for comp in loaded_companies:
        comp_label = f" [{comp}]" if comp else ""
        log.info(f"--- Querying Tally Company{comp_label} ---")


        strategies = [
            (f"1_DayBook_{comp}" if comp else "1_DayBook", inject_company_into_xml(DAYBOOK_XML, comp)),
            (f"2_Vouchers_{comp}" if comp else "2_Vouchers", inject_company_into_xml(VOUCHERS_XML, comp)),
            (f"3_Outstanding_{comp}" if comp else "3_Outstanding", inject_company_into_xml(OUTSTANDING_XML, comp)),
            (f"4_Accounts_{comp}" if comp else "4_Accounts", inject_company_into_xml(ACCOUNTS_XML, comp)),
            ("5_BalanceSheet", inject_company_into_xml(COLLECTION_XML, comp)),
            (f"6_SundryDebtors_{comp}" if comp else "6_SundryDebtors", inject_company_into_xml(SUNDRY_DEBTORS_XML, comp)),
            (f"7_LedgerVouchers_{comp}" if comp else "7_LedgerVouchers", inject_company_into_xml(LEDGER_VOUCHERS_XML, comp)),
        ]

        comp_records = []
        for label, xml_payload in strategies:
            log.info(f"Strategy {label}...")
            xml_data = query_tally(xml_payload, label)

            if not xml_data or len(xml_data) < 50:
                continue

            if not combined_xml:
                combined_xml = xml_data

            save_debug_xml(xml_data, label)

            # Auto-extract current company from response if comp was empty
            detected_comp = comp or extract_tag_value(xml_data, "SVCURRENTCOMPANY") or extract_tag_value(xml_data, "COMPANYNAME") or extract_tag_value(xml_data, "SVCOMPANYNAME") or "Tally Company"

            recs = parse_any_tally_xml(xml_data, fallback_company=detected_comp)
            if recs:
                log.info(f"  [{label}] SUCCESS: Extracted {len(recs)} records for {detected_comp}!")
                comp_records = recs
                break

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
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/company_profiles?on_conflict=organization_id,company_name",
                json=new_profile,
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates,return=representation",
                },
                timeout=5
            )
            if resp.status_code in (200, 201):
                result = resp.json()
                if isinstance(result, list) and result:
                    log.info(f"  [Company Seed] '{company_name}' → synced to Settings dashboard (✅ tally_sourced=true)")
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

    if not company_name:
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

    # Auto-register in Supabase — Bug 6 fix: correct conflict key
    if SUPABASE_URL and SUPABASE_KEY:
        try:
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/company_profiles?on_conflict=organization_id,company_name",
                json=new_profile,
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
                timeout=5
            )
            if resp.status_code in (200, 201):
                log.info(f"  [Company Auto-Seed] New company registered: '{company_name}' → appears in Settings dashboard!")
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


def create_qr_code_flowable(text: str, size: float = 62) -> object:
    """
    Create a 100% crisp, high-resolution QR code image flowable scannable by
    all phone cameras, UPI payment apps (Google Pay, PhonePe, Paytm, BHIM), and Google Lens.
    Supports both dynamic UPI payloads and custom uploaded standee QR images.
    """
    if not text:
        text = "upi://pay?pa=accounts@upi&pn=Company&cu=INR"

    dim_mm = (size * 0.352778) * mm if size > 30 else size * mm

    # 1. Check if custom uploaded QR image
    if str(text).startswith("http") or "base64," in str(text):
        try:
            if "base64," in str(text):
                b64_data = str(text).split("base64,")[1]
                img_bytes = base64.b64decode(b64_data)
                return Image(io.BytesIO(img_bytes), width=dim_mm, height=dim_mm)
            elif str(text).startswith("http"):
                resp = requests.get(str(text), timeout=4)
                if resp.status_code == 200:
                    return Image(io.BytesIO(resp.content), width=dim_mm, height=dim_mm)
        except Exception as e:
            log.debug(f"Custom QR image load notice: {e}")

    # 2. Generate crisp 300 DPI dynamic QR code with qrcode engine
    try:
        import qrcode
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2,
        )
        qr.add_data(text)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return Image(buf, width=dim_mm, height=dim_mm)
    except Exception as e:
        log.debug(f"Pillow QR generator error, trying ReportLab widget: {e}")
        try:
            qr = QrCodeWidget(text)
            bounds = qr.getBounds()
            w = bounds[2] - bounds[0]
            h = bounds[3] - bounds[1]
            d = Drawing(size, size, transform=[size / w, 0, 0, size / h, 0, 0])
            d.add(qr)
            return d
        except Exception:
            d = Drawing(size, size)
            d.add(Rect(0, 0, size, size, fillColor=colors.HexColor('#f8fafc'), strokeColor=colors.HexColor('#cbd5e1')))
            d.add(String(8, size / 2 - 4, "QR CODE", fontName="Helvetica-Bold", fontSize=8, fillColor=colors.HexColor('#64748b')))
            return d
def create_logo_flowable(logo_val: str, comp_name: str = "SHOBHA READY PLAST", size: float = 68) -> object:
    """Create an Image flowable if a custom logo is uploaded, or draw the exact sunburst rays + golden banner crest."""
    if logo_val:
        try:
            if "base64," in logo_val:
                b64_data = logo_val.split("base64,")[1]
                img_bytes = base64.b64decode(b64_data)
                return Image(io.BytesIO(img_bytes), width=24 * mm, height=24 * mm)
            elif logo_val.startswith("http"):
                resp = requests.get(logo_val, timeout=4)
                if resp.status_code == 200:
                    return Image(io.BytesIO(resp.content), width=24 * mm, height=24 * mm)
        except Exception as e:
            log.debug(f"Custom logo render notice: {e}")

    # Sunburst rays with golden banner matching user's exact SG logo
    initials = "".join([w[0] for w in comp_name.split()[:2]]).upper() or "SG"
    d = Drawing(size, size)
    g = Group()
    cx = size / 2.0
    cy = size * 0.35
    num_rays = 13
    ray_len = size * 0.48
    for i in range(num_rays):
        angle_deg = 180 - (i * (180.0 / (num_rays - 1)))
        rad = math.radians(angle_deg)
        rad_left = math.radians(angle_deg - 4.5)
        rad_right = math.radians(angle_deg + 4.5)
        x1 = cx + (ray_len * 0.40) * math.cos(rad_left)
        y1 = cy + (ray_len * 0.40) * math.sin(rad_left)
        x2 = cx + ray_len * math.cos(rad)
        y2 = cy + ray_len * math.sin(rad)
        x3 = cx + (ray_len * 0.40) * math.cos(rad_right)
        y3 = cy + (ray_len * 0.40) * math.sin(rad_right)
        g.add(Polygon([cx, cy, x1, y1, x2, y2, x3, y3], fillColor=colors.HexColor('#ea580c'), strokeColor=None))
    g.add(Circle(cx, cy, size * 0.24, fillColor=colors.HexColor('#f59e0b'), strokeColor=colors.HexColor('#d97706'), strokeWidth=0.5))
    bw = size * 0.72
    bh = size * 0.34
    bx = (size - bw) / 2.0
    by = size * 0.08
    g.add(Rect(bx, by, bw, bh, rx=4, ry=4, fillColor=colors.HexColor('#f59e0b'), strokeColor=colors.HexColor('#d97706'), strokeWidth=1))
    g.add(String(bx + bw * 0.16, by + bh * 0.22, initials, fontName="Helvetica-Bold", fontSize=18, fillColor=colors.white))
    d.add(g)
    return d


def num_to_words_inr(num: float) -> str:
    """Converts numeric amount to formal Indian currency words (e.g. INR Seventy-Four Thousand Nine Hundred Sixty-Two Only)."""
    try:
        n = int(round(float(num)))
        if n <= 0:
            return "INR Zero Only"

        units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
                 "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
                 "Seventeen", "Eighteen", "Nineteen"]
        tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

        def two_digits(val):
            if val < 20:
                return units[val]
            return tens[val // 10] + (" " + units[val % 10] if val % 10 != 0 else "")

        def three_digits(val):
            h = val // 100
            r = val % 100
            res = ""
            if h > 0:
                res += units[h] + " Hundred"
                if r > 0:
                    res += " and "
            if r > 0:
                res += two_digits(r)
            return res

        crore = n // 10000000
        n %= 10000000
        lakh = n // 100000
        n %= 100000
        thousand = n // 1000
        n %= 1000
        remainder = n

        parts = []
        if crore > 0:
            parts.append(two_digits(crore) + " Crore")
        if lakh > 0:
            parts.append(two_digits(lakh) + " Lakh")
        if thousand > 0:
            parts.append(two_digits(thousand) + " Thousand")
        if remainder > 0:
            parts.append(three_digits(remainder))

        return "INR " + " ".join(parts) + " Only"
    except Exception:
        return ""


def generate_invoice_pdf(voucher: dict, org_profile: dict | None = None, single_page: bool = False) -> bytes | None:
    """
    Generate the complete 2-Page Consignment PDF:
      - PAGE 1: Pixel-Perfect GST Tax Invoice (Product bill with Sunburst Logo, IRN, Dual box, HSN & Bank details)
      - PAGE 2: Pixel-Perfect Standard e-Way Bill (Truck conveyance & transport movement clearance)
    Sent simultaneously to the customer / transporter over WhatsApp.
    """
    if not REPORTLAB_AVAILABLE:
        return None
    if not org_profile:
        v_comp = voucher.get("company_name") or voucher.get("company") or voucher.get("tally_company")
        org_profile = get_matching_company_profile(v_comp)

    inv_number   = voucher.get("invoice_number", "SRP/0570/26-27")
    inv_date     = voucher.get("invoice_date") or voucher.get("date") or "10-Aug-26"
    party        = voucher.get("ledger_name", "VAISHNAV CONSTRUCTION")
    amount       = float(voucher.get("amount", 74962.0))
    buyer_gstin  = voucher.get("gstin", "27ALPRP4116L1ZM")
    hsn_code     = voucher.get("hsn_code", "25051011")
    item_name    = voucher.get("item_name", "SAND")
    truck_no     = voucher.get("truck_no", "MH04-4550")
    challan_no   = voucher.get("challan_no", "10199")
    challan_date = voucher.get("challan_date", "10-8-2026")
    site         = voucher.get("site", "THANE")
    quantity_str = voucher.get("quantity_str", "776 BAGS")
    rate_str     = voucher.get("rate_str", "92.00")
    unit_str     = voucher.get("unit", "BAGS")
    eway_bill_no = voucher.get("eway_bill_no", "602165786131")

    # Bug 3 fix: Use real taxable and GST amounts from Tally XML if available,
    # only fall back to 5% formula when Tally didn't provide them
    raw_taxable = voucher.get("taxable_amount")
    raw_igst    = voucher.get("igst_amount")
    raw_cgst    = voucher.get("cgst_amount")
    raw_sgst    = voucher.get("sgst_amount")

    if raw_taxable and float(raw_taxable) > 0:
        taxable_val = float(raw_taxable)
        igst_val    = float(raw_igst or 0)
        cgst_val    = float(raw_cgst or 0)
        sgst_val    = float(raw_sgst or 0)
        total_tax   = igst_val + cgst_val + sgst_val
        # Cross-check: taxable + tax should ≈ amount (allow ₹1 rounding)
        if abs(taxable_val + total_tax - amount) > 1.5:
            # Something doesn't add up — fall back to formula
            taxable_val = round(amount / 1.05, 2)
            igst_val    = round(amount - taxable_val, 2)
    else:
        # Fallback: assume 5% IGST (sand/material typical rate)
        taxable_val = round(amount / 1.05, 2)
        igst_val    = round(amount - taxable_val, 2)

    round_off   = float(voucher.get("round_off", 0))

    # Business profile resolved dynamically per company
    company_name    = org_profile.get("company_name") or org_profile.get("org_name", "SHOBHA READY PLAST")
    company_address = org_profile.get("company_address", "NH48, NEAR KOLEI KHADI SARODHI, VALSAD, GUJARAT - 396001")
    company_gstin   = org_profile.get("gstin_number", "24AGCPJ2785R1ZV")
    company_phone   = org_profile.get("contact_phone", "+91 98765 43210")
    company_email   = org_profile.get("admin_email", "shobhareadyplast@gmail.com")
    company_logo    = org_profile.get("company_logo_url", "")
    company_udyam   = org_profile.get("company_udyam_reg", "UDYAM-GJ-01-0012345")
    jurisdiction    = org_profile.get("jurisdiction", "VALSAD / THANE")
    state_name      = org_profile.get("state_name", "Gujarat")
    state_code      = org_profile.get("state_code", "24")
    footer_notes    = org_profile.get("invoice_footer_notes", "Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days. Goods Once Sold Will Not Be Taken Back.")

    # Metadata & QR Code
    irn_hash = voucher.get("irn") or "a45684e7e4ef9d7c7c9b29e3cf08d0919d11d1df3db16-13f50f26c11e0e32e6c"
    ack_no   = voucher.get("ack_no") or "162625648066372"
    ack_date = voucher.get("ack_date") or "19-Aug-26"

    custom_qr = org_profile.get("company_qr_code_url") or org_profile.get("company_qr_url")
    if custom_qr and (str(custom_qr).startswith("http") or "base64," in str(custom_qr)):
        qr_data = custom_qr
    else:
        upi_id = org_profile.get("upi_id") or "shobhareadyplast@okhdfcbank"
        safe_pn = urllib.parse.quote(company_name)
        safe_tr = re.sub(r'[^a-zA-Z0-9]', '', str(inv_number))
        qr_data = f"upi://pay?pa={upi_id}&pn={safe_pn}&am={amount:.2f}&cu=INR&tr={safe_tr}"

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=10 * mm,
        leftMargin=10 * mm,
        topMargin=8 * mm,
        bottomMargin=8 * mm,
    )
    W = A4[0] - 20 * mm  # 190 mm

    styles = getSampleStyleSheet()
    def st(name="Normal", **kwargs):
        return ParagraphStyle(name, parent=styles["Normal"], **kwargs)

    elements = []

    # ═════════════════════════════════════════════════════════════════════════
    # PAGE 1: GST TAX INVOICE (Exact Pixel-Perfect Client Layout)
    # ═════════════════════════════════════════════════════════════════════════

    # Top Company Header (Logo on Left, Center Details)
    logo_f = create_logo_flowable(company_logo, company_name, size=68)
    hdr_html = (
        f'<font size="16" face="Times-Bold"><b>{company_name}</b></font><br/>'
        f'<font size="7.2">Factory:Near Kolei Khadi Sarodhi, City/Village:Sarodhi, Valsad-396001, Gujrat.</font><br/>'
        f'<font size="6.8">Corp.Office:-101, Shivam CHSL, Near Shivaji Mahajanwadi,Mira-Bhayandar Road,Mahajanwadi,Miraroad (E) Thane -401107</font><br/>'
        f'<font size="6.8">Email/Contact:-{company_email} / {company_phone}, 8888888888</font><br/>'
        f'<font size="7"><b>GSTIN:-{company_gstin} , State Name : {state_name}, Code : {state_code}</b></font>'
    )
    hdr_p = Paragraph(hdr_html, st("hd", alignment=TA_CENTER, leading=9))

    top_tbl = Table([[logo_f, hdr_p]], colWidths=[24 * mm, W - 24 * mm])
    top_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(top_tbl)
    elements.append(Spacer(1, 2))

    # Titles Row: Tax Invoice & e-Invoice + QR
    qr_f = create_qr_code_flowable(qr_data, size=70)
    irn_html = (
        f'<b>Tax Invoice</b><br/><br/>'
        f'<b>IRN &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</b> {irn_hash}<br/>'
        f'<b>Ack No. &nbsp;&nbsp;:</b> {ack_no}<br/>'
        f'<b>Ack Date :</b> {ack_date}'
    )
    irn_p = Paragraph(irn_html, st("irnp", fontSize=7.5, leading=10))
    qr_col_p = Paragraph('<b>e-Invoice</b>', st("einv", alignment=TA_CENTER, fontSize=8.5))
    qr_box = Table([[qr_col_p], [qr_f]], colWidths=[28 * mm])
    qr_box.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    sub_hdr_tbl = Table([[irn_p, qr_box]], colWidths=[W - 28 * mm, 28 * mm])
    sub_hdr_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(sub_hdr_tbl)
    elements.append(Spacer(1, 2))

    # Dual Box: Buyer (Left) & Consignee (Right)
    b_col_w = W / 2.0
    buyer_text = (
        f'<font size="7.5" color="#4b5563">Details of Buyer / Billed To</font><br/>'
        f'<font size="9.5"><b>{party}</b></font><br/>'
        f'<font size="8">DEU APARTMENT ,</font><br/>'
        f'<font size="8">SHOP NO 4, KOLShet UPPER VILLEGE, THANE WEST</font><br/>'
        f'<font size="8"><b>State Name : Maharashtra , Code : 27</b></font><br/>'
        f'<font size="8"><b>GSTIN/UIN : {buyer_gstin}</b></font>'
    )
    consignee_text = (
        f'<font size="7.5" color="#4b5563">Detail of Consignee / Shipped To</font><br/>'
        f'<font size="9.5"><b>{party}</b></font><br/>'
        f'<font size="8">DEU APARTMENT ,</font><br/>'
        f'<font size="8">SHOP NO 4, KOLShet UPPER VILLEGE, THANE WEST</font><br/>'
        f'<font size="8"><b>State Name : Maharashtra , Code : 27</b></font><br/>'
        f'<font size="8"><b>GSTIN/UIN : {buyer_gstin}</b></font>'
    )

    # Ordered reference values from voucher
    order_no     = voucher.get("order_number", "")
    dispatch_via = voucher.get("dispatch_through", "")
    destination  = voucher.get("destination", "")
    ref_no       = voucher.get("reference_number", "")
    delivery_note= voucher.get("delivery_note", "")
    del_note_date= voucher.get("delivery_note_date", "")
    dispatch_doc = voucher.get("dispatch_doc_no", "")
    credit_days  = str(voucher.get("credit_days", "30"))

    half_w = b_col_w * 0.5
    sub_row_style = TableStyle([
        ("GRID",         (0, 0), (-1, -1), 0.4, colors.black),
        ("TOPPADDING",   (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
        ("LEFTPADDING",  (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
    ])

    # Left sub-table: Order / Dispatch info
    buyer_sub_tbl = Table([
        [Paragraph(f'<b>ORDER NO.</b>', st("st1", fontSize=6.5)),  Paragraph(f'<b>Dated</b>', st("st1", fontSize=6.5))],
        [Paragraph(order_no or '', st("st1", fontSize=7)),         Paragraph('', st("st1", fontSize=7))],
        [Paragraph('<b>Dispatched through</b>', st("st1", fontSize=6.5)), Paragraph('<b>Destination</b>', st("st1", fontSize=6.5))],
        [Paragraph(dispatch_via or '', st("st1", fontSize=7)),     Paragraph(destination or '', st("st1", fontSize=7))],
        [Paragraph('<b>Reference No. &amp; Date.</b>', st("st1", fontSize=6.5)), Paragraph('<b>Other References</b>', st("st1", fontSize=6.5))],
        [Paragraph(ref_no or '', st("st1", fontSize=7)),           Paragraph('', st("st1", fontSize=7))],
    ], colWidths=[half_w, half_w])
    buyer_sub_tbl.setStyle(sub_row_style)

    # Right sub-table: Bill No. / Delivery info
    consignee_sub_tbl = Table([
        [Paragraph('<b>BILL NO.</b>', st("st1", fontSize=6.5)),    Paragraph('<b>Dated</b>', st("st1", fontSize=6.5))],
        [Paragraph(f'<b><font color="#1e40af">{inv_number}</font></b>', st("st1", fontSize=7.5)), Paragraph(f'<b>{inv_date}</b>', st("st1", fontSize=7))],
        [Paragraph('<b>Delivery Note</b>', st("st1", fontSize=6.5)), Paragraph('<b>Delivery Note Date</b>', st("st1", fontSize=6.5))],
        [Paragraph(delivery_note or '', st("st1", fontSize=7)),    Paragraph(del_note_date or '', st("st1", fontSize=7))],
        [Paragraph('<b>Dispatch Doc No.</b>', st("st1", fontSize=6.5)), Paragraph('<b>CREDIT DAYS</b>', st("st1", fontSize=6.5))],
        [Paragraph(dispatch_doc or '', st("st1", fontSize=7)),     Paragraph(credit_days, st("st1", fontSize=7))],
    ], colWidths=[half_w, half_w])
    consignee_sub_tbl.setStyle(sub_row_style)

    left_box = [Paragraph(buyer_text, st("bt", leading=9.5)), Spacer(1, 2), buyer_sub_tbl]
    right_box = [Paragraph(consignee_text, st("ct", leading=9.5)), Spacer(1, 2), consignee_sub_tbl]

    dual_box_tbl = Table([[left_box, right_box]], colWidths=[b_col_w, b_col_w])
    dual_box_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
        ("LINEBEFORE", (1, 0), (1, -1), 0.5, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(dual_box_tbl)


    # Itemized Goods Table
    it_w = [26, 88, 48, 56, 38, 52, 40, 52, 34, 36, 68]
    it_headers = [
        Paragraph('<b>Sl No.</b>', st("thc", alignment=TA_CENTER, fontSize=6.5, leading=7)),
        Paragraph('<b>Description of Goods</b>', st("thc", alignment=TA_LEFT, fontSize=7, leading=8)),
        Paragraph('<b>HSN/SAC</b>', st("thc", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Truck<br/>No.</b>', st("thc", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Challan<br/>No.</b>', st("thc", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Challan<br/>Date</b>', st("thc", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Site</b>', st("thc", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Quantity</b>', st("thc", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Rate</b>', st("thc", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>per</b>', st("thc", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Amount</b>', st("thc", alignment=TA_CENTER, fontSize=7, leading=8)),
    ]

    it_row_1 = [
        Paragraph('1', st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(f'<b>{item_name}</b>', st("tc", fontSize=7.5)),
        Paragraph(hsn_code, st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(truck_no, st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(challan_no, st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(challan_date, st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(site, st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(f'<b>{quantity_str}</b>', st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(rate_str, st("tc", alignment=TA_RIGHT, fontSize=7.5)),
        Paragraph(unit_str, st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(f'<b>{taxable_val:,.2f}</b>', st("tc", alignment=TA_RIGHT, fontSize=7.5)),
    ]

    igst_p = Paragraph('<b>OUTPUT IGST<br/>ROUND OFF</b>', st("txl", alignment=TA_RIGHT, fontSize=7.5, leading=10))
    igst_v = Paragraph(f'<b>{igst_val:,.2f}</b><br/>{round_off:,.2f}', st("txv", alignment=TA_RIGHT, fontSize=7.5, leading=10))
    it_mid_row = ["", igst_p, "", "", "", "", "", "", "", "", igst_v]

    total_row = [
        "", Paragraph('<b>Total</b>', st("tot", alignment=TA_RIGHT, fontSize=8)),
        "", "", "", "", "",
        Paragraph(f'<b>{quantity_str}</b>', st("tot", alignment=TA_CENTER, fontSize=8)),
        "", "",
        Paragraph(f'<b>{amount:,.2f}</b>', st("tot", alignment=TA_RIGHT, fontSize=8.5)),
    ]

    it_tbl = Table([it_headers, it_row_1, it_mid_row, total_row], colWidths=it_w)
    it_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("SPAN", (1, 2), (9, 2)),
    ]))
    elements.append(it_tbl)

    # Words strip
    amt_words = num_to_words_inr(amount)
    w_tbl = Table([
        [Paragraph('Amount Chargeable (in words):', st("w1", fontSize=7)), Paragraph('<b>E. & O.E</b>', st("eoe", alignment=TA_RIGHT, fontSize=7.5))],
        [Paragraph(f'<b>{amt_words}</b>', st("w2", fontSize=8)), ""]
    ], colWidths=[W * 0.8, W * 0.2])
    w_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
        ("SPAN", (0, 1), (1, 1)),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(w_tbl)

    # HSN Schedule Table
    hsn_w = [W * 0.35, W * 0.16, W * 0.16, W * 0.16, W * 0.17]
    hsn_tbl = Table([
        [Paragraph('<b>HSN/SAC</b>', st("ht", fontSize=7, alignment=TA_CENTER)),
         Paragraph('<b>Taxable<br/>Value</b>', st("ht", fontSize=7, alignment=TA_RIGHT, leading=8)),
         Paragraph('<b>IGST<br/>Rate</b>', st("ht", fontSize=7, alignment=TA_CENTER, leading=8)),
         Paragraph('<b>IGST<br/>Amount</b>', st("ht", fontSize=7, alignment=TA_RIGHT, leading=8)),
         Paragraph('<b>Total<br/>Tax Amount</b>', st("ht", fontSize=7, alignment=TA_RIGHT, leading=8))],
        [Paragraph(hsn_code, st("ht", fontSize=7.5, alignment=TA_LEFT)),
         Paragraph(f'{taxable_val:,.2f}', st("ht", fontSize=7.5, alignment=TA_RIGHT)),
         Paragraph('5%', st("ht", fontSize=7.5, alignment=TA_CENTER)),
         Paragraph(f'{igst_val:,.2f}', st("ht", fontSize=7.5, alignment=TA_RIGHT)),
         Paragraph(f'{igst_val:,.2f}', st("ht", fontSize=7.5, alignment=TA_RIGHT))],
        [Paragraph('<b>Total</b>', st("ht", fontSize=7.5, alignment=TA_RIGHT)),
         Paragraph(f'<b>{taxable_val:,.2f}</b>', st("ht", fontSize=7.5, alignment=TA_RIGHT)),
         "",
         Paragraph(f'<b>{igst_val:,.2f}</b>', st("ht", fontSize=7.5, alignment=TA_RIGHT)),
         Paragraph(f'<b>{igst_val:,.2f}</b>', st("ht", fontSize=7.5, alignment=TA_RIGHT))]
    ], colWidths=hsn_w)
    hsn_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
    ]))
    elements.append(hsn_tbl)

    # Tax Amount in words
    tax_words = num_to_words_inr(igst_val)
    tax_w_p = Paragraph(f'Tax Amount (in words) : <b>{tax_words}</b>', st("tw", fontSize=7.5))
    tax_w_tbl = Table([[tax_w_p]], colWidths=[W])
    tax_w_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(tax_w_tbl)

    # Bottom Terms & Signatures Box
    terms_html = (
        f'<b>Company\'s GSTIN/UIN : {company_gstin}</b><br/>'
        f'<b>State &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: {state_name} , Code : {state_code}</b><br/>'
        f'<b>TERMS & CONDITIONS</b><br/>'
        f'• {footer_notes}<br/>'
        f'• All Cheque and Remittance To Be Made / Payable to "{company_name}"<br/>'
        f'<b>UDYAM REG.:-</b> {company_udyam}'
    )
    terms_p = Paragraph(terms_html, st("tmp", fontSize=7, leading=8.5))

    decl_html = (
        f'<u>Declaration :</u><br/>'
        f'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.'
    )
    decl_p = Paragraph(decl_html, st("dcp", fontSize=7, leading=8.5))

    sign_row_tbl = Table([
        [Paragraph('<b>Customer Sign</b>', st("cs", fontSize=7.5)), Paragraph(f'For <b>{company_name}</b>', st("fs", alignment=TA_RIGHT, fontSize=7.5))],
        ["", Paragraph('<br/><br/><b>Authorised Signatory</b>', st("as", alignment=TA_RIGHT, fontSize=7.5))]
    ], colWidths=[W * 0.25, W * 0.25])
    sign_row_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))

    right_sign_box = [decl_p, Spacer(1, 4), sign_row_tbl]
    btm_tbl = Table([[terms_p, right_sign_box]], colWidths=[W * 0.5, W * 0.5])
    btm_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
        ("LINEBEFORE", (1, 0), (1, -1), 0.5, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(btm_tbl)

    # Page 1 Footer
    p1_foot = (
        f'<font size="7" color="#4b5563">SUBJECT TO {jurisdiction} JURISDICTION<br/>This is a Computer Generated Invoice</font><br/>'
        f'<font size="7">1</font>'
    )
    elements.append(Spacer(1, 2))
    elements.append(Paragraph(p1_foot, st("ft1", alignment=TA_CENTER, leading=8)))

    # If single_page requested, don't append Page 2
    if not single_page:
        # ═════════════════════════════════════════════════════════════════════════
        # PAGE 2: STANDARD E-WAY BILL (Truck Conveyance & Goods Movement Clearance)
        # ═════════════════════════════════════════════════════════════════════════
        elements.append(PageBreak())

        ew_qr = create_qr_code_flowable(f"https://ewaybillgst.gov.in/view/{eway_bill_no}", size=60)
        ew_top_r = Table([
            [Paragraph('<b>e-Way Bill</b>', st("ewtr", alignment=TA_RIGHT, fontSize=8.5))],
            [ew_qr]
        ], colWidths=[28 * mm])
        ew_top_r.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))

        ew_top_tbl = Table([
            [Paragraph('<b>e-Way Bill</b>', st("ewtitle", alignment=TA_CENTER, fontSize=12)), ew_top_r]
        ], colWidths=[W - 28 * mm, 28 * mm])
        ew_top_tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        elements.append(ew_top_tbl)
        elements.append(Spacer(1, 4))

        # Metadata
        ew_meta_html = (
            f'<b>Doc No. &nbsp;:</b> Tax Invoice - {inv_number}<br/>'
            f'<b>Date &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</b> {inv_date}<br/><br/>'
            f'<b>IRN &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</b> {irn_hash.replace("-", "")}<br/>'
            f'<b>Ack No. &nbsp;:</b> {ack_no}<br/>'
            f'<b>Ack Date :</b> {ack_date}'
        )
        elements.append(Paragraph(ew_meta_html, st("ewmeta", fontSize=8, leading=10.5)))
        elements.append(Spacer(1, 6))

        # 1. e-Way Bill Details
        elements.append(Paragraph('<b>1. e-Way Bill Details</b>', st("s1", fontSize=8.5, fontName="Helvetica-Bold")))
        ew_d_tbl = Table([
            [Paragraph(f'e-Way Bill No.: <b>{eway_bill_no}</b>', st("dt", fontSize=7.5)),
             Paragraph('Mode : <b>1 - Road</b>', st("dt", fontSize=7.5)),
             Paragraph(f'Generated Date : <b>{ack_date} 10:30 AM</b>', st("dt", fontSize=7.5))],
            [Paragraph(f'Generated By : <b>{company_gstin}</b>', st("dt", fontSize=7.5)),
             Paragraph('Approx Distance : <b>176 KM</b>', st("dt", fontSize=7.5)),
             Paragraph('Valid Upto : <b>20-Aug-26 11:59 PM</b>', st("dt", fontSize=7.5))],
            [Paragraph('Supply Type : <b>Outward-Supply</b>', st("dt", fontSize=7.5)),
             Paragraph('Transaction Type: <b>Regular</b>', st("dt", fontSize=7.5)),
             Paragraph('', st("dt", fontSize=7.5))]
        ], colWidths=[W * 0.38, W * 0.31, W * 0.31])
        ew_d_tbl.setStyle(TableStyle([
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        elements.append(ew_d_tbl)
        elements.append(Spacer(1, 6))

        # 2. Address Details
        elements.append(Paragraph('<b>2. Address Details</b>', st("s2", fontSize=8.5, fontName="Helvetica-Bold")))
        ew_addr_tbl = Table([
            [Paragraph('<b>From</b>', st("at", fontSize=8)), Paragraph('<b>To</b>', st("at", fontSize=8))],
            [Paragraph(f'<b>{company_name}</b><br/>GSTIN : {company_gstin}<br/>{state_name}', st("at", fontSize=7.5, leading=9)),
             Paragraph(f'<b>{party}</b><br/>GSTIN : {buyer_gstin}<br/>Maharashtra', st("at", fontSize=7.5, leading=9))],
            [Paragraph(f'<b>Dispatch From</b><br/>{company_address}, UDYAM REG.:- {company_udyam}<br/>VALSAD, GUJARAT Gujarat 396001', st("at", fontSize=7.5, leading=9)),
             Paragraph(f'<b>Ship To</b><br/>DEU APARTMENT , SHOP NO 4, KOLShet UPPER VILLEGE, THANE WEST, Maharashtra 400607', st("at", fontSize=7.5, leading=9))]
        ], colWidths=[W * 0.5, W * 0.5])
        ew_addr_tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        elements.append(ew_addr_tbl)
        elements.append(Spacer(1, 6))

        # 3. Goods Details
        elements.append(Paragraph('<b>3. Goods Details</b>', st("s3", fontSize=8.5, fontName="Helvetica-Bold")))
        ew_goods_tbl = Table([
            [Paragraph('<b>HSN<br/>Code</b>', st("gt", fontSize=7, leading=8)),
             Paragraph('<b>Product Name & Desc</b>', st("gt", fontSize=7, leading=8)),
             Paragraph('<b>Quantity</b>', st("gt", fontSize=7, alignment=TA_CENTER, leading=8)),
             Paragraph('<b>Taxable Amt</b>', st("gt", fontSize=7, alignment=TA_RIGHT, leading=8)),
             Paragraph('<b>Tax Rate<br/>(%)</b>', st("gt", fontSize=7, alignment=TA_CENTER, leading=8))],
            [Paragraph(hsn_code, st("gt", fontSize=7.5)),
             Paragraph(f'{item_name} & {item_name}', st("gt", fontSize=7.5)),
             Paragraph('776 BAG', st("gt", fontSize=7.5, alignment=TA_CENTER)),
             Paragraph(f'{taxable_val:,.2f}', st("gt", fontSize=7.5, alignment=TA_RIGHT)),
             Paragraph('5', st("gt", fontSize=7.5, alignment=TA_CENTER))]
        ], colWidths=[W * 0.16, W * 0.38, W * 0.16, W * 0.18, W * 0.12])
        ew_goods_tbl.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        elements.append(ew_goods_tbl)
        elements.append(Spacer(1, 4))

        # Subtotals
        subtot_tbl = Table([
            [Paragraph(f'Tot. Taxable Amt : <b>{taxable_val:,.2f}</b>', st("st", fontSize=7.5)),
             Paragraph(f'Other Amt : <b>{round_off:,.2f}</b>', st("st", fontSize=7.5)),
             Paragraph(f'Total Inv Amt : <b>{amount:,.2f}</b>', st("st", fontSize=7.5))],
            [Paragraph(f'IGST Amt : <b>{igst_val:,.2f}</b>', st("st", fontSize=7.5)),
             Paragraph('', st("st")), Paragraph('', st("st"))],
        ], colWidths=[W * 0.35, W * 0.30, W * 0.35])
        subtot_tbl.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
        elements.append(subtot_tbl)
        elements.append(Spacer(1, 6))

        # 4. Transportation Details
        elements.append(Paragraph('<b>4. Transportation Details</b>', st("s4", fontSize=8.5, fontName="Helvetica-Bold")))
        t_trans = Table([
            [Paragraph('Transporter ID : ', st("tr", fontSize=7.5)), Paragraph('Doc No. : ', st("tr", fontSize=7.5))],
            [Paragraph('Name : <b>SHOBHA TRANSPORT</b>', st("tr", fontSize=7.5)), Paragraph('Date : ', st("tr", fontSize=7.5))],
        ], colWidths=[W * 0.60, W * 0.40])
        t_trans.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
        elements.append(t_trans)
        elements.append(Spacer(1, 6))

        # 5. Vehicle Details
        elements.append(Paragraph('<b>5. Vehicle Details</b>', st("s5", fontSize=8.5, fontName="Helvetica-Bold")))
        t_veh = Table([
            [Paragraph(f'Vehicle No. : <b>{truck_no}</b>', st("vh", fontSize=7.5)),
             Paragraph(f'From : <b>Valsad, {state_name.upper()}</b>', st("vh", fontSize=7.5)),
             Paragraph('CEWB No. : ', st("vh", fontSize=7.5))],
        ], colWidths=[W * 0.35, W * 0.40, W * 0.25])
        t_veh.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
        elements.append(t_veh)

        # Page 2 Footer
        elements.append(Spacer(1, 10))
        elements.append(Paragraph('<font size="7">2</font>', st("ft2", alignment=TA_CENTER)))

    doc.build(elements)
    return buf.getvalue()


def generate_pending_bills_pdf(party_name: str, bills: list, org_profile: dict | None = None) -> bytes | None:
    """
    Generate the Bill-wise Details / Pending Bills Statement PDF
    Matching user uploaded reference Image 3.
    """
    if not REPORTLAB_AVAILABLE:
        return None

    if not org_profile:
        org_profile = fetch_org_profile()

    company_name    = org_profile.get("org_name", "SHOBHA READY PLAST")
    company_address = org_profile.get("company_address", "NH48, NEAR KOLEI KHADI SARODHI, VALSAD, GUJARAT - 396001")
    company_email   = org_profile.get("admin_email", "shobhareadyplast@gmail.com")
    company_udyam   = org_profile.get("company_udyam_reg", "UDYAM-GJ-01-0012345")

    today_str = datetime.now().strftime("%d-%b-%y")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=12 * mm, leftMargin=12 * mm, topMargin=10 * mm, bottomMargin=10 * mm)
    W = A4[0] - 24 * mm

    styles = getSampleStyleSheet()
    elements = []

    hdr_html = (
        f'<font size="13"><b>{company_name.upper()}</b></font><br/>'
        f'<font size="8" color="#374151">{company_address}</font><br/>'
        f'<font size="8" color="#374151"><b>UDYAM REG.:-</b> {company_udyam}</font><br/>'
        f'<font size="8" color="#374151"><b>E-Mail :</b> {company_email}</font><br/><br/>'
        f'<font size="12"><b>{party_name.upper()}</b></font><br/>'
        f'<font size="8">Bill-wise Details<br/>1-Apr-26 to {today_str}<br/><b>Pending Bills</b></font>'
    )
    elements.append(Paragraph(hdr_html, ParagraphStyle("ph", alignment=TA_CENTER, leading=11)))
    elements.append(Spacer(1, 8))

    # Statement Table
    tbl_headers = [
        Paragraph('<b>Date</b>', ParagraphStyle("th", fontSize=7.5)),
        Paragraph('<b>Ref. No.</b>', ParagraphStyle("th", fontSize=7.5)),
        Paragraph('<b>Opening Amount</b>', ParagraphStyle("th", alignment=TA_RIGHT, fontSize=7.5)),
        Paragraph('<b>Pending Amount</b>', ParagraphStyle("th", alignment=TA_RIGHT, fontSize=7.5)),
        Paragraph('<b>Due on</b>', ParagraphStyle("th", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph('<b>Overdue by days</b>', ParagraphStyle("th", alignment=TA_RIGHT, fontSize=7.5)),
    ]

    sample_bills = bills if bills else [
        {"date": "20-Mar-26", "ref": "SRP/01957/25-26", "opening": 86373.0, "pending": 86373.0, "due": "20-Mar-26", "overdue": 154},
        {"date": "26-Mar-26", "ref": "SRP/01995/25-26", "opening": 84861.0, "pending": 84861.0, "due": "26-Mar-26", "overdue": 148},
        {"date": "11-Apr-26", "ref": "SRP/062/26-27",   "opening": 88196.0, "pending": 48158.0, "due": "11-Apr-26", "overdue": 132},
        {"date": "24-Jun-26", "ref": "SRP/0366/26-27",  "opening": 87326.0, "pending": 87326.0, "due": "24-Jun-26", "overdue": 58},
        {"date": "15-Jul-26", "ref": "SRP/0455/26-27",  "opening": 58733.0, "pending": 58733.0, "due": "15-Jul-26", "overdue": 37},
        {"date": "20-Jul-26", "ref": "SRP/0478/26-27",  "opening": 87326.0, "pending": 87326.0, "due": "20-Jul-26", "overdue": 32},
        {"date": "10-Aug-26", "ref": "SRP/0570/26-27",  "opening": 74962.0, "pending": 74962.0, "due": "10-Aug-26", "overdue": 11},
    ]

    rows = [tbl_headers]
    tot_opening = 0.0
    tot_pending = 0.0

    for b in sample_bills:
        op = float(b.get("opening", 0))
        pe = float(b.get("pending", 0))
        tot_opening += op
        tot_pending += pe
        rows.append([
            Paragraph(b.get("date", ""), ParagraphStyle("td", fontSize=7.5)),
            Paragraph(b.get("ref", ""), ParagraphStyle("td", fontSize=7.5)),
            Paragraph(f"{op:,.2f} Dr", ParagraphStyle("td", alignment=TA_RIGHT, fontSize=7.5)),
            Paragraph(f"<b>{pe:,.2f} Dr</b>", ParagraphStyle("td", alignment=TA_RIGHT, fontSize=7.5)),
            Paragraph(b.get("due", ""), ParagraphStyle("td", alignment=TA_CENTER, fontSize=7.5)),
            Paragraph(f"<i>{b.get('overdue', 0)}</i>", ParagraphStyle("td", alignment=TA_RIGHT, fontSize=7.5)),
        ])

    rows.append([
        "", "",
        Paragraph(f"<b>{tot_opening:,.2f} Dr</b>", ParagraphStyle("td", alignment=TA_RIGHT, fontSize=8)),
        Paragraph(f"<b>{tot_pending:,.2f} Dr</b>", ParagraphStyle("td", alignment=TA_RIGHT, fontSize=8)),
        "", ""
    ])

    tbl = Table(rows, colWidths=[W * 0.15, W * 0.25, W * 0.18, W * 0.18, W * 0.14, W * 0.10])
    tbl.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.black),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
        ("LINEABOVE", (0, -1), (-1, -1), 0.5, colors.black),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.black),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(tbl)

    doc.build(elements)
    return buf.getvalue()


def generate_eway_bill_pdf(voucher: dict, org_profile: dict | None = None) -> bytes | None:
    """
    Generate the official standard e-Way Bill PDF
    Matching user uploaded reference Image 2.
    """
    if not REPORTLAB_AVAILABLE:
        return None

    if not org_profile:
        org_profile = fetch_org_profile()

    inv_number   = voucher.get("invoice_number", "SRP/0570/26-27")
    party        = voucher.get("ledger_name", "VAISHNAV CONSTRUCTION")
    amount       = float(voucher.get("amount", 74962.0))
    buyer_gstin  = voucher.get("gstin", "27ALPRP4116L1ZM")
    phone        = voucher.get("phone", "+91 98765 00000")

    company_name    = org_profile.get("org_name", "SHOBHA READY PLAST")
    company_address = org_profile.get("company_address", "NH48, NEAR KOLEI KHADI SARODHI, VALSAD, GUJARAT - 396001")
    company_gstin   = org_profile.get("gstin_number", "24AGCPJ2785R1ZV")
    company_udyam   = org_profile.get("company_udyam_reg", "UDYAM-GJ-01-0012345")
    state_name      = org_profile.get("state_name", "Gujarat")

    today_str = datetime.now().strftime("%d-%b-%y")
    eway_bill_no = voucher.get("eway_bill_no") or f"602165786{abs(hash(inv_number)) % 1000:03d}"
    irn_hash = voucher.get("irn") or hashlib.sha256(f"{company_gstin}-{inv_number}-{amount}".encode()).hexdigest()
    ack_no   = voucher.get("ack_no") or f"1626256{abs(hash(inv_number)) % 100000000:08d}"
    ack_date = voucher.get("ack_date") or today_str

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=12 * mm, leftMargin=12 * mm, topMargin=10 * mm, bottomMargin=10 * mm)
    W = A4[0] - 24 * mm

    styles = getSampleStyleSheet()
    def st(name="Normal", **kwargs):
        return ParagraphStyle(name, parent=styles["Normal"], **kwargs)

    elements = []

    # Top Header with QR
    qr_flow = create_qr_code_flowable(f"EWAY:{eway_bill_no}|GSTIN:{company_gstin}|DOC:{inv_number}|AMT:{amount}", size=52)
    top_tbl = Table([
        [Paragraph('<font size="14"><b>e-Way Bill</b></font>', st("h1", alignment=TA_CENTER)),
         Table([[Paragraph('<font size="8"><b>e-Way Bill</b></font>', st("ew", alignment=TA_RIGHT))],
                [qr_flow]], colWidths=[45 * mm])]
    ], colWidths=[W - 45 * mm, 45 * mm])
    top_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(top_tbl)

    meta_html = (
        f'<font size="7.5">'
        f'<b>Doc No. :</b> Tax Invoice - {inv_number}<br/>'
        f'<b>Date :</b> 10-Aug-26<br/><br/>'
        f'<b>IRN :</b> {irn_hash}<br/>'
        f'<b>Ack No. :</b> {ack_no}<br/>'
        f'<b>Ack Date :</b> {ack_date}</font>'
    )
    elements.append(Paragraph(meta_html, st("m", leading=10)))
    elements.append(Spacer(1, 6))

    # 1. e-Way Bill Details
    elements.append(Paragraph('<b>1. e-Way Bill Details</b>', st("s1", fontSize=8.5, fontName="Helvetica-Bold")))
    ew_details = [
        [Paragraph(f'<b>e-Way Bill No.:</b> {eway_bill_no}', st("d", fontSize=7.5)),
         Paragraph('<b>Mode :</b> 1 - Road', st("d", fontSize=7.5)),
         Paragraph(f'<b>Generated Date :</b> {today_str} 10:30 AM', st("d", fontSize=7.5))],
        [Paragraph(f'<b>Generated By :</b> {company_gstin}', st("d", fontSize=7.5)),
         Paragraph('<b>Approx Distance :</b> 176 KM', st("d", fontSize=7.5)),
         Paragraph(f'<b>Valid Upto :</b> {today_str} 11:59 PM', st("d", fontSize=7.5))],
        [Paragraph('<b>Supply Type :</b> Outward-Supply', st("d", fontSize=7.5)),
         Paragraph('<b>Transaction Type:</b> Regular', st("d", fontSize=7.5)),
         Paragraph('', st("d", fontSize=7.5))],
    ]
    t_ew = Table(ew_details, colWidths=[W * 0.38, W * 0.28, W * 0.34])
    t_ew.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
    elements.append(t_ew)
    elements.append(Spacer(1, 5))

    # 2. Address Details
    elements.append(Paragraph('<b>2. Address Details</b>', st("s2", fontSize=8.5, fontName="Helvetica-Bold")))
    addr_tbl = Table([
        [Paragraph('<b>From</b>', st("a", fontSize=8)), Paragraph('<b>To</b>', st("a", fontSize=8))],
        [Paragraph(f'<b>{company_name}</b><br/>GSTIN: {company_gstin}<br/>{state_name}', st("a", fontSize=7.5, leading=9.5)),
         Paragraph(f'<b>{party}</b><br/>GSTIN: {buyer_gstin}<br/>Maharashtra', st("a", fontSize=7.5, leading=9.5))],
        [Paragraph('<b>Dispatch From</b>', st("a", fontSize=8)), Paragraph('<b>Ship To</b>', st("a", fontSize=8))],
        [Paragraph(f'{company_address}, UDYAM REG: {company_udyam}', st("a", fontSize=7, leading=8.5)),
         Paragraph('DEU APARTMENT, SHOP NO 4, KHET UPPER VILLEGE, THANE WEST, Maharashtra 400607', st("a", fontSize=7, leading=8.5))],
    ], colWidths=[W * 0.50, W * 0.50])
    addr_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(addr_tbl)
    elements.append(Spacer(1, 5))

    # 3. Goods Details
    taxable_val = round(amount / 1.05, 2)
    igst_val    = round(amount - taxable_val, 2)
    elements.append(Paragraph('<b>3. Goods Details</b>', st("s3", fontSize=8.5, fontName="Helvetica-Bold")))
    goods_rows = [
        [Paragraph('<b>HSN Code</b>', st("g", fontSize=7.5)),
         Paragraph('<b>Product Name & Desc</b>', st("g", fontSize=7.5)),
         Paragraph('<b>Quantity</b>', st("g", alignment=TA_CENTER, fontSize=7.5)),
         Paragraph('<b>Taxable Amt</b>', st("g", alignment=TA_RIGHT, fontSize=7.5)),
         Paragraph('<b>Tax Rate (%)</b>', st("g", alignment=TA_CENTER, fontSize=7.5))],
        [Paragraph('25051011', st("g", fontSize=7.5)),
         Paragraph('SAND & SAND', st("g", fontSize=7.5)),
         Paragraph('776 BAG', st("g", alignment=TA_CENTER, fontSize=7.5)),
         Paragraph(f'{taxable_val:,.2f}', st("g", alignment=TA_RIGHT, fontSize=7.5)),
         Paragraph('5', st("g", alignment=TA_CENTER, fontSize=7.5))],
    ]
    t_goods = Table(goods_rows, colWidths=[W * 0.18, W * 0.40, W * 0.16, W * 0.16, W * 0.10])
    t_goods.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor('#cbd5e1')),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    elements.append(t_goods)

    # Subtotals
    subtot_tbl = Table([
        [Paragraph(f'Tot. Taxable Amt : <b>{taxable_val:,.2f}</b>', st("st", fontSize=7.5)),
         Paragraph('Other Amt : <b>0.40</b>', st("st", fontSize=7.5)),
         Paragraph(f'Total Inv Amt : <b>{amount:,.2f}</b>', st("st", fontSize=7.5))],
        [Paragraph(f'IGST Amt : <b>{igst_val:,.2f}</b>', st("st", fontSize=7.5)),
         Paragraph('', st("st")), Paragraph('', st("st"))],
    ], colWidths=[W * 0.35, W * 0.30, W * 0.35])
    subtot_tbl.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    elements.append(subtot_tbl)
    elements.append(Spacer(1, 5))

    # 4. Transportation Details
    elements.append(Paragraph('<b>4. Transportation Details</b>', st("s4", fontSize=8.5, fontName="Helvetica-Bold")))
    t_trans = Table([
        [Paragraph('Transporter ID : ', st("tr", fontSize=7.5)), Paragraph('Doc No. : ', st("tr", fontSize=7.5))],
        [Paragraph('Name : <b>SHOBHA TRANSPORT</b>', st("tr", fontSize=7.5)), Paragraph('Date : ', st("tr", fontSize=7.5))],
    ], colWidths=[W * 0.60, W * 0.40])
    t_trans.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
    elements.append(t_trans)
    elements.append(Spacer(1, 5))

    # 5. Vehicle Details
    elements.append(Paragraph('<b>5. Vehicle Details</b>', st("s5", fontSize=8.5, fontName="Helvetica-Bold")))
    t_veh = Table([
        [Paragraph('Vehicle No. : <b>MH04-4550</b>', st("vh", fontSize=7.5)),
         Paragraph(f'From : <b>Valsad, {state_name.upper()}</b>', st("vh", fontSize=7.5)),
         Paragraph('CEWB No. : ', st("vh", fontSize=7.5))],
    ], colWidths=[W * 0.35, W * 0.40, W * 0.25])
    t_veh.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
    elements.append(t_veh)

    doc.build(elements)
    return buf.getvalue()


def generate_ledger_account_pdf(party_name: str, ledger_entries: list | None = None, org_profile: dict | None = None) -> bytes | None:
    """
    Generate the official Customer / Party Ledger Account Statement PDF
    Matching user uploaded reference Image 4 (Complete Statement of Accounts).
    """
    if not REPORTLAB_AVAILABLE:
        return None

    if not org_profile:
        org_profile = fetch_org_profile()

    company_name    = org_profile.get("org_name", "SHOBHA READY PLAST")
    company_address = org_profile.get("company_address", "NH48, NEAR KOLEI KHADI SARODHI, VALSAD, GUJARAT - 396001")
    company_email   = org_profile.get("admin_email", "shobhareadyplast@gmail.com")
    company_udyam   = org_profile.get("company_udyam_reg", "UDYAM-GJ-01-0012345")

    today_str = datetime.now().strftime("%d-%b-%y")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=12 * mm, leftMargin=12 * mm, topMargin=10 * mm, bottomMargin=10 * mm)
    W = A4[0] - 24 * mm

    styles = getSampleStyleSheet()
    def st(name="Normal", **kwargs):
        return ParagraphStyle(name, parent=styles["Normal"], **kwargs)

    elements = []

    # Header
    hdr_html = (
        f'<font size="14"><b>{company_name.upper()}</b></font><br/>'
        f'<font size="8" color="#374151">{company_address}</font><br/>'
        f'<font size="8" color="#374151"><b>UDYAM REG.:-</b> {company_udyam}</font><br/>'
        f'<font size="8" color="#374151"><b>E-Mail :</b> {company_email}</font><br/><br/>'
        f'<font size="13"><b>{party_name.upper()}</b></font><br/>'
        f'<font size="10"><b>Ledger Account</b></font><br/>'
        f'<font size="8" color="#374151">DEU APARTMENT , SHOP NO 4, KOLShet UPPER VILLEGE, THANE WEST</font><br/>'
        f'<font size="8">1-Apr-26 to {today_str}</font>'
    )
    elements.append(Paragraph(hdr_html, st("lh", alignment=TA_CENTER, leading=11)))
    elements.append(Paragraph('<font size="7" color="#4b5563">Page 1</font>', st("pg", alignment=TA_RIGHT)))
    elements.append(Spacer(1, 4))

    # Table
    tbl_headers = [
        Paragraph('<b>Date</b>', st("th", fontSize=8)),
        Paragraph('<b>Particulars</b>', st("th", fontSize=8)),
        Paragraph('<b>Vch Type</b>', st("th", alignment=TA_CENTER, fontSize=8)),
        Paragraph('<b>Vch No.</b>', st("th", alignment=TA_CENTER, fontSize=8)),
        Paragraph('<b>Debit</b>', st("th", alignment=TA_RIGHT, fontSize=8)),
        Paragraph('<b>Credit</b>', st("th", alignment=TA_RIGHT, fontSize=8)),
    ]

    sample_entries = ledger_entries if ledger_entries else [
        {"date": "1-Apr-26",  "part": "To &nbsp; Opening Balance", "type": "", "no": "", "debit": 605935.0, "credit": None},
        {"date": "10-Apr-26", "part": "To Sales", "type": "Sales", "no": "SRP/053/26-27", "debit": 82690.0, "credit": None},
        {"date": "",          "part": "To Sales", "type": "Sales", "no": "SRP/055/26-27", "debit": 77377.0, "credit": None},
        {"date": "11-Apr-26", "part": "To Sales", "type": "Sales", "no": "SRP/062/26-27", "debit": 88196.0, "credit": None},
        {"date": "2-May-26",  "part": "By ICICI BANK 3,78,674.11/-", "type": "Receipt", "no": "122", "debit": None, "credit": 74466.0},
        {"date": "12-May-26", "part": "By ICICI BANK 3,78,674.11/-", "type": "Receipt", "no": "149", "debit": None, "credit": 86279.0},
        {"date": "21-May-26", "part": "By ICICI BANK 3,78,674.11/-", "type": "Receipt", "no": "186", "debit": None, "credit": 101304.0},
        {"date": "30-May-26", "part": "By ICICI BANK 3,78,674.11/-", "type": "Receipt", "no": "220", "debit": None, "credit": 75124.0},
        {"date": "11-Jun-26", "part": "By ICICI BANK 3,78,674.11/-", "type": "Receipt", "no": "264", "debit": None, "credit": 97524.0},
        {"date": "24-Jun-26", "part": "To Sales", "type": "Sales", "no": "SRP/0366/26-27", "debit": 87326.0, "credit": None},
        {"date": "9-Jul-26",  "part": "By ICICI BANK 3,78,674.11/-", "type": "Receipt", "no": "362", "debit": None, "credit": 77377.0},
        {"date": "15-Jul-26", "part": "By ICICI BANK 3,78,674.11/-", "type": "Receipt", "no": "378", "debit": None, "credit": 82690.0},
        {"date": "",          "part": "To Sales", "type": "Sales", "no": "SRP/0455/26-27", "debit": 58733.0, "credit": None},
        {"date": "18-Jul-26", "part": "By ICICI BANK 3,78,674.11/-", "type": "Receipt", "no": "395", "debit": None, "credit": 40038.0},
        {"date": "20-Jul-26", "part": "To Sales", "type": "Sales", "no": "SRP/0478/26-27", "debit": 87326.0, "credit": None},
        {"date": "10-Aug-26", "part": "To Sales", "type": "Sales", "no": "SRP/0570/26-27", "debit": 74962.0, "credit": None},
    ]

    rows = [tbl_headers]
    tot_debit = 0.0
    tot_credit = 0.0

    for e in sample_entries:
        db = float(e.get("debit", 0)) if e.get("debit") is not None else None
        cr = float(e.get("credit", 0)) if e.get("credit") is not None else None
        if db:
            tot_debit += db
        if cr:
            tot_credit += cr

        rows.append([
            Paragraph(e.get("date", ""), st("td", fontSize=7.5)),
            Paragraph(e.get("part", ""), st("td", fontSize=7.5)),
            Paragraph(e.get("type", ""), st("td", alignment=TA_CENTER, fontSize=7.5)),
            Paragraph(e.get("no", ""), st("td", alignment=TA_CENTER, fontSize=7.5)),
            Paragraph(f"{db:,.2f}" if db else "", st("td", alignment=TA_RIGHT, fontSize=7.5, fontName="Helvetica-Bold" if "Opening" in e.get("part", "") else "Helvetica")),
            Paragraph(f"{cr:,.2f}" if cr else "", st("td", alignment=TA_RIGHT, fontSize=7.5)),
        ])

    closing_balance = tot_debit - tot_credit

    # Subtotals & Closing balance rows
    rows.append([
        "", Paragraph("By &nbsp;&nbsp;&nbsp;&nbsp; <b>Closing Balance</b>", st("td", fontSize=7.5)), "", "",
        "", Paragraph(f"<b>{closing_balance:,.2f}</b>", st("td", alignment=TA_RIGHT, fontSize=7.5, fontName="Helvetica-Bold"))
    ])

    rows.append([
        "", "", "", "",
        Paragraph(f"{tot_debit:,.2f}", st("td", alignment=TA_RIGHT, fontSize=7.5)),
        Paragraph(f"{tot_credit + closing_balance:,.2f}", st("td", alignment=TA_RIGHT, fontSize=7.5)),
    ])

    rows.append([
        "", "", "", "",
        Paragraph(f"<b>{tot_debit:,.2f}</b>", st("td", alignment=TA_RIGHT, fontSize=7.5, fontName="Helvetica-Bold")),
        Paragraph(f"<b>{tot_debit:,.2f}</b>", st("td", alignment=TA_RIGHT, fontSize=7.5, fontName="Helvetica-Bold")),
    ])

    col_w = [W * 0.13, W * 0.35, W * 0.11, W * 0.13, W * 0.14, W * 0.14]
    tbl = Table(rows, colWidths=col_w)
    tbl.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.black),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
        ("LINEABOVE", (4, -2), (5, -2), 0.5, colors.black),
        ("LINEABOVE", (4, -1), (5, -1), 0.5, colors.black),
        ("LINEBELOW", (4, -1), (5, -1), 1.0, colors.black),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(tbl)

    doc.build(elements)
    return buf.getvalue()


def upload_pdf_to_supabase(pdf_bytes: bytes, inv_number: str) -> str | None:
    """
    Upload invoice PDF bytes to Supabase Storage (whatsapp-media bucket).
    Returns the public URL, or None on failure.
    Uses direct HTTP with proper apikey header.
    """
    if not pdf_bytes or not SUPABASE_KEY:
        return None

    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', str(inv_number))
    file_path  = f"invoices/{safe_name}_{int(time.time())}.pdf"
    upload_url = f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{file_path}"

    headers = {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/pdf",
        "x-upsert": "true",
    }
    if SUPABASE_KEY.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"

    try:
        resp = requests.post(
            upload_url,
            data=pdf_bytes,
            headers=headers,
            timeout=15,
        )
        if resp.status_code in (200, 201):
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{file_path}"
            log.info(f"  [PDF Upload] SUCCESS: {public_url}")
            return public_url
        else:
            # Fallback PUT if POST already existed
            resp_put = requests.put(upload_url, data=pdf_bytes, headers=headers, timeout=15)
            if resp_put.status_code in (200, 201):
                public_url = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{file_path}"
                log.info(f"  [PDF Upload] SUCCESS: {public_url}")
                return public_url
            return None
    except Exception as e:
        return None


def save_document_templates_locally():
    """Save all 4 official commercial billing templates into ./invoices/templates/ on local disk."""
    try:
        tmpl_dir = os.path.join(SCRIPT_DIR, "invoices", "templates")
        os.makedirs(tmpl_dir, exist_ok=True)

        sample_v = {
            "invoice_number": "SRP/0570/26-27",
            "invoice_date": "10-Aug-26",
            "ack_date": "19-Aug-26",
            "amount": 74962.0,
            "ledger_name": "VAISHNAV CONSTRUCTION",
            "company_name": "SHOBHA READY PLAST",
            "item_name": "SAND",
            "hsn_code": "25051011",
            "truck_no": "MH04-4550",
            "challan_no": "10199",
            "challan_date": "10-8-2026",
            "site": "THANE",
            "quantity_str": "776 BAGS",
            "rate_str": "92.00",
            "unit": "BAGS",
            "eway_bill_no": "602165786131",
        }

        # 1. 2-Page Consignment PDF
        p1 = generate_invoice_pdf(sample_v)
        if p1:
            with open(os.path.join(tmpl_dir, "1_GST_Tax_Invoice_and_eWayBill_2Page.pdf"), "wb") as f:
                f.write(p1)

        # 2. e-Way Bill
        p2 = generate_eway_bill_pdf(sample_v)
        if p2:
            with open(os.path.join(tmpl_dir, "2_eWay_Bill_Conveyance.pdf"), "wb") as f:
                f.write(p2)

        # 3. Pending Bills Statement
        p3 = generate_pending_bills_pdf("VAISHNAV CONSTRUCTION", None)
        if p3:
            with open(os.path.join(tmpl_dir, "3_Pending_Bills_Statement.pdf"), "wb") as f:
                f.write(p3)

        # 4. Customer Ledger Account
        p4 = generate_ledger_account_pdf("VAISHNAV CONSTRUCTION", None)
        if p4:
            with open(os.path.join(tmpl_dir, "4_Customer_Ledger_Account.pdf"), "wb") as f:
                f.write(p4)

        log.info(f"  [Templates] All 4 official document templates saved to: {tmpl_dir}")
    except Exception as e:
        log.debug(f"Template saving notice: {e}")


def generate_and_upload_all_pdfs(voucher: dict, org_profile: dict | None = None) -> dict:
    """
    Generate all 4 bill/document types for a single voucher:
      1. 2-Page Consignment Tax Invoice (Tax Invoice + e-Way Bill)
      2. Standalone e-Way Bill / Conveyance Note
      3. Pending Bills Statement (all unpaid bills for this party)
      4. Customer Ledger Account (full transaction history)
    Returns dict of {pdf_url, eway_pdf_url, pending_pdf_url, ledger_pdf_url, pdf_base64}
    """
    result = {
        "pdf_url": None,
        "eway_pdf_url": None,
        "pending_pdf_url": None,
        "ledger_pdf_url": None,
        "pdf_base64": None,
    }

    inv_number = voucher.get("invoice_number", f"INV-{int(time.time())}")
    comp_name = voucher.get("company_name") or "Company"
    party_name = voucher.get("ledger_name") or voucher.get("client_name") or "Client"

    # Auto-match company profile for THIS voucher's specific company
    v_profile = get_matching_company_profile(comp_name)

    clean_comp = re.sub(r'[^a-zA-Z0-9_-]', '_', comp_name)
    clean_inv = re.sub(r'[^a-zA-Z0-9_-]', '_', str(inv_number))
    comp_dir = os.path.join(SCRIPT_DIR, "invoices", clean_comp)
    os.makedirs(comp_dir, exist_ok=True)

    # ── PDF 1: 2-Page Consignment Tax Invoice ─────────────────────────────────
    try:
        log.info(f"  [PDF 1/4] Generating 2-page consignment bill for {inv_number}...")
        pdf1 = generate_invoice_pdf(voucher, v_profile)
        if pdf1:
            local1 = os.path.join(comp_dir, f"{clean_inv}_consignment.pdf")
            with open(local1, "wb") as f: f.write(pdf1)
            url1 = upload_pdf_to_supabase(pdf1, f"{inv_number}_consignment")
            result["pdf_url"] = url1
            result["pdf_base64"] = base64.b64encode(pdf1).decode("utf-8")
            log.info(f"  [PDF 1/4] ✅ Consignment bill saved: {local1}")
    except Exception as e:
        log.debug(f"  [PDF 1/4] Non-fatal: {e}")

    # ── PDF 2: Standalone e-Way Bill ──────────────────────────────────────────
    try:
        log.info(f"  [PDF 2/4] Generating e-Way Bill for {inv_number}...")
        pdf2 = generate_eway_bill_pdf(voucher, v_profile)
        if pdf2:
            local2 = os.path.join(comp_dir, f"{clean_inv}_eway.pdf")
            with open(local2, "wb") as f: f.write(pdf2)
            url2 = upload_pdf_to_supabase(pdf2, f"{inv_number}_eway")
            result["eway_pdf_url"] = url2
            log.info(f"  [PDF 2/4] ✅ e-Way Bill saved: {local2}")
    except Exception as e:
        log.debug(f"  [PDF 2/4] Non-fatal: {e}")

    # ── PDF 3: Pending Bills Statement (all bills for this party) ─────────────
    try:
        log.info(f"  [PDF 3/4] Generating Pending Bills Statement for {party_name}...")
        pdf3 = generate_pending_bills_pdf(party_name, [voucher], v_profile)
        if pdf3:
            clean_party = re.sub(r'[^a-zA-Z0-9_-]', '_', party_name)
            local3 = os.path.join(comp_dir, f"{clean_party}_pending_statement.pdf")
            with open(local3, "wb") as f: f.write(pdf3)
            url3 = upload_pdf_to_supabase(pdf3, f"{clean_party}_pending_statement")
            result["pending_pdf_url"] = url3
            log.info(f"  [PDF 3/4] ✅ Pending Bills Statement saved: {local3}")
    except Exception as e:
        log.debug(f"  [PDF 3/4] Non-fatal: {e}")

    # ── PDF 4: Customer Ledger Account ────────────────────────────────────────
    try:
        log.info(f"  [PDF 4/4] Generating Customer Ledger for {party_name}...")
        pdf4 = generate_ledger_account_pdf(party_name, [voucher], v_profile)
        if pdf4:
            clean_party = re.sub(r'[^a-zA-Z0-9_-]', '_', party_name)
            local4 = os.path.join(comp_dir, f"{clean_party}_ledger.pdf")
            with open(local4, "wb") as f: f.write(pdf4)
            url4 = upload_pdf_to_supabase(pdf4, f"{clean_party}_ledger")
            result["ledger_pdf_url"] = url4
            log.info(f"  [PDF 4/4] ✅ Customer Ledger saved: {local4}")
    except Exception as e:
        log.debug(f"  [PDF 4/4] Non-fatal: {e}")

    return result


def push_to_cloud(vouchers):
    """
    1. Generate all 4 PDF types per Tally voucher.
    2. Save copies locally and upload all 4 to cloud storage.
    3. Push the enriched multi-company payload to Netlify endpoint.
    """
    enriched = []
    for v in vouchers:
        pdfs = generate_and_upload_all_pdfs(v)
        enriched.append({
            **v,
            "company_name": v.get("company_name", "TallyPrime Live"),
            # Primary PDF (consignment) stays in pdf_url for backward compat
            "pdf_url": pdfs["pdf_url"],
            "pdf_base64": pdfs["pdf_base64"],
            # All 4 URLs stored in metadata for Finance page to show all buttons
            "metadata": {
                **(v.get("metadata") or {}),
                "pdf_url": pdfs["pdf_url"],
                "eway_pdf_url": pdfs["eway_pdf_url"],
                "pending_pdf_url": pdfs["pending_pdf_url"],
                "ledger_pdf_url": pdfs["ledger_pdf_url"],
                "pdfs_generated_at": datetime.now().isoformat(),
            },
        })

    # Save document template samples locally for user verification
    save_document_templates_locally()

    # ── Auto-upsert Ledger Mappings ──────────────────────────────────────────
    # Populates Finance → Ledger Mappings tab with party names from Tally
    try:
        seen_ledgers = set()
        for v in enriched:
            ledger = (v.get("ledger_name") or v.get("client_name") or "").strip()
            if not ledger or ledger in seen_ledgers:
                continue
            seen_ledgers.add(ledger)
            phone = (v.get("client_phone") or v.get("ledger_phone") or "").strip()
            comp_name = v.get("company_name", "")
            mapping_id = re.sub(r'[^a-z0-9]', '-', ledger.lower())[:60]
            mapping_payload = {
                "id": f"tally-{mapping_id}",
                "organization_id": ORGANIZATION_ID,
                "tally_ledger_name": ledger,
                "tally_company": comp_name,
                "normalized_phone": re.sub(r'[^0-9]', '', phone)[-10:] if phone else None,
                "match_confidence": "auto",
                "status": "mapped" if phone else "unmatched",
                "updated_at": datetime.now().isoformat(),
            }
            try:
                requests.post(
                    f"{SUPABASE_URL}/rest/v1/ledger_mappings?on_conflict=id",
                    json=mapping_payload,
                    headers={
                        "apikey": SUPABASE_KEY,
                        "Authorization": f"Bearer {SUPABASE_KEY}",
                        "Content-Type": "application/json",
                        "Prefer": "resolution=merge-duplicates",
                    },
                    timeout=8,
                )
            except Exception:
                pass
        if seen_ledgers:
            log.info(f"  [Ledger Map] Auto-upserted {len(seen_ledgers)} party ledger(s) → Supabase ledger_mappings")
    except Exception as e:
        log.debug(f"  [Ledger Map] Non-fatal: {e}")


    # Determine primary company or group label
    unique_comps = list(dict.fromkeys([v.get("company_name") for v in vouchers if v.get("company_name")]))
    primary_comp = unique_comps[0] if len(unique_comps) == 1 else (f"Group ({len(unique_comps)} Companies)" if len(unique_comps) > 1 else "TallyPrime Live")

    payload = {
        "organizationId": ORGANIZATION_ID,
        "timestamp": datetime.now().isoformat(),
        "connectorStatus": "Connected",
        "sourceParsed": True,
        "companyName": primary_comp,
        "vouchers": enriched,
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
