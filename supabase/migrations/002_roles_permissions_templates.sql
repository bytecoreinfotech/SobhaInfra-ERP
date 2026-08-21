-- ============================================================================
-- ERPPro: Consolidated Migration for Roles, Permissions, Task Templates & Users
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Ensure default organization exists
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    subscription_tier TEXT NOT NULL DEFAULT 'pro',
    is_active BOOLEAN NOT NULL DEFAULT true,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.organizations (id, name, slug, subscription_tier, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Techma ERPPro Real Estate', 'techma-erppro', 'pro', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = true;

-- 3. Ensure 'roles' table exists
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  description TEXT DEFAULT '',
  is_system BOOLEAN DEFAULT false,
  users_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure columns exist if table was already created earlier
DO $$ BEGIN
  ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6366f1';
  ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;
  ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS users_count INTEGER DEFAULT 0;
  ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. Ensure 'users' table exists
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT DEFAULT '',
  role TEXT DEFAULT 'Sales Executive',
  is_active BOOLEAN DEFAULT true,
  last_login_at TEXT DEFAULT 'Never',
  avatar TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure columns exist if table was already created earlier
DO $$ BEGIN
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Sales Executive';
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at TEXT DEFAULT 'Never';
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT '';
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 5. Permission matrix table (stores JSON matrix per org)
CREATE TABLE IF NOT EXISTS public.permission_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' UNIQUE,
  matrix JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Task templates table
CREATE TABLE IF NOT EXISTS public.task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority TEXT DEFAULT 'Medium',
  tags TEXT[] DEFAULT '{}',
  default_assignee TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Ensure 'tasks' table has all needed columns
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'To Do',
  priority TEXT DEFAULT 'Medium',
  assigned_to TEXT DEFAULT '',
  due_date DATE,
  tags TEXT[] DEFAULT '{}',
  comments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assigned_to TEXT DEFAULT '';
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]';
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_date DATE;
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'To Do';
  ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Medium';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 8. Seed default system roles (Super Admin, Manager, Sales Executive, Accounts, Support Agent)
INSERT INTO public.roles (id, name, color, is_system, users_count, organization_id) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Super Admin', '#ef4444', true, 1, '00000000-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000002', 'Manager', '#6366f1', true, 2, '00000000-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000003', 'Sales Executive', '#10b981', true, 3, '00000000-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000004', 'Accounts', '#f59e0b', true, 1, '00000000-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000005', 'Support Agent', '#06b6d4', true, 1, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, users_count = EXCLUDED.users_count;

-- 9. Seed demo users
INSERT INTO public.users (id, full_name, email, phone, role, is_active, last_login_at, avatar, organization_id) VALUES
  ('22222222-0000-0000-0000-000000000001', 'Admin User',    'admin@erppro.in',    '+919999000001', 'Super Admin',     true, 'Today, 10:35 AM', 'AU', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000002', 'Priya Sharma',  'manager@erppro.in',  '+919999000002', 'Manager',         true, 'Today, 9:15 AM',  'PS', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000003', 'Anand Sharma',  'field@erppro.in',    '+919999000003', 'Sales Executive', true, 'Today, 8:45 AM',  'AS', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000004', 'Rajesh Kumar',  'sales@erppro.in',    '+919999000004', 'Sales Executive', true, 'Today, 9:00 AM',  'RK', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000005', 'Sunita Patel',  'accounts@erppro.in', '+919999000005', 'Accounts',        true, 'Today, 10:00 AM', 'SP', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000006', 'Vikram Singh',  'vikram@erppro.in',   '+919999000006', 'Sales Executive', true, 'Yesterday, 6:30 PM', 'VS', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000007', 'Deepak Verma',  'deepak@erppro.in',   '+919999000007', 'Manager',         true, 'Today, 11:20 AM', 'DV', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000008', 'Neha Gupta',    'neha@erppro.in',     '+919999000008', 'Support Agent',   true, 'Today, 10:50 AM', 'NG', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, role = EXCLUDED.role;

-- 10. Seed default permission matrix
INSERT INTO public.permission_matrix (organization_id, matrix) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '{
    "Super Admin": {"Dashboard": true, "WhatsApp": true, "CRM": true, "Tasks": true, "Payments": true, "Finance": true, "Reports": true, "Roles": true, "FieldOps": true},
    "Manager": {"Dashboard": true, "WhatsApp": true, "CRM": true, "Tasks": true, "Payments": true, "Finance": true, "Reports": true, "Roles": false, "FieldOps": true},
    "Sales Executive": {"Dashboard": true, "WhatsApp": true, "CRM": true, "Tasks": true, "Payments": false, "Finance": false, "Reports": false, "Roles": false, "FieldOps": true},
    "Accounts": {"Dashboard": true, "WhatsApp": false, "CRM": false, "Tasks": false, "Payments": true, "Finance": true, "Reports": true, "Roles": false, "FieldOps": false},
    "Support Agent": {"Dashboard": true, "WhatsApp": true, "CRM": true, "Tasks": true, "Payments": false, "Finance": false, "Reports": false, "Roles": false, "FieldOps": false}
  }'::jsonb
)
ON CONFLICT (organization_id) DO NOTHING;

