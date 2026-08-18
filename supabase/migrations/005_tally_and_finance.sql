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
