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
