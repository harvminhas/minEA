-- Business plan "Get started" requests (pricing page + in-app upgrade prompts).
-- Purely additive: one new table and two indexes, all IF NOT EXISTS. No existing table,
-- column, constraint or row is touched, so it is safe on the shared dev/prod database
-- and safe to run more than once.

CREATE TABLE IF NOT EXISTS business_plan_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    company         TEXT NOT NULL,
    licences        INTEGER NOT NULL CHECK (licences >= 5),
    billing_period  TEXT NOT NULL CHECK (billing_period IN ('monthly', 'annual')),
    payment_method  TEXT NOT NULL CHECK (payment_method IN ('card', 'invoice')),
    message         TEXT,
    org_slug        TEXT,
    source          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_business_plan_requests_created_at ON business_plan_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_business_plan_requests_email ON business_plan_requests (email);
