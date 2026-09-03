-- ============================================================
-- 016_customer_master.sql
-- Customer Master: Google Sheet → Supabase cache table
-- ============================================================

-- Main cache table for Google Sheet verified customers
CREATE TABLE IF NOT EXISTS customer_master (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  company_name     text NOT NULL,
  contact_person   text,
  contact_number   text,
  normalized_key   text,
  sheet_row_index  int,
  last_synced_at   timestamptz DEFAULT now(),
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_master_org_norm
  ON customer_master (organization_id, normalized_key);

CREATE TABLE IF NOT EXISTS sheet_sync_log (
  id              serial PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  synced_at       timestamptz DEFAULT now(),
  row_count       int,
  status          text DEFAULT 'ok',
  error_msg       text
);
