-- ==============================================================================
-- MIGRATION 013: Fix Tasks & Leads assigned_to Column Type (UUID -> TEXT)
-- Sobha Infratech ERP — Production Migration
-- Run this in: Supabase SQL Editor → New query → Run All
-- ==============================================================================

-- 1. Drop foreign key constraint on tasks.assigned_to if present
DO $$ 
BEGIN
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_users_id_fkey;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Alter column type to TEXT so it can store full names, roles, or UUIDs
DO $$ 
BEGIN
  ALTER TABLE public.tasks ALTER COLUMN assigned_to TYPE TEXT USING assigned_to::text;
  ALTER TABLE public.tasks ALTER COLUMN assigned_to SET DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Ensure all task columns for proof and recurring routines exist
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_name TEXT DEFAULT '';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_phone TEXT DEFAULT '';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_interval TEXT DEFAULT 'Daily';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS review_submitted_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS submitted_by TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS revision_requested_at TIMESTAMPTZ;

-- 4. Enable RLS and permissive policy for tasks table
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Open tasks access" ON public.tasks;
DROP POLICY IF EXISTS "Allow public read access on tasks" ON public.tasks;
DROP POLICY IF EXISTS "Allow authenticated all on tasks" ON public.tasks;
CREATE POLICY "Open tasks access" ON public.tasks FOR ALL USING (true) WITH CHECK (true);

-- 5. Fix leads assigned_to column type as well
DO $$ 
BEGIN
  ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;
  ALTER TABLE public.leads ALTER COLUMN assigned_to TYPE TEXT USING assigned_to::text;
  ALTER TABLE public.leads ALTER COLUMN assigned_to SET DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6. Verify result
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tasks' AND column_name = 'assigned_to';
