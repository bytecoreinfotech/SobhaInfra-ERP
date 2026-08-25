-- ==============================================================================
-- COMPLETE SOBHAINFRA ERP DATABASE SCHEMA & SEED DATA (FIXED CONSTRAINTS & ROLES)
-- Run this script in your Supabase SQL Editor
-- ==============================================================================



-- ==============================================================================
-- FILE: supabase/migrations/001_foundation_and_rbac.sql
-- ==============================================================================

-- ==============================================================================
-- PHASE 1: FOUNDATION, MULTI-TENANCY, RBAC & AUDIT LOGS
-- Techma WhatsApp + AI CRM + Tally Master Specification v4.0
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Organizations (Tenant Master)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    subscription_tier TEXT NOT NULL DEFAULT 'pro', -- free, starter, pro, enterprise
    is_active BOOLEAN NOT NULL DEFAULT true,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.organizations (id, name, slug, subscription_tier, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Techma ERPPro Real Estate', 'techma-erppro', 'pro', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = true;

-- 3. Users Profile (Application users & team members)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    avatar_url TEXT,
    phone TEXT DEFAULT '',
    role TEXT DEFAULT 'Sales Executive',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TEXT DEFAULT 'Never',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure no strict auth.users foreign key constraint blocks seeded/invited team accounts
DO $$ BEGIN
  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;
  ALTER TABLE public.users ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT '';
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Sales Executive';
  ALTER TABLE public.users ALTER COLUMN last_login_at TYPE TEXT USING last_login_at::TEXT;
  ALTER TABLE public.users ALTER COLUMN last_login_at SET DEFAULT 'Never';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. Roles Master
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE, -- NULL for global system roles
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

-- 5. Permissions Master
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, -- e.g. 'crm:read', 'crm:write', 'finance:sync', 'ai:manage'
    module TEXT NOT NULL,       -- 'Dashboard', 'WhatsApp', 'CRM', 'Finance', 'AI', 'Settings'
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Role Permissions (Join Table)
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (role_id, permission_id)
);

-- 7. User Roles (Assign Users to Roles within an Org)
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id, role_id)
);

-- 8. Immutable Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,           -- e.g. 'user.create', 'lead.status_update', 'tally.manual_sync'
    resource TEXT NOT NULL,         -- 'leads', 'roles', 'tally_invoices'
    resource_id TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Free-Tier Usage Metrics & Quotas
CREATE TABLE IF NOT EXISTS public.usage_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    metric_name TEXT NOT NULL,      -- 'whatsapp_messages_sent', 'ai_tokens_used', 'db_storage_bytes'
    metric_value NUMERIC NOT NULL DEFAULT 0,
    cost_amount NUMERIC NOT NULL DEFAULT 0.00,
    period_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, metric_name, period_date)
);

-- ==============================================================================
-- AUTOMATIC TIMESTAMPS TRIGGER FUNCTION
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers
CREATE TRIGGER set_org_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_user_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_role_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_usage_updated_at BEFORE UPDATE ON public.usage_metrics FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on all Phase 1 tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_metrics ENABLE ROW LEVEL SECURITY;

-- Helper to extract current user's organization_id from context/session
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID AS $$
    SELECT organization_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Organization RLS
CREATE POLICY "Users can view their own organization"
    ON public.organizations FOR SELECT
    USING (id = public.current_org_id());

-- Users RLS
CREATE POLICY "Users can view members in same organization"
    ON public.users FOR SELECT
    USING (organization_id = public.current_org_id());

CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (id = auth.uid());

-- Roles RLS
CREATE POLICY "Users can view roles for their org or system roles"
    ON public.roles FOR SELECT
    USING (organization_id = public.current_org_id() OR is_system = true);

-- Permissions RLS (Readable by all authenticated users)
CREATE POLICY "Authenticated users can read permissions"
    ON public.permissions FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can read role permissions"
    ON public.role_permissions FOR SELECT
    TO authenticated
    USING (true);

-- User Roles RLS
CREATE POLICY "Users can view user roles in their org"
    ON public.user_roles FOR SELECT
    USING (organization_id = public.current_org_id());

-- Audit Logs RLS (Read-only for org members)
CREATE POLICY "Users can view audit logs for their org"
    ON public.audit_logs FOR SELECT
    USING (organization_id = public.current_org_id());

CREATE POLICY "System can insert audit logs"
    ON public.audit_logs FOR INSERT
    WITH CHECK (organization_id = public.current_org_id());

-- Usage Metrics RLS
CREATE POLICY "Users can view usage metrics for their org"
    ON public.usage_metrics FOR SELECT
    USING (organization_id = public.current_org_id());



-- ==============================================================================
-- FILE: supabase/migrations/002_crm_and_catalog.sql
-- ==============================================================================

-- ==============================================================================
-- PHASE 2: CRM MASTER DATA, PRODUCTS, DEALS & CUSTOMER 360
-- Techma WhatsApp + AI CRM + Tally Master Specification v4.0
-- ==============================================================================

-- 1. Product Categories
CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Products Master
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
    sku TEXT,
    name TEXT NOT NULL,
    description TEXT,
    unit_of_measure TEXT DEFAULT 'unit', -- 'unit', 'bag', 'kg', 'sqft'
    brochure_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Product Prices (Strict Pricing Guardrail Source)
