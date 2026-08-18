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
