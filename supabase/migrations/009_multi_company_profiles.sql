-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 009: MULTI-COMPANY & MULTI-ENTITY PROFILES REGISTRY
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.company_profiles (
  id TEXT PRIMARY KEY,
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  alias_names JSONB DEFAULT '[]'::jsonb,
  company_logo_url TEXT DEFAULT '',
  company_address TEXT,
  gstin_number TEXT,
  company_udyam_reg TEXT,
  admin_email TEXT,
  contact_phone TEXT,
  bank_name TEXT,
  bank_account_no TEXT,
  bank_ifsc TEXT,
  upi_id TEXT,
  state_name TEXT DEFAULT 'Gujarat',
  state_code TEXT DEFAULT '24',
  jurisdiction TEXT DEFAULT 'VALSAD / THANE',
  invoice_footer_notes TEXT DEFAULT 'Unpaid Invoice Will Be Charged 24% P.A. Interest After Given Credit Days. Goods Once Sold Will Not Be Taken Back.',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;

-- Allow public / anon read/write for now
CREATE POLICY "Allow all access to company_profiles" ON public.company_profiles
  FOR ALL USING (true) WITH CHECK (true);

-- Seed initial company profiles
INSERT INTO public.company_profiles (
  id, organization_id, company_name, alias_names, company_logo_url, company_address,
  gstin_number, company_udyam_reg, admin_email, contact_phone, bank_name, bank_account_no,
  bank_ifsc, state_name, state_code, jurisdiction, is_default
)
VALUES 
  (
    'comp-shobha-ready-plast',
    '00000000-0000-0000-0000-000000000001',
    'SHOBHA READY PLAST',
    '["SHOBHA READY PLAST", "SRP", "Shobha Ready Plast Pvt Ltd"]'::jsonb,
    '',
    'NH48, NEAR KOLEI KHADI SARODHI, VALSAD, GUJARAT - 396001',
    '24AGCPJ2785R1ZV',
    'UDYAM-GJ-01-0012345',
    'shobhareadyplast@gmail.com',
    '+91 98765 43210',
    'HDFC Bank Ltd.',
    '50200088991122',
    'HDFC0001234',
    'Gujarat',
    '24',
    'VALSAD / THANE',
    true
  ),
  (
    'comp-shobha-enterprises',
    '00000000-0000-0000-0000-000000000001',
    'SHOBHA ENTERPRISES',
    '["SHOBHA ENTERPRISES", "SE", "Shobha Enterprises Traders"]'::jsonb,
    '',
    'OFFICE 204, TRADE CENTER, KOLShet ROAD, THANE WEST, MAHARASHTRA - 400607',
    '27AABCS9988P1Z3',
    'UDYAM-MH-01-0098765',
    'enterprises@shobhagroup.in',
    '+91 98765 11223',
    'ICICI Bank Ltd.',
    '001105009988',
    'ICIC0000011',
    'Maharashtra',
    '27',
    'THANE / MUMBAI',
    false
  ),
  (
    'comp-shobha-infra',
    '00000000-0000-0000-0000-000000000001',
    'SHOBHA INFRA & LOGISTICS',
    '["SHOBHA INFRA & LOGISTICS", "SHOBHA TRANSPORT", "SIL"]'::jsonb,
    '',
    'PLOT 12, TRANSPORT NAGAR, GIDC, VAPI, GUJARAT - 396195',
    '24AAACI5544K1Z9',
    'UDYAM-GJ-01-0055443',
    'infra@shobhagroup.in',
    '+91 98765 99887',
    'State Bank of India',
    '33445566778',
    'SBIN0001234',
    'Gujarat',
    '24',
    'VAPI / VALSAD',
    false
  )
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  company_address = EXCLUDED.company_address,
  gstin_number = EXCLUDED.gstin_number,
  bank_name = EXCLUDED.bank_name,
  bank_account_no = EXCLUDED.bank_account_no,
  bank_ifsc = EXCLUDED.bank_ifsc;
