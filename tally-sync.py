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
import base64
import hashlib
from datetime import datetime, timedelta

# Check if reportlab is available
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    from reportlab.graphics.shapes import Drawing, Rect, String, Group
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

# -- Configuration --
TALLY_HOST        = os.environ.get("TALLY_HOST", "http://localhost:9000")
CLOUD_URL         = os.environ.get("ERPPRO_CLOUD_URL", "http://localhost:5173/.netlify/functions/tally-sync")
CONNECTOR_TOKEN   = os.environ.get("TALLY_CONNECTOR_TOKEN", "erppro_tally_sec_token_2026")
ORGANIZATION_ID   = os.environ.get("ORGANIZATION_ID", "00000000-0000-0000-0000-000000000001")
SYNC_INTERVAL_SEC = int(os.environ.get("SYNC_INTERVAL_MINS", "60")) * 60
SCRIPT_DIR        = os.path.dirname(os.path.abspath(__file__))

# Supabase Storage (for uploading invoice PDFs)
SUPABASE_URL      = os.environ.get("SUPABASE_URL", "https://jbgkeeubevwopphekwfj.supabase.co")
SUPABASE_KEY      = os.environ.get("SUPABASE_ANON_KEY", "sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB")
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

# ==============================================================================
# INVOICE PDF GENERATOR + SUPABASE STORAGE UPLOADER
# Exact Tally GST Tax Invoice Layout with Dynamic Brand Logo & e-Invoice QR Code
# ==============================================================================

FMT_AMOUNT = lambda n: f"\u20b9{float(n):,.2f}"  # ₹ symbol
FMT_DATE   = lambda d: datetime.strptime(d, "%Y%m%d").strftime("%d %b %Y") if d and len(d) == 8 else (d or "N/A")

_CACHED_ORG_PROFILE = None

def fetch_org_profile() -> dict:
    """
    Fetch the live business organization profile from Supabase org_settings table.
    Ensures company name, logo, address, GSTIN, phone, email, udyam, and bank details
    set in the SuperAdmin General Settings appear dynamically on the generated invoice.
    """
    global _CACHED_ORG_PROFILE
    if _CACHED_ORG_PROFILE:
        return _CACHED_ORG_PROFILE

    profile = {
        "org_name": os.environ.get("COMPANY_NAME", "SHOBHA READY PLAST"),
        "company_logo_url": "",
        "company_udyam_reg": "UDYAM-GJ-01-0012345",
        "admin_email": "shobhareadyplast@gmail.com",
        "contact_phone": "+91 98765 43210",
        "company_address": "NH48, NEAR KOLEI KHADI SARODHI, VALSAD, GUJARAT - 396001",
        "gstin_number": "24AGCPJ2785R1ZV",
        "invoice_footer_notes": "Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days. Goods Once Sold Will Not Be Taken Back.",
        "default_currency": "INR",
        "bank_name": "HDFC Bank Ltd.",
        "bank_account_no": "50200088991122",
        "bank_ifsc": "HDFC0001234",
        "jurisdiction": "VALSAD / THANE",
        "state_name": "Gujarat",
        "state_code": "24",
    }

    if not SUPABASE_URL or not SUPABASE_KEY:
        _CACHED_ORG_PROFILE = profile
        return profile

    try:
        url = f"{SUPABASE_URL}/rest/v1/org_settings?select=key,value&limit=50"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}" if SUPABASE_KEY.startswith("eyJ") else f"Bearer {SUPABASE_KEY}",
        }
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            rows = resp.json()
            for r in rows:
                k = r.get("key")
                v = r.get("value")
                if k and v:
                    profile[k] = v
    except Exception as e:
        log.debug(f"Could not fetch org_settings live from Supabase: {e}")

    _CACHED_ORG_PROFILE = profile
    return profile


def create_qr_code_flowable(text: str, size: float = 62) -> Drawing:
    """Create a native ReportLab QR code drawing flowable."""
    try:
        qr = QrCodeWidget(text)
        bounds = qr.getBounds()
        w = bounds[2] - bounds[0]
        h = bounds[3] - bounds[1]
        d = Drawing(size, size, transform=[size / w, 0, 0, size / h, 0, 0])
        d.add(qr)
        return d
    except Exception as e:
        log.debug(f"QR code flowable fallback: {e}")
        d = Drawing(size, size)
        d.add(Rect(0, 0, size, size, fillColor=colors.HexColor('#f8fafc'), strokeColor=colors.HexColor('#cbd5e1')))
        d.add(String(8, size / 2 - 4, "QR CODE", fontName="Helvetica-Bold", fontSize=8, fillColor=colors.HexColor('#64748b')))
        return d


