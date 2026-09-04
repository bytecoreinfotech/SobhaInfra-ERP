import requests, json, re

SUPABASE_URL = 'https://mcgmppnvnwnilioapbli.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3MTk4MiwiZXhwIjoyMTAzMTQ3OTgyfQ.iMVtS3kZ5jkXd7wOsgviN_3Umz0Auw7vBa0NDlD9rKg'

headers = {'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}'}

# 1. Fetch customer_master
cm_res = requests.get(f'{SUPABASE_URL}/rest/v1/customer_master?select=id,company_name,normalized_key,contact_number,contact_person&limit=2000', headers=headers)
customers = cm_res.json()
print(f"Total Customer Master records: {len(customers)}")

# 2. Fetch all invoices with pagination
all_invoices = []
offset = 0
batch_size = 1000
while True:
    inv_res = requests.get(f'{SUPABASE_URL}/rest/v1/invoices?select=id,invoice_number,client_name,client_phone,amount,status,company_name,metadata&offset={offset}&limit={batch_size}', headers=headers)
    batch = inv_res.json()
    if not batch:
        break
    all_invoices.extend(batch)
    if len(batch) < batch_size:
        break
    offset += batch_size

print(f"Total Invoices in DB: {len(all_invoices)}")

# Normalization
SUFFIX_PATTERN = re.compile(
    r'\b(private\s+limited|pvt\.?\s*ltd\.?|ltd\.?|llp|inc\.?|corp\.?|corporation|'
    r'enterprises?|enterprise|traders?|trading\s+co\.?|trading\s+company|trading|agency|agencies|'
    r'associates?|builders?|developer|developers?|infrasolutions?|infracon|infratech|infra|'
    r'constructions?|construction|contractor|contractors?|suppliers?|supplier|store|depot|co\.?|huf|aop|lp|m/s)\b',
    re.IGNORECASE
)

def normalize_name(name):
    if not name: return ''
    n = name.lower().strip()
    n = n.replace('&', 'and')
    n = SUFFIX_PATTERN.sub(' ', n)
    n = re.sub(r'[^a-z0-9]', '', n)
    return n

def levenshtein_similarity(a, b):
    if not a or not b: return 0
    if a == b: return 1
    la, lb = len(a), len(b)
    dp = [[0]*(lb+1) for _ in range(la+1)]
    for i in range(la+1): dp[i][0] = i
    for j in range(lb+1): dp[0][j] = j
    for i in range(1, la+1):
        for j in range(1, lb+1):
            dp[i][j] = dp[i-1][j-1] if a[i-1] == b[j-1] else 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    return 1 - dp[la][lb] / max(la, lb)

exact_map = {}
norm_map = {}
phone_map = {}
for c in customers:
    cname = c.get('company_name') or ''
    if not cname: continue
    exact_map[cname.lower().strip()] = c
    nk = c.get('normalized_key') or normalize_name(cname)
    if nk: norm_map[nk] = c
    phone = c.get('contact_number') or ''
    digits = re.sub(r'\D', '', phone)[-10:]
    if len(digits) == 10:
        phone_map[digits] = c

def match_customer(party_name, party_phone=''):
    if not party_name: return False, None
    k = party_name.lower().strip()
    if k in exact_map: return True, exact_map[k]
    nk = normalize_name(party_name)
    if nk and nk in norm_map: return True, norm_map[nk]
    if party_phone:
        d = re.sub(r'\D', '', party_phone)[-10:]
        if len(d) == 10 and d in phone_map:
            return True, phone_map[d]
    if nk and len(nk) >= 4:
        best_score = 0
        best_cust = None
        for c in customers:
            cn = c.get('normalized_key') or normalize_name(c.get('company_name') or '')
            if not cn or len(cn) < 4: continue
            sc = levenshtein_similarity(nk, cn)
            if sc > best_score:
                best_score = sc
                best_cust = c
            if sc == 1: break
        if best_score >= 0.85 and best_cust:
            return True, best_cust
    return False, None

