import io, os, hashlib, datetime, base64, math
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm, inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image, KeepTogether, HRFlowable
)
from reportlab.graphics.shapes import Drawing, Rect, String, Group, Polygon, Circle
from reportlab.graphics.barcode.qr import QrCodeWidget
import fitz

out_dir = r"C:\Users\abhay\.gemini\antigravity-ide\brain\265722d8-0b26-4a43-886f-1bfcd56a99df"

def create_sunburst_logo(initials="SG", size=68):
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
    g.add(String(bx + bw*0.16, by + bh*0.22, initials, fontName="Helvetica-Bold", fontSize=18, fillColor=colors.white))
    d.add(g)
    return d

def create_qr(data, size=65):
    try:
        qr = QrCodeWidget(data)
        b = qr.getBounds()
        w, h = b[2]-b[0], b[3]-b[1]
        d = Drawing(size, size, transform=[size/w, 0, 0, size/h, 0, 0])
        d.add(qr)
        return d
    except Exception as e:
        d = Drawing(size, size)
        d.add(Rect(0, 0, size, size, fillColor=colors.HexColor('#f8fafc'), strokeColor=colors.HexColor('#374151')))
        d.add(String(6, size/2-4, "QR CODE", fontName="Helvetica-Bold", fontSize=8))
        return d

