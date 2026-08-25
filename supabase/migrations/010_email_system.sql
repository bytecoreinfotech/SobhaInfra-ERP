-- Migration 010: Email System & Logs
-- Conforms to Techma Master Architecture

CREATE TABLE IF NOT EXISTS public.email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    sender_email TEXT,
    sender_name TEXT,
    subject TEXT NOT NULL,
    body_html TEXT,
    body_text TEXT,
    template_used TEXT,
    status TEXT NOT NULL DEFAULT 'SENT', -- SENT, FAILED, QUEUED
    error_message TEXT,
    sent_by_user_id TEXT,
    sent_by_name TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_email_logs_lead_id ON public.email_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON public.email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);

-- RLS Policies
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to email_logs for authenticated/anon"
    ON public.email_logs
    FOR ALL
    USING (true)
    WITH CHECK (true);
