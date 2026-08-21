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


def generate_invoice_pdf(voucher: dict) -> bytes | None:
    """
    Generate a professional A4 PDF invoice from Tally voucher data.
    Returns PDF bytes on success, or None if reportlab is not installed.

    This PDF contains the ACTUAL data from Tally:
      - Invoice/Voucher number
      - Party name (client)
      - Amount (from Tally closing balance / amount field)
      - Invoice date and due date
      - GST/GSTIN if available
      - Line items if parsed by the multi-strategy parser
    """
    if not REPORTLAB_AVAILABLE:
        return None

    inv_number  = voucher.get("invoice_number", "N/A")
    party       = voucher.get("ledger_name", "Valued Customer")
    amount      = voucher.get("amount", 0)
    due_date    = voucher.get("due_date", datetime.now().strftime("%Y-%m-%d"))
    status      = voucher.get("status", "Pending")
    phone       = voucher.get("phone", "")
    gstin       = voucher.get("gstin", "")
    # Line items — tally-sync may pass these in future; gracefully omit if absent
    line_items  = voucher.get("line_items", [])  # [{name, qty, rate, amount}]

    today_str = datetime.now().strftime("%d %b %Y")
    due_str   = due_date  # already formatted as YYYY-MM-DD
    try:
        due_str = datetime.strptime(due_date, "%Y-%m-%d").strftime("%d %b %Y")
    except Exception:
        pass

    # --- Build PDF in memory ---
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    W = A4[0] - 36 * mm  # usable width

    # Color palette
    INDIGO   = colors.HexColor("#4f46e5")
    DARK     = colors.HexColor("#1e293b")
    MUTED    = colors.HexColor("#64748b")
    LIGHT_BG = colors.HexColor("#f8fafc")
    RED      = colors.HexColor("#ef4444")
    AMBER    = colors.HexColor("#f59e0b")
    WHITE    = colors.white
    status_color = RED if status == "Overdue" else AMBER

    styles = getSampleStyleSheet()

    def style(name="Normal", **kwargs):
        s = ParagraphStyle(name, parent=styles["Normal"], **kwargs)
        return s

    elements = []

    # ── Header: Company + Invoice label ──────────────────────────────────────
    header_data = [
        [
            Paragraph(
                '<font color="#4f46e5" size="22"><b>TAX INVOICE</b></font><br/>'
                '<font color="#64748b" size="10">Original Copy</font>',
                style("hdr", leading=26)
            ),
            Paragraph(
                f'<font color="#1e293b" size="11"><b>Invoice No:</b> {inv_number}</font><br/>'
                f'<font color="#64748b" size="9">Date: {today_str}</font><br/>'
                f'<font color="#64748b" size="9">Due: {due_str}</font>',
                style("hdr2", alignment=TA_RIGHT, leading=18)
            ),
        ]
    ]
    header_table = Table(header_data, colWidths=[W * 0.55, W * 0.45])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(header_table)
    elements.append(HRFlowable(width="100%", thickness=2, color=INDIGO, spaceAfter=8))

    # ── Bill To + Status ─────────────────────────────────────────────────────
    bill_data = [
        [
            Paragraph(
                f'<font color="#64748b" size="8"><b>BILL TO</b></font><br/>'
                f'<font color="#1e293b" size="13"><b>{party}</b></font>'
                + (f'<br/><font color="#64748b" size="9">Phone: {phone}</font>' if phone else "")
                + (f'<br/><font color="#64748b" size="9">GSTIN: {gstin}</font>' if gstin else ""),
                style("bt", leading=18)
            ),
            Paragraph(
                f'<font size="9" color="#64748b">Status</font><br/>'
                f'<font size="14" color="{status_color.hexval()}"><b>{status.upper()}</b></font>',
                style("st", alignment=TA_RIGHT, leading=20)
            ),
        ]
    ]
    bill_table = Table(bill_data, colWidths=[W * 0.65, W * 0.35])
    bill_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (0, -1), 12),
        ("RIGHTPADDING", (-1, 0), (-1, -1), 12),
        ("ROUNDEDCORNERS", [4]),
    ]))
    elements.append(bill_table)
    elements.append(Spacer(1, 10))

    # ── Line Items Table (if available from Tally) ────────────────────────────
    if line_items:
        li_header = [["#", "Description", "Qty", "Rate", "Amount"]]
        li_rows = []
        for i, item in enumerate(line_items, 1):
            li_rows.append([
                str(i),
                item.get("name", "Item"),
                str(item.get("qty", 1)),
                FMT_AMOUNT(item.get("rate", 0)),
                FMT_AMOUNT(item.get("amount", 0)),
            ])
        li_data = li_header + li_rows
        col_widths = [8 * mm, W * 0.44, 18 * mm, 28 * mm, 30 * mm]
        li_table = Table(li_data, colWidths=col_widths, repeatRows=1)
        li_table.setStyle(TableStyle([
            # Header
            ("BACKGROUND", (0, 0), (-1, 0), DARK),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
            ("TOPPADDING", (0, 0), (-1, 0), 7),
            # Data rows
            ("FONTSIZE", (0, 1), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
            ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e2e8f0")),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
            ("TOPPADDING", (0, 1), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(li_table)
        elements.append(Spacer(1, 8))

    # ── Amount Summary ────────────────────────────────────────────────────────
    amt_data = [
        ["Subtotal", FMT_AMOUNT(amount)],
    ]
    gst_amount = round(float(amount) * 0.18, 2)
    base_amount = round(float(amount) - gst_amount, 2)
    # If we have GST context, show breakdown
    if voucher.get("has_gst", False):
        amt_data = [
            ["Taxable Value", FMT_AMOUNT(base_amount)],
            ["GST @ 18%",    FMT_AMOUNT(gst_amount)],
        ]
    amt_data.append([
        Paragraph('<b>TOTAL AMOUNT DUE</b>', style("tot", fontName="Helvetica-Bold", fontSize=11)),
        Paragraph(f'<font color="#4f46e5"><b>{FMT_AMOUNT(amount)}</b></font>',
                  style("totamt", fontName="Helvetica-Bold", fontSize=13, alignment=TA_RIGHT)),
    ])

    amt_table_data = [[Paragraph('<b>Description</b>', style("h", fontSize=9, fontName="Helvetica-Bold")),
                       Paragraph('<b>Amount</b>', style("h2", fontSize=9, fontName="Helvetica-Bold", alignment=TA_RIGHT))]]
    for row in amt_data:
        amt_table_data.append(row)

    col_w = [W * 0.72, W * 0.28]
    full_amt_table = Table(amt_table_data, colWidths=col_w)
    full_amt_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTSIZE", (0, 0), (-1, -2), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("LINEBELOW", (0, -2), (-1, -2), 1, colors.HexColor("#e2e8f0")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#eff6ff")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    elements.append(full_amt_table)
    elements.append(Spacer(1, 14))

    # ── Footer ────────────────────────────────────────────────────────────────
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0"), spaceAfter=6))
    elements.append(Paragraph(
        '<font color="#64748b" size="8">This is a computer-generated invoice from TallyPrime. '
        'Please settle the outstanding amount by the due date. For queries, contact our accounts team.</font>',
        style("footer", alignment=TA_CENTER, leading=12)
    ))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(
        f'<font color="#4f46e5" size="8"><b>Generated by ERPPro CRM</b></font> '
        f'<font color="#94a3b8" size="8">· {today_str}</font>',
        style("brand", alignment=TA_CENTER)
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


def generate_and_upload_invoice(voucher: dict) -> tuple:
    """
    Generate PDF from voucher data and prepare base64 / cloud URL.
    Returns (public_url, pdf_base64). Entirely non-fatal.
    """
    try:
        inv_number = voucher.get("invoice_number", f"INV-{int(time.time())}")
        log.info(f"  [Invoice PDF] Generating for {inv_number}...")
        pdf_bytes = generate_invoice_pdf(voucher)
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
    enriched = []
    for v in vouchers:
        pdf_url, pdf_b64 = generate_and_upload_invoice(v)
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
        "companyName": "TallyPrime Live",
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