CREATE TABLE IF NOT EXISTS public.product_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    currency TEXT NOT NULL DEFAULT 'INR',
    unit_price NUMERIC(12, 2) NOT NULL,
    min_quantity NUMERIC DEFAULT 1,
    max_discount_pct NUMERIC(5, 2) DEFAULT 0.00,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Leads Master
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    source TEXT NOT NULL DEFAULT 'WhatsApp', -- 'WhatsApp', 'Facebook', 'Instagram', 'Referral', 'Website', 'Walk-in'
    status TEXT NOT NULL DEFAULT 'New',     -- 'New', 'Hot', 'Warm', 'Cold', 'Converted', 'Lost'
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    property_interest TEXT,
    budget TEXT,
    lead_score INTEGER DEFAULT 0,
    intent TEXT,
    notes TEXT,
    first_touch_campaign TEXT,
    last_touch_campaign TEXT,
    marketing_opt_in BOOLEAN DEFAULT true,
    marketing_opt_out BOOLEAN DEFAULT false,
    marketing_opt_out_at TIMESTAMPTZ,
    opt_out_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Customers (Converted Entities)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    company_name TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    billing_address JSONB DEFAULT '{}'::jsonb,
    shipping_address JSONB DEFAULT '{}'::jsonb,
    gstin TEXT,
    tally_ledger_guid TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Contacts (Multi-contact support per customer)
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    designation TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Deals & Pipeline
CREATE TABLE IF NOT EXISTS public.deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'Discovery', -- 'Discovery', 'Qualified', 'Quotation', 'Negotiation', 'Won', 'Lost'
    value NUMERIC(14, 2) DEFAULT 0.00,
    expected_close_date DATE,
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    loss_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Quotations & Items
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    quotation_number TEXT NOT NULL,
    subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Draft', -- 'Draft', 'Sent', 'Approved', 'Rejected', 'Expired'
    valid_until DATE,
    terms_and_conditions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    item_description TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL,
    discount_pct NUMERIC(5, 2) DEFAULT 0.00,
    line_total NUMERIC(14, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Tasks & Activities
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'To Do', -- 'To Do', 'In Progress', 'Under Review', 'Done'
    priority TEXT NOT NULL DEFAULT 'Medium', -- 'High', 'Medium', 'Low'
    due_date DATE,
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    related_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    related_deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL, -- 'note', 'call', 'meeting', 'whatsapp', 'quotation', 'status_change'
    title TEXT NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Triggers for updated_at
CREATE TRIGGER set_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_quotations_updated_at BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant products access" ON public.products FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant product prices access" ON public.product_prices FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant leads access" ON public.leads FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant customers access" ON public.customers FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant deals access" ON public.deals FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant quotations access" ON public.quotations FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant tasks access" ON public.tasks FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant activities access" ON public.activities FOR ALL USING (organization_id = public.current_org_id());



-- ==============================================================================
-- FILE: supabase/migrations/002_roles_permissions_templates.sql
-- ==============================================================================

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

-- 15. Ensure 'invoices' table columns exist
DO $$ BEGIN
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;
  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;





-- ==============================================================================
-- FILE: supabase/migrations/003_whatsapp_and_campaigns.sql
-- ==============================================================================

-- ==============================================================================
-- PHASE 3 & 4: WHATSAPP CLOUD API, INBOX, CAMPAIGNS & QUEUES
-- Techma WhatsApp + AI CRM + Tally Master Specification v4.0
-- ==============================================================================

-- 1. WhatsApp Accounts
CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    phone_number_id TEXT NOT NULL,
    waba_id TEXT NOT NULL,
    display_phone_number TEXT NOT NULL,
    verified_name TEXT,
    quality_rating TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. WhatsApp Conversations (Inbox Session)
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    whatsapp_account_id UUID REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    contact_phone TEXT NOT NULL,
    contact_name TEXT,
    conversation_mode TEXT NOT NULL DEFAULT 'AI ACTIVE', -- 'AI ACTIVE', 'HUMAN ACTIVE', 'AI PAUSED', 'CLOSED'
    assigned_salesperson_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    last_message_text TEXT,
    last_message_at TIMESTAMPTZ,
    unread_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. WhatsApp Messages (Stored History & Webhook Payload)
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
    provider_message_id TEXT UNIQUE, -- Meta wamid for idempotency
    direction TEXT NOT NULL,         -- 'inbound', 'outbound'
    sender_type TEXT NOT NULL,       -- 'customer', 'ai', 'human_agent', 'system'
    message_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'template', 'image', 'document', 'interactive'
    body TEXT,
    media_url TEXT,
    status TEXT NOT NULL DEFAULT 'sent', -- 'queued', 'sent', 'delivered', 'read', 'failed'
    error_message TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. WhatsApp Approved Templates
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider_template_id TEXT,
    name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en_US',
    category TEXT NOT NULL, -- 'MARKETING', 'UTILITY', 'AUTHENTICATION'
    status TEXT NOT NULL DEFAULT 'APPROVED', -- 'APPROVED', 'PENDING', 'REJECTED'
    body_text TEXT NOT NULL,
    variables_schema JSONB DEFAULT '[]'::jsonb,
    campaign_eligible BOOLEAN NOT NULL DEFAULT true,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Broadcast Campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft', -- 'Draft', 'Scheduled', 'Running', 'Paused', 'Completed', 'Failed'
    target_criteria JSONB DEFAULT '{}'::jsonb,
    total_targeted INTEGER DEFAULT 0,
    total_queued INTEGER DEFAULT 0,
    total_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_read INTEGER DEFAULT 0,
    total_replied INTEGER DEFAULT 0,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Campaign Recipients & Batch Queue
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'claimed', 'sent', 'failed', 'opted_out'
    retry_count INTEGER DEFAULT 0,
    claimed_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Integration & Webhook Event Log (Idempotency Store)
CREATE TABLE IF NOT EXISTS public.integration_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,          -- 'whatsapp', 'tally', 'openai'
    provider_event_id TEXT NOT NULL, -- unique ID to guarantee idempotency
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN NOT NULL DEFAULT false,
    error_log TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_event_id)
);