-- 11. Seed sample default task templates
INSERT INTO public.task_templates (title, description, priority, tags, default_assignee, organization_id) VALUES
  ('Daily Site Inspection & Photo Verification', 'Visit assigned property site, inspect construction milestones, and upload geotagged live site photos.', 'High', ARRAY['Site Visit', 'Client Inspection'], 'Anand Sharma', '00000000-0000-0000-0000-000000000001'),
  ('Client Payment & Milestone Follow-up', 'Call booked clients for milestone disbursement schedule and collect token cheques.', 'Medium', ARRAY['Payment Follow-up'], 'Sunita Patel', '00000000-0000-0000-0000-000000000001'),
  ('KYC Document Verification & Legal Dossier', 'Collect and verify Aadhaar, PAN, and buyer KYC agreements before deed registration.', 'Low', ARRAY['KYC & Legal'], 'Rajesh Kumar', '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- 12. Enable RLS and create permissive policies for public demo
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "roles_anon_all" ON public.roles;
  CREATE POLICY "roles_anon_all" ON public.roles FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "users_anon_all" ON public.users;
  CREATE POLICY "users_anon_all" ON public.users FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "permission_matrix_anon_all" ON public.permission_matrix;
  CREATE POLICY "permission_matrix_anon_all" ON public.permission_matrix FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "task_templates_anon_all" ON public.task_templates;
  CREATE POLICY "task_templates_anon_all" ON public.task_templates FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tasks_anon_all" ON public.tasks;
  CREATE POLICY "tasks_anon_all" ON public.tasks FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 13. Ensure 'site_visits' table exists
CREATE TABLE IF NOT EXISTS public.site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  employee_name TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  site_name TEXT NOT NULL,
  client_name TEXT DEFAULT '',
  lead_id TEXT DEFAULT NULL,
  lead_phone TEXT DEFAULT '',
  purpose TEXT DEFAULT 'Site Inspection',
  lat DOUBLE PRECISION NOT NULL DEFAULT 0,
  lng DOUBLE PRECISION NOT NULL DEFAULT 0,
  accuracy INTEGER DEFAULT 10,
  address TEXT DEFAULT '',
  status TEXT DEFAULT 'In Progress',
  check_in_time TIMESTAMPTZ DEFAULT now(),
  photo_url TEXT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. Ensure 'employee_live_locations' table exists for real-time tracking
CREATE TABLE IF NOT EXISTS public.employee_live_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  employee_id TEXT NOT NULL UNIQUE,
  employee_name TEXT NOT NULL,
  role TEXT DEFAULT 'Sales Executive',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy INTEGER DEFAULT 10,
  address TEXT DEFAULT '',
  is_live BOOLEAN DEFAULT true,
  last_ping TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_live_locations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "site_visits_anon_all" ON public.site_visits;
  CREATE POLICY "site_visits_anon_all" ON public.site_visits FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "employee_live_locations_anon_all" ON public.employee_live_locations;
  CREATE POLICY "employee_live_locations_anon_all" ON public.employee_live_locations FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