# Filter for SHOBHA READY PLAST
srp_invoices = [
    i for i in all_invoices 
    if 'SHOBHA READY PLAST' in (i.get('company_name') or '').upper() 
    or 'SHOBHA READY PLAST' in ((i.get('metadata') or {}).get('tally_company') or '').upper()
]
print(f"\nSHOBHA READY PLAST total invoices: {len(srp_invoices)}")

# Let's inspect direction and types
sales_vouchers = []
receipt_vouchers = []
vendor_vouchers = []
other_vouchers = []

for inv in srp_invoices:
    num = (inv.get('invoice_number') or '').upper()
    vtype = ((inv.get('metadata') or {}).get('voucher_type') or '').lower()
    dir_val = ((inv.get('metadata') or {}).get('direction') or '').lower()
    
    # Vendor
    is_vendor = False
    if any(t in vtype for t in ['purchase', 'purchase order', 'payment']) or num.startswith('PUR-') or num.startswith('PAY-') or dir_val in ['payable', 'paid_out']:
        is_vendor = True
    
    if is_vendor:
        vendor_vouchers.append(inv)
    elif any(t in vtype for t in ['receipt', 'bank receipt']) or num.startswith('REC-') or dir_val == 'received':
        receipt_vouchers.append(inv)
    elif any(t in vtype for t in ['sales', 'tax invoice']) or num.startswith('SRP/') or dir_val == 'receivable':
        sales_vouchers.append(inv)
    else:
        other_vouchers.append(inv)

print(f"Sales Vouchers: {len(sales_vouchers)} | Total Amt: Rs. {sum(float(i.get('amount') or 0) for i in sales_vouchers):,.2f}")
print(f"Receipt Vouchers: {len(receipt_vouchers)} | Total Amt: Rs. {sum(float(i.get('amount') or 0) for i in receipt_vouchers):,.2f}")
print(f"Vendor Vouchers: {len(vendor_vouchers)} | Total Amt: Rs. {sum(float(i.get('amount') or 0) for i in vendor_vouchers):,.2f}")
print(f"Other Vouchers: {len(other_vouchers)} | Total Amt: Rs. {sum(float(i.get('amount') or 0) for i in other_vouchers):,.2f}")

# Now match with customer_master!
srp_non_vendor = [i for i in srp_invoices if not (i.get('invoice_number') or '').upper().startswith('LEDGER-') and i not in vendor_vouchers]
print(f"\nNon-vendor vouchers in SRP: {len(srp_non_vendor)}")
matched_srp = []
unmatched_srp = []

for inv in srp_non_vendor:
    pname = inv.get('client_name') or ''
    pphone = inv.get('client_phone') or ''
    matched, c = match_customer(pname, pphone)
    if matched:
        matched_srp.append((inv, c))
    else:
        unmatched_srp.append(inv)

print(f"Matched with Google Sheet customer_master: {len(matched_srp)}")
print(f"Unmatched (excluded): {len(unmatched_srp)}")

matched_amt = sum(float(i.get('amount') or 0) for i, c in matched_srp)
matched_paid = sum(float(i.get('amount') or 0) for i, c in matched_srp if i.get('status') == 'Paid')
matched_pending = sum(float(i.get('amount') or 0) for i, c in matched_srp if i.get('status') != 'Paid')
print(f"Matched Total Invoiced: Rs. {matched_amt:,.2f}")
print(f"Matched Paid: Rs. {matched_paid:,.2f}")
print(f"Matched Pending/Overdue: Rs. {matched_pending:,.2f}")

if unmatched_srp:
    print(f"\nSample unmatched parties (excluded from customer list):")
    unmatched_parties = set(i.get('client_name') for i in unmatched_srp[:20])
    for p in list(unmatched_parties)[:10]:
        print(f"  - {p}")
