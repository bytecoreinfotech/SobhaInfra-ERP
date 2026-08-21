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
