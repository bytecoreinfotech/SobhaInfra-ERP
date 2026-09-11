import os
import sys
import json
import time
import importlib.util
import requests

# Load .env
env = {}
if os.path.exists(".env"):
    with open(".env", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip("'\"")

SUPABASE_URL = env.get("VITE_SUPABASE_URL", "https://mcgmppnvnwnilioapbli.supabase.co")
SUPABASE_KEY = env.get("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3MTk4MiwiZXhwIjoyMTAzMTQ3OTgyfQ.iMVtS3kZ5jkXd7wOsgviN_3Umz0Auw7vBa0NDlD9rKg")
STORAGE_BUCKET = "whatsapp-media"

# Import generate_invoice_pdf from tally-sync.py
spec = importlib.util.spec_from_file_location("tally_sync", "tally-sync.py")
tally_sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tally_sync)

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

# 1. Fetch the 3 invoices
resp = requests.get(
    f"{SUPABASE_URL}/rest/v1/invoices?invoice_number=in.(SRP-SALES-12,SRP-SALES-23,SRP-SALES-632)",
    headers=headers
)
invoices = resp.json()
print(f"Found {len(invoices)} invoices to process")

# 2. Fetch customer master
resp_cm = requests.get(f"{SUPABASE_URL}/rest/v1/customer_master", headers=headers)
customer_master = resp_cm.json()

cm_map = {}
for c in customer_master:
    name = (c.get("company_name") or "").strip().upper()
    if name:
        cm_map[name] = c

for inv in invoices:
    inv_num = inv.get("invoice_number")
    client_name = inv.get("client_name")
    amount = float(inv.get("amount") or 0)
    print(f"\n--- Processing {inv_num} for {client_name} (Rs. {amount}) ---")

    # Match customer
    cm_entry = cm_map.get(client_name.strip().upper())
    phone = ""
    if cm_entry and cm_entry.get("contact_number"):
        digits = "".join(filter(str.isdigit, str(cm_entry["contact_number"])))
        if len(digits) >= 10:
            phone = f"+91{digits[-10:]}"
    
    print(f"  Matched verified phone: {phone}")

    # Build voucher dict for PDF generator
    voucher_data = {
        "invoice_number": inv_num,
        "invoice_date": inv.get("invoice_date") or "11-Sep-2026",
        "date": "20260911",
        "amount": amount,
        "ledger_name": client_name,
        "company_name": inv.get("company_name") or "SHOBHA READY PLAST",
        "item_name": "SAND / READY PLAST MATERIAL",
        "hsn_code": "25051011",
        "truck_no": "MH04-4550",
        "challan_no": inv.get("metadata", {}).get("raw_voucher_number", "10199"),
        "site": "MUMBAI / THANE / GUJARAT",
        "quantity_str": f"{int(amount/100)} BAGS",
        "rate_str": "100.00",
        "unit": "BAGS",
        "eway_bill_no": "602165786131",
        "credit_days": inv.get("metadata", {}).get("credit_period_days", 30),
    }

    # Generate PDF
    pdf_bytes = tally_sync.generate_invoice_pdf(voucher_data)
    if not pdf_bytes:
        print(f"  [ERROR] Failed to generate PDF for {inv_num}")
        continue
    
    print(f"  Generated PDF ({len(pdf_bytes)} bytes)")

    # Upload to Supabase Storage
    safe_name = inv_num.replace("-", "_").replace("/", "_")
    file_path = f"invoices/{safe_name}_{int(time.time())}.pdf"
    upload_url = f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{file_path}"

    upload_headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/pdf",
        "x-upsert": "true"
    }

    up_resp = requests.post(upload_url, data=pdf_bytes, headers=upload_headers)
    if up_resp.status_code not in (200, 201):
        print(f"  [ERROR] Upload failed: {up_resp.status_code} {up_resp.text}")
        continue
    
    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{file_path}"
    print(f"  [SUCCESS] Uploaded to: {public_url}")

    # Update invoice in Supabase DB
    meta = inv.get("metadata") or {}
    meta["pdf_url"] = public_url
    meta["pdf_generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    update_payload = {
        "pdf_url": public_url,
        "client_phone": phone,
        "metadata": meta
    }

    patch_resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/invoices?id=eq.{inv['id']}",
        headers=headers,
        json=update_payload
    )
    print(f"  Database update status: {patch_resp.status_code}")

print("\nFinished generating, uploading, and updating target bills.")
