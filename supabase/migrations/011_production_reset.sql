-- ==============================================================================
-- MIGRATION 011: Production Reset — Clean Demo Accounts & Setup Real SuperAdmin
-- Sobha Infratech ERP — Production Migration
-- Run this in: Supabase SQL Editor → New query → Run All
-- ==============================================================================

-- ── STEP 1: Add password_hash column to users (if not already) ────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT 'demo1234';

-- ── STEP 2: Clean ALL existing demo/test user accounts ────────────────────────
DELETE FROM public.users
WHERE email IN (
  'admin@erppro.in',
  'manager@erppro.in',
  'sales@erppro.in',
  'field@erppro.in',
  'accounts@erppro.in',
  'vikram@erppro.in',
  'deepak@erppro.in',
  'neha@erppro.in',
  'admin@techma.in',
  'demo@erppro.in',
  'test@erppro.in'
);

-- ── STEP 3: Insert the Production SuperAdmin account ──────────────────────────
INSERT INTO public.users (
  id,
  organization_id,
  email,
  full_name,
  avatar,
  phone,
  role,
  password_hash,
  is_active,
  last_login_at,
  created_at,
  updated_at
)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'hr.sobhainfratech@gmail.com',
  'Sobha Infratech Admin',
  'SA',
  '',
  'Super Admin',
  'Infratech@erp98',
  true,
  'Never',
  now(),
  now()
)
ON CONFLICT (email)
DO UPDATE SET
  full_name     = EXCLUDED.full_name,
  avatar        = EXCLUDED.avatar,
  role          = EXCLUDED.role,
  password_hash = EXCLUDED.password_hash,
  is_active     = true,
  updated_at    = now();

-- ── STEP 4: Update organization name to Sobha Infratech ───────────────────────
UPDATE public.organizations
SET
  name       = 'Sobha Infratech',
  slug       = 'sobha-infratech',
  updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';

-- ── STEP 5: Clean any mock/demo leads (optional — remove if you want to keep) ─
-- Uncomment the line below ONLY if you also want to wipe demo leads:
-- DELETE FROM public.leads WHERE lead_score = 0 OR notes ILIKE '%demo%' OR notes ILIKE '%test%';

-- ── STEP 6: Verify the result ─────────────────────────────────────────────────
SELECT id, email, full_name, role, is_active, password_hash, created_at
FROM public.users
ORDER BY created_at DESC;
