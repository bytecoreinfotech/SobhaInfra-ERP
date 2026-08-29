-- ==============================================================================
-- PHASE 14: SCHEMA ALIGNMENT — ENSURE SYNC_ERRORS TABLE AND VIEW
-- Techma WhatsApp + AI CRM + Tally Master Specification
-- Migration 014 — Additive only (safe to run on existing schema)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.sync_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sync_job_id UUID REFERENCES public.tally_sync_jobs(id) ON DELETE CASCADE,
    voucher_number TEXT,
    error_message TEXT NOT NULL,
    raw_xml TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_errors ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'sync_errors' AND policyname = 'Tenant sync errors alias access'
    ) THEN
        CREATE POLICY "Tenant sync errors alias access" ON public.sync_errors 
        FOR ALL USING (organization_id = public.current_org_id());
    END IF;
END $$;
