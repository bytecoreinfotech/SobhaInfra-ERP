-- ============================================================================
-- 018: Employee Location Movement History Logs (7 Days to 30 Days Audit Trail)
-- Allows tracking where each employee visited, route timeline, and field stops.
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_location_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    employee_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    role TEXT DEFAULT 'Field Agent',
    lat NUMERIC(10, 7) NOT NULL,
    lng NUMERIC(10, 7) NOT NULL,
    accuracy NUMERIC(8, 2) DEFAULT 10,
    address TEXT,
    activity_type TEXT DEFAULT 'ping', -- 'ping', 'check_in', 'visit_stop', 'site_visit'
    site_name TEXT,
    recorded_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Performance indexes for fast 7-day to 30-day employee range queries
CREATE INDEX IF NOT EXISTS idx_employee_location_logs_emp_date
    ON employee_location_logs (employee_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_location_logs_date
    ON employee_location_logs (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_location_logs_org
    ON employee_location_logs (organization_id);

-- Enable RLS
ALTER TABLE employee_location_logs ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated users & anon (under multi-tenant org)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'employee_location_logs' AND policyname = 'Allow read employee_location_logs'
    ) THEN
        CREATE POLICY "Allow read employee_location_logs" ON employee_location_logs
            FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'employee_location_logs' AND policyname = 'Allow insert employee_location_logs'
    ) THEN
        CREATE POLICY "Allow insert employee_location_logs" ON employee_location_logs
            FOR INSERT WITH CHECK (true);
    END IF;
END $$;
