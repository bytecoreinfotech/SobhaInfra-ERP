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
SELECT '00000000-0000-0000-0000-000000000010', id FROM public.permissions
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. Map Manager Permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000020', id FROM public.permissions
WHERE code NOT IN ('roles:manage', 'settings:manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 6. Map Sales Executive Permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000030', id FROM public.permissions
WHERE code IN ('dashboard:view', 'whatsapp:view', 'whatsapp:send', 'crm:read', 'crm:write', 'tasks:read', 'tasks:write', 'ai:view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 7. Map Accounts Permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000040', id FROM public.permissions
WHERE code IN ('dashboard:view', 'finance:read', 'finance:sync', 'finance:remind', 'crm:read', 'tasks:read')
ON CONFLICT (role_id, permission_id) DO NOTHING;
