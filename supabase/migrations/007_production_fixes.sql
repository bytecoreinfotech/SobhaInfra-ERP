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
