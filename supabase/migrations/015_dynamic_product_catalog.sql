-- ==============================================================================
-- Migration 015: Dynamic Product Master & Pricing Catalog
-- Ensures direct 'category', 'unit_price', and dynamic product fields exist on
-- public.products with full RLS permissions for real-time CRUD operations.
-- ==============================================================================

-- 1. Create table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    sku TEXT,
    unit_price NUMERIC(12, 2) DEFAULT 0.00,
    unit_of_measure TEXT DEFAULT 'unit',
    brochure_url TEXT,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Ensure all columns exist dynamically (safe for existing tables)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brochure_url TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit_of_measure TEXT DEFAULT 'unit';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. Make organization_id nullable or default to avoid FK insertion errors if orgs table is empty
DO $$ 
BEGIN
    ALTER TABLE public.products ALTER COLUMN organization_id DROP NOT NULL;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 4. Enable Row Level Security (RLS) & add permissive policies
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to products" ON public.products;
DROP POLICY IF EXISTS "Tenant products access" ON public.products;
DROP POLICY IF EXISTS "Public read products" ON public.products;
DROP POLICY IF EXISTS "Public write products" ON public.products;

CREATE POLICY "Allow all access to products"
ON public.products
FOR ALL
TO public, anon, authenticated
USING (true)
WITH CHECK (true);

-- 5. Indexes for fast search & category filtering
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);

-- 6. Grant table permissions to standard roles
GRANT ALL ON TABLE public.products TO anon, authenticated, service_role;
