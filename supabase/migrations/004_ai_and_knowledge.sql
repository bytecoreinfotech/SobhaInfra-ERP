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