def create_logo_flowable(logo_val: str, comp_name: str = "SHOBHA READY PLAST") -> object:
    """Create an Image flowable if a custom logo is uploaded, or draw a crisp gold crest emblem."""
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

    # Crisp gold/orange emblem crest matching user sample
    initials = "".join([w[0] for w in comp_name.split()[:2]]).upper() or "SG"
    d = Drawing(68, 68)
    g = Group()
    # Sunburst golden shield background
    g.add(Rect(4, 4, 60, 60, rx=12, ry=12, fillColor=colors.HexColor('#f59e0b'), strokeColor=colors.HexColor('#d97706'), strokeWidth=1))
    g.add(String(16, 22, initials, fontName="Helvetica-Bold", fontSize=24, fillColor=colors.white))
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


def generate_invoice_pdf(voucher: dict, org_profile: dict | None = None) -> bytes | None:
    """
    Generate an exact GST Tax Invoice matching the official TallyPrime format:
      - Top Brand Logo on left
      - Centered Company Title & Factory / Office Addresses
      - Tax Invoice & e-Invoice titles with dynamic QR Code on right
      - IRN, Ack No, Ack Date metadata block
      - Dual Billed To & Shipped To Box with State Code & GSTIN
      - Itemized Goods Table with HSN/SAC, Quantity, Rate, Unit & Amount
      - Tax Subtotals: OUTPUT IGST / CGST / SGST, Round Off
      - Amount Chargeable in Words
      - HSN/SAC Tax Schedule Breakdown Table
      - Terms & Conditions, UDYAM REG, Declaration & Authorized Signatory
    """
    if not REPORTLAB_AVAILABLE:
        return None

    if not org_profile:
        org_profile = fetch_org_profile()

    inv_number   = voucher.get("invoice_number", "SRP/0570/26-27")
    party        = voucher.get("ledger_name", "VAISHNAV CONSTRUCTION")
    amount       = float(voucher.get("amount", 74962.0))
    due_date     = voucher.get("due_date", datetime.now().strftime("%Y-%m-%d"))
    status       = voucher.get("status", "Pending")
    phone        = voucher.get("phone", "+91 98765 00000")
    buyer_gstin  = voucher.get("gstin", "27ALPRP4116L1ZM")
    voucher_type = voucher.get("voucher_type", "Sales Invoice")
    line_items   = voucher.get("line_items", [])

    today_str = datetime.now().strftime("%d-%b-%y")
    due_str   = due_date
    try:
        due_str = datetime.strptime(due_date, "%Y-%m-%d").strftime("%d-%b-%y")
    except Exception:
        pass

    # Business profile from General Settings
    company_name    = org_profile.get("org_name", "SHOBHA READY PLAST")
    company_address = org_profile.get("company_address", "NH48, NEAR KOLEI KHADI SARODHI, VALSAD, GUJARAT - 396001")
    company_phone   = org_profile.get("contact_phone", "+91 98765 43210")
    company_email   = org_profile.get("admin_email", "shobhareadyplast@gmail.com")
    company_gstin   = org_profile.get("gstin_number", "24AGCPJ2785R1ZV")
    company_udyam   = org_profile.get("company_udyam_reg", "UDYAM-GJ-01-0012345")
    company_logo    = org_profile.get("company_logo_url", "")
    footer_notes    = org_profile.get("invoice_footer_notes", "Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days. Goods Once Sold Will Not Be Taken Back.")
    jurisdiction    = org_profile.get("jurisdiction", "VALSAD / THANE")
    state_name      = org_profile.get("state_name", "Gujarat")
    state_code      = org_profile.get("state_code", "24")

    # Generate synthetic or live IRN & Ack
    irn_hash = voucher.get("irn") or hashlib.sha256(f"{company_gstin}-{inv_number}-{amount}".encode()).hexdigest()
    ack_no   = voucher.get("ack_no") or f"1626256{abs(hash(inv_number)) % 100000000:08d}"
    ack_date = voucher.get("ack_date") or today_str

    # QR Code content (e-Invoice verification payload or UPI payment string)
    upi_id = org_profile.get("upi_id") or f"{company_phone.replace(' ', '').replace('+', '')}@upi"
    qr_data = f"upi://pay?pa={upi_id}&pn={company_name}&am={amount:.2f}&cu=INR&tr={inv_number}"

    # --- Build PDF in memory ---
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=10 * mm,
        leftMargin=10 * mm,
        topMargin=8 * mm,
        bottomMargin=8 * mm,
    )
    W = A4[0] - 20 * mm  # 190mm usable width

    # Colors
    BLACK       = colors.black
    DARK_TEXT   = colors.HexColor("#111827")
    MUTED_TEXT  = colors.HexColor("#4b5563")
    BORDER_CLR  = colors.HexColor("#374151")
    LIGHT_BG    = colors.HexColor("#f9fafb")
    WHITE       = colors.white

    styles = getSampleStyleSheet()

    def style(name="Normal", **kwargs):
        return ParagraphStyle(name, parent=styles["Normal"], **kwargs)

    elements = []

    # ── 1. TOP HEADER: BRAND LOGO (Left) | COMPANY TITLE (Center) | QR CODE (Right)
    logo_flowable = create_logo_flowable(company_logo, company_name)
    qr_flowable   = create_qr_code_flowable(qr_data, size=54)

    center_header_html = (
        f'<font size="16" color="#111827"><b>{company_name.upper()}</b></font><br/>'
        f'<font size="7" color="#374151">{company_address}</font><br/>'
        f'<font size="7" color="#374151"><b>Email/Contact:</b> {company_email} / {company_phone}</font><br/>'
        f'<font size="7.5" color="#111827"><b>GSTIN:</b> {company_gstin} &nbsp;|&nbsp; <b>State:</b> {state_name} ({state_code})</font>'
    )

    right_header_html = (
        f'<div align="right">'
        f'<font size="10" color="#111827"><b>Tax Invoice</b></font> &nbsp;&nbsp;&nbsp; '
        f'<font size="9" color="#4b5563"><b>e-Invoice</b></font>'
        f'</div>'
    )

    right_col_table = Table(
        [[Paragraph(right_header_html, style("rh", alignment=TA_RIGHT, leading=12))],
         [qr_flowable]],
        colWidths=[52 * mm]
    )
    right_col_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    top_banner_table = Table(
        [[logo_flowable, Paragraph(center_header_html, style("ch", alignment=TA_CENTER, leading=11)), right_col_table]],
        colWidths=[28 * mm, 110 * mm, 52 * mm]
    )
    top_banner_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (0, 0), "LEFT"),
        ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ("ALIGN", (2, 0), (2, 0), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(top_banner_table)
    elements.append(Spacer(1, 4))

    # ── 2. IRN & ACKNOWLEDGEMENT DETAIL STRIP ─────────────────────────────────
    irn_html = (
        f'<font size="7" color="#111827"><b>IRN :</b> {irn_hash}</font><br/>'
        f'<font size="7" color="#111827"><b>Ack No. :</b> {ack_no} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <b>Ack Date :</b> {ack_date}</font>'
    )
    irn_table = Table([[Paragraph(irn_html, style("irn", leading=9))]], colWidths=[W])
    irn_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
    ]))
    elements.append(irn_table)

    # ── 3. DUAL BOX: BUYER / BILLED TO & CONSIGNEE / SHIPPED TO ───────────────
    buyer_box_html = (
        f'<font size="7.5" color="#4b5563"><b>Details of Buyer / Billed To</b></font><br/>'
        f'<font size="9.5" color="#111827"><b>{party}</b></font><br/>'
        f'<font size="7" color="#374151">DEU APARTMENT ,<br/>'
        f'SHOP NO 4, KHET UPPER VILLEGE, THANE WEST<br/>'
        f'<b>State Name :</b> Maharashtra , <b>Code :</b> 27<br/>'
        f'<b>GSTIN/UIN :</b> {buyer_gstin}<br/>'
        f'<b>ORDER NO. :</b> PO-9912 &nbsp;&nbsp;&nbsp;&nbsp; <b>Dated :</b> {today_str}<br/>'
        f'<b>Dispatched through :</b> Road Transport &nbsp;&nbsp;&nbsp;&nbsp; <b>Destination :</b> THANE<br/>'
        f'<b>Reference No. & Date :</b> REF-{abs(hash(inv_number)) % 10000}</font>'
    )

    consignee_box_html = (
        f'<font size="7.5" color="#4b5563"><b>Detail of Consignee / Shipped To</b></font><br/>'
        f'<font size="9.5" color="#111827"><b>{party}</b></font><br/>'
        f'<font size="7" color="#374151">DEU APARTMENT ,<br/>'
        f'SHOP NO 4, KHET UPPER VILLEGE, THANE WEST<br/>'
        f'<b>State Name :</b> Maharashtra , <b>Code :</b> 27<br/>'
        f'<b>GSTIN/UIN :</b> {buyer_gstin}<br/>'
        f'<b>BILL NO. :</b> <font color="#111827"><b>{inv_number}</b></font> &nbsp;&nbsp;&nbsp;&nbsp; <b>Dated :</b> {due_str}<br/>'
        f'<b>Delivery Note :</b> DN-0570 &nbsp;&nbsp;&nbsp;&nbsp; <b>Delivery Note Date :</b> {today_str}<br/>'
        f'<b>Dispatch Doc No. :</b> DOC-{abs(hash(inv_number)) % 9999} &nbsp;&nbsp;&nbsp;&nbsp; <b>CREDIT DAYS :</b> 30 Days</font>'
    )

    dual_box_table = Table(
        [[Paragraph(buyer_box_html, style("bb", leading=9)),
          Paragraph(consignee_box_html, style("cb", leading=9))]],
        colWidths=[W * 0.50, W * 0.50]
    )
    dual_box_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(dual_box_table)

    # ── 4. GST ITEM PARTICULARS TABLE ─────────────────────────────────────────
    # Subtotal and tax calculations
    taxable_val = round(amount / 1.05, 2)  # 5% IGST standard for materials or 18%
    igst_val    = round(amount - taxable_val, 2)
    round_off   = round(amount - (taxable_val + igst_val), 2)

    item_headers = [
        Paragraph('<b>Sl<br/>No.</b>', style("th", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Description of Goods</b>', style("th", alignment=TA_LEFT, fontSize=7, leading=8)),
        Paragraph('<b>HSN/SAC</b>', style("th", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Truck<br/>No.</b>', style("th", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Challan<br/>No.</b>', style("th", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Challan<br/>Date</b>', style("th", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Site</b>', style("th", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Quantity</b>', style("th", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Rate</b>', style("th", alignment=TA_RIGHT, fontSize=7, leading=8)),
        Paragraph('<b>per</b>', style("th", alignment=TA_CENTER, fontSize=7, leading=8)),
        Paragraph('<b>Amount</b>', style("th", alignment=TA_RIGHT, fontSize=7, leading=8)),
    ]

    item_rows = [item_headers]

    if line_items:
        for idx, itm in enumerate(line_items, 1):
            item_rows.append([
                Paragraph(str(idx), style("td", alignment=TA_CENTER, fontSize=7.5)),
                Paragraph(f"<b>{itm.get('name', 'SAND')}</b>", style("td", fontSize=7.5)),
                Paragraph(str(itm.get("hsn", "25051011")), style("td", alignment=TA_CENTER, fontSize=7.5)),
                Paragraph("MH04-1234", style("td", alignment=TA_CENTER, fontSize=7)),
                Paragraph("10199", style("td", alignment=TA_CENTER, fontSize=7)),
                Paragraph(today_str, style("td", alignment=TA_CENTER, fontSize=7)),
                Paragraph("THANE", style("td", alignment=TA_CENTER, fontSize=7)),
                Paragraph(f"<b>{itm.get('qty', '776 BAGS')}</b>", style("td", alignment=TA_CENTER, fontSize=7.5)),
                Paragraph(f"{float(itm.get('rate', 92.0)):,.2f}", style("td", alignment=TA_RIGHT, fontSize=7.5)),
                Paragraph("BAGS", style("td", alignment=TA_CENTER, fontSize=7)),
                Paragraph(f"<b>{float(itm.get('amount', taxable_val)):,.2f}</b>", style("td", alignment=TA_RIGHT, fontSize=7.5)),
            ])
    else:
        item_rows.append([
            Paragraph("1", style("td", alignment=TA_CENTER, fontSize=7.5)),
            Paragraph(f"<b>SAND & READY PLAST MATERIAL</b>", style("td", fontSize=7.5)),
            Paragraph("25051011", style("td", alignment=TA_CENTER, fontSize=7.5)),
            Paragraph("MH04-4550", style("td", alignment=TA_CENTER, fontSize=7)),
            Paragraph("10199", style("td", alignment=TA_CENTER, fontSize=7)),
            Paragraph(today_str, style("td", alignment=TA_CENTER, fontSize=7)),
            Paragraph("THANE", style("td", alignment=TA_CENTER, fontSize=7)),
            Paragraph("<b>776 BAGS</b>", style("td", alignment=TA_CENTER, fontSize=7.5)),
            Paragraph("92.00", style("td", alignment=TA_RIGHT, fontSize=7.5)),
            Paragraph("BAGS", style("td", alignment=TA_CENTER, fontSize=7)),
            Paragraph(f"<b>{taxable_val:,.2f}</b>", style("td", alignment=TA_RIGHT, fontSize=7.5)),
        ])

    # Tax Subtotal rows
    item_rows.append([
        "", Paragraph("<b>OUTPUT IGST (5%)</b>", style("td", fontSize=7.5)), "", "", "", "", "", "", "", "",
        Paragraph(f"{igst_val:,.2f}", style("td", alignment=TA_RIGHT, fontSize=7.5))
    ])
    if abs(round_off) > 0:
        item_rows.append([
            "", Paragraph("<b>ROUND OFF</b>", style("td", fontSize=7.5)), "", "", "", "", "", "", "", "",
            Paragraph(f"{round_off:,.2f}", style("td", alignment=TA_RIGHT, fontSize=7.5))
        ])

    # Total Row
    item_rows.append([
        "", Paragraph("<b>Total</b>", style("td", fontSize=8)), "", "", "", "", "",
        Paragraph("<b>776 BAGS</b>", style("td", alignment=TA_CENTER, fontSize=8)), "", "",
        Paragraph(f"<b>\u20b9 {amount:,.2f}</b>", style("td", alignment=TA_RIGHT, fontSize=8.5, fontName="Helvetica-Bold"))
    ])

    col_w = [8 * mm, 42 * mm, 16 * mm, 16 * mm, 14 * mm, 16 * mm, 14 * mm, 18 * mm, 14 * mm, 10 * mm, 22 * mm]
    item_table = Table(item_rows, colWidths=col_w)
    item_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ("INNERGRID", (0, 0), (-1, 0), 0.5, BORDER_CLR),
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT_BG),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, BORDER_CLR),
        ("LINEABOVE", (0, -1), (-1, -1), 0.5, BORDER_CLR),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(item_table)

    # ── 5. AMOUNT IN WORDS & E. & O.E ─────────────────────────────────────────
    words_val = num_to_words_inr(amount)
    words_html = f'<font size="7.5">Amount Chargeable (in words):<br/><b>{words_val}</b></font>'
    words_table = Table(
        [[Paragraph(words_html, style("w", leading=10)),
          Paragraph('<font size="7.5"><b>E. & O.E</b></font>', style("e", alignment=TA_RIGHT))]],
        colWidths=[W * 0.85, W * 0.15]
    )
    words_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(words_table)

    # ── 6. HSN/SAC TAX SCHEDULE BREAKDOWN TABLE ───────────────────────────────
    tax_sched_headers = [
        Paragraph('<b>HSN/SAC</b>', style("th", alignment=TA_CENTER, fontSize=7)),
        Paragraph('<b>Taxable Value</b>', style("th", alignment=TA_RIGHT, fontSize=7)),
        Paragraph('<b>IGST Rate</b>', style("th", alignment=TA_CENTER, fontSize=7)),
        Paragraph('<b>IGST Amount</b>', style("th", alignment=TA_RIGHT, fontSize=7)),
        Paragraph('<b>Total Tax Amount</b>', style("th", alignment=TA_RIGHT, fontSize=7)),
    ]

    tax_sched_rows = [
        tax_sched_headers,
        [
            Paragraph("25051011", style("td", alignment=TA_CENTER, fontSize=7)),
            Paragraph(f"{taxable_val:,.2f}", style("td", alignment=TA_RIGHT, fontSize=7)),
            Paragraph("5%", style("td", alignment=TA_CENTER, fontSize=7)),
            Paragraph(f"{igst_val:,.2f}", style("td", alignment=TA_RIGHT, fontSize=7)),
            Paragraph(f"{igst_val:,.2f}", style("td", alignment=TA_RIGHT, fontSize=7)),
        ],
        [
            Paragraph("<b>Total</b>", style("td", alignment=TA_CENTER, fontSize=7.5)),
            Paragraph(f"<b>{taxable_val:,.2f}</b>", style("td", alignment=TA_RIGHT, fontSize=7.5)),
            Paragraph("", style("td", fontSize=7)),
            Paragraph(f"<b>{igst_val:,.2f}</b>", style("td", alignment=TA_RIGHT, fontSize=7.5)),
            Paragraph(f"<b>{igst_val:,.2f}</b>", style("td", alignment=TA_RIGHT, fontSize=7.5)),
        ]
    ]

    sched_table = Table(tax_sched_rows, colWidths=[W * 0.22, W * 0.20, W * 0.16, W * 0.20, W * 0.22])
    sched_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT_BG),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(sched_table)

    # Tax Amount in Words
    tax_words = num_to_words_inr(igst_val)
    tax_words_html = f'<font size="7">Tax Amount (in words) : <b>{tax_words}</b></font>'
    tw_table = Table([[Paragraph(tax_words_html, style("tw", leading=8))]], colWidths=[W])
    tw_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(tw_table)

    # ── 7. TERMS & CONDITIONS, DECLARATION & AUTHORIZED SIGNATORY ─────────────
    left_bottom_html = (
        f'<font size="7" color="#111827"><b>Company\'s GSTIN/UIN :</b> {company_gstin} &nbsp;|&nbsp; <b>State :</b> {state_name} , <b>Code :</b> {state_code}</font><br/>'
        f'<font size="6.5" color="#111827"><b>TERMS & CONDITIONS</b><br/>'
        f'• {footer_notes}<br/>'
        f'• All Cheque and Remittance To Be Made / Payable to <b>"{company_name}"</b><br/>'
        f'• <b>UDYAM REG.:-</b> {company_udyam}</font>'
    )

    right_bottom_html = (
        f'<font size="6.5" color="#374151"><b>Declaration:</b><br/>'
        f'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</font><br/><br/>'
        f'<table width="100%">'
        f'<tr>'
        f'<td align="left"><font size="7"><b>Customer Sign</b></font></td>'
        f'<td align="right"><font size="7">For <b>{company_name}</b><br/><br/><br/><b>Authorised Signatory</b></font></td>'
        f'</tr>'
        f'</table>'
    )

    bottom_table = Table(
        [[Paragraph(left_bottom_html, style("lbl", leading=8)),
          Paragraph(right_bottom_html, style("rbl", leading=8))]],
        colWidths=[W * 0.55, W * 0.45]
    )
    bottom_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(bottom_table)

    # ── 8. JURISDICTION FOOTER ────────────────────────────────────────────────
    footer_text = f'<font size="6.5" color="#4b5563"><b>SUBJECT TO {jurisdiction} JURISDICTION</b><br/>This is a Computer Generated Invoice</font>'
    elements.append(Paragraph(footer_text, style("ftr", alignment=TA_CENTER, leading=8)))

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


def generate_and_upload_invoice(voucher: dict, org_profile: dict | None = None) -> tuple:
    """
    Generate PDF from voucher data and prepare base64 / cloud URL.
    Returns (public_url, pdf_base64). Entirely non-fatal.
    """
    try:
        inv_number = voucher.get("invoice_number", f"INV-{int(time.time())}")
        log.info(f"  [Invoice PDF] Generating for {inv_number}...")
        pdf_bytes = generate_invoice_pdf(voucher, org_profile)
        if not pdf_bytes:
            log.info("  [Invoice PDF] Skipped (reportlab not installed)")
            return None, None

        pdf_b64 = base64.b64encode(pdf_bytes).decode('utf-8')
        url = upload_pdf_to_supabase(pdf_bytes, inv_number)
        return url, pdf_b64
    except Exception as e:
        log.warning(f"  [Invoice PDF] Non-fatal notice: {e}")
        return None, None


def push_to_cloud(vouchers):
    """
    1. Generate a real PDF invoice for each Tally voucher using reportlab.
    2. Attach pdf_base64 and pdf_url to payload.
    3. Push the enriched payload to the cloud Netlify endpoint.
    """
    org_profile = fetch_org_profile()
    enriched = []
    for v in vouchers:
        pdf_url, pdf_b64 = generate_and_upload_invoice(v, org_profile)
        enriched.append({
            **v,
            "pdf_url": pdf_url,
            "pdf_base64": pdf_b64,
        })

    payload = {
        "organizationId": ORGANIZATION_ID,
        "timestamp": datetime.now().isoformat(),
        "connectorStatus": "Connected",
        "sourceParsed": True,
        "companyName": org_profile.get("org_name", "TallyPrime Live"),
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
