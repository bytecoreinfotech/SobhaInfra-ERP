-- ============================================================================
-- ERPPro: Migration for Roles, Permissions, Task Templates, and User Seeding
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Ensure 'roles' table exists
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  description TEXT DEFAULT '',
  is_system BOOLEAN DEFAULT false,
  users_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Ensure 'users' table exists
CREATE TABLE IF NOT EXISTS users (
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

-- 3. Permission matrix table (stores JSON matrix per org)
CREATE TABLE IF NOT EXISTS permission_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' UNIQUE,
  matrix JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Task templates table
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority TEXT DEFAULT 'Medium',
  tags TEXT[] DEFAULT '{}',
  default_assignee TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Ensure 'tasks' table has all needed columns
-- (tasks table should already exist, but ensure the columns are present)
DO $$ BEGIN
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to TEXT DEFAULT '';
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]';
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
EXCEPTION WHEN undefined_table THEN
  CREATE TABLE tasks (
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
END $$;

-- 6. Seed demo roles (upsert to avoid duplicates)
INSERT INTO roles (id, name, color, is_system, users_count, organization_id) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Super Admin', '#ef4444', true, 1, '00000000-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000002', 'Manager', '#6366f1', true, 2, '00000000-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000003', 'Sales Executive', '#10b981', true, 3, '00000000-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000004', 'Accounts', '#f59e0b', true, 1, '00000000-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000005', 'Support Agent', '#06b6d4', true, 1, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, users_count = EXCLUDED.users_count;

-- 7. Seed demo users (upsert to avoid duplicates)
INSERT INTO users (id, full_name, email, phone, role, is_active, last_login_at, avatar, organization_id) VALUES
  ('22222222-0000-0000-0000-000000000001', 'Admin User',    'admin@erppro.in',    '+919999000001', 'Super Admin',     true, 'Today, 10:35 AM', 'AU', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000002', 'Priya Sharma',  'manager@erppro.in',  '+919999000002', 'Manager',         true, 'Today, 9:15 AM',  'PS', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000003', 'Anand Sharma',  'field@erppro.in',    '+919999000003', 'Sales Executive', true, 'Today, 8:45 AM',  'AS', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000004', 'Rajesh Kumar',  'sales@erppro.in',    '+919999000004', 'Sales Executive', true, 'Today, 9:00 AM',  'RK', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000005', 'Sunita Patel',  'accounts@erppro.in', '+919999000005', 'Accounts',        true, 'Today, 10:00 AM', 'SP', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000006', 'Vikram Singh',  'vikram@erppro.in',   '+919999000006', 'Sales Executive', true, 'Yesterday, 6:30 PM', 'VS', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000007', 'Deepak Verma',  'deepak@erppro.in',   '+919999000007', 'Manager',         true, 'Today, 11:20 AM', 'DV', '00000000-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000008', 'Neha Gupta',    'neha@erppro.in',     '+919999000008', 'Support Agent',   true, 'Today, 10:50 AM', 'NG', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, role = EXCLUDED.role;

-- 8. Seed default permission matrix
INSERT INTO permission_matrix (organization_id, matrix) VALUES (
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

-- 9. Disable RLS on new tables for demo mode (enable when going to true multi-tenant)
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

-- Allow anon read/write for demo
CREATE POLICY IF NOT EXISTS "roles_anon_all" ON roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "users_anon_all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "permission_matrix_anon_all" ON permission_matrix FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "task_templates_anon_all" ON task_templates FOR ALL USING (true) WITH CHECK (true);