-- RLS Policies
ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant whatsapp accounts access" ON public.whatsapp_accounts FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant conversations access" ON public.whatsapp_conversations FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant messages access" ON public.whatsapp_messages FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant templates access" ON public.whatsapp_templates FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant campaigns access" ON public.campaigns FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant recipients access" ON public.campaign_recipients FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant events access" ON public.integration_events FOR ALL USING (organization_id = public.current_org_id() OR organization_id IS NULL);



-- ==============================================================================
-- FILE: supabase/migrations/004_ai_and_knowledge.sql
-- ==============================================================================

-- ==============================================================================
-- PHASE 5: BOUNDED AI SALES AGENT, KNOWLEDGE BASE & QUALIFICATION
-- Techma WhatsApp + AI CRM + Tally Master Specification v4.0
-- ==============================================================================

-- 1. AI Knowledge Base Master
CREATE TABLE IF NOT EXISTS public.ai_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    category TEXT NOT NULL,          -- 'product', 'rate_chart', 'faq', 'policy', 'delivery', 'script'
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    file_reference TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived', 'draft'
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_until TIMESTAMPTZ,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. AI Execution Runs (Traceability & Cost Observability)
CREATE TABLE IF NOT EXISTS public.ai_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    model_name TEXT NOT NULL DEFAULT 'gpt-4o',
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_cost NUMERIC(8, 5) DEFAULT 0.00000,
    latency_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'success', -- 'success', 'rate_limited', 'failed', 'fallback'
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. AI Controlled Tool Calls Log
CREATE TABLE IF NOT EXISTS public.ai_tool_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    ai_run_id UUID NOT NULL REFERENCES public.ai_runs(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,          -- 'get_product_price', 'update_lead_score', 'request_human_handoff'
    arguments JSONB NOT NULL,
    result_output JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Structured Lead Qualification & Intents
CREATE TABLE IF NOT EXISTS public.lead_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    intent TEXT NOT NULL,             -- 'interested', 'asking_price', 'brochure_requested', 'complaint', 'not_interested'
    interest_level TEXT NOT NULL,     -- 'HOT', 'WARM', 'COLD'
    product_ids UUID[] DEFAULT ARRAY[]::UUID[],
    quantity_requested NUMERIC,
    location TEXT,
    purchase_timeline TEXT,
    price_feedback TEXT,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Lead Objections Log
CREATE TABLE IF NOT EXISTS public.lead_objections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    objection_type TEXT NOT NULL,     -- 'price', 'competitor', 'quality', 'timing', 'credit_terms'
    customer_remark TEXT NOT NULL,
    ai_response TEXT,
    handoff_triggered BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.ai_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_objections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant ai knowledge access" ON public.ai_knowledge FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant ai runs access" ON public.ai_runs FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant ai tool calls access" ON public.ai_tool_calls FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant lead intents access" ON public.lead_intents FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant lead objections access" ON public.lead_objections FOR ALL USING (organization_id = public.current_org_id());



-- ==============================================================================
-- FILE: supabase/migrations/005_tally_and_finance.sql
-- ==============================================================================

-- ==============================================================================
-- PHASE 6 & 7: TALLY PRIME INTEGRATION, INVOICES, OUTSTANDING & LEDGER MAP
-- Techma WhatsApp + AI CRM + Tally Master Specification v4.0
-- ==============================================================================

-- 1. Tally On-Premise Connection Config
CREATE TABLE IF NOT EXISTS public.tally_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    connector_token TEXT UNIQUE NOT NULL, -- auth token used by python script
    tally_host TEXT DEFAULT 'http://localhost:9000',
    last_sync_at TIMESTAMPTZ,
    last_health_check_at TIMESTAMPTZ,
    sync_status TEXT NOT NULL DEFAULT 'Disconnected', -- 'Connected', 'Disconnected', 'Syncing', 'Error'
    sync_frequency_minutes INTEGER DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tally Ledger Mappings (Exact, Possible, Human Confirmation)
CREATE TABLE IF NOT EXISTS public.tally_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tally_ledger_name TEXT NOT NULL,
    tally_ledger_guid TEXT,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    mapping_status TEXT NOT NULL DEFAULT 'possible_match', -- 'exact_match', 'possible_match', 'confirmed', 'ignored'
    confidence_score NUMERIC(5, 2) DEFAULT 0.00,
    confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Invoices (Synchronized from TallyPrime)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tally_voucher_number TEXT NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    client_phone TEXT,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending', 'Overdue', 'Paid', 'Partially Paid', 'Cancelled'
    due_date DATE,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reminder_count INTEGER DEFAULT 0,
    last_reminder_at TIMESTAMPTZ,
    tally_sync_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, tally_voucher_number)
);