def build_consignment_pdf(voucher=None, org_profile=None):
    if not voucher:
        voucher = {
            "invoice_number": "SRP/0570/26-27",
            "invoice_date": "10-Aug-26",
            "ack_date": "19-Aug-26",
            "irn": "a45684e7e4ef9d7c7c9b29e3cf08d0919d11d1df3db16-13f50f26c11e0e32e6c",
            "ack_no": "162625648066372",
            "amount": 74962.0,
            "taxable_amount": 71392.0,
            "igst_amount": 3569.60,
            "round_off": 0.40,
            "quantity_str": "776 BAGS",
            "rate": "92.00",
            "unit": "BAGS",
            "item_name": "SAND",
            "hsn_code": "25051011",
            "truck_no": "MH04-4550",
            "challan_no": "10199",
            "challan_date": "10-8-2026",
            "site": "THANE",
            "eway_bill_no": "602165786131",
            "eway_gen_date": "19-Aug-26 10:30 AM",
            "eway_valid_upto": "20-Aug-26 11:59 PM",
            "approx_distance": "176 KM",
            "transporter_name": "SHOBHA TRANSPORT",
        }

    company_name = "SHOBHA READY PLAST"
    factory_address = "Factory:Near Kolei Khadi Sarodhi, City/Village:Sarodhi, Valsad-396001, Gujrat."
    corp_office = "Corp.Office:-101, Shivam CHSL, Near Shivaji Mahajanwadi,Mira-Bhayandar Road,Mahajanwadi,Miraroad (E) Thane -401107"
    email_contact = "Email/Contact:-shobhareadyplast@gmail.com / 9876543210, 8888888888"
    company_gstin_str = "GSTIN:-24AGCPJ2785R1ZV , State Name : Gujarat, Code : 24"
    company_gstin = "24AGCPJ2785R1ZV"
    company_udyam = "UDYAM-GJ-01-0012345"

    buyer_name = "VAISHNAV CONSTRUCTION"
    buyer_addr_1 = "DEU APARTMENT ,"
    buyer_addr_2 = "SHOP NO 4, KOLShet UPPER VILLEGE, THANE WEST"
    buyer_state = "State Name : Maharashtra , Code : 27"
    buyer_gstin = "GSTIN/UIN : 27ALPRP4116L1ZM"

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=10 * mm,
        leftMargin=10 * mm,
        topMargin=8 * mm,
        bottomMargin=8 * mm,
    )
    W = A4[0] - 20 * mm # 190 mm (538.5 pt)

    styles = getSampleStyleSheet()
    def st(name="Normal", **kwargs):
        return ParagraphStyle(name, parent=styles["Normal"], **kwargs)

    elements = []

    # ═════════════════════════════════════════════════════════════════════════
    # PAGE 1: GST TAX INVOICE (Matching Client Original Layout)
    # ═════════════════════════════════════════════════════════════════════════

    # Top Company Header (Logo on Left, Center Details)
    logo_f = create_sunburst_logo("SG", size=68)
    hdr_html = (
        f'<font size="16" face="Times-Bold"><b>{company_name}</b></font><br/>'
        f'<font size="7.2">{factory_address}</font><br/>'
        f'<font size="6.8">{corp_office}</font><br/>'
        f'<font size="6.8">{email_contact}</font><br/>'
        f'<font size="7"><b>{company_gstin_str}</b></font>'
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

    # Titles Row: Tax Invoice (Center/Left) & e-Invoice + QR (Right)
    qr_f = create_qr(f"upi://pay?pa=shobhareadyplast@okhdfcbank&pn={company_name}&am=74962.00&cu=INR&tr={voucher['invoice_number']}", size=70)
    
    irn_html = (
        f'<b>Tax Invoice</b><br/><br/>'
        f'<b>IRN &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</b> {voucher["irn"]}<br/>'
        f'<b>Ack No. &nbsp;&nbsp;:</b> {voucher["ack_no"]}<br/>'
        f'<b>Ack Date :</b> {voucher["ack_date"]}'
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
        f'<font size="9.5"><b>{buyer_name}</b></font><br/>'
        f'<font size="8">{buyer_addr_1}</font><br/>'
        f'<font size="8">{buyer_addr_2}</font><br/>'
        f'<font size="8"><b>{buyer_state}</b></font><br/>'
        f'<font size="8"><b>{buyer_gstin}</b></font>'
    )
    consignee_text = (
        f'<font size="7.5" color="#4b5563">Detail of Consignee / Shipped To</font><br/>'
        f'<font size="9.5"><b>{buyer_name}</b></font><br/>'
        f'<font size="8">{buyer_addr_1}</font><br/>'
        f'<font size="8">{buyer_addr_2}</font><br/>'
        f'<font size="8"><b>{buyer_state}</b></font><br/>'
        f'<font size="8"><b>{buyer_gstin}</b></font>'
    )

    buyer_sub_tbl = Table([
        [Paragraph('ORDER NO.', st("st1", fontSize=7)), Paragraph('Dated', st("st1", fontSize=7))],
        [Paragraph('Dispatched through', st("st1", fontSize=7)), Paragraph('Destination', st("st1", fontSize=7))],
        [Paragraph('Reference No. & Date.', st("st1", fontSize=7)), Paragraph('Other References', st("st1", fontSize=7))],
    ], colWidths=[b_col_w * 0.5, b_col_w * 0.5])
    buyer_sub_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    consignee_sub_tbl = Table([
        [Paragraph(f'BILL NO.<br/><b>{voucher["invoice_number"]}</b>', st("st1", fontSize=7, leading=8)),
         Paragraph(f'Dated<br/><b>{voucher["invoice_date"]}</b>', st("st1", fontSize=7, leading=8))],
        [Paragraph('Delivery Note', st("st1", fontSize=7)), Paragraph('Delivery Note Date', st("st1", fontSize=7))],
        [Paragraph('Dispatch Doc No.', st("st1", fontSize=7)), Paragraph('CREDIT DAYS', st("st1", fontSize=7))],
    ], colWidths=[b_col_w * 0.5, b_col_w * 0.5])
    consignee_sub_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

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

    # Itemized Table
    it_w = [26, 88, 48, 56, 38, 52, 40, 52, 34, 36, 68] # Sum = 538 pt (190 mm)
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
        Paragraph(f'<b>{voucher["item_name"]}</b>', st("tc", fontSize=7.5)),
        Paragraph(voucher["hsn_code"], st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(voucher["truck_no"], st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(voucher["challan_no"], st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(voucher["challan_date"], st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(voucher["site"], st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(f'<b>{voucher["quantity_str"]}</b>', st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(voucher["rate"], st("tc", alignment=TA_RIGHT, fontSize=7.5)),
        Paragraph(voucher["unit"], st("tc", alignment=TA_CENTER, fontSize=7.5)),
        Paragraph(f'<b>{voucher["taxable_amount"]:,.2f}</b>', st("tc", alignment=TA_RIGHT, fontSize=7.5)),
    ]

    igst_p = Paragraph('<b>OUTPUT IGST<br/>ROUND OFF</b>', st("txl", alignment=TA_RIGHT, fontSize=7.5, leading=10))
    igst_v = Paragraph(f'<b>{voucher["igst_amount"]:,.2f}</b><br/>{voucher["round_off"]:,.2f}', st("txv", alignment=TA_RIGHT, fontSize=7.5, leading=10))

    it_mid_row = [
        "", igst_p, "", "", "", "", "", "", "", "", igst_v
    ]

    total_row = [
        "", Paragraph('<b>Total</b>', st("tot", alignment=TA_RIGHT, fontSize=8)),
        "", "", "", "", "",
        Paragraph(f'<b>{voucher["quantity_str"]}</b>', st("tot", alignment=TA_CENTER, fontSize=8)),
        "", "",
        Paragraph(f'<b>{voucher["amount"]:,.2f}</b>', st("tot", alignment=TA_RIGHT, fontSize=8.5)),
    ]

    it_tbl = Table([it_headers, it_row_1, it_mid_row, total_row], colWidths=it_w)
    it_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("SPAN", (1, 2), (9, 2)), # span middle tax labels
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
    ]))
    elements.append(it_tbl)

    # Words strip
    w_tbl = Table([
        [Paragraph('Amount Chargeable (in words):', st("w1", fontSize=7)), Paragraph('<b>E. & O.E</b>', st("eoe", alignment=TA_RIGHT, fontSize=7.5))],
        [Paragraph('<b>INR Seventy Four Thousand Nine Hundred Sixty Two Only</b>', st("w2", fontSize=8)), ""]
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
        [Paragraph(voucher["hsn_code"], st("ht", fontSize=7.5, alignment=TA_LEFT)),
         Paragraph(f'{voucher["taxable_amount"]:,.2f}', st("ht", fontSize=7.5, alignment=TA_RIGHT)),
         Paragraph('5%', st("ht", fontSize=7.5, alignment=TA_CENTER)),
         Paragraph(f'{voucher["igst_amount"]:,.2f}', st("ht", fontSize=7.5, alignment=TA_RIGHT)),
         Paragraph(f'{voucher["igst_amount"]:,.2f}', st("ht", fontSize=7.5, alignment=TA_RIGHT))],
        [Paragraph('<b>Total</b>', st("ht", fontSize=7.5, alignment=TA_RIGHT)),
         Paragraph(f'<b>{voucher["taxable_amount"]:,.2f}</b>', st("ht", fontSize=7.5, alignment=TA_RIGHT)),
         "",
         Paragraph(f'<b>{voucher["igst_amount"]:,.2f}</b>', st("ht", fontSize=7.5, alignment=TA_RIGHT)),
         Paragraph(f'<b>{voucher["igst_amount"]:,.2f}</b>', st("ht", fontSize=7.5, alignment=TA_RIGHT))]
    ], colWidths=hsn_w)
    hsn_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
    ]))
    elements.append(hsn_tbl)

    # Tax Amount in words
    tax_w_p = Paragraph('Tax Amount (in words) : <b>INR Three Thousand Five Hundred Sixty Nine and Sixty paise Only</b>', st("tw", fontSize=7.5))
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
        f'<b>State &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: Gujarat , Code : 24</b><br/>'
        f'<b>TERMS & CONDITIONS</b><br/>'
        f'• Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days.<br/>'
        f'• Goods Once Sold Will Not Be Taken Back.<br/>'
        f'• All Cheque and Remittance To Be Made / Payable to "Shobha Ready Plast"<br/>'
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
        '<font size="7" color="#4b5563">SUBJECT TO THANE JURISDICTION<br/>This is a Computer Generated Invoice</font><br/>'
        '<font size="7">1</font>'
    )
    elements.append(Spacer(1, 2))
    elements.append(Paragraph(p1_foot, st("ft1", alignment=TA_CENTER, leading=8)))


    # ═════════════════════════════════════════════════════════════════════════
    # PAGE 2: STANDARD E-WAY BILL (Matching Client Original Layout)
    # ═════════════════════════════════════════════════════════════════════════
    elements.append(PageBreak())

    ew_qr = create_qr(f"https://ewaybillgst.gov.in/view/{voucher['eway_bill_no']}", size=60)
    
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

    # Metadata lines
    ew_meta_html = (
        f'<b>Doc No. &nbsp;:</b> Tax Invoice - {voucher["invoice_number"]}<br/>'
        f'<b>Date &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</b> {voucher["invoice_date"]}<br/><br/>'
        f'<b>IRN &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</b> {voucher["irn"].replace("-", "")}<br/>'
        f'<b>Ack No. &nbsp;:</b> {voucher["ack_no"]}<br/>'
        f'<b>Ack Date :</b> {voucher["ack_date"]}'
    )
    elements.append(Paragraph(ew_meta_html, st("ewmeta", fontSize=8, leading=10.5)))
    elements.append(Spacer(1, 6))

    # 1. e-Way Bill Details
    elements.append(Paragraph('<b>1. e-Way Bill Details</b>', st("s1", fontSize=8.5, fontName="Helvetica-Bold")))
    ew_d_tbl = Table([
        [Paragraph(f'e-Way Bill No.: <b>{voucher["eway_bill_no"]}</b>', st("dt", fontSize=7.5)),
         Paragraph('Mode : <b>1 - Road</b>', st("dt", fontSize=7.5)),
         Paragraph(f'Generated Date : <b>{voucher["eway_gen_date"]}</b>', st("dt", fontSize=7.5))],
        [Paragraph(f'Generated By : <b>{company_gstin}</b>', st("dt", fontSize=7.5)),
         Paragraph(f'Approx Distance : <b>{voucher["approx_distance"]}</b>', st("dt", fontSize=7.5)),
         Paragraph(f'Valid Upto : <b>{voucher["eway_valid_upto"]}</b>', st("dt", fontSize=7.5))],
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
        [Paragraph(f'<b>{company_name}</b><br/>GSTIN : {company_gstin}<br/>Gujarat', st("at", fontSize=7.5, leading=9)),
         Paragraph(f'<b>{buyer_name}</b><br/>GSTIN : {buyer_gstin.replace("GSTIN/UIN : ", "")}<br/>Maharashtra', st("at", fontSize=7.5, leading=9))],
        [Paragraph(f'<b>Dispatch From</b><br/>NH48, NEAR KOLEI KHADI SARODHI, City/Village:Sarodhi, Valsad, Gujarat, 396001, UDYAM REG.:- {company_udyam}<br/>VALSAD, GUJARAT Gujarat 396001', st("at", fontSize=7.5, leading=9)),
         Paragraph(f'<b>Ship To</b><br/>{buyer_addr_1} {buyer_addr_2}, Maharashtra 400607', st("at", fontSize=7.5, leading=9))]
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
        [Paragraph(voucher["hsn_code"], st("gt", fontSize=7.5)),
         Paragraph('SAND & SAND', st("gt", fontSize=7.5)),
         Paragraph('776 BAG', st("gt", fontSize=7.5, alignment=TA_CENTER)),
         Paragraph(f'{voucher["taxable_amount"]:,.2f}', st("gt", fontSize=7.5, alignment=TA_RIGHT)),
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
        [Paragraph(f'Tot. Taxable Amt : <b>{voucher["taxable_amount"]:,.2f}</b>', st("st", fontSize=7.5)),
         Paragraph('Other Amt : <b>0.40</b>', st("st", fontSize=7.5)),
         Paragraph(f'Total Inv Amt : <b>{voucher["amount"]:,.2f}</b>', st("st", fontSize=7.5))],
        [Paragraph(f'IGST Amt : <b>{voucher["igst_amount"]:,.2f}</b>', st("st", fontSize=7.5)),
         Paragraph('', st("st")), Paragraph('', st("st"))],
    ], colWidths=[W * 0.35, W * 0.30, W * 0.35])
    subtot_tbl.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    elements.append(subtot_tbl)
    elements.append(Spacer(1, 6))

    # 4. Transportation Details
    elements.append(Paragraph('<b>4. Transportation Details</b>', st("s4", fontSize=8.5, fontName="Helvetica-Bold")))
    t_trans = Table([
        [Paragraph('Transporter ID : ', st("tr", fontSize=7.5)), Paragraph('Doc No. : ', st("tr", fontSize=7.5))],
        [Paragraph(f'Name : <b>{voucher["transporter_name"]}</b>', st("tr", fontSize=7.5)), Paragraph('Date : ', st("tr", fontSize=7.5))],
    ], colWidths=[W * 0.60, W * 0.40])
    t_trans.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
    elements.append(t_trans)
    elements.append(Spacer(1, 6))

    # 5. Vehicle Details
    elements.append(Paragraph('<b>5. Vehicle Details</b>', st("s5", fontSize=8.5, fontName="Helvetica-Bold")))
    t_veh = Table([
        [Paragraph(f'Vehicle No. : <b>{voucher["truck_no"]}</b>', st("vh", fontSize=7.5)),
         Paragraph('From : <b>Valsad, GUJARAT</b>', st("vh", fontSize=7.5)),
         Paragraph('CEWB No. : ', st("vh", fontSize=7.5))],
    ], colWidths=[W * 0.35, W * 0.40, W * 0.25])
    t_veh.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
    elements.append(t_veh)

    # Page 2 Footer
    elements.append(Spacer(1, 10))
    elements.append(Paragraph('<font size="7">2</font>', st("ft2", alignment=TA_CENTER)))

    doc.build(elements)
    return buf.getvalue()

pdf_bytes = build_consignment_pdf()

# Render both pages
doc = fitz.open(stream=pdf_bytes, filetype="pdf")
print("Total pages rendered:", len(doc))

p1_path = os.path.join(out_dir, "preview_pixel_perfect_page1_invoice.png")
p2_path = os.path.join(out_dir, "preview_pixel_perfect_page2_eway.png")

pix1 = doc[0].get_pixmap(dpi=200)
pix1.save(p1_path)

pix2 = doc[1].get_pixmap(dpi=200)
pix2.save(p2_path)

print("Page 1 PNG saved:", p1_path, "Size:", os.path.getsize(p1_path))
print("Page 2 PNG saved:", p2_path, "Size:", os.path.getsize(p2_path))
