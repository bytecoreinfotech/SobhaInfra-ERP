-- ==============================================================================
-- 012: Fix WhatsApp Inbox & Campaign History Visibility
-- Run this in Supabase SQL Editor
-- ==============================================================================

-- STEP 1: Make organization_id nullable on whatsapp tables
-- (webhook inserts don't always have org_id, causing silent FK failures)
ALTER TABLE public.whatsapp_conversations
  ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE public.whatsapp_messages
  ALTER COLUMN organization_id DROP NOT NULL;

-- STEP 2: Create wa_campaigns table (send-campaign.js uses this, not 'campaigns')
CREATE TABLE IF NOT EXISTS public.wa_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'Campaign',
  status          TEXT NOT NULL DEFAULT 'Draft',
  template_name   TEXT,
  custom_message  TEXT,
  media_url       TEXT,
  media_type      TEXT DEFAULT 'text',
  audience_filter JSONB DEFAULT '{}'::jsonb,
  total_sent      INTEGER DEFAULT 0,
  delivered       INTEGER DEFAULT 0,
  total_read      INTEGER DEFAULT 0,
  total_replied   INTEGER DEFAULT 0,
  launched_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- STEP 3: Drop old restrictive RLS policies and replace with open ones
DROP POLICY IF EXISTS "Tenant conversations access" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Tenant messages access" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Allow all access conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Allow all access messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Allow all access wa_campaigns" ON public.wa_campaigns;

-- Disable then re-enable RLS with permissive policies
ALTER TABLE public.whatsapp_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_campaigns DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access conversations" ON public.whatsapp_conversations
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access messages" ON public.whatsapp_messages
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access wa_campaigns" ON public.wa_campaigns
  FOR ALL USING (true) WITH CHECK (true);

-- STEP 4: Verify row counts
SELECT 'whatsapp_conversations' AS tbl, COUNT(*) AS rows FROM public.whatsapp_conversations
UNION ALL
SELECT 'whatsapp_messages', COUNT(*) FROM public.whatsapp_messages
UNION ALL
SELECT 'wa_campaigns', COUNT(*) FROM public.wa_campaigns;