-- 4. Tally Outstanding & Aging
CREATE TABLE IF NOT EXISTS public.tally_outstandings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    ledger_name TEXT NOT NULL,
    opening_balance NUMERIC(14, 2) DEFAULT 0.00,
    closing_balance NUMERIC(14, 2) DEFAULT 0.00,
    overdue_amount NUMERIC(14, 2) DEFAULT 0.00,
    days_overdue INTEGER DEFAULT 0,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tally Payments Recorded
CREATE TABLE IF NOT EXISTS public.tally_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    receipt_voucher_number TEXT NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    payment_mode TEXT DEFAULT 'Bank Transfer',
    payment_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Tally Sync Jobs & Error Audit Log
CREATE TABLE IF NOT EXISTS public.tally_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'started', -- 'started', 'success', 'partial', 'failed'
    records_received INTEGER DEFAULT 0,
    records_synced INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    duration_seconds NUMERIC(8, 2),
    error_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tally_sync_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sync_job_id UUID REFERENCES public.tally_sync_jobs(id) ON DELETE CASCADE,
    voucher_number TEXT,
    error_message TEXT NOT NULL,
    raw_xml TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Payment Reminders Sent Log
CREATE TABLE IF NOT EXISTS public.payment_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    channel TEXT NOT NULL DEFAULT 'WhatsApp',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'delivered', 'read', 'failed'
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.tally_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_outstandings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_sync_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant tally connections access" ON public.tally_connections FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant tally mappings access" ON public.tally_mappings FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant invoices access" ON public.invoices FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant outstandings access" ON public.tally_outstandings FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant tally payments access" ON public.tally_payments FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant sync jobs access" ON public.tally_sync_jobs FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant sync errors access" ON public.tally_sync_errors FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant payment reminders access" ON public.payment_reminders FOR ALL USING (organization_id = public.current_org_id());



-- ==============================================================================
-- FILE: supabase/migrations/006_automations_and_events.sql
-- ==============================================================================

-- ==============================================================================
-- PHASE 8: AUTOMATION ENGINE & PAYMENT FOLLOW-UP RULES
-- Techma WhatsApp + AI CRM + Tally Master Specification v4.0
-- ==============================================================================

-- 1. Automation Rules Master (WHEN event IF conditions THEN action)
CREATE TABLE IF NOT EXISTS public.automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    trigger_event TEXT NOT NULL,       -- e.g. 'lead.created', 'lead.qualified_hot', 'tally.invoice_overdue'
    conditions JSONB NOT NULL DEFAULT '[]'::jsonb, -- e.g. [{"field": "interest_level", "op": "==", "val": "HOT"}]
    actions JSONB NOT NULL DEFAULT '[]'::jsonb,    -- e.g. [{"action": "create_task", "params": {...}}, {"action": "send_whatsapp", "params": {...}}]
    is_active BOOLEAN NOT NULL DEFAULT true,
    max_retries INTEGER DEFAULT 3,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Automation Execution Runs Log
CREATE TABLE IF NOT EXISTS public.automation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
    trigger_payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'success', -- 'success', 'failed', 'retrying'
    actions_executed JSONB DEFAULT '[]'::jsonb,
    error_message TEXT,
    execution_duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Business Event Stream
CREATE TABLE IF NOT EXISTS public.business_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,          -- 'campaign_targeted', 'message_sent', 'message_delivered', 'ai_qualified', 'price_objection', 'human_handoff', 'deal_won', 'payment_received'
    entity_type TEXT NOT NULL,         -- 'lead', 'customer', 'campaign', 'deal', 'invoice'
    entity_id UUID NOT NULL,
    actor_type TEXT NOT NULL,          -- 'customer', 'ai', 'salesperson', 'system'
    actor_id TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant automation rules access" ON public.automation_rules FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant automation runs access" ON public.automation_runs FOR ALL USING (organization_id = public.current_org_id());
CREATE POLICY "Tenant business events access" ON public.business_events FOR ALL USING (organization_id = public.current_org_id());



-- ==============================================================================
-- FILE: supabase/migrations/007_production_fixes.sql
-- ==============================================================================

