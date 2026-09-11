import re
import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://mcgmppnvnwnilioapbli.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
STORAGE_BUCKET = "whatsapp-media"

print(f"SUPABASE_URL: {SUPABASE_URL}")
print(f"SUPABASE_KEY: {SUPABASE_KEY[:15] if SUPABASE_KEY else 'NONE'}...")

def upload_pdf_to_supabase(pdf_bytes: bytes, inv_number: str):
    if not pdf_bytes or not SUPABASE_KEY:
        print("Missing bytes or key")
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
        resp = requests.post(upload_url, data=pdf_bytes, headers=headers, timeout=15)
        print(f"Upload status: {resp.status_code}, response: {resp.text}")
        if resp.status_code in (200, 201):
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{file_path}"
            return public_url
        return None
    except Exception as e:
        print(f"Exception: {e}")
        return None

# Test dummy PDF
dummy_pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000108 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n185\n%%EOF"
url = upload_pdf_to_supabase(dummy_pdf, "SRP-SALES-12")
print("Result URL:", url)
