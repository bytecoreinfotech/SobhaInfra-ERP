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
from datetime import datetime, timedelta

# Check if reportlab is available
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
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
# ==============================================================================

FMT_AMOUNT = lambda n: f"\u20b9{float(n):,.2f}"  # ₹ symbol
FMT_DATE   = lambda d: datetime.strptime(d, "%Y%m%d").strftime("%d %b %Y") if d and len(d) == 8 else (d or "N/A")

_CACHED_ORG_PROFILE = None

def fetch_org_profile() -> dict:
    """
    Fetch the live business organization profile from Supabase org_settings table.
    Ensures company name, address, GSTIN, phone, email, and footer notes set in
    the SuperAdmin General Settings appear dynamically on the generated invoice.
    """
    global _CACHED_ORG_PROFILE
    if _CACHED_ORG_PROFILE:
        return _CACHED_ORG_PROFILE

    profile = {
        "org_name": os.environ.get("COMPANY_NAME", "Techma ERP Solutions Pvt. Ltd."),
        "admin_email": "admin@erppro.in",
        "contact_phone": "+91 98765 43210",
        "company_address": "101, Business Hub, Phase 1, Hinjawadi, Pune - 411057",
        "gstin_number": "27AABCT2345Q1Z8",
        "invoice_footer_notes": "Thank you for your business. For any queries, contact accounts team.",
        "default_currency": "INR",
        "bank_name": "HDFC Bank Ltd.",
        "bank_account_no": "50200088991122",
        "bank_ifsc": "HDFC0001234",
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


def num_to_words_inr(num: float) -> str:
    """Converts numeric amount to formal Indian currency words (e.g. INR Forty-Five Thousand Only)."""
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
    Generate an ultra-clean, executive corporate A4 PDF invoice from Tally voucher data.
    Styled with a minimalist, professional monochrome palette with full company branding
    from the SuperAdmin General Settings.
    """
    if not REPORTLAB_AVAILABLE:
        return None

    if not org_profile:
        org_profile = fetch_org_profile()

    inv_number  = voucher.get("invoice_number", "N/A")
    party       = voucher.get("ledger_name", "Valued Client")
    amount      = float(voucher.get("amount", 0))
    due_date    = voucher.get("due_date", datetime.now().strftime("%Y-%m-%d"))
    status      = voucher.get("status", "Pending")
    phone       = voucher.get("phone", "")
    gstin       = voucher.get("gstin", "")
    voucher_type= voucher.get("voucher_type", "Sales Invoice")
    line_items  = voucher.get("line_items", [])

    today_str = datetime.now().strftime("%d %b %Y")
    due_str   = due_date
    try:
        due_str = datetime.strptime(due_date, "%Y-%m-%d").strftime("%d %b %Y")
    except Exception:
        pass

    # Business profile from General Settings
    company_name    = org_profile.get("org_name", "Techma ERP Solutions Pvt. Ltd.")
    company_address = org_profile.get("company_address", "101, Business Hub, Phase 1, Hinjawadi, Pune - 411057")
    company_phone   = org_profile.get("contact_phone", "+91 98765 43210")
    company_email   = org_profile.get("admin_email", "accounts@erppro.in")
    company_gstin   = org_profile.get("gstin_number", "27AABCT2345Q1Z8")
    footer_notes    = org_profile.get("invoice_footer_notes", "Thank you for your business. For any payment queries, contact our accounts team.")
    bank_name       = org_profile.get("bank_name", "HDFC Bank Ltd.")
    bank_ac         = org_profile.get("bank_account_no", "50200088991122")
    bank_ifsc       = org_profile.get("bank_ifsc", "HDFC0001234")

    # --- Build PDF in memory ---
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )
    W = A4[0] - 28 * mm  # 182mm usable width

    # Executive Monochrome Corporate Palette
    SLATE_900   = colors.HexColor("#0f172a")  # Deep charcoal header
    SLATE_800   = colors.HexColor("#1e293b")  # Table header
    SLATE_700   = colors.HexColor("#334155")  # Dark body text
    SLATE_500   = colors.HexColor("#64748b")  # Muted captions & labels
    SLATE_200   = colors.HexColor("#e2e8f0")  # Grid lines & subtle borders
    BG_LIGHT    = colors.HexColor("#f8fafc")  # Subtle background fill
    WHITE       = colors.white

    styles = getSampleStyleSheet()

    def style(name="Normal", **kwargs):
        return ParagraphStyle(name, parent=styles["Normal"], **kwargs)

    elements = []

    # ── SECTION 1: TOP HEADER (Seller Branding & Tax Invoice Metadata) ────────
    seller_html = (
        f'<font color="#0f172a" size="14"><b>{company_name}</b></font><br/>'
        f'<font color="#475569" size="8">{company_address}</font><br/>'
        f'<font color="#475569" size="8"><b>GSTIN:</b> {company_gstin} &nbsp;|&nbsp; <b>Phone:</b> {company_phone}</font><br/>'
        f'<font color="#475569" size="8"><b>Email:</b> {company_email}</font>'
    )

    inv_meta_html = (
        f'<font color="#0f172a" size="16"><b>TAX INVOICE</b></font><br/>'
        f'<font color="#64748b" size="8">ORIGINAL FOR RECIPIENT</font><br/>'
        f'<font color="#1e293b" size="9"><b>Invoice No:</b> {inv_number}</font><br/>'
        f'<font color="#475569" size="8"><b>Date:</b> {today_str}</font><br/>'
        f'<font color="#475569" size="8"><b>Due Date:</b> {due_str}</font>'
    )

    header_table = Table(
        [[Paragraph(seller_html, style("hdr_seller", leading=12)),
          Paragraph(inv_meta_html, style("hdr_meta", alignment=TA_RIGHT, leading=13))]],
        colWidths=[W * 0.60, W * 0.40]
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(header_table)
    elements.append(HRFlowable(width="100%", thickness=1.5, color=SLATE_900, spaceAfter=8, spaceBefore=4))

    # ── SECTION 2: BILLED TO / BUYER DETAILS & VOUCHER TYPE ───────────────────
    buyer_html = (
        f'<font color="#64748b" size="7.5"><b>BILLED TO / BUYER:</b></font><br/>'
        f'<font color="#0f172a" size="11"><b>{party}</b></font><br/>'
        + (f'<font color="#475569" size="8"><b>Phone:</b> {phone}</font><br/>' if phone else '')
        + (f'<font color="#475569" size="8"><b>GSTIN:</b> {gstin}</font><br/>' if gstin else '')
        + f'<font color="#64748b" size="7.5">Place of Supply: State Jurisdiction</font>'
    )

    summary_box_html = (
        f'<font color="#64748b" size="7.5"><b>VOUCHER DETAILS:</b></font><br/>'
        f'<font color="#1e293b" size="8.5"><b>Voucher Type:</b> {voucher_type}</font><br/>'
        f'<font color="#1e293b" size="8.5"><b>Payment Status:</b> {status.upper()}</font><br/>'
        f'<font color="#64748b" size="7.5"><b>Accounting Source:</b> TallyPrime Live</font>'
    )

    bill_table = Table(
        [[Paragraph(buyer_html, style("b_buyer", leading=11)),
          Paragraph(summary_box_html, style("b_sum", leading=11))]],
        colWidths=[W * 0.62, W * 0.38]
    )
    bill_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), BG_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.5, SLATE_200),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(bill_table)
    elements.append(Spacer(1, 8))

    # ── SECTION 3: LINE ITEMS / PARTICULARS TABLE ─────────────────────────────
    # Professional dark header with crisp white text
    table_headers = [
        Paragraph('<b>#</b>', style("th", alignment=TA_CENTER, textColor=WHITE, fontSize=8)),
        Paragraph('<b>Description of Goods / Services</b>', style("th2", textColor=WHITE, fontSize=8)),
        Paragraph('<b>HSN/SAC</b>', style("th3", alignment=TA_CENTER, textColor=WHITE, fontSize=8)),
        Paragraph('<b>Qty</b>', style("th4", alignment=TA_CENTER, textColor=WHITE, fontSize=8)),
        Paragraph('<b>Unit Rate (₹)</b>', style("th5", alignment=TA_RIGHT, textColor=WHITE, fontSize=8)),
        Paragraph('<b>Amount (₹)</b>', style("th6", alignment=TA_RIGHT, textColor=WHITE, fontSize=8)),
    ]

    table_rows = [table_headers]

    if line_items:
        for i, item in enumerate(line_items, 1):
            table_rows.append([
                Paragraph(str(i), style("td_c", alignment=TA_CENTER, fontSize=8)),
                Paragraph(f"<b>{item.get('name', 'Commercial Supply')}</b>", style("td_l", fontSize=8)),
                Paragraph(str(item.get("hsn", "9983")), style("td_c", alignment=TA_CENTER, fontSize=8)),
                Paragraph(str(item.get("qty", "1")), style("td_c", alignment=TA_CENTER, fontSize=8)),
                Paragraph(FMT_AMOUNT(item.get("rate", amount)), style("td_r", alignment=TA_RIGHT, fontSize=8)),
                Paragraph(FMT_AMOUNT(item.get("amount", amount)), style("td_r", alignment=TA_RIGHT, fontSize=8)),
            ])
    else:
        # Standard Ledger Voucher Item
        table_rows.append([
            Paragraph("1", style("td_c", alignment=TA_CENTER, fontSize=8)),
            Paragraph(f"<b>{voucher_type}</b> — Settlement for {party}", style("td_l", fontSize=8)),
            Paragraph("9983", style("td_c", alignment=TA_CENTER, fontSize=8)),
            Paragraph("1", style("td_c", alignment=TA_CENTER, fontSize=8)),
            Paragraph(FMT_AMOUNT(amount), style("td_r", alignment=TA_RIGHT, fontSize=8)),
            Paragraph(FMT_AMOUNT(amount), style("td_r", alignment=TA_RIGHT, fontSize=8)),
        ])

    col_widths = [10 * mm, W * 0.44, 18 * mm, 14 * mm, 26 * mm, 28 * mm]
    item_table = Table(table_rows, colWidths=col_widths, repeatRows=1)
    item_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SLATE_800),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, SLATE_200),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, BG_LIGHT]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(item_table)
    elements.append(Spacer(1, 6))

    # ── SECTION 4: TAX BREAKDOWN, TOTALS & BANK DETAILS ───────────────────────
    # Subtotal calculation
    taxable_val = round(amount / 1.18, 2) if voucher.get("has_gst", True) else amount
    cgst_val    = round((amount - taxable_val) / 2.0, 2) if voucher.get("has_gst", True) else 0.0
    sgst_val    = round((amount - taxable_val) / 2.0, 2) if voucher.get("has_gst", True) else 0.0

    words_text = num_to_words_inr(amount)

    bank_details_html = (
        f'<font color="#0f172a" size="8"><b>BANK REMITTANCE DETAILS:</b></font><br/>'
        f'<font color="#475569" size="7.5"><b>Bank Name:</b> {bank_name} &nbsp;|&nbsp; <b>A/C No:</b> {bank_ac}</font><br/>'
        f'<font color="#475569" size="7.5"><b>IFSC Code:</b> {bank_ifsc} &nbsp;|&nbsp; <b>Account Name:</b> {company_name}</font><br/>'
        f'<font color="#64748b" size="7"><i>Amount in Words:</i> <b>{words_text}</b></font>'
    )

    totals_rows = [
        [Paragraph("Taxable Subtotal", style("tot_l", fontSize=8)), Paragraph(FMT_AMOUNT(taxable_val), style("tot_r", alignment=TA_RIGHT, fontSize=8))],
        [Paragraph("CGST @ 9%", style("tot_l", fontSize=8)), Paragraph(FMT_AMOUNT(cgst_val), style("tot_r", alignment=TA_RIGHT, fontSize=8))],
        [Paragraph("SGST @ 9%", style("tot_l", fontSize=8)), Paragraph(FMT_AMOUNT(sgst_val), style("tot_r", alignment=TA_RIGHT, fontSize=8))],
        [Paragraph("<b>TOTAL AMOUNT DUE (₹)</b>", style("tot_lb", fontSize=9, fontName="Helvetica-Bold")),
         Paragraph(f"<b>{FMT_AMOUNT(amount)}</b>", style("tot_rb", alignment=TA_RIGHT, fontSize=10, fontName="Helvetica-Bold"))],
    ]

    totals_table = Table(totals_rows, colWidths=[W * 0.22, W * 0.18])
    totals_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, SLATE_200),
        ("BACKGROUND", (0, 0), (-1, -2), WHITE),
        ("BACKGROUND", (0, -1), (-1, -1), BG_LIGHT),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEABOVE", (0, -1), (-1, -1), 1, SLATE_900),
    ]))

    bottom_grid = Table(
        [[Paragraph(bank_details_html, style("bank_info", leading=11)), totals_table]],
        colWidths=[W * 0.58, W * 0.42]
    )
    bottom_grid.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(bottom_grid)
    elements.append(Spacer(1, 10))

    # ── SECTION 5: TERMS, SIGNATORY & FOOTER ──────────────────────────────────
    terms_html = (
        f'<font color="#64748b" size="7.5"><b>TERMS & CONDITIONS:</b></font><br/>'
        f'<font color="#64748b" size="7">{footer_notes}</font>'
    )

    signatory_html = (
        f'<font color="#64748b" size="7.5">For <b>{company_name}</b></font><br/><br/><br/>'
        f'<font color="#0f172a" size="7.5"><b>Authorized Signatory</b></font><br/>'
        f'<font color="#94a3b8" size="6.5">Digitally signed & authenticated</font>'
    )

    sign_table = Table(
        [[Paragraph(terms_html, style("t_terms", leading=9)),
          Paragraph(signatory_html, style("t_sign", alignment=TA_RIGHT, leading=9))]],
        colWidths=[W * 0.65, W * 0.35]
    )
    sign_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(sign_table)
    elements.append(Spacer(1, 6))

    elements.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_200, spaceAfter=4, spaceBefore=4))
    elements.append(Paragraph(
        f'<font color="#94a3b8" size="6.5">This is a computer-generated commercial tax invoice synchronized directly from TallyPrime. · Generated by {company_name} on {today_str}</font>',
        style("footer_brand", alignment=TA_CENTER)
    ))

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