-- ==============================================================================
-- PHASE 10: PRODUCTION READINESS — MISSING TABLES, STORED PROCEDURES & INDEXES
-- Techma WhatsApp + AI CRM + Tally Master Specification v4.0
-- Migration 007 — Additive only (safe to run on existing schema)
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DEAL ITEMS (Spec §9) — Links products/SKUs to deals
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deal_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    item_description TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL,
    discount_pct NUMERIC(5, 2) DEFAULT 0.00,
    line_total NUMERIC(14, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.deal_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant deal items access" ON public.deal_items FOR ALL USING (organization_id = public.current_org_id());
CREATE TRIGGER set_deal_items_updated_at BEFORE UPDATE ON public.deal_items FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. NOTES (Spec §9) — Standalone notes on any entity
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,         -- 'lead', 'customer', 'deal', 'invoice', 'conversation'
    entity_id UUID NOT NULL,
    author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant notes access" ON public.notes FOR ALL USING (organization_id = public.current_org_id());
CREATE TRIGGER set_notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AI FEEDBACK (Spec §24) — Used by db.js but never created
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    ai_run_id UUID REFERENCES public.ai_runs(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    feedback_type TEXT NOT NULL DEFAULT 'thumbs', -- 'thumbs', 'correction', 'report'
    rating INTEGER,                    -- 1 = thumbs down, 5 = thumbs up
    correction_text TEXT,              -- human-corrected response
    original_response TEXT,
    submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant ai feedback access" ON public.ai_feedback FOR ALL USING (organization_id = public.current_org_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. WHATSAPP MEDIA (Spec §39) — Stores media attachments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,          -- 'image', 'document', 'audio', 'video', 'sticker'
    provider_media_id TEXT,            -- Meta media ID for retrieval
    mime_type TEXT,
    file_name TEXT,
    file_size_bytes INTEGER,
    storage_path TEXT,                 -- Supabase Storage path or external URL
    sha256_hash TEXT,
    downloaded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant whatsapp media access" ON public.whatsapp_media FOR ALL USING (organization_id = public.current_org_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. STORED PROCEDURE: increment_campaign_stats (called by send-campaign.js)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_campaign_stats(
    c_id UUID,
    sent_delta INTEGER DEFAULT 0,
    failed_delta INTEGER DEFAULT 0,
    delivered_delta INTEGER DEFAULT 0,
    read_delta INTEGER DEFAULT 0,
    replied_delta INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.campaigns
    SET
        total_sent      = COALESCE(total_sent, 0)      + COALESCE(sent_delta, 0),
        total_delivered  = COALESCE(total_delivered, 0)  + COALESCE(delivered_delta, 0),
        total_read       = COALESCE(total_read, 0)       + COALESCE(read_delta, 0),
        total_replied    = COALESCE(total_replied, 0)    + COALESCE(replied_delta, 0),
        status = CASE
            WHEN COALESCE(total_sent, 0) + COALESCE(sent_delta, 0) >= COALESCE(total_targeted, 0)
                 AND COALESCE(total_targeted, 0) > 0
            THEN 'Completed'
            ELSE 'Running'
        END,
        started_at = COALESCE(started_at, now()),
        completed_at = CASE
            WHEN COALESCE(total_sent, 0) + COALESCE(sent_delta, 0) >= COALESCE(total_targeted, 0)
                 AND COALESCE(total_targeted, 0) > 0
            THEN now()
            ELSE completed_at
        END,
        updated_at = now()
    WHERE id = c_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. STORED PROCEDURE: mark_overdue_invoices (auto-update invoice status)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS TABLE (
    invoice_id UUID,
    client_name TEXT,
    amount NUMERIC,
    days_overdue INTEGER
) AS $$
BEGIN
    RETURN QUERY
    UPDATE public.invoices i
    SET
        status = 'Overdue',
        updated_at = now()
    WHERE
        i.status IN ('Pending')
        AND i.due_date < CURRENT_DATE
    RETURNING
        i.id AS invoice_id,
        i.client_name,
        i.amount,
        (CURRENT_DATE - i.due_date)::INTEGER AS days_overdue;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- Leads
CREATE INDEX IF NOT EXISTS idx_leads_org_id ON public.leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(assigned_to);

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_org_id ON public.customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);

-- Deals
CREATE INDEX IF NOT EXISTS idx_deals_org_id ON public.deals(organization_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON public.deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_lead_id ON public.deals(lead_id);
CREATE INDEX IF NOT EXISTS idx_deals_customer_id ON public.deals(customer_id);

-- Deal Items
CREATE INDEX IF NOT EXISTS idx_deal_items_deal_id ON public.deal_items(deal_id);

-- Products
CREATE INDEX IF NOT EXISTS idx_products_org_id ON public.products(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_product_id ON public.product_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_active ON public.product_prices(is_active, effective_from);

-- WhatsApp Conversations
CREATE INDEX IF NOT EXISTS idx_wa_conv_org_id ON public.whatsapp_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_contact_phone ON public.whatsapp_conversations(contact_phone);
CREATE INDEX IF NOT EXISTS idx_wa_conv_lead_id ON public.whatsapp_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON public.whatsapp_conversations(last_message_at DESC);

-- WhatsApp Messages
CREATE INDEX IF NOT EXISTS idx_wa_msg_conv_id ON public.whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_provider_id ON public.whatsapp_messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_created_at ON public.whatsapp_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_wa_msg_status ON public.whatsapp_messages(status);

-- WhatsApp Media
CREATE INDEX IF NOT EXISTS idx_wa_media_msg_id ON public.whatsapp_media(message_id);

-- Campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_org_id ON public.campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON public.campaigns(scheduled_at) WHERE status = 'Scheduled';

-- Campaign Recipients
CREATE INDEX IF NOT EXISTS idx_campaign_recip_campaign ON public.campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recip_status ON public.campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recip_phone ON public.campaign_recipients(phone);

-- Integration Events
CREATE INDEX IF NOT EXISTS idx_int_events_provider ON public.integration_events(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_int_events_created ON public.integration_events(created_at);

-- AI Knowledge
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_org ON public.ai_knowledge(organization_id, status);

-- AI Runs
CREATE INDEX IF NOT EXISTS idx_ai_runs_conv ON public.ai_runs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_lead ON public.ai_runs(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_created ON public.ai_runs(created_at);

-- AI Tool Calls
CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_run ON public.ai_tool_calls(ai_run_id);

-- Lead Intents
CREATE INDEX IF NOT EXISTS idx_lead_intents_lead ON public.lead_intents(lead_id);

-- Lead Objections
CREATE INDEX IF NOT EXISTS idx_lead_objections_lead ON public.lead_objections(lead_id);

-- AI Feedback
CREATE INDEX IF NOT EXISTS idx_ai_feedback_run ON public.ai_feedback(ai_run_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_conv ON public.ai_feedback(conversation_id);

-- Tasks
CREATE INDEX IF NOT EXISTS idx_tasks_org ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON public.tasks(due_date);

-- Activities
CREATE INDEX IF NOT EXISTS idx_activities_lead ON public.activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_customer ON public.activities(customer_id);
CREATE INDEX IF NOT EXISTS idx_activities_deal ON public.activities(deal_id);

-- Notes
CREATE INDEX IF NOT EXISTS idx_notes_entity ON public.notes(entity_type, entity_id);

-- Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_phone ON public.invoices(client_phone);

-- Tally Mappings
CREATE INDEX IF NOT EXISTS idx_tally_map_org_ledger ON public.tally_mappings(organization_id, tally_ledger_name);
CREATE INDEX IF NOT EXISTS idx_tally_map_customer ON public.tally_mappings(customer_id);

-- Tally Sync Jobs
CREATE INDEX IF NOT EXISTS idx_sync_jobs_org ON public.tally_sync_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON public.tally_sync_jobs(status);

-- Payment Reminders
CREATE INDEX IF NOT EXISTS idx_pay_reminders_invoice ON public.payment_reminders(invoice_id);

-- Automation Rules
CREATE INDEX IF NOT EXISTS idx_auto_rules_org ON public.automation_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_auto_rules_trigger ON public.automation_rules(trigger_event, is_active);

-- Automation Runs
CREATE INDEX IF NOT EXISTS idx_auto_runs_rule ON public.automation_runs(rule_id);
CREATE INDEX IF NOT EXISTS idx_auto_runs_created ON public.automation_runs(created_at);

-- Business Events
CREATE INDEX IF NOT EXISTS idx_biz_events_org ON public.business_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_biz_events_type ON public.business_events(event_type);
CREATE INDEX IF NOT EXISTS idx_biz_events_entity ON public.business_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_biz_events_created ON public.business_events(created_at);

-- Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at);

-- Usage Metrics
CREATE INDEX IF NOT EXISTS idx_usage_org_period ON public.usage_metrics(organization_id, period_date);

-- Users
CREATE INDEX IF NOT EXISTS idx_users_org ON public.users(organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ADD UNIQUE CONSTRAINT on tally_mappings for upsert support
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_tally_mappings_org_ledger'
    ) THEN
        ALTER TABLE public.tally_mappings
            ADD CONSTRAINT uq_tally_mappings_org_ledger
            UNIQUE (organization_id, tally_ledger_name);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RLS DEFAULT ORG_ID FALLBACK & PERMISSIVE ACCESS FOR WEB APP
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID AS $$
    SELECT COALESCE(
        (SELECT organization_id FROM public.users WHERE id = auth.uid() LIMIT 1),
        '00000000-0000-0000-0000-000000000001'::uuid
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Drop and recreate permissive RLS for seamless operations across all client roles
DO $$
BEGIN
    DROP POLICY IF EXISTS "Permissive conversations access" ON public.whatsapp_conversations;
    DROP POLICY IF EXISTS "Permissive messages access" ON public.whatsapp_messages;
    DROP POLICY IF EXISTS "Permissive leads access" ON public.leads;
    DROP POLICY IF EXISTS "Permissive invoices access" ON public.invoices;

    CREATE POLICY "Permissive conversations access" ON public.whatsapp_conversations FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "Permissive messages access" ON public.whatsapp_messages FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "Permissive leads access" ON public.leads FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "Permissive invoices access" ON public.invoices FOR ALL USING (true) WITH CHECK (true);
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;




-- ==============================================================================
-- FILE: supabase/migrations/008_payment_pause_and_task_proofs.sql
-- ==============================================================================

-- ==============================================================================
-- PHASE 11: PAYMENT REMINDER SMART PAUSE & TASK PROOF ENHANCEMENTS
-- ==============================================================================

-- 1. Tasks columns for task proof review system & recurring routines
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_interval TEXT DEFAULT 'Daily';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS review_submitted_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS submitted_by TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS revision_requested_at TIMESTAMPTZ;

-- 2. Invoices columns for payment promise detection & reminder pause
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS reminder_paused BOOLEAN DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS reminder_paused_reason TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_promised_date DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_promised_at TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS promise_committed_by TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS promise_notes TEXT;

-- 3. Organization settings table (global admin-configurable values)
CREATE TABLE IF NOT EXISTS public.org_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, key)
);

-- 4. RLS & Policy (Safe idempotent policy setup)
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org settings open access" ON public.org_settings;
DROP POLICY IF EXISTS "Tenant org settings access" ON public.org_settings;
CREATE POLICY "Org settings open access" ON public.org_settings FOR ALL USING (true) WITH CHECK (true);

-- 5. Seed default reminder interval setting (3 days)
INSERT INTO public.org_settings (organization_id, key, value, description)
VALUES ('00000000-0000-0000-0000-000000000001', 'reminder_interval_days', '3', 'Days between auto WhatsApp payment reminders')
ON CONFLICT (organization_id, key) DO NOTHING;

-- ==============================================================================
-- PHASE 11: PAYMENT REMINDER SMART PAUSE & TASK PROOF ENHANCEMENTS
-- ==============================================================================

-- 1. Tasks columns for task proof review system & recurring routines
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_interval TEXT DEFAULT 'Daily';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS review_submitted_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS submitted_by TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS revision_requested_at TIMESTAMPTZ;

-- 2. Invoices columns for payment promise detection & reminder pause
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS reminder_paused BOOLEAN DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS reminder_paused_reason TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_promised_date DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_promised_at TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS promise_committed_by TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS promise_notes TEXT;

-- 3. Organization settings table (global admin-configurable values)
CREATE TABLE IF NOT EXISTS public.org_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, key)
);

-- 4. RLS & Policy (Safe idempotent policy setup)
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org settings open access" ON public.org_settings;
DROP POLICY IF EXISTS "Tenant org settings access" ON public.org_settings;
CREATE POLICY "Org settings open access" ON public.org_settings FOR ALL USING (true) WITH CHECK (true);

-- 5. Seed default reminder interval setting (3 days)
INSERT INTO public.org_settings (organization_id, key, value, description)
VALUES ('00000000-0000-0000-0000-000000000001', 'reminder_interval_days', '3', 'Days between auto WhatsApp payment reminders')
ON CONFLICT (organization_id, key) DO NOTHING;

-- 6. Task Templates & Automated Recurrence Loop Columns
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS is_auto_recurring BOOLEAN DEFAULT true;
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS recurrence_type TEXT DEFAULT 'daily'; -- 'daily', 'weekdays', 'weekly', 'interval_days', 'monthly'
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS recurrence_days JSONB DEFAULT '["Mon", "Tue", "Wed", "Thu", "Fri"]'::jsonb;
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS interval_days INTEGER DEFAULT 1;
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS assignee_target_type TEXT DEFAULT 'all_employees'; -- 'all_employees', 'role', 'specific_employees', 'per_client'
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS target_role TEXT DEFAULT 'Sales Executive';
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS target_employee_names JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS target_client_names JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS last_generated_date DATE;
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 7. Seed storage retention and business profile settings
INSERT INTO public.org_settings (organization_id, key, value, description)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'storage_auto_clean_enabled', 'true', 'Automated daily storage cleanup switch'),
  ('00000000-0000-0000-0000-000000000001', 'storage_retention_days', '7', 'Days to retain logs and media before auto-purging'),
  ('00000000-0000-0000-0000-000000000001', 'auto_clean_whatsapp_media', 'true', 'Auto purge WhatsApp media files'),
  ('00000000-0000-0000-0000-000000000001', 'auto_clean_audit_logs', 'true', 'Auto purge audit logs'),
  ('00000000-0000-0000-0000-000000000001', 'auto_clean_activities', 'true', 'Auto purge activity logs'),
  ('00000000-0000-0000-0000-000000000001', 'auto_clean_site_visits', 'true', 'Auto purge site visits logs'),
  ('00000000-0000-0000-0000-000000000001', 'auto_clean_sync_errors', 'true', 'Auto purge sync error dumps'),
  ('00000000-0000-0000-0000-000000000001', 'auto_clean_payment_reminders', 'true', 'Auto purge payment reminder logs'),
  ('00000000-0000-0000-0000-000000000001', 'company_logo_url', '', 'Company brand logo base64 or storage URL (Protected from purging)'),
  ('00000000-0000-0000-0000-000000000001', 'company_udyam_reg', 'UDYAM-GJ-01-0012345', 'Udyam / MSME Registration Number'),
  ('00000000-0000-0000-0000-000000000001', 'bank_name', 'HDFC Bank Ltd.', 'Company remittance bank name'),
  ('00000000-0000-0000-0000-000000000001', 'bank_account_no', '50200088991122', 'Company bank account number'),
  ('00000000-0000-0000-0000-000000000001', 'bank_ifsc', 'HDFC0001234', 'Company bank IFSC code')
ON CONFLICT (organization_id, key) DO NOTHING;






-- ==============================================================================
-- FILE: supabase/migrations/009_multi_company_profiles.sql
-- ==============================================================================

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

-- Ensure invoices and tally tables have company_name column
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.tally_outstandings ADD COLUMN IF NOT EXISTS company_name TEXT;

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



-- ==============================================================================
-- FILE: supabase/seed/seed.sql
-- ==============================================================================

-- ==============================================================================
-- INITIAL SEED DATA: ORGANIZATIONS, ROLES, PERMISSIONS & DEMO MASTER DATA
-- Techma WhatsApp + AI CRM + Tally Master Specification v4.0
-- ==============================================================================

-- 1. Insert Default Organization (Demo Org)
INSERT INTO public.organizations (id, name, slug, subscription_tier, is_active)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'ERPPro Solutions Pvt. Ltd.', 'erppro-demo', 'free', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Insert Granular Permissions Matrix
INSERT INTO public.permissions (code, module, name, description)
VALUES
    -- Dashboard
    ('dashboard:view', 'Dashboard', 'View Dashboard', 'Access main overview and KPI metrics'),
    -- WhatsApp
    ('whatsapp:view', 'WhatsApp', 'View Conversations', 'Read incoming and outgoing WhatsApp messages'),
    ('whatsapp:send', 'WhatsApp', 'Send Messages', 'Send manual chat messages via WhatsApp Cloud API'),
    ('whatsapp:campaign', 'WhatsApp', 'Run Campaigns', 'Create and broadcast campaign templates to bulk audience'),
    ('whatsapp:templates', 'WhatsApp', 'Manage Templates', 'Create and edit WhatsApp message templates'),
    -- CRM
    ('crm:read', 'CRM', 'View Leads & Customers', 'Access lead records, customer 360 profiles, and deals'),
    ('crm:write', 'CRM', 'Manage Leads', 'Create, edit, and delete lead and customer records'),
    ('crm:assign', 'CRM', 'Assign Salesperson', 'Assign leads and tasks to specific team members'),
    ('crm:export', 'CRM', 'Export Data', 'Export CRM records to CSV/PDF/Sheets'),
    -- Tasks
    ('tasks:read', 'Tasks', 'View Tasks', 'View team and personal task boards'),
    ('tasks:write', 'Tasks', 'Manage Tasks', 'Create, update, and reassign tasks'),
    -- Finance & Tally
    ('finance:read', 'Finance', 'View Invoices & Ledgers', 'Access financial statements, invoices, and payment statuses'),
    ('finance:sync', 'Finance', 'Trigger Tally Sync', 'Initiate manual sync or change Tally connection settings'),
    ('finance:remind', 'Finance', 'Send Payment Reminders', 'Trigger automated or manual payment reminders'),
    -- AI & Knowledge
    ('ai:view', 'AI', 'View AI Activity', 'Inspect AI conversation runs, qualification scores, and handoffs'),
    ('ai:manage', 'AI', 'Configure AI Knowledge', 'Upload and maintain product catalogs, rate charts, and FAQ data'),
    -- Roles & Settings
    ('roles:manage', 'Roles', 'Manage Team & Permissions', 'Create roles, assign user permissions, and invite team members'),
    ('settings:manage', 'Settings', 'Platform Configuration', 'Edit company profile, WhatsApp credentials, and integration keys')
ON CONFLICT (code) DO NOTHING;

-- 3. Insert Default System Roles
INSERT INTO public.roles (id, organization_id, name, description, color, is_system)
VALUES
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Super Admin', 'Full system access across all modules', '#ef4444', true),
    ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'Manager', 'Operational control over CRM, Campaigns, Tasks, and Finance', '#6366f1', true),
    ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', 'Sales Executive', 'Lead management, WhatsApp chat, and task tracking', '#10b981', true),
    ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'Accounts', 'Invoice tracking, Tally synchronization, and payment reminders', '#f59e0b', true),
    ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000001', 'Support Agent', 'Live chat inbox and support ticket management', '#06b6d4', true)
ON CONFLICT (organization_id, name) DO NOTHING;

-- 4. Map All Permissions to Super Admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Super Admin' AND r.organization_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. Map Manager Permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Manager' AND r.organization_id = '00000000-0000-0000-0000-000000000001'
  AND p.code NOT IN ('roles:manage', 'settings:manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 6. Map Sales Executive Permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Sales Executive' AND r.organization_id = '00000000-0000-0000-0000-000000000001'
  AND p.code IN ('dashboard:view', 'whatsapp:view', 'whatsapp:send', 'crm:read', 'crm:write', 'tasks:read', 'tasks:write', 'ai:view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 7. Map Accounts Permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Accounts' AND r.organization_id = '00000000-0000-0000-0000-000000000001'
  AND p.code IN ('dashboard:view', 'finance:read', 'finance:sync', 'finance:remind', 'crm:read', 'tasks:read')
ON CONFLICT (role_id, permission_id) DO NOTHING;

